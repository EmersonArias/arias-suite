# MAESTRO DE CONTINUIDAD — ARIAS PAM (PROYECTO ACTIVO)
**Fecha de actualización:** 11/10/2026  
**Propósito:** documento de traspaso para continuar el proyecto en un chat nuevo sin confundirlo con el Arias Suite original, actualmente parado.

---

## 0. INSTRUCCIÓN CRÍTICA PARA EL NUEVO CHAT

Estamos trabajando en **Arias PAM**, el proyecto activo. El repositorio que existe actualmente es `EmersonArias/arias-pam`. El objetivo expresado por el usuario es cambiar el nombre del proyecto/repositorio activo de `arias-pam` a `arias-suite`, pero hacerlo **solo después de conservar y verificar por separado el Arias Suite original**, que está parado.

**No confundir:**
- **Proyecto activo:** Arias PAM, hoy alojado en `EmersonArias/arias-pam`.
- **Proyecto antiguo/parado:** Arias Suite original. Debe conservarse como archivo histórico recuperable.
- El proyecto de Vercel visible actualmente se llama `arias-suite`, pero su metadata muestra que está conectado al repositorio `EmersonArias/arias-pam` y a la rama `feature/arias-suite-common-ui-v1`. Por tanto, el nombre de Vercel no demuestra que sea el Arias Suite antiguo ni que exista un segundo repositorio.
- En el inventario GitHub consultado solo aparecieron los repositorios `EmersonArias/arias-pam` (público) y `EmersonArias/arias-home` (privado). **No apareció un repositorio separado llamado `arias-suite`.** La existencia y ubicación de una copia independiente del Arias Suite original aún debe confirmarse.

No hacer cambios destructivos, no borrar ni archivar el repositorio activo y no sobrescribir la documentación histórica antigua. No cambiar producción ni dominios de Vercel hasta comprobar qué proyecto despliega qué código y a qué Supabase apunta.

## 1. OBJETIVO INMEDIATO: SEPARAR Y RENOMBRAR CON SEGURIDAD

Orden recomendado:
1. Identificar con precisión el Arias Suite antiguo y su código, historial, documentación, ramas, configuración y recursos asociados.
2. Crear una copia independiente y verificable del proyecto antiguo, conservando todas sus ramas e historial Git. Si solo existe el Maestro/documentación antigua dentro de `arias-pam`, eso **no equivale** a una copia completa del proyecto antiguo.
3. Verificar la copia y guardar enlaces, HEAD, ramas, fecha y ubicación en este documento.
4. Confirmar que el proyecto activo sigue siendo `EmersonArias/arias-pam` y registrar rama y HEAD exactos.
5. Renombrar el repositorio activo a `arias-suite` solo después de resolver el conflicto de nombre y comprobar las consecuencias para Vercel, GitHub Actions, enlaces, variables y documentación.
6. Actualizar el proyecto Vercel para que apunte al repositorio/branch correctos. No crear un nuevo proyecto ni cambiar producción sin verificar la configuración y la autorización.
7. Validar build, preview, variables de entorno y conexión Supabase antes de declarar el cambio terminado.

**Importante:** GitHub redirige URLs antiguas después de un renombrado en muchos casos, pero integraciones, clones, secretos, workflows, URLs hardcodeadas y configuración externa deben revisarse. El nombre visible en Vercel y el nombre del repositorio son recursos diferentes.

## 2. ESTADO VERIFICADO DE GITHUB

Repositorio activo existente:
- URL: https://github.com/EmersonArias/arias-pam
- Nombre actual: `arias-pam`
- ID GitHub: `1382563934`
- Visibilidad: público
- Rama por defecto: `main`
- Ramas visibles en la consulta:
  - `main` — HEAD `6a7fd586d480836763ea78e28ef39126780268f9`
  - `feature/arias-suite-common-ui-v1` — HEAD `28f8eb4682bcae527899494812b122bdbb8f9862`
