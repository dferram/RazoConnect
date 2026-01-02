# 🔧 Guía de Reactivación de Mercado Pago

## 📋 Contexto

Mercado Pago ha sido **temporalmente deshabilitado** en toda la plataforma RazoConnect. Esta guía explica cómo reactivarlo cuando estés listo para hacer pruebas o volver a producción.

---

## ⚠️ Estado Actual (DESHABILITADO)

### Frontend (`public/carrito.html`)
- ✅ Tarjeta de pago visualmente deshabilitada con opacidad reducida
- ✅ Mensaje de advertencia visible: "Temporalmente no disponible"
- ✅ Radio button con atributo `disabled`
- ✅ `pointer-events: none` para evitar clics
- ✅ Alerta de SweetAlert2 si el usuario intenta seleccionarlo

### Backend (`routes/pagos.js`)
- ✅ Constante `MERCADOPAGO_ENABLED = false`
- ✅ Middleware que bloquea el endpoint `/procesar-tarjeta`
- ✅ Respuesta HTTP 503 (Service Unavailable) con mensaje descriptivo

---

## 🔓 Cómo Reactivar Mercado Pago

### Paso 1: Backend - Habilitar el Endpoint

**Archivo:** `routes/pagos.js`

**Cambio:** Línea 10

```javascript
// ANTES (Deshabilitado)
const MERCADOPAGO_ENABLED = false;

// DESPUÉS (Habilitado)
const MERCADOPAGO_ENABLED = true;
```

### Paso 2: Frontend - Restaurar la Tarjeta de Pago

**Archivo:** `public/carrito.html`

**Cambio:** Líneas 972-998

```html
<!-- ANTES (Deshabilitado) -->
<label
  class="payment-option-card disabled"
  id="paymentOptionMercadoPago"
  data-method="mercadopago"
  style="pointer-events: none;"
>
  <div class="payment-option-top">
    <div class="payment-option-icon" style="opacity: 0.5;">💳</div>
    <input
      type="radio"
      name="metodo_pago"
      value="mercadopago"
      disabled
    />
  </div>
  <div class="payment-option-content">
    <h5 style="opacity: 0.6;">Mercado Pago</h5>
    <p style="opacity: 0.6;">Paga con tarjeta o saldo digital y recibe confirmación inmediata.</p>
    <div style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 0.5rem; font-size: 0.85rem; color: #92400e;">
      ⚠️ <strong>Temporalmente no disponible.</strong><br>
      Por favor, utiliza Crédito Razo o transferencia.
    </div>
  </div>
  <span class="payment-option-chip payment-chip-digital" style="opacity: 0.5;">
    No disponible
  </span>
</label>

<!-- DESPUÉS (Habilitado) -->
<label
  class="payment-option-card selected"
  id="paymentOptionMercadoPago"
  data-method="mercadopago"
>
  <div class="payment-option-top">
    <div class="payment-option-icon">💳</div>
    <input
      type="radio"
      name="metodo_pago"
      value="mercadopago"
      checked
    />
  </div>
  <div class="payment-option-content">
    <h5>Mercado Pago</h5>
    <p>Paga con tarjeta o saldo digital y recibe confirmación inmediata.</p>
  </div>
  <span class="payment-option-chip payment-chip-digital">
    Pago digital
  </span>
</label>
```

### Paso 3: Frontend - Remover Bloqueo JavaScript

**Archivo:** `public/carrito.html`

**Cambio:** Líneas 2262-2282 y 2297-2310

**Eliminar o comentar** los bloques de código que muestran la alerta de SweetAlert2:

```javascript
// ⚠️ COMENTAR O ELIMINAR ESTE BLOQUE
// if (metodo === "mercadopago") {
//   if (typeof Swal !== "undefined" && Swal?.fire) {
//     await Swal.fire({
//       icon: "warning",
//       title: "Método de pago no disponible",
//       html: "...",
//       confirmButtonText: "Entendido",
//       confirmButtonColor: "#F97316",
//     });
//   }
//   if (creditoDisponible && creditSummary) {
//     setMetodoPago("credito");
//   } else {
//     setMetodoPago("transferencia");
//   }
//   return;
// }
```

### Paso 4: Frontend - Ajustar Método de Pago por Defecto

**Archivo:** `public/carrito.html`

**Cambio:** Línea 1485-1487

```javascript
// ANTES (Crédito por defecto)
let metodoPagoSeleccionado = defaultPaymentRadio
  ? defaultPaymentRadio.value.toLowerCase()
  : "credito"; // ← Cambiar a "mercadopago"

// DESPUÉS (Mercado Pago por defecto)
let metodoPagoSeleccionado = defaultPaymentRadio
  ? defaultPaymentRadio.value.toLowerCase()
  : "mercadopago";
```

### Paso 5: Frontend - Ajustar Tarjeta de Crédito

**Archivo:** `public/carrito.html`

**Cambio:** Líneas 1000-1017

Remover la clase `selected` y el atributo `checked` de la tarjeta de Crédito Razo:

```html
<!-- ANTES -->
<label
  class="payment-option-card selected"
  id="paymentOptionCredito"
  data-method="credito"
>
  <div class="payment-option-top">
    <div class="payment-option-icon">🏬</div>
    <input type="radio" name="metodo_pago" value="credito" checked />
  </div>

<!-- DESPUÉS -->
<label
  class="payment-option-card"
  id="paymentOptionCredito"
  data-method="credito"
>
  <div class="payment-option-top">
    <div class="payment-option-icon">🏬</div>
    <input type="radio" name="metodo_pago" value="credito" />
  </div>
```

