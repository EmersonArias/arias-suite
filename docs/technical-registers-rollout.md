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

## Aplicación realizada el 17/11/2026

La migración `20261117093753_technical_book_records.sql` es aditiva: crea dos tablas y su validación; no actualiza ni elimina registros existentes, ni modifica las migraciones congeladas 046–063.

La copia manual se extrajo por consultas de lectura y se conservó como archivo ZIP privado. Se verificó en PostgreSQL WASM aislado la recuperación de 67 tablas y 132.604 filas, con 328 restricciones de datos. Después se aplicó la migración sobre esa recuperación: 16 plantillas nuevas y recuentos originales sin cambios.

Alcance de la copia: esquema `public` y sus datos. Incluye catálogos de columnas, restricciones, índices, funciones, políticas, triggers, concesiones y secuencias. No contiene cuentas ni credenciales del esquema gestionado `auth`, otros esquemas gestionados ni archivos de Storage; estos servicios no se modifican en este cambio. La extracción es por tablas y no constituye una instantánea transaccional global.

Archivo: `Arias_Suite_copia_manual_2026-11-17.zip`; SHA-256: `eae15040e18882c2eebeb1d8b02d65774850d392a79f37a03ec0c9ba07cdf664`.

La migración `technical_book_records` se aplicó al proyecto activo. Consultas de verificación: 16 plantillas, cero registros de ensayo, RLS activado en ambas tablas, SELECT denegado a anon y DELETE denegado a authenticated. Con contexto de PRUEBA: maintenance.view=true, maintenance.create=false, maintenance.update=false. Los avisos del asesor de seguridad permanecen en las categorías y cantidades preexistentes.

El commit probado `c69ccd7f558571630a99d4403b4feef408be1998` se ha incorporado a staging y a la rama de producción.
Procedimiento usado y comprobaciones de publicación:

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

La prueba aislada de restauración no sustituye a la comprobación pendiente del respaldo de producción. No se realizaron guardados de prueba en el proyecto activo.