- Último commit observado en `main`: `Sincronizar estado local de Arias Suite` (2026-09-26T20:47:12Z).
- El HEAD de la rama de trabajo debe volver a consultarse antes de cualquier escritura; los valores de este documento son una fotografía del 11/10/2026 y pueden quedar obsoletos.
- En la rama `feature/arias-suite-common-ui-v1` existe el documento histórico `docs/MAESTRO_CONTINUIDAD_ARIAS_SUITE.md`. **No sobrescribirlo ni eliminarlo**: conservarlo como documentación de la etapa/proyecto anterior hasta que se confirme la estrategia de archivo.
- Este documento nuevo se crea con otro nombre para no destruir ni confundir el maestro histórico.

Repositorio adicional visible:
- `EmersonArias/arias-home` — privado, ID `1318507790`, rama por defecto `main`. Arias Home debe tratarse como proyecto separado; no mezclarlo con PAM ni con el archivo antiguo.

## 3. ESTADO VERIFICADO DE VERCEL

El conector mostró un único proyecto en el ámbito predeterminado:
- Proyecto: `arias-suite`
- Project ID: `prj_nBFkOpHpajvYL9srjO5Mds2qjWNf`
- Team/account ID: `team_rcSR4IhA8hPNeQkEUU2ZulC1`
- Team slug visible: `arias9`
- Framework: Vite
- Node: 24.x
- `live: false`
- Dominios mostrados:
  - `arias-suite-arias9.vercel.app`
  - `arias-suite-git-feature-arias-suite-common-ui-v1-arias9.vercel.app`

Despliegues recientes visibles del proyecto:
- El despliegue más reciente observado tiene estado `ERROR`, branch `feature/arias-suite-common-ui-v1`, repo `EmersonArias/arias-pam`, commit `28f8eb4682bcae527899494812b122bdbb8f9862`, mensaje `docs: record migration 068 applied and test status`.
- Otro despliegue anterior también quedó en `ERROR` con commit `8c6ec909f2e73be9d18f909671e41b8601b3f82b`.
- Se observan despliegues anteriores `READY`, por ejemplo el commit `e1f908408a1e13cb7cbb4672554c8acdf5c95589`. No asumir que ese despliegue antiguo sirve para validar el código actual.
- Los errores recientes no deben atribuirse a una causa concreta sin consultar los logs.

Bloqueo de acceso:
- Las consultas de Vercel al scope `arias9` devuelven 403: no autorizado para ese ámbito; requiere reautorizar/conectar el equipo correcto o un token con permisos apropiados.
- No se pudieron consultar los logs completos ni modificar configuración de Vercel con la autorización actual.
- No reintentar sin cambios la misma llamada. El usuario debe autorizar el scope correcto de Vercel si se necesita actuar allí.
- No crear despliegues, modificar dominios, cambiar variables de entorno o desplegar a producción hasta resolver acceso y mapeo.

## 4. ESTADO VERIFICADO DE SUPABASE Y MIGRACIONES

Proyecto Supabase conocido:
- Ref: `eqxcuwrfestwqelnucmv`
- Nombre visible: `arias-pam`
- Región: `eu-west-1`
- Estado reportado: saludable/activo.

**Regla innegociable:** jamás volver a ejecutar una migración que ya se haya aplicado ni editar el contenido de migraciones ejecutadas. Cualquier cambio de esquema posterior debe ser una nueva migración aditiva y revisada.

Estado histórico de migraciones:
- Las notas previas reflejan migraciones 046–067 como ejecutadas/confirmadas en etapas anteriores.
- **Migración 068 `068_operational_location_snapshots_and_copy.sql` fue aplicada el 11/10/2026** en el proyecto Supabase `eqxcuwrfestwqelnucmv`. El registro devolvió versión `20261011203329`, nombre `068_operational_location_snapshots_and_copy`.
- No volver a ejecutar 068 ni ninguna migración previa.
- La lista de migraciones debe verificarse contra el registro vivo de Supabase antes de planificar una nueva; el registro devuelto por una consulta previa mostró 068, pero no se debe inferir de ello que las anteriores no existan.
- Se observó una tabla de inventario con 309 equipos/aparatos y 203 órdenes de trabajo en el momento posterior a la migración.
- Tras aplicar 068, se observó 1 hotel, 309 equipos, 203 OTs, 0 ubicaciones en `hotel_locations` y 0 OTs con las nuevas referencias/instantáneas. No se crearon ubicaciones de prueba ni se modificaron OTs históricas.
- No rellenar retroactivamente la ubicación histórica de OTs antiguas a partir de la ubicación actual del equipo.

