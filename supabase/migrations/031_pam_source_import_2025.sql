-- Arias Suite — migración 031
-- Importación fiel de la matriz PAM de origen 2025.
--
-- Fuente:
--   R-SSTT-01-01 PLAN ANUAL DE MTO ZERO(20260927-212438).xlsx
--   Hoja: PAM
--
-- Esta migración:
--   1. Conserva cada línea/grupo del PAM original, incluso los que no tienen marcas.
--   2. Conserva las marcas por equipo, mes y posición semanal.
--   3. Mantiene source_row/source_column para trazabilidad directa al Excel.
--   4. Relaciona source_apparatus_id con apparatus_registry.source_id cuando existe.
--   5. Completa el catálogo con las marcas confirmadas de la leyenda del documento.
--   6. Expone una vista de candidatos de planificación, sin crear todavía
--      maintenance_plans ni fechas exactas.
--
-- La posición semanal de origen es 1..4. La tabla 029 admite 1..5 para la
-- representación futura de meses con cinco semanas.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

INSERT INTO public.pam_action_codes (
  code,
  name,
  candidate_names,
  definition_status,
  is_action,
  active
)
VALUES
  ('CP', 'CONTROL DE PRESIONES', '["CONTROL DE PRESIONES"]'::jsonb, 'CONFIRMED', true, true),
  ('DE', 'DOSIFICAR ENCIMAS', '["DOSIFICAR ENCIMAS"]'::jsonb, 'CONFIRMED', true, true),
  ('E', 'ENGRASE', '["ENGRASE"]'::jsonb, 'CONFIRMED', true, true),
  ('EXT', 'MANTENIMIENTO EXTERNO', '["MANTENIMIENTO EXTERNO"]'::jsonb, 'CONFIRMED', true, true),
  ('F', 'FICHA DE REVISION', '["FICHA DE REVISION"]'::jsonb, 'CONFIRMED', true, true),
  ('L', 'LIMPIEZA', '["LIMPIEZA"]'::jsonb, 'CONFIRMED', true, true),
  ('LF', 'LIMPIEZA de FILTROS', '["LIMPIEZA de FILTROS"]'::jsonb, 'CONFIRMED', true, true),
  ('RG', 'REVISION GENERAL', '["REVISION GENERAL"]'::jsonb, 'CONFIRMED', true, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  candidate_names = EXCLUDED.candidate_names,
  definition_status = EXCLUDED.definition_status,
  is_action = EXCLUDED.is_action,
  active = EXCLUDED.active,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.pam_source_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  source_version text NOT NULL,
  source_sheet text NOT NULL,
  source_row integer NOT NULL,
  source_apparatus_expression text NOT NULL,
  maintenance_name text NOT NULL,
  plan_year integer NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pam_source_groups_unique
    UNIQUE (hotel_id, source_version, source_sheet, source_row)
);

CREATE INDEX IF NOT EXISTS ix_pam_source_groups_hotel_year
  ON public.pam_source_groups (hotel_id, plan_year, source_row);

ALTER TABLE public.pam_source_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pam_source_groups_select ON public.pam_source_groups;

CREATE POLICY pam_source_groups_select
  ON public.pam_source_groups
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

DO $$
DECLARE
  v_hotel_id uuid;
  v_group_row jsonb;
  v_group_rows constant jsonb := $json$
