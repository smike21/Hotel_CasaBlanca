// Uso: node scripts/hash-password.js "TuPasswordAqui"
const bcrypt = require('bcrypt');
const password = process.argv[2];

if (!password) {
  console.log('Uso: node scripts/hash-password.js "TuPassword"');
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log('\nHash generado (cópialo en la columna password_hash de Usuarios):\n');
  console.log(hash);
  console.log('\nEjemplo de UPDATE:\n');
  console.log(`UPDATE Usuarios SET password_hash = '${hash}' WHERE email = 'admin@hotelcasablanca.pe';`);
});
