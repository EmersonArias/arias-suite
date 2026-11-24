# Validación de Materiales y pedidos y Planificador horario

Fecha: 15/11/2026. Base: staging 9f342e23bed2cf679093e2de1c20964704714df8.

## Resultado

Compilación TypeScript y Vite correcta. Pasan 18 pruebas locales con datos ficticios, ejecutables con `npm run validate:modules` (Node 24). No equivale a una validación completa del guardado autenticado en producción.

### Defectos reproducidos y corregidos

- Materiales: dos artículos seleccionados más una tercera fila vacía bloqueaban la revisión. Se omiten las filas intactas; las filas parcialmente completadas siguen requiriendo validación. El botón muestra el motivo si faltan datos. Se comprueban cantidades positivas, precisión de dos decimales y límite numeric(12,2).
- Materiales PDF: 120 líneas de observaciones desbordaban la hoja (2.900 caracteres fuera del papel en la reproducción previa). Ahora se paginan metadatos y observaciones y se reserva el pie en todas las hojas.
- Planificador: al filtrar vacaciones de varios operarios, los totales incluían turnos ocultos de otros operarios en fechas coincidentes. Pantalla y totales aplican ahora el mismo predicado de estado.

### Evidencias

- 18/18 pruebas: filas vacías/parciales, cantidades, turnos partidos de ocho horas, turnos nocturnos, horas previstas frente a reales, vacaciones pendientes de confirmar y de años anteriores, fines de semana, semanas ISO, filtros de totales, PDF corto y extenso y protecciones del entorno local.
- PDF de petición: una hoja con una línea de material; cuatro hojas con 35 artículos y 120 líneas de observaciones. Texto final y pies presentes. Cero caracteres fuera de las páginas, comprobado con pdfplumber. Primera hoja de ambos documentos revisada visualmente mediante renderizado.
- Exportación del planificador: función real de exportación ejecutada con dependencias de PDF y datos ficticios inyectados, sin navegador ni Supabase. Agosto de 2026 (seis semanas), tres técnicos: una hoja A4 vertical. Se comprobó título, nombres, colores de vacaciones y festivo y horario partido. Ruta de exportación no mensual: dos hojas apaisadas para la misma muestra. Cero caracteres fuera de página en ambos casos. El caso no mensual no representa un año completo.
- Consulta de solo lectura: presentes nueve tablas de materiales/stock/planificador y RLS activada con políticas. Esto no prueba la separación efectiva de permisos entre hoteles.
- Auditoría npm inicial: 13 avisos (9 moderados, 3 altos, 1 crítico). Actualización compatible del lockfile: 7 moderados de herramientas de desarrollo, cero altos/críticos. `npm audit --omit=dev`: cero avisos conocidos. No se han forzado versiones incompatibles.
- ESLint de módulos nuevos y staffModel: correcto. Los componentes conservan errores previos de efectos/asignaciones/escapes y avisos de dependencias de hooks; no se declara limpio el lint global.
- Vite conserva avisos de tamaño de bundle y de importaciones dinámicas de jsPDF que también se importa estáticamente.

## Límites y cierre pendiente

- No se ejecutaron guardados, cambios de estado, movimientos de stock, migraciones, correos ni despliegues de Edge Functions contra los datos reales.
- La vista previa comparte la configuración de Supabase con producción. Una rama Git no aísla datos.
- No se verificó el flujo completo de navegador autenticado, guardado, recarga y descarga desde el historial. El navegador automatizado local no pudo arrancar por restricciones del entorno.
- Pendientes de validación funcional aislada: persistencia y duplicados de solicitudes, permisos entre hoteles, movimientos de stock concurrentes y sincronización de horarios/ausencias con Supabase.
- El envío de correo y las autorizaciones internas continúan aplazados por decisión del usuario. El flujo previsto es guardar y descargar el PDF para adjuntarlo manualmente.
- Producción no se publica como parte de esta validación. Las correcciones quedan en staging hasta autorización expresa.