### Paso 6: Frontend - Habilitar en Modal de Créditos

**Archivo:** `public/mi_credito.html`

**Cambio:** Líneas 666-713

Restaurar la tarjeta de Mercado Pago en el modal de pago de créditos:

```html
<!-- ANTES (Deshabilitado) -->
<label
  class="payment-option-card disabled"
  id="paymentOptionMercadoPagoPago"
  data-method="mercadopago"
  style="pointer-events: none;"
>
  <div class="payment-option-top">
    <div class="payment-option-icon" style="opacity: 0.5;">💳</div>
    <input
      type="radio"
      name="metodo_pago_credito"
      value="mercadopago"
      disabled
    />
  </div>
  <div class="payment-option-content">
    <h5 style="opacity: 0.6;">Mercado Pago</h5>
    <p style="opacity: 0.6;">Paga con tarjeta o saldo digital y recibe confirmación inmediata.</p>
    <div style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 0.5rem; font-size: 0.85rem; color: #92400e;">
      ⚠️ <strong>Temporalmente no disponible.</strong><br>
      Por favor, utiliza transferencia bancaria.
    </div>
  </div>
  <span class="payment-option-chip payment-chip-digital" style="opacity: 0.5;">
    No disponible
  </span>
</label>

<label
  class="payment-option-card selected"
  id="paymentOptionTransferenciaPago"
  data-method="transferencia"
>
  <div class="payment-option-top">
    <div class="payment-option-icon">🏦</div>
    <input type="radio" name="metodo_pago_credito" value="transferencia" checked />
  </div>

<!-- DESPUÉS (Habilitado) -->
<label
  class="payment-option-card selected"
  id="paymentOptionMercadoPagoPago"
  data-method="mercadopago"
>
  <div class="payment-option-top">
    <div class="payment-option-icon">💳</div>
    <input
      type="radio"
      name="metodo_pago_credito"
      value="mercadopago"
      checked
    />
  </div>
  <div class="payment-option-content">
    <h5>Mercado Pago</h5>
    <p>Paga con tarjeta o saldo digital y recibe confirmación inmediata.</p>
  </div>
  <span class="payment-option-chip payment-chip-digital">Pago digital</span>
</label>

<label
  class="payment-option-card"
  id="paymentOptionTransferenciaPago"
  data-method="transferencia"
>
  <div class="payment-option-top">
    <div class="payment-option-icon">🏦</div>
    <input type="radio" name="metodo_pago_credito" value="transferencia" />
  </div>
```

---

## ✅ Verificación Post-Reactivación

### Checklist de Pruebas

1. **Backend:**
   - [ ] El endpoint `/api/pagos/procesar-tarjeta` responde correctamente
   - [ ] No devuelve error 503
   - [ ] Procesa pagos de prueba con tarjetas de Mercado Pago

2. **Frontend:**
   - [ ] La tarjeta de Mercado Pago aparece habilitada (sin opacidad)
   - [ ] El radio button está seleccionado por defecto
   - [ ] No aparece el mensaje de "Temporalmente no disponible"
   - [ ] No se muestra alerta de SweetAlert2 al hacer clic
   - [ ] El formulario de tarjeta se muestra correctamente

3. **Flujo Completo:**
   - [ ] Agregar productos al carrito
   - [ ] Ir a checkout
   - [ ] Seleccionar Mercado Pago
   - [ ] Ingresar datos de tarjeta de prueba
   - [ ] Confirmar pedido
   - [ ] Verificar que el pago se procesa correctamente

---

## 🧪 Tarjetas de Prueba de Mercado Pago

Para hacer pruebas en modo sandbox, usa estas tarjetas:

| Tarjeta | Número | CVV | Fecha | Resultado |
|---------|--------|-----|-------|-----------|
| Visa | 4509 9535 6623 3704 | 123 | 11/25 | ✅ Aprobado |
| Mastercard | 5031 7557 3453 0604 | 123 | 11/25 | ✅ Aprobado |
| Visa | 4000 0000 0000 0010 | 123 | 11/25 | ❌ Rechazado |

**Nombre del titular:** APRO (para aprobado) o OTHE (para rechazado)

---

## 📝 Notas Importantes

1. **Variables de Entorno:** Asegúrate de que `MP_ACCESS_TOKEN` esté configurado en `.env`
2. **Public Key:** Verifica que `MP_PUBLIC_KEY` en `carrito.html` (línea 1508) sea correcta
3. **Modo Sandbox:** En producción, cambia las credenciales de prueba por las reales
4. **Logs:** Revisa los logs del servidor después de reactivar para detectar errores

---

## 🔄 Volver a Deshabilitar

Si necesitas volver a deshabilitar Mercado Pago:

1. Cambia `MERCADOPAGO_ENABLED = true` a `false` en `routes/pagos.js`
2. Restaura los cambios en `carrito.html` (volver al estado deshabilitado)
3. Reinicia el servidor

---

## 📞 Soporte

Si encuentras problemas al reactivar Mercado Pago:

1. Verifica los logs del servidor: `npm run dev` o `node index.js`
2. Revisa la consola del navegador (F12) para errores de JavaScript
3. Confirma que las credenciales de Mercado Pago sean válidas
4. Consulta la documentación oficial: https://www.mercadopago.com.mx/developers

---

**Última actualización:** 31 de Diciembre, 2024
**Estado:** Mercado Pago DESHABILITADO ⛔
