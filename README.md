# Hotel Casa Blanca — Sitio web + Panel administrativo

Proyecto para **Hotel Casa Blanca** (La Unión, Huánuco): sitio informativo, motor de reservas online y panel administrativo, con **SQL Server** como gestor de base de datos, pensado para desplegar en **Railway**.

## Stack

- **Backend:** Node.js + Express
- **Vistas:** EJS + CSS propio (sin frameworks, diseño inspirado en la portada del documento)
- **Base de datos:** SQL Server (`mssql`), pensada para el plugin de SQL Server de Railway
- **Sesiones:** `express-session` + `connect-flash`
- **Contraseñas:** `bcrypt`

## Estructura

```
hotel-casablanca/
├── server.js                # punto de entrada
├── config/db.js             # conexión a SQL Server (pool)
├── middleware/auth.js        # requireLogin / requireRole
├── routes/
│   ├── public.routes.js      # home, habitaciones, nosotros, contacto
│   ├── booking.routes.js     # flujo de reserva en 3 pasos
│   ├── auth.routes.js        # login/logout admin
│   └── admin.routes.js       # panel: dashboard, CRUD, reservas
├── views/                    # EJS (public/, admin/, auth/, partials/)
├── public/css/style.css      # sistema de diseño
├── sql/
│   ├── 01_schema.sql         # 20 tablas
│   └── 02_seed.sql           # catálogos + datos de ejemplo
└── scripts/hash-password.js  # generador de hash bcrypt
```

## Base de datos (20 tablas)

Catálogos: `Roles`, `EstadosHabitacion`, `TiposHabitacion`, `EstadosReserva`, `MetodosPago`, `Temporadas`.
Operación: `Usuarios`, `Habitaciones`, `FotosHabitacion`, `PreciosTemporada`, `Huespedes`, `Reservas`, `DetalleReserva`, `Servicios`, `ReservaServicios`, `Pagos`, `Comprobantes`, `Resenas`, `Configuracion`, `AuditoriaAccesos`, `MensajesContacto`.

Ejecuta en este orden contra tu base en Railway:
```sql
-- desde sqlcmd, Azure Data Studio o el cliente que uses
:r sql/01_schema.sql
:r sql/02_seed.sql
```

## Cómo correrlo localmente

```bash
npm install
cp .env.example .env      # y completa tus credenciales de Railway
node scripts/hash-password.js "TuPasswordSegura"   # genera un hash real
# copia el hash generado y actualízalo en Usuarios (o edita 02_seed.sql antes de correrlo)
npm run dev                # o: npm start
```

Abre `http://localhost:3000`. El panel admin está en `/admin/login`.

> ⚠️ El hash de ejemplo en `02_seed.sql` **no es válido**: genera el tuyo con `scripts/hash-password.js` y actualiza el registro antes de usarlo en producción.

## Desplegar en Railway

1. Crea un proyecto en Railway y añade el plugin/base de datos **SQL Server** (o tu propia instancia).
2. Copia las credenciales (`server`, `puerto`, `usuario`, `password`, `database`) a las variables de entorno del servicio web en Railway (mismos nombres que en `.env.example`).
3. Conecta este repositorio como servicio Node — Railway detecta `npm start` automáticamente.
4. Corre `01_schema.sql` y `02_seed.sql` contra la base de Railway (puedes hacerlo desde tu máquina con `sqlcmd` apuntando al host público que te da Railway, o con Azure Data Studio).
5. Genera el hash real del admin y actualízalo antes de anunciar el panel.

## Flujo de reservas (público)

1. `/reserva` → elige check-in/check-out/huéspedes.
2. `/reserva/buscar` → muestra habitaciones sin traslape de fechas (excluye reservas no canceladas).
3. `/reserva/datos` → datos del huésped.
4. `/reserva/confirmar` → crea/reutiliza huésped, crea la reserva y el detalle dentro de una transacción, calcula el total según noches × precio base.

## Panel administrativo (`/admin`)

- **Dashboard:** ocupación, check-ins de hoy, pendientes, ingresos del mes, últimas reservas.
- **Reservas:** listado completo, cambio de estado (Pendiente → Confirmada → CheckIn → CheckOut / Cancelada).
- **Habitaciones:** alta, cambio de estado (Disponible/Ocupada/Limpieza/Mantenimiento), baja lógica.
- **Tipos de habitación:** alta de nuevos tipos y precios base.
- **Huéspedes:** historial de huéspedes registrados.
- **Mensajes:** bandeja del formulario de contacto.

Roles: `Administrador` (acceso total), `Recepcionista` y `Mantenimiento` (acceso limitado — ajusta `requireRole(...)` en `admin.routes.js` según lo que cada rol deba tocar).

## Siguientes pasos sugeridos

- Subir fotos reales a `FotosHabitacion` y servirlas desde `/public/img/habitaciones/`.
- Añadir pasarela de pago real (Yape/Plin API, Culqi, etc.) conectada a la tabla `Pagos`.
- Generar comprobantes en PDF a partir de `Comprobantes`.
- Añadir 2FA o rate-limiting al login del panel antes de producción.
