# Queue-Based Multiplier Generation System

## Overview

The backend now uses a **queue-based multiplier generation system** instead of fixed intervals. This prevents queue overflow and ensures the socket server always has multipliers to process without accumulating too many.

## How It Works

### 1. **Queue Monitoring**
- Backend checks socket server's queue every 5 seconds
- Monitors queue size via `/health` endpoint
- Only generates new multipliers when queue is low

### 2. **Smart Generation**
- **Threshold**: Generate when queue has ≤ 5 multipliers
- **Batch Size**: Always generates 100 multipliers at once
- **Prevention**: Prevents multiple simultaneous generation attempts

### 3. **Configuration**
```javascript
const QUEUE_CHECK_INTERVAL = 5000; // Check every 5 seconds
const QUEUE_THRESHOLD = 5; // Generate when queue ≤ 5
const BATCH_SIZE = 100; // Generate 100 at once
```

## Benefits

✅ **No Queue Overflow**: Queue never gets too large  
✅ **Efficient**: Only generates when needed  
✅ **Adaptive**: Automatically adjusts to socket server speed  
✅ **Reliable**: Prevents system crashes  
✅ **Same Quality**: All multiplier generation logic unchanged  

## API Endpoints

### Health Check
```
GET /health
```
Returns backend status including queue monitoring info.

### Queue Status
```
GET /api/queue-status
```
Returns detailed status of both backend and socket server.

### Manual Trigger
```
POST /api/trigger-generation
```
Manually trigger queue check and generation.

### Force Generation
```
POST /api/force-generation
```
Force generate a batch immediately (bypasses queue check).

## Monitoring

### Backend Logs
- `📊 Socket queue check: X multipliers, phase: Y`
- `🚀 Queue low (X ≤ 5), generating new batch...`
- `✅ Queue healthy (X > 5), no generation needed`

### Queue Status Response
```json
{
  "success": true,
  "backend": {
    "currentRound": 1000,
    "isGenerating": false,
    "lastQueueCheck": "2024-01-01T12:00:00.000Z",
    "queueThreshold": 5,
    "batchSize": 100
  },
  "socket": {
    "queueSize": 3,
    "gamePhase": "wait",
    "currentRound": 1000,
    "currentMultiplier": 1.0
  }
}
```

## Testing

Run the test script to verify the system:
```bash
node test-queue-system.js
```

## Migration from Old System

### What Changed
- ❌ Fixed 3-second intervals → ✅ Queue-based generation
- ❌ Always generate → ✅ Generate only when needed
- ❌ Unlimited queue → ✅ Controlled queue size

### What Stayed the Same
- ✅ All multiplier generation logic
- ✅ House edge calculation (50%)
- ✅ Distribution patterns
- ✅ Bias correction
- ✅ Pattern prevention
- ✅ Quality and fairness

## Troubleshooting

### Queue Not Generating
1. Check socket server is running
2. Verify `/health` endpoint returns queue size
3. Check network connectivity between services
4. Use manual trigger to test generation

### Queue Overflow
1. Check if socket server is processing rounds
2. Verify game phases are transitioning correctly
3. Monitor queue size via `/api/queue-status`
4. Consider reducing `QUEUE_THRESHOLD` if needed

### Performance Issues
1. Increase `QUEUE_CHECK_INTERVAL` if too frequent
2. Monitor generation frequency in logs
3. Check for network latency between services
4. Verify socket server processing speed 