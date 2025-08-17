const fetch = require('node-fetch');

const BACKEND_URL = 'http://localhost:3000';
const SOCKET_URL = 'https://aviator-socket-server-yhzu.onrender.com';

async function testQueueSystem() {
  console.log('🧪 Testing Queue-Based Multiplier Generation System\n');
  
  try {
    // 1. Check initial backend status
    console.log('1️⃣ Checking backend status...');
    const backendResponse = await fetch(`${BACKEND_URL}/health`);
    const backendData = await backendResponse.json();
    console.log(`   ✅ Backend: ${backendData.status}`);
    console.log(`   📊 Queue threshold: ${backendData.queueThreshold}`);
    console.log(`   📦 Batch size: ${backendData.batchSize}`);
    console.log(`   ⏱️ Check interval: ${backendData.queueCheckInterval}ms\n`);
    
    // 2. Check socket server queue
    console.log('2️⃣ Checking socket server queue...');
    const socketResponse = await fetch(`${SOCKET_URL}/health`);
    const socketData = await socketResponse.json();
    console.log(`   ✅ Socket: ${socketData.status}`);
    console.log(`   📊 Queue size: ${socketData.queueSize}`);
    console.log(`   🎮 Game phase: ${socketData.gamePhase}`);
    console.log(`   🔢 Current round: ${socketData.currentRound}\n`);
    
    // 3. Check queue status endpoint
    console.log('3️⃣ Checking queue status endpoint...');
    const statusResponse = await fetch(`${BACKEND_URL}/api/queue-status`);
    const statusData = await statusResponse.json();
    console.log(`   ✅ Status check: ${statusData.success}`);
    console.log(`   🔄 Backend generating: ${statusData.backend.isGenerating}`);
    console.log(`   📊 Socket queue: ${statusData.socket.queueSize}\n`);
    
    // 4. Test manual trigger
    console.log('4️⃣ Testing manual trigger...');
    const triggerResponse = await fetch(`${BACKEND_URL}/api/trigger-generation`, {
      method: 'POST'
    });
    const triggerData = await triggerResponse.json();
    console.log(`   ✅ Trigger: ${triggerData.success}`);
    console.log(`   💬 Message: ${triggerData.message}\n`);
    
    // 5. Wait and check again
    console.log('5️⃣ Waiting 3 seconds and checking again...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalStatusResponse = await fetch(`${BACKEND_URL}/api/queue-status`);
    const finalStatusData = await finalStatusResponse.json();
    console.log(`   📊 Final queue size: ${finalStatusData.socket.queueSize}`);
    console.log(`   🔄 Still generating: ${finalStatusData.backend.isGenerating}\n`);
    
    console.log('✅ Queue-based system test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testQueueSystem(); 