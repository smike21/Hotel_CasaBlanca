const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

router.use(requireLogin);

// ---------- Dashboard ----------
router.get('/dashboard', async (req, res, next) => {
  try {
    const pool = await getPool();
    const [ocupacion, reservasHoy, pendientes, ingresosMes] = await Promise.all([
      pool.request().query(`
        SELECT
          (SELECT COUNT(*) FROM Habitaciones WHERE activo = 1) AS total,
          (SELECT COUNT(*) FROM Habitaciones h JOIN EstadosHabitacion e ON e.id = h.estado_id WHERE e.nombre = 'Ocupada') AS ocupadas
      `),
      pool.request().query(`
        SELECT COUNT(*) AS n FROM Reservas WHERE fecha_checkin = CAST(GETDATE() AS DATE)
      `),
      pool.request().query(`
        SELECT COUNT(*) AS n FROM Reservas r JOIN EstadosReserva e ON e.id = r.estado_id WHERE e.nombre = 'Pendiente'
      `),
      pool.request().query(`
        SELECT ISNULL(SUM(monto),0) AS total FROM Pagos WHERE MONTH(fecha_pago) = MONTH(GETDATE()) AND YEAR(fecha_pago) = YEAR(GETDATE())
      `)
    ]);
    const proximasReservas = await pool.request().query(`
      SELECT TOP 8 r.codigo, r.fecha_checkin, r.fecha_checkout, h.nombres, h.apellidos, e.nombre AS estado
      FROM Reservas r
      JOIN Huespedes h ON h.id = r.huesped_id
      JOIN EstadosReserva e ON e.id = r.estado_id
      ORDER BY r.creado_en DESC
    `);
    res.render('admin/dashboard', {
      titulo: 'Panel | Hotel Casa Blanca',
      ocupacion: ocupacion.recordset[0],
      reservasHoy: reservasHoy.recordset[0].n,
      pendientes: pendientes.recordset[0].n,
      ingresosMes: ingresosMes.recordset[0].total,
      proximasReservas: proximasReservas.recordset
    });
  } catch (err) { next(err); }
});

// ---------- Habitaciones ----------
router.get('/habitaciones', async (req, res, next) => {
  try {
    const pool = await getPool();
    const habitaciones = await pool.request().query(`
      SELECT h.*, t.nombre AS tipo_nombre, e.nombre AS estado_nombre
      FROM Habitaciones h
      JOIN TiposHabitacion t ON t.id = h.tipo_id
      JOIN EstadosHabitacion e ON e.id = h.estado_id
      ORDER BY h.piso, h.numero
    `);
    const tipos = await pool.request().query('SELECT * FROM TiposHabitacion ORDER BY nombre');
    const estados = await pool.request().query('SELECT * FROM EstadosHabitacion ORDER BY id');
    res.render('admin/habitaciones', {
      titulo: 'Habitaciones | Panel',
      habitaciones: habitaciones.recordset,
      tipos: tipos.recordset,
      estados: estados.recordset
    });
  } catch (err) { next(err); }
});

router.post('/habitaciones', requireRole('Administrador'), async (req, res, next) => {
  try {
    const { numero, tipo_id, estado_id, piso, descripcion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('numero', sql.VarChar, numero)
      .input('tipo_id', sql.Int, tipo_id)
      .input('estado_id', sql.Int, estado_id)
      .input('piso', sql.Int, piso)
      .input('descripcion', sql.VarChar, descripcion || null)
      .query(`INSERT INTO Habitaciones (numero, tipo_id, estado_id, piso, descripcion) VALUES (@numero, @tipo_id, @estado_id, @piso, @descripcion)`);
    req.flash('success', `Habitación ${numero} creada.`);
    res.redirect('/admin/habitaciones');
  } catch (err) { next(err); }
});

router.post('/habitaciones/:id/estado', async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('estado_id', sql.Int, req.body.estado_id)
      .query('UPDATE Habitaciones SET estado_id = @estado_id WHERE id = @id');
    req.flash('success', 'Estado de la habitación actualizado.');
    res.redirect('/admin/habitaciones');
  } catch (err) { next(err); }
});

