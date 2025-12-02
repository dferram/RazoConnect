# Ejemplo de Uso: generarBackorderProveedor

## Descripción

La función `generarBackorderProveedor` genera automáticamente órdenes de compra al proveedor cuando se detecta falta de inventario durante la creación de un pedido.

## Firma de la Función

```javascript
async function generarBackorderProveedor(
  client,        // Cliente de BD dentro de transacción
  productoID,    // ID del producto
  varianteID,    // ID de la variante
  cantidadFaltante, // Cantidad de paquetes faltantes
  tamanoID       // ID del tamaño (puede ser NULL)
)
```

## Ejemplo de Integración en un Controlador

```javascript
const db = require("../db");
const { generarBackorderProveedor } = require("../services/ordenesService");

async function crearPedido(req, res) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // ... lógica de creación del pedido ...

    // Supongamos que detectaste que falta inventario
    const productoID = 15;
    const varianteID = 42;
    const cantidadFaltante = 10; // paquetes
    const tamanoID = 3; // puede ser null

    // Verificar si hay stock suficiente
    const inventarioResult = await client.query(
      `SELECT CantidadDisponible FROM Inventario 
       WHERE VarianteID = $1`,
      [varianteID]
    );

    const stockDisponible = inventarioResult.rows[0]?.cantidaddisponible || 0;

    if (stockDisponible < cantidadFaltante) {
      // GENERAR BACKORDER automáticamente
      const backorderResult = await generarBackorderProveedor(
        client,
        productoID,
        varianteID,
        cantidadFaltante - stockDisponible,
        tamanoID
      );

      console.log("✅ Backorder generado:", backorderResult);
      // backorderResult contiene:
      // {
      //   success: true,
      //   ordenCompraID: 123,
      //   proveedorID: 5,
      //   productoID: 15,
      //   varianteID: 42,
      //   tamanoID: 3,
      //   cantidadSolicitada: 5,
      //   cantidadTotal: 15, // si había 10 solicitados previamente
      //   detalleOrdenID: 456,
      //   esOrdenNueva: false,
      //   mensaje: 'Orden de compra 123 actualizada'
      // }

      // Opcional: Marcar el pedido como "Backorder"
      await client.query(
        `UPDATE Pedidos SET Estatus = 'Backorder' WHERE PedidoID = $1`,
        [pedidoID]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, backorder: backorderResult });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}
```

## Lógica Interna (Flujo)

1. **Validación de Parámetros**

   - Verifica que productoID, varianteID y cantidadFaltante sean válidos

2. **Identificar Proveedor**

   - Consulta `Productos.ProveedorID_Default`
   - Si es NULL → lanza error (no se puede generar orden)

3. **Buscar Orden Pendiente**

   - Busca en `OrdenesDeCompra` una orden con:
     - `ProveedorID = [proveedor encontrado]`
     - `Estatus = 'Pendiente'`
   - Ordena por `FechaCreacion ASC` (más antigua primero)

4. **Crear o Reutilizar Orden**

   - **Si NO existe**: Crea nueva orden con `INSERT INTO OrdenesDeCompra`
   - **Si SÍ existe**: Usa el ID de esa orden

5. **Agregar/Actualizar Producto**
   - Busca en `DetallesOrdenCompra` si ya existe la variante
   - **Si existe**: `UPDATE` incrementando `CantidadSolicitada`
   - **Si NO existe**: `INSERT` nuevo detalle con `CantidadRecibida = 0`

## Manejo de Errores

La función lanza errores en los siguientes casos:

- ProductoID o VarianteID inválidos
- Cantidad faltante no es un número positivo
- Producto no encontrado en la BD
- Producto sin proveedor asignado (`ProveedorID_Default IS NULL`)

## Notas Importantes

- ✅ La función opera **dentro de una transacción existente** (no crea ni hace commit)
- ✅ Es segura para uso concurrente (no hay race conditions)
- ✅ Incluye el campo `TamanoID` en `DetallesOrdenCompra`
- ✅ Retorna información detallada del resultado
- ✅ Registra errores en consola para debugging
