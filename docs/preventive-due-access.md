# Acceso a preventivos según vencimiento

Preparado en `feature/preventive-due-access`, desde `staging` (c69ccd7). No aplicado a Supabase ni publicado en producción.

## Comportamiento preparado

- En los libros técnicos se muestran los controles pendientes. Los que aún no corresponden se ocultan del formulario y se pueden consultar, con su próxima fecha, en un apartado desplegable. Cuando todos están realizados, Guardar y Finalizar quedan desactivados y se indica la próxima fecha.
- Los controles de legionela se calculan por hotel y actividad, conservando diario/semanal/mensual/variable en un único módulo. Un control completado no da por completados los demás.
- Los otros libros con frecuencia verificada se calculan por hotel, libro, equipo y ubicación. Se normalizan espacios y mayúsculas. Es necesario utilizar una identificación estable del equipo; los campos actuales son libres, no una referencia obligatoria al inventario.
- Solo cuenta una ejecución FINAL original con resultado registrado. Un borrador, un No aplica o una rectificación no abre ni desplaza un ciclo. Las rectificaciones conservan fecha, equipo y selección de controles del original.
- Semanal significa siete días desde la ejecución real. Meses y años usan calendario y ajustan los finales de mes. Los controles vencidos continúan pendientes, sin marcarlos como realizados ni reconstruir revisiones omitidas.
- Las frecuencias de los libros sin columna de frecuencia proceden del PAM fuente revisado: bombas/climatizadores semestral; fancoils de habitaciones, cuadros BT y fotoluminiscentes anual; emergencias, cortafuegos, PCI y calibraciones trimestral. No se inventa frecuencia para fancoils comunes ni fichas auxiliares. La toma de muestras permanece según plan, sin fecha automática inventada.
- PAM: las pantallas de planes, listado y detalle desactivan la ejecución antes de `next_due_date`, con un mensaje. Un plan periódico sin fecha requiere programación. Los planes variables sin fecha continúan manuales.
- Tickets: tanto listado como detalle impiden comenzar o completar un preventivo futuro. Consultar, asignar y preparar la gestión siguen disponibles. Los correctivos no reciben este bloqueo.
- Fecha civil de Europe/Madrid. Los formularios actualizan el día al cambiar la fecha o volver al primer plano. Los libros recargan el historial al recuperar el foco; el guardado vuelve a consultar las revisiones antes de enviar.
- La migración también verifica los vencimientos al escribir: fichas parciales, bloqueo por control, serialización mediante bloqueo transaccional, guardas de ejecuciones y estados de tickets. No elimina ni reescribe registros existentes ni modifica las migraciones congeladas.
- Historial, PDF y la protección de solo lectura de PRUEBA se conservan.

## Límites que hay que conservar al revisar

- Este cambio no realiza la integración atómica libro–ejecución PAM–ticket. Actualmente son historiales distintos: una revisión del PAM no completa automáticamente los controles del libro, ni finalizar un libro cierra el ticket. Tampoco se heredan cambios particulares de periodicidad de un plan a un libro sin asociación explícita. Unificar ese circuito requiere vincular las fichas a planes/equipos estables, especialmente donde varios libros PCI comparten planificación. No debe presentarse este cambio como esa integración terminada.
- Los accesos antiguos siguen disponibles para consultar históricos; no se incorporan automáticamente sus datos al calendario nuevo.
- Piscina y spa permiten varias lecturas al día. No se impone un máximo de una lectura por confundir periodicidad diaria con número de mediciones. Sus formularios actuales no disponen de historial persistido en Supabase; su desarrollo queda pendiente del circuito de calidad del agua.
- El seguimiento visual de habitaciones y los proyectos puntuales no se consideran revisiones periódicas finalizadas del libro. No se bloquean incidencias, observaciones ni trabajos correctivos.
- No se ha probado con sesiones autenticadas ni se han realizado escrituras en el proyecto activo. PGlite verifica SQL y permisos de forma aislada; no sustituye a una prueba de carga concurrente de PostgreSQL con conexiones distintas.

## Verificación

`npm run validate:preventives`: fechas, aislamiento por control/equipo, registros parciales, bloqueo SQL y mantenimiento programado. `npm run validate:books`: formulario, historial, PDF, semanal oculta y diarios disponibles. También `npm run build`, `npm run validate:books:database`, `npm run validate:demo` y `npm run validate:navigation`.

## Publicación

AGENTS.md exige indicación del usuario para producción. Antes de aplicar esquema: revisar estas limitaciones, comprobar una copia recuperable actual y ejecutar las verificaciones aisladas. Aplicar únicamente `20261117224212_preventive_due_access.sql` y después desplegar el frontend compatible. La migración es transaccional. No ejecutar pruebas de escritura contra la base activa. No restaurar ni borrar historiales para revertir un despliegue.
