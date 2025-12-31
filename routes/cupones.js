const express = require("express");
const router = express.Router();
const cuponesController = require("../controllers/cuponesController");
const { authenticate, authorizeAdmin } = require("../middlewares/authMiddleware");

router.post("/validar", cuponesController.validarCupon);

router.get("/admin/cupones", authenticate, authorizeAdmin, cuponesController.listarCupones);
router.get("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.obtenerCupon);
router.post("/admin/cupones", authenticate, authorizeAdmin, cuponesController.crearCupon);
router.put("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.actualizarCupon);
router.delete("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.desactivarCupon);

module.exports = router;
