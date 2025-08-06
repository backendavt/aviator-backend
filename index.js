require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Socket server configuration
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || 'https://aviator-socket-server.onrender.com';
const SOCKET_SERVER_SECRET = process.env.SOCKET_SERVER_SECRET || 'your-secret-token';

// Global variables
let currentRound = 1000; // Start from a reasonable round number
const BATCH_SIZE = 100; // Store 100 multipliers at a time for better efficiency
const QUEUE_CHECK_INTERVAL = 5000; // Check socket queue every 5 seconds
const QUEUE_THRESHOLD = 5; // Generate new batch when queue has less than 5 multipliers

// Array to collect multipliers before storing
let multiplierBuffer = [];
let nextRoundToGenerate = currentRound + 1; // Track the next round to generate

// Track recent multipliers for bias correction
let recentMultipliers = [];

// Queue monitoring state
let isGenerating = false; // Prevent multiple simultaneous generation attempts
let lastQueueCheck = 0; // Track last queue check time

function generateRealisticMultiplier() {
  const MIN = 1.01;
  const MAX = 50; // Reduced max for 50% house edge
  
  // Use 50% house edge formula
  const HOUSE_EDGE = 0.50; // 50% house edge for maximum profitability
  const payout = (1 - HOUSE_EDGE) / (1 - Math.random());
  
  // Clamp to reasonable range
  const multiplier = Math.max(MIN, Math.min(payout, MAX));
  
  return Math.round(multiplier * 100) / 100;
}

function generateEnhancedDistribution() {
  const r = Math.random();
  
  // Enhanced distribution to prevent too many lows in a row
  if (r < 0.0002) return 40 + Math.random() * 10;   // 0.02% chance for 40x-50x
  if (r < 0.001) return 25 + Math.random() * 15;    // 0.08% chance for 25x-40x
  if (r < 0.005) return 15 + Math.random() * 10;    // 0.4% chance for 15x-25x
  if (r < 0.02) return 8 + Math.random() * 7;       // 1.5% chance for 8x-15x
  if (r < 0.08) return 4 + Math.random() * 4;       // 6% chance for 4x-8x
  if (r < 0.25) return 2 + Math.random() * 2;       // 17% chance for 2x-4x
  if (r < 0.55) return 1.3 + Math.random() * 0.7;   // 30% chance for 1.3x-2x
  else return 1.01 + Math.random() * 0.29;          // 45% chance for 1.01x-1.3x
}

function maybeHugeMultiplier() {
  const r = Math.random();
  
  // Much rarer huge multipliers with 50% house edge
  if (r < 0.0001) return 30 + Math.random() * 20;   // 0.01% chance for 30x-50x
  if (r < 0.0005) return 20 + Math.random() * 10;    // 0.04% chance for 20x-30x
  if (r < 0.002) return 10 + Math.random() * 10;     // 0.15% chance for 10x-20x
  return null; // fall back to base logic
}

