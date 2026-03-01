const express = require("express");
const router = express.Router();
const cuponesController = require("../controllers/cuponesController");
const { authenticate, authorizeAdmin, authorize } = require("../middlewares/authMiddleware");

/**
 * @swagger
 * /api/validar:
 *   post:
 *     summary: Validar cupón de descuento
 *     tags: [Admin - Cupones]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo, total]
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: DESCUENTO10
 *               total:
 *                 type: number
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Cupón validado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valido:
 *                   type: boolean
 *                   example: true
 *                 descuento:
 *                   type: number
 *                   example: 100
 *       400:
 *         description: Cupón inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/validar", cuponesController.validarCupon);

/**
 * @swagger
 * /api/admin/cupones:
 *   get:
 *     summary: Listar todos los cupones
 *     tags: [Admin - Cupones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cupones obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 cupones:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/admin/cupones", authenticate, authorizeAdmin, cuponesController.listarCupones);
/**
 * @swagger
 * /api/admin/cupones/{id}:
 *   get:
 *     summary: Obtener detalle de un cupón
 *     tags: [Admin - Cupones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del cupón
 *         example: 5
 *     responses:
 *       200:
 *         description: Cupón obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 cupon:
 *                   type: object
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cupón no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.obtenerCupon);
/**
 * @swagger
 * /api/admin/cupones:
 *   post:
 *     summary: Crear nuevo cupón
 *     tags: [Admin - Cupones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo, descuento, tipo]
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: VERANO2024
 *               descuento:
 *                 type: number
 *                 example: 10
 *               tipo:
 *                 type: string
 *                 enum: [PORCENTAJE, FIJO]
 *                 example: PORCENTAJE
 *               fechaExpiracion:
 *                 type: string
 *                 format: date
 *                 example: "2024-12-31"
 *     responses:
 *       201:
 *         description: Cupón creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/admin/cupones", authenticate, authorizeAdmin, cuponesController.crearCupon);
/**
 * @swagger
 * /api/admin/cupones/{id}:
 *   put:
 *     summary: Actualizar cupón
 *     tags: [Admin - Cupones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del cupón
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               descuento:
 *                 type: number
 *                 example: 15
 *               fechaExpiracion:
 *                 type: string
 *                 format: date
 *                 example: "2024-12-31"
 *     responses:
 *       200:
 *         description: Cupón actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cupón no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.actualizarCupon);
/**
 * @swagger
 * /api/admin/cupones/{id}:
 *   delete:
 *     summary: Desactivar cupón
 *     tags: [Admin - Cupones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del cupón
 *         example: 5
 *     responses:
 *       200:
 *         description: Cupón desactivado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cupón no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/admin/cupones/:id", authenticate, authorizeAdmin, cuponesController.desactivarCupon);

/**
 * @swagger
 * /api/agente/cupones/mis-cupones:
 *   get:
 *     summary: Listar cupones del agente
 *     tags: [Agente - Cupones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cupones obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 cupones:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/agente/cupones/mis-cupones", authenticate, authorize(["agente"]), cuponesController.listarMisCupones);
/**
 * @swagger
 * /api/agente/cupones:
 *   post:
 *     summary: Crear cupón como agente
 *     tags: [Agente - Cupones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo, descuento, tipo]
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: AGENTE10
 *               descuento:
 *                 type: number
 *                 example: 10
 *               tipo:
 *                 type: string
 *                 enum: [PORCENTAJE, FIJO]
 *                 example: PORCENTAJE
 *     responses:
 *       201:
 *         description: Cupón creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/agente/cupones", authenticate, authorize(["agente"]), cuponesController.crearCupon);
/**
 * @swagger
 * /api/agente/cupones/{id}:
 *   put:
 *     summary: Actualizar cupón del agente
 *     tags: [Agente - Cupones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del cupón
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               descuento:
 *                 type: number
 *                 example: 15
 *     responses:
 *       200:
 *         description: Cupón actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cupón no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/agente/cupones/:id", authenticate, authorize(["agente"]), cuponesController.actualizarCupon);
/**
 * @swagger
 * /api/agente/cupones/{id}:
 *   delete:
 *     summary: Desactivar cupón del agente
 *     tags: [Agente - Cupones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del cupón
 *         example: 5
 *     responses:
 *       200:
 *         description: Cupón desactivado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: No autenticado o no es agente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cupón no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/agente/cupones/:id", authenticate, authorize(["agente"]), cuponesController.desactivarCupon);

module.exports = router;
