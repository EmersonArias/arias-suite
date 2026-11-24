# Entornos de trabajo de Arias Suite

## Rama de trabajo

- Trabajar por defecto en `staging` o en ramas creadas desde ella.
- La rama que alimenta actualmente produccion es `feature/arias-suite-common-ui-v1`. No confundir su nombre con un entorno de pruebas.
- No publicar cambios en esa rama, fusionar hacia ella, promover despliegues ni cambiar dominios de produccion hasta que los cambios esten revisados y probados y el usuario indique que se publiquen.
- `main` y las otras ramas historicas no son la base actual de desarrollo. No sustituirlas, borrarlas ni fusionarlas en bloque para preparar pruebas.

## Base de datos y servicios

- Una rama Git y una vista previa de Vercel no aislan por si solas Supabase.
- A fecha 2026-11-15, las variables de Supabase de Vercel se comparten entre Production, Preview y Development; no hay aislamiento de datos de staging verificado.
- Mientras no exista un Supabase de pruebas separado y comprobado, limitar las verificaciones a compilacion, pruebas locales con datos simulados y consultas de solo lectura. No ejecutar guardados, cambios de estado, RPC con efectos, migraciones, envios reales de correo ni despliegues de Edge Functions como pruebas contra el proyecto activo.
- Las migraciones 046-063 permanecen congeladas. Conservar los datos y el historial existentes.
- Antes de un cambio de esquema en produccion, revisar el impacto, probarlo en un entorno separado y verificar una copia recuperable.

## Costes

- Priorizar opciones gratuitas. No contratar planes, habilitar facturacion ni crear recursos de pago sin autorizacion expresa.
