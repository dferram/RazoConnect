const express = require("express");
const router = express.Router();
const multer = require("multer");
const productosAdminController = require("../../controllers/productosAdminController");
const variantesAdminController = require("../../controllers/variantesAdminController");
const categoriasAdminController = require("../../controllers/categoriasAdminController");
const medidasAdminController = require("../../controllers/medidasAdminController");
const tamanosAdminController = require("../../controllers/tamanosAdminController");
const tiposProductoController = require("../../controllers/tiposProductoController");
const detallesProductoController = require("../../controllers/detallesProductoController");
const variantesPendientesController = require("../../controllers/variantesPendientesController");
const imagenesProductoController = require("../../controllers/imagenesProductoController");
const toggleVisibilidadController = require("../../controllers/toggleVisibilidadController");
const busquedaInventarioController = require("../../controllers/busquedaInventarioController");
const { authenticate, authorizeAdmin, authorizeRole, authorizeAdminOrAgente } = require("../../middlewares/roleMiddleware");
const { heavyOperationLimiter } = require("../../middlewares/rateLimiter");
const upload = require("../../middlewares/upload");
const uploadProductImages = require("../../middlewares/uploadProductImages");
const uploadCategoryImage = require("../../middlewares/uploadCategoryImage");

/**
 * Gestión de productos
 */
router.get(
  "/productos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'jefe_almacen', 'almacenista', 'compras', 'marketing', 'soporte_cliente']),
  productosAdminController.getAllProductos
);

router.get(
  "/productos/buscar",
  authenticate,
  authorizeAdmin,
  busquedaInventarioController.buscarProductosAjuste
);

router.get(
  "/productos/buscar-compra",
  authenticate,
  authorizeAdminOrAgente,
  busquedaInventarioController.buscarProductosCompra
);

router.get(
  "/productos/:id",
  authenticate,
  authorizeAdmin,
  detallesProductoController.getProductoDetalle
);

router.get(
  "/productos/:id/variantes-pendientes",
  authenticate,
  authorizeAdmin,
  variantesPendientesController.getVariantesPendientesProducto
);

router.post(
  "/productos",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']),
  uploadProductImages,
  productosAdminController.crearProducto
);

router.put(
  "/productos/:id",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'marketing']),
  uploadProductImages,
  productosAdminController.actualizarProducto
);

router.put(
  "/productos/:id/toggle-visibilidad",
  authenticate,
  authorizeAdmin,
  toggleVisibilidadController.toggleProductoVisibilidad
);

/**
 * @route   POST /api/admin/productos/:id/imagen
 * @desc    Subir imagen para un producto
 * @access  Private (Admin only)
 */
router.post(
  "/productos/:id/imagen",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  upload.single("imagen"),
  imagenesProductoController.subirImagenProducto
);

router.post(
  "/productos/:id/imagenes",
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'marketing']),
  heavyOperationLimiter,
  (req, res, next) => {
    const handler = upload.fields([
      { name: "imagenes", maxCount: 12 },
      { name: "images", maxCount: 12 },
    ]);

    handler(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            message: "El límite máximo es de 12 imágenes por producto",
          });
        }

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "Cada imagen no debe superar 5MB",
          });
        }

        return res.status(400).json({
          success: false,
          message: err.message || "Error al subir las imágenes",
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || "Error al subir las imágenes",
      });
    });
  },
  imagenesProductoController.subirImagenesProductoMultiple
);

// DELETE: Eliminar imagen de producto (físicamente de Cloudinary + BD)
router.delete(
  "/productos/imagenes/:id",
  authenticate,
  authorizeAdmin,
  imagenesProductoController.eliminarImagenProducto
);

/**
 * Gestión de variantes
 */
router.post(
  "/variantes",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  (req, res, next) => {
    const handler = upload.fields([
      { name: "imagenes", maxCount: 12 },
      { name: "images", maxCount: 12 },
    ]);

    handler(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            message: "El límite máximo es de 12 imágenes por variante",
          });
        }

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "Cada imagen no debe superar 5MB",
          });
        }

        return res.status(400).json({
          success: false,
          message: err.message || "Error al subir las imágenes",
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || "Error al subir las imágenes",
      });
    });
  },
  variantesAdminController.crearVariante
);

router.put(
  "/variantes/:id",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  (req, res, next) => {
    const handler = upload.fields([
      { name: "imagenes", maxCount: 12 },
      { name: "images", maxCount: 12 },
    ]);

    handler(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            message: "El límite máximo es de 12 imágenes por variante",
          });
        }

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "Cada imagen no debe superar 5MB",
          });
        }

        return res.status(400).json({
          success: false,
          message: err.message || "Error al subir las imágenes",
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || "Error al subir las imágenes",
      });
    });
  },
  variantesAdminController.actualizarVariante
);

router.get(
  "/variantes/:id/imagenes",
  authenticate,
  authorizeAdmin,
  imagenesProductoController.getImagenesVariante
);

router.post(
  "/variantes/:id/imagenes",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  (req, res, next) => {
    const handler = upload.fields([
      { name: "imagenes", maxCount: 12 },
      { name: "images", maxCount: 12 },
    ]);

    handler(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            message: "El límite máximo es de 12 imágenes por variante",
          });
        }

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "Cada imagen no debe superar 5MB",
          });
        }

        return res.status(400).json({
          success: false,
          message: err.message || "Error al subir las imágenes",
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || "Error al subir las imágenes",
      });
    });
  },
  imagenesProductoController.subirImagenesVarianteMultiple
);

router.put(
  "/variantes/:id/orden-imagenes",
  authenticate,
  authorizeAdmin,
  imagenesProductoController.actualizarOrdenImagenesVariante
);

/**
 * Gestión de categorías
 */
router.get(
  "/categorias",
  authenticate,
  authorizeAdminOrAgente,
  categoriasAdminController.getCategorias
);

router.post(
  "/categorias",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  uploadCategoryImage.single("image"),
  categoriasAdminController.crearCategoria
);

router.put(
  "/categorias/:id",
  authenticate,
  authorizeAdmin,
  heavyOperationLimiter,
  uploadCategoryImage.single("image"),
  categoriasAdminController.actualizarCategoria
);

router.delete(
  "/categorias/:id",
  authenticate,
  authorizeAdmin,
  categoriasAdminController.eliminarCategoria
);

/**
 * Gestión de medidas
 */
router.get(
  "/medidas",
  authenticate,
  authorizeAdmin,
  medidasAdminController.getMedidas
);

router.get(
  "/medidas-existentes",
  authenticate,
  authorizeAdminOrAgente,
  medidasAdminController.getMedidasExistentes
);

/**
 * Gestión de tamaños
 */
router.get(
  "/tamanos-paquetes",
  authenticate,
  authorizeAdmin,
  tamanosAdminController.getTamanosPaquetes
);

router.get(
  "/productos/:id/tamanos-disponibles",
  authenticate,
  authorizeAdmin,
  tamanosAdminController.getTamanosDisponiblesProducto
);

/**
 * Gestión de tipos de producto
 */
router.get(
  "/tipos-producto",
  authenticate,
  authorizeAdmin,
  tiposProductoController.getTiposProductoAdmin
);

router.post(
  "/tipos-producto",
  authenticate,
  authorizeAdmin,
  tiposProductoController.crearTipoProductoAdmin
);

module.exports = router;
