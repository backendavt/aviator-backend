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
const ROUND_INTERVAL_MS = 3000; // 3 seconds per multiplier
const BATCH_SIZE = 100; // Store 100 multipliers at a time for better efficiency

// Array to collect multipliers before storing
let multiplierBuffer = [];
let nextRoundToGenerate = currentRound + 1; // Track the next round to generate

// Track recent multipliers for bias correction
let recentMultipliers = [];

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

function maybeHugeMultiplier() {
  const r = Math.random();
  
  // Much rarer huge multipliers with 50% house edge
  if (r < 0.0001) return 30 + Math.random() * 20;   // 0.01% chance for 30x-50x
  if (r < 0.0005) return 20 + Math.random() * 10;    // 0.04% chance for 20x-30x
  if (r < 0.002) return 10 + Math.random() * 10;     // 0.15% chance for 10x-20x
  return null; // fall back to base logic
}

function applyBiasCorrection(multiplier) {
  // Minimal bias correction to maintain 50% house edge
  const crashStreak = recentMultipliers.slice(-8).every(m => m === 1.01); // 8 crashes needed
  
  // Check for extended low periods
  const lowCount = recentMultipliers.slice(-15).filter(m => m <= 1.3).length;
  const veryLowCount = recentMultipliers.slice(-10).filter(m => m <= 1.1).length;

  if (crashStreak) {
    // Minimal relief to prevent rage-quitting
    multiplier = 1.5 + Math.random() * 1.5; // 1.5x-3x relief
    console.log(`🎯 Bias correction: Crash streak detected, relief to ${multiplier.toFixed(2)}x`);
  } else if (veryLowCount >= 8) {
    // Very minimal relief for extended lows
    multiplier = 1.3 + Math.random() * 1.2; // 1.3x-2.5x relief
    console.log(`📈 Bias correction: Too many very lows, relief to ${multiplier.toFixed(2)}x`);
  } else if (lowCount >= 12 && multiplier < 1.5) {
    // Minimal relief for extended low period
    multiplier = 1.4 + Math.random() * 0.6; // 1.4x-2x relief
    console.log(`📈 Bias correction: Extended low period, relief to ${multiplier.toFixed(2)}x`);
  }

  // Add to recent history
  recentMultipliers.push(multiplier);
  if (recentMultipliers.length > 100) recentMultipliers.shift(); // Keep buffer small

  return Math.round(multiplier * 100) / 100;
}

function generateCrashMultiplier() {
  // Add entropy to prevent patterns
  const entropy = Math.random() * 0.1; // Small random factor
  
  // Try for huge multiplier first (much rarer)
  let multiplier = maybeHugeMultiplier();
  
  if (!multiplier) {
    // Use 50% house edge distribution
    multiplier = generateRealisticMultiplier();
  }
  
  // Add entropy to break patterns
  multiplier += entropy;
  
  // Apply minimal loss patterns
  multiplier = applyLossPatterns(multiplier);
  
  // Apply minimal bias correction
  multiplier = applyBiasCorrection(multiplier);
  
  return Math.round(multiplier * 100) / 100;
}

function applyLossPatterns(multiplier) {
  const round = nextRoundToGenerate;
  
  // Remove predictable pacing system - make it more random
  // const forcedBigWin = (round % 65 === 0) && (Math.random() < 0.8);
  // const variance = Math.floor(Math.random() * 11) - 5;
  // const adjustedRound = round + variance;
  
  // Only intervene in extreme cases
  const recentLows = recentMultipliers.slice(-10).filter(m => m <= 1.3).length;
  const recentHighs = recentMultipliers.slice(-15).filter(m => m >= 20).length;
  
  if (recentLows >= 8) {
    // Only minimal relief for extreme cases
    return 1.5 + Math.random() * 1.5; // 1.5x-3x relief
  } else if (recentHighs >= 4) {
    // Reduce high multipliers more aggressively
    if (multiplier > 8) {
      multiplier *= 0.2 + Math.random() * 0.3; // Reduce by 50-80%
    }
  }
  
  // Add small random variation to break patterns
  const patternBreak = (Math.random() - 0.5) * 0.2; // ±0.1 variation
  multiplier += patternBreak;
  
  return Math.max(1.01, multiplier);
}

