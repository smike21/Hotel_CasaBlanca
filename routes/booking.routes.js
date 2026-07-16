const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// Paso 1: elegir fechas y buscar disponibilidad
router.get('/', (req, res) => {
  res.render('public/reserva-buscar', { titulo: 'Reservar | Hotel Casa Blanca' });
});

router.post('/buscar', async (req, res, next) => {
  try {
    const { checkin, checkout, huespedes } = req.body;
    if (!checkin || !checkout || new Date(checkout) <= new Date(checkin)) {
      req.flash('error', 'Verifica las fechas de check-in y check-out.');
      return res.redirect('/reserva');
    }
    const pool = await getPool();
    const disponibles = await pool.request()
      .input('checkin', sql.Date, checkin)
      .input('checkout', sql.Date, checkout)
      .query(`
        SELECT h.id, h.numero, h.piso, t.id AS tipo_id, t.nombre AS tipo_nombre, t.precio_base, t.capacidad,
          (SELECT TOP 1 url FROM FotosHabitacion f WHERE f.tipo_id = t.id ORDER BY orden) AS foto
        FROM Habitaciones h
        JOIN TiposHabitacion t ON t.id = h.tipo_id
        WHERE h.activo = 1
          AND h.id NOT IN (
            SELECT dr.habitacion_id FROM DetalleReserva dr
            JOIN Reservas r ON r.id = dr.reserva_id
            WHERE r.estado_id NOT IN (SELECT id FROM EstadosReserva WHERE nombre = 'Cancelada')
              AND r.fecha_checkin < @checkout AND r.fecha_checkout > @checkin
          )
        ORDER BY t.precio_base DESC
      `);
    res.render('public/reserva-resultados', {
      titulo: 'Habitaciones disponibles | Hotel Casa Blanca',
      habitaciones: disponibles.recordset,
      checkin, checkout, huespedes: huespedes || 1
    });
  } catch (err) { next(err); }
});

// Paso 2: formulario de datos del huésped
router.get('/datos', (req, res) => {
  const { habitacion_id, checkin, checkout, huespedes } = req.query;
  if (!habitacion_id || !checkin || !checkout) return res.redirect('/reserva');
  res.render('public/reserva-datos', {
    titulo: 'Datos del huésped | Hotel Casa Blanca',
    habitacion_id, checkin, checkout, huespedes: huespedes || 1
  });
});

// Paso 3: confirmar reserva (crea huésped si no existe + reserva + detalle)
router.post('/confirmar', async (req, res, next) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const {
      habitacion_id, checkin, checkout, num_huespedes,
      nombres, apellidos, tipo_documento, numero_documento, email, telefono
    } = req.body;

    await transaction.begin();
    const request = new sql.Request(transaction);

    // Buscar o crear huésped
    const existente = await request
      .input('tipo_documento', sql.VarChar, tipo_documento)
      .input('numero_documento', sql.VarChar, numero_documento)
      .query('SELECT id FROM Huespedes WHERE tipo_documento = @tipo_documento AND numero_documento = @numero_documento');

    let huespedId;
    if (existente.recordset.length) {
      huespedId = existente.recordset[0].id;
    } else {
      const nuevo = await new sql.Request(transaction)
        .input('nombres', sql.VarChar, nombres)
        .input('apellidos', sql.VarChar, apellidos)
        .input('tipo_documento', sql.VarChar, tipo_documento)
        .input('numero_documento', sql.VarChar, numero_documento)
        .input('email', sql.VarChar, email)
        .input('telefono', sql.VarChar, telefono)
        .query(`INSERT INTO Huespedes (nombres, apellidos, tipo_documento, numero_documento, email, telefono)
                OUTPUT INSERTED.id
                VALUES (@nombres, @apellidos, @tipo_documento, @numero_documento, @email, @telefono)`);
      huespedId = nuevo.recordset[0].id;
    }

    // Precio de la habitación y noches
    const habInfo = await new sql.Request(transaction)
      .input('habitacion_id', sql.Int, habitacion_id)
      .query(`SELECT h.id, t.precio_base FROM Habitaciones h JOIN TiposHabitacion t ON t.id = h.tipo_id WHERE h.id = @habitacion_id`);
    const precioNoche = habInfo.recordset[0].precio_base;
    const noches = Math.round((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
    const total = precioNoche * noches;
    const codigo = `HCB-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const estadoPendiente = await new sql.Request(transaction)
      .query(`SELECT id FROM EstadosReserva WHERE nombre = 'Pendiente'`);

    const reserva = await new sql.Request(transaction)
      .input('codigo', sql.VarChar, codigo)
      .input('huesped_id', sql.Int, huespedId)
      .input('estado_id', sql.Int, estadoPendiente.recordset[0].id)
      .input('checkin', sql.Date, checkin)
      .input('checkout', sql.Date, checkout)
      .input('num_huespedes', sql.Int, num_huespedes || 1)
      .input('total', sql.Decimal(10, 2), total)
      .query(`INSERT INTO Reservas (codigo, huesped_id, estado_id, fecha_checkin, fecha_checkout, num_huespedes, total)
              OUTPUT INSERTED.id
              VALUES (@codigo, @huesped_id, @estado_id, @checkin, @checkout, @num_huespedes, @total)`);
    const reservaId = reserva.recordset[0].id;

    await new sql.Request(transaction)
      .input('reserva_id', sql.Int, reservaId)
      .input('habitacion_id', sql.Int, habitacion_id)
      .input('precio_noche', sql.Decimal(10, 2), precioNoche)
      .input('noches', sql.Int, noches)
      .input('subtotal', sql.Decimal(10, 2), total)
      .query(`INSERT INTO DetalleReserva (reserva_id, habitacion_id, precio_noche, noches, subtotal)
              VALUES (@reserva_id, @habitacion_id, @precio_noche, @noches, @subtotal)`);

    await transaction.commit();
    res.render('public/reserva-exito', { titulo: 'Reserva confirmada', codigo, total, noches });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
});

module.exports = router;
