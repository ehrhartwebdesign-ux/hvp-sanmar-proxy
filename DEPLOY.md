'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const { requireAuth, requireAdmin, JWT_SECRET } = require('../middleware/auth');
const router   = express.Router();

// POST /api/auth/login
router.post('/login', async function(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await db.query(
      'SELECT * FROM employees WHERE email = $1 AND active = true', [email.toLowerCase()]
    );
    const emp = result.rows[0];
    if (!emp) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, emp.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign(
      { id: emp.id, name: emp.name, email: emp.email, role: emp.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, employee: { id: emp.id, name: emp.name, email: emp.email, role: emp.role } });
  } catch(e) {
    console.error('Login error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, function(req, res) {
  res.json({ employee: req.employee });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async function(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const result = await db.query('SELECT * FROM employees WHERE id = $1', [req.employee.id]);
    const emp = result.rows[0];
    const ok = await bcrypt.compare(currentPassword, emp.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password_hash = $1 WHERE id = $2', [hash, req.employee.id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list employees
router.get('/employees', requireAdmin, async function(req, res) {
  try {
    const r = await db.query('SELECT id,name,email,role,active,created_at FROM employees ORDER BY created_at');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: create employee
router.post('/employees', requireAdmin, async function(req, res) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      'INSERT INTO employees (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role',
      [name, email.toLowerCase(), hash, role || 'staff']
    );
    res.json(r.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Admin: toggle employee active
router.patch('/employees/:id', requireAdmin, async function(req, res) {
  try {
    const { active, role, name } = req.body;
    const r = await db.query(
      'UPDATE employees SET active=COALESCE($1,active), role=COALESCE($2,role), name=COALESCE($3,name) WHERE id=$4 RETURNING id,name,email,role,active',
      [active, role, name, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
