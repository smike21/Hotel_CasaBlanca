const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool();
    const tipos = await pool.request().query(`
      SELECT th.*, (SELECT TOP 1 url FROM FotosHabitacion f WHERE f.tipo_id = th.id ORDER BY orden) AS foto
      FROM TiposHabitacion th ORDER BY th.precio_base DESC
    `);
    const resenas = await pool.request().query(`
      SELECT TOP 3 r.calificacion, r.comentario, h.nombres, h.apellidos
      FROM Resenas r JOIN Huespedes h ON h.id = r.huesped_id
      WHERE r.aprobado = 1 ORDER BY r.fecha DESC
    `);
    res.render('public/home', {
      titulo: 'Hotel Casa Blanca | La Unión, Huánuco',
      tipos: tipos.recordset,
      resenas: resenas.recordset
    });
  } catch (err) { next(err); }
});

router.get('/habitaciones', async (req, res, next) => {
  try {
    const pool = await getPool();
    const tipos = await pool.request().query(`
      SELECT th.*, (SELECT TOP 1 url FROM FotosHabitacion f WHERE f.tipo_id = th.id ORDER BY orden) AS foto
      FROM TiposHabitacion th ORDER BY th.precio_base DESC
    `);
    res.render('public/habitaciones', { titulo: 'Habitaciones | Hotel Casa Blanca', tipos: tipos.recordset });
  } catch (err) { next(err); }
});

router.get('/nosotros', (req, res) => {
  res.render('public/nosotros', { titulo: 'Nosotros | Hotel Casa Blanca' });
});

router.get('/contacto', (req, res) => {
  res.render('public/contacto', { titulo: 'Contacto | Hotel Casa Blanca' });
});

router.post('/contacto', async (req, res, next) => {
  try {
    const nombre = req.body.nombre?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const telefono = req.body.telefono?.trim();
    const mensaje = req.body.mensaje?.trim();
    if (!nombre || nombre.length > 120 || !email || email.length > 150 || !/^\S+@\S+\.\S+$/.test(email) || !mensaje || mensaje.length > 1000 || (telefono && telefono.length > 20)) {
      req.flash('error', 'Revisa los datos del formulario e inténtalo nuevamente.');
      return res.redirect('/contacto');
    }
    const pool = await getPool();
    await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('email', sql.VarChar, email)
      .input('telefono', sql.VarChar, telefono || null)
      .input('mensaje', sql.VarChar, mensaje)
      .query(`INSERT INTO MensajesContacto (nombre, email, telefono, mensaje) VALUES (@nombre, @email, @telefono, @mensaje)`);
    req.flash('success', 'Gracias, tu mensaje fue enviado. Te responderemos pronto.');
    res.redirect('/contacto');
  } catch (err) { next(err); }
});

module.exports = router;
