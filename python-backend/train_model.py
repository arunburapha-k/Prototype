import sqlite3
import json
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler
import joblib
import os

# Database path
DB_PATH = "segments.db"

def load_data_from_db():
    """Load segments and their data from SQLite."""
    conn = sqlite3.connect(DB_PATH)
    query = "SELECT base_class, sensors, data FROM segments"
    df = pd.read_sql_query(query, conn)
    conn.close()
    return df

def extract_features(segment_data_json, sensors, target_points=200):
    """
    Extract statistical features from variable-length segment data.
    Handles multiple sensors. Includes resampling for scale normalization.
    """
    if not segment_data_json:
        return None
    
    data_dict = json.loads(segment_data_json)
    all_features = []
    
    for sensor in sensors:
        if sensor in data_dict:
            sensor_data = data_dict[sensor]
            values = [float(d['value']) for d in sensor_data if 'value' in d and d['value'] is not None]
            
            if len(values) > 0:
                # Resample to target_points to normalize "scale" of data points
                if len(values) != target_points:
                    x_old = np.linspace(0, 1, len(values))
                    x_new = np.linspace(0, 1, target_points)
                    values = np.interp(x_new, x_old, values)
                
                arr = np.array(values)
                # Statistical Features
                s = pd.Series(arr)
                features = [
                    arr.mean(),
                    arr.std() if len(arr) > 1 else 0,
                    arr.min(),
                    arr.max(),
                    np.median(arr),
                    s.skew() if len(arr) > 2 else 0,
                    s.kurtosis() if len(arr) > 3 else 0,
                    arr[-1] - arr[0] # Net change
                ]
                all_features.extend(features)
            else:
                all_features.extend([0] * 8)
        else:
            all_features.extend([0] * 8)
            
    return all_features

def augment_data(X, y, noise_level=0.01, n_clones=2):
    """
    Simple Data Augmentation: Jittering (adding noise).
    """
    X_aug = [X]
    y_aug = [y]
    
    for _ in range(n_clones):
        noise = np.random.normal(0, noise_level, X.shape)
        X_aug.append(X + noise)
        y_aug.append(y)
        
    return np.vstack(X_aug), np.concatenate(y_aug)

def train():
    print("Loading data from database...")
    df = load_data_from_db()
    
    if df.empty:
        print("No data found in database. Please save some segments first.")
        return

    print(f"Found {len(df)} segments. Extracting features...")
    
    X = []
    y = []
    
    for _, row in df.iterrows():
        sensors = json.loads(row['sensors'])
        features = extract_features(row['data'], sensors)
        if features:
            X.append(features)
            y.append(row['base_class'])
            
    X = np.array(X)
    y = np.array(y)
    
    # 1. Split Data: Train (70%), Val (15%), Test (15%)
    # First split: Train vs (Val + Test)
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, random_state=42, stratify=y
    )
    
    # Second split: Val vs Test
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp
    )
    
    print(f"Train size: {len(X_train)}, Val size: {len(X_val)}, Test size: {len(X_test)}")
    
    # 2. Augmentation (Only on Training Set)
    print("Applying data augmentation to training set...")
    X_train_aug, y_train_aug = augment_data(X_train, y_train)
    print(f"Augmented Train size: {len(X_train_aug)}")
    
    # 3. Scaling
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_aug)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)
    
    # 4. Train Model (Random Forest)
    print("Training Random Forest model...")
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train_scaled, y_train_aug)
    
    # 5. Evaluate on Validation Set
    val_score = clf.score(X_val_scaled, y_val)
    print(f"Validation Accuracy: {val_score:.4f}")
    
    # 6. Final Evaluation on Test Set
    print("\nFinal Evaluation on Test Set:")
    y_pred = clf.predict(X_test_scaled)
    print(classification_report(y_test, y_pred))
    
    # Save model and scaler
    os.makedirs("models", exist_ok=True)
    joblib.dump(clf, "models/classifier.joblib")
    joblib.dump(scaler, "models/scaler.joblib")
    print("Model and scaler saved to 'models/' directory.")

if __name__ == "__main__":
    train()