[
  {"source_row":6,"source_apparatus_expression":"8-93-(168-180)-218-224-266-298-299-332","maintenance_name":"_PREVENTIVO DIARIO/SEMANAL","slot_spec":"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48:F"},
  {"source_row":7,"source_apparatus_expression":"264-334","maintenance_name":"_R-SSTT-01-03 PISCINA EXTERIOR","slot_spec":"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48:F"},
  {"source_row":8,"source_apparatus_expression":"144-145-149-335","maintenance_name":"_R-SSTT-01-03 PISCINA SPA","slot_spec":"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48:F"},
  {"source_row":9,"source_apparatus_expression":"156(168-172)(216-217)(251-256)","maintenance_name":"_R-SSTT-01-04 PLAN DE AUTOCONTROL LEGIONELLA","slot_spec":"1,5,9,13,17,21,25,29,33,37,41,45:F"},
  {"source_row":10,"source_apparatus_expression":"145-(181-185)-214","maintenance_name":"_R-SSTT-01-05 BOMBAS","slot_spec":"1,25:F"},
  {"source_row":11,"source_apparatus_expression":"22,25,34,60-62,75-79,97-107,134,199-203,269,276-277","maintenance_name":"_R-SSTT-01-06 CLIMATIZADORES/EXTRACTORES","slot_spec":"1,25:F"},
  {"source_row":12,"source_apparatus_expression":"7","maintenance_name":"_R-SSTT-01-07 FANCOILS","slot_spec":"1:F"},
  {"source_row":13,"source_apparatus_expression":"8-16-173-174-192-222-223-316-324-325","maintenance_name":"_R-SSTT-01-08 CUADROS ELECTRICOS BT","slot_spec":"1:F"},
  {"source_row":14,"source_apparatus_expression":"09","maintenance_name":"_R-SSTT-01-09 ELEMENTOS FOTOLUMISCENTES","slot_spec":"1:F"},
  {"source_row":15,"source_apparatus_expression":"11","maintenance_name":"_R-SSTT-01-10 LUCES DE EMERGENCIA","slot_spec":"1,13,25,37:F"},
  {"source_row":16,"source_apparatus_expression":"9","maintenance_name":"_R-SSTT-01-11 PUERTAS CORTAFUEGOS","slot_spec":"1,13,25,37:F"},
  {"source_row":17,"source_apparatus_expression":"12","maintenance_name":"_R-SSTT-01-12 SISTEMAS CI","slot_spec":"1,13,25,37:F"},
  {"source_row":18,"source_apparatus_expression":"29-(35-40)-43-46-56-57-(63-65)-71-274-278-288","maintenance_name":"_R-SSTT-02-02 CALIBRACIONES","slot_spec":"1,13,25,37:F"},
  {"source_row":19,"source_apparatus_expression":"1","maintenance_name":"ANTENAS WIFI","slot_spec":"45:RG"},
  {"source_row":20,"source_apparatus_expression":"2-7","maintenance_name":"ASCENSORES (6)","slot_spec":"2,6,10,14,18,22,26,30,34,38,42,46:EXT"},
  {"source_row":21,"source_apparatus_expression":"15","maintenance_name":"BOTES SIFONICOS, DESAGÜES HOTEL","slot_spec":"1,25:L"},
  {"source_row":22,"source_apparatus_expression":"8-87","maintenance_name":"CÁMARAS CCTV","slot_spec":"17:L"},
  {"source_row":23,"source_apparatus_expression":"40-43-56-35-(36-39)-72-74-249-275-290","maintenance_name":"CÁMARAS DE FRÍO/NEVERAS/CONGELADORES","slot_spec":"1,13,25,37:LF"},
  {"source_row":24,"source_apparatus_expression":"338","maintenance_name":"CAMPANAS DE EXTRACCIÓN/CONDUCTOS","slot_spec":"17:EXT"},
  {"source_row":25,"source_apparatus_expression":"187","maintenance_name":"CENTRALITA DE TELÉFONOS","slot_spec":"1,13,25,37:RG;17:L"},
  {"source_row":26,"source_apparatus_expression":"195-196","maintenance_name":"CENTRO DE TRANSFORMACIÓN","slot_spec":"14:EXT"},
  {"source_row":27,"source_apparatus_expression":"206","maintenance_name":"DESCALCIFICADOR P -SÓTAN -2","slot_spec":"1,5,9,13,17,21,25,29,33,37,41,45:EXT"},
  {"source_row":28,"source_apparatus_expression":"242,270","maintenance_name":"GONDOLAS","slot_spec":"2,6,10,14,18,22,26,30,34,38,42,46:EXT"},
  {"source_row":29,"source_apparatus_expression":"190,192,239,244","maintenance_name":"GRUPO ELECTRÓGENO-DEPÓSITO-CUADRO","slot_spec":"4:EXT;9,13,17,21,25,29,33,37,41,45:RG"},
  {"source_row":30,"source_apparatus_expression":"(175-180)-257-258","maintenance_name":"INTERCAMBIADORES","slot_spec":"17:L"},
  {"source_row":31,"source_apparatus_expression":"125-133","maintenance_name":"MÁQUINAS GYM","slot_spec":"1,25:RG"},
  {"source_row":32,"source_apparatus_expression":"221-271","maintenance_name":"PARARRAYOS","slot_spec":"2:EXT"},
  {"source_row":33,"source_apparatus_expression":"140-297","maintenance_name":"PORTON PARKING","slot_spec":"1,25:E"},
  {"source_row":34,"source_apparatus_expression":"73-83-152","maintenance_name":"PUERTAS AUTOMATICAS","slot_spec":"3,7,11,15,19,23,27,31,35,39,43,47:RG"},
  {"source_row":35,"source_apparatus_expression":"113-120,124,226,229,232,236,246,250","maintenance_name":"RACKS","slot_spec":"1,25:RG;2,26:L"},
  {"source_row":36,"source_apparatus_expression":"194","maintenance_name":"SAI 25 KVA","slot_spec":""},
  {"source_row":37,"source_apparatus_expression":"141","maintenance_name":"SECADORA","slot_spec":"1,13,25,37:L"},
  {"source_row":38,"source_apparatus_expression":"224","maintenance_name":"SEPARADOR DE GRASAS/DOSIFICADOR ENCIMAS","slot_spec":"1:L;2,5,9,13,17,21,25,29,33,37,41,45:DE"},
  {"source_row":39,"source_apparatus_expression":"329","maintenance_name":"VASOS DE EXPANSIÓN","slot_spec":"17:CP"}
]$json$::jsonb;
BEGIN
  SELECT h.id
    INTO v_hotel_id
  FROM public.tenants t
  JOIN public.hotels h
    ON h.tenant_id = t.id
  WHERE t.code = 'SBH'
    AND t.active = true
    AND h.code = 'SB-DZ'
    AND h.active = true
  LIMIT 1;

  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'No existe un hotel activo SB-DZ dentro del tenant SBH.';
  END IF;

  FOR v_group_row IN
    SELECT value
    FROM jsonb_array_elements(v_group_rows)
  LOOP
    INSERT INTO public.pam_source_groups (
      hotel_id,
      source_version,
      source_sheet,
      source_row,
      source_apparatus_expression,
      maintenance_name,
      plan_year
    )
    VALUES (
      v_hotel_id,
      'R-SSTT-01-01_PLAN_ANUAL_2025_v20260927',
      'PAM',
      (v_group_row->>'source_row')::integer,
      v_group_row->>'source_apparatus_expression',
      v_group_row->>'maintenance_name',
      2025
    )
    ON CONFLICT (
      hotel_id,
      source_version,
      source_sheet,
      source_row
    ) DO NOTHING;
  END LOOP;
