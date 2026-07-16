const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { sql, getPool } = require('../config/db');

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/admin/dashboard');
  res.render('auth/login', { titulo: 'Ingresar | Hotel Casa Blanca' });
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`SELECT u.*, r.nombre AS rol FROM Usuarios u JOIN Roles r ON r.id = u.rol_id WHERE u.email = @email AND u.activo = 1`);

    const usuario = result.recordset[0];
    if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
      req.flash('error', 'Credenciales inválidas.');
      return res.redirect('/admin/login');
    }

    req.session.usuario = { id: usuario.id, nombres: usuario.nombres, rol: usuario.rol };

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
