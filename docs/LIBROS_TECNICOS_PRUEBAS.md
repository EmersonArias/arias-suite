# Libros técnicos basados en los Excel

## Alcance publicado

Se incorpora una zona separada en `/registros-tecnicos/pruebas`, accesible mediante **Probar los libros**. Contiene 16 formularios, 201 campos y controles derivados de 12 documentos de origen, además de las referencias de solo lectura del plan anual y relación de aparatos. Los formularios no sustituyen los módulos operativos. Piscina, SPA y su componente compartido no se modifican.

| Código / documento | Formulario |
| --- | --- |
| R-SSTT-01-04 | Autocontrol de Legionella, con selección de controles diarios, semanales, mensuales o variables |
| R-SSTT-01-05 | Bombas |
| R-SSTT-01-06 | Climatizadores / extractores y fancoils de zonas comunes, en formularios distintos |
| R-SSTT-01-07 | Fancoils de habitaciones; conserva sus 19 controles |
| R-SSTT-01-08 | Cuadros BT |
| R-SSTT-01-09 | Elementos fotoluminiscentes |
| R-SSTT-01-10 | Luces de emergencia |
| R-SSTT-01-11 | Puertas cortafuegos |
| R-SSTT-01-12 | Extintores, BIE, equipos / alarmas PCI y rociadores |
| R-SSTT-02-02 | Calibraciones |
| Ficha fondo habitaciones | Revisión a fondo |
| Ficha revisión habitaciones | Averías y materiales por habitación |

R-SSTT-01-01 se consulta con sus 34 filas de planificación y cuatro posiciones por mes, sin inventar fechas a partir de esas posiciones. R-SSTT-01-02 aporta 309 referencias de inventario del archivo, sin importarlas a la base de datos. El antiguo PAM, el plano de habitaciones y el inventario auxiliar de correas de UTAs no se convierten en otro libro de inspecciones.

## Guardado y trazabilidad de las pruebas

- Los datos de ensayo se guardan solo en `localStorage`, en una clave versionada que separa usuario y hotel. No hay migraciones ni llamadas de escritura a Supabase. No se sincronizan entre dispositivos; borrar los datos del navegador elimina los ensayos.
- No hay resultados aprobados por defecto. Se permite guardar borradores con controles incompletos, pero con fecha, hora, equipo y técnico. Finalizar exige completar todos los controles seleccionados.
- Una avería documentada permite finalizar la revisión. La revisión realizada y el equipo sin averías son conceptos distintos. No se actualizan los estados del gráfico de habitaciones ni el PAM.
- No aplica y los resultados adversos necesitan explicación. Puertas exige fotografía cuando se indican objetos que impiden su funcionamiento, según la ficha.
- Las revisiones finalizadas quedan inmutables en la interfaz. Rectificar crea otra versión y conserva el original. Se guarda una copia de la definición de campos y su archivo fuente con cada ficha. Esto no equivale a un historial de auditoría protegido en un servidor.
- Se comprueban cambios concurrentes antes de actualizar borradores. Los fallos de cuota o de lectura no se presentan como guardados correctos ni sobrescriben datos ilegibles.
- PDF individual y PDF del historial filtrado, ambos identificados como documentos de prueba en todas las páginas. Incluyen resultados, observaciones, responsable, versión, referencias al Excel y fotografías.

## Fidelidad al documento y asuntos pendientes

`scripts/import-technical-book-templates.py` lee XML de los Excel sin modificarlos y genera `bookDefinitions.ts`. Cada campo conserva archivo, hoja, celda, etiqueta original y SHA-256. Solo se extraen cabeceras, referencias de equipos y planificación, nunca revisiones históricas completadas.

La plantilla del PAM indica 2025 y la de Legionella 2023. Sus límites no se declaran normativa vigente ni se activan alarmas. Se conservan las dos filas repetidas de apertura de grifos de Legionella y su fila de temperatura AFCH con referencia de comprobación; están señaladas para revisión. No se inventa una unidad de caudal V3, el significado de TA/ACT/ELEC ni el de KG de BIE. Las variantes de hojas no se fusionan. La columna sin nombre de puertas de 2024 se deja documentada como pendiente; se usa la cabecera titulada de 2025.

La puesta en uso oficial requiere confirmar versión vigente, inventario y campos ambiguos, preparar persistencia en servidor y permisos, probar la migración en una base aislada y verificar una copia recuperable antes de modificar producción. El tablero de fancoils seguirá siendo una guía visual vinculable a estas revisiones; esta entrega no altera su historial ni lo reinicia.

## Validación

- `npm run validate:books`: validaciones de formularios, almacenamiento aislado, rectificaciones, concurrencia, filtros, PDF y pruebas de interacción con almacenamiento simulado.
- `npm run validate:modules` y `npm run validate:navigation`: regresiones existentes.
- Compilación TypeScript / Vite y ESLint de los archivos editados.
- PDF de todos los formularios y ejemplo largo generados en pruebas; revisión visual de paginación de Fancoils y Legionella.
- La comprobación de interfaz usa componentes y HTML renderizado; no sustituye una sesión de navegador autenticada. Chromium no pudo iniciarse por restricciones de sockets del entorno.
