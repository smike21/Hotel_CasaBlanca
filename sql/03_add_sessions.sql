-- Ejecutar solo en bases creadas antes de añadir las sesiones persistentes.
IF OBJECT_ID('dbo.SesionesWeb', 'U') IS NULL
BEGIN
    CREATE TABLE SesionesWeb (
        sid       VARCHAR(128) PRIMARY KEY,
        data      NVARCHAR(MAX) NOT NULL,
        expira_en DATETIME2 NOT NULL
    );
    CREATE INDEX IX_SesionesWeb_ExpiraEn ON SesionesWeb(expira_en);
END
GO