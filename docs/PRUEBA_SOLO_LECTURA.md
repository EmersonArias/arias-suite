# Usuario PRUEBA: solo lectura

El 16/11/2026 se cambió únicamente la asignación activa de PRUEBA en SB Diagonal Zero desde CLIENT_ADMIN a VIEWER. El rol compartido VIEWER no se modifica. La consulta posterior verifica cero permisos de escritura y maintenance.view permitido. Los demás módulos conservan sus límites de contrato; usuarios, roles y la administración de personal no reciben permisos adicionales.

La cuenta se identifica en la interfaz por su UUID estable, sin depender del nombre editable. Se bloquean antes del transporte las mutaciones de tablas, funciones, almacenamiento y actualización de perfil. Solo se permiten RPC de consulta enumeradas; las RPC no reconocidas se bloquean incluso por GET. La selección de hotel de PRUEBA se mantiene en memoria, evitando escribir preferencias en la base de datos. Se mantiene el establecimiento, renovación y cierre de sesión.

La interfaz presenta el aviso «Usuario de prueba: acceso de solo lectura. Consulte con el administrador.» al pulsar acciones de escritura o al rechazar peticiones. Los libros locales rechazan el guardado también en su modelo. Los PDF de una ficha pueden previsualizarse sin guardar, con datos en memoria. La interfaz no sustituye la autorización del servidor: el rol VIEWER sigue siendo la protección de los registros operativos. No se cambian políticas ni esquema en esta entrega.

Verificación: pruebas simuladas del transporte (sin red), guardados de los 16 libros denegados, PDF de los 16 libros generado en memoria y comprobación de permisos efectivos del usuario con una transacción de solo lectura. Compilación, navegación y regresiones existentes.
