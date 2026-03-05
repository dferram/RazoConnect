/**
 * SCHEMAS DE VALIDACIÓN — express-validator
 * 
 * Centraliza todas las reglas de validación de inputs para las rutas críticas.
 * Se usa junto con middlewares/validate.js para rechazar requests malformados
 * antes de que lleguen a los controllers.
 * 
 * @module middlewares/validators/schemas
 */

const { body, param } = require('express-validator');

// ============================================================
// AUTH — ADMIN LOGIN (Email O Teléfono)
// POST /api/admin/login
// ============================================================
const loginAdminSchema = [
  body('email')
    .trim()
    .notEmpty().withMessage('El correo o teléfono es requerido')
    .custom((value) => {
      // Validar que sea email O teléfono (10 dígitos)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\d{10}$/;
      
      if (!emailRegex.test(value) && !phoneRegex.test(value)) {
        throw new Error('Formato inválido. Ingresa un correo válido o 10 dígitos');
      }
      return true;
    })
    .isLength({ max: 254 }).withMessage('El valor es demasiado largo'),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
    .isLength({ max: 128 }).withMessage('La contraseña es demasiado larga'),
];

// ============================================================
// AUTH — AGENTE LOGIN
// POST /api/agente/login
// ============================================================
const loginAgenteSchema = [
  body('email')
    .trim()
    .notEmpty().withMessage('El email es requerido')
    .isEmail().withMessage('El email no tiene un formato válido')
    .normalizeEmail()
    .isLength({ max: 254 }).withMessage('El email es demasiado largo'),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
    .isLength({ max: 128 }).withMessage('La contraseña es demasiado larga'),
];

// ============================================================
// AUTH — CLIENTE/AGENTE LOGIN (Email O Teléfono)
// POST /api/login
// ============================================================
const loginClienteSchema = [
  body('email')
    .trim()
    .notEmpty().withMessage('El correo o teléfono es requerido')
    .custom((value) => {
      // Validar que sea email O teléfono (10 dígitos)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\d{10}$/;
      
      if (!emailRegex.test(value) && !phoneRegex.test(value)) {
        throw new Error('Formato inválido. Ingresa un correo válido o 10 dígitos');
      }
      return true;
    })
    .isLength({ max: 254 }).withMessage('El valor es demasiado largo'),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
    .isLength({ max: 128 }).withMessage('La contraseña es demasiado larga'),
];

// ============================================================
// AUTH — CLIENTE REGISTRO
// POST /api/auth/registro (o la ruta equivalente)
// ============================================================
const registroClienteSchema = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/).withMessage('El nombre contiene caracteres no permitidos'),

  body('apellido')
    .trim()
    .notEmpty().withMessage('El apellido es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('El apellido debe tener entre 2 y 100 caracteres')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/).withMessage('El apellido contiene caracteres no permitidos'),

  body('email')
    .trim()
    .notEmpty().withMessage('El email es requerido')
    .isEmail().withMessage('El email no tiene un formato válido')
    .normalizeEmail()
    .isLength({ max: 254 }).withMessage('El email es demasiado largo'),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .isLength({ max: 128 }).withMessage('La contraseña es demasiado larga'),

  body('telefono')
    .optional({ nullable: true })
    .trim()
    .isMobilePhone('es-MX').withMessage('El teléfono no tiene un formato válido'),
];

// ============================================================
// AGENTES — CREAR AGENTE
// POST /api/admin/agentes
// ============================================================
const crearAgenteSchema = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),

  body('apellido')
    .trim()
    .notEmpty().withMessage('El apellido es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('El apellido debe tener entre 2 y 100 caracteres'),

  body('email')
    .trim()
    .notEmpty().withMessage('El email es requerido')
    .isEmail().withMessage('El email no tiene un formato válido')
    .normalizeEmail()
    .isLength({ max: 254 }).withMessage('El email es demasiado largo'),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .isLength({ max: 128 }).withMessage('La contraseña es demasiado larga'),

  body('telefono')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage('El teléfono es demasiado largo'),

  body('porcentaje_comision')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 }).withMessage('El porcentaje de comisión debe ser entre 0 y 100'),
];

