-- ============================================================
-- Datos iniciales (catálogos + contenido de ejemplo)
-- ============================================================

INSERT INTO Roles (nombre, descripcion) VALUES
('Administrador', 'Acceso total al panel: habitaciones, reservas, usuarios y reportes'),
('Recepcionista', 'Gestiona reservas, check-in/check-out y huéspedes'),
('Mantenimiento', 'Actualiza el estado de limpieza/mantenimiento de habitaciones');
GO

-- Credenciales por defecto: admin@hotelcasablanca.pe / CasaBlanca2026
INSERT INTO Usuarios (rol_id, nombres, apellidos, email, password_hash) VALUES
(1, 'Sly', 'Simeón Chávez', 'admin@hotelcasablanca.pe', '$2b$10$0GuajFZd9mp7I3MYX8cDOe.Mep9tKcDf8TWqtcaQFCK0EK.kV2KTC');
GO

INSERT INTO EstadosHabitacion (nombre) VALUES ('Disponible'), ('Ocupada'), ('Limpieza'), ('Mantenimiento');
GO

INSERT INTO TiposHabitacion (nombre, descripcion, capacidad, precio_base) VALUES
('Matrimonial', 'Habitación con una cama de dos plazas, ideal para parejas.', 2, 120.00),
('Doble', 'Habitación con dos camas de plaza y media.', 2, 100.00),
('Individual', 'Habitación con una cama de plaza y media, ideal para viajeros solos.', 1, 70.00);
GO

-- 14 habitaciones repartidas en 2 pisos
INSERT INTO Habitaciones (numero, tipo_id, estado_id, piso, descripcion) VALUES
('101', 1, 1, 1, 'Vista al patio interior'),
('102', 1, 1, 1, 'Vista a la calle principal'),
('103', 2, 1, 1, NULL),
('104', 2, 1, 1, NULL),
('105', 3, 1, 1, NULL),
('106', 3, 1, 1, NULL),
('107', 1, 1, 1, NULL),
('201', 1, 1, 2, 'Balcón privado'),
('202', 2, 1, 2, 'Balcón privado'),
('203', 2, 1, 2, NULL),
('204', 3, 1, 2, NULL),
('205', 3, 1, 2, NULL),
('206', 1, 1, 2, NULL),
('207', 2, 1, 2, NULL);
GO

INSERT INTO Servicios (nombre, descripcion, precio) VALUES
('Desayuno buffet', 'Desayuno continental incluido por huésped', 15.00),
('Cochera', 'Estacionamiento privado techado', 10.00),
('Lavandería', 'Servicio de lavado y planchado por kilo', 12.00),
('Traslado aeropuerto/terminal', 'Movilidad desde/hacia el terminal terrestre de La Unión', 25.00);
GO

INSERT INTO MetodosPago (nombre) VALUES ('Efectivo'), ('Yape/Plin'), ('Transferencia bancaria'), ('Tarjeta');
GO

INSERT INTO EstadosReserva (nombre) VALUES ('Pendiente'), ('Confirmada'), ('CheckIn'), ('CheckOut'), ('Cancelada');
GO

INSERT INTO Configuracion (clave, valor) VALUES
('nombre_hotel', 'Hotel Casa Blanca'),
('ubicacion', 'La Unión, Huánuco, Perú'),
('telefono_contacto', '+51 999 999 999'),
('email_contacto', 'contacto@hotelcasablanca.pe'),
('checkin_hora', '14:00'),
('checkout_hora', '11:00');
GO