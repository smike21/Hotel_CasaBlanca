function requireLogin(req, res, next) {
  if (!req.session.usuario) {
    req.flash('error', 'Debes iniciar sesión para continuar.');
    return res.redirect('/admin/login');
  }
  next();
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session.usuario || !rolesPermitidos.includes(req.session.usuario.rol)) {
      req.flash('error', 'No tienes permisos para acceder a esa sección.');
      return res.redirect('/admin/dashboard');
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
