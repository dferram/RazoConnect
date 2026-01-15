# Mercado Pago - Instrucciones de Reactivación

## Estado Actual
🚫 **Mercado Pago está temporalmente deshabilitado en el sistema.**

Los clientes verán la opción pero no podrán seleccionarla. Se les mostrará un mensaje indicando que usen otros métodos de pago (Crédito Razo o Transferencia Bancaria).

---

## Pasos para Reactivar Mercado Pago

### 1. Configuración de Credenciales

**Archivo:** `.env`

Asegúrate de tener las credenciales correctas de Mercado Pago:

```env
# Mercado Pago Credentials
MP_PUBLIC_KEY=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MP_ACCESS_TOKEN=TEST-xxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx
```

**⚠️ Importante:**
- Para **pruebas**: Usa credenciales que inicien con `TEST-`
- Para **producción**: Usa credenciales reales de tu cuenta de Mercado Pago

### 2. Habilitar la Opción en el Frontend

**Archivo:** `tenants_views/razo/carrito.html`

#### Paso 2.1: Remover el estado "disabled" de la tarjeta

Busca la línea **~974** y modifica:

```html
<!-- ❌ ANTES (deshabilitado) -->
<label
  class="payment-option-card disabled"
  id="paymentOptionMercadoPago"
  data-method="mercadopago"
  style="pointer-events: none;"
>

<!-- ✅ DESPUÉS (habilitado) -->
<label
  class="payment-option-card"
  id="paymentOptionMercadoPago"
  data-method="mercadopago"
>
```

#### Paso 2.2: Habilitar el radio button

Busca la línea **~981** y modifica:

```html
<!-- ❌ ANTES -->
<input
  type="radio"
  name="metodo_pago"
  value="mercadopago"
  disabled
/>

<!-- ✅ DESPUÉS -->
<input
  type="radio"
  name="metodo_pago"
  value="mercadopago"
/>
```

#### Paso 2.3: Remover el mensaje de "no disponible"

Busca las líneas **~991-995** y **ELIMINA** todo el div con el mensaje de advertencia:

```html
<!-- ❌ ELIMINAR ESTE BLOQUE COMPLETO -->
<div style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 0.5rem; font-size: 0.85rem; color: #92400e;">
  ⚠️ <strong>Temporalmente no disponible.</strong><br>
  Por favor, utiliza Crédito Razo o transferencia.
</div>
```

#### Paso 2.4: Actualizar el chip de estado

Busca la línea **~996** y modifica:

```html
<!-- ❌ ANTES -->
<span class="payment-option-chip payment-chip-digital" style="opacity: 0.5;">
  No disponible
</span>

<!-- ✅ DESPUÉS -->
<span class="payment-option-chip payment-chip-digital">
  Pago seguro
</span>
```

### 3. Habilitar los Inputs del Formulario

**Archivo:** `tenants_views/razo/carrito.html`

Busca las líneas **~1081-1154** y **REMUEVE** los atributos `disabled` y `readonly` de todos los inputs:

```html
<!-- ❌ ANTES -->
<input
  type="text"
  id="mpCardholderName"
  placeholder="Nombre impreso en la tarjeta"
  autocomplete="off"
  disabled
  readonly
/>

<!-- ✅ DESPUÉS -->
<input
  type="text"
  id="mpCardholderName"
  placeholder="Nombre impreso en la tarjeta"
  autocomplete="off"
/>
```

**Aplica este cambio a TODOS los inputs:**
- `mpCardholderName`
- `mpCardNumber`
- `mpExpMonth`
- `mpExpYear`
- `mpSecurityCode`
- `mpIdentificationNumber`

### 4. Remover el Bloqueo en JavaScript

**Archivo:** `tenants_views/razo/carrito.html`

Busca las líneas **~2331-2350** y **COMENTA O ELIMINA** el bloqueo de Mercado Pago:

```javascript
// ❌ ELIMINAR O COMENTAR ESTE BLOQUE
/*
if (metodo === "mercadopago") {
  if (typeof Swal !== "undefined" && Swal?.fire) {
    await Swal.fire({
      icon: "warning",
      title: "Método de pago no disponible",
      html: "<p>Estamos actualizando nuestra plataforma de pagos.</p>...",
      confirmButtonText: "Entendido",
      confirmButtonColor: "#F97316",
    });
  } else {
    alert("Mercado Pago está temporalmente deshabilitado...");
  }
  // Cambiar automáticamente a Crédito si está disponible
  if (creditoDisponible && creditSummary) {
    setMetodoPago("credito");
  } else {
    setMetodoPago("transferencia");
  }
  return;
}
*/
```

