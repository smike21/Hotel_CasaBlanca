-- ============================================================
-- Hotel Casa Blanca - Esquema de Base de Datos (SQL Server)
-- ============================================================
-- Ejecutar en el orden en que aparecen las tablas (respeta FKs)

IF DB_ID('HotelCasaBlanca') IS NULL
BEGIN
    PRINT 'Ejecutar CREATE DATABASE HotelCasaBlanca desde el servidor si aplica.';
END
GO

-- ---------------------------------------------------------
-- 1. Catálogos base
-- ---------------------------------------------------------

CREATE TABLE Roles (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    nombre        VARCHAR(50)  NOT NULL UNIQUE, -- Administrador, Recepcionista, Mantenimiento
    descripcion   VARCHAR(200) NULL
);
GO

CREATE TABLE Usuarios (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    rol_id        INT NOT NULL FOREIGN KEY REFERENCES Roles(id),
    nombres       VARCHAR(100) NOT NULL,
    apellidos     VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo        BIT NOT NULL DEFAULT 1,
    creado_en     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    actualizado_en DATETIME2 NULL
);
GO

CREATE TABLE EstadosHabitacion (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    nombre  VARCHAR(30) NOT NULL UNIQUE -- Disponible, Ocupada, Limpieza, Mantenimiento
);
GO

CREATE TABLE TiposHabitacion (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    nombre        VARCHAR(50) NOT NULL UNIQUE, -- Matrimonial, Doble, Individual
    descripcion   VARCHAR(300) NULL,
    capacidad     INT NOT NULL,
    precio_base   DECIMAL(10,2) NOT NULL
);
GO

CREATE TABLE Habitaciones (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    numero        VARCHAR(10) NOT NULL UNIQUE,
    tipo_id       INT NOT NULL FOREIGN KEY REFERENCES TiposHabitacion(id),
    estado_id     INT NOT NULL FOREIGN KEY REFERENCES EstadosHabitacion(id),
    piso          INT NOT NULL DEFAULT 1,
    descripcion   VARCHAR(300) NULL,
    activo        BIT NOT NULL DEFAULT 1
);
GO

CREATE TABLE FotosHabitacion (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    tipo_id       INT NOT NULL FOREIGN KEY REFERENCES TiposHabitacion(id),
    url           VARCHAR(400) NOT NULL,
    orden         INT NOT NULL DEFAULT 0
);
GO

CREATE TABLE Temporadas (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    nombre        VARCHAR(80) NOT NULL, -- Fiestas patronales, Semana Santa, etc.
    fecha_inicio  DATE NOT NULL,
    fecha_fin     DATE NOT NULL
);
GO

CREATE TABLE PreciosTemporada (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    tipo_habitacion_id  INT NOT NULL FOREIGN KEY REFERENCES TiposHabitacion(id),
    temporada_id        INT NOT NULL FOREIGN KEY REFERENCES Temporadas(id),
    precio              DECIMAL(10,2) NOT NULL
);
GO

-- ---------------------------------------------------------
-- 2. Huéspedes y reservas
-- ---------------------------------------------------------

CREATE TABLE Huespedes (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    nombres           VARCHAR(100) NOT NULL,
    apellidos         VARCHAR(100) NOT NULL,
    tipo_documento    VARCHAR(20)  NOT NULL, -- DNI, Pasaporte, CE
    numero_documento  VARCHAR(20)  NOT NULL,
    email             VARCHAR(150) NULL,
    telefono          VARCHAR(20)  NULL,
    direccion         VARCHAR(200) NULL,
    nacionalidad      VARCHAR(60)  NULL DEFAULT 'Peruana',
    creado_en         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Huesped_Documento UNIQUE (tipo_documento, numero_documento)
);
GO

CREATE TABLE EstadosReserva (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    nombre  VARCHAR(30) NOT NULL UNIQUE -- Pendiente, Confirmada, CheckIn, CheckOut, Cancelada
);
GO

CREATE TABLE Reservas (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    codigo         VARCHAR(20) NOT NULL UNIQUE, -- ej. HCB-2026-000123
    huesped_id     INT NOT NULL FOREIGN KEY REFERENCES Huespedes(id),
    estado_id      INT NOT NULL FOREIGN KEY REFERENCES EstadosReserva(id),
    fecha_checkin  DATE NOT NULL,
    fecha_checkout DATE NOT NULL,
    num_huespedes  INT NOT NULL DEFAULT 1,
    total          DECIMAL(10,2) NOT NULL DEFAULT 0,
    notas          VARCHAR(500) NULL,
    creado_por     INT NULL FOREIGN KEY REFERENCES Usuarios(id), -- NULL = reserva online
    creado_en      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CHECK (fecha_checkout > fecha_checkin)
);
GO

