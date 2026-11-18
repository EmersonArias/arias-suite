# ARIAS SUITE — MAESTRO DE CONTINUIDAD
## Documento de transferencia para continuar el desarrollo en otro chat

**Fecha de referencia:** 08/10/2026  
**Producto:** Arias Suite  
**Módulo principal:** Arias PAM / Mantenimiento  
**Repositorio:** `EmersonArias/arias-pam`  
**Rama activa:** `feature/arias-suite-common-ui-v1`  
**HEAD conocido al redactar este documento:** `b59f046e16995607b17edabc2e8e81fa197c2cb1`  
**Último commit relevante:** `feat(pending): completar acciones con nuevo registro y botones comunes`

---

# 1. OBJETIVO DE ESTE DOCUMENTO

Este documento es la referencia de continuidad para que otro chat pueda retomar Arias Suite sin perder decisiones, contexto, arquitectura, estado técnico ni reglas de trabajo.

El objetivo es **continuar desde el estado real de GitHub**, no reconstruir el proyecto desde cero, no volver a tomar decisiones ya congeladas y no repetir migraciones que ya se han ejecutado.

Este documento NO sustituye al código real. Cuando exista una diferencia entre este texto y GitHub, **GitHub y el código actual tienen prioridad para saber qué existe realmente**, pero las decisiones congeladas descritas aquí deben respetarse salvo que el usuario pida expresamente cambiarlas.

---

# 2. CÓMO DEBE TRABAJAR EL NUEVO CHAT

## 2.1 Regla fundamental

El desarrollo debe hacerse **directamente sobre GitHub**.

No se debe asumir que el proyecto se está desarrollando localmente.

El usuario dispone de Visual Studio / Visual Studio Code, pero **no es necesario usarlo para que el asistente modifique el repositorio** cuando la conexión GitHub está disponible.

El flujo correcto es:

**ChatGPT → conexión GitHub → repositorio → rama activa → leer código actual → modificar código → commit → Vercel**

No se debe inventar código basándose solamente en conversaciones anteriores. Primero hay que leer la versión actual del archivo desde GitHub.

---

# 3. INSTRUCCIONES PARA ENTRAR Y CONECTARSE A GITHUB EN UN CHAT NUEVO

Pegar literalmente esto al comienzo del nuevo chat:

> **CONTINUIDAD ARIAS SUITE**
>
> Necesito que trabajes directamente sobre GitHub, no en local.
>
> Repositorio: `EmersonArias/arias-pam`
>
> Rama activa: `feature/arias-suite-common-ui-v1`
>
> Quiero que leas primero el estado actual de GitHub y trabajes directamente sobre esa rama.
>
> No quiero que me hagas copiar archivos a Visual Studio ni que me propongas trabajar en local como método principal.
>
> Tu trabajo es:
> 1. conectarte a GitHub usando la conexión disponible;
> 2. leer el código actual de la rama;
> 3. localizar los archivos que haya que modificar;
> 4. hacer las modificaciones directamente en GitHub;
> 5. crear los commits correspondientes;
> 6. no tocar migraciones anteriores ya ejecutadas;
> 7. no inventar tablas, campos, rutas ni funciones que no existan sin verificar primero;
> 8. comprobar siempre el estado actual de la rama antes de modificar.
>
> Si no ves inmediatamente dónde está la conexión GitHub, busca/descubre la conexión o herramienta de GitHub disponible en el entorno. No me mandes a configurar Visual Studio ni a trabajar en local.
>
> **Importante:** antes de hacer cambios, confirma leyendo GitHub cuál es el HEAD actual de `feature/arias-suite-common-ui-v1`.
>
> Usa este documento como contexto de continuidad:
> `docs/MAESTRO_CONTINUIDAD_ARIAS_SUITE.md`

---

# 4. QUÉ HACER SI EL NUEVO CHAT DICE QUE NO TIENE GITHUB

No se debe aceptar inmediatamente la respuesta "no puedo entrar a GitHub".

El entorno utilizado para este proyecto dispone de acciones de GitHub capaces de:

- leer archivos;
- buscar código;
- leer commits;
- comparar commits;
- crear archivos;
- actualizar archivos;
- crear commits;
- trabajar sobre ramas;
- consultar estados y otros recursos GitHub.

El nuevo chat debe **descubrir la herramienta/connector de GitHub disponible en su entorno** y usarla.

Si existe una conexión GitHub pero no está siendo utilizada, el problema es de enrutamiento de herramientas, no del proyecto.

---

# 5. VISUAL STUDIO / VISUAL STUDIO CODE

El usuario ha indicado que tiene Visual Studio.

Eso puede servir para trabajar localmente cuando él lo necesite, pero **no es el flujo principal de esta continuidad**.

Para el desarrollo con el asistente:

**No es necesario abrir Visual Studio.**

La forma de trabajo preferida es:

**GitHub directo + commits + Vercel**

Visual Studio puede utilizarse como apoyo para inspeccionar archivos, ejecutar el proyecto localmente o hacer pruebas locales si el usuario lo solicita.

---

# 6. DATOS FIJOS DEL PROYECTO

## Repositorio

`EmersonArias/arias-pam`

## Rama activa

`feature/arias-suite-common-ui-v1`

## HEAD conocido

`b59f046e16995607b17edabc2e8e81fa197c2cb1`

Mensaje:

`feat(pending): completar acciones con nuevo registro y botones comunes`

Este HEAD debe volver a comprobarse antes de seguir trabajando.

---

# 7. REGLAS ABSOLUTAS DE TRABAJO

## 7.1 No asumir

La regla principal del proyecto es:

**NO ASSUME**

Nunca asumir:

- nombres de columnas;
- nombres de tablas;
- nombres de RPC;
- rutas;
- componentes;
- estados;
- permisos;
- estructura de archivos;
- comportamiento de un módulo;
- datos de producción;
- migraciones ejecutadas.

Primero leer GitHub / Supabase según corresponda.

---

## 7.2 No modificar decisiones congeladas

Hay decisiones ya validadas.

No volver a rediseñarlas sin una petición explícita del usuario.

Especialmente:

- Login congelado.
- Migraciones 046–064 ya ejecutadas y congeladas.
- Nunca editar una migración ya ejecutada.
- La siguiente migración nueva será 065+.
- No mezclar trabajos preventivos del PAM con la gestión operativa de Tickets.
- No volver a convertir Tickets en un listado gigantesco de todo el PAM.
- No reintroducir menús laterales grandes.
- No cambiar los términos de interfaz congelados.
- No introducir Arias Pump / sensores / telemetría en Suite V1.

---

# 8. ARQUITECTURA GENERAL DE ARIAS SUITE

Arias Suite es una plataforma técnica para hoteles.

No es:

- un ERP genérico;
- una simple GMAO;
- una aplicación aislada de mantenimiento.

Su objetivo es centralizar:

- conocimiento técnico;
- operaciones;
- mantenimiento preventivo;
- mantenimiento correctivo;
- activos;
- documentación;
- compras;
- stock;
- proveedores;
- contratos;
- auditorías;
- intervenciones;
- consumos;
- lecturas;
- analítica;
- IA preparada desde diseño.

Principios:

- Multiempresa.
- Multihotel.
- Multiusuario.
- Escalable horizontalmente.
- API First.
- PWA.
- Offline First.
- PostgreSQL como núcleo.
- AI First.
- Modelo normalizado.
- Sin duplicación innecesaria.
- Alta trazabilidad.
- Permisos por hotel.
- Arquitectura modular.

---

# 9. JERARQUÍA FUNCIONAL

La jerarquía conceptual principal es:

**Empresa → Hotel → Ubicaciones → Sistemas → Activos → Plan Anual**

En mantenimiento:

**PAM → Planificación → ejecución / gestión → histórico**

Conceptualmente:

**PAM = qué mantenimiento debe hacerse**

**Planificación = cuándo corresponde**

**Tickets = qué trabajo requiere gestión operativa**

**Histórico = qué ocurrió / qué se terminó / qué se rechazó**

**Intervenciones = trabajos relevantes o especiales que deben quedar documentados**

---

# 10. ORDEN ACTUAL DEL CENTRO DE MANTENIMIENTO

El centro de mantenimiento está definido con este orden:

1. Equipos e instalaciones
2. Tickets
3. Trabajos programados
4. Intervenciones
5. PAM
6. Auditoría
7. Configuración

No volver a mezclar el flujo preventivo del PAM dentro de Tickets.

---

# 11. TÉRMINOS VISIBLES CONGELADOS

En interfaz se usan:

- **Tickets** en lugar de "Incidencias".
- **Intervenciones** en lugar de "Actuaciones" como nombre visible del módulo.
- **En gestión** en lugar de "Atendido".
- **Planificador Horario** en lugar de "Control Horario".
- **Notas** en lugar de "Parte de Relevo".

No cambiar estos términos salvo petición expresa.

---

# 12. MIGRACIONES — ESTADO CONOCIDO

El usuario confirmó que están ejecutadas:

**046–064**

No volver a pedir que se ejecuten.

No cambiar ninguna de ellas.

La próxima migración disponible es:

**065**

## 058 — sincronización PAM diario / OT

Responsabilidades principales:

- sincroniza el bloque diario;
- resuelve los 27 activos diarios esperados;
- usa `apparatus_registry`;
- materializa planes de mantenimiento;
- fuerza periodicidad diaria;
- corrige fechas iniciales;
- genera OTs preventivas mediante la función existente.

Estado: **OK / congelada**

## 059 — alertas

Ajustó:

- `COALESCE(next_due_date,start_date)`;
- refresco de alertas en Home.

Estado: **OK / congelada**

## 060 — periodicidad PAM / planificación de tickets

Generaliza la planificación a periodicidades:

- Diario
- Semanal
- Quincenal
- Mensual
- Bimensual
- Trimestral
- Semestral
- Anual

Sincroniza trabajos programados con fechas reales del PAM y evita colisiones.

Estado: **OK / congelada**

## 061 — estados operativos de Tickets

Estados:

- `PENDING` → Pendiente
- `IN_MANAGEMENT` → En gestión
- `IN_PROGRESS` → En curso
- `COMPLETED` → Cerrado
- `REJECTED` → Rechazado

Reglas:

- En gestión no significa trabajo físico iniciado necesariamente.
- En curso representa inicio operativo del trabajo.
- Cerrado / Rechazado pasa al histórico.

Estado: **OK / congelada**

## 062 — importación PENDIENTES

Creó:

`public.maintenance_pending_items`

Importó:

**216 registros**

desde:

`PENDIENTES (1).xlsm`

Conserva:

- ubicación;
- categoría;
- pendiente;
- estado original;
- asignación;
- prioridad;
- observación;
- fecha;
- trazabilidad al archivo/fila.

Tres registros estaban originalmente terminados.

Estado: **OK / congelada**

## 063 — habitaciones bloqueadas

Creó:

`public.maintenance_blocked_rooms`

El bloqueo pertenece a la habitación, no al pendiente.

Campos principales:

- `id`
- `hotel_id`
- `room_number`
- `blocked_at`
- `created_at`

Tiene unicidad por:

`hotel_id + room_number`

Permisos RLS implementados.

Estado: **OK / congelada**

---

# 13. PENDIENTES — ESTADO ACTUAL

Archivo principal:

`src/features/maintenance/pages/MaintenancePendingPage.tsx`

Tabla:

`maintenance_pending_items`

Actualmente la pantalla tiene:

## Cabecera

- Logo Arias.
- Título Pendientes.
- Actualizar.
- Volver.
- Inicio.
- Nuevo pendiente.
- Histórico / Pendientes activos.

Los botones usan los componentes comunes de la aplicación.

## Tarjetas superiores

Actualmente existen cuatro tarjetas:

- Pendientes.
- Prioridad alta.
- Terminados.
- Habitaciones bloqueadas.

Las tarjetas son clicables y aplican los filtros correspondientes.

## Filtros

- Buscar.
- Estado.
- Categoría.
- Prioridad.
- Asignado.
- Habitación:
  - Todas
  - Bloqueadas
  - No bloqueadas
- Limpiar filtros.

## Columna adicional

Existe la columna:

**Bloqueada**

Permite bloquear/desbloquear una habitación desde la tabla.

## Nuevo pendiente

Existe botón:

**Nuevo pendiente**

Permite crear registros desde Arias Suite, con:

- ubicación;
- categoría;
- pendiente;
- prioridad;
- asignado;
- observación.

El origen para estos nuevos registros se marca como `ARIAS_SUITE` y no depende del Excel.

## Modificar

Existe botón de modificar.

Permite editar:

- ubicación;
- categoría;
- pendiente;
- prioridad;
- asignado;
- observación.

## No existe borrado físico como regla

La operación de eliminar debe ser una **desactivación lógica**:

`active = false`

Nunca se debe borrar físicamente un pendiente del histórico operativo sin una decisión expresa.

## Histórico de pendientes

La pantalla ya incluye el concepto de:

**Histórico**

Los registros desactivados quedan conservados.

Desde histórico se debe poder:

- consultar;
- restaurar.

Esto es importante porque permitirá posteriormente estudiar:

- qué habitaciones acumulan más reparaciones;
- qué tipos de incidencias se repiten;
- qué categorías se repiten;
- qué reparaciones tardan más;
- qué elementos producen más carga de mantenimiento.

---

# 14. PENDIENTES — LÓGICA DE HABITACIONES BLOQUEADAS

Se considera habitación cuando `location` contiene un código numérico de 3 o 4 cifras.

Ejemplos válidos:

- 213
- 305
- 805
- 1201
- 1410

No se debe interpretar automáticamente "Hotel", "SPA", "Planta 14", etc. como habitación.

Una habitación puede tener múltiples pendientes.

Ejemplo:

Habitación 1112:

- puerta de baño;
- zócalo;
- lateral;
- bañera;
- etc.

El estado de bloqueo se guarda una sola vez en:

`maintenance_blocked_rooms`

y afecta a todos los pendientes de esa habitación.

Esto evita duplicar el mismo estado.

---

# 15. PROBLEMA DEL FOCO DEL BUSCADOR

Se detectó un problema:

Al escribir una letra en el buscador, la búsqueda se ejecutaba y el foco saltaba al grid.

La causa estaba en:

`useGridKeyboardNavigation.ts`

El grid podía recuperar el foco al cambiar la lista filtrada.

Se modificó el comportamiento para:

- evitar recuperar foco repetidamente;
- no robar el foco a inputs/select/textarea;
- detener la propagación de teclado del buscador de Pendientes.

Archivo:

`src/shared/components/grid/useGridKeyboardNavigation.ts`

No deshacer esta corrección.

---

# 16. COMPONENTES DE BOTONES COMUNES

Los botones comunes se encuentran en:

`src/shared/components/buttons/IconButton.tsx`

y:

`src/shared/components/buttons/ActionButton.tsx`

Navegación:

`src/shared/components/navigation/NavigationButtons.tsx`

Componentes:

