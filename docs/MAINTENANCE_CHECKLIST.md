# 🛠️ Checklist de Mantenimiento - RazoConnect

## 📅 Mantenimiento Diario (5 min)

### ✅ Limpieza Automática (Ya configurado)
- [x] GitHub Actions artifacts cleanup (2 AM UTC)
- [x] Logs antiguos (mantener 7 días)

### 🔍 Revisiones Rápidas
- [ ] Revisar logs de errores críticos
- [ ] Verificar que todos los servicios estén funcionando
- [ ] Revisar espacio en disco

## 📅 Mantenimiento Semanal (15 min)

### 🔒 Seguridad
- [ ] Ejecutar: `npm run security:audit`
- [ ] Revisar vulnerabilidades críticas
- [ ] Actualizar dependencias si es necesario

### 📊 Monitoreo
- [ ] Revisar métricas de rendimiento
- [ ] Verificar uso de base de datos
- [ ] Revisar GitHub Actions (workflows fallidos)

### 🧹 Limpieza
- [ ] Ejecutar: `npm run cleanup:local`
- [ ] Revisar artifacts en GitHub (manual si es necesario)

## 📅 Mantenimiento Mensual (30 min)

### 🔄 Actualizaciones
- [ ] Actualizar Node.js si hay nueva versión LTS
- [ ] Revisar actualizaciones de dependencias principales
- [ ] Probar en staging antes de producción

### 📈 Reportes
- [ ] Generar reporte de uso del sistema
- [ ] Revisar tendencias de errores
- [ ] Documentar cambios importantes

### 🔧 Optimización
- [ ] Revisar queries lentas de base de datos
- [ ] Optimizar imágenes si es necesario
- [ ] Revisar configuración de cache

## 🚨 Emergencias (Cuando sea necesario)

### ⚡ Acciones Inmediatas
- [ ] Revisar logs del último error
- [ ] Verificar estado de servicios críticos
- [ ] Comunicar al equipo si es necesario

### 🔧 Recuperación
- [ ] Restaurar desde backup si es necesario
- [ ] Revisar rollback si hay deploy problemático
- [ ] Documentar causa y solución

## 🎯 Scripts Útiles

```bash
# Limpieza completa local y remota
npm run maintenance:clean

# Revisión de seguridad
npm run security:audit

# Ver logs en tiempo real
npm run dev:logs

# Limpieza de artifacts (manual)
npm run cleanup:artifacts

# Ejecutar tests para verificar estabilidad
npm test
```

## 📞 Contactos de Emergencia

- **Azure Support**: Para problemas de infraestructura
- **GitHub Support**: Para problemas de Actions
- **Database Admin**: Para problemas de PostgreSQL

## 📋 Notas Importantes

- **Nunca** hacer cambios en producción sin testing
- **Siempre** hacer backup antes de actualizaciones mayores
- **Documentar** cualquier cambio significativo
- **Monitorear** después de cualquier cambio

## 🔗 Recursos Útiles

- [GitHub Actions Dashboard](https://github.com/dferram/RazoConnect/actions)
- [Azure Portal](https://portal.azure.com)
- [Logs Directory](./logs/)
- [Documentation](./docs/)

---

**Última actualización**: Marzo 2026  
**Responsable**: Equipo de Desarrollo RazoConnect