### 4.1 Qué añade la migración 068
En `maintenance_work_orders`:
- `reported_location_id`
- `reported_location_snapshot`
- `execution_location_id`
- `execution_location_snapshot`

También:
- Vista `maintenance_work_orders_resolved` actualizada.
- Trigger `trg_snapshot_maintenance_work_order_locations` habilitado.
- Funciones relacionadas con instantáneas, ruta de ubicación, copia de subárbol de ubicaciones y creación de OT operativa con ubicación explícita.
- La función de copia de subárbol y la RPC de creación de OT operativa se concedieron a `authenticated`, no a `anon`; la función interna de instantáneas no se expone para llamada directa, según la comprobación anterior.

### 4.2 Seguridad/RLS
Se observaron políticas RLS en `hotel_locations`:
- SELECT: `has_hotel_access`
- INSERT: permiso `maintenance.create`
- UPDATE: permiso `maintenance.update`

En `maintenance_work_orders` se observaron políticas para ver, crear y actualizar según permisos de mantenimiento. Antes de declarar funcionalidad segura, probar con sesiones reales y comprobar aislamiento entre hoteles. También se observaron advertencias de seguridad preexistentes en funciones `SECURITY DEFINER` y vistas; no se modificaron durante esta tarea.

## 5. ESTADO FUNCIONAL DEL PROYECTO ACTIVO

La rama histórica `feature/arias-suite-common-ui-v1` contiene trabajo de la aplicación de mantenimiento y es la rama de trabajo registrada en las notas. Sin embargo, la denominación de la rama y del Maestro histórico todavía dice Arias Suite; no cambiar nombres internos a ciegas. Confirmar con el usuario/metadata qué rama debe ser la rama activa tras separar el archivo.

### Arquitectura funcional
- Plataforma modular de mantenimiento técnico para hoteles, no un ERP genérico.
- Jerarquía conceptual: Empresa → Hotel → Ubicaciones → Sistemas → Activos → Plan anual.
- Flujo PAM: PAM → Planificación → trabajos programados/ejecución → OT → histórico.
- PAM define qué mantenimiento corresponde; planificación cuándo; OT registra la ejecución/gestión; histórico conserva lo ocurrido.
- No duplicar fuentes de datos ni crear planificación manual paralela.
- Modelo multiempresa, multihotel y multiusuario, con permisos, trazabilidad y separación por hotel.
- Stack conocido: React, TypeScript, Vite, Tailwind/shadcn, Supabase/PostgreSQL y RLS. Verificar package/config reales antes de cambiar dependencias.

### Términos y UX acordados en el Maestro histórico
- En las notas históricas se usan Tickets como nombre visible para trabajos operativos; no confundir el término visible con la entidad interna OT.
- “Intervenciones” para trabajos relevantes/especiales.
- “En gestión” y “En curso” son estados distintos.
- “Planificador Horario” sustituye a “Control Horario”.
- “Notas” sustituye a “Parte de Relevo”.
- Interfaz minimalista, navegación superior y botones comunes coherentes; evitar introducir grandes menús laterales sin aprobación.
- Botones comunes mencionados: `ActionButton`, `IconButton`, `BackButton`, `HomeButton` y `NavigationButtons`. Verificar que siguen existiendo antes de usarlos.
- Eliminar en la interfaz significa desactivar lógicamente cuando aplique, no borrar físicamente, salvo decisión explícita y revisión del modelo.