- `ActionButton`
- `IconButton`
- `BackButton`
- `HomeButton`

## Regla

Los botones nuevos de una pantalla deben usar estos componentes.

No crear estilos aislados diferentes para cada módulo salvo que exista una razón clara.

La estética general incluye:

- botones redondeados;
- degradado azul discreto;
- sombras suaves;
- comportamiento hover;
- estado disabled;
- consistencia visual.

---

# 17. TICKETS — ESTADO ACTUAL

Archivo:

`src/features/maintenance/pages/MaintenanceWorkOrdersPage.tsx`

Ruta:

`/maintenance/tickets`

Tickets visibles operativamente:

- correctivas;
- avisos / incidencias;
- tickets creados manualmente;
- trabajos que requieren gestión;
- tickets asignados.

Los preventivos del PAM no deben llenar este grid.

Los preventivos se gestionan mediante:

**Trabajos programados / Planificación**

Estados:

- Pendiente
- En gestión
- En curso

Salida:

- Cerrado
- Rechazado

## Botones actuales de cabecera

- Nuevo ticket
- Actualizar
- Reporte
- Histórico
- Volver
- Inicio

El histórico existe en:

`/maintenance/tickets/history`

Archivo:

`MaintenanceWorkOrderHistoryPage.tsx`

---

# 18. HISTÓRICO DE TICKETS

El histórico actual utiliza:

`maintenance_work_orders_resolved`

y recoge:

- Cerrados
- Rechazados

Los preventivos están excluidos del histórico operativo de Tickets cuando corresponde a esta separación funcional.

El histórico sirve para analizar:

- número de trabajos;
- activos repetitivos;
- mantenimientos repetitivos;
- responsables;
- fechas;
- cumplimiento;
- tipo de trabajo.

---

# 19. PLANIFICACIÓN

Archivo:

`src/features/maintenance/pages/MaintenancePlanningPage.tsx`

Ruta:

`/maintenance/planning`

Concepto:

**PAM → Planificación → ejecución**

La pantalla muestra trabajos derivados del PAM.

Filtros:

- Año
- Mes
- Periodicidad
- Estado
- Buscar

Estados visibles:

- Pendiente
- En curso
- Finalizado

Columnas:

- Día
- Semana
- Mes
- Equipo
- Mantenimiento
- Periodicidad
- Estado
- Ticket

Fuentes principales:

- `maintenance_scheduled_jobs`
- `maintenance_plans`
- `apparatus_registry`
- `maintenance_work_orders_resolved`

No crear otra tabla para planificación salvo necesidad real.

---

# 20. INTERVENCIONES

Archivo:

`src/features/actions/pages/ActionsPage.tsx`

Ruta:

`/maintenance/interventions`

Tabla:

`maintenance_actions`

Concepto:

Registro histórico de trabajos relevantes o especiales.

Ejemplos conceptuales:

- sustitución de acumulador;
- hipercloración;
- vaciado de piscina;
- reparación de rótulo;
- trabajos especiales;
- obras;
- sustituciones importantes.

Debe poder recoger:

- título;
- tipo;
- fecha;
- proveedor;
- persona/técnico;
- referencia;
- resultado;
- coste;
- descripción;
- observaciones;
- evidencia cuando se implemente.

No sustituye Tickets ni PAM.

---

# 21. CENTRO DE MANTENIMIENTO

Archivo:

`src/features/maintenance/pages/MaintenanceLandingPage.tsx`

Ruta:

`/maintenance`

Tarjetas principales:

- Equipos e instalaciones
- Tickets
- Trabajos programados
- Intervenciones
- PAM
- Auditoría
- Configuración

Las tarjetas son navegables.

---

# 22. HOME PRINCIPAL

Archivo:

`src/pages/Books/BooksPage.tsx`

Home principal de Arias Suite contiene módulos como:

- Mantenimiento
- Pendientes
- Stock
- Planificador Horario
- Proveedores

Pendientes ya tiene presencia en Home.

---

# 23. HISTÓRICO — OBJETIVO EVOLUTIVO

Una de las decisiones importantes de arquitectura es que "eliminar" no significa perder datos.

Para cualquier registro operativo que deje de estar activo:

**activo → desactivado → histórico**

Esto permite crear analítica futura sobre:

- habitación;
- activo;
- equipo;
- categoría;
- tipo de reparación;
- frecuencia;
- tiempos;
- coste;
- proveedor;
- responsable.

Objetivo final:

Arias Suite debe poder responder preguntas como:

- ¿Qué habitación se repara más?
- ¿Qué equipo falla más?
- ¿Qué activo genera más Tickets?
- ¿Qué tipo de avería se repite?
- ¿Qué proveedor realiza más trabajos?
- ¿Cuánto cuesta mantener un activo?
- ¿Qué instalaciones son críticas?

---

# 24. AUDITORÍA

Módulo existente:

`/maintenance/audit`

No confundir:

- Libros / auditoría
- PAM / mantenimiento preventivo

El usuario ya definió que los "libros" son para auditoría y no deben mezclarse con el PAM como trabajo preventivo.

---

# 25. PAM

Módulo principal:

`/maintenance/pam`

Archivos principales:

- `MaintenancePamPage.tsx`
- `MaintenancePamDetailPage.tsx`

Concepto:

El PAM es la fuente maestra de los trabajos preventivos.

No convertir el PAM en un simple listado de "OT".

Debe seguir siendo:

**Plan Anual de Mantenimiento**

Agrupa el mantenimiento por:

- familia;
- subfamilia;
- activo;
- periodicidad;
- calendario;
- plan.

Periodicidades aprobadas:

- Diario
- Semanal
- Quincenal
- Mensual
- Bimensual
- Trimestral
- Semestral
- Anual

---

# 26. OTRAS DECISIONES DE PRODUCTO CONGELADAS

## Dashboard

Diseño:

- minimalista;
- seis tarjetas pequeñas como referencia funcional;
- alertas discretas;
- sin menú lateral grande;
- navegación superior;
- botones tipo Android próximos al logo;
- tarjetas blancas;
- acentos azules.

## Buscador global

Está congelado como función de plataforma:

**Buscador Global**

Debe realizar búsqueda incremental sobre datos del hotel.

## Lecturas

Módulo aprobado:

- Electricidad
- Agua
- Gas

Debe detectar:

- desviaciones;
- sobreconsumo;
- alertas;
- desglose hotel;
- desglose departamentos.

## Índice de criticidad

Idea aprobada:

Dashboard de criticidad.

## Stock

Debe soportar:

- peticiones;
- recepción;
- catálogo maestro;
- búsqueda incremental;
- generación de PDF.

## Planificador Horario

Debe sustituir el antiguo concepto de Control Horario.

## Captura rápida

Fue eliminada como función independiente.

---

# 27. COSAS QUE NO DEBEN IMPLEMENTARSE EN SUITE V1

Arias Pump / telemetría / sensores / infraestructura IoT:

**CONGELADO PARA MÁS ADELANTE**

Incluye:

- Raspberry Pi;
- ESP32;
- SCT-013;
- monitorización de bombas;
- consumo por fase;
- alarmas SMS;
- fallback;
- telemetría;
- monitorización de variadores.

Estos conceptos existen como ideas futuras, pero no se deben introducir ahora dentro de Suite V1.

---

# 28. DESPLIEGUE — VERCEL

Vercel se utiliza para desplegar.

Se detectó un problema de sincronización entre GitHub y Vercel.

La rama GitHub sí avanzó hasta commits posteriores, mientras un deployment de Vercel seguía mostrando un commit antiguo.

Ejemplo de deployment antiguo:

`21439d7`

La rama de GitHub posteriormente avanzó.

Por tanto:

**No asumir que una URL concreta de preview de Vercel representa siempre el HEAD actual de GitHub.**

Una URL de deployment concreta puede permanecer asociada a una versión concreta.

Cuando Vercel no recoja automáticamente un commit, el procedimiento utilizado fue:

Vercel → Deployments → Create Deployment → seleccionar la rama:

`feature/arias-suite-common-ui-v1`

y desplegar manualmente.

---

# 29. URL DE PREVIEW CONOCIDA

URL facilitada durante esta continuidad:

`https://arias-suite-2vuor4l3l-arias9.vercel.app`

Esta URL fue utilizada para comprobar un deployment concreto.

No asumir que esta URL se actualiza con cada commit si es una URL de deployment específica.

---

# 30. SECUENCIA RECIENTE DE COMMITS RELEVANTES

Commits importantes de esta continuidad:

- `8815bc72233c1e82b949e1c9c75ae31ea754411f`
  - Corrección delimitadores migración 060.

- `5ffd813a0cf62326094d8e6dd6bb7b63274085a4`
  - Filtros en Tickets.

- `ee1de06814a530f3d416cbcb14f87abc51909c23`
  - Ajustes de pendientes / planificación.

- `7b87be56c2291a3b9f814ae88ad96bcbb896031a`
  - Corrección de `getGridProps` en Pendientes.

- `a3f5f4bb8b8f92fe9ed7001285994bf15e5eed84`
  - Corrección de `getGridProps` y `CalendarClock` en Planificación.

- `2e04b57d7732eda1b356339d54c97b17971d685f`
  - Commit técnico usado para provocar nuevo deployment.

- `bdffb7d9cebc98ff79b4bd62f9b7b69f23cdd725`
  - Botones comunes / ajustes de Pendientes.

- `aa0839874f23b280c21c4ce4e65af3f3a10687a8`
  - Botones comunes / Planificación.

- `1bb205525353b24b4675e33b79f4529bac616fd0`
  - Control de habitaciones bloqueadas / filtros.

- `6ade8bbb2321f9ed4f88cce67331409c76f11920`
  - Ajuste de nombre de columna.

- `31a734e9594d68c8395e5e43cf3242c0c37536c4`
  - Corrección del foco del grid.

- `f19c438e9e0e28cebed7f4fe85e1663d7ce3ee24`
  - Aislamiento de teclado del buscador.

- `b59f046e16995607b17edabc2e8e81fa197c2cb1`
  - Nuevo pendiente + histórico + botones comunes.

---

# 31. ÚLTIMO ESTADO DE PENDIENTES

En el HEAD actual conocido se ha confirmado que la pantalla ya incorpora:

- Nuevo pendiente.
- Histórico.
- Pendientes activos.
- Actualizar.
- Volver.
- Inicio.
- Tarjetas superiores clicables.
- Filtros.
- Bloqueo de habitaciones.
- Modificación.
- Desactivación lógica.
- Restauración desde histórico.
- Componentes comunes de botones.
- Protección del foco del buscador.

Antes de modificar cualquier cosa, el nuevo chat debe volver a leer `MaintenancePendingPage.tsx` desde GitHub porque el código puede haber avanzado.

---

# 32. IMPORTANTE: EL HISTÓRICO NO ES BORRADO

La regla funcional correcta es:

**Eliminar de la vista operativa ≠ borrar de la base de datos**

Para Pendientes:

`active = false`

El registro sigue existiendo.

Esto es fundamental para el futuro analítico.

---

# 33. PERMISOS

El módulo de mantenimiento utiliza permisos existentes:

- `maintenance.view`
- `maintenance.create`
- `maintenance.update`
- `maintenance.delete`

Reglas generales:

- consulta según `maintenance.view`;
- creación según `maintenance.create`;
- modificación / operaciones de gestión según `maintenance.update`;
- borrado físico no debe utilizarse por defecto para Pendientes.

En tickets existe además la regla:

**Solo Head of Maintenance o usuarios con permiso pueden asignar / reasignar Tickets.**

---

# 34. RLS

Las nuevas estructuras deben mantener:

- `hotel_id`;
- RLS;
- acceso por hotel;
- permisos de mantenimiento.

No crear una tabla operativa sin revisar:

1. hotel scope;
2. política SELECT;
3. política INSERT;
4. política UPDATE;
5. política DELETE si aplica;
6. permisos correspondientes.

---

# 35. CÓMO CREAR UNA NUEVA MIGRACIÓN

La siguiente migración disponible será:

**065**

Nunca reutilizar 063.

Nunca editar:

- 046;
- 047;
- 048;
- 049;
- 050;
- 051;
- 052;
- 053;
- 054;
- 055;
- 056;
- 057;
- 058;
- 059;
- 060;
- 061;
- 062;
- 063.

El patrón debe ser:

`065_nombre_descriptivo.sql`

y posteriormente:

- commit GitHub;
- ejecutar en Supabase;
- confirmar resultado;
- congelar la migración.

---

# 36. QUÉ HACER ANTES DE MODIFICAR CÓDIGO

Secuencia obligatoria:

1. Leer HEAD actual.
2. Leer el archivo afectado.
3. Leer los componentes compartidos que utiliza.
4. Leer la migración relacionada si la funcionalidad depende de DB.
5. Comprobar si ya existe tabla/RPC/campo.
6. Evitar duplicar funcionalidad existente.
7. Modificar directamente en GitHub.
8. Crear commit.
9. Comprobar el nuevo HEAD.
10. Desplegar / comprobar Vercel.
11. No afirmar que el build está verde sin evidencia.

---

# 37. LO QUE NO HAY QUE HACER

No:

- tocar Login;
- tocar migraciones ejecutadas;
- pedir repetir una migración confirmada como OK;
- crear otra tabla si ya existe una adecuada;
- duplicar datos;
- crear "Incidencias" si el concepto debe ser Tickets;
- mezclar preventivos con Tickets;
- volver a introducir menú lateral grande;
- crear botones con estilos aislados si existe `ActionButton` / `IconButton`;
- mover lógica de negocio a la UI cuando debe vivir en DB / RPC;
- hacer borrado físico por comodidad;
- asumir que Vercel ha desplegado porque GitHub tiene un commit;
- afirmar que el build está correcto sin comprobar Vercel;
- pedir al usuario que copie manualmente código si se puede editar directamente GitHub.

---

# 38. PRÓXIMO PASO RECOMENDADO

Antes de seguir añadiendo funciones, revisar en la rama actual:

1. **Pendientes**
   - probar Nuevo;
   - probar Modificar;
   - probar desactivar;
   - probar Histórico;
   - probar Restaurar;
   - probar bloqueado/desbloqueado;
   - probar tarjetas;
   - probar filtro;
   - comprobar que el buscador mantiene foco.

2. **Vercel**
   - confirmar que el deployment corresponde al HEAD actual.

3. **Tickets**
   - comprobar que los preventivos siguen fuera del grid operativo.

4. **Planificación**
   - comprobar que los trabajos derivados del PAM aparecen correctamente.

5. **Histórico**
   - revisar que los datos permiten análisis futuro por activo/habitación/tipo.

---

# 39. PROMPT DE ARRANQUE PARA EL SIGUIENTE CHAT

Pegar también este bloque después del texto anterior:

