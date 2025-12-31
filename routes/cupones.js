const express = require("express");
const router = express.Router();
const cuponesController = require("../controllers/cuponesController");
const { authenticate, authorizeAdmin, authorize } = require("../middlewares/authMiddleware");

// Ruta pública para validar cupones
router.post("/validar", cuponesController.validarCupon);

// Rutas de Admin
router.get("/admin/cupones", authenticate, authorizeAdmin, cuponesController.listarCupones);
router.get("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.obtenerCupon);
router.post("/admin/cupones", authenticate, authorizeAdmin, cuponesController.crearCupon);
router.put("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.actualizarCupon);
router.delete("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.desactivarCupon);

// Rutas de Agente
router.get("/agente/cupones/mis-cupones", authenticate, authorize(["agente"]), cuponesController.listarMisCupones);
router.post("/agente/cupones", authenticate, authorize(["agente"]), cuponesController.crearCupon);
router.put("/agente/cupones/:id", authenticate, authorize(["agente"]), cuponesController.actualizarCupon);
router.delete("/agente/cupones/:id", authenticate, authorize(["agente"]), cuponesController.desactivarCupon);

module.exports = router;