### Ubicaciones y contexto histórico de OTs
En el código histórico descrito:
- Existe la pantalla `/maintenance/structure` para catálogo de ubicaciones.
- La copia de subárbol está pensada para copiar solo nodos lógicos del catálogo, con nuevos UUID y códigos vacíos, no activos, fotos, documentos, PAM, OTs ni históricos.
- Se preparó selector de ubicación estructurada en ficha de equipo conservando los campos heredados `plant` y `location` como referencia antigua.
- Las OTs pueden tener ubicación comunicada al abrir y ubicación real de ejecución; la ubicación debe conservarse como instantánea para que un cambio posterior de nombre/ubicación no reescriba la historia.
- Para OTs anteriores sin instantánea, la interfaz debe mostrar “Sin instantánea histórica”; no inferir una ubicación histórica desde el equipo actual.
- La vista de OTs debe resolver equipo tanto desde la OT directa como desde el plan PAM, según el flujo.
- Cobertura de selectores en `assets`, `electrical_panels`, `maintenance_pending_items` y `maintenance_blocked_rooms`, así como copia entre hoteles, se dejó como pendiente en el Maestro antiguo.
- **No se han declarado superadas las pruebas funcionales integrales** de ubicación, copia, permisos, OT y aislamiento por hotel.

### Datos y alcance
- El estado observado inmediatamente después de 068 no tenía ubicaciones creadas: 0 filas en `hotel_locations`.
- No crear plantas, habitaciones o ubicaciones reales por inferencia. No cargar datos ficticios en producción.
- Para pruebas, utilizar datos temporales identificables con prefijo `ZZ_TEST_`, solo después de confirmar entorno/preview y autorización; desactivar las pruebas al acabar, sin borrado físico.
- No alterar OTs reales para hacer pruebas.

## 6. PLAN DE PRUEBAS PENDIENTE

Solo ejecutar cuando haya un preview funcional confirmado y se verifique que usa el proyecto Supabase correcto:

1. Confirmar que Preview contiene el commit actual y que apunta a `eqxcuwrfestwqelnucmv` (o a otro proyecto explícitamente autorizado).
2. Probar alta, edición, búsqueda, relación padre/hija, desactivación y reactivación de ubicaciones.
3. Probar copia de subárbol y verificar nuevos IDs/códigos vacíos; comprobar que no copia equipos, activos, PAM, OTs, fotos, documentos ni históricos.
4. Asignar ubicación a un equipo de prueba, guardar y reabrir.
5. Crear OT operativa sin equipo con ubicación comunicada.
6. Crear OT con equipo asociado y comprobar la ubicación inicial capturada.
7. Elegir una ubicación real de ejecución distinta, guardar y cerrar la OT; comprobar ambas instantáneas en el histórico.
8. Renombrar una ubicación temporal y comprobar que la instantánea ya guardada no cambia.
9. Probar permisos reales y aislamiento entre dos hoteles.
10. Desactivar nodos temporales en orden hoja → raíz. No borrar físicamente.
11. Documentar resultado real de cada prueba; no decir “OK” solo porque el código exista.

## 7. BLOQUEOS ACTUALES

1. No hay evidencia de que exista un repositorio separado llamado `arias-suite` para el Arias Suite antiguo.
2. El repositorio activo `arias-pam` contiene el Maestro histórico `MAESTRO_CONTINUIDAD_ARIAS_SUITE.md`; ese archivo es evidencia/documentación antigua, no una copia independiente del código.
3. El proyecto Vercel visible `arias-suite` está enlazado a `EmersonArias/arias-pam` y a `feature/arias-suite-common-ui-v1`; no se debe asumir que sea el proyecto antiguo.
4. Los despliegues recientes visibles del proyecto Vercel figuran en estado ERROR. Logs completos no disponibles por 403.
5. Vercel requiere permisos correctos para el scope `arias9`.
6. No se ha confirmado una copia independiente y verificada del Arias Suite antiguo.
7. No se han completado pruebas funcionales de ubicación/OT ni aislamiento de hotel.
8. No se debe ejecutar una nueva migración ni cambiar producción hasta resolver los bloqueos aplicables.

## 8. REGLAS PERMANENTES DE TRABAJO