> Primero no hagas ningún cambio.
>
> Lee el HEAD real de `feature/arias-suite-common-ui-v1`.
>
> Lee:
>
> - `docs/MAESTRO_CONTINUIDAD_ARIAS_SUITE.md`
> - `src/features/maintenance/pages/MaintenancePendingPage.tsx`
> - `src/features/maintenance/pages/MaintenanceWorkOrdersPage.tsx`
> - `src/features/maintenance/pages/MaintenancePlanningPage.tsx`
> - `src/shared/components/buttons/ActionButton.tsx`
> - `src/shared/components/buttons/IconButton.tsx`
> - `src/shared/components/navigation/NavigationButtons.tsx`
> - `src/shared/components/grid/useGridKeyboardNavigation.ts`
>
> Después dime el estado real que encuentras en GitHub y cuál es el HEAD actual.
>
> No cambies nada hasta que yo te diga la siguiente tarea.
>
> Recuerda:
> **trabajar directamente en GitHub, no en local.**

---

# 40. RESUMEN EJECUTIVO PARA NO PERDER EL HILO

Arias Suite es un sistema modular de mantenimiento hotelero.

La arquitectura central es:

**PAM → Planificación → Tickets → Histórico**

con:

**Intervenciones** como registro de trabajos especiales relevantes.

El backlog **Pendientes** es independiente de Tickets.

Pendientes actualmente dispone de:

- registros importados inicialmente desde Excel;
- tarjetas resumen y filtros;
- búsqueda incremental;
- habitaciones bloqueadas;
- Nuevo y Modificar;
- desactivación lógica e Histórico;
- Restaurar;
- cambio de estado Pendiente/Terminado desde el detalle;
- formularios con fecha editable, selección de categoría y autocompletado de proveedor a partir de los catálogos maestros.

La DB tiene las migraciones **046–064 confirmadas como OK y congeladas**, según confirmación del usuario.

La migración **064 está ejecutada y queda congelada**. La siguiente migración nueva será **065**.

El repositorio activo es:

`EmersonArias/arias-pam`

Rama:

`feature/arias-suite-common-ui-v1`

El desarrollo debe continuar:

**GitHub directo → commit → Vercel**

Nunca asumir que Vercel está sincronizado simplemente porque GitHub tiene un commit nuevo.

Nunca modificar migraciones ya ejecutadas.

Nunca tocar Login salvo petición expresa.

Nunca perder histórico por borrado físico.

---

# 41. REGLA FINAL PARA EL NUEVO CHAT

La frase que resume todo el método de trabajo es:

> **Lee primero. Comprueba. Modifica directamente GitHub. Haz commit. Verifica. No asumas. No rompas lo congelado.**

Este documento debe acompañar la continuidad del proyecto.


---

# 42. REVISIÓN AVANZADA — PENDIENTES Y PARIDAD CON EXCEL (2026-10-10)

## 42.1 Fuente Excel revisada

Archivo de referencia: `PENDIENTES (1).xlsm`.

Hojas existentes:
- `FORMULARIO`
- `PENDIENTES`
- `IMPRESION`
- `PROVEEDORES`
- `MATERIALES Y CODIGOS`

Campos del formulario Excel:
- Ubicación
- Categoría
- Pendiente
- Asignado a
- Prioridad
- Observación
- Fecha

La celda de proveedor usa un lookup equivalente a:
`SI.ERROR(BUSCARX(C18;PROVEEDORES!C:C;PROVEEDORES!A:A);" ")`.
Por tanto, al seleccionar una categoría se recupera el proveedor asociado en la hoja `PROVEEDORES`.

Prioridades de origen Excel:
- Alta
- Media
- Baja

Arias Suite conserva sus valores normalizados internos (`HIGH`, `NORMAL`, `LOW`, `CRITICAL`), pero la etiqueta visual para `NORMAL` pasa a ser **Media** para mantener la terminología del Excel. `CRITICAL` sigue siendo una ampliación de Arias Suite.

La hoja `PROVEEDORES` contiene relaciones categoría → proveedor y nombres de contacto. La hoja `MATERIALES Y CODIGOS` es un catálogo separado con descripción, código para pedidos y proveedor; no debe confundirse con los campos del formulario de Pendientes.

## 42.2 Proveedores — reutilizar el catálogo maestro

Arias Suite ya tiene módulo maestro de proveedores en `/providers` y usa las tablas:
- `providers`
- `provider_hotels`
- `provider_contacts`
- `provider_services`

No crear una segunda tabla maestra de proveedores dentro de Pendientes.

## 42.3 Migración 064 — ejecutada y congelada

Archivo creado:
`supabase/migrations/064_maintenance_supplier_and_material_catalogs.sql`

Commit de la migración:
`8b7a863f57b4443bf01b6afa244b88d9de3879cb`

Crea:
- `maintenance_category_supplier_defaults`: proveedor maestro predeterminado por categoría y hotel.
- `maintenance_material_catalog`: descripción de material, código para pedido y proveedor maestro asociado.

Inicializa los valores de Excel para SB Diagonal Zero, enlazándolos con `providers`, `provider_hotels`, `provider_contacts` y `provider_services`; no crea un catálogo paralelo.

**Estado real:** el usuario confirma que la migración 064 se ha ejecutado correctamente en Supabase. Por tanto, 064 queda congelada. Las migraciones 046–063 siguen congeladas e intactas. La siguiente migración nueva será 065.

La ejecución correcta de SQL confirma la estructura y la siembra inicial; el comportamiento funcional del autocompletado aún debe verificarse creando o modificando un pendiente desde la aplicación.

## 42.4 Comportamiento implementado en Pendientes

Archivo:
`src/features/maintenance/pages/MaintenancePendingPage.tsx`

La interfaz ahora contempla:
- ubicación con sugerencias de valores existentes;
- categoría como selector de valores existentes;
- proveedor sugerido automáticamente desde la relación categoría → proveedor;
- contacto del proveedor cuando está disponible en su ficha maestra;
- proveedor editable para admitir excepciones operativas;
- prioridades con etiquetas Alta, Media, Baja y Crítica;
- fecha editable en Nuevo y Modificar, guardada en fecha local para evitar desplazamientos por conversión UTC;
- acción **Limpiar formulario** en Nuevo, con confirmación;
- mensajes de error y aviso del catálogo dentro del modal;
- acciones para marcar un pendiente como terminado y reabrirlo desde el detalle;
- al crear, se limpian los filtros y se vuelve al modo activo para que el registro recién creado sea visible.

No editar `source_file` ni `source_row`; siguen siendo trazabilidad del origen. Eliminar sigue significando **desactivación lógica**, nunca borrado físico.

## 42.5 Correcciones de botones y navegación

- La tarjeta **Prioridad alta** debe mostrar y filtrar tanto `HIGH` como `CRITICAL`.
- Al pulsar una tarjeta resumen se sale de Histórico y se aplican filtros coherentes con la tarjeta.
- Limpiar filtros cierra el panel de filtros móvil.
- La navegación del grid distingue filas de escritorio y móvil y busca la fila visible para desplazar la selección.
- En el grid de escritorio, Enter abre la edición del registro seleccionado.

## 42.6 Materiales y códigos

Los tres materiales iniciales de `MATERIALES Y CODIGOS` quedan sembrados por 064:
- Motor tipo 1 fancoil habitaciones — `AERMEC FCX50P 9110233` — AIRLAM.
- Bandeja de condensados — `Bandeja de condensados BC8` — AIRLAM.
- Teléfono de ducha — `Tres 134748 Ducha Lex-100 5 posiciones` — TRES.

**No afirmar que ya existe una pantalla de materiales/pedidos conectada al catálogo:** la auditoría de rutas de `src/App.tsx` no encontró una ruta de Stock/Pedidos para consumirlo. Su interfaz de consulta/solicitud sigue siendo un trabajo pendiente y no debe añadirse como campo de Pendientes sin una decisión funcional.

## 42.7 Commit funcional y despliegue

Repositorio: `EmersonArias/arias-pam`

Rama: `feature/arias-suite-common-ui-v1`

Último commit funcional de la aplicación verificado en esta revisión:
`a8f573063d2e191841f78c5665c485ccb8169c3c`

Vercel reportó estado **SUCCESS** para ese commit. Después se realizó una actualización documental del Maestro, sin cambios de código de la aplicación; por tanto, al continuar se debe volver a comprobar el HEAD y el estado Vercel actuales.

Esto confirma el deployment web del commit funcional. La ejecución de la migración 064 está confirmada por el usuario; aún falta la prueba funcional manual de todos los controles.

Siguiente comprobación:
1. Abrir Nuevo pendiente y confirmar categoría → proveedor/contacto y fecha tras la ejecución de 064.
2. Probar Limpiar, Guardar, Modificar, Marcar terminado/Reabrir, Eliminar lógico, Histórico y Restaurar.
3. Verificar que la búsqueda/filtros y los contadores siguen siendo coherentes tras modificar estados.
4. Verificar en móvil que las acciones y la navegación mantienen su comportamiento.
5. No crear 065 hasta que aparezca una necesidad de esquema nueva.



---

# 43. BASE DE INVESTIGACIÓN UX PARA LA PRESENTACIÓN DE ARIAS SUITE (2026-10-11)

## 43.1 Objetivo

Conservar fuentes externas verificables que fundamentan criterios de diseño de Arias Suite, especialmente formularios operativos, selección de ubicaciones, jerarquía de espacios y activos, reducción de pasos y facilidad de uso móvil.

Este apartado servirá como base documental para la futura presentación comercial/técnica de Arias Suite. La presentación debe distinguir entre:

1. **Fuente externa:** lo que la publicación o investigación consultada afirma.
2. **Decisión de diseño de Arias Suite:** cómo se aplica ese principio al producto.
3. **Funcionalidad implementada:** lo que realmente existe en la aplicación y se ha comprobado.
4. **Funcionalidad propuesta o pendiente:** decisiones todavía no implementadas o validadas.

No presentar una recomendación futura como si ya estuviera implementada. Tampoco afirmar que todas las decisiones históricas de desarrollo se tomaron originalmente a partir de estas fuentes: esta revisión deja documentada la base de investigación que se utilizará para justificar y orientar el diseño, y que podrá incorporarse a la evolución del producto.

## 43.2 Fuentes principales

### A. Nielsen Norman Group (NN/G) — simplificación de formularios

**Artículo:** “Less Effort, More Completion: The EAS Framework for Simplifying Forms”  
**Fecha:** 7 de marzo de 2025  
**URL:** https://www.nngroup.com/articles/eas-framework-simplify-forms/

El artículo presenta el marco EAS:
- **Eliminate:** eliminar preguntas no esenciales, no urgentes o irrelevantes.
- **Automate:** reutilizar datos existentes y automatizar aquello que no debería volver a introducir manualmente el usuario.
- **Simplify:** simplificar los campos restantes mediante valores iniciales útiles, alternativas de entrada y formatos que reduzcan el esfuerzo.

También recomienda posponer información no urgente y usar lógica condicional para no pedir datos que no se aplican a todos los casos.

**Aplicación propuesta a Arias Suite:**
- No exigir todos los campos posibles al registrar un pendiente.
- Reutilizar ubicaciones, activos, proveedores y demás datos maestros cuando existan y sean fiables.
- Automatizar valores que puedan recuperarse de datos ya registrados, manteniendo la posibilidad de corregirlos cuando proceda.
- Mostrar opciones adicionales solo cuando sean relevantes para el caso.
- Mantener un camino rápido para registrar un problema cuando aún no se conoce toda la información.

### B. IBM Maximo — definición y jerarquía de ubicaciones

**Artículo/documentación:** “Defining locations”  
**URL:** https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=locations-defining

IBM explica que las ubicaciones deben diseñarse según cómo las entienden las personas y equipos que las utilizan. Una ubicación puede representar, según las necesidades del negocio, un edificio, planta, habitación o una parte concreta de un espacio. La documentación destaca la importancia de distinguir las ubicaciones de otras entidades y de planificar la jerarquía de forma deliberada.

**Aplicación propuesta a Arias Suite:**
- Definir una estructura física que refleje cómo se recorre y se identifica realmente un hotel.
- Admitir espacios de habitaciones y también zonas comunes, salas técnicas, cubiertas y otras ubicaciones que no sean habitaciones.
- Evitar crear jerarquías rígidas que no correspondan a la realidad del establecimiento.
- Diseñar la estructura de datos pensando en su reutilización para órdenes de trabajo, activos, histórico y análisis.

### C. IBM Maximo — sistemas como jerarquías lógicas de ubicaciones

**Artículo/documentación:** “Systems”  
**URL:** https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=locations-systems

IBM describe un sistema como un grupo de ubicaciones organizado en una jerarquía lógica de ubicaciones padre e hijas, útil para seguir activos y gestionar trabajos. Los sistemas pueden representar agrupaciones funcionales o físicas.

**Aplicación propuesta a Arias Suite:**
- Mantener conceptualmente separados el lugar físico, el sistema funcional y el activo.
- No confundir la familia de un equipo con el lugar donde está instalado.
- Permitir que el análisis futuro cruce ubicación, activo, sistema y tipo de trabajo sin convertirlo todo en un único campo de texto.

### D. Baymard Institute — evitar dividir innecesariamente una entrada en varios campos móviles

**Artículo:** “Mobile Form Usability: Avoid Splitting Single Input Entities”  
**Autor:** Jamie Holst  
**Fecha:** 12 de febrero de 2013  
**URL:** https://baymard.com/research-articles/mobile-form-usability-single-input-fields

Baymard describe observaciones de sus estudios de usabilidad móvil en las que dividir una misma entidad percibida por el usuario en varios campos puede dificultar la interacción, generar dudas sobre qué campos son obligatorios y no coincidir con la forma en que las personas entienden la información. El artículo también aclara que sus observaciones se refieren a los tipos de campos que estudiaron; no constituyen prueba directa para todos los tipos de datos.

**Aplicación propuesta a Arias Suite:**
- No imponer por defecto una secuencia obligatoria de planta → habitación → sitio para cada registro.
- Valorar un selector inteligente de ubicación que permita buscar por nombre, planta o habitación y muestre la ruta completa del resultado.
- Cuando sea útil, permitir una selección progresiva, pero sin obligar a completar niveles que no sean aplicables.
- Validar el diseño con tareas reales de mantenimiento en móvil antes de dar por demostrado que reduce tiempos o errores.

## 43.3 Principios de diseño derivados para Arias Suite

A partir de las fuentes anteriores, se documentan como criterios de diseño que deben orientar las decisiones futuras:

