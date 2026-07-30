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

router.post('/habitaciones/:id/estado', requireRole('Administrador', 'Recepcionista', 'Mantenimiento'), async (req, res, next) => {
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

router.post('/tipos-habitacion/:id', requireRole('Administrador'), async (req, res, next) => {
  try {
    const { nombre, descripcion, capacidad, precio_base } = req.body;
    const id = Number.parseInt(req.params.id, 10);
    const price = Number.parseFloat(precio_base);
    const guests = Number.parseInt(capacidad, 10);
    if (!id || !nombre?.trim() || !Number.isInteger(guests) || guests < 1 || !Number.isFinite(price) || price < 0) {
      req.flash('error', 'Revisa los datos del tipo de habitación.');
      return res.redirect('/admin/tipos-habitacion');
    }
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.VarChar, nombre.trim())
      .input('descripcion', sql.VarChar, descripcion?.trim() || null)
      .input('capacidad', sql.Int, guests)
      .input('precio_base', sql.Decimal(10, 2), price)
      .query(`UPDATE TiposHabitacion SET nombre=@nombre, descripcion=@descripcion, capacidad=@capacidad, precio_base=@precio_base WHERE id=@id`);
    req.flash('success', 'Tarifa y datos actualizados. Las reservas ya creadas conservan su precio pactado.');
    res.redirect('/admin/tipos-habitacion');
  } catch (err) { next(err); }
});

// ---------- Reservas ----------
router.get('/reservas', async (req, res, next) => {
  try {
    const pool = await getPool();
    const { estado, desde, hasta, buscar } = req.query;
    const request = pool.request();
    const filters = [];
    if (Number.isInteger(Number(estado)) && Number(estado) > 0) {
      filters.push('r.estado_id = @estado'); request.input('estado', sql.Int, Number(estado));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(desde || '')) { filters.push('r.fecha_checkin >= @desde'); request.input('desde', sql.Date, desde); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) { filters.push('r.fecha_checkout <= @hasta'); request.input('hasta', sql.Date, hasta); }
    if (buscar?.trim()) { filters.push("(r.codigo LIKE @buscar OR h.nombres LIKE @buscar OR h.apellidos LIKE @buscar)"); request.input('buscar', sql.VarChar, `%${buscar.trim()}%`); }
    const reservas = await request.query(`
      SELECT r.*, h.nombres, h.apellidos, e.nombre AS estado_nombre,
        h.email, h.telefono, STRING_AGG(hab.numero, ', ') AS habitaciones,
        ISNULL((SELECT SUM(p.monto) FROM Pagos p WHERE p.reserva_id = r.id AND p.estado = 'Confirmado'), 0) AS pagado
      FROM Reservas r
      JOIN Huespedes h ON h.id = r.huesped_id
      JOIN EstadosReserva e ON e.id = r.estado_id
      LEFT JOIN DetalleReserva dr ON dr.reserva_id = r.id
      LEFT JOIN Habitaciones hab ON hab.id = dr.habitacion_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      GROUP BY r.id, r.codigo, r.huesped_id, r.estado_id, r.fecha_checkin, r.fecha_checkout,
        r.num_huespedes, r.total, r.notas, r.creado_por, r.creado_en, h.nombres, h.apellidos, h.email, h.telefono, e.nombre
      ORDER BY r.creado_en DESC
    `);
    const estados = await pool.request().query('SELECT * FROM EstadosReserva ORDER BY id');
    const metodos = await pool.request().query('SELECT * FROM MetodosPago ORDER BY nombre');
    res.render('admin/reservas', { titulo: 'Reservas | Panel', reservas: reservas.recordset, estados: estados.recordset, metodos: metodos.recordset, filtros: { estado: estado || '', desde: desde || '', hasta: hasta || '', buscar: buscar || '' } });
  } catch (err) { next(err); }
});

router.post('/reservas/:id/estado', requireRole('Administrador', 'Recepcionista'), async (req, res, next) => {
  try {
    const pool = await getPool();
    const reservaId = Number.parseInt(req.params.id, 10);
    const estadoId = Number.parseInt(req.body.estado_id, 10);
    const estado = await pool.request().input('id', sql.Int, estadoId).query('SELECT nombre FROM EstadosReserva WHERE id = @id');
    if (!reservaId || !estado.recordset.length) {
      req.flash('error', 'Estado de reserva inválido.');
      return res.redirect('/admin/reservas');
    }
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('estado_id', sql.Int, estadoId)
      .query('UPDATE Reservas SET estado_id = @estado_id WHERE id = @id');
    const roomState = estado.recordset[0].nombre === 'CheckIn' ? 'Ocupada'
      : estado.recordset[0].nombre === 'CheckOut' ? 'Limpieza'
        : estado.recordset[0].nombre === 'Cancelada' ? 'Disponible' : null;
    if (roomState) {
      await pool.request().input('reserva_id', sql.Int, reservaId).input('estado', sql.VarChar, roomState).query(`
        UPDATE h SET estado_id = eh.id FROM Habitaciones h
        JOIN DetalleReserva dr ON dr.habitacion_id = h.id
        JOIN EstadosHabitacion eh ON eh.nombre = @estado
        WHERE dr.reserva_id = @reserva_id
      `);
    }
    req.flash('success', `Reserva actualizada a ${estado.recordset[0].nombre}.`);
    res.redirect('/admin/reservas');
  } catch (err) { next(err); }
});

router.post('/reservas/:id/pagos', requireRole('Administrador', 'Recepcionista'), async (req, res, next) => {
  try {
    const reservaId = Number.parseInt(req.params.id, 10);
    const metodoId = Number.parseInt(req.body.metodo_pago_id, 10);
    const monto = Number.parseFloat(req.body.monto);
    const referencia = req.body.referencia?.trim() || null;
    if (!reservaId || !metodoId || !Number.isFinite(monto) || monto <= 0) {
      req.flash('error', 'Ingresa un pago válido.');
      return res.redirect('/admin/reservas');
    }
    const pool = await getPool();
    await pool.request().input('reserva_id', sql.Int, reservaId).input('metodo_pago_id', sql.Int, metodoId)
      .input('monto', sql.Decimal(10, 2), monto).input('referencia', sql.VarChar, referencia)
      .query(`INSERT INTO Pagos (reserva_id, metodo_pago_id, monto, referencia) VALUES (@reserva_id, @metodo_pago_id, @monto, @referencia)`);
    req.flash('success', 'Pago registrado correctamente.');
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

router.post('/mensajes/:id/leido', requireRole('Administrador', 'Recepcionista'), async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query('UPDATE MensajesContacto SET leido = 1 WHERE id = @id');
    req.flash('success', 'Mensaje marcado como leído.');
    res.redirect('/admin/mensajes');
  } catch (err) { next(err); }
});

// ---------- Datos del hotel ----------
router.get('/configuracion', requireRole('Administrador'), async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT clave, valor FROM Configuracion');
    const configuracion = Object.fromEntries(result.recordset.map((item) => [item.clave, item.valor]));
    res.render('admin/configuracion', { titulo: 'Configuración | Panel', configuracion });
  } catch (err) { next(err); }
});

router.post('/configuracion', requireRole('Administrador'), async (req, res, next) => {
  try {
    const keys = ['nombre_hotel', 'ubicacion', 'telefono_contacto', 'email_contacto', 'checkin_hora', 'checkout_hora'];
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    for (const key of keys) {
      const value = String(req.body[key] || '').trim();
      if (!value || value.length > 500) throw new Error('Completa todos los datos del hotel.');
      await new sql.Request(transaction).input('clave', sql.VarChar, key).input('valor', sql.VarChar, value).query(`
        MERGE Configuracion AS target USING (SELECT @clave AS clave, @valor AS valor) AS source ON target.clave = source.clave
        WHEN MATCHED THEN UPDATE SET valor = source.valor
        WHEN NOT MATCHED THEN INSERT (clave, valor) VALUES (source.clave, source.valor);
      `);
    }
    await transaction.commit();
    req.flash('success', 'Datos de contacto y horarios actualizados.');
    res.redirect('/admin/configuracion');
  } catch (err) { next(err); }
});

module.exports = router;
