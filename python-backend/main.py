import logging
import math
import sqlite3
import json
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Tuple, Optional
import pandas as pd
from prophet import Prophet
from prophet.diagnostics import cross_validation
from fastapi.middleware.cors import CORSMiddleware

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Forecast API")

# Database setup
DB_PATH = "segments.db"

def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Performance PRAGMAs for every connection
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=OFF")  # Faster writes, safe for this use case
    conn.execute("PRAGMA cache_size=-5000") # 5MB cache
    conn.execute("PRAGMA temp_store=MEMORY") # Store temp tables in memory
    return conn

def init_db():
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            external_id INTEGER,
            class_name TEXT,
            base_class TEXT,
            start_ts REAL,
            end_ts REAL,
            sensors TEXT,
            data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Optimization: Add indexes for faster lookups and sorting
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_external_id ON segments(external_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_created_at ON segments(created_at DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_class_name ON segments(class_name)')
    
    # Migration: Add base_class column if it doesn't exist (for existing DBs)
    try:
        cursor.execute('ALTER TABLE segments ADD COLUMN base_class TEXT')
        # Update existing rows
        cursor.execute("UPDATE segments SET base_class = CASE WHEN INSTR(class_name, '_') > 0 THEN SUBSTR(class_name, 1, INSTR(class_name, '_') - 1) ELSE class_name END")
    except sqlite3.OperationalError:
        pass # Column already exists

    # Create index for base_class AFTER ensuring the column exists
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_base_class ON segments(base_class)')
        
    conn.commit()
    conn.close()

init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ForecastRequest(BaseModel):
    data: List[Tuple[float, float]] # [ts_ms, value]
    horizonDays: int
    intervalMs: int

class ForecastPoint(BaseModel):
    ts: float
    value: float # Use value as yhat for compatibility, or keep yhat
    yhat: float
    yhat_lower: float
    yhat_upper: float

class MetricSummary(BaseModel):
    mae: float = 0.0
    rmse: float = 0.0
    mape: float = 0.0
    smape: float = 0.0
    coverage: float = 0.0
    count: int = 0

class MonthlyMetric(BaseModel):
    month: str
    cutoffTs: float
    cutoffLabel: str
    mae: float = 0.0
    rmse: float = 0.0
    mape: float = 0.0
    smape: float = 0.0
    coverage: float = 0.0
    count: int = 0

class BacktestResponse(BaseModel):
    overall: MetricSummary
    monthly: List[MonthlyMetric] = Field(default_factory=list)
    cutoffs: int

class StorageSegment(BaseModel):
    id: Optional[int] = None
    external_id: int
    className: str
    start: float
    end: float
    sensors: List[str]
    data: Optional[dict] = None

def _clean_history(req: ForecastRequest) -> pd.DataFrame:
    df = pd.DataFrame(req.data, columns=['ds', 'y'])
    df['ds'] = pd.to_datetime(df['ds'], unit='ms', errors='coerce')
    df['y'] = pd.to_numeric(df['y'], errors='coerce')
    df = df.dropna(subset=['ds', 'y']).sort_values('ds').drop_duplicates(subset=['ds'], keep='last')
    return df

def _create_prophet_model() -> Prophet:
    return Prophet(
        daily_seasonality=True,
        weekly_seasonality=True,
        yearly_seasonality=False,
        changepoint_prior_scale=0.5,
        seasonality_prior_scale=10.0,
        interval_width=0.95,
        growth='linear'
    )

def _generate_monthly_cutoffs(df: pd.DataFrame, horizon_td: pd.Timedelta) -> List[pd.Timestamp]:
    if df.empty:
        return []

    start_ts = df['ds'].min()
    latest_allowed_cutoff = df['ds'].max() - horizon_td
    if latest_allowed_cutoff <= start_ts:
        return []

    cutoffs: List[pd.Timestamp] = []
    current = start_ts + pd.offsets.MonthEnd(0)
    if current < start_ts:
      current = current + pd.offsets.MonthEnd(1)

    while current <= latest_allowed_cutoff:
        cutoffs.append(current)
        current = current + pd.offsets.MonthEnd(1)

    if not cutoffs:
        fallback_cutoff = latest_allowed_cutoff
        if fallback_cutoff > start_ts:
            cutoffs = [fallback_cutoff]

    return cutoffs

def _build_metric_summary(frame: pd.DataFrame) -> MetricSummary:
    if frame.empty:
        return MetricSummary()

    work = frame.copy()
    work['abs_error'] = (work['y'] - work['yhat']).abs()
    work['sq_error'] = (work['y'] - work['yhat']) ** 2

    mae = float(work['abs_error'].mean())
    rmse = float(math.sqrt(work['sq_error'].mean()))

    non_zero = work[work['y'].abs() > 1e-9]
    if non_zero.empty:
        mape = 0.0
    else:
        mape = float((non_zero['abs_error'] / non_zero['y'].abs()).mean() * 100)

    denom = work['y'].abs() + work['yhat'].abs()
    valid_smape = denom > 1e-9
    if valid_smape.any():
        smape = float(((2 * work.loc[valid_smape, 'abs_error']) / denom[valid_smape]).mean() * 100)
    else:
        smape = 0.0

    if 'yhat_lower' in work.columns and 'yhat_upper' in work.columns:
        coverage = float(((work['y'] >= work['yhat_lower']) & (work['y'] <= work['yhat_upper'])).mean() * 100)
    else:
        coverage = 0.0

    return MetricSummary(
        mae=mae,
        rmse=rmse,
        mape=mape,
        smape=smape,
        coverage=coverage,
        count=int(len(work))
    )

def _summarize_backtest(cv: pd.DataFrame) -> BacktestResponse:
    if cv.empty:
        return BacktestResponse(overall=MetricSummary(), monthly=[], cutoffs=0)

    monthly_rows: List[MonthlyMetric] = []
    for cutoff, group in cv.groupby('cutoff'):
        summary = _build_metric_summary(group)
        cutoff_ts = pd.Timestamp(cutoff)
        monthly_rows.append(MonthlyMetric(
            month=cutoff_ts.strftime('%Y-%m'),
            cutoffTs=cutoff_ts.timestamp() * 1000,
            cutoffLabel=cutoff_ts.strftime('%b %Y'),
            mae=summary.mae,
            rmse=summary.rmse,
            mape=summary.mape,
            smape=summary.smape,
            coverage=summary.coverage,
            count=summary.count
        ))

    monthly_rows.sort(key=lambda row: row.cutoffTs)
    overall = _build_metric_summary(cv)
    return BacktestResponse(overall=overall, monthly=monthly_rows, cutoffs=len(monthly_rows))

@app.post("/api/forecast", response_model=List[ForecastPoint])
async def make_forecast(req: ForecastRequest):
    try:
        df = _clean_history(req)
        if len(df) < 2:
            return []

        # Initialize and fit Prophet
        m = _create_prophet_model()
        m.fit(df)

        # Calculate periods based on intervalMs
        # intervalMs is in milliseconds. Prophet make_future_dataframe uses freq.
        # Let's convert horizonDays to the number of periods based on intervalMs.
        safe_interval_ms = max(1, req.intervalMs)
        horizon_ms = req.horizonDays * 24 * 60 * 60 * 1000
        periods = max(1, math.ceil(horizon_ms / safe_interval_ms))

        # Use a pandas Timedelta instead of strings like "1800.0S".
        # Prophet delegates frequency parsing to pandas, and decimal second
        # strings can fail to parse on some pandas versions.
        freq = pd.to_timedelta(safe_interval_ms, unit='ms')
        future = m.make_future_dataframe(periods=periods, freq=freq)
        forecast = m.predict(future)

        # We only want the future part, but let's just return future points
        last_historical_ts = df['ds'].max()
        future_forecast = forecast[forecast['ds'] > last_historical_ts]

        # Convert back to ms and format response
        result = []
        for _, row in future_forecast.iterrows():
            result.append(ForecastPoint(
                ts=row['ds'].timestamp() * 1000,
                value=row['yhat'],
                yhat=row['yhat'],
                yhat_lower=row['yhat_lower'],
                yhat_upper=row['yhat_upper']
            ))

        return result
    except Exception as e:
        logger.error(f"Error forecasting: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/backtest", response_model=BacktestResponse)
async def make_backtest(req: ForecastRequest):
    try:
        df = _clean_history(req)
        if len(df) < 2:
            return BacktestResponse(overall=MetricSummary(), monthly=[], cutoffs=0)

        safe_interval_ms = max(1, req.intervalMs)
        horizon_days = max(1, req.horizonDays)
        horizon_ms = horizon_days * 24 * 60 * 60 * 1000
        horizon_td = pd.to_timedelta(horizon_ms, unit='ms')
        interval_td = pd.to_timedelta(safe_interval_ms, unit='ms')

        cutoffs = _generate_monthly_cutoffs(df, horizon_td)
        if not cutoffs:
            fallback_cutoff = df['ds'].max() - horizon_td
            if fallback_cutoff > df['ds'].min():
                cutoffs = [fallback_cutoff]

        if not cutoffs:
            return BacktestResponse(overall=MetricSummary(), monthly=[], cutoffs=0)

        model = _create_prophet_model()
        model.fit(df)

        cv = cross_validation(
            model,
            cutoffs=cutoffs,
            horizon=horizon_td
        )

        if cv.empty:
            return BacktestResponse(overall=MetricSummary(), monthly=[], cutoffs=0)

        cv['cutoff'] = pd.to_datetime(cv['cutoff'])
        response = _summarize_backtest(cv)
        return response
    except Exception as e:
        logger.error(f"Error backtesting: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/storage/save")
async def save_to_storage(segments: List[StorageSegment]):
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        
        for seg in segments:
            # Check if already exists to avoid duplicates (optional)
            cursor.execute("SELECT id FROM segments WHERE external_id = ?", (seg.external_id,))
            if cursor.fetchone():
                continue
            
            # Auto-numbering for class names: classname_N
            cursor.execute("SELECT COUNT(*) FROM segments WHERE class_name LIKE ?", (f"{seg.className}%",))
            count = cursor.fetchone()[0]
            final_class_name = f"{seg.className}_{count + 1}"
                
            cursor.execute('''
                INSERT INTO segments (external_id, class_name, base_class, start_ts, end_ts, sensors, data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                seg.external_id,
                final_class_name,
                seg.className, # This is the base name from frontend
                seg.start,
                seg.end,
                json.dumps(seg.sensors),
                json.dumps(seg.data) if seg.data else None
            ))
        
        conn.commit()
        conn.close()
        return {"status": "success", "message": f"Saved {len(segments)} segments"}
    except Exception as e:
        logger.error(f"Error saving to storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/storage/list", response_model=List[StorageSegment])
async def list_storage(include_data: bool = False):
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        
        # Optimized Smart Sorting Logic using base_class column and index
        query = """
            WITH GroupTiming AS (
                SELECT base_class, MIN(created_at) as first_seen
                FROM segments
                GROUP BY base_class
            )
            SELECT s.* 
            FROM segments s
            JOIN GroupTiming gt ON s.base_class = gt.base_class
            ORDER BY gt.first_seen ASC, s.class_name ASC
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append(StorageSegment(
                id=row['id'],
                external_id=row['external_id'],
                className=row['class_name'],
                start=row['start_ts'],
                end=row['end_ts'],
                sensors=json.loads(row['sensors']),
                data=json.loads(row['data']) if include_data and row['data'] else None
            ))
        
        conn.close()
        return result
    except Exception as e:
        logger.error(f"Error listing storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/storage/clear")
async def clear_storage():
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        # Delete all records
        cursor.execute("DELETE FROM segments")
        # Reset auto-increment counter
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='segments'")
        conn.commit()
        # Vacuum must be outside of a transaction
        conn.execute("VACUUM")
        conn.close()
        return {"status": "success"}
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error clearing storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