function applyBiasCorrection(multiplier) {
  // Enhanced bias correction to prevent rigged appearance
  const recentCount = recentMultipliers.length;
  if (recentCount < 10) {
    // Need enough data first
    recentMultipliers.push(multiplier);
    if (recentMultipliers.length > 100) recentMultipliers.shift();
    return Math.round(multiplier * 100) / 100;
  }
  
  // Analyze recent patterns more intelligently
  const last5 = recentMultipliers.slice(-5);
  const last10 = recentMultipliers.slice(-10);
  const last15 = recentMultipliers.slice(-15);
  
  // Check for consecutive low multipliers
  const consecutiveLows = last5.filter(m => m <= 1.3).length;
  const consecutiveVeryLows = last5.filter(m => m <= 1.1).length;
  const consecutiveCrashes = last5.filter(m => m === 1.01).length;
  
  // Check for extended low periods
  const lowCount10 = last10.filter(m => m <= 1.3).length;
  const lowCount15 = last15.filter(m => m <= 1.3).length;
  
  // Progressive relief system
  if (consecutiveCrashes >= 3) {
    // 3 crashes in a row - guaranteed relief
    multiplier = 2.5 + Math.random() * 3.5; // 2.5x-6x relief
    console.log(`🎯 Progressive relief: ${consecutiveCrashes} consecutive crashes → ${multiplier.toFixed(2)}x`);
  } else if (consecutiveVeryLows >= 4) {
    // 4 very lows in a row - strong relief
    multiplier = 2 + Math.random() * 2; // 2x-4x relief
    console.log(`📈 Strong relief: ${consecutiveVeryLows} consecutive very lows → ${multiplier.toFixed(2)}x`);
  } else if (consecutiveLows >= 4) {
    // 4 lows in a row - moderate relief
    multiplier = 1.8 + Math.random() * 1.7; // 1.8x-3.5x relief
    console.log(`📊 Moderate relief: ${consecutiveLows} consecutive lows → ${multiplier.toFixed(2)}x`);
  } else if (lowCount10 >= 7) {
    // 7+ lows in last 10 - small relief
    multiplier = 1.5 + Math.random() * 1.5; // 1.5x-3x relief
    console.log(`📊 Small relief: ${lowCount10}/10 lows → ${multiplier.toFixed(2)}x`);
  } else if (lowCount15 >= 10 && multiplier < 1.5) {
    // 10+ lows in last 15 - minimal relief
    multiplier = 1.4 + Math.random() * 0.6; // 1.4x-2x relief
    console.log(`📊 Minimal relief: ${lowCount15}/15 lows → ${multiplier.toFixed(2)}x`);
  }
  
  // Add to recent history
  recentMultipliers.push(multiplier);
  if (recentMultipliers.length > 100) recentMultipliers.shift();

  return Math.round(multiplier * 100) / 100;
}

function generateCrashMultiplier() {
  // Add entropy to prevent patterns
  const entropy = Math.random() * 0.1; // Small random factor
  
  // Try for huge multiplier first (much rarer)
  let multiplier = maybeHugeMultiplier();
  
  if (!multiplier) {
    // Use enhanced distribution for better variety
    multiplier = generateEnhancedDistribution();
  }
  
  // Add entropy to break patterns
  multiplier += entropy;
  
  // Apply enhanced loss patterns
  multiplier = applyEnhancedLossPatterns(multiplier);
  
  // Apply enhanced bias correction
  multiplier = applyBiasCorrection(multiplier);
  
  // Ensure we don't get stuck on the same value by adding micro-variation
  const microVariation = (Math.random() - 0.5) * 0.01; // ±0.005 variation
  multiplier += microVariation;
  
  // Final rounding to prevent floating point issues
  return Math.round(multiplier * 100) / 100;
}

function applyEnhancedLossPatterns(multiplier) {
  const round = nextRoundToGenerate;
  const recentCount = recentMultipliers.length;
  
  if (recentCount < 8) {
    // Not enough data yet, just add pattern breaking
    const patternBreak = (Math.random() - 0.5) * 0.2;
    return Math.max(1.01, multiplier + patternBreak);
  }
  
  // Enhanced pattern detection and prevention
  const last8 = recentMultipliers.slice(-8);
  const last12 = recentMultipliers.slice(-12);
  
  // Check for various problematic patterns
  const consecutiveLows = last8.filter(m => m <= 1.3).length;
  const consecutiveHighs = last12.filter(m => m >= 15).length;
  const consecutiveCrashes = last8.filter(m => m === 1.01).length;
  
  // Progressive intervention system
  if (consecutiveCrashes >= 2) {
    // 2+ crashes in last 8 - force a decent multiplier
    return 2 + Math.random() * 3; // 2x-5x
  } else if (consecutiveLows >= 6) {
    // 6+ lows in last 8 - force a good multiplier
    return 3 + Math.random() * 4; // 3x-7x
  } else if (consecutiveHighs >= 3) {
    // 3+ highs in last 12 - reduce temporarily
    if (multiplier > 10) {
      multiplier *= 0.3 + Math.random() * 0.4; // Reduce by 30-70%
    }
  }
  
  // Add enhanced pattern breaking
  const patternBreak = (Math.random() - 0.5) * 0.3; // ±0.15 variation
  const microVariation = Math.sin(round * 0.1) * 0.05; // Subtle wave pattern
  multiplier += patternBreak + microVariation;
  
  return Math.max(1.01, multiplier);
}