CREATE TABLE DetalleReserva (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    reserva_id    INT NOT NULL FOREIGN KEY REFERENCES Reservas(id),
    habitacion_id INT NOT NULL FOREIGN KEY REFERENCES Habitaciones(id),
    precio_noche  DECIMAL(10,2) NOT NULL,
    noches        INT NOT NULL,
    subtotal      DECIMAL(10,2) NOT NULL
);
GO

CREATE TABLE Servicios (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    nombre        VARCHAR(80) NOT NULL, -- Desayuno, Lavandería, Cochera, etc.
    descripcion   VARCHAR(300) NULL,
    precio        DECIMAL(10,2) NOT NULL,
    activo        BIT NOT NULL DEFAULT 1
);
GO

CREATE TABLE ReservaServicios (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    reserva_id    INT NOT NULL FOREIGN KEY REFERENCES Reservas(id),
    servicio_id   INT NOT NULL FOREIGN KEY REFERENCES Servicios(id),
    cantidad      INT NOT NULL DEFAULT 1,
    subtotal      DECIMAL(10,2) NOT NULL
);
GO

-- ---------------------------------------------------------
-- 3. Pagos y comprobantes
-- ---------------------------------------------------------

CREATE TABLE MetodosPago (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    nombre  VARCHAR(40) NOT NULL UNIQUE -- Efectivo, Yape/Plin, Transferencia, Tarjeta
);
GO

CREATE TABLE Pagos (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    reserva_id      INT NOT NULL FOREIGN KEY REFERENCES Reservas(id),
    metodo_pago_id  INT NOT NULL FOREIGN KEY REFERENCES MetodosPago(id),
    monto           DECIMAL(10,2) NOT NULL,
    fecha_pago      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    referencia      VARCHAR(100) NULL,
    estado          VARCHAR(20) NOT NULL DEFAULT 'Confirmado' -- Confirmado, Rechazado, Pendiente
);
GO

CREATE TABLE Comprobantes (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    reserva_id    INT NOT NULL FOREIGN KEY REFERENCES Reservas(id),
    tipo          VARCHAR(20) NOT NULL DEFAULT 'Boleta', -- Boleta, Factura
    serie         VARCHAR(10) NOT NULL DEFAULT 'B001',
    numero        INT NOT NULL,
    fecha_emision DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    monto_total   DECIMAL(10,2) NOT NULL
);
GO

-- ---------------------------------------------------------
-- 4. Reseñas, configuración y auditoría
-- ---------------------------------------------------------

CREATE TABLE Resenas (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    huesped_id    INT NOT NULL FOREIGN KEY REFERENCES Huespedes(id),
    reserva_id    INT NULL FOREIGN KEY REFERENCES Reservas(id),
    calificacion  INT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario    VARCHAR(600) NULL,
    fecha         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    aprobado      BIT NOT NULL DEFAULT 0
);
GO

CREATE TABLE Configuracion (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    clave   VARCHAR(80) NOT NULL UNIQUE,
    valor   VARCHAR(500) NOT NULL
);
GO

CREATE TABLE AuditoriaAccesos (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    usuario_id  INT NULL FOREIGN KEY REFERENCES Usuarios(id),
    accion      VARCHAR(150) NOT NULL,
    fecha       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ip          VARCHAR(50) NULL
);
GO

CREATE TABLE MensajesContacto (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    nombre      VARCHAR(120) NOT NULL,
    email       VARCHAR(150) NOT NULL,
    telefono    VARCHAR(20) NULL,
    mensaje     VARCHAR(1000) NOT NULL,
    leido       BIT NOT NULL DEFAULT 0,
    creado_en   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Sesiones persistentes del panel y formularios públicos.
CREATE TABLE SesionesWeb (
    sid       VARCHAR(128) PRIMARY KEY,
    data      NVARCHAR(MAX) NOT NULL,
    expira_en DATETIME2 NOT NULL
);
GO

-- Índices útiles para disponibilidad y búsquedas
CREATE INDEX IX_Reservas_Fechas ON Reservas(fecha_checkin, fecha_checkout);
CREATE INDEX IX_DetalleReserva_Habitacion ON DetalleReserva(habitacion_id);
CREATE INDEX IX_Habitaciones_Tipo ON Habitaciones(tipo_id);
CREATE INDEX IX_SesionesWeb_ExpiraEn ON SesionesWeb(expira_en);
GO
Adapta, eso es el 01_schema