END;
$$;

-- El documento usa dos convenciones:
--   * grupos cortos como 60-62 representan rangos;
--   * cadenas largas como 264-334 representan dos IDs separados por guion;
--     los rangos largos están explícitamente entre paréntesis.
-- Se conserva esa semántica del documento para no convertir IDs en equipos
-- inexistentes.
CREATE OR REPLACE FUNCTION public.expand_pam_source_ids(source_expression text)
RETURNS TABLE(source_apparatus_id integer)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $fn$
  WITH segments AS (
    SELECT btrim(segment) AS segment
    FROM regexp_split_to_table(COALESCE(source_expression, ''), ',') AS segment
    WHERE btrim(segment) <> ''
  ),
  prepared AS (
    SELECT
      segment,
      regexp_replace(segment, '\(\d+-\d+\)', ' ', 'g') AS plain_segment
    FROM segments
  ),
  parenthesized_ranges AS (
    SELECT
      m[1]::integer AS first_id,
      m[2]::integer AS last_id
    FROM prepared p
    CROSS JOIN LATERAL regexp_matches(
      p.segment,
      '\((\d+)-(\d+)\)',
      'g'
    ) AS m
  ),
  short_plain_ranges AS (
    SELECT
      m[1]::integer AS first_id,
      m[2]::integer AS last_id
    FROM prepared p
    CROSS JOIN LATERAL regexp_matches(
      p.plain_segment,
      '^\s*(\d+)\s*-\s*(\d+)\s*$'
    ) AS m
    WHERE (m[2]::integer - m[1]::integer) BETWEEN 0 AND 10
  ),
  bare_ids AS (
    SELECT
      m[1]::integer AS source_apparatus_id
    FROM prepared p
    CROSS JOIN LATERAL regexp_matches(
      p.plain_segment,
      '(\d+)',
      'g'
    ) AS m
    WHERE NOT EXISTS (
      SELECT 1
      FROM regexp_matches(
        p.plain_segment,
        '^\s*(\d+)\s*-\s*(\d+)\s*$'
      ) AS r
      WHERE (r[2]::integer - r[1]::integer) BETWEEN 0 AND 10
    )
  )
  SELECT generate_series(first_id, last_id)::integer
  FROM parenthesized_ranges
  WHERE first_id <= last_id

  UNION ALL

  SELECT generate_series(first_id, last_id)::integer
  FROM short_plain_ranges
  WHERE first_id <= last_id

  UNION ALL

  SELECT source_apparatus_id
  FROM bare_ids;
