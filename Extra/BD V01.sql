Aquí tienes el código SQL completo, ajustado con la sintaxis específica de PostgreSQL para pgAdmin 4.

Las principales diferencias son:

INT AUTO_INCREMENT se reemplaza por SERIAL, que es la forma de PostgreSQL de crear una columna de entero autoincremental.

DATETIME se reemplaza por TIMESTAMP, que es el tipo de dato equivalente en PostgreSQL.

Código SQL para pgAdmin 4 (PostgreSQL)
SQL

/*
-- =============================================
-- Sección 1: Usuarios y Agentes
-- =============================================
*/

-- Tabla para los clientes que se registran
CREATE TABLE Clientes (
    ClienteID SERIAL PRIMARY KEY,
    Nombre VARCHAR(100) NOT NULL,
    Apellido VARCHAR(100) NOT NULL,
    Email VARCHAR(255) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL, -- Usar bcrypt o Argon2
    Telefono VARCHAR(20),
    FechaDeRegistro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MODIFICADA: Tabla para los agentes de ventas (se quita TasaComision)
CREATE TABLE AgentesDeVentas (
    AgenteID SERIAL PRIMARY KEY,
    Nombre VARCHAR(100) NOT NULL,
    Apellido VARCHAR(100) NOT NULL,
    Email VARCHAR(255) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    CodigoAgente VARCHAR(50) NOT NULL UNIQUE, -- Código para registrar comisiones
    Activo BOOLEAN DEFAULT TRUE
);

/*
-- =============================================
-- Sección 2: Catálogo y Productos
-- =============================================
*/

-- Para organizar los productos (Ej: "Navidad 2025", "Natural", "Lisas")
CREATE TABLE Categorias (
    CategoriaID SERIAL PRIMARY KEY,
    Nombre VARCHAR(100) NOT NULL,
    Descripcion TEXT,
    ParentCategoriaID INT, -- Para subcategorías (Ej: "Cubo" dentro de "Navidad")
    FOREIGN KEY (ParentCategoriaID) REFERENCES Categorias(CategoriaID)
);

-- La tabla principal de productos
CREATE TABLE Productos (
    ProductoID SERIAL PRIMARY KEY,
    CategoriaID INT,
    SKU VARCHAR(50) NOT NULL UNIQUE, -- El "Código" (Ej: "FF-0101")
    NombreProducto VARCHAR(255) NOT NULL, -- (Ej: "Cubo LOVE")
    Descripcion TEXT,
    Dimensiones VARCHAR(100), -- (Ej: "10x10 cm")
    
    -- Este es tu costo interno por 1 pieza
    CostoUnitario DECIMAL(10, 2) NOT NULL, 
    
    -- Esto es lo que ve el cliente
    PiezasPorPaquete INT NOT NULL, -- (Ej: 12)
    PrecioPaquete DECIMAL(10, 2) NOT NULL, -- Precio de venta del paquete
    
    -- El stock debe representar el número de PAQUETES
    Stock INT NOT NULL DEFAULT 0, 
    
    FOREIGN KEY (CategoriaID) REFERENCES Categorias(CategoriaID)
);

-- Tabla para múltiples imágenes por producto
CREATE TABLE Producto_Imagenes (
    ImagenID SERIAL PRIMARY KEY,
    ProductoID INT NOT NULL,
    URL_Imagen VARCHAR(1024) NOT NULL, -- O la ruta en tu servidor
    TextoAlternativo VARCHAR(255), -- Para accesibilidad (SEO)
    Orden INT DEFAULT 0, -- 0=Principal, 1=Segunda, etc.
    FOREIGN KEY (ProductoID) REFERENCES Productos(ProductoID)
);

/*
-- =============================================
-- Sección 3: Carrito de Compra
-- =============================================
*/

-- Cada cliente tiene un único carrito activo
CREATE TABLE CarritoDeCompra (
    CarritoID SERIAL PRIMARY KEY,
    ClienteID INT NOT NULL,
    FechaCreacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UltimaModificacion TIMESTAMP,
    FOREIGN KEY (ClienteID) REFERENCES Clientes(ClienteID)
);

-- Los items (paquetes de productos) dentro del carrito
CREATE TABLE ItemsDelCarrito (
    ItemID SERIAL PRIMARY KEY,
    CarritoID INT NOT NULL,
    ProductoID INT NOT NULL,
    CantidadPaquetes INT NOT NULL, -- Número de paquetes (no piezas)
    FOREIGN KEY (CarritoID) REFERENCES CarritoDeCompra(CarritoID),
    FOREIGN KEY (ProductoID) REFERENCES Productos(ProductoID)
);

/*
-- =============================================
-- Sección 4: Pedidos, Gestión y Comisiones
-- =============================================
*/

-- Libreta de direcciones para los clientes
CREATE TABLE Cliente_Direcciones (
    DireccionID SERIAL PRIMARY KEY,
    ClienteID INT NOT NULL,
    Etiqueta VARCHAR(100), -- Ej: "Casa", "Bodega Principal"
    Receptor VARCHAR(255) NOT NULL,
    Calle VARCHAR(255) NOT NULL,
    NumeroExt VARCHAR(50),
    NumeroInt VARCHAR(50),
    Colonia VARCHAR(150),
    Ciudad VARCHAR(100) NOT NULL,
    Estado VARCHAR(100) NOT NULL,
    CodigoPostal VARCHAR(10) NOT NULL,
    TelefonoContacto VARCHAR(20),
    FOREIGN KEY (ClienteID) REFERENCES Clientes(ClienteID)
);

-- Tabla de Pedidos, ahora usa la libreta de direcciones
CREATE TABLE Pedidos (
    PedidoID SERIAL PRIMARY KEY,
    ClienteID INT NOT NULL,
    AgenteID INT, -- Se asigna si el cliente usó un código de agente
    
    -- Campo modificado, ahora apunta a la dirección guardada
    DireccionEnvioID INT NOT NULL, 
    
    FechaPedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    MontoTotal DECIMAL(10, 2) NOT NULL,
    Estatus VARCHAR(50) NOT NULL DEFAULT 'Pendiente', -- (Ej: Pendiente, Confirmado, Enviado)
    
    FOREIGN KEY (ClienteID) REFERENCES Clientes(ClienteID),
    FOREIGN KEY (AgenteID) REFERENCES AgentesDeVentas(AgenteID),
    FOREIGN KEY (DireccionEnvioID) REFERENCES Cliente_Direcciones(DireccionID)
);

-- Los productos específicos dentro de ese pedido
CREATE TABLE DetallesDelPedido (
    DetalleID SERIAL PRIMARY KEY,
    PedidoID INT NOT NULL,
    ProductoID INT NOT NULL,
    CantidadPaquetes INT NOT NULL, -- Cantidad de paquetes comprados
    PrecioPorPaquete DECIMAL(10, 2) NOT NULL, -- Se guarda el precio al momento de la compra
    PiezasTotales INT NOT NULL, -- (CantidadPaquetes * PiezasPorPaquete)
    FOREIGN KEY (PedidoID) REFERENCES Pedidos(PedidoID),
    FOREIGN KEY (ProductoID) REFERENCES Productos(ProductoID)
);

-- Tabla para registrar las comisiones generadas por los agentes
CREATE TABLE Comisiones (
    ComisionID SERIAL PRIMARY KEY,
    PedidoID INT NOT NULL,
    AgenteID INT NOT NULL,
    MontoComision DECIMAL(10, 2) NOT NULL, -- Calculado en la app (MontoTotal * 0.20)
    FechaCalculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Estatus VARCHAR(50) NOT NULL DEFAULT 'Pendiente', -- (Ej: Pendiente, Pagada)
    FOREIGN KEY (PedidoID) REFERENCES Pedidos(PedidoID),
    FOREIGN KEY (AgenteID) REFERENCES AgentesDeVentas(AgenteID)
);

-- Tabla para auditar cambios en el inventario (Kardex)
CREATE TABLE Log_Inventario (
    LogID SERIAL PRIMARY KEY,
    ProductoID INT NOT NULL,
    Fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CantidadCambiado INT NOT NULL, -- (Ej: -1 si se vendió 1 paquete, +50 si se recibió mercancía)
    NuevoStock INT NOT NULL, -- El stock resultante
    Motivo VARCHAR(255), -- (Ej: "Venta Pedido #123", "Ajuste Manual", "Devolución Cliente")
    UsuarioID INT, -- Quién hizo el cambio (puede ser un AgenteID o un AdminID)
    FOREIGN KEY (ProductoID) REFERENCES Productos(ProductoID)
);