1. **Primero la tarea del trabajador:** el formulario debe facilitar el registro del problema, no obligar al usuario a navegar toda la estructura interna del sistema.
2. **Datos estructurados sin complejidad innecesaria:** la base de datos puede mantener relaciones y jerarquías aunque la interfaz ofrezca un acceso directo y sencillo.
3. **Ubicación no equivale a activo:** el lugar físico, el sistema funcional, la familia/subfamilia, el activo y la categoría del trabajo representan conceptos diferentes.
4. **Campos condicionales y opcionales cuando corresponda:** no pedir al usuario datos que no aplican o que pueden completarse después, salvo que exista una necesidad operativa clara.
5. **Reutilización de datos maestros:** preferir catálogos fiables y autocompletado frente a texto libre repetido, sin inventar ni duplicar información.
6. **Diseño móvil prioritario para tareas frecuentes:** minimizar escritura, desplazamientos entre campos y selecciones innecesarias.
7. **Prueba con tareas reales:** comprobar el flujo con casos representativos antes de afirmar que una solución es más rápida o que reduce errores.
8. **Trazabilidad de las afirmaciones:** en presentaciones, separar lo respaldado por fuentes externas, las decisiones de producto, lo implementado y lo que sigue pendiente.

## 43.4 Caso actual: formulario de Nuevo pendiente

Archivo revisado:
`src/features/maintenance/pages/MaintenancePendingPage.tsx`

Estado observado durante la revisión del 11/10/2026:
- El campo Pendiente tiene `autoFocus`, por lo que recibe el foco al abrir el formulario.
- Ubicación permite sugerencias procedentes de valores presentes en los pendientes existentes.
- La ubicación se guarda como texto en el registro de Pendientes.
- En el módulo de mantenimiento se usan también los campos `plant` y `location` asociados al registro de equipos.
- En esta revisión no se ha confirmado que el formulario de Pendientes ya consuma un catálogo jerárquico completo de ubicaciones.

Propuesta de evolución, **todavía no implementada por esta decisión documental**:
- Cambiar el foco inicial del formulario de Nuevo a Ubicación.
- Investigar y reutilizar primero la estructura existente de ubicaciones y activos.
- Evaluar un selector inteligente que busque ubicaciones por nombre, planta o habitación y muestre la ruta.
- Permitir identificar un activo cuando se conozca y sea relevante, sin convertirlo en obligatorio para todos los pendientes.
- Evitar crear tablas o migraciones nuevas hasta comprobar que el modelo actual no cubre la necesidad.

## 43.5 Texto base para la futura presentación

Redacción propuesta, que deberá actualizarse según las funcionalidades realmente implementadas y verificadas en la fecha de presentación:

> **Diseño fundamentado en investigación y buenas prácticas.** En Arias Suite, las decisiones de experiencia de usuario para formularios operativos y organización de ubicaciones se documentan tomando como referencia publicaciones de Nielsen Norman Group sobre simplificación de formularios, documentación de IBM Maximo sobre jerarquías de ubicaciones y sistemas, y estudios de usabilidad móvil de Baymard Institute. Estas fuentes orientan criterios como reducir campos innecesarios, reutilizar datos existentes, separar ubicación y activo, y evitar pasos que no aporten valor al trabajador. Las decisiones se contrastan con la estructura técnica del producto y deben validarse con tareas reales de mantenimiento.

Versión corta para una diapositiva:

> **Arias Suite: diseño basado en investigación UX y buenas prácticas de gestión de activos.** Referencias: Nielsen Norman Group (simplificación de formularios), IBM Maximo (jerarquías de ubicaciones y sistemas) y Baymard Institute (usabilidad de formularios móviles).

Importante: utilizar expresiones como “tomamos como referencia”, “fundamentamos estas decisiones” o “criterios de diseño orientados por estas fuentes”. No afirmar que Arias Suite está certificado por estas organizaciones, que las fuentes han auditado el producto, ni que se ha demostrado una mejora cuantitativa de tiempos o errores sin pruebas propias.

## 43.6 Referencias breves para bibliografía o notas de presentación

- Nielsen Norman Group. Huei-Hsin Wang. “Less Effort, More Completion: The EAS Framework for Simplifying Forms.” 7 marzo 2025. https://www.nngroup.com/articles/eas-framework-simplify-forms/
- IBM. “Defining locations.” IBM Maximo Manage documentation. https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=locations-defining
- IBM. “Systems.” IBM Maximo Manage documentation. https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=locations-systems
- Baymard Institute. Jamie Holst. “Mobile Form Usability: Avoid Splitting Single Input Entities.” 12 febrero 2013. https://baymard.com/research-articles/mobile-form-usability-single-input-fields

## 44. MODELO DE UBICACIONES CONFIGURABLES POR HOTEL — CRITERIO DE PRODUCTO (2026-10-11)

### 44.1 Objetivo del caso actual

El catálogo de ubicaciones que se prepare en esta fase corresponde específicamente al **SB Diagonal Zero**, como caso real de demostración de Arias Suite para Ramón, jefe del usuario. No debe interpretarse como una distribución universal aplicable a todos los hoteles.

El catálogo del SB Diagonal Zero tiene que representar la distribución y las necesidades reales de ese hotel, una vez verificadas. No se deben inventar habitaciones, plantas, salas técnicas, zonas ni relaciones físicas para completar una plantilla.

### 44.2 Regla general de arquitectura

**Arias Suite permite que cada hotel configure su propia estructura de ubicaciones.** El modelo de producto no debe imponer una distribución física común a todos los hoteles ni asumir que todos tienen las mismas plantas, habitaciones, salas técnicas, zonas, nombres o niveles jerárquicos.

- Cada hotel mantiene su propio catálogo y su propia organización de ubicaciones.
- La jerarquía puede variar entre hoteles y no debe codificarse como una secuencia fija obligatoria de tipo planta → habitación.
- Una ubicación puede representar, según la realidad del hotel, una planta, habitación, sala técnica, cubierta, sótano, zona común, almacén, área de servicio u otro espacio que el hotel necesite identificar.
- Los niveles y tipos anteriores son ejemplos orientativos, no una lista cerrada ni una estructura que deba repetirse en todos los hoteles.
- Debe ser posible crear ubicaciones, asignarles un nombre útil para la operación y organizarlas bajo una ubicación superior cuando esa relación tenga sentido. No debe exigirse que todos los registros tengan los mismos niveles.
- La estructura de un hotel no debe copiarse automáticamente a otro ni suponerse idéntica. Cualquier función futura de plantillas deberá ser explícita y opcional, nunca una restricción del modelo.
- Los activos existentes deben poder asociarse a la ubicación real donde están instalados, sin duplicarlos por el hecho de completar el catálogo.
- Ubicación, sistema, activo y tipo de trabajo siguen siendo conceptos diferentes. El catálogo de ubicaciones no sustituye al inventario de activos ni al catálogo de sistemas.
- Si una ubicación deja de utilizarse, debe valorarse su desactivación conservando el histórico y las relaciones operativas, en lugar de borrar registros que puedan estar referenciados.

### 44.3 Separación entre datos de demostración y capacidad del producto

Se deben mantener claramente separadas estas dos cosas:

1. **Datos específicos del caso de demostración:** catálogo real de ubicaciones y activos del SB Diagonal Zero, introducidos y verificados para enseñar cómo podría funcionar la aplicación en ese hotel.
2. **Capacidad general de Arias Suite:** permitir crear otros hoteles y configurar para cada uno las ubicaciones y los activos según su propia realidad.

Los nombres, plantas, habitaciones y espacios del SB Diagonal Zero son datos de ese hotel; no deben convertirse en constantes de código, valores universales ni supuestos para los demás clientes.

### 44.4 Flujo de trabajo recomendado

1. Auditar primero el modelo, los registros y las relaciones que ya existen en el repositorio y la base de datos. No asumir que hay un catálogo completo ni crear una estructura nueva antes de verificarlo.
2. Inventariar las ubicaciones reales del SB Diagonal Zero con información confirmada.
3. Identificar los activos ya registrados y asociarlos a sus ubicaciones correctas cuando exista información suficiente.
4. Completar las ubicaciones que falten sin duplicar las existentes y sin inventar datos.
5. Integrar el catálogo en el formulario de Pendientes con búsqueda rápida. La interfaz debe poder encontrar ubicaciones de distintas formas y mostrar suficiente contexto para seleccionar la correcta, sin obligar a recorrer una secuencia fija de campos.
6. Comprobar que el diseño permite crear un segundo hotel con una estructura distinta, sin reutilizar por obligación la estructura del SB Diagonal Zero.

### 44.5 Límites de esta decisión

Esta sección fija el criterio funcional y arquitectónico; **no confirma que la aplicación ya tenga implementadas todas estas capacidades**. Antes de modificar código, tablas o relaciones se debe inspeccionar la implementación vigente y reutilizarla en la medida posible. No modificar migraciones ya ejecutadas. No crear nuevas migraciones ni nuevas tablas sin demostrar que el modelo actual es insuficiente.

El catálogo específico del SB Diagonal Zero aún debe construirse a partir de información real y verificable. La decisión no autoriza a inventar el plano, el número de habitaciones, las salas técnicas por planta ni la ubicación exacta de los activos.

## 45. AUDITORÍA TÉCNICA Y HOJA DE RUTA — UBICACIONES Y COPIA (2026-10-11)

### 45.1 Estado de revisión

Rama revisada: `feature/arias-suite-common-ui-v1`  
HEAD observado al iniciar la revisión: `f89cb1a8079790557bcf623bd23ae97757c3c32f`  
Objetivo: preparar el configurador de estructura física por hotel y la copia de plantas/zonas/habitaciones sin contaminar los activos reales ni el histórico.

Esta sección registra una auditoría del código y de las migraciones disponibles en GitHub. **No equivale a una inspección directa del esquema vivo de Supabase**; ese contraste debe hacerse antes de ejecutar cualquier migración nueva.

### 45.2 Hallazgos verificados en el repositorio

- La migración `004_multitenant_core.sql` define `tenants`, `hotels`, perfiles, roles y permisos como base multiempresa/multihotel.
- La migración `005_add_hotel_scope_to_operational_data.sql` añade `hotel_id` a entidades operativas existentes, entre ellas `apparatus_registry` y `assets`.
- La migración `045_active_hotel_context.sql` define el contexto de hotel activo y funciones de acceso que aplican al usuario/hotel seleccionado.
- La migración `018_maintenance_core_and_alerts.sql` relaciona los planes de mantenimiento con `apparatus_registry` mediante `apparatus_registry_id`.
- Las migraciones `036_preventive_work_orders_v1.sql` y `055_operational_work_orders_and_detail.sql` muestran que las órdenes de trabajo se relacionan con los planes y/o con `apparatus_registry`. Una copia de ubicación no debe duplicar estos registros.
- La migración `062_import_maintenance_pending_backlog.sql` crea `maintenance_pending_items` con `location` de tipo texto y trazabilidad de la fila de origen.
- La migración `063_maintenance_blocked_rooms.sql` crea `maintenance_blocked_rooms` con `hotel_id` y `room_number` de texto; es un registro de bloqueo, no un catálogo canónico de habitaciones.
- La pantalla `src/features/apparatusregistry/pages/ApparatusRegistryDetailPage.tsx` mantiene los campos `plant` y `location` en la ficha del equipo como texto.
- La pantalla `src/features/maintenance/pages/MaintenancePendingPage.tsx` guarda `maintenance_pending_items.location` como texto. Además, reconoce actualmente una habitación mediante la expresión regular `^[0-9]{3,4}$`; ese criterio no debe convertirse en regla general del modelo de Arias Suite.

En los objetos revisados no se ha identificado una jerarquía canónica completa de ubicaciones físicas. Antes de decidir la migración definitiva se debe terminar el inventario del esquema y contrastarlo con el esquema vivo de Supabase.

### 45.3 Decisiones funcionales que sí quedan fijadas

1. **Modelo genérico, no rígido:** la estructura física de cada hotel debe poder contener ubicaciones de distintos tipos y niveles. No imponer una secuencia obligatoria de planta → habitación.
2. **Ubicación separada de activo:** un lugar físico no es un equipo. La misma ubicación puede contener varios activos; un activo físico conserva su propia identidad.
3. **Sin falsa duplicación:** copiar una planta o habitación crea nuevos nodos de ubicación, no copias de los activos físicos reales.
4. **Histórico protegido:** no duplicar órdenes de trabajo, ejecuciones PAM, planes preventivos, lecturas, fotografías, documentos ni eventos históricos al copiar una estructura.
5. **Compatibilidad gradual:** los campos de texto existentes no se deben borrar ni sobrescribir automáticamente. Las relaciones nuevas serán opcionales durante la transición y solo se asociarán registros cuando la correspondencia esté confirmada.
6. **Baja lógica:** desactivar una ubicación que ya tenga información asociada; no borrarla físicamente sin estudiar todas sus relaciones.
7. **Aislamiento por hotel:** impedir por constraints y políticas de base de datos que una ubicación, un activo o una copia se relacione accidentalmente con otro hotel.
8. **Copia controlada:** vista previa antes de confirmar; en la primera versión, ante conflictos se debe cancelar o saltar el elemento según una regla explícita. No sustituir ni eliminar automáticamente ubicaciones existentes.
9. **Configuración real del SB Diagonal Zero:** cargar únicamente ubicaciones y relaciones confirmadas. No inventar plantas, habitaciones ni espacios para completar el ejemplo.

### 45.4 Diseño técnico que se debe validar antes de implementarlo

La opción preferente a estudiar es un catálogo jerárquico genérico de ubicaciones por hotel, basado en nodos con una relación padre-hijo. El nombre final de las tablas y sus constraints no queda congelado hasta completar la revisión del esquema.

El diseño debe resolver como mínimo:

- Identificador propio por ubicación y `hotel_id`.
- Ubicación superior opcional y validación de que padre e hijo pertenecen al mismo hotel.
- Tipo de ubicación que permita configuración por hotel sin limitarse a plantas y habitaciones.
- Nombre/código visible, orden, estado activo/inactivo y trazabilidad.
- Restricciones contra duplicados dentro del mismo ámbito y ciclos en la jerarquía.
- RLS/funciones de permisos compatibles con el sistema actual.
- Enlace opcional desde `apparatus_registry` a una ubicación estructurada, preservando de momento `plant` y `location`.
- Decisión explícita sobre cómo vincular `maintenance_pending_items` y `maintenance_blocked_rooms` sin provocar asociaciones falsas ni romper la interfaz actual.

No se debe añadir un campo `room_id` suponiendo que todas las ubicaciones sean habitaciones. Tampoco se debe crear una tabla de `floors` y otra de `rooms` como única representación universal sin demostrar que esa rigidez satisface el modelo acordado.

### 45.5 Copia de estructuras: alcance correcto

La primera función de copia deberá permitir seleccionar una ubicación origen (por ejemplo, una planta o una zona) y uno o varios destinos. La copia recorre sus descendientes y crea identificadores nuevos para los nodos nuevos.

Antes de confirmar, mostrar:
- ubicación de origen y destinos;
- número y tipo de ubicaciones que se crearán;
- regla para renombrar/numerar los elementos;
- conflictos con elementos ya existentes;
- resumen de qué datos se copiarán y qué datos quedarán excluidos.

La operación debe ser atómica, protegida por permisos, segura frente a doble envío y registrada en auditoría. No se debe ofrecer una opción ambigua de “copiar activos” que duplique equipos físicos reales.

