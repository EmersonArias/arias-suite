-- Arias Suite — migración 019
-- Habilita el módulo de mantenimiento en el contrato de evaluación actual.
--
-- Se ejecuta después de 018.
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

INSERT INTO public.tenant_contract_modules (
  contract_id,
  module_code,
  active
)
SELECT
  tc.id,
  'maintenance',
  true
FROM public.tenant_contracts tc
WHERE tc.contract_code = 'EVAL-SBH-SBDZ-2026-01'
ON CONFLICT (contract_id, module_code) DO UPDATE SET
  active = true;

COMMIT;