// ============================================================
// ÓRDENES DE COMPRA — CREAR
// POST /api/admin/ordenes-compra
// ============================================================
const crearOrdenCompraSchema = [
  body('proveedorId')
    .notEmpty().withMessage('El proveedor es requerido')
    .isInt({ min: 1 }).withMessage('El ID de proveedor debe ser un número entero positivo'),

  body('fechaEntregaEsperada')
    .notEmpty().withMessage('La fecha de entrega esperada es requerida')
    .isISO8601().withMessage('La fecha de entrega debe tener formato válido (YYYY-MM-DD)')
    .custom((value) => {
      const fecha = new Date(value);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      if (fecha < hoy) {
        throw new Error('La fecha de entrega no puede ser en el pasado');
      }
      return true;
    }),

  body('productos')
    .isArray({ min: 1 }).withMessage('Debe incluir al menos un producto'),

  body('productos.*.varianteId')
    .notEmpty().withMessage('Cada producto debe tener un varianteId')
    .isInt({ min: 1 }).withMessage('El varianteId debe ser un número entero positivo'),

  body('productos.*.cantidadSolicitada')
    .notEmpty().withMessage('Cada producto debe tener cantidadSolicitada')
    .isInt({ min: 1 }).withMessage('La cantidad solicitada debe ser al menos 1'),

  body('productos.*.piezasPorPaquete')
    .optional()
    .isInt({ min: 1 }).withMessage('piezasPorPaquete debe ser al menos 1'),

  body('productos.*.costoUnitario')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('El costo unitario no puede ser negativo'),
];

// ============================================================
// RECEPCIÓN DE INVENTARIO
// POST /api/admin/ordenes-compra/recibir
// ============================================================
const recibirInventarioSchema = [
  body('ordenCompraId')
    .notEmpty().withMessage('El ID de la orden de compra es requerido')
    .isInt({ min: 1 }).withMessage('El ID de orden de compra debe ser un número entero positivo'),

  body('productos')
    .isArray({ min: 1 }).withMessage('Debe incluir al menos un producto'),

  body('productos.*.detalleId')
    .notEmpty().withMessage('Cada producto debe tener un detalleId')
    .isInt({ min: 1 }).withMessage('El detalleId debe ser un número entero positivo'),

  body('productos.*.cantidadRecibidaAhora')
    .notEmpty().withMessage('Cada producto debe tener cantidadRecibidaAhora')
    .isInt({ min: 0 }).withMessage('La cantidad recibida no puede ser negativa'),
];

// ============================================================
// INVENTARIO — AJUSTE (MERMA / ADICIÓN)
// POST /api/admin/inventario/ajuste
// ============================================================
const ajusteInventarioSchema = [
  body('varianteId')
    .notEmpty().withMessage('El varianteId es requerido')
    .isInt({ min: 1 }).withMessage('El varianteId debe ser un número entero positivo'),

  body('cantidad')
    .optional()
    .isInt({ min: 1 }).withMessage('La cantidad debe ser al menos 1'),

  body('tipoMovimiento')
    .optional()
    .isIn(['ENTRADA', 'SALIDA']).withMessage('El tipoMovimiento debe ser ENTRADA o SALIDA'),

  body('motivo')
    .trim()
    .notEmpty().withMessage('El motivo del ajuste es requerido')
    .isLength({ max: 500 }).withMessage('El motivo no puede superar 500 caracteres'),
];

// ============================================================
// ABONO CXC
// POST /api/admin/registrar-abono
// ============================================================
const abonoSchema = [
  body('monto')
    .notEmpty().withMessage('El monto del abono es requerido')
    .isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0'),

  body('metodoPago')
    .optional()
    .trim()
    .isIn(['efectivo', 'transferencia', 'cheque', 'tarjeta']).withMessage('Método de pago no válido'),

  body('referencia')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 }).withMessage('La referencia no puede superar 255 caracteres'),
];

module.exports = {
  loginAdminSchema,
  loginAgenteSchema,
  loginClienteSchema,
  registroClienteSchema,
  crearAgenteSchema,
  crearOrdenCompraSchema,
  recibirInventarioSchema,
  ajusteInventarioSchema,
  abonoSchema,
};
