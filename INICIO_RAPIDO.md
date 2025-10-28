# 🚀 Guía de Inicio Rápido - RazoConnect

## ⚡ Formas de Iniciar el Servidor

### 1. Más Fácil - Doble Click (Windows)
```
📁 start.bat
```
Simplemente haz doble click en `start.bat` y el servidor iniciará automáticamente.

---

### 2. Desde VS Code - Presiona F5
```
Presiona: F5
```
El servidor iniciará en modo debug. Puedes poner breakpoints y depurar código.

---

### 3. Terminal de VS Code
```bash
npm run dev        # Con auto-restart (recomendado)
npm start          # Modo producción
node index.js      # Directo
```

Abre terminal con: `Ctrl + Ñ` o `Ctrl + '`

---

### 4. Tareas de VS Code
```
Ctrl + Shift + P > Tasks: Run Task > Iniciar Servidor RazoConnect
```

---

## 🔐 Credenciales de Administrador

```
URL:      http://localhost:3000/login.html
Email:    admin@razoconnect.com
Password: Admin123!
```

El login detectará automáticamente que eres admin y te redirigirá al panel.

---

## 📦 Crear Administrador Inicial

Si aún no tienes un administrador:

```bash
node insert-admin.js
```

---

## 🛠️ Comandos Útiles

```bash
# Instalar dependencias
npm install

# Iniciar servidor con auto-restart
npm run dev

# Iniciar servidor normal
npm start

# Ver estado de la base de datos
# Ir a: http://localhost:3000/api/health
```

---

## 🌐 URLs Importantes

### Público
- Landing: http://localhost:3000/
- Login: http://localhost:3000/login.html
- Registro: http://localhost:3000/registro.html

### Cliente
- Catálogo: http://localhost:3000/catalogo.html
- Carrito: http://localhost:3000/carrito.html
- Dashboard: http://localhost:3000/dashboard.html

### Admin
- Dashboard: http://localhost:3000/admin-dashboard.html
- Pedidos: http://localhost:3000/admin-pedidos.html
- Productos: http://localhost:3000/admin-agregar-producto.html
- Inventario: http://localhost:3000/admin-inventario.html
- Agentes: http://localhost:3000/admin-agentes.html
- Comisiones: http://localhost:3000/admin-comisiones.html

---

## 🐛 Solución de Problemas

### Error: "Cannot find module"
```bash
npm install
```

### Error: Puerto 3000 en uso
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID [número_del_proceso] /F
```

### Error de Base de Datos
1. Verifica que PostgreSQL esté corriendo
2. Verifica las credenciales en `.env`
3. Ejecuta el script `BD V01.sql`

---

## 💡 Tips

- **Reinicio automático:** Usa `npm run dev` (nodemon detecta cambios)
- **Ver logs:** Todos los errores aparecen en la terminal
- **Detener servidor:** Presiona `Ctrl + C` en la terminal
- **Múltiples terminales:** Puedes abrir varias con `Ctrl + Shift + Ñ`

---

## 📚 Documentación Completa

Para más información detallada, consulta: `README.md`
