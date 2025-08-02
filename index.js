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
  const MAX = 500;
  
  // Use time-based seed for unpredictability but with patterns
  const timeSeed = Date.now() % 10000;
  const roundSeed = nextRoundToGenerate % 100;
  const combinedSeed = (timeSeed + roundSeed * 37) % 10000;
  
  // Create pseudo-random but predictable pattern
  const r = (Math.sin(combinedSeed * 0.1) + Math.cos(combinedSeed * 0.07) + Math.sin(combinedSeed * 0.03)) / 3;
  const normalizedR = (r + 1) / 2; // Convert to 0-1 range
  
  // Use very harsh exponent for quick losses
  const exponent = 3.5; // Much more aggressive decay
  const scaled = MIN + (MAX - MIN) * Math.pow(1 - normalizedR, exponent);

  return Math.round(scaled * 100) / 100;
}

function maybeHugeMultiplier() {
  // Use same seed system for consistency
  const timeSeed = Date.now() % 10000;
  const roundSeed = nextRoundToGenerate % 100;
  const combinedSeed = (timeSeed + roundSeed * 37) % 10000;
  
  const r = (Math.sin(combinedSeed * 0.15) + Math.cos(combinedSeed * 0.11)) / 2;
  const normalizedR = (r + 1) / 2;
  
  // Much rarer huge multipliers to encourage losses
  if (normalizedR < 0.0001) return 200 + Math.random() * 300; // 0.01% chance for 200x-500x
  if (normalizedR < 0.0005) return 100 + Math.random() * 100;  // 0.04% chance for 100x-200x
  if (normalizedR < 0.003) return 25 + Math.random() * 25;     // 0.25% chance for 25x-50x
  return null; // fall back to base logic
}

function applyBiasCorrection(multiplier) {
  // Much more aggressive bias correction to encourage losses
  const crashStreak = recentMultipliers.slice(-4).every(m => m === 1.01); // Only 4 crashes needed
  
  // Check for low multipliers more aggressively
  const lowCount = recentMultipliers.slice(-8).filter(m => m <= 1.2).length;
  const veryLowCount = recentMultipliers.slice(-12).filter(m => m <= 1.1).length;

  if (crashStreak) {
    // Give a very small boost to keep players hooked
    multiplier = 1.2 + Math.random() * 0.8; // 1.2x-2x (very small relief)
    console.log(`🎯 Bias correction: Crash streak detected, minimal boost to ${multiplier.toFixed(2)}x`);
  } else if (veryLowCount >= 8) {
    // Very small boost for too many very low multipliers
    multiplier = 1.1 + Math.random() * 0.4; // 1.1x-1.5x (minimal relief)
    console.log(`📈 Bias correction: Too many very lows, minimal boost to ${multiplier.toFixed(2)}x`);
  } else if (lowCount >= 6 && multiplier < 1.3) {
    // Tiny boost for low multipliers
    multiplier = 1.15 + Math.random() * 0.3; // 1.15x-1.45x (tiny relief)
    console.log(`📈 Bias correction: Too many lows, tiny boost to ${multiplier.toFixed(2)}x`);
  }

  // Add to recent history
  recentMultipliers.push(multiplier);
  if (recentMultipliers.length > 100) recentMultipliers.shift(); // Keep buffer small

  return Math.round(multiplier * 100) / 100;
}

function generateCrashMultiplier() {
  // Try for huge multiplier first
  let multiplier = maybeHugeMultiplier();
  
  if (!multiplier) {
    // Use realistic power-law distribution
    multiplier = generateRealisticMultiplier();
  }
  
  // Apply loss-inducing patterns that appear random
  multiplier = applyLossPatterns(multiplier);
  
  // Apply minimal bias correction to keep players hooked
  multiplier = applyBiasCorrection(multiplier);
  
  return multiplier;
}

function applyLossPatterns(multiplier) {
  const round = nextRoundToGenerate;
  
  // Create patterns that encourage losses but appear random
  const pattern1 = (round % 7 === 0) && (Math.random() < 0.8); // Every 7th round, 80% chance of low
  const pattern2 = (round % 13 === 0) && (Math.random() < 0.9); // Every 13th round, 90% chance of crash
  const pattern3 = (round % 5 === 0) && (Math.random() < 0.7); // Every 5th round, 70% chance of low
  
  if (pattern2) {
    // Force crash on pattern2
    return 1.01;
  } else if (pattern1 || pattern3) {
    // Force low multiplier on pattern1 or pattern3
    return 1.05 + Math.random() * 0.15; // 1.05x-1.20x
  }
  
  // Add subtle loss bias to all multipliers
  if (multiplier > 2.0 && Math.random() < 0.3) {
    // 30% chance to reduce high multipliers
    multiplier *= 0.6 + Math.random() * 0.2; // Reduce by 20-40%
  }
  
  return multiplier;
}

async function generateAndStoreBatchMultipliers() {
  // Generate 1 multiplier for the next sequential round
  const multiplier = generateCrashMultiplier();
  
  // Add to buffer with the correct round number
  multiplierBuffer.push({
    round_number: nextRoundToGenerate,
    multiplier
  });
  
  // Enhanced logging with distribution info
  let multiplierType = '';
  if (multiplier >= 200) multiplierType = '🔥 EPIC';
  else if (multiplier >= 100) multiplierType = '⚡ HUGE';
  else if (multiplier >= 25) multiplierType = '🎯 HIGH';
  else if (multiplier >= 5) multiplierType = '📈 GOOD';
  else if (multiplier >= 2) multiplierType = '✅ DECENT';
  else if (multiplier >= 1.5) multiplierType = '📊 LOW';
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
    low: recentMultipliers.filter(m => m > 1.01 && m <= 1.5).length,
    decent: recentMultipliers.filter(m => m > 1.5 && m <= 2.5).length,
    good: recentMultipliers.filter(m => m > 2.5 && m <= 5).length,
    high: recentMultipliers.filter(m => m > 5 && m <= 25).length,
    huge: recentMultipliers.filter(m => m > 25).length
  };
  
  const total = recentMultipliers.length;
  console.log(`📊 Distribution Stats (Last ${total} multipliers):`);
  console.log(`   💥 Crashes (1.01x): ${stats.crashes} (${(stats.crashes/total*100).toFixed(1)}%)`);
  console.log(`   📊 Low (1.02-1.5x): ${stats.low} (${(stats.low/total*100).toFixed(1)}%)`);
  console.log(`   ✅ Decent (1.5-2.5x): ${stats.decent} (${(stats.decent/total*100).toFixed(1)}%)`);
  console.log(`   📈 Good (2.5-5x): ${stats.good} (${(stats.good/total*100).toFixed(1)}%)`);
  console.log(`   🎯 High (5-25x): ${stats.high} (${(stats.high/total*100).toFixed(1)}%)`);
  console.log(`   ⚡ Huge (25x+): ${stats.huge} (${(stats.huge/total*100).toFixed(1)}%)`);
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