# Organización de Arias Suite

## Criterio

Las áreas permanentes se muestran en el menú lateral de escritorio y en el menú desplegable del móvil. Inicio contiene accesos personales, identificados como favoritos, y conserva el hotel y las herramientas de usuario. Un trabajo concreto no se convierte en un módulo independiente por estar fijado en Inicio.

Referencias de organización consultadas: [MaintainX: vistas de trabajo](https://help.getmaintainx.com/view-and-filter-work-orders), [Limble: navegación](https://help.limblecmms.com/en/articles/7157630-limble-overview-navigation) y [Fracttal: tareas](https://help.fracttal.com/hc/es-es/articles/25163247368205-Tareas-y-c%C3%B3mo-ingresar-al-m%C3%B3dulo). Se adopta la separación entre áreas, planes, ejecución y vistas de estado; se mantienen los iconos 3D de Arias Suite.

## Áreas

- Mantenimiento: incidencias y correctivos, preventivos, proyectos y mejoras; consultas de pendientes, intervenciones e historial.
- Registros técnicos: controles y mediciones del hotel.
- Equipos e instalaciones: catálogo técnico y estructura del hotel.
- Materiales y pedidos: catálogo, stock y solicitudes de material.
- Empresas y proveedores: directorio existente de empresas, contactos y servicios, sin crear otro catálogo paralelo.
- Personal y turnos: planificador horario y fichajes. El PAM no pertenece al planificador horario del personal.
- Documentación y auditoría: informes disponibles y consulta de registros e históricos. No se presenta como implementado un repositorio nuevo de certificados.

## Ubicación de los trabajos

| Función | Ruta principal | Compatibilidad |
| --- | --- | --- |
| LED de armario | `/maintenance/proyectos/led-armario` | `/maintenance/room-projects` redirige conservando filtros y ancla |
| Fancoils por habitación | `/maintenance/preventivos/fancoils` | `/maintenance/fancoil-preventives` y `/fancoils` redirigen |
| Planes PAM | `/maintenance/pam` | `/pam` redirige |
| Trabajo pendiente | `/maintenance/trabajos` | El listado existente `/maintenance/pending` se conserva |
| Documentación | `/documentacion` | `/maintenance/audit` redirige |

La entrada antigua Fancoils en Registros abría una pantalla vacía sin datos. Se retira de ese índice y se conserva su URL como acceso al seguimiento real. Las tablas, filtros, exportaciones y claves de almacenamiento existentes de LED y fancoils no se han cambiado.

## Favoritos

Selección inicial: LED, fancoils, registros técnicos y planificador horario. Se pueden fijar hasta ocho accesos, quitarlos, restaurar la selección inicial o dejarla vacía. La preferencia está separada por usuario y hotel, se valida contra el catálogo permitido y se guarda exclusivamente en este navegador. No se sincroniza todavía entre dispositivos. Los trabajos del hotel continúan usando su persistencia existente.

## Límites de esta reorganización

El listado por ubicaciones, los correctivos y los preventivos conservan sus registros separados. La nueva página Trabajos pendientes los organiza mediante vistas explícitas, incluidas las de atrasados; no muestra un total combinado ni afirma que se hayan fusionado.

No se han reiniciado estados ni creado ciclos nuevos de fancoils. La programación de campañas recurrentes, su historial por ciclo y la unificación futura de pendientes requieren una fase de datos con pruebas aisladas. No se han aplicado migraciones, cambiado permisos ni escrito registros reales para validar esta navegación.

## Verificación

- Compilación TypeScript/Vite y ESLint de la navegación nueva correctos.
- 27 pruebas locales: 9 de navegación y preferencias, más 18 de materiales, PDF, horarios y protecciones del entorno.
- Las pruebas de navegación comprueban destinos reales de App, anidación bajo ProtectedRoute, rutas públicas fuera del menú interno, compatibilidad de enlaces antiguos, conservación de filtros, clasificación de áreas, migas, iconos, favoritos y cancelación al salir con cambios sin guardar. No sustituyen una auditoría de permisos de datos.
- El menú móvil utiliza un diálogo nativo para foco y cierre con Escape. La impresión oculta menú y migas.
- No se pudo realizar revisión visual ni interacción completa en navegador desde este entorno; la vista previa debe revisarse en escritorio y móvil antes de publicar.
- El Supabase de Preview sigue compartido con producción; no hacer guardados de prueba contra los datos reales.
