# Registros técnicos: sustitución de formularios

La rama `feature/technical-registers-database` parte de `staging` (260e7367). La producción actual se conserva en `feature/arias-suite-common-ui-v1`.

## Comportamiento

- Los 16 formularios nuevos guardan las revisiones del hotel en `technical_book_records`.
- Las plantillas versionadas del servidor se conservan en `technical_book_templates`. El servidor valida la ficha y sus controles, además de la validación de interfaz.
- Se comparten los historiales entre usuarios con `maintenance.view` del mismo hotel. Los borradores solo los modifica su autor con permiso de actualización.
- Los registros finalizados no se actualizan ni se eliminan. Se rectifican con una nueva ficha enlazada, motivo y número de revisión. Una revisión solo puede tener una rectificación inmediata.
- PRUEBA no puede insertar ni actualizar, tanto desde la interfaz como directamente por RLS. Puede consultar y solicitar PDF; sus documentos conservan marca de prueba.
- La versión del servidor evita sobrescribir un borrador cambiado en otra sesión.
- Fotografías incluidas en el registro: máximo 3 de 1 MB. La lectura del historial está paginada para evitar el límite de respuesta de PostgREST.
- Los antiguos accesos de inspección dirigen al formulario nuevo. Las pantallas anteriores quedan bajo `/registros-tecnicos/anteriores/...`.
- El inventario de cuadros eléctricos y aparatos, piscina, spa, preventivo diario, PAM, tickets y seguimiento visual de fancoils se conservan.
- Los ensayos locales anteriores no se borran ni se convierten automáticamente en registros reales. No se ejecuta ninguna copia o reinterpretación de datos históricos.

## Aplicación pendiente

La migración `20261117093753_technical_book_records.sql` es aditiva: crea dos tablas y su validación; no actualiza ni elimina registros existentes, ni modifica las migraciones congeladas 046–063.

Antes de aplicarla al proyecto activo, AGENTS.md exige verificar una copia recuperable. Esta comprobación está pendiente: el conector no ofrece consultas de respaldos y el panel requiere una sesión autenticada.

Tras verificar el respaldo:

1. Confirmar que no existen los objetos nuevos y que la rama de producción conserva el mismo commit revisado.
2. Aplicar únicamente esta migración mediante `apply_migration`.
3. Consultar plantillas, RLS, concesiones, validación y ausencia de registros de ensayo en producción. No ejecutar toda la carpeta de migraciones antiguas.
4. Publicar el commit probado en la rama de producción y comprobar que Vercel termina en READY.
5. Verificar navegación y consulta en la aplicación, y que PRUEBA sigue sin permisos de escritura.

Si la publicación falla, volver al commit anterior del frontend y conservar las tablas nuevas. No borrar tablas que puedan contener registros reales. La migración es transaccional; un fallo al aplicarla debe revertirse íntegramente. No es necesario restaurar tablas anteriores porque no se modifican.

## Verificación local

- `npm run build`
- `npm run validate:books`: formularios, validación y PDF.
- `npm run validate:books:database`: 16 plantillas, validación SQL, permisos, aislamiento por hotel, finalización, rectificación única y restauración de copia en PostgreSQL WASM aislado (PGlite).
- `npm run validate:demo`
- `npm run validate:navigation`

La prueba aislada de restauración no sustituye a la comprobación pendiente del respaldo de producción. No se han aplicado migraciones ni realizado guardados de prueba en el proyecto activo.
