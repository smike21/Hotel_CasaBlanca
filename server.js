require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');

const publicRoutes = require('./routes/public.routes');
const bookingRoutes = require('./routes/booking.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secreto-temporal',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 horas
  })
);
app.use(flash());

// Variables disponibles en todas las vistas
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

app.use('/', publicRoutes);
app.use('/reserva', bookingRoutes);
app.use('/admin', authRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('public/404', { titulo: 'Página no encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('public/error', { titulo: 'Error', mensaje: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hotel Casa Blanca corriendo en http://localhost:${PORT}`));
