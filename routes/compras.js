const express = require('express');
const router = express.Router();
const comprasController = require('../controllers/comprasController');
const { authenticate, authorizeRole } = require('../middlewares/roleMiddleware');

/**
 * @swagger
 * /api/orden-compra/{id}/items:
 *   put:
 *     summary: Editar items de una orden de compra
 *     tags: [Admin - Órdenes de Compra]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la orden de compra
 *         example: 10
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Items actualizados exitosamente
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
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/orden-compra/:id/items',
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']),
  comprasController.editarItemsOrdenCompra
);

/**
 * @swagger
 * /api/orden-compra/cancelar-backorder:
 *   post:
 *     summary: Cancelar backorder vinculado a item eliminado de OC
 *     tags: [Admin - Órdenes de Compra]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [backorderId]
 *             properties:
 *               backorderId:
 *                 type: integer
 *                 example: 25
 *     responses:
 *       200:
 *         description: Backorder cancelado exitosamente
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
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/orden-compra/cancelar-backorder',
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'jefe_almacen']),
  comprasController.cancelarBackorderVinculado
);

/**
 * @swagger
 * /api/orden-compra/registrar-anomalia:
 *   post:
 *     summary: Registrar anomalía en entrada de almacén
 *     description: Registra merma o excedente en recepción de inventario
 *     tags: [Admin - Órdenes de Compra]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ordenId, tipo, cantidad, motivo]
 *             properties:
 *               ordenId:
 *                 type: integer
 *                 example: 10
 *               tipo:
 *                 type: string
 *                 enum: [merma, excedente]
 *                 example: merma
 *               cantidad:
 *                 type: integer
 *                 example: 5
 *               motivo:
 *                 type: string
 *                 example: Producto dañado en transporte
 *     responses:
 *       201:
 *         description: Anomalía registrada exitosamente
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
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/orden-compra/registrar-anomalia',
  authenticate,
  authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'jefe_almacen', 'recepcionista_compras']),
  comprasController.registrarAnomaliaEntrada
);

module.exports = router;
