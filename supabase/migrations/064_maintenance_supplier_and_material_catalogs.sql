-- Arias Suite — migración 064
-- Extiende el catálogo maestro existente de providers para representar:
-- 1) proveedor predeterminado por categoría de Pendientes;
-- 2) catálogo de materiales y códigos de pedido.
-- Los proveedores y contactos se guardan en providers/provider_hotels/provider_contacts,
-- que ya utiliza la pantalla /providers. No se crea un segundo catálogo de proveedores.
-- Datos iniciales proceden de PROVEEDORES y MATERIALES Y CODIGOS de PENDIENTES (1).xlsm.
-- No modifica ninguna migración ejecutada ni la tabla de pendientes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_category_supplier_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_maintenance_category_supplier_defaults_hotel_category UNIQUE (hotel_id, category_name)
);

CREATE TABLE IF NOT EXISTS public.maintenance_material_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  description text NOT NULL,
  order_code text NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_maintenance_material_catalog_hotel_description UNIQUE (hotel_id, description)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_category_supplier_defaults_hotel_active
  ON public.maintenance_category_supplier_defaults (hotel_id, active, category_name);
CREATE INDEX IF NOT EXISTS ix_maintenance_material_catalog_hotel_active
  ON public.maintenance_material_catalog (hotel_id, active, description);

ALTER TABLE public.maintenance_category_supplier_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_material_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_category_supplier_defaults_select ON public.maintenance_category_supplier_defaults;
CREATE POLICY maintenance_category_supplier_defaults_select
  ON public.maintenance_category_supplier_defaults FOR SELECT TO authenticated
  USING (public.has_hotel_access(hotel_id));

DROP POLICY IF EXISTS maintenance_category_supplier_defaults_insert ON public.maintenance_category_supplier_defaults;
CREATE POLICY maintenance_category_supplier_defaults_insert
  ON public.maintenance_category_supplier_defaults FOR INSERT TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_category_supplier_defaults_update ON public.maintenance_category_supplier_defaults;
CREATE POLICY maintenance_category_supplier_defaults_update
  ON public.maintenance_category_supplier_defaults FOR UPDATE TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_category_supplier_defaults_delete ON public.maintenance_category_supplier_defaults;
CREATE POLICY maintenance_category_supplier_defaults_delete
  ON public.maintenance_category_supplier_defaults FOR DELETE TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_material_catalog_select ON public.maintenance_material_catalog;
CREATE POLICY maintenance_material_catalog_select
  ON public.maintenance_material_catalog FOR SELECT TO authenticated
  USING (public.has_hotel_access(hotel_id));

DROP POLICY IF EXISTS maintenance_material_catalog_insert ON public.maintenance_material_catalog;
CREATE POLICY maintenance_material_catalog_insert
  ON public.maintenance_material_catalog FOR INSERT TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_material_catalog_update ON public.maintenance_material_catalog;
CREATE POLICY maintenance_material_catalog_update
  ON public.maintenance_material_catalog FOR UPDATE TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_material_catalog_delete ON public.maintenance_material_catalog;
CREATE POLICY maintenance_material_catalog_delete
  ON public.maintenance_material_catalog FOR DELETE TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'));

COMMENT ON TABLE public.maintenance_category_supplier_defaults IS
  'Proveedor predeterminado por categoría de pendiente, enlazado al catálogo maestro providers.';
COMMENT ON TABLE public.maintenance_material_catalog IS
  'Materiales y códigos de pedido por hotel, enlazados al proveedor maestro existente.';

DO $$
DECLARE
  v_hotel_id uuid;
  v_tenant_id uuid;