### 45.6 Separación pendiente: composición prevista de habitaciones

Copiar la estructura de una habitación no equivale a duplicar sus equipos reales. Para necesidades como TV, cama, minibar o fancoil, se deberá diseñar aparte una composición prevista/plantilla de equipamiento que permita indicar qué elementos debería tener una habitación de cierto tipo.

Al aplicar una composición:
- se copian conceptos o líneas de equipamiento previsto;
- no se reutilizan IDs, números de serie, fotografías, planes preventivos, órdenes ni históricos de otro equipo;
- el registro del activo físico real se crea o vincula solo cuando se haya verificado qué equipo existe en el destino.

Esta separación se implementará después de tener estable el catálogo de ubicaciones.

### 45.7 Secuencia de trabajo aprobada

**Fase A — Cerrar auditoría técnica**
1. Revisar de forma completa las migraciones y búsquedas de código relacionadas con ubicaciones, habitaciones, activos, OT, PAM y permisos.
2. Contrastar el esquema real de Supabase, incluida la existencia de objetos creados fuera del historial de migraciones.
3. Documentar las tablas y relaciones reutilizables y los cambios estrictamente necesarios.

**Fase B — Cerrar el modelo**
4. Definir catálogo jerárquico, tipos por hotel, constraints, índices, RLS y permisos.
5. Definir relaciones opcionales con el inventario actual y reglas de transición de los campos de texto.
6. Diseñar la copia de subárboles, la política de conflictos y el registro de auditoría.

**Fase C — Implementar**
7. Crear una migración nueva (065 o superior) solo después de las fases A y B; nunca modificar migraciones 001–064.
8. Crear la pantalla `Configuración → Estructura del hotel` con alta, edición, desactivación y navegación jerárquica.
9. Añadir copia de una ubicación y de rangos/destinos con vista previa, confirmación y resultado verificable.
10. Asociar los equipos reales a su ubicación sin recrearlos.
11. Diseñar la composición prevista de habitaciones como fase independiente.

**Fase D — Validar y desplegar**
12. Probar permisos y aislamiento entre dos hoteles con estructuras diferentes.
13. Probar duplicados, destinos ocupados, copia repetida, ausencia de descendientes, desactivación, errores transaccionales y uso móvil.
14. Verificar que PAM, OT, históricos, fotografías, documentos y lecturas no se duplican ni pierden asociaciones.
15. Ejecutar build/lint y revisión de despliegue; aplicar cualquier migración solo con el esquema y el entorno confirmados.

### 45.8 Punto exacto de continuación

La auditoría inicial de código confirma que los campos de ubicación existentes son mayoritariamente texto y que el bloqueo de habitaciones usa un registro independiente por número. El siguiente paso no es escribir a ciegas la migración 065: es cerrar el inventario completo del esquema y confirmar el estado vivo de Supabase. Con esa evidencia se redactará el modelo definitivo y la migración mínima necesaria.

Las migraciones 046–064 permanecen congeladas. No se ha ejecutado ninguna migración ni se ha cambiado código de producción como consecuencia de esta auditoría.

## 46. RESULTADOS DEL ESQUEMA VIVO — RELACIONES Y RLS (2026-10-11)

### 46.1 Procedencia y alcance

El usuario ejecutó consultas de solo lectura en Supabase y compartió resultados de claves foráneas y políticas RLS. Estos hallazgos describen el esquema del proyecto consultado por el usuario en esa fecha; se deben conservar como evidencia operativa y volver a comprobar tras cualquier corrección.

### 46.2 Relaciones relevantes confirmadas

- `apparatus_registry` tiene clave foránea a `hotels` por `hotel_id`.
- `assets` tiene clave foránea a `hotels` por `hotel_id`.
- `maintenance_pending_items` y `maintenance_blocked_rooms` referencian `hotels` por `hotel_id`; no aparece una relación de estas tablas a un catálogo de ubicaciones/habitaciones.
- `maintenance_plans` referencia `apparatus_registry` por `apparatus_registry_id`.
- `maintenance_work_orders` referencia `apparatus_registry` y mantiene sus relaciones con planes, trabajos programados y órdenes padre.
- En las claves foráneas proporcionadas no aparece una jerarquía canónica de ubicaciones con padre-hijo, plantas o habitaciones. La consulta de columnas del inventario completo todavía debe verificarse para descartar objetos sin claves foráneas.

### 46.3 Hallazgo de seguridad prioritario: políticas RLS permisivas

El resultado RLS del usuario muestra RLS activo en `apparatus_registry` y `assets`, pero también políticas permisivas amplias:

- `apparatus_registry_select_public`: roles `anon, authenticated`, condición `true`.
- `apparatus_registry_insert_public`: roles `anon, authenticated`, condición de escritura `true`.
- `apparatus_registry_update_public`: roles `anon, authenticated`, condiciones `true`.
- `apparatus_registry_delete_public`: roles `anon, authenticated`, condición `true`.
- `public read assets`, `public insert assets` y `public update assets`: rol `PUBLIC`, condiciones `true`.

PostgreSQL combina las políticas permisivas aplicables a una misma operación mediante `OR`. Por ello, si los roles tienen los privilegios SQL correspondientes, estas políticas `true` permiten acceder/modificar filas sin que la política paralela de `has_hotel_permission(...)` pueda restringirlas. El RLS activo no neutraliza esas políticas públicas; forma parte de su evaluación.

**Estado:** riesgo potencial alto, pendiente de confirmar los privilegios SQL efectivos de `anon` y `authenticated`. Las políticas RLS no conceden por sí solas privilegios de tabla; el riesgo explotable depende también de `GRANT`/privilegios efectivos. Antes de quitar políticas, confirmar la matriz de privilegios y si la aplicación tiene algún flujo legado que dependa de acceso anónimo. No ejecutar todavía cambios destructivos ni modificar migraciones históricas.

### 46.4 Verificación de privilegios y corrección preparada

El usuario ejecutó la consulta `has_table_privilege` y confirmó que ambos roles `anon` y `authenticated` tienen SELECT, INSERT, UPDATE y DELETE efectivos sobre `apparatus_registry` y `assets`.

En consecuencia, el riesgo potencial de las políticas permisivas queda confirmado a nivel de privilegios SQL. La aplicación enruta las pantallas de estos módulos bajo `ProtectedRoute`, y las migraciones 009 contienen políticas específicas `*_authorized` para usuarios autenticados.

Se creó en GitHub la migración correctiva nueva:

`supabase/migrations/065_secure_apparatus_registry_and_assets_rls.sql`

Commit: `14ce305e84e306bd87b37b37d28e8a574badc942`.

La migración:
- elimina las cuatro políticas `apparatus_registry_*_public`;
- elimina las políticas `public read assets`, `public insert assets` y `public update assets`;
- revoca privilegios de tabla heredados por `PUBLIC` y los privilegios de `anon` sobre ambas tablas;
- concede explícitamente CRUD a `authenticated`, dejando que las políticas `*_authorized` existentes apliquen los permisos por hotel.

**El usuario confirmó que la migración 065 se aplicó el 2026-10-11.** La verificación posterior de privilegios SQL y políticas RLS se documenta en 46.5 y dio el resultado esperado; queda pendiente la prueba funcional de aislamiento por usuario/hotel. Las rutas de la aplicación para el inventario se encuentran dentro de `ProtectedRoute`, por lo que el código revisado no muestra un flujo de acceso anónimo intencional.

### 46.5 Verificación posterior — privilegios y políticas confirmados (2026-10-11)

El usuario volvió a ejecutar ambas consultas tras aplicar la migración 065. Los resultados confirman:

- En `apparatus_registry` y `assets`, el rol `anon` tiene SELECT, INSERT, UPDATE y DELETE = false.
- En ambas tablas, `authenticated` mantiene los cuatro privilegios SQL = true.
- Ya no aparecen las políticas RLS públicas permisivas.
- Se mantienen únicamente las políticas `*_authorized` para `authenticated` en cada operación, que comprueban `has_hotel_permission(hotel_id, ...)` para ver, crear, modificar y eliminar.

**Resultado:** la configuración de privilegios SQL y las políticas listadas queda corregida y verificada en el esquema consultado por el usuario. La seguridad funcional debe terminar de probarse con dos cuentas/casos: un usuario con permisos por hotel debe poder operar normalmente, y un usuario autenticado sin permisos para ese hotel no debe poder leer ni modificar registros de esas tablas. No afirmar que esta prueba funcional se ha realizado hasta recibir su resultado.

### 46.6 Siguiente acción — prueba funcional pendiente

La consulta de privilegios y el listado de políticas RLS ya se han repetido y sus resultados son correctos. No es necesario repetirlos ahora.

Pendiente únicamente la prueba funcional:
- verificar que un usuario autenticado con permisos de mantenimiento adecuados y hotel activo puede seguir consultando y gestionando registros autorizados;
- verificar que un usuario autenticado sin el permiso correspondiente o sin acceso al hotel no puede leer ni modificar esos registros;
- comprobar que el inicio de sesión, el cambio de hotel y las pantallas Equipos e instalaciones / Activos siguen funcionando.

No considerar cerrado el ciclo completo de seguridad hasta obtener estos resultados.

### 46.7 Implicación en el diseño de ubicaciones

La verificación estática de los privilegios y políticas de la migración 065 es correcta; su prueba funcional de aislamiento sigue pendiente. La auditoría del esquema y de las columnas de ubicación se registró en la sección 47. La primera implementación del catálogo se documenta en la sección 48, con la migración 066 y su pantalla inicial pendientes de aplicación y validación.

Las migraciones 001–065 permanecen sin cambios. No se ejecutó la migración 066 en Supabase al redactar esta actualización.

## 47. RESULTADO DEL INVENTARIO DE COLUMNAS EN SUPABASE (2026-10-11)

### 47.1 Evidencia aportada por el usuario

El usuario ejecutó la consulta de columnas sobre tablas centrales y compartió los resultados. En los objetos devueltos:

- `apparatus_registry` tiene los campos de texto `plant`, `location`, `system_name` y los datos maestros del equipo, además de `hotel_id`.
- `assets` tiene `location` como texto y `hotel_id`.
- `maintenance_pending_items` tiene `location` como texto y `hotel_id`.
- `maintenance_blocked_rooms` tiene `room_number` como texto y `hotel_id`.
- `maintenance_plans` incluye `apparatus_registry_id`; las OTs pueden incluir `apparatus_registry_id` y/o `maintenance_plan_id`.
- `maintenance_actions` y `maintenance_work_orders` tienen `hotel_id`.
- `hotels` sigue dependiendo de `tenants`, manteniendo el ámbito multiempresa.

La salida de esta consulta no muestra una tabla con nombre de catálogo jerárquico de ubicaciones ni columnas de relación como `location_id`, `parent_location_id`, `floor_id` o `room_id` en las tablas devueltas.

### 47.2 Conclusión provisional

Los datos aportados confirman que los campos físicos actuales principales (`plant`, `location`, `room_number`) son texto libre en los objetos relevantes. No se debe convertir texto de ubicación en relación estructurada automáticamente: los valores existentes pueden ser ambiguos o no estar normalizados.

**La auditoría aún no cubre todos los módulos físicos de Arias Suite.** La consulta anterior enumeraba tablas centrales por nombre e incluyó las tablas con nombres relacionados con location/room/floor/area/space/system, pero no devuelve necesariamente todas las tablas de módulos que guardan datos de ubicación con otros nombres (por ejemplo, módulos técnicos independientes). Antes de decidir qué registros recibirán `location_id`, hace falta un último inventario transversal de columnas en todas las tablas de `public` que tengan `hotel_id` y/o columnas de ubicación.

### 47.3 Cierre de auditoría y siguiente fase

El usuario ejecutó el inventario transversal y compartió las tablas que ya exponen ubicación o relaciones con hotel/activos. No se encontró un catálogo jerárquico existente. Se confirma la necesidad de una entidad nueva de ubicación y de relaciones opcionales para las entidades que actualmente mantienen ubicación en texto.

La migración 066 y la primera pantalla del configurador se han preparado en GitHub. Su estado de aplicación y validación se documenta en la sección 48. La migración 065 de seguridad está aplicada y las consultas de privilegios/políticas dieron el resultado esperado; la prueba funcional de aislamiento por usuario sigue pendiente.

## 48. PRIMERA IMPLEMENTACIÓN DEL CATÁLOGO DE UBICACIONES (2026-10-11)

> **Nota de vigencia:** las subsecciones siguientes describen la implementación inicial. El estado de aplicación se actualizó posteriormente en la sección 48.6; esa actualización más reciente prevalece sobre cualquier formulación histórica que haya quedado en apartados anteriores.

### 48.1 Artefactos creados en la rama

- Migración nueva: `supabase/migrations/066_hotel_location_hierarchy.sql`.
- Primera pantalla: `src/features/maintenance/pages/HotelStructurePage.tsx`.
- Ruta registrada: `/maintenance/structure`.
- Enlace desde `Configuración de mantenimiento`: botón `Estructura del hotel`.
- No se modificaron migraciones 001–065.
- **Actualización posterior (2026-10-11): el usuario confirmó que la migración 066 ya se ejecutó en Supabase.** La presencia efectiva de todos los objetos, constraints, índices, privilegios y políticas debe comprobarse con las consultas de verificación indicadas abajo; tampoco se ha confirmado aún la prueba en navegador.

### 48.2 Modelo definido por la migración 066

La nueva tabla `public.hotel_locations` incluye:
- `id` y `hotel_id`;
- relación opcional `parent_location_id`;
- `location_type` de texto flexible;
- `code`, `name`, `description`, `sort_order`;
- `active`;
- `created_by`, `updated_by`, marcas de tiempo.

Las reglas del esquema buscan impedir:
- una ubicación superior perteneciente a otro hotel;
- auto-referencias y ciclos jerárquicos;
- nombres duplicados dentro del mismo nivel del mismo hotel;
- códigos duplicados dentro del hotel;
- traslado de una ubicación entre hoteles;
- desactivación de un padre mientras conserve ubicaciones activas debajo.

La tabla habilita RLS. La lectura requiere acceso al hotel; crear requiere `maintenance.create`; modificar y desactivar requiere `maintenance.update`. No se concede borrado físico desde esta fase: las ubicaciones se desactivan para conservar referencias e histórico.

### 48.3 Integración de esquema, sin asignación automática

La migración añade `location_id` nullable y una clave foránea compuesta que exige que la ubicación pertenezca al mismo hotel en:
- `apparatus_registry`;
- `assets`;
- `electrical_panels`;
- `maintenance_pending_items`;
- `maintenance_blocked_rooms`.

No rellena estas columnas para registros existentes. Los campos de texto `plant`, `location` y `room_number` se conservan. No se supone que números de habitación o textos históricos sean inequívocos.

Los planes PAM, trabajos programados, ejecuciones y OTs conservan sus relaciones existentes con los equipos/planes. No se les crea un enlace de ubicación redundante en esta fase.

