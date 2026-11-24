# Entorno local de pruebas

Estado a 2026-11-15: preparacion inicial; NO operativo todavia.

El codigo de trabajo esta en `staging`. Produccion sigue en
`feature/arias-suite-common-ui-v1`. La vista previa de Vercel aun comparte la
configuracion del Supabase alojado; no debe utilizarse para ensayar guardados.

## Pendientes para arrancar

1. Disponer en el ordenador de Node.js y un motor de contenedores compatible con Docker en ejecucion.
2. Preparar en `supabase/local-test/` una instancia local independiente, con sus propios puertos, claves, Auth, Storage y funciones. No vincularla al proyecto remoto.
3. Obtener y revisar una exportacion SOLO DEL ESQUEMA actual, sin filas reales, sesiones, claves ni secretos. El repositorio empieza con migraciones que modifican tablas preexistentes (por ejemplo, `001_import_cuadros_bt_excel.sql` modifica `public.electrical_panels`); no reconstruye la base completa desde cero.
4. Guardar la base estructural revisada en `supabase/local-test/baseline.sql` y comprobar su restauracion contra una instancia local vacia. No ejecutar en bloque las importaciones historicas ni modificar las migraciones congeladas 046-063.
5. Crear datos ficticios y usuarios de prueba locales con sus roles y permisos. Configurar el almacenamiento y los enlaces de acceso para localhost. Mantener desactivados el envio real de correo y las automatizaciones externas.
6. Copiar `.env.local.example` a `.env.local` y usar exclusivamente la URL y clave publica de la instancia local. No copiar la clave `service_role` al navegador.
7. Ejecutar `npm run local:check`. Cuando se cumplan los requisitos, `npm run dev:local` inicia Vite solo en 127.0.0.1.
8. Validar inicio de sesion, lectura, guardado y borrado de un registro ficticio, asi como permisos. La existencia de Docker y un fichero de esquema no demuestra que la base funcione: hace falta esta prueba funcional antes de declarar el entorno operativo.

## Protecciones y alcance

- La comprobacion local no crea proyectos, no ejecuta SQL, no descarga datos del hotel y no modifica Vercel ni Supabase.
- El arranque `dev:local` se bloquea si no estamos en staging, falta Docker, la URL es remota, falta la clave publica local o falta el esquema inicial.
- Estos comandos son para un ordenador local; Vercel no puede conectarse al localhost de ese ordenador.
- No se ha contratado ningun recurso ni plan de pago.