// Send multiplier batch to socket server
async function sendMultipliersToSocketServer(multipliers, startRound) {
  try {
    const response = await fetch(`${SOCKET_SERVER_URL}/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SOCKET_SERVER_SECRET}`
      },
      body: JSON.stringify({ multipliers, startRound })
    });
    
    if (response.ok) {
      console.log(`📤 Sent to socket server (rounds ${startRound}-${startRound + multipliers.length - 1})`);
    } else {
      console.error(`❌ Failed to queue multipliers: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ Error sending multipliers to socket server:', error.message);
  }
}

// Check socket server queue and generate if needed
async function checkSocketQueueAndGenerate() {
  // Prevent multiple simultaneous checks
  if (isGenerating) {
    console.log(`⏳ Already generating, skipping queue check`);
    return;
  }
  
  try {
    // Check socket server health endpoint for queue size
    const response = await fetch(`${SOCKET_SERVER_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Failed to check socket queue: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    const queueSize = data.queueSize || 0;
    const gamePhase = data.gamePhase || 'unknown';
    
    console.log(`📊 Socket queue check: ${queueSize} multipliers, phase: ${gamePhase}`);
    
    // Generate new batch if queue is low
    if (queueSize <= QUEUE_THRESHOLD) {
      console.log(`🚀 Queue low (${queueSize} <= ${QUEUE_THRESHOLD}), generating new batch...`);
      isGenerating = true;
      
      // Generate the full batch
      await generateFullBatch();
      
      isGenerating = false;
    } else {
      console.log(`✅ Queue healthy (${queueSize} > ${QUEUE_THRESHOLD}), no generation needed`);
    }
    
    lastQueueCheck = Date.now();
    
  } catch (error) {
    console.error('❌ Error checking socket queue:', error.message);
    isGenerating = false;
  }
}

// Get the highest round number from database
async function getHighestRoundNumber() {
  try {
    const { data, error } = await supabase
      .from('multipliers')
      .select('round_number')
      .order('round_number', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('❌ Error getting highest round number:', error);
      return 0;
    }
    
    if (data && data.length > 0) {
      return data[0].round_number;
    }
    
    return 0;
  } catch (error) {
    console.error('❌ Error in getHighestRoundNumber:', error);
    return 0;
  }
}

// Check for existing round numbers to prevent conflicts
async function checkExistingRounds(startRound, endRound) {
  try {
    const { data, error } = await supabase
      .from('multipliers')
      .select('round_number')
      .gte('round_number', startRound)
      .lte('round_number', endRound);
    
    if (error) {
      console.error('❌ Error checking existing rounds:', error);
      return false;
    }
    
    if (data && data.length > 0) {
      console.warn(`⚠️ Found ${data.length} existing rounds in range ${startRound}-${endRound}:`, data.map(r => r.round_number));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error in checkExistingRounds:', error);
    return false;
  }
}

// Generate a full batch of multipliers
async function generateFullBatch() {
  console.log(`🎲 Generating batch of ${BATCH_SIZE} multipliers...`);
  
  // Check for existing rounds to prevent conflicts
  const batchStartRound = nextRoundToGenerate;
  const batchEndRound = nextRoundToGenerate + BATCH_SIZE - 1;
  
  console.log(`🎲 Starting batch generation from round ${batchStartRound} to ${batchEndRound}`);
  
  // Check if any of these rounds already exist in the database
  const hasExistingRounds = await checkExistingRounds(batchStartRound, batchEndRound);
  if (hasExistingRounds) {
    console.error(`🚨 CONFLICT: Rounds ${batchStartRound}-${batchEndRound} already exist in database!`);
    console.error(`🚨 Skipping batch generation to prevent conflicts`);
    return;
  }
  
  for (let i = 0; i < BATCH_SIZE; i++) {
    const multiplier = generateCrashMultiplier();
    const currentRoundNumber = nextRoundToGenerate;
    
    // Add to buffer with the correct round number
    multiplierBuffer.push({
      round_number: currentRoundNumber,
      multiplier
    });
    
    // Enhanced logging with distribution info
    let multiplierType = '';
    if (multiplier >= 50) multiplierType = '🔥 EPIC';
    else if (multiplier >= 25) multiplierType = '⚡ HUGE';
    else if (multiplier >= 10) multiplierType = '🎯 HIGH';
    else if (multiplier >= 5) multiplierType = '📈 GOOD';
    else if (multiplier >= 2) multiplierType = '✅ DECENT';
    else if (multiplier >= 1.3) multiplierType = '📊 LOW';
    else multiplierType = '💥 CRASH';
    
    console.log(`[Round ${currentRoundNumber}] ${multiplierType} Multiplier: ${multiplier}x`);
    
    // Increment for next generation
    nextRoundToGenerate++;
  }
  
  // Verify round number sequence
  const actualBatchEndRound = nextRoundToGenerate - 1;
  const expectedRounds = actualBatchEndRound - batchStartRound + 1;
  if (expectedRounds !== BATCH_SIZE) {
    console.error(`🚨 ROUND NUMBER ERROR: Expected ${BATCH_SIZE} rounds, got ${expectedRounds}`);
    console.error(`🚨 Batch start: ${batchStartRound}, Batch end: ${actualBatchEndRound}`);
  } else {
    console.log(`✅ Round number sequence verified: ${batchStartRound} to ${actualBatchEndRound} (${BATCH_SIZE} rounds)`);
  }
  
  // Store all multipliers in database
  console.log(`💾 Saving ${multiplierBuffer.length} multipliers to database...`);
  console.log(`📋 First round: ${multiplierBuffer[0]?.round_number}, Last round: ${multiplierBuffer[multiplierBuffer.length - 1]?.round_number}`);
  
  const { data, error } = await supabase
    .from('multipliers')
    .insert(multiplierBuffer);
  
  if (error) {
    console.error('❌ Error inserting batch multipliers:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    console.error('❌ First multiplier in buffer:', multiplierBuffer[0]);
    console.error('❌ Last multiplier in buffer:', multiplierBuffer[multiplierBuffer.length - 1]);
    return;
  }
  
  console.log(`✅ Successfully saved ${multiplierBuffer.length} multipliers to database`);
  console.log(`📊 Database response:`, data ? `${data.length} rows inserted` : 'No data returned');
  
  // Safety check: ensure buffer has data before accessing
  if (multiplierBuffer.length === 0) {
    console.error('Error: multiplierBuffer is empty');
    return;
  }
  
  const startRound = multiplierBuffer[0].round_number;
  const endRound = multiplierBuffer[multiplierBuffer.length - 1].round_number;
  
  console.log(`📦 Generated batch ${startRound}-${endRound}: [${multiplierBuffer.map(m => m.multiplier).join(', ')}]`);
  
  // Send multipliers to socket server for real-time simulation
  await sendMultipliersToSocketServer(multiplierBuffer, startRound);
  
  // Update current round to the last generated round
  currentRound = endRound;
  
  // Clear buffer
  multiplierBuffer = [];
  
  console.log(`✅ Batch generation complete!`);
}

// Enhanced function to display distribution statistics
function displayDistributionStats() {
  if (recentMultipliers.length < 50) return; // Need enough data
  
  const stats = {
    crashes: recentMultipliers.filter(m => m === 1.01).length,
    low: recentMultipliers.filter(m => m > 1.01 && m <= 1.3).length,
    decent: recentMultipliers.filter(m => m > 1.3 && m <= 2.5).length,
    good: recentMultipliers.filter(m => m > 2.5 && m <= 10).length,
    high: recentMultipliers.filter(m => m > 10 && m <= 30).length,
    huge: recentMultipliers.filter(m => m > 30).length
  };
  
  const total = recentMultipliers.length;
  
  // Calculate consecutive patterns
  const last10 = recentMultipliers.slice(-10);
  const consecutiveLows = last10.filter(m => m <= 1.3).length;
  const consecutiveCrashes = last10.filter(m => m === 1.01).length;
  
  console.log(`📊 Enhanced Distribution Stats (Last ${total} multipliers):`);
  console.log(`   💥 Crashes (1.01x): ${stats.crashes} (${(stats.crashes/total*100).toFixed(1)}%)`);
  console.log(`   📊 Low (1.02-1.3x): ${stats.low} (${(stats.low/total*100).toFixed(1)}%)`);
  console.log(`   ✅ Decent (1.3-2.5x): ${stats.decent} (${(stats.decent/total*100).toFixed(1)}%)`);
  console.log(`   📈 Good (2.5-10x): ${stats.good} (${(stats.good/total*100).toFixed(1)}%)`);
  console.log(`   🎯 High (10-30x): ${stats.high} (${(stats.high/total*100).toFixed(1)}%)`);
  console.log(`   ⚡ Huge (30x+): ${stats.huge} (${(stats.huge/total*100).toFixed(1)}%)`);
  console.log(`   🔍 Last 10: ${consecutiveLows}/10 lows, ${consecutiveCrashes} crashes`);
  
  // Alert if patterns are detected
  if (consecutiveLows >= 7) {
    console.log(`⚠️  WARNING: ${consecutiveLows}/10 consecutive lows detected!`);
  }
  if (consecutiveCrashes >= 3) {
    console.log(`🚨 ALERT: ${consecutiveCrashes} consecutive crashes detected!`);
  }
}

// Set up interval to check socket queue and generate when needed
setInterval(checkSocketQueueAndGenerate, QUEUE_CHECK_INTERVAL);

// Display stats every 50 queue checks (approximately every 4 minutes)
setInterval(displayDistributionStats, QUEUE_CHECK_INTERVAL * 50);

// Initialize round numbers from database
async function initializeRoundNumbers() {
  try {
    console.log(`🔍 Initializing round numbers from database...`);
    const highestRound = await getHighestRoundNumber();
    
    if (highestRound > 0) {
      // Start from the next round after the highest in database
      currentRound = highestRound;
      nextRoundToGenerate = highestRound + 1;
      console.log(`✅ Synced with database: currentRound=${currentRound}, nextRoundToGenerate=${nextRoundToGenerate}`);
    } else {
      // No data in database, use default values
      console.log(`📝 No existing data found, using default round numbers: currentRound=${currentRound}, nextRoundToGenerate=${nextRoundToGenerate}`);
    }
  } catch (error) {
    console.error('❌ Error initializing round numbers:', error);
    console.log(`⚠️ Using fallback round numbers: currentRound=${currentRound}, nextRoundToGenerate=${nextRoundToGenerate}`);
  }
}

// Initial generation to get started
console.log(`🚀 Starting queue-based multiplier generation system...`);
console.log(`📊 Will check socket queue every ${QUEUE_CHECK_INTERVAL/1000} seconds`);
console.log(`🎯 Will generate new batch when queue has ≤ ${QUEUE_THRESHOLD} multipliers`);

// Initialize round numbers first, then start the system
initializeRoundNumbers().then(() => {
  setTimeout(checkSocketQueueAndGenerate, 2000); // Initial check after 2 seconds
});

// Remove round syncing - socket server handles its own round progression

// Root endpoint for uptime monitoring
app.get('/', (req, res) => {
  const response = { 
    status: 'ok', 
    service: 'aviator-backend',
    timestamp: new Date().toISOString(),
    currentRound,
    batchSize: BATCH_SIZE,
    queueCheckInterval: QUEUE_CHECK_INTERVAL,
    queueThreshold: QUEUE_THRESHOLD,
    isGenerating
  };
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(response);
});

// Simple ping endpoint for basic uptime monitoring
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Health check endpoint
app.get('/health', (req, res) => {
  const response = {
    status: 'healthy',
    service: 'aviator-backend',
    timestamp: new Date().toISOString(),
    currentRound,
    batchSize: BATCH_SIZE,
    queueCheckInterval: QUEUE_CHECK_INTERVAL,
    queueThreshold: QUEUE_THRESHOLD,
    socketServerUrl: SOCKET_SERVER_URL,
    isGenerating,
    lastQueueCheck: lastQueueCheck ? new Date(lastQueueCheck).toISOString() : null
  };
  res.json(response);
});

app.get('/api/multiplier/:round', async (req, res) => {
  const round = parseInt(req.params.round, 10);
  const { data, error } = await supabase
    .from('multipliers')
    .select('multiplier')
    .eq('round_number', round)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  res.json({ round_number: round, multiplier: data.multiplier });
});

app.get('/api/multipliers', async (req, res) => {
  const from = parseInt(req.query.from, 10);
  const to = parseInt(req.query.to, 10);
  if (isNaN(from) || isNaN(to) || from > to) {
    return res.status(400).json({ error: 'Invalid range' });
  }
  const { data, error } = await supabase
    .from('multipliers')
    .select('round_number, multiplier')
    .gte('round_number', from)
    .lte('round_number', to)
    .order('round_number', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/current', async (req, res) => {
  const { data, error } = await supabase
    .from('multipliers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// Add this endpoint to return the current round number and server time
app.get('/api/current-round', (req, res) => {
  // Use the sequential round system for consistency with database
  res.json({ 
    currentRound: currentRound, 
    nextRoundToGenerate: nextRoundToGenerate,
    now: Date.now() 
  });
});

// Manual trigger endpoint for testing queue-based generation
app.post('/api/trigger-generation', async (req, res) => {
  try {
    console.log(`🔧 Manual trigger: Checking socket queue and generating if needed...`);
    await checkSocketQueueAndGenerate();
    res.json({ 
      success: true, 
      message: 'Queue check and generation triggered',
      isGenerating,
      lastQueueCheck: lastQueueCheck ? new Date(lastQueueCheck).toISOString() : null
    });
  } catch (error) {
    console.error('❌ Error in manual trigger:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Force generation endpoint (bypasses queue check)
app.post('/api/force-generation', async (req, res) => {
  try {
    if (isGenerating) {
      return res.status(400).json({ 
        success: false, 
        message: 'Already generating, please wait' 
      });
    }
    
    console.log(`🔧 Force generation: Generating batch immediately...`);
    isGenerating = true;
    await generateFullBatch();
    isGenerating = false;
    
    res.json({ 
      success: true, 
      message: 'Force generation completed',
      currentRound
    });
  } catch (error) {
    console.error('❌ Error in force generation:', error.message);
    isGenerating = false;
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Queue status endpoint
app.get('/api/queue-status', async (req, res) => {
  try {
    const response = await fetch(`${SOCKET_SERVER_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to check socket server' 
      });
    }
    
    const socketData = await response.json();
    
    res.json({
      success: true,
      backend: {
        currentRound,
        isGenerating,
        lastQueueCheck: lastQueueCheck ? new Date(lastQueueCheck).toISOString() : null,
        queueThreshold: QUEUE_THRESHOLD,
        batchSize: BATCH_SIZE
      },
      socket: {
        queueSize: socketData.queueSize,
        gamePhase: socketData.gamePhase,
        currentRound: socketData.currentRound,
        currentMultiplier: socketData.currentMultiplier
      }
    });
  } catch (error) {
    console.error('❌ Error checking queue status:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Catch-all route for 404s (must be last)
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    message: 'Endpoint not found',
    availableEndpoints: [
      '/', 
      '/ping', 
      '/health', 
      '/api/multiplier/:round', 
      '/api/multipliers', 
      '/api/current', 
      '/api/current-round',
      '/api/trigger-generation',
      '/api/force-generation',
      '/api/queue-status'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend started on port ${PORT} (round ${currentRound})`);
  console.log(`📦 Batch size: ${BATCH_SIZE} multipliers`);
  console.log(`⏱️ Interval: ${QUEUE_CHECK_INTERVAL}ms per queue check`);
  console.log(`🔍 Uptime monitoring: /, /ping, /health`);
});