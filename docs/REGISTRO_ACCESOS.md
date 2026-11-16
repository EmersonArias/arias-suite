# Registro de accesos

Acceso desde Mi perfil o Administración → Registro de accesos, solo para administradores de plataforma activos. API paginada y con filtro por usuario/fecha, con comprobación del permiso en PostgreSQL. No se elevan permisos de PRUEBA ni de administradores de cliente.

Se conservan nuevos inicios de sesión correctos desde `auth-login`, sin contraseñas ni tokens. Se registra la IP comunicada por la pasarela y el user agent recibido, con longitudes acotadas. Estos metadatos pueden verse afectados por proxies, VPN o cabeceras manipuladas y no identifican a una persona. El error de telemetría no bloquea un inicio válido; se emite únicamente el aviso genérico `access_audit_write_failed`.

La consulta complementa los eventos con sesiones todavía conservadas y el último inicio conocido de cuentas sin sesión. Evita duplicar una sesión que ya tenga un evento. La renovación se muestra separada y nunca se presenta como actividad humana ni como indicador «en línea». El historial antiguo no puede reconstruirse si los datos originales no existen.

La ubicación física figura como «No disponible». No se inventa una ciudad a partir de la IP, no se solicita GPS y no se envían IP a proveedores externos. Un proveedor de geolocalización o una base local futura requerirían una decisión adicional sobre precisión, privacidad y coste.

## Aplicación y recuperación

La migración es aditiva: crea `user_access_events` y la API de solo lectura `list_user_access_log`; no cambia tablas de negocio, cuentas, sesiones ni políticas existentes. Antes de aplicar se comprobó que la tabla no existía y que los tipos de auth coinciden con el contrato probado. La fuente de `auth-login` versión 5 se recuperó del proyecto y coincide, normalizando CRLF, con la copia del commit anterior `c8ab7fe48f7693f0d526c85ea5fb5bc59b7a8a08`. Esa fuente permite restaurar la función sin borrar el historial nuevo. No debe eliminarse la tabla si contiene eventos.

Las pruebas SQL se ejecutan en PostgreSQL embebido aislado (PGlite 0.5.16) con usuarios sintéticos, nunca contra los datos activos. Comprueban migración, RLS, denegación para anónimo/consulta, administrador inactivo, filtros, paginación y deduplicación. Las pruebas del login y la interfaz usan servicios simulados.

Para reproducir SQL: instalar `@electric-sql/pglite@0.5.16` fuera del repositorio y ejecutar `ARIAS_AUDIT_TEST_NODE_MODULES=/ruta/node_modules node scripts/validate-access-log-db.mjs`. Las demás pruebas están en `npm run validate:access-log`.
