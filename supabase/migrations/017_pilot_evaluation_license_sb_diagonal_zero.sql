-- Arias Suite — migración 017
-- Licencia de evaluación / piloto para Hotel SB Diagonal Zero.
--
-- Periodo: 25/09/2026 a 24/12/2026 (90 días).
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_contract_id uuid;
BEGIN
  SELECT id
    INTO v_tenant_id
  FROM public.tenants
  WHERE code = 'SBH'
    AND active = true
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No existe un tenant activo con código SBH.';
  END IF;

  SELECT id
    INTO v_hotel_id
  FROM public.hotels
  WHERE tenant_id = v_tenant_id
    AND code = 'SB-DZ'
    AND active = true
  LIMIT 1;

  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'No existe un hotel activo SB-DZ dentro del tenant SBH.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_contracts
    WHERE contract_code = 'EVAL-SBH-SBDZ-2026-01'
  ) THEN
    RAISE EXCEPTION 'La licencia EVAL-SBH-SBDZ-2026-01 ya existe.';
  END IF;

  INSERT INTO public.tenant_contracts (
    tenant_id,
    contract_code,
    plan_name,
    status,
    start_date,
    end_date,
    notes
  )
  VALUES (
    v_tenant_id,
    'EVAL-SBH-SBDZ-2026-01',
    'Licencia de evaluación — Arias Suite',
    'ACTIVE',
    DATE '2026-09-25',
    DATE '2026-12-24',
    'Piloto de evaluación de Arias Suite en Hotel SB Diagonal Zero. Duración: 90 días. Sin coste durante el periodo de evaluación. Sujeto a posterior propuesta comercial si el piloto resulta satisfactorio para las partes.'
  )
  RETURNING id INTO v_contract_id;

  INSERT INTO public.tenant_contract_hotels (
    contract_id,
    hotel_id,
    active
  )
  VALUES (
    v_contract_id,
    v_hotel_id,
    true
  );
END;
$$;

COMMIT;
