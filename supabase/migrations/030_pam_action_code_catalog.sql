-- Arias Suite — migración 030
-- Catálogo inicial de códigos del PAM original.
--
-- Las definiciones proceden de la leyenda del archivo PAM original.
-- Cuando el archivo no ofrece una definición o presenta más de una,
-- el código queda explícitamente en REVIEW.
--
-- No se crean mantenimientos ni trabajos a partir de estos códigos.

BEGIN;

INSERT INTO public.pam_action_codes (
  code,
  name,
  candidate_names,
  definition_status,
  is_action
)
VALUES
  ('*', NULL, '[]'::jsonb, 'REVIEW', false),
  ('CP', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('DS', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('N', 'NETEJA GENERAL', '["NETEJA GENERAL"]'::jsonb, 'CONFIRMED', true),
  ('NG', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('NT', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('RE', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('RG', 'REVISSIO GENERAL', '["REVISSIO GENERAL"]'::jsonb, 'CONFIRMED', true),
  ('RH', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('RK', 'REVISIÓ KONE', '["REVISIÓ KONE"]'::jsonb, 'CONFIRMED', true),
  ('RO', 'OLI HIDRAULIC', '["OLI HIDRAULIC"]'::jsonb, 'CONFIRMED', true),
  ('RR', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('RT', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('SD', 'SUPERVISIO DIARIA', '["SUPERVISIO DIARIA"]'::jsonb, 'CONFIRMED', true),
  ('SE', NULL, '[]'::jsonb, 'UNKNOWN', true),
  ('VE', NULL, '[]'::jsonb, 'UNKNOWN', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  candidate_names = EXCLUDED.candidate_names,
  definition_status = EXCLUDED.definition_status,
  is_action = EXCLUDED.is_action,
  active = true,
  updated_at = now();

-- IG aparece dos veces en la leyenda del archivo con dos significados:
-- INSPECCIO GENERAL e INSPECCIO EXTERNA. Se conserva la ambigüedad.
INSERT INTO public.pam_action_codes (
  code,
  name,
  candidate_names,
  definition_status,
  is_action
)
VALUES (
  'IG',
  NULL,
  '["INSPECCIO GENERAL","INSPECCIO EXTERNA"]'::jsonb,
  'REVIEW',
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = NULL,
  candidate_names = '["INSPECCIO GENERAL","INSPECCIO EXTERNA"]'::jsonb,
  definition_status = 'REVIEW',
  is_action = true,
  active = true,
  updated_at = now();

COMMIT;