También busca las líneas **~2367-2379** y **COMENTA O ELIMINA** el segundo bloqueo:

```javascript
// ❌ ELIMINAR O COMENTAR ESTE BLOQUE
/*
if (metodo === "mercadopago") {
  if (typeof Swal !== "undefined" && Swal?.fire) {
    Swal.fire({
      icon: "warning",
      title: "Método de pago no disponible",
      ...
    });
  }
  return;
}
*/
```

### 5. Verificar el Backend

**Archivo:** `controllers/pedidosController.js`

Asegúrate de que el backend maneje correctamente el método `mercadopago`. Busca alrededor de la línea **~662**:

```javascript
if (metodoPago === "mercadopago") {
  pedidoPagado = false;
  pedidoEstatus = "Esperando Surtido";
  pedidoTransaccionId = null;
}
```

Este código ya está implementado y no requiere cambios.

---

## Pruebas Recomendadas

Después de reactivar Mercado Pago, realiza las siguientes pruebas:

### 1. Prueba de Tarjeta de Crédito (Modo Test)

Usa estas tarjetas de prueba de Mercado Pago:

| Tarjeta | Número | CVV | Fecha | Resultado |
|---------|--------|-----|-------|-----------|
| Visa | 4509 9535 6623 3704 | 123 | 11/25 | ✅ Aprobado |
| Mastercard | 5031 7557 3453 0604 | 123 | 11/25 | ✅ Aprobado |
| Visa | 4074 5957 4450 7763 | 123 | 11/25 | ❌ Rechazado |

### 2. Flujo Completo de Compra

1. Agregar productos al carrito
2. Proceder al checkout
3. Seleccionar "Mercado Pago"
4. Ingresar datos de tarjeta de prueba
5. Confirmar pedido
6. Verificar que el pedido se cree con estatus "Esperando Surtido"
7. Verificar que se envíe el email de confirmación

### 3. Verificación en Base de Datos

```sql
-- Verificar que el pedido se guardó correctamente
SELECT 
  pedidoid, 
  metodopago, 
  estatus, 
  pagado, 
  transaccionid
FROM pedidos
WHERE metodopago = 'mercadopago'
ORDER BY fechapedido DESC
LIMIT 5;
```

---

## Troubleshooting

### Error: "No se pudo procesar el pago"

**Causa:** Credenciales incorrectas o expiradas.

**Solución:**
1. Verifica las credenciales en `.env`
2. Asegúrate de usar credenciales de TEST para pruebas
3. Reinicia el servidor después de cambiar `.env`

### Error: "Token inválido"

**Causa:** La Public Key en el frontend no coincide con el Access Token del backend.

**Solución:**
1. Verifica que ambas credenciales sean del mismo entorno (TEST o PROD)
2. Verifica que la Public Key esté correctamente configurada en `carrito.html` (línea ~1560)

### La tarjeta no aparece como opción

**Causa:** No se removieron todos los atributos `disabled` o estilos `pointer-events: none`.

**Solución:**
1. Revisa el Paso 2 de este documento
2. Inspecciona el elemento en el navegador para verificar que no tenga clases `disabled`

---

## Notas Importantes

⚠️ **Seguridad:**
- NUNCA subas credenciales de producción al repositorio
- Usa variables de entorno para todas las credenciales
- Mantén las credenciales de TEST separadas de las de PROD

💡 **Recomendación:**
- Prueba primero en modo TEST antes de activar en producción
- Monitorea los logs del servidor durante las primeras transacciones
- Configura webhooks de Mercado Pago para recibir notificaciones de pago

📧 **Soporte:**
- Documentación oficial: https://www.mercadopago.com.mx/developers
- Dashboard de Mercado Pago: https://www.mercadopago.com.mx/developers/panel

---

**Última actualización:** Enero 2026
**Estado:** Deshabilitado temporalmente
**Responsable:** Equipo de Desarrollo RazoConnect
