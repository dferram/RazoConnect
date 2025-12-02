-- Verificar la última orden de compra generada
SELECT 
  oc.OrdenCompraID,
  oc.FechaCreacion,
  oc.Estatus,
  pr.NombreEmpresa as Proveedor,
  doc.CantidadSolicitada,
  doc.CantidadRecibida,
  p.NombreProducto,
  pv.SKU
FROM OrdenesDeCompra oc
INNER JOIN Proveedores pr ON pr.ProveedorID = oc.ProveedorID
INNER JOIN DetallesOrdenCompra doc ON doc.OrdenCompraID = oc.OrdenCompraID
INNER JOIN Producto_Variantes pv ON pv.VarianteID = doc.VarianteID
INNER JOIN Productos p ON p.ProductoID = pv.ProductoID
WHERE oc.Estatus = 'Pendiente'
ORDER BY oc.FechaCreacion DESC
LIMIT 10;