BEGIN
  SELECT h.id, h.tenant_id
    INTO v_hotel_id, v_tenant_id
  FROM public.hotels h
  JOIN public.tenants t ON t.id = h.tenant_id
  WHERE h.code = 'SB-DZ' AND t.code = 'SBH'
  LIMIT 1;

  IF v_hotel_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el hotel SB-DZ/tenant SBH para inicializar los catálogos.';
  END IF;

  -- Crea únicamente proveedores del Excel que aún no existen en el tenant.
  -- Si ya existe un proveedor con el mismo nombre comercial o razón social,
  -- se reutiliza y no se crea un duplicado.
  INSERT INTO public.providers (tenant_id, legal_name, trade_name, country, active, notes)
  SELECT v_tenant_id, seed.supplier_name, seed.supplier_name, 'España', true,
         'Importado del catálogo PENDIENTES (1).xlsm; revisar ficha y datos fiscales.'
  FROM (VALUES
    ('SSTT'),
    ('Pio'),
    ('FRYCA'),
    ('FRIGORISTA'),
    ('FONTROOM'),
    ('NECHI'),
    ('ROTUGLAS'),
    ('KONE'),
    ('DORMAKABA'),
    ('CRISTALERIA LLOREDA'),
    ('Carpinteria de aluminio'),
    ('PLADURISTA'),
    ('TMB'),
    ('AIRLAM'),
    ('TRES')
  ) AS seed(supplier_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.providers p
    WHERE p.tenant_id = v_tenant_id
      AND (
        lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name))
        OR lower(trim(p.legal_name)) = lower(trim(seed.supplier_name))
      )
  );

  -- Relaciona los proveedores del catálogo con este hotel. Una relación inactiva
  -- se reactiva en vez de insertar una segunda relación.
  UPDATE public.provider_hotels ph
  SET active = true
  WHERE ph.hotel_id = v_hotel_id
    AND EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = ph.provider_id
        AND p.tenant_id = v_tenant_id
        AND (
          lower(trim(coalesce(p.trade_name, ''))) IN (
            'sstt','pio','fryca','frigorista','fontroom','nechi','rotuglas','kone',
            'dormakaba','cristaleria lloreda','carpinteria de aluminio','pladurista','tmb','airlam','tres'
          )
          OR lower(trim(p.legal_name)) IN (
            'sstt','pio','fryca','frigorista','fontroom','nechi','rotuglas','kone',
            'dormakaba','cristaleria lloreda','carpinteria de aluminio','pladurista','tmb','airlam','tres'
          )
        )
    );

  INSERT INTO public.provider_hotels (provider_id, hotel_id, active)
  SELECT p.id, v_hotel_id, true
  FROM public.providers p
  WHERE p.tenant_id = v_tenant_id
    AND (
      lower(trim(coalesce(p.trade_name, ''))) IN (
        'sstt','pio','fryca','frigorista','fontroom','nechi','rotuglas','kone',
        'dormakaba','cristaleria lloreda','carpinteria de aluminio','pladurista','tmb','airlam','tres'
      )
      OR lower(trim(p.legal_name)) IN (
        'sstt','pio','fryca','frigorista','fontroom','nechi','rotuglas','kone',
        'dormakaba','cristaleria lloreda','carpinteria de aluminio','pladurista','tmb','airlam','tres'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.provider_hotels existing
      WHERE existing.provider_id = p.id
        AND existing.hotel_id = v_hotel_id
    );

  -- Añade los contactos del Excel solo cuando el proveedor no tenga ya ningún
  -- contacto activo, para no sobrescribir datos maestros existentes.
  INSERT INTO public.provider_contacts (provider_id, full_name, is_primary, emergency_available, active, notes)
  SELECT p.id, seed.contact_name, true, false, true,
         'Contacto importado de la hoja PROVEEDORES; completar teléfono y email.'
  FROM (VALUES
    ('SSTT', 'Emerson'),
    ('Pio', 'Manolo'),
    ('FRYCA', 'Julian'),
    ('FRIGORISTA', 'Dani'),
    ('FONTROOM', 'Paco'),
    ('NECHI', 'Hector'),
    ('ROTUGLAS', 'Jose'),
    ('KONE', 'kone'),
    ('DORMAKABA', 'Dormakaba'),
    ('CRISTALERIA LLOREDA', 'Francisco'),
    ('PLADURISTA', 'David'),
    ('TMB', 'TMB')
  ) AS seed(supplier_name, contact_name)
  JOIN LATERAL (
    SELECT p.id
    FROM public.providers p
    WHERE p.tenant_id = v_tenant_id
      AND (
        lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name))
        OR lower(trim(p.legal_name)) = lower(trim(seed.supplier_name))
      )
    ORDER BY CASE WHEN lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name)) THEN 0 ELSE 1 END
    LIMIT 1
  ) p ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.provider_contacts pc
    WHERE pc.provider_id = p.id AND pc.active = true
  );

  -- Mantiene las categorías como servicios en el catálogo maestro de proveedores.
  INSERT INTO public.provider_services (provider_id, service_name, description, active)
  SELECT p.id, seed.category_name,
         'Categoría de trabajo importada de la hoja PROVEEDORES.', true
  FROM (VALUES
    ('SSTT', 'Electricidad básica'),
    ('SSTT', 'Fontaneria basica'),
    ('SSTT', 'Varios'),
    ('Pio', 'Fontanería mayor'),
    ('FRYCA', 'Tren de lavado'),
    ('FRIGORISTA', 'Climatización'),
    ('FONTROOM', 'Carpintería'),
    ('NECHI', 'Domotica'),
    ('ROTUGLAS', 'Rotulación'),
    ('KONE', 'Ascensores'),
    ('DORMAKABA', 'Puertas automáticas'),
    ('CRISTALERIA LLOREDA', 'Cristaleria y ventanas'),
    ('Carpinteria de aluminio', 'Carpinteria de aluminio'),
    ('PLADURISTA', 'Pladur'),
    ('TMB', 'Reparación de bombas')
  ) AS seed(supplier_name, category_name)
  JOIN LATERAL (
    SELECT p.id
    FROM public.providers p
    WHERE p.tenant_id = v_tenant_id
      AND (
        lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name))
        OR lower(trim(p.legal_name)) = lower(trim(seed.supplier_name))
      )
    ORDER BY CASE WHEN lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name)) THEN 0 ELSE 1 END
    LIMIT 1
  ) p ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.provider_services ps
    WHERE ps.provider_id = p.id AND lower(trim(ps.service_name)) = lower(trim(seed.category_name))
  );

  INSERT INTO public.maintenance_category_supplier_defaults (hotel_id, category_name, provider_id)
  SELECT v_hotel_id, seed.category_name, p.id
  FROM (VALUES
    ('Electricidad básica', 'SSTT'),
    ('Fontaneria basica', 'SSTT'),
    ('Varios', 'SSTT'),
    ('Fontanería mayor', 'Pio'),
    ('Tren de lavado', 'FRYCA'),
    ('Climatización', 'FRIGORISTA'),
    ('Carpintería', 'FONTROOM'),
    ('Domotica', 'NECHI'),
    ('Rotulación', 'ROTUGLAS'),
    ('Ascensores', 'KONE'),
    ('Puertas automáticas', 'DORMAKABA'),
    ('Cristaleria y ventanas', 'CRISTALERIA LLOREDA'),
    ('Carpinteria de aluminio', 'Carpinteria de aluminio'),
    ('Pladur', 'PLADURISTA'),
    ('Reparación de bombas', 'TMB')
  ) AS seed(category_name, supplier_name)
  JOIN LATERAL (
    SELECT p.id
    FROM public.providers p
    WHERE p.tenant_id = v_tenant_id
      AND (
        lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name))
        OR lower(trim(p.legal_name)) = lower(trim(seed.supplier_name))
      )
    ORDER BY CASE WHEN lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name)) THEN 0 ELSE 1 END
    LIMIT 1
  ) p ON true
  ON CONFLICT (hotel_id, category_name) DO UPDATE
    SET provider_id = EXCLUDED.provider_id,
        active = true,
        updated_at = now();

  INSERT INTO public.maintenance_material_catalog (hotel_id, description, order_code, provider_id)
  SELECT v_hotel_id, seed.description, seed.order_code, p.id
  FROM (VALUES
    ('Motor tipo 1 fancoil habitaciones', 'AERMEC FCX50P 9110233', 'AIRLAM'),
    ('Bandeja de condensados', 'Bandeja de condensados BC8', 'AIRLAM'),
    ('Telefono de ducha', 'Tres 134748 Ducha Lex-100 5 posiciones', 'TRES')
  ) AS seed(description, order_code, supplier_name)
  JOIN LATERAL (
    SELECT p.id
    FROM public.providers p
    WHERE p.tenant_id = v_tenant_id
      AND (
        lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name))
        OR lower(trim(p.legal_name)) = lower(trim(seed.supplier_name))
      )
    ORDER BY CASE WHEN lower(trim(coalesce(p.trade_name, ''))) = lower(trim(seed.supplier_name)) THEN 0 ELSE 1 END
    LIMIT 1
  ) p ON true
  ON CONFLICT (hotel_id, description) DO UPDATE
    SET order_code = EXCLUDED.order_code,
        provider_id = EXCLUDED.provider_id,
        active = true,
        updated_at = now();
END;
$$;

COMMIT;