### 48.4 Alcance funcional de la primera pantalla

La pantalla permite:
- consultar y buscar ubicaciones del hotel activo;
- crear una ubicación raíz o una ubicación hija;
- definir tipo preestablecido o personalizado, nombre, código opcional, orden y descripción;
- cambiar ubicación superior, sujeto a validación;
- modificar registros;
- activar o desactivar sin eliminación física;
- expandir/contraer ramas de la jerarquía;
- filtrar por estado.

No incluye todavía la copia de plantas/habitaciones, plantillas de composición de equipamiento ni selector estructurado dentro de las fichas de equipos, activos, pendientes o habitaciones bloqueadas. Esas funcionalidades deben implementarse después de verificar el esquema vivo y probar el catálogo inicial.

### 48.5 Validación y orden de continuación

1. **Confirmación recibida:** el usuario indica que la migración 066 ya se ha ejecutado en Supabase.
2. Verificar con consultas de solo lectura que existen `hotel_locations`, los cinco campos `location_id`, constraints, índices y las políticas/privilegios esperados. La confirmación de ejecución no sustituye esta verificación del esquema vivo.
3. Abrir `/maintenance/structure` y probar alta, edición, cambio de padre, duplicados, búsqueda, desactivación y reactivación; registrar cualquier error de RLS/permisos.
4. Probar dos hoteles con estructuras distintas para comprobar aislamiento. Esta validación funcional todavía no consta como realizada.
5. Integrar el selector en `apparatus_registry` primero, manteniendo los campos de texto existentes. Después valorar `assets`, cuadros eléctricos, pendientes y bloqueos.
6. Implementar copia con vista previa, renumeración explícita, política de conflictos y una transacción; no copiar activos físicos ni historiales.
7. Solo cuando el catálogo esté estable, diseñar plantillas de composición prevista para habitaciones/equipamiento.

El estado Vercel del commit de aplicación `65abc7d1fb99181e4dcddf8b39819a3fa1c9ca27` fue `success` (preview: https://vercel.com/arias9/arias-suite/5gHwkW4AAcuTUzQQkskttLpzQfTS), por lo que el build asociado a los cambios de pantalla/ruta/enlace pasó. No se ejecutó una compilación local ni pruebas de navegador; la pantalla aún debe probarse contra Supabase tras la confirmación de ejecución de la migración 066. Los commits posteriores al de aplicación actualizan documentación.



### 48.6 ACTUALIZACIÓN DE CONTINUIDAD — MIGRACIÓN 066 CONFIRMADA POR EL USUARIO (2026-10-11)

El usuario ha confirmado en conversación que la migración **066 está OK y ya se ha ejecutado**. Registrar esto como confirmación del usuario, no como una verificación independiente del esquema de Supabase.

**Estado actual de cada parte:**
- **Migración 066:** ejecución confirmada por el usuario; todavía falta verificar por consulta que todos los objetos, constraints, índices, privilegios y políticas esperados existan efectivamente en el proyecto correcto.
- **Pantalla y ruta:** existen en la rama `feature/arias-suite-common-ui-v1`; ruta `/maintenance/structure`, accesible desde Configuración de mantenimiento mediante el botón “Estructura del hotel”.
- **Build:** el commit de aplicación `65abc7d1fb99181e4dcddf8b39819a3fa1c9ca27` tenía estado Vercel `success`. Esto no equivale a una prueba funcional de navegador ni a la verificación del nuevo esquema tras ejecutar 066.
- **Pruebas de pantalla:** no consta todavía confirmación de alta, edición, cambio de padre, búsqueda, desactivación/reactivación y aislamiento entre hoteles.
- **Modelo de datos existente:** no se ha hecho backfill automático de `location_id`; el catálogo comienza vacío salvo que el usuario cree ubicaciones explícitamente. Los campos de texto antiguos se conservan.
- **Seguridad:** sigue pendiente la prueba funcional del aislamiento de 065 por usuario/hotel, además de comprobar los permisos específicos del catálogo 066.

**Siguiente paso exacto al retomar:** primero verificar el esquema vivo resultante de 066 con SQL de solo lectura; después abrir y probar `/maintenance/structure`. No crear todavía la función de copia ni los selectores de ubicación en otras fichas hasta comprobar esta base. No modificar las migraciones históricas ni volver a ejecutar 065/066 a ciegas.

**Regla de continuidad para el siguiente chat:** leer este Documento Maestro completo y continuar desde esta sección 48.6. La rama activa sigue siendo `feature/arias-suite-common-ui-v1` y el repositorio `EmersonArias/arias-pam`. Mantener la distinción entre cambios presentes en GitHub, migraciones que el usuario confirma haber ejecutado, objetos verificados en Supabase y pruebas funcionales realmente realizadas.


## 49. PASO OPERATIVO INMEDIATO — VERIFICAR LA MIGRACIÓN 066

### 49.1 Instrucción
El usuario ha confirmado la ejecución de 066. No volver a ejecutar la migración. En Supabase, dentro del proyecto Arias Suite correcto (`eqxcuwrfestwqelnucmv`), abrir SQL Editor y ejecutar las consultas siguientes, una por una. Son exclusivamente de lectura. Compartir los resultados con el asistente antes de tocar otra parte del código.

### 49.2 Columnas de catálogo y relaciones nuevas

```sql
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    table_name = 'hotel_locations'
    OR (
      table_name IN (
        'apparatus_registry',
        'assets',
        'electrical_panels',
        'maintenance_pending_items',
        'maintenance_blocked_rooms'
      )
      AND column_name = 'location_id'
    )
  )
ORDER BY table_name, ordinal_position;
```

Resultado esperado: tabla `hotel_locations` con sus columnas definidas en 48.2 y columna `location_id` en las cinco tablas previstas.

### 49.3 Constraints y claves foráneas

```sql
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.key_column_usage AS kcu
  ON kcu.constraint_catalog = tc.constraint_catalog
 AND kcu.constraint_schema = tc.constraint_schema
 AND kcu.constraint_name = tc.constraint_name
 AND kcu.table_name = tc.table_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_catalog = tc.constraint_catalog
 AND ccu.constraint_schema = tc.constraint_schema
 AND ccu.constraint_name = tc.constraint_name
LEFT JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_catalog = tc.constraint_catalog
 AND rc.constraint_schema = tc.constraint_schema
 AND rc.constraint_name = tc.constraint_name
WHERE tc.constraint_schema = 'public'
  AND tc.table_name IN (
    'hotel_locations',
    'apparatus_registry',
    'assets',
    'electrical_panels',
    'maintenance_pending_items',
    'maintenance_blocked_rooms'
  )
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;
```

Resultado esperado: PK, reglas únicas/check y claves foráneas previstas. Confirmar especialmente la relación jerárquica de `hotel_locations` y las claves que hacen coincidir hotel y ubicación; no asumir que la migración quedó completa solo porque existe la tabla.

### 49.4 Índices y estado RLS

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'hotel_locations',
    'apparatus_registry',
    'assets',
    'electrical_panels',
    'maintenance_pending_items',
    'maintenance_blocked_rooms'
  )
ORDER BY tablename, indexname;
```

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'hotel_locations',
    'apparatus_registry',
    'assets',
    'electrical_panels',
    'maintenance_pending_items',
    'maintenance_blocked_rooms'
  )
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
```

### 49.5 Políticas y privilegios efectivos

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'hotel_locations',
    'apparatus_registry',
    'assets',
    'electrical_panels',
    'maintenance_pending_items',
    'maintenance_blocked_rooms'
  )
ORDER BY tablename, policyname;
```

```sql
SELECT
  roles.role_name,
  target.table_name,
  privileges.privilege_type,
  has_table_privilege(
    roles.role_name,
    format('public.%I', target.table_name),
    privileges.privilege_type
  ) AS has_privilege
