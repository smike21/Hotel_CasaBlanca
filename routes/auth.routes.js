const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { sql, getPool } = require('../config/db');

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function checkLoginRate(req, res, next) {
  const attempt = loginAttempts.get(req.ip);
  if (attempt && Date.now() - attempt.startedAt < LOGIN_WINDOW_MS && attempt.count >= MAX_LOGIN_ATTEMPTS) {
    req.flash('error', 'Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.');
    return res.redirect('/admin/login');
  }
  if (attempt && Date.now() - attempt.startedAt >= LOGIN_WINDOW_MS) loginAttempts.delete(req.ip);
  next();
}

function recordFailedLogin(ip) {
  const attempt = loginAttempts.get(ip);
  if (!attempt || Date.now() - attempt.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, startedAt: Date.now() });
  } else {
    attempt.count += 1;
  }
}

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/admin/dashboard');
  res.render('auth/login', { titulo: 'Ingresar | Hotel Casa Blanca' });
});

router.post('/login', checkLoginRate, async (req, res, next) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password || email.length > 150) {
      recordFailedLogin(req.ip);
      req.flash('error', 'Credenciales inválidas.');
      return res.redirect('/admin/login');
    }
    const pool = await getPool();
    const result = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`SELECT u.*, r.nombre AS rol FROM Usuarios u JOIN Roles r ON r.id = u.rol_id WHERE u.email = @email AND u.activo = 1`);

    const usuario = result.recordset[0];
    if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
      recordFailedLogin(req.ip);
      req.flash('error', 'Credenciales inválidas.');
      return res.redirect('/admin/login');
    }

    req.session.usuario = { id: usuario.id, nombres: usuario.nombres, rol: usuario.rol };
    loginAttempts.delete(req.ip);

    await pool.request()
      .input('usuario_id', sql.Int, usuario.id)
      .input('accion', sql.VarChar, 'Inicio de sesión')
      .input('ip', sql.VarChar, req.ip)
      .query('INSERT INTO AuditoriaAccesos (usuario_id, accion, ip) VALUES (@usuario_id, @accion, @ip)');

    res.redirect('/admin/dashboard');
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

module.exports = router;
