'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', function(err) {
  console.error('PostgreSQL pool error:', err.message);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

async function initDb() {
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await query(schema);
    console.log('Database schema initialized.');
    // Ensure default admin exists
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('HVPromos2024!', 10);
    await query(
      `INSERT INTO employees (name, email, password_hash, role)
       VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
      ['Admin', 'admin@hvpromos.com', hash, 'admin']
    );
  } catch(e) {
    console.error('DB init error:', e.message);
  }
}

module.exports = { query, pool, initDb };
