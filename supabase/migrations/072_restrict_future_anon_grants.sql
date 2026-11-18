-- Arias Suite - migración 072: evitar grants anónimos por defecto en objetos nuevos.
-- La migración 069 ya restringió EXECUTE para nuevas funciones creadas por postgres,
-- pero los ACL por defecto de tablas y secuencias seguían dando acceso a anon.
-- Esto solo afecta objetos futuros creados por el rol postgres en public; no cambia
-- los permisos de objetos existentes ni los grants autenticados/service_role.
BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon;

-- Mantener explícito el endurecimiento de funciones para que futuros cambios
-- no vuelvan a conceder EXECUTE a anon ni a PUBLIC accidentalmente.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

COMMIT;