FROM (
  VALUES ('anon'), ('authenticated')
) AS roles(role_name)
CROSS JOIN (
  VALUES
    ('hotel_locations'),
    ('apparatus_registry'),
    ('assets'),
    ('electrical_panels'),
    ('maintenance_pending_items'),
    ('maintenance_blocked_rooms')
) AS target(table_name)
CROSS JOIN (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
) AS privileges(privilege_type)
ORDER BY target.table_name, roles.role_name, privileges.privilege_type;
```

No comparar todos los privilegios de todas las tablas con un patrón genérico sin leer las políticas y el modelo de permisos de cada módulo. En `hotel_locations`, comprobar en particular que `anon` no tenga acceso y que `authenticated` disponga solo de los privilegios esperados para poder actuar a través de RLS. Las consultas describen privilegios SQL y políticas; por sí solas no demuestran aislamiento funcional entre hoteles.

### 49.6 Después de revisar las consultas
Si las consultas muestran el esquema esperado, abrir la aplicación desplegada y entrar en **Configuración de mantenimiento → Estructura del hotel**. Probar primero una ubicación raíz y una hija de prueba, modificar sus datos, comprobar búsqueda y filtros, y probar desactivación/reactivación. No crear datos reales de SB Diagonal Zero sin que el usuario proporcione o valide esa estructura. Después probar que una ubicación de un hotel no puede usarse desde otro hotel.

Si una consulta da error o faltan objetos, detenerse y revisar el resultado; no volver a ejecutar 066 ni modificar migraciones aplicadas de forma improvisada. Registrar en este Maestro qué consultas se completaron y qué resultados se observaron.


## 50. RESULTADO DE VERIFICACIÓN 066 Y CORRECCIÓN DE PRIVILEGIOS (2026-10-11)

### 50.1 Resultado recibido del usuario
El usuario ejecutó la consulta consolidada de verificación después de aplicar 066. Resultados:

- OK: tabla `hotel_locations` presente.
- OK: columnas esperadas de `hotel_locations` presentes.
- OK: `location_id` presente en las cinco tablas objetivo.
- OK: clave única `hotel_id + id`.
- OK: las seis claves foráneas esperadas.
- OK: los diez índices esperados.
- OK: RLS activo en `hotel_locations`.
- OK: trigger/función de validación de jerarquía presentes y habilitados.
- OK: políticas esperadas de lectura, inserción y actualización presentes; no hay política DELETE/ALL en el resultado consultado.
- OK: `anon` no tiene privilegios sobre `hotel_locations`.
- **REVISAR:** comprobación agregada de que `authenticated` tiene SELECT, INSERT y UPDATE, pero no DELETE.

Conclusión: el catálogo y las relaciones esenciales de 066 aparecen presentes. No dar por cerrada la configuración de privilegios de `authenticated` hasta corregir y volver a comprobar el último punto. Esta consulta consolidada no muestra cuál subcondición exacta falló; el SQL de 066 no revocaba explícitamente los privilegios previos de `authenticated` antes de conceder SELECT/INSERT/UPDATE, de modo que un DELETE concedido por privilegios por defecto es una explicación probable, no una medición desglosada del resultado.

### 50.2 Corrección preparada en GitHub
Se ha creado una migración nueva, sin modificar 066 ni ninguna migración anterior:

`supabase/migrations/067_fix_hotel_locations_table_privileges.sql`

Commit: `1a3163e1751914fb4c7c167b46af86ed9674bee4`.

La migración revoca todos los privilegios de tabla de `PUBLIC`, `anon` y `authenticated` sobre `hotel_locations`, y vuelve a conceder únicamente SELECT, INSERT y UPDATE a `authenticated`. No concede DELETE, no cambia datos y no modifica políticas RLS. El usuario ejecutó directamente en SQL Editor el mismo bloque correctivo. La consulta posterior confirmó el estado esperado de privilegios; no volver a ejecutar ese bloque ni la migración 067 sin una razón concreta. El archivo de migración 067 permanece en GitHub para mantener la corrección documentada en el repositorio.

### 50.3 Resultado posterior confirmado por el usuario
El usuario ejecutó la consulta de privilegios después de la corrección. Resultado:

| Privilegio | Resultado |
|---|---|
| `anon_select` | `false` |
| `anon_insert` | `false` |
| `anon_update` | `false` |
| `anon_delete` | `false` |
| `authenticated_select` | `true` |
| `authenticated_insert` | `true` |
| `authenticated_update` | `true` |
| `authenticated_delete` | `false` |

**Conclusión:** privilegios SQL efectivos para `hotel_locations` confirmados como esperados. Esto valida privilegios de tabla; no demuestra por sí solo el aislamiento funcional por hotel ni el correcto funcionamiento de la pantalla.

### 50.4 Siguiente acción: prueba de pantalla, sin más consultas SQL por ahora
1. En la aplicación web desplegada, entrar en **Configuración de mantenimiento → Estructura del hotel**. También se puede abrir directamente la ruta `/maintenance/structure` dentro del dominio habitual de la aplicación.
2. Confirmar que la pantalla carga sin error y que muestra correctamente el contexto del hotel seleccionado.
3. Crear una ubicación de prueba, crear una ubicación hija, editar un campo, buscarla y probar la desactivación/reactivación. Usar nombres de prueba identificables; no inventar ni cargar la estructura física real de SB Diagonal Zero sin validación del usuario.
4. Si aparece un error, enviar captura o texto exacto y detener ahí para diagnosticarlo. Si funciona, confirmar qué operaciones se probaron y entonces planificar la prueba de aislamiento entre hoteles.

No se deben volver a ejecutar las migraciones 065, 066 ni el bloque de privilegios 067 de forma rutinaria. Registrar los siguientes resultados solo cuando el usuario los confirme.


## 51. PRIMERA VALIDACIÓN VISUAL DE ESTRUCTURA DEL HOTEL (2026-10-11)

El usuario abrió la ruta desplegada `/maintenance/structure` en `arias-suite.vercel.app` y compartió una captura de pantalla.

### Resultado observado
- La página carga y muestra el encabezado **Estructura del hotel**.
- El contexto indica que el hotel activo seleccionado es **Hotel SB Diagonal Zero**.
- La página muestra cero ubicaciones activas, cero principales y cero inactivas; el estado vacío dice que todavía no hay ubicaciones configuradas.
- En la captura no aparece ningún error de carga ni mensaje de fallo de Supabase.
- Por tanto, la pantalla y la consulta de lectura presentan un estado vacío normal; no hay evidencia visual de un fallo de conexión. Aún no se ha probado inserción, modificación, desactivación ni aislamiento entre hoteles.
- No se debe crear una ubicación inventada ni precargar la estructura física real del hotel sin validación explícita.

### Siguiente decisión necesaria
Antes de escribir el primer registro real, confirmar el criterio del primer nivel de la jerarquía para SB Diagonal Zero: por ejemplo, si plantas/sótanos serán ubicaciones raíz o si habrá una ubicación raíz superior (como un edificio o bloque) con plantas debajo. Estos son ejemplos de modelado, no datos confirmados del hotel. La jerarquía es flexible por diseño, así que no imponer una estructura universal.

Una vez validado por el usuario el primer nivel, crear una ubicación real y probar alta/lectura; después probar una ubicación hija, edición, búsqueda y desactivación/reactivación. Evitar datos de prueba persistentes porque la pantalla no ofrece eliminación física.


## 52. CAMBIO DE HOTEL ACTIVO — COMPORTAMIENTO EXISTENTE (2026-10-11)

La revisión del código de `src/shared/context/HotelScopeContext.tsx` confirma que Arias Suite ya dispone de un selector global de hotel activo:

- Si el usuario tiene acceso a más de un hotel activo, aparece un selector fijo en la parte superior de la aplicación, con la etiqueta “Hotel activo” y opciones `código · nombre`.
- Al elegir otro hotel, se ejecuta `set_active_hotel`, se actualiza el contexto global y se dispara el evento `arias:hotel-change`.
- La pantalla `Estructura del hotel` consume ese contexto con `useHotelScope()` y vuelve a consultar `hotel_locations` usando el `hotel_id` seleccionado. La estructura del hotel anterior no se debe copiar automáticamente al nuevo.
- Los usuarios normales solo reciben los hoteles activos que figuran en sus asignaciones activas de `user_hotel_roles`; la lógica de plataforma administradora carga todos los hoteles activos.
- Si solo hay un hotel disponible para la cuenta, el selector no aparece. En la captura actual no se ve el selector; esto es coherente con que la cuenta tenga un único hotel disponible, aunque no demuestra por sí solo la causa.
- Si otro hotel no aparece en el selector, primero hay que confirmar que está activo y que la cuenta tiene una asignación/rol activo para él (o que la cuenta es administradora de plataforma). No crear la ubicación desde el contexto del hotel equivocado.

Este comportamiento ya existe en código: no requiere añadir otro selector específico en la pantalla Estructura del hotel. Se debe probar el cambio de hotel cuando una cuenta tenga acceso efectivo a más de uno.


## 53. REGLA DE DECISIÓN Y SIGUIENTE REVISIÓN ARQUITECTÓNICA (2026-10-11)

### 53.1 Instrucción permanente del usuario
No dar decisiones, comportamientos observados, disponibilidad ni causas por supuestos. Antes de proponer cambios:
1. distinguir hechos comprobados de inferencias y cuestiones desconocidas;
2. explicar por qué el diseño/código actual funciona como funciona y qué objetivo parece satisfacer;
3. identificar consecuencias y riesgos, incluidas alternativas razonables;
4. recomendar una opción con motivos;
5. esperar aprobación del usuario antes de cerrar una decisión importante de producto o introducir datos físicos no confirmados.
No ejecutar pasos que no aporten evidencia o valor concreto. Cuando el usuario pueda ver los cambios relevantes en este Documento Maestro, actualizarlos aquí.

### 53.2 Corrección de precisión sobre el selector de hotel
El código de `HotelScopeContext.tsx` muestra que el selector global se renderiza cuando la cuenta tiene acceso a más de un hotel activo. La captura de `/maintenance/structure` muestra que no se ve un selector, pero **no demuestra por qué** no se ve. No está confirmado si la cuenta solo tiene un hotel asignado, si no hay un segundo hotel activo o si existe otra condición. No presentar la causa como conocida sin comprobarla.

### 53.3 Estado real antes de continuar
- La migración 066 y los privilegios de la tabla `hotel_locations` están verificados según los resultados que proporcionó el usuario.
- La pantalla `/maintenance/structure` carga con el hotel seleccionado y estado vacío, sin error visible en la captura.
- No consta todavía prueba funcional de crear, editar, crear hija, buscar, desactivar/reactivar ni aislamiento por hotel.
- No hay datos de ubicaciones creados como parte de las pruebas.
- Los selectores de ubicación no están integrados aún en las fichas de las cinco tablas enlazadas.
- No se ha implementado la copia de estructuras entre ubicaciones/hoteles.
- El esquema actual vincula `location_id` a `apparatus_registry`, `assets`, `electrical_panels`, `maintenance_pending_items` y `maintenance_blocked_rooms`, pero no añade relación directa de ubicación a cada OT o ejecución en esta migración.

### 53.4 Siguiente acción propuesta: revisión de diseño antes de poblar el catálogo
No crear todavía plantas, habitaciones ni registros ficticios. Hacer una revisión puntual con el código/esquema existente para decidir lo siguiente antes de ligar datos reales:
1. **Ubicación histórica de OT/ejecuciones:** si un activo cambia de ubicación, ¿los informes históricos deben mostrar la ubicación actual del activo o la ubicación que tenía cuando ocurrió la OT/ejecución? La respuesta puede cambiar el modelo: asociación a ubicación actual, registro de movimientos o instantánea de ubicación en el evento. No asumir una respuesta.
2. **Copia y alta de nuevos hoteles:** determinar si se necesita copiar un subárbol dentro del mismo hotel, una estructura de un hotel a otro o plantillas reutilizables. La copia debe afectar solo a la estructura lógica, nunca duplicar activos físicos, OTs, PAM, fotos ni históricos.
3. **Jerarquía y tipos:** confirmar qué grados de libertad necesita el producto: tipos de ubicación configurables y combinación libre de padres/hijos, o reglas opcionales por tipo. La implementación actual admite tipos personalizados y jerarquía flexible, sin validar combinaciones entre tipos.
4. **Cobertura de entidades:** revisar dónde deben seleccionarse ubicaciones en las fichas y cómo se mantiene la coherencia entre las entidades `apparatus_registry` y `assets`, sin suponer que son el mismo concepto.

La revisión debe terminar presentando hechos comprobados, riesgos, alternativas y una recomendación concreta para aprobación del usuario. Después de la aprobación se decide si primero se prueba el CRUD con datos operativos confirmados o se implementa una parte de modelo necesaria para evitar rehacer datos más adelante. No introducir datos reales de SB Diagonal Zero por inferencia.


## 54. AUDITORÍA INICIAL DE OT, EQUIPOS Y UBICACIÓN HISTÓRICA (2026-10-11)

Revisión estática de las migraciones y páginas actuales de la rama `feature/arias-suite-common-ui-v1`. Estos son hallazgos del código fuente; no equivalen a una prueba funcional de datos vivos.

### 54.1 Hallazgos comprobados en código
1. `ApparatusRegistryDetailPage.tsx` continúa editando los campos de texto libre `plant` y `location`. La pantalla `HotelStructurePage.tsx` todavía no está integrada en la ficha de equipo.
2. La migración 066 enlaza mediante `location_id` cinco entidades: `apparatus_registry`, `assets`, `electrical_panels`, `maintenance_pending_items` y `maintenance_blocked_rooms`. No añade una relación de ubicación directa a `maintenance_work_orders` ni a `maintenance_executions`.
3. La migración 055 permite crear OTs correctivas/actuaciones sin `maintenance_plan_id` y permite guardar `apparatus_registry_id` directamente en la OT.
4. En la definición de `maintenance_work_orders_resolved` de la migración 055, los campos `apparatus_code`, `apparatus_name`, `plant` y `location` se obtienen de `apparatus_registry` con una unión por `mp.apparatus_registry_id`. La vista expone también `COALESCE(wo.apparatus_registry_id, mp.apparatus_registry_id)` como `resolved_apparatus_registry_id`, pero esa expresión no se usa en la unión que proporciona dichos campos.
5. `MaintenanceWorkOrdersPage.tsx` consume `maintenance_work_orders_resolved` y presenta `plant`/`location`. Por tanto, en OTs operativas con equipo guardado directamente en la OT y sin plan PAM, el código de vista actual puede dejar vacíos los campos de equipo/ubicación. Confirmar el caso real y corregir la resolución en una modificación futura separada; no atribuirle aún un fallo concreto en datos vivos.
6. Las vistas consultadas leen `plant`/`location` de la ficha actual del equipo; en el modelo visible de estas vistas no hay una instantánea de ubicación ligada al momento de creación/ejecución de la OT. Esto crea un riesgo de atribución histórica si se usa únicamente la ubicación actual del equipo. No confirma que toda la aplicación carezca de cualquier otra solución de histórico, por lo que hace falta revisar el flujo completo antes de decidir.
7. `maintenance_executions` está relacionado con `maintenance_plans` y opcionalmente con `maintenance_work_orders`; la ubicación no se captura en la migración 018 ni en la 066.

### 54.2 Implicación arquitectónica
Antes de integrar el selector de ubicación en formularios, hay que definir si una OT puede señalar:
- un activo/equipo;
- una ubicación física sin activo asociado;
- equipo y ubicación de intervención a la vez.

También hay que definir qué debe guardar el histórico: ubicación actual del equipo, ubicación al abrir la OT, ubicación al ejecutar el trabajo, o historial temporal de movimientos del activo. Estas situaciones no son equivalentes; no elegir por inferencia.

Opciones a estudiar:
- **A. Solo ubicación actual del activo:** sencilla, pero los informes antiguos podrían mostrar la ubicación actual en lugar de la que tenía el activo cuando ocurrió el trabajo.
- **B. Instantánea en la OT/ejecución:** preserva el contexto del evento; debe definirse la diferencia entre ubicación reportada al abrir y ubicación real de intervención al cerrar, si puede cambiar.
- **C. Historial temporal de ubicaciones del activo:** permite reconstruir movimientos por fecha, pero exige registrar y validar cada traslado correctamente y tiene mayor complejidad.

La revisión deberá considerar también que las OTs pueden ser por espacio y no por equipo, así como las relaciones diferentes de `apparatus_registry` y `assets`. No ejecutar aún cambios de esquema ni precargar el catálogo. Presentar recomendación con ventajas, limitaciones e impacto en informes para aprobación del usuario.

## 55. ENTREGA PARA EMPEZAR PRUEBAS INTEGRALES DE UBICACIONES Y OT (2026-10-11)

### 55.1 Alcance de esta entrega

Se prepara una entrega para probar el recorrido de ubicaciones en la operación, sin precargar ubicaciones de SB Diagonal Zero ni modificar registros existentes por inferencia.

1. **Catálogo:** la pantalla `/maintenance/structure` añade copia de subárbol dentro del hotel activo. Se copian solo nodos de `hotel_locations`, con UUID nuevos y códigos vacíos; no se copian equipos/activos, números de serie, fotos, documentos, PAM, OTs ni históricos.
2. **Ficha de equipo:** selector de ubicación estructurada asociado al hotel activo. Los campos anteriores `plant` y `location` se conservan como referencia histórica y no se convierten automáticamente en nodos.
3. **Alta de OT operativa:** permite indicar ubicación comunicada al abrir la OT, incluso cuando no hay equipo concreto. Si no se indica, el backend intenta capturar la ubicación estructurada del equipo y conserva como instantánea la referencia textual antigua si no hay catálogo vinculado.
4. **Ubicación de ejecución:** la ficha de OT permite indicar dónde se ejecutó el trabajo. Al pasar la OT a cerrada queda guardada la ruta como instantánea histórica. Si no se selecciona otra ubicación, se captura la comunicada originalmente.
5. **Vista de OT:** corrige la asociación del equipo directo de una OT correctiva/actuación sin plan PAM y expone los campos de ubicación comunicada y real.
6. **Histórico existente:** no se rellena retrospectivamente la instantánea de OTs antiguas a partir de la ubicación actual del equipo. El histórico previo sin instantánea se identifica como tal.

### 55.2 Migración 068 — pendiente de aplicar en Supabase

Archivo: `supabase/migrations/068_operational_location_snapshots_and_copy.sql`.

- Migración aditiva nueva. No altera las migraciones 001–067 ni elimina tablas o datos.
- Añade IDs de ubicación comunicada/ejecución e instantáneas de texto a `maintenance_work_orders`, con FK al hotel correcto.
- Añade trigger para capturar y preservar contexto histórico al crear y cerrar OT.
- Añade RPC protegida para crear OT operativa con ubicación explícita y RPC transaccional para copiar solo el árbol lógico de ubicaciones del mismo hotel.
- Corrige `maintenance_work_orders_resolved` para resolver el equipo desde la OT directa o desde el PAM.
- **No se ha ejecutado** esta migración desde esta conexión. Aplicarla una sola vez en SQL Editor del proyecto Supabase correcto después de 067. No reejecutar 066 ni 067.

### 55.3 Plan de prueba

1. Esperar estado Vercel satisfactorio de la entrega y aplicar 068 una sola vez.
2. En `/maintenance/structure`, crear nodos temporales identificables como `ZZ_TEST_PLANTA_A` y `ZZ_TEST_SALA_A`; probar añadir hija, modificar, buscar, desactivar/reactivar por orden hoja → raíz.
3. Copiar la estructura de prueba como `ZZ_TEST_PLANTA_A_COPIA`; comprobar los IDs nuevos, códigos vacíos y ausencia de copia de equipos/OTs/PAM/fotos/documentos/histórico.
4. Asignar a un equipo de prueba la ubicación hija; guardar y reabrir para validar persistencia.
5. Crear una OT sin equipo indicando ubicación comunicada, y otra con equipo asociado sin indicar ubicación. Confirmar selección explícita o captura desde equipo/texto anterior.
6. En la ficha de OT, seleccionar una ubicación real de intervención distinta, guardar y cerrar. Comprobar que aparecen ambas instantáneas.
7. Renombrar después el nodo temporal y comprobar que la instantánea cerrada no cambia.
8. Validar aislamiento de hotel con una cuenta que tenga acceso real a dos hoteles distintos.
9. Desactivar los nodos `ZZ_TEST_*` de hoja a raíz una vez cerradas las pruebas. No hay borrado físico en el configurador por diseño.

### 55.4 Límites conocidos

- Esta entrega prioriza equipo maestro y OT para iniciar el ciclo de prueba.
- Los selectores de ubicación en `assets`, `electrical_panels`, `maintenance_pending_items` y `maintenance_blocked_rooms` siguen pendientes, al igual que copiar estructuras entre hoteles distintos.
- Estado de Vercel y funcionalidad en navegador deben verificarse tras el commit; escribir código no equivale a demostrar que el recorrido funcione en producción.


### 55.5 Estado observado tras el commit 414f13e (2026-10-11)

- Rama: `feature/arias-suite-common-ui-v1`.
- Commit de código y migración 068: `414f13e70ce07760595064cc34485604770212b6`.
- El comentario de Vercel en el PR informa un preview `Ready` para el proyecto `arias-pam`: https://arias-pam-git-feature-arias-suite-common-ui-v1-arias9.vercel.app.
- El estado para el proyecto `arias-suite` aparece como `Error`; el endpoint de estado no entrega la causa técnica detallada. Un comentario previo de Vercel (8 de octubre) mencionó el límite gratuito de más de 100 despliegues diarios, pero no se ha confirmado que ese sea el motivo específico del fallo del 11 de octubre. No afirmar que la compilación del proyecto `arias-suite` haya pasado hasta verificar sus logs.
- El preview `arias-pam` no debe confundirse con el alias/despliegue habitual de `arias-suite`. Confirmar variables de entorno y proyecto Supabase antes de probar operaciones con datos.
- La migración 068 permanece sin ejecutar. Sin ella, el selector del catálogo 066 puede cargarse, pero las nuevas RPC/columnas de ubicación de OT no estarán disponibles y el flujo completo de creación/cierre de OT no está listo.
- Para cerrar la validación se requiere acceso autorizado a los logs de Vercel y al proyecto Supabase correcto, o que el usuario ejecute 068 desde SQL Editor y comparta el resultado. No repetir 066 ni 067.


## 56. CORRECCIÓN DE PRESENTACIÓN DEL HISTÓRICO Y PREPARACIÓN FINAL DE PRUEBAS (2026-10-11)

### 56.1 Hallazgo
La primera integración de la instantánea de ubicación en las OTs ya estaba en código, pero algunas vistas seguían mostrando `plant`/`location` de la ficha vigente cuando no había instantánea histórica. En una OT antigua, eso podía confundirse con el lugar original de la intervención.

### 56.2 Cambios de código
- La lista de OTs abiertas deja de presentar la ubicación textual actual del equipo como si fuese la instantánea histórica.
- La ficha de OT separa la ubicación comunicada almacenada de la referencia textual heredada de la ficha del equipo, que se etiqueta explícitamente como no histórica.
- El histórico carga y permite buscar por `reported_location_snapshot` y `execution_location_snapshot`, y muestra ambas en móvil y escritorio.
- El informe imprimible de tickets abiertos usa la instantánea comunicada y deja de usar `plant`/`location` como sustituto histórico.
- Los registros anteriores a 068 sin instantánea se mostrarán como **“Sin instantánea histórica”**; no se les atribuye retroactivamente la ubicación actual del equipo.
- No se cambia ninguna migración ni se escriben datos operativos desde esta tarea.

### 56.3 Bloqueos antes de la prueba integrada
1. La migración `068_operational_location_snapshots_and_copy.sql` sigue pendiente de aplicar una sola vez en el SQL Editor del proyecto Supabase correcto (`eqxcuwrfestwqelnucmv`). No volver a ejecutar 066 ni 067.
2. La compilación local/lint no se han ejecutado desde esta conexión; hay que verificar el despliegue Preview después de los cambios. El Preview conocido corresponde al proyecto Vercel `arias-pam`, no al alias `arias-suite`.
3. No se ha realizado prueba funcional en navegador ni prueba de aislamiento entre hoteles. No dar por terminada la fase hasta validar en la aplicación real.

### 56.4 Secuencia mínima de aceptación
- Confirmar que el despliegue Preview contiene el nuevo commit y que apunta al proyecto Supabase esperado.
- Aplicar 068 una sola vez y comprobar la salida completa sin errores; después refrescar la aplicación.
- Crear ubicaciones temporales `ZZ_TEST_PLANTA_A` y `ZZ_TEST_SALA_A`; probar alta, edición, relación padre/hija, búsqueda, copia, desactivación y reactivación.
- Asignar solo un equipo de prueba a la ubicación hija y comprobar guardado/reapertura.
- Crear una OT operativa sin equipo con ubicación comunicada y otra con un equipo de prueba.
- Antes de cerrar la OT, elegir una ubicación de ejecución distinta, guardar y cerrar; confirmar que las instantáneas comunicada y de ejecución son distintas y legibles.
- Renombrar luego el nodo de prueba y verificar que la instantánea ya guardada no cambia.
- Verificar con dos hoteles que ningún ID de ubicación de un hotel se acepte en el otro.
- Desactivar los datos `ZZ_TEST_*` hoja por hoja y al final su raíz. No borrar físicamente ni modificar registros reales.

### 56.5 Estado de entrega
Estos cambios de interfaz y documentación requieren revisión de compilación y navegador tras el commit. La migración 068 no se ha ejecutado desde esta conexión y ninguna prueba real se declara superada todavía.


## 57. ESTADO REAL TRAS APLICAR LA MIGRACIÓN 068 (2026-10-11)

Esta sección **actualiza y prevalece sobre los puntos de estado de las secciones anteriores que indicaban que 068 seguía pendiente**.

#### 57.1 Supabase confirmado
- Proyecto verificado: `eqxcuwrfestwqelnucmv` (proyecto de Arias PAM).
- Se aplicó desde la conexión Supabase la migración oficial `068_operational_location_snapshots_and_copy`, usando el contenido del archivo versionado `supabase/migrations/068_operational_location_snapshots_and_copy.sql` de `feature/arias-suite-common-ui-v1`.
- El registro de migraciones de Supabase devuelve la versión `20261011203329` con el nombre `068_operational_location_snapshots_and_copy`.
- La consulta posterior confirma que existen las cuatro columnas de ubicación en `maintenance_work_orders`: `reported_location_id`, `reported_location_snapshot`, `execution_location_id` y `execution_location_snapshot`.
- La vista `maintenance_work_orders_resolved` expone las cuatro columnas; el trigger `trg_snapshot_maintenance_work_order_locations` está habilitado.
- Las funciones de copia de estructura y creación de OT operativa están disponibles para `authenticated` y no para `anon`. La función interna de instantáneas no se expone para llamada directa.
- El estado de datos comprobado inmediatamente después de la migración: 1 hotel, 309 equipos, 203 órdenes de trabajo, 0 ubicaciones en `hotel_locations` y 0 OTs con nuevas referencias/instantáneas. No se modificaron órdenes históricas ni se crearon ubicaciones de prueba.

#### 57.2 Lo que aún no está validado
- La comprobación del commit `8c6ec909f2e73be9d18f909671e41b8601b3f82b` devuelve el estado de Vercel **failure** para el proyecto `arias-suite`. La causa concreta no se pudo leer desde la conexión disponible.
- No se ha confirmado un despliegue Preview accesible que incluya exactamente el commit actual, ni se ha podido realizar prueba de navegador autenticada.
- La aplicación de 068 **sí está completada**; quedan pendientes las pruebas de interfaz, permisos RLS reales por usuario, copia de estructura, creación/cierre de OT y persistencia de las dos instantáneas.
- No afirmar que Arias Suite está listo para producción. La fase está en estado **migración aplicada / pruebas funcionales pendientes**.

#### 57.3 Próximos pasos
1. Resolver el fallo de despliegue de Vercel y confirmar qué commit y variables de entorno utiliza el Preview.
2. Abrir el Preview con un usuario autenticado y el hotel de prueba correcto.
3. Crear nodos temporales identificables con prefijo `ZZ_TEST_`; probar edición, jerarquía, copia, desactivación y reactivación. No crear ni alterar ubicaciones reales por suposición.
4. Probar una OT operativa con ubicación comunicada y sin equipo; después seleccionar una ubicación de ejecución distinta, cerrar y comprobar ambas instantáneas en el histórico.
5. Verificar el aislamiento de hoteles y permisos con sesiones reales. Desactivar los datos temporales al terminar; no borrar físicamente registros ni modificar OTs reales.
6. No volver a ejecutar 068 ni modificar migraciones ya ejecutadas. Cualquier cambio posterior al esquema debe ser una nueva migración aditiva y revisada.



## 58. CAMBIO DE NOMBRE DEL PROYECTO Y CONSERVACIÓN DEL ARIAS SUITE ORIGINAL (2026-10-11)

### 58.1 Decisión de producto confirmada por el usuario
- El proyecto activo es **Arias PAM** (\`arias-pam\`), el proyecto avanzado en el que se está trabajando.
- El nombre deseado para ese proyecto activo es **Arias Suite** (\`arias-suite\`).
- Existe un **Arias Suite original**, actualmente apartado/parado, que debe conservarse para consulta futura y no confundirse con el proyecto activo.
- **Arias Home** es un proyecto separado; no incorporarlo a este cambio.
- El objetivo es cambiar el nombre del proyecto activo sin perder el Arias Suite original. No borrar, sobrescribir, fusionar ni reutilizar el código del proyecto original como parte del cambio de nombre.

### 58.2 Estado de GitHub comprobado el 2026-10-11
- Repositorio visible: https://github.com/EmersonArias/arias-pam
- Identificador del repositorio: \`1382563934\`.
- Nombre actual del repositorio: \`arias-pam\`.
- Rama predeterminada: \`main\`.
- Ramas visibles:
  - \`main\`, HEAD \`6a7fd586d480836763ea78e28ef39126780268f9\`, mensaje \`Sincronizar estado local de Arias Suite\` (2026-09-26).
  - \`feature/arias-suite-common-ui-v1\`, HEAD \`28f8eb4682bcae527899494812b122bdbb8f9862\`, mensaje \`docs: record migration 068 applied and test status\`.
- El archivo maestro que se está actualizando vive en \`docs/MAESTRO_CONTINUIDAD_ARIAS_SUITE.md\` de la rama \`feature/arias-suite-common-ui-v1\`.
- No se ha renombrado el repositorio de GitHub todavía.
- En la lista de repositorios visible no aparece un segundo repositorio llamado \`arias-suite\`. Por tanto, el código del proyecto original no está identificado como repositorio separado en esta conexión; no afirmar que ya está archivado ni que su copia de seguridad se haya realizado.
- No se ha realizado una copia de seguridad externa del repositorio original durante esta tarea.

### 58.3 Estado de Vercel comprobado el 2026-10-11
- El proyecto visible en Vercel se llama \`arias-suite\`, ID \`prj_nBFkOpHpajvYL9srjO5Mds2qjWNf\`, cuenta/equipo ID \`team_rcSR4IhA8hPNeQkEUU2ZulC1\`, ámbito/slug observado \`arias9\`.
- Sus metadatos de despliegue enlazan al repositorio \`EmersonArias/arias-pam\` y a la rama \`feature/arias-suite-common-ui-v1\`. Por ello, el nombre actual de Vercel no demuestra que sea el Arias Suite original: parece estar conectado al repositorio activo que el usuario quiere renombrar.
- El último despliegue observado: \`dpl_76QdPKeSNvzsg4pwoKdaafLv2NYz\`, URL \`https://arias-suite-ftl4776f5-arias9.vercel.app\`, estado \`ERROR\`, commit \`28f8eb4682bcae527899494812b122bdbb8f9862\`.
- También se observan varios despliegues recientes con estado \`ERROR\`; hay despliegues previos \`READY\`. No se ha obtenido el log técnico que explica el fallo actual.
- La conexión de Vercel devuelve 403 para operaciones bajo el ámbito \`arias9\`: no está autorizada para consultar detalles/logs completos ni para hacer cambios allí. No reintentar la misma operación sin resolver la autorización.
- No se ha cambiado ningún proyecto, dominio, alias, variable de entorno ni configuración de Vercel. No se ha creado un despliegue nuevo.
- El cambio del nombre de GitHub y el cambio del proyecto/dominio en Vercel son operaciones diferentes. Antes de tocar Vercel hay que recuperar acceso autorizado al ámbito correcto y confirmar el proyecto enlazado, variables de entorno y Supabase objetivo.

### 58.4 Plan seguro de renombrado y archivo — pendiente
**No se ha ejecutado aún ninguno de los cambios siguientes.**

1. **Identificar y preservar el Arias Suite original.** Encontrar su repositorio real, carpeta local o exportación. La documentación histórica menciona un proyecto local \`C:\\proyectos\\arias-suite\` y un proyecto Supabase con referencia \`hqxmycldqltovfkazoub\` en notas anteriores, pero no se ha comprobado que sigan accesibles ni que sean la fuente correcta del original. No confundir esa referencia histórica con el Supabase activo \`eqxcuwrfestwqelnucmv\` del proyecto \`arias-pam\`.
2. **Crear una copia de seguridad verificable del original** antes de renombrar nada. Preferencia: duplicado de repositorio que conserve historial y ramas, o archivo completo con Git/historial y documentos. Comprobar que la copia existe y se puede abrir. No declarar completada la copia hasta verificarla.
3. **Conservarlo con un nombre inequívoco**, por ejemplo \`arias-suite-original-archivo\` o \`arias-suite-legacy\`. Elegir el nombre tras identificar dónde está la fuente original. No borrar el original; si se decide archivarlo en GitHub, hacerlo solo después de verificar la copia y sus permisos.
4. **Renombrar el repositorio activo** \`EmersonArias/arias-pam\` a \`EmersonArias/arias-suite\` solo después de preservar el original y confirmar que el nuevo nombre no colisiona con un repositorio existente. Antes del cambio, revisar referencias al nombre antiguo en README, documentación, workflows, badges, scripts, enlaces y configuración.
5. **Actualizar el proyecto Vercel del activo** para que quede asociado al repositorio/branch correctos y revisar el dominio deseado. No asumir que renombrar GitHub renombra automáticamente el proyecto Vercel ni sus dominios. No desplegar a producción hasta que compile y se comprueben las variables.
6. **Validar Supabase y secretos**: el proyecto activo documentado es \`eqxcuwrfestwqelnucmv\`; el proyecto histórico citado en notas antiguas es \`hqxmycldqltovfkazoub\`. Verificar con la configuración real cuál usa cada aplicación antes de tocar variables o ejecutar SQL. No mover ni fusionar bases de datos como parte del simple renombrado.
7. **Probar el activo** en Preview, comprobar login, hotel seleccionado, módulos principales y operaciones de lectura/escritura seguras. No realizar pruebas destructivas con datos reales.
8. **Actualizar este Documento Maestro** con los nombres, URLs, IDs, rama/HEAD, dominio, configuración y comprobaciones reales una vez completados los pasos.

### 58.5 Cómo actuar en un chat nuevo
- Este documento es una fuente de continuidad, pero los datos vivos de GitHub, Vercel y Supabase deben volver a verificarse antes de ejecutar cambios.
- Trabajar directamente sobre GitHub mediante la conexión disponible cuando esté autorizada; no obligar al usuario a copiar código manualmente como flujo principal.
- Antes de escribir, leer la rama y el HEAD actuales. No confiar en los SHA históricos si el repositorio ha avanzado.
- **Regla crítica: no modificar el Arias Suite original ni tocar Vercel mientras no estén identificados con certeza el original, el proyecto activo y el alcance autorizado.**
- No modificar ni volver a ejecutar migraciones ya aplicadas. La migración \`068_operational_location_snapshots_and_copy\` está confirmada como aplicada en \`eqxcuwrfestwqelnucmv\`; no volver a ejecutarla.
- No inventar que se ha creado una copia de seguridad, que el repositorio se ha renombrado o que Vercel está corregido. Registrar únicamente acciones comprobadas.

### 58.6 Siguiente acción concreta
Resolver la localización del **Arias Suite original** (repositorio, carpeta local o exportación) y asegurar su copia. Después, renombrar el repositorio activo \`arias-pam\` a \`arias-suite\`, y finalmente corregir la conexión de Vercel con permisos autorizados. Hasta entonces, el renombrado queda **pendiente** y no se ha realizado ninguna modificación de código o despliegue en esta tarea.
