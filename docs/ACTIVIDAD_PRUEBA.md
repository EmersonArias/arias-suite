# Actividad de PRUEBA

Se registran únicamente señales de la cuenta PRUEBA: apertura de aplicación/módulos, recarga de documento, vuelta a primer plano, solicitud de PDF e intentos de cambio bloqueados capturados en la interfaz. No hay sondeo periódico desde el navegador, seguimiento del ratón ni captura de formularios, consultas, contraseñas o tokens. Una señal de navegador no identifica a una persona ni garantiza intervención humana; una recarga también puede ser automática. La renovación del token no genera eventos.

Las versiones ya abiertas requieren recargar para incorporar la captura. No se recupera actividad anterior. La telemetría es de mejor esfuerzo: si falla red o servicio no bloquea la consulta, los PDF ni el aviso de solo lectura. No se presenta como un registro completo de todas las acciones.

La excepción del cliente solo permite llamar a `record-demo-activity`. El servicio verifica el JWT con Auth, la identidad exacta de PRUEBA, el perfil activo y el acceso vigente. Rechaza campos extra, rutas con consultas, cuerpos mayores de 2 KB y tipos no autorizados. Límite de 120 eventos/minuto por cuenta e idempotencia mediante ID de evento. La hora, IP comunicada por la pasarela y user agent se incorporan en el servidor. La API no permite escribir en tablas operativas.

`demo_activity_events` es una tabla nueva e independiente: INSERT solo para service_role; lectura solo para administradores de plataforma activos; ningún permiso de escritura para usuarios autenticados. No cambian permisos, cuentas, historial ni tablas de negocio. Antes de aplicar se comprobó su ausencia y se probó la migración en PostgreSQL aislado con datos sintéticos. El commit anterior 15400d1a10922a993475d125be9e27cabff7b2b5 conserva la interfaz anterior; para revertir se desactiva la captura sin borrar eventos.

La actividad se consulta en Registro de accesos, bajo los inicios de sesión, con las mismas fechas y filtrando Todos o PRUEBA. Los avisos utilizan la tarea horaria existente, agrupando actividad nueva y evitando duplicar señales ya notificadas. No notifican por renovaciones automáticas ni por una sesión simplemente conservada.
