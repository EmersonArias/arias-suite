-- Arias Suite - migración 079: retirar grants anónimos heredados de objetos existentes.
-- La migración 072 solo restringe privilegios por defecto para objetos futuros.
-- En producción todavía se detectan grants de tabla, columna y secuencia para anon.
-- No revoca permisos de authenticated ni service_role y no cambia políticas RLS.
-- Aplicar únicamente tras revisar la compatibilidad funcional en un entorno de pruebas.

BEGIN;

-- Tablas, vistas, vistas materializadas y tablas foráneas existentes del esquema public.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;

-- Los grants a nivel de columna pueden mantenerse separados de los grants a nivel
-- de tabla; revocarlos expresamente evita que sobreviva un permiso column-level.
DO $$
DECLARE
  column_grant record;
BEGIN
  FOR column_grant IN
    SELECT table_schema, table_name, column_name, privilege_type
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND grantee = 'anon'
  LOOP
    EXECUTE format(
      'REVOKE %s (%I) ON TABLE %I.%I FROM anon',
      column_grant.privilege_type,
      column_grant.column_name,
      column_grant.table_schema,
      column_grant.table_name
    );
  END LOOP;
END;
$$;

-- Las secuencias son independientes de los grants de tabla.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Fallar y hacer rollback si queda cualquier grant directo de anon en los objetos
-- que cubre esta migración. Los permisos de authenticated/service_role no se tocan.
DO $$
DECLARE
  remaining_table_grants integer;
  remaining_column_grants integer;
  remaining_sequence_grants integer;
BEGIN
  SELECT count(*)
    INTO remaining_table_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee = 'anon';

  SELECT count(*)
    INTO remaining_column_grants
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND grantee = 'anon';

  SELECT count(*)
    INTO remaining_sequence_grants
  FROM information_schema.role_usage_grants
  WHERE object_schema = 'public'
    AND object_type = 'SEQUENCE'
    AND grantee = 'anon';

  IF remaining_table_grants > 0
     OR remaining_column_grants > 0
     OR remaining_sequence_grants > 0 THEN
    RAISE EXCEPTION
      'Persisten grants para anon en public: tablas/vistas=%, columnas=%, secuencias=%',
      remaining_table_grants,
      remaining_column_grants,
      remaining_sequence_grants;
  END IF;
END;
$$;

COMMIT;
