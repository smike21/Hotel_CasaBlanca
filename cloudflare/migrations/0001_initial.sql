PRAGMA foreign_keys = ON;

CREATE TABLE Roles (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE);
INSERT INTO Roles (id, nombre) VALUES (1, 'Administrador'), (2, 'Recepcionista'), (3, 'Mantenimiento');

CREATE TABLE Usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, rol_id INTEGER NOT NULL REFERENCES Roles(id), nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE EstadosHabitacion (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE);
INSERT INTO EstadosHabitacion VALUES (1, 'Disponible'), (2, 'Ocupada'), (3, 'Limpieza'), (4, 'Mantenimiento');
CREATE TABLE TiposHabitacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, descripcion TEXT, capacidad INTEGER NOT NULL,
  precio_base REAL NOT NULL
);
INSERT INTO TiposHabitacion (nombre, descripcion, capacidad, precio_base) VALUES
 ('Matrimonial', 'Habitación con una cama de dos plazas, ideal para parejas.', 2, 120),
 ('Doble', 'Habitación con dos camas de plaza y media.', 2, 100),
 ('Individual', 'Habitación con una cama de plaza y media, ideal para viajeros solos.', 1, 70);
CREATE TABLE Habitaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, tipo_id INTEGER NOT NULL REFERENCES TiposHabitacion(id),
  estado_id INTEGER NOT NULL REFERENCES EstadosHabitacion(id), piso INTEGER NOT NULL DEFAULT 1, activo INTEGER NOT NULL DEFAULT 1
);
INSERT INTO Habitaciones (numero,tipo_id,estado_id,piso) VALUES
 ('101',1,1,1),('102',1,1,1),('103',2,1,1),('104',2,1,1),('105',3,1,1),('106',3,1,1),('107',1,1,1),
 ('201',1,1,2),('202',2,1,2),('203',2,1,2),('204',3,1,2),('205',3,1,2),('206',1,1,2),('207',2,1,2);
CREATE TABLE FotosHabitacion (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo_id INTEGER NOT NULL REFERENCES TiposHabitacion(id), url TEXT NOT NULL, orden INTEGER NOT NULL DEFAULT 0);
INSERT INTO FotosHabitacion (tipo_id,url) VALUES (1,'/img/portada-hotel.png'),(2,'/img/portada-hotel.png'),(3,'/img/portada-hotel.png');
CREATE TABLE EstadosReserva (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE);
INSERT INTO EstadosReserva VALUES (1,'Pendiente'),(2,'Confirmada'),(3,'CheckIn'),(4,'CheckOut'),(5,'Cancelada');
CREATE TABLE Huespedes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombres TEXT NOT NULL, apellidos TEXT NOT NULL, tipo_documento TEXT NOT NULL, numero_documento TEXT NOT NULL, email TEXT, telefono TEXT, creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tipo_documento,numero_documento));
CREATE TABLE Reservas (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, huesped_id INTEGER NOT NULL REFERENCES Huespedes(id), estado_id INTEGER NOT NULL REFERENCES EstadosReserva(id), fecha_checkin TEXT NOT NULL, fecha_checkout TEXT NOT NULL, num_huespedes INTEGER NOT NULL, total REAL NOT NULL, creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE DetalleReserva (id INTEGER PRIMARY KEY AUTOINCREMENT, reserva_id INTEGER NOT NULL REFERENCES Reservas(id), habitacion_id INTEGER NOT NULL REFERENCES Habitaciones(id), precio_noche REAL NOT NULL, noches INTEGER NOT NULL, subtotal REAL NOT NULL);
CREATE TABLE MensajesContacto (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, email TEXT NOT NULL, telefono TEXT, mensaje TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE SesionesWeb (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expira_en TEXT NOT NULL);
CREATE INDEX IX_Reservas_Fechas ON Reservas(fecha_checkin, fecha_checkout);
CREATE INDEX IX_DetalleReserva_Habitacion ON DetalleReserva(habitacion_id);
