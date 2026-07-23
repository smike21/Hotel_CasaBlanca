require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const flash = require('connect-flash');
const SqlSessionStore = require('./config/session-store');

const publicRoutes = require('./routes/public.routes');
const bookingRoutes = require('./routes/booking.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET es obligatorio en producción.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secreto-temporal',
    resave: false,
    saveUninitialized: false,
    store: new SqlSessionStore(),
    name: 'hcb.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 4
    }
  })
);
app.use(flash());

// Protección CSRF para todos los formularios que cambian datos.
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const token = req.body?._csrf || req.get('x-csrf-token');
  if (token && token === req.session.csrfToken) return next();
  req.flash('error', 'El formulario venció. Inténtalo nuevamente.');
  return res.status(403).redirect(req.get('referer') || '/');
});

// Variables disponibles en todas las vistas
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.csrfToken = req.session.csrfToken;
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
  res.status(500).render('public/error', {
    titulo: 'Error',
    mensaje: process.env.NODE_ENV === 'production'
      ? 'No pudimos procesar tu solicitud. Inténtalo nuevamente en unos minutos.'
      : err.message
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hotel Casa Blanca corriendo en http://localhost:${PORT}`));