- **NO ASSUME:** no inventar tablas, columnas, funciones RPC, rutas, permisos, estructura de archivos, estado de despliegue ni resultados de pruebas.
- Leer el estado real de GitHub/Supabase antes de modificar.
- Trabajar directamente en GitHub cuando el conector lo permita; el usuario prefiere no depender de copiar archivos a Visual Studio.
- Antes de editar, comprobar rama, HEAD, contenido actual y objetivo de la modificación.
- No editar migraciones ya ejecutadas; crear migración nueva y aditiva si hace falta.
- No duplicar datos ni crear fuentes paralelas.
- No generar datos reales ficticios ni rellenar históricos por inferencia.
- No tocar Arias Home.
- No sobrescribir el Maestro histórico de Arias Suite; crear y mantener un maestro separado para el proyecto activo.
- No renombrar/archivar/borrar hasta confirmar la copia independiente.
- No cambiar producción, dominios ni variables de entorno sin confirmar qué proyecto y base de datos se usan.
- Distinguir siempre: implementado en código, migración aplicada, build comprobado, preview desplegado y prueba funcional realizada. Son estados diferentes.

## 9. ENLACES DE TRABAJO

- Repositorio actual: https://github.com/EmersonArias/arias-pam
- Rama de trabajo histórica: https://github.com/EmersonArias/arias-pam/tree/feature/arias-suite-common-ui-v1
- Maestro histórico que debe conservarse: https://github.com/EmersonArias/arias-pam/blob/feature/arias-suite-common-ui-v1/docs/MAESTRO_CONTINUIDAD_ARIAS_SUITE.md
- Configuración del repositorio actual: https://github.com/EmersonArias/arias-pam/settings
- Guía oficial de GitHub para duplicar repositorios conservando historial: https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository
- Proyecto Vercel (requiere permiso del scope correcto): https://vercel.com/arias9/arias-suite
- Preview histórico anterior (no asumir que corresponde al código actual): https://arias-pam-git-feature-arias-suite-common-ui-v1-arias9.vercel.app

## 10. TEXTO PARA PEGAR AL INICIAR UN CHAT NUEVO

> **CONTINUIDAD ARIAS PAM — PROYECTO ACTIVO**
>
> El proyecto activo es Arias PAM, alojado actualmente en `EmersonArias/arias-pam`. Queremos cambiar el nombre del repositorio/proyecto activo a `arias-suite`, pero primero hay que identificar y conservar de forma independiente el Arias Suite original, actualmente parado. No hay confirmación de que exista un repositorio separado para ese proyecto antiguo; no confundir el proyecto Vercel llamado `arias-suite` con una copia del proyecto antiguo, porque los metadatos observados lo conectan a `EmersonArias/arias-pam`.
>
> Lee este documento completo y vuelve a consultar el estado real de GitHub, la rama, HEAD, Supabase y Vercel antes de cualquier cambio. No sobrescribas `docs/MAESTRO_CONTINUIDAD_ARIAS_SUITE.md`, no borres/archives nada y no cambies producción. Primero define y verifica la copia independiente del proyecto antiguo; después planifica el renombrado del repositorio activo y la actualización de Vercel.
>
> Supabase conocido: `eqxcuwrfestwqelnucmv`. La migración 068 `068_operational_location_snapshots_and_copy.sql` está aplicada; no repetirla ni ninguna migración anterior. En la última comprobación posterior a 068 había 309 equipos, 203 OTs, 0 ubicaciones y 0 OTs con nuevas instantáneas. Las pruebas funcionales de ubicación/OT y aislamiento de hotel siguen pendientes.
>
> El proyecto Vercel visible `arias-suite` apunta al repo `EmersonArias/arias-pam`, rama `feature/arias-suite-common-ui-v1`; despliegues recientes en ERROR. Los logs/configuración están bloqueados por un 403 de permisos del scope `arias9`. No inventes causa ni resultado. No hagas cambios destructivos. Sigue la regla NO ASSUME.


---

## 11. ACTUALIZACIÓN DE CONTINUIDAD — 2026-10-12

Esta sección prevalece sobre las referencias históricas anteriores cuando entren en conflicto con el estado comprobado en esta fecha.

### Identidad y nombre definitivo

