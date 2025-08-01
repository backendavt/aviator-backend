require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Socket server configuration
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || 'http://localhost:3001';
const SOCKET_SERVER_SECRET = process.env.SOCKET_SERVER_SECRET || 'your-secret-token';

// Global variables
let currentRound = 1000; // Start from a reasonable round number
const ROUND_INTERVAL_MS = 3000; // 3 seconds per multiplier
const BATCH_SIZE = 100; // Store 100 multipliers at a time for better efficiency

// Array to collect multipliers before storing
let multiplierBuffer = [];
let nextRoundToGenerate = currentRound + 1; // Track the next round to generate

function generateCrashMultiplier() {
  const HOUSE_EDGE = 0.1;
  const MIN_MULTIPLIER = 1.01;
  const MAX_MULTIPLIER = 500;
  const HUGE_MULTIPLIER_CHANCE = 0.001;

  let multiplier;
  const rng = Math.random();

  if (rng < HUGE_MULTIPLIER_CHANCE) {
    multiplier = 100 + Math.random() * (MAX_MULTIPLIER - 100);
  } else {
    const payout = (1 - HOUSE_EDGE) / (1 - Math.random());
    multiplier = Math.max(MIN_MULTIPLIER, Math.min(payout, MAX_MULTIPLIER));
  }
  return Math.round(multiplier * 100) / 100;
}

async function generateAndStoreBatchMultipliers() {
  // Generate 1 multiplier for the next sequential round
  const multiplier = generateCrashMultiplier();
  
  // Add to buffer with the correct round number
  multiplierBuffer.push({
    round_number: nextRoundToGenerate,
    multiplier
  });
  
  console.log(`[Round ${nextRoundToGenerate}] Generated Multiplier: ${multiplier}`);
  
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

// Set up interval to generate 1 multiplier every 3 seconds
setInterval(generateAndStoreBatchMultipliers, ROUND_INTERVAL_MS);

// Remove round syncing - socket server handles its own round progression

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend started on port ${PORT} (round ${currentRound})`);
  console.log(`📦 Batch size: ${BATCH_SIZE} multipliers`);
  console.log(`⏱️ Interval: ${ROUND_INTERVAL_MS}ms per multiplier`);
});