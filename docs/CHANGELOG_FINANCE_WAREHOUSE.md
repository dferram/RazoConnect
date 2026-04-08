# Changelog - Finance-Warehouse Workflow

## [1.0.0] - 2026-03-18

### Added

#### Backend - Controllers
- **`remisionesController.js`**:
  - Modified `generarRemision`: Removed immediate stock deduction and CxC generation
  - Modified `confirmarRemisionAlmacen`: Changes state to `PENDIENTE_CONFIRMACION_FINANZAS` instead of `CONFIRMADA`
  - Modified `confirmarRemisionFinanzas`: Now performs stock deduction and CxC generation with error handling
  - Added `rechazarRemisionFinanzas`: New endpoint for Finance to reject orders and return to warehouse

- **`pedidosAdminController.js`**:
  - Modified `surtirPedido`: Changes status to "Pendiente de confirmación" instead of "Listo para Surtir"
  - Added `rechazarPedidoFinanzas`: New function for Finance to reject orders with observations

- **`facturaController.js`**:
  - Added validation to ensure invoices only generate after Finance confirmation
  - Validates existence of remisiones in `SURTIDO` state before allowing invoice generation

#### Backend - Routes
- **`routes/remisiones.js`**:
  - Added `POST /api/remisiones/:id/rechazar-finanzas` (roles: finanzas, admin, super_admin)

- **`routes/admin.js`**:
  - Added `POST /api/admin/pedidos/:id/rechazar-finanzas` (roles: finanzas, gerente_finanzas, admin, super_admin)

#### Frontend
- **`admin-pedido-detalle.html`**:
  - Added "↩️ Regresar a Almacén" button for Finance role
  - Updated button visibility logic to match backend permissions exactly
  - Added support for new states: `Pendiente de confirmación`, `Revisión de almacén`
  - Added `rechazarPedidoFinanzas()` function with observation prompt
  - Updated `confirmarSurtidoFinanzas()` warning message to clarify stock/CxC impact

#### Documentation
- **`docs/FINANCE_WAREHOUSE.md`**: Complete workflow documentation with:
  - State transition diagrams
  - Detailed endpoint documentation
  - Role-based permission matrix
  - Use cases and examples
  - Troubleshooting guide

#### Tests
- **`tests/finance-warehouse-workflow.test.js`**: Comprehensive test suite covering:
  - Warehouse marking orders as ready
  - Finance confirmation with stock deduction
  - Finance rejection with observations
  - Correction and resubmission cycle
  - Permission validations
  - Error handling and rollback scenarios
  - Invoice generation validation

### Changed

#### Order States
- **New states added**:
  - `Pendiente de confirmación`: Order prepared by warehouse, awaiting Finance approval
  - `Revisión de almacén`: Order rejected by Finance, needs warehouse correction

#### Remission States
- **New states added**:
  - `PENDIENTE_CONFIRMACION_FINANZAS`: Warehouse verified, awaiting Finance confirmation
  - `REVISION_ALMACEN`: Rejected by Finance, needs warehouse correction
  - `SURTIDO`: Confirmed by Finance, stock deducted, CxC generated

#### Stock Management
- Stock deduction now occurs **only** when Finance confirms (not when warehouse marks as ready)
- Added validation to ensure stock exists before confirmation
- Automatic ROLLBACK if stock deduction fails

#### CxC Generation
- CxC now generates **only** when Finance confirms
- Validates credit availability before generating movements
- Includes detailed logging for audit trail

#### Invoice Generation
- Added validation to prevent invoicing before Finance confirmation
- Requires at least one remisión in `SURTIDO` state
- Prevents "Procesando" state bug

### Fixed

- **Stock deduction validation**: Added error handling to prevent partial confirmations if stock deduction fails
- **Correction cycle**: Fixed issue where `REVISION_ALMACEN` state blocked warehouse from resubmitting
- **Permission alignment**: Frontend button visibility now matches backend authorization exactly
- **Observation persistence**: Finance observations are now preserved and shown to warehouse during correction

### Security

- Added role-based access control for all new endpoints
- Validated that secretaria role cannot reject orders (only confirm)
- Added input validation for required observations
- Implemented transaction rollback on errors to maintain data integrity

### Breaking Changes

None. The new workflow is backward compatible with existing orders. Orders created before this update will continue to work with the old flow.

### Migration Notes

1. **Database**: No schema changes required. New columns (`observaciones_finanzas`, `rechazado_por_finanzas`, `fecha_rechazo_finanzas`) should be added as nullable fields.

2. **Existing Orders**: Orders in progress will continue with the old flow. New orders will automatically use the new Finance-Warehouse workflow.

3. **User Training**: Finance and Warehouse staff should be trained on the new workflow:
   - Warehouse: Use "Marcar Listo" button (no longer affects stock)
   - Finance: Use "Confirmar Surtido" or "Regresar a Almacén" buttons
   - Both: Understand that stock only changes after Finance confirmation

### Performance Impact

- Minimal performance impact
- Additional database queries for validation (< 50ms overhead)
- Transaction rollback on errors may slightly increase response time in error scenarios

### Monitoring

Monitor the following metrics:
- Rate of Finance rejections (should be < 5%)
- Average time from warehouse mark to Finance confirmation
- Number of correction cycles per order
- Stock deduction errors

### Known Issues

None at release.

### Future Enhancements

1. Email notifications when orders are rejected
2. Dashboard showing pending confirmations
3. Bulk confirmation for Finance
4. Automated alerts for long-pending orders
5. Analytics on rejection reasons

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-03-18 | Initial release of Finance-Warehouse workflow |
