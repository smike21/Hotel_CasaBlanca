const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function getSearchData(body) {
  const checkin = parseDate(body.checkin);
  const checkout = parseDate(body.checkout);
  const huespedes = Number.parseInt(body.huespedes, 10);
  if (!checkin || !checkout || checkout <= checkin || !Number.isInteger(huespedes) || huespedes < 1 || huespedes > 12) return null;
  return { checkin: body.checkin, checkout: body.checkout, huespedes };
}

function nightsBetween(checkin, checkout) {
  return Math.round((parseDate(checkout) - parseDate(checkin)) / 86400000);
}

router.get('/', (req, res) => {
  res.render('public/reserva-buscar', { titulo: 'Reservar | Hotel Casa Blanca' });
});

router.post('/buscar', async (req, res, next) => {
  try {
    const search = getSearchData(req.body);
    if (!search) {
      req.flash('error', 'Verifica las fechas y el número de huéspedes (máximo 12).');
      return res.redirect('/reserva');
    }

    const { checkin, checkout, huespedes } = search;
    const pool = await getPool();
    const disponibles = await pool.request()
      .input('checkin', sql.Date, checkin)
      .input('checkout', sql.Date, checkout)
      .input('huespedes', sql.Int, huespedes)
      .query(`
        SELECT h.id, h.numero, h.piso, t.id AS tipo_id, t.nombre AS tipo_nombre, t.precio_base, t.capacidad,
          (SELECT TOP 1 url FROM FotosHabitacion f WHERE f.tipo_id = t.id ORDER BY orden) AS foto
        FROM Habitaciones h
        JOIN TiposHabitacion t ON t.id = h.tipo_id
        JOIN EstadosHabitacion eh ON eh.id = h.estado_id
        WHERE h.activo = 1 AND t.capacidad >= @huespedes AND eh.nombre <> 'Mantenimiento'
          AND NOT EXISTS (
            SELECT 1 FROM DetalleReserva dr
            JOIN Reservas r ON r.id = dr.reserva_id
            JOIN EstadosReserva er ON er.id = r.estado_id
            WHERE dr.habitacion_id = h.id AND er.nombre <> 'Cancelada'
              AND r.fecha_checkin < @checkout AND r.fecha_checkout > @checkin
          )
        ORDER BY t.precio_base DESC
      `);
    res.render('public/reserva-resultados', {
      titulo: 'Habitaciones disponibles | Hotel Casa Blanca',
      habitaciones: disponibles.recordset,
      checkin, checkout, huespedes
    });
  } catch (err) { next(err); }
});

router.get('/datos', (req, res) => {
  const search = getSearchData(req.query);
  const habitacionId = Number.parseInt(req.query.habitacion_id, 10);
  if (!search || !Number.isInteger(habitacionId)) return res.redirect('/reserva');
  res.render('public/reserva-datos', {
    titulo: 'Datos del huésped | Hotel Casa Blanca',
    habitacion_id: habitacionId,
    ...search
  });
});