$fn$;

REVOKE ALL ON FUNCTION public.expand_pam_source_ids(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expand_pam_source_ids(text) TO authenticated;

DO $$
DECLARE
  v_hotel_id uuid;
BEGIN
  SELECT h.id
    INTO v_hotel_id
  FROM public.tenants t
  JOIN public.hotels h
    ON h.tenant_id = t.id
  WHERE t.code = 'SBH'
    AND t.active = true
    AND h.code = 'SB-DZ'
    AND h.active = true
  LIMIT 1;

  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'No existe un hotel activo SB-DZ dentro del tenant SBH.';
  END IF;

  INSERT INTO public.pam_source_marks (
    hotel_id,
    source_version,
    source_sheet,
    source_row,
    source_column,
    source_apparatus_id,
    apparatus_registry_id,
    plan_year,
    month_number,
    week_slot,
    mark_code
  )
  SELECT
    v_hotel_id,
    'R-SSTT-01-01_PLAN_ANUAL_2025_v20260927',
    'PAM',
    g.source_row,
    3 + s.slot_number,
    ids.source_apparatus_id,
    ar.id,
    2025,
    ((s.slot_number - 1) / 4) + 1,
    ((s.slot_number - 1) % 4) + 1,
    s.mark_code
  FROM (
    VALUES
      (6,'8-93-(168-180)-218-224-266-298-299-332','1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48:F'),
      (7,'264-334','1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48:F'),
      (8,'144-145-149-335','1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48:F'),
      (9,'156(168-172)(216-217)(251-256)','1,5,9,13,17,21,25,29,33,37,41,45:F'),
      (10,'145-(181-185)-214','1,25:F'),
      (11,'22,25,34,60-62,75-79,97-107,134,199-203,269,276-277','1,25:F'),
      (12,'7','1:F'),
      (13,'8-16-173-174-192-222-223-316-324-325','1:F'),
      (14,'09','1:F'),
      (15,'11','1,13,25,37:F'),
      (16,'9','1,13,25,37:F'),
      (17,'12','1,13,25,37:F'),
      (18,'29-(35-40)-43-46-56-57-(63-65)-71-274-278-288','1,13,25,37:F'),
      (19,'1','45:RG'),
      (20,'2-7','2,6,10,14,18,22,26,30,34,38,42,46:EXT'),
      (21,'15','1,25:L'),
      (22,'8-87','17:L'),
      (23,'40-43-56-35-(36-39)-72-74-249-275-290','1,13,25,37:LF'),
      (24,'338','17:EXT'),
      (25,'187','1,13,25,37:RG;17:L'),
      (26,'195-196','14:EXT'),
      (27,'206','1,5,9,13,17,21,25,29,33,37,41,45:EXT'),
      (28,'242,270','2,6,10,14,18,22,26,30,34,38,42,46:EXT'),
      (29,'190,192,239,244','4:EXT;9,13,17,21,25,29,33,37,41,45:RG'),
      (30,'(175-180)-257-258','17:L'),
      (31,'125-133','1,25:RG'),
      (32,'221-271','2:EXT'),
      (33,'140-297','1,25:E'),
      (34,'73-83-152','3,7,11,15,19,23,27,31,35,39,43,47:RG'),
      (35,'113-120,124,226,229,232,236,246,250','1,25:RG;2,26:L'),
      (37,'141','1,13,25,37:L'),
      (38,'224','1:L;2,5,9,13,17,21,25,29,33,37,41,45:DE'),
      (39,'329','17:CP')
  ) AS g(source_row, source_apparatus_expression, slot_spec)
  CROSS JOIN LATERAL public.expand_pam_source_ids(g.source_apparatus_expression) ids
  CROSS JOIN LATERAL (
    SELECT
      regexp_split_to_table(split_part(part, ':', 1), ',')::integer AS slot_number,
      split_part(part, ':', 2) AS mark_code
    FROM regexp_split_to_table(g.slot_spec, ';') AS part
  ) s
  LEFT JOIN public.apparatus_registry ar
    ON ar.source_id = ids.source_apparatus_id
  WHERE g.slot_spec <> ''
  ON CONFLICT (
    hotel_id,
    source_version,
    source_sheet,
    source_row,
    source_apparatus_id,
    plan_year,
    month_number,
    week_slot,
    mark_code
  ) DO NOTHING;
END;
$$;

CREATE OR REPLACE VIEW public.pam_plan_candidates AS
WITH grouped AS (
  SELECT
    psm.hotel_id,
    psm.source_version,
    psm.source_sheet,
    psm.source_row,
    psm.source_apparatus_id,
    psm.apparatus_registry_id,
    psm.plan_year,
    psm.mark_code,
    COUNT(*)::integer AS mark_count,
    COUNT(DISTINCT psm.month_number)::integer AS month_count,
    MIN(psm.month_number)::integer AS first_month,
    MIN(psm.week_slot)::integer AS first_week_slot,
    ARRAY_AGG(DISTINCT psm.month_number ORDER BY psm.month_number) AS months,
    ARRAY_AGG(DISTINCT psm.week_slot ORDER BY psm.week_slot) AS week_slots
  FROM public.pam_source_marks psm
  GROUP BY
    psm.hotel_id,
    psm.source_version,
    psm.source_sheet,
    psm.source_row,
    psm.source_apparatus_id,
    psm.apparatus_registry_id,
    psm.plan_year,
    psm.mark_code
)
SELECT
  g.hotel_id,
  g.source_version,
  g.source_sheet,
  g.source_row,
  psg.maintenance_name,
  g.source_apparatus_id,
  g.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  g.plan_year,
  g.mark_code,
  pac.name AS action_name,
  pac.definition_status,
  g.mark_count,
  g.month_count,
  g.months,
  g.week_slots,
  g.first_month AS anchor_month,
  g.first_week_slot AS anchor_week_slot,
  CASE
    WHEN g.mark_count = 48 AND g.month_count = 12 THEN 'WEEK'
    WHEN g.mark_count = 12 AND g.month_count = 12 THEN 'MONTH'
    WHEN g.mark_count = 6 AND g.month_count = 6 THEN 'MONTH'
    WHEN g.mark_count = 4 AND g.month_count = 4 THEN 'MONTH'
    WHEN g.mark_count = 3 AND g.month_count = 3 THEN 'MONTH'
    WHEN g.mark_count = 2 AND g.month_count = 2 THEN 'MONTH'
    WHEN g.mark_count = 1 AND g.month_count = 1 THEN 'YEAR'
    ELSE 'VARIABLE'
  END AS derived_periodicity_unit,
  CASE
    WHEN g.mark_count = 48 AND g.month_count = 12 THEN 1
    WHEN g.mark_count = 12 AND g.month_count = 12 THEN 1
    WHEN g.mark_count = 6 AND g.month_count = 6 THEN 2
    WHEN g.mark_count = 4 AND g.month_count = 4 THEN 3
    WHEN g.mark_count = 3 AND g.month_count = 3 THEN 4
    WHEN g.mark_count = 2 AND g.month_count = 2 THEN 6
    WHEN g.mark_count = 1 AND g.month_count = 1 THEN 1
    ELSE NULL
  END AS derived_periodicity_value
FROM grouped g
LEFT JOIN public.pam_source_groups psg
  ON psg.hotel_id = g.hotel_id
 AND psg.source_version = g.source_version
 AND psg.source_sheet = g.source_sheet
 AND psg.source_row = g.source_row
LEFT JOIN public.apparatus_registry ar
  ON ar.id = g.apparatus_registry_id
JOIN public.pam_action_codes pac
  ON pac.code = g.mark_code;

COMMIT;
