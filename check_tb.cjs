const axios = require('axios');
const token = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJqaXJhQHdlYXZlcmJhc3NlLmNvbSIsInVzZXJJZCI6ImUwNDQyY2MwLWNlODItMTFmMC05NzI5LWFmMDc5OGEwZjRlNiIsInNjb3BlcyI6WyJURU5BTlRfQURNSU4iXSwic2Vzc2lvbklkIjoiZTRhMTMwNTYtZWYwNC00NzIwLTllY2ItYjU5ZGQ4NWFkZDlmIiwiaXNzIjoidGhpbmdzYm9hcmQuaW8iLCJpYXQiOjE3Nzg4MTcwMzksImV4cCI6MTc3OTQyMTgzOSwiZmlyc3ROYW1lIjoiSmlyYXBhdCIsImVuYWJsZWQiOnRydWUsImlzUHVibGljIjpmYWxzZSwidGVuYW50SWQiOiI0NTczMTQ3MC1iZGM5LTExZWUtODBhNC1mMzI4YmYwN2Q2NzUiLCJjdXN0b21lcklkIjoiMTM4MTQwMDAtMWRkMi0xMWIyLTgwODAtODA4MDgwODA4MDgwIn0.XYxFknIIF1fhchDGj-TSe5YE_AZiUBbDmqJMKa6kdjNZ2oBFdSnpdlCyZwTpSyVDO-nMmANAPWDFl5-iouoEhw';
const entityId = 'bb0a92c1-49fa-11f1-881d-7d307bd4d58b';
const endTs = Date.now();
const startTs = endTs - (120 * 24 * 60 * 60 * 1000);
const url = 'https://thingsboard.weaverbase.com/api/plugins/telemetry/DEVICE/' + entityId + '/values/timeseries?keys=data_value,current_status,operation_status&startTs=' + startTs + '&endTs=' + endTs + '&agg=AVG&interval=21600000';
console.log('Requesting:', url);
axios.get(url, { headers: { Authorization: 'Bearer ' + token } })
  .then(res => {
    console.log('Data keys:', Object.keys(res.data));
    console.log('data_value count:', res.data.data_value?.length);
    console.log('current_status count:', res.data.current_status?.length);
    console.log('operation_status count:', res.data.operation_status?.length);
  })
  .catch(err => console.error('Error:', err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.message));