router.post('/confirmar', async (req, res, next) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;
  try {
    const {
      habitacion_id, checkin, checkout, num_huespedes,
      nombres, apellidos, tipo_documento, numero_documento, email, telefono
    } = req.body;
    const search = getSearchData({ checkin, checkout, huespedes: num_huespedes });
    const habitacionId = Number.parseInt(habitacion_id, 10);
    const requiredFields = [nombres, apellidos, tipo_documento, numero_documento, email, telefono];
    if (!search || !Number.isInteger(habitacionId) || requiredFields.some((value) => !String(value || '').trim())) {
      const error = new Error('Datos de reserva inválidos.');
      error.isValidationError = true;
      throw error;
    }

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;
    const request = new sql.Request(transaction);
    const existente = await request
      .input('tipo_documento', sql.VarChar, tipo_documento.trim())
      .input('numero_documento', sql.VarChar, numero_documento.trim())
      .query('SELECT id FROM Huespedes WHERE tipo_documento = @tipo_documento AND numero_documento = @numero_documento');

    let huespedId;
    if (existente.recordset.length) {
      huespedId = existente.recordset[0].id;
    } else {
      const nuevo = await new sql.Request(transaction)
        .input('nombres', sql.VarChar, nombres.trim())
        .input('apellidos', sql.VarChar, apellidos.trim())
        .input('tipo_documento', sql.VarChar, tipo_documento.trim())
        .input('numero_documento', sql.VarChar, numero_documento.trim())
        .input('email', sql.VarChar, email.trim().toLowerCase())
        .input('telefono', sql.VarChar, telefono.trim())
        .query(`INSERT INTO Huespedes (nombres, apellidos, tipo_documento, numero_documento, email, telefono)
                OUTPUT INSERTED.id
                VALUES (@nombres, @apellidos, @tipo_documento, @numero_documento, @email, @telefono)`);
      huespedId = nuevo.recordset[0].id;
    }

    // Esta segunda comprobación dentro de la transacción evita reservas duplicadas por concurrencia.
    const habInfo = await new sql.Request(transaction)
      .input('habitacion_id', sql.Int, habitacionId)
      .input('checkin', sql.Date, search.checkin)
      .input('checkout', sql.Date, search.checkout)
      .input('huespedes', sql.Int, search.huespedes)
      .query(`
        SELECT h.id, t.precio_base FROM Habitaciones h WITH (UPDLOCK, HOLDLOCK)
        JOIN TiposHabitacion t ON t.id = h.tipo_id
        JOIN EstadosHabitacion eh ON eh.id = h.estado_id
        WHERE h.id = @habitacion_id AND h.activo = 1 AND t.capacidad >= @huespedes
          AND eh.nombre <> 'Mantenimiento'
          AND NOT EXISTS (
            SELECT 1 FROM DetalleReserva dr
            JOIN Reservas r ON r.id = dr.reserva_id
            JOIN EstadosReserva er ON er.id = r.estado_id
            WHERE dr.habitacion_id = h.id AND er.nombre <> 'Cancelada'
              AND r.fecha_checkin < @checkout AND r.fecha_checkout > @checkin
          )
      `);
    if (!habInfo.recordset.length) {
      const error = new Error('La habitación ya no está disponible para esas fechas.');
      error.isValidationError = true;
      throw error;
    }

    const precioNoche = habInfo.recordset[0].precio_base;
    const noches = nightsBetween(search.checkin, search.checkout);
    const total = precioNoche * noches;
    const codigo = `HCB-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const estadoPendiente = await new sql.Request(transaction).query("SELECT id FROM EstadosReserva WHERE nombre = 'Pendiente'");
    const reserva = await new sql.Request(transaction)
      .input('codigo', sql.VarChar, codigo)
      .input('huesped_id', sql.Int, huespedId)
      .input('estado_id', sql.Int, estadoPendiente.recordset[0].id)
      .input('checkin', sql.Date, search.checkin)
      .input('checkout', sql.Date, search.checkout)
      .input('num_huespedes', sql.Int, search.huespedes)
      .input('total', sql.Decimal(10, 2), total)
      .query(`INSERT INTO Reservas (codigo, huesped_id, estado_id, fecha_checkin, fecha_checkout, num_huespedes, total)
              OUTPUT INSERTED.id VALUES (@codigo, @huesped_id, @estado_id, @checkin, @checkout, @num_huespedes, @total)`);

    await new sql.Request(transaction)
      .input('reserva_id', sql.Int, reserva.recordset[0].id)
      .input('habitacion_id', sql.Int, habitacionId)
      .input('precio_noche', sql.Decimal(10, 2), precioNoche)
      .input('noches', sql.Int, noches)
      .input('subtotal', sql.Decimal(10, 2), total)
      .query('INSERT INTO DetalleReserva (reserva_id, habitacion_id, precio_noche, noches, subtotal) VALUES (@reserva_id, @habitacion_id, @precio_noche, @noches, @subtotal)');

    await transaction.commit();
    res.render('public/reserva-exito', { titulo: 'Reserva confirmada', codigo, total, noches });
  } catch (err) {
    if (transactionStarted) {
      try { await transaction.rollback(); } catch (rollbackError) { console.error('Error al revertir reserva:', rollbackError); }
    }
    if (err.isValidationError) {
      req.flash('error', err.message);
      return res.redirect('/reserva');
    }
    next(err);
  }
});

module.exports = router;