router.post('/habitaciones/:id/eliminar', requireRole('Administrador'), async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query('UPDATE Habitaciones SET activo = 0 WHERE id = @id');
    req.flash('success', 'Habitación desactivada.');
    res.redirect('/admin/habitaciones');
  } catch (err) { next(err); }
});

// ---------- Tipos de habitación ----------
router.get('/tipos-habitacion', requireRole('Administrador'), async (req, res, next) => {
  try {
    const pool = await getPool();
    const tipos = await pool.request().query('SELECT * FROM TiposHabitacion ORDER BY precio_base DESC');
    res.render('admin/tipos-habitacion', { titulo: 'Tipos de habitación | Panel', tipos: tipos.recordset });
  } catch (err) { next(err); }
});

router.post('/tipos-habitacion', requireRole('Administrador'), async (req, res, next) => {
  try {
    const { nombre, descripcion, capacidad, precio_base } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('descripcion', sql.VarChar, descripcion || null)
      .input('capacidad', sql.Int, capacidad)
      .input('precio_base', sql.Decimal(10, 2), precio_base)
      .query(`INSERT INTO TiposHabitacion (nombre, descripcion, capacidad, precio_base) VALUES (@nombre, @descripcion, @capacidad, @precio_base)`);
    req.flash('success', `Tipo "${nombre}" creado.`);
    res.redirect('/admin/tipos-habitacion');
  } catch (err) { next(err); }
});

// ---------- Reservas ----------
router.get('/reservas', async (req, res, next) => {
  try {
    const pool = await getPool();
    const reservas = await pool.request().query(`
      SELECT r.*, h.nombres, h.apellidos, e.nombre AS estado_nombre,
        STRING_AGG(hab.numero, ', ') AS habitaciones
      FROM Reservas r
      JOIN Huespedes h ON h.id = r.huesped_id
      JOIN EstadosReserva e ON e.id = r.estado_id
      LEFT JOIN DetalleReserva dr ON dr.reserva_id = r.id
      LEFT JOIN Habitaciones hab ON hab.id = dr.habitacion_id
      GROUP BY r.id, r.codigo, r.huesped_id, r.estado_id, r.fecha_checkin, r.fecha_checkout,
        r.num_huespedes, r.total, r.notas, r.creado_por, r.creado_en, h.nombres, h.apellidos, e.nombre
      ORDER BY r.creado_en DESC
    `);
    const estados = await pool.request().query('SELECT * FROM EstadosReserva ORDER BY id');
    res.render('admin/reservas', { titulo: 'Reservas | Panel', reservas: reservas.recordset, estados: estados.recordset });
  } catch (err) { next(err); }
});

router.post('/reservas/:id/estado', async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('estado_id', sql.Int, req.body.estado_id)
      .query('UPDATE Reservas SET estado_id = @estado_id WHERE id = @id');
    req.flash('success', 'Estado de la reserva actualizado.');
    res.redirect('/admin/reservas');
  } catch (err) { next(err); }
});

// ---------- Huéspedes ----------
router.get('/huespedes', async (req, res, next) => {
  try {
    const pool = await getPool();
    const huespedes = await pool.request().query(`
      SELECT h.*, COUNT(r.id) AS total_reservas
      FROM Huespedes h LEFT JOIN Reservas r ON r.huesped_id = h.id
      GROUP BY h.id, h.nombres, h.apellidos, h.tipo_documento, h.numero_documento, h.email, h.telefono, h.direccion, h.nacionalidad, h.creado_en
      ORDER BY h.creado_en DESC
    `);
    res.render('admin/huespedes', { titulo: 'Huéspedes | Panel', huespedes: huespedes.recordset });
  } catch (err) { next(err); }
});

// ---------- Mensajes de contacto ----------
router.get('/mensajes', async (req, res, next) => {
  try {
    const pool = await getPool();
    const mensajes = await pool.request().query('SELECT * FROM MensajesContacto ORDER BY creado_en DESC');
    res.render('admin/mensajes', { titulo: 'Mensajes | Panel', mensajes: mensajes.recordset });
  } catch (err) { next(err); }
});

module.exports = router;