async function generateAndStoreBatchMultipliers() {
  // Generate 1 multiplier for the next sequential round
  const multiplier = generateCrashMultiplier();
  
  // Add to buffer with the correct round number
  multiplierBuffer.push({
    round_number: nextRoundToGenerate,
    multiplier
  });
  
  // Enhanced logging with distribution info (updated for new system)
  let multiplierType = '';
  if (multiplier >= 50) multiplierType = '🔥 EPIC';
  else if (multiplier >= 25) multiplierType = '⚡ HUGE';
  else if (multiplier >= 10) multiplierType = '🎯 HIGH';
  else if (multiplier >= 5) multiplierType = '📈 GOOD';
  else if (multiplier >= 2) multiplierType = '✅ DECENT';
  else if (multiplier >= 1.3) multiplierType = '📊 LOW';
  else multiplierType = '💥 CRASH';
  
  console.log(`[Round ${nextRoundToGenerate}] ${multiplierType} Multiplier: ${multiplier}x`);
  
  // Increment for next generation
  nextRoundToGenerate++;
  
  // If buffer is full (10 multipliers), store them all
  if (multiplierBuffer.length >= BATCH_SIZE) {
    // Insert all multipliers at once
    const { data, error } = await supabase
      .from('multipliers')
      .insert(multiplierBuffer);
    
    if (error) {
      console.error('Error inserting batch multipliers:', error);
      return;
    }
    
    // Safety check: ensure buffer has data before accessing
    if (multiplierBuffer.length === 0) {
      console.error('Error: multiplierBuffer is empty');
      return;
    }
    
    const startRound = multiplierBuffer[0].round_number;
    const endRound = multiplierBuffer[multiplierBuffer.length - 1].round_number;
    
    console.log(`📦 Batch ${startRound}-${endRound}: [${multiplierBuffer.map(m => m.multiplier).join(', ')}]`);
    
    // Send multipliers to socket server for real-time simulation
    await sendMultipliersToSocketServer(multiplierBuffer, startRound);
    
    // Update current round to the last generated round
    currentRound = endRound;
    
    // Clear buffer
    multiplierBuffer = [];
  }
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

// Function to display distribution statistics
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
  console.log(`📊 Distribution Stats (Last ${total} multipliers):`);
  console.log(`   💥 Crashes (1.01x): ${stats.crashes} (${(stats.crashes/total*100).toFixed(1)}%)`);
  console.log(`   📊 Low (1.02-1.3x): ${stats.low} (${(stats.low/total*100).toFixed(1)}%)`);
  console.log(`   ✅ Decent (1.3-2.5x): ${stats.decent} (${(stats.decent/total*100).toFixed(1)}%)`);
  console.log(`   📈 Good (2.5-10x): ${stats.good} (${(stats.good/total*100).toFixed(1)}%)`);
  console.log(`   🎯 High (10-30x): ${stats.high} (${(stats.high/total*100).toFixed(1)}%)`);
  console.log(`   ⚡ Huge (30x+): ${stats.huge} (${(stats.huge/total*100).toFixed(1)}%)`);
}

// Set up interval to generate 1 multiplier every 3 seconds
setInterval(generateAndStoreBatchMultipliers, ROUND_INTERVAL_MS);

// Display stats every 50 multipliers
setInterval(displayDistributionStats, ROUND_INTERVAL_MS * 50);

// Remove round syncing - socket server handles its own round progression

// Root endpoint for uptime monitoring
app.get('/', (req, res) => {
  const response = { 
    status: 'ok', 
    service: 'aviator-backend',
    timestamp: new Date().toISOString(),
    currentRound,
    batchSize: BATCH_SIZE,
    interval: ROUND_INTERVAL_MS
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
    interval: ROUND_INTERVAL_MS,
    socketServerUrl: SOCKET_SERVER_URL
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
  // Set base timestamp to today (August 1, 2025) at 12:00 PM UTC
  const today = new Date();
  const BASE_TIMESTAMP = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12, 0, 0);
  const now = Date.now();
  const currentRound = Math.max(1, Math.floor((now - BASE_TIMESTAMP) / 10_000));
  res.json({ currentRound, now });
});

// Catch-all route for 404s (must be last)
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    message: 'Endpoint not found',
    availableEndpoints: ['/', '/ping', '/health', '/api/multiplier/:round', '/api/multipliers', '/api/current', '/api/current-round']
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend started on port ${PORT} (round ${currentRound})`);
  console.log(`📦 Batch size: ${BATCH_SIZE} multipliers`);
  console.log(`⏱️ Interval: ${ROUND_INTERVAL_MS}ms per multiplier`);
  console.log(`🔍 Uptime monitoring: /, /ping, /health`);
});