- El nombre definitivo del producto es **Arias Suite**. El repositorio principal se ha renombrado a `EmersonArias/arias-suite`.
- Rama de trabajo: `feature/arias-suite-common-ui-v1`.
- Commit registrado para la corrección de sintaxis de `MaintenanceWorkOrdersPage.tsx`: `60ca1a0a488321b5be40dc394db6fde89792922f`.
- Copia privada independiente del repositorio Git: `EmersonArias/arias-pam-backup-2026-10-12`.
- Se comprobó la integridad de la copia local con `git fsck --full`, sin errores de objetos. `git ls-remote backup` confirmó las cuatro ramas principales y los SHA correspondientes en el repositorio privado. GitHub rechazó solo las referencias internas `refs/pull/1/head` y `refs/pull/1/merge`, que no son ramas publicables por push normal.
- Las carpetas locales `C:\\proyectos\\arias-suite` y `C:\\proyectos\\arias-pam` apuntan al mismo remoto y estaban desactualizadas respecto a la rama remota. La carpeta `C:\\proyectos\\arias-suite-viejo` mostró numerosas modificaciones/archivos sin seguimiento; el usuario indicó que se deje fuera del trabajo. No afirmar que su contenido está respaldado ni borrarlo como parte de este procedimiento.
- El proyecto de Vercel `arias-suite` muestra en Settings → Git la conexión `EmersonArias/arias-suite`. No desconectar ni recrear el proyecto.
- Supabase `eqxcuwrfestwqelnucmv` (`arias-pam`) aparece ACTIVE_HEALTHY; Supabase `hqxmycldqltovfkazoub` (`arias-suite`) aparece INACTIVE. No cambiar, restaurar ni migrar ninguna base de datos como efecto colateral del renombrado.
- El respaldo incluye `.env` en el historial Git. La comprobación de nombres de variables mostró `VITE_SUPABASE_ANON_KEY` y `VITE_SUPABASE_URL`, sin imprimir valores. No publicar valores de secretos ni interpretar una lista de nombres como una auditoría de seguridad completa.
- Último error de build aportado por el usuario: `src/features/maintenance/pages/MaintenanceWorkOrdersPage.tsx(204,3): error TS1005: ',' expected`. Se corrigió directamente en GitHub el destructuring `ticketScheduledDate` y se guardó en el commit anterior. Build/despliegue posterior aún debe verificarse; no declarar el build resuelto hasta tener estado Ready y logs/validación correspondientes.
- El conector de Vercel devolvió 403 para el scope `arias9`; el estado actual del despliegue no puede darse por verificado mediante ese conector.

### Nueva norma permanente: reparación directa de errores encontrados

- Cuando se localice un error concreto y reproducible en el código (por ejemplo, error de TypeScript, sintaxis, compilación o una regresión con causa identificada), **corregirlo directamente en GitHub**, sin pedir al usuario que edite manualmente.
- Antes de editar: leer el contenido real, confirmar repositorio, rama y SHA/HEAD, identificar la causa y limitar el cambio a la reparación necesaria.
- Después de editar: verificar de nuevo el archivo, registrar el commit, revisar build/deploy y comprobar el resultado. No declarar resuelto un error hasta confirmar el estado pertinente.
- Si aparecen errores adicionales, investigar y reparar cada uno directamente, siguiendo el mismo ciclo.
- La reparación directa no autoriza cambios amplios o especulativos. Si la causa no está suficientemente identificada, primero recopilar pruebas.
- Esta norma no anula los límites ya congelados: **no modificar migraciones ya ejecutadas**, no ejecutar SQL ni cambiar producción, RLS, claves, variables de entorno, dominios, permisos o recursos de Supabase/Vercel sin comprobación específica y autorización adecuada.
- No tocar Arias Home. No borrar datos, registros ni ramas como forma de “arreglar” errores.
- Mantener los principios NO ASSUME y trazabilidad: código cambiado, commit creado, build, deployment y prueba funcional son evidencias separadas.

### Enlaces actuales

- Repositorio principal: https://github.com/EmersonArias/arias-suite
- Rama de trabajo: https://github.com/EmersonArias/arias-suite/tree/feature/arias-suite-common-ui-v1
- Copia privada: https://github.com/EmersonArias/arias-pam-backup-2026-10-12
- Vercel: https://vercel.com/arias9/arias-suite
- Supabase activo conocido: `eqxcuwrfestwqelnucmv`
