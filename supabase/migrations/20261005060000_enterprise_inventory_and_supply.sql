-- Migration: 20261005060000_enterprise_inventory_and_supply.sql
-- Description: P3 enterprise operations foundation: branch-scoped inventory, supplier ordering,
--              and delegated branch-manager access for multi-unit providers.

ALTER TABLE public.provider_memberships
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.can_manage_provider_operations(
  p_provider_id UUID,
  p_branch_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND provider_id = p_provider_id
  ) THEN RETURN FALSE; END IF;
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin() THEN
    RETURN TRUE;
  END IF;

  IF v_user_id IS NULL OR p_provider_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.providers p
    WHERE p.id = p_provider_id
      AND p.owner_id = v_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.provider_memberships m
    WHERE m.provider_id = p_provider_id
      AND m.user_id = v_user_id
      AND m.is_active = TRUE
      AND m.role IN ('manager', 'branch_manager', 'inventory_manager', 'receptionist')
      AND m.permissions -> 'inventory' = 'true'::jsonb
      AND (
        p_branch_id IS NULL
        OR m.branch_id IS NULL
        OR m.branch_id = p_branch_id
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_provider_operations(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_provider_operations(UUID, UUID) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(120),
  contact_phone VARCHAR(32),
  contact_email VARCHAR(160),
  payment_terms VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_suppliers_provider
  ON public.inventory_suppliers (provider_id, status, name);

CREATE TABLE IF NOT EXISTS public.inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  sku VARCHAR(80),
  name_en VARCHAR(160) NOT NULL,
  name_ar VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'retail',
  unit VARCHAR(32) NOT NULL DEFAULT 'unit',
  unit_cost_sar NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_cost_sar >= 0),
  retail_price_sar NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (retail_price_sar >= 0),
  default_reorder_point NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (default_reorder_point >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_inventory_products_provider
  ON public.inventory_products (provider_id, is_active, category);

CREATE TABLE IF NOT EXISTS public.branch_inventory_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  reorder_point_override NUMERIC(12,3) CHECK (reorder_point_override IS NULL OR reorder_point_override >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_stock_branch
  ON public.branch_inventory_stock (branch_id, product_id);

CREATE TABLE IF NOT EXISTS public.inventory_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  purchase_order_item_id UUID,
  movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN ('received', 'adjustment', 'transfer_in', 'transfer_out', 'sale', 'waste')),
  quantity_delta NUMERIC(12,3) NOT NULL,
  unit_cost_sar NUMERIC(10,2) CHECK (unit_cost_sar IS NULL OR unit_cost_sar >= 0),
  reason TEXT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_created
  ON public.inventory_stock_movements (branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.supplier_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES public.inventory_suppliers(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'received', 'cancelled')),
  subtotal_sar NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_sar >= 0),
  notes TEXT,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_purchase_orders_provider
  ON public.supplier_purchase_orders (provider_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.supplier_purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.supplier_purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost_sar NUMERIC(10,2) NOT NULL CHECK (unit_cost_sar >= 0),
  line_total_sar NUMERIC(12,2) GENERATED ALWAYS AS (round((quantity * unit_cost_sar)::numeric, 2)) STORED,
  UNIQUE (purchase_order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_purchase_order_items_order
  ON public.supplier_purchase_order_items (purchase_order_id);

ALTER TABLE public.inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_purchase_order_item_id_fkey;
ALTER TABLE public.inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_purchase_order_item_id_fkey
  FOREIGN KEY (purchase_order_item_id)
  REFERENCES public.supplier_purchase_order_items(id)
  ON DELETE SET NULL;

ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider operations read suppliers" ON public.inventory_suppliers;
CREATE POLICY "Provider operations read suppliers"
  ON public.inventory_suppliers
  FOR SELECT
  TO authenticated
  USING (public.can_manage_provider_operations(provider_id, NULL));

DROP POLICY IF EXISTS "Provider operations manage suppliers" ON public.inventory_suppliers;
CREATE POLICY "Provider operations manage suppliers"
  ON public.inventory_suppliers
  FOR ALL
  TO authenticated
  USING (public.can_manage_provider_operations(provider_id, NULL))
  WITH CHECK (public.can_manage_provider_operations(provider_id, NULL));

DROP POLICY IF EXISTS "Provider operations read products" ON public.inventory_products;
CREATE POLICY "Provider operations read products"
  ON public.inventory_products
  FOR SELECT
  TO authenticated
  USING (public.can_manage_provider_operations(provider_id, NULL));

DROP POLICY IF EXISTS "Provider operations manage products" ON public.inventory_products;
CREATE POLICY "Provider operations manage products"
  ON public.inventory_products
  FOR ALL
  TO authenticated
  USING (public.can_manage_provider_operations(provider_id, NULL))
  WITH CHECK (public.can_manage_provider_operations(provider_id, NULL));

DROP POLICY IF EXISTS "Provider operations read branch stock" ON public.branch_inventory_stock;
CREATE POLICY "Provider operations read branch stock"
  ON public.branch_inventory_stock
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_inventory_stock.branch_id
        AND public.can_manage_provider_operations(b.provider_id, b.id)
    )
  );

DROP POLICY IF EXISTS "Provider operations manage branch stock" ON public.branch_inventory_stock;
CREATE POLICY "Provider operations manage branch stock"
  ON public.branch_inventory_stock
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_inventory_stock.branch_id
        AND public.can_manage_provider_operations(b.provider_id, b.id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_inventory_stock.branch_id
        AND public.can_manage_provider_operations(b.provider_id, b.id)
    )
  );

DROP POLICY IF EXISTS "Provider operations read stock movements" ON public.inventory_stock_movements;
CREATE POLICY "Provider operations read stock movements"
  ON public.inventory_stock_movements
  FOR SELECT
  TO authenticated
  USING (public.can_manage_provider_operations(provider_id, branch_id));

DROP POLICY IF EXISTS "Provider operations read purchase orders" ON public.supplier_purchase_orders;
CREATE POLICY "Provider operations read purchase orders"
  ON public.supplier_purchase_orders
  FOR SELECT
  TO authenticated
  USING (public.can_manage_provider_operations(provider_id, branch_id));

DROP POLICY IF EXISTS "Provider operations read purchase order items" ON public.supplier_purchase_order_items;
CREATE POLICY "Provider operations read purchase order items"
  ON public.supplier_purchase_order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.supplier_purchase_orders po
      WHERE po.id = supplier_purchase_order_items.purchase_order_id
        AND public.can_manage_provider_operations(po.provider_id, po.branch_id)
    )
  );

REVOKE ALL ON public.inventory_suppliers, public.inventory_products, public.branch_inventory_stock,
  public.inventory_stock_movements, public.supplier_purchase_orders, public.supplier_purchase_order_items
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_suppliers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.inventory_products TO authenticated, service_role;
GRANT SELECT ON public.branch_inventory_stock TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.branch_inventory_stock TO service_role;
GRANT SELECT ON public.inventory_stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_stock_movements TO service_role;
GRANT SELECT ON public.supplier_purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_purchase_orders TO service_role;
GRANT SELECT ON public.supplier_purchase_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_purchase_order_items TO service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_purchase_order(
  p_provider_id UUID,
  p_branch_id UUID,
  p_supplier_id UUID,
  p_notes TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order_id UUID;
  v_total NUMERIC(12,2) := 0;
  v_item JSONB;
  v_product public.inventory_products;
  v_quantity NUMERIC(12,3);
  v_unit_cost NUMERIC(10,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_manage_provider_operations(p_provider_id, p_branch_id) THEN
    RAISE EXCEPTION 'Not authorized to create supplier orders for this provider or branch.' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND provider_id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to provider.' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_suppliers
    WHERE id = p_supplier_id AND provider_id = p_provider_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active supplier does not belong to provider.' USING ERRCODE = '23503';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one purchase order item is required.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supplier_purchase_orders (
    provider_id,
    branch_id,
    supplier_id,
    status,
    notes,
    requested_by
  )
  VALUES (
    p_provider_id,
    p_branch_id,
    p_supplier_id,
    'draft',
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_user_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.inventory_products
    WHERE id = (v_item->>'product_id')::uuid
      AND provider_id = p_provider_id
      AND is_active = TRUE;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Purchase order item references an inactive or foreign product.' USING ERRCODE = '23503';
    END IF;

    IF v_product.supplier_id IS NOT NULL AND v_product.supplier_id <> p_supplier_id THEN
      RAISE EXCEPTION 'Product is assigned to a different supplier.' USING ERRCODE = '22023';
    END IF;

    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := COALESCE(NULLIF(v_item->>'unit_cost_sar', '')::numeric, v_product.unit_cost_sar);

    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_quantity <> round(v_quantity, 3) OR v_unit_cost IS NULL OR v_unit_cost < 0
      OR v_unit_cost::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Purchase order quantity and unit cost must be positive.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.supplier_purchase_order_items (
      purchase_order_id,
      product_id,
      quantity,
      unit_cost_sar
    )
    VALUES (
      v_order_id,
      v_product.id,
      v_quantity,
      v_unit_cost
    );

    v_total := v_total + round((v_quantity * v_unit_cost)::numeric, 2);
  END LOOP;

  UPDATE public.supplier_purchase_orders
  SET subtotal_sar = v_total,
      updated_at = now()
  WHERE id = v_order_id;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    v_user_id,
    'supplier_purchase_order.create',
    'supplier_purchase_order',
    v_order_id,
    jsonb_build_object('provider_id', p_provider_id, 'branch_id', p_branch_id, 'subtotal_sar', v_total)
  );

  RETURN jsonb_build_object('id', v_order_id, 'status', 'draft', 'subtotal_sar', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_supplier_purchase_order(
  p_order_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order public.supplier_purchase_orders;
  v_next_status TEXT;
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order
  FROM public.supplier_purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_provider_operations(v_order.provider_id, v_order.branch_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this purchase order.' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'submit' AND v_order.status = 'draft' THEN
    v_next_status := 'submitted';
  ELSIF p_action = 'approve' AND v_order.status = 'submitted' THEN
    IF NOT public.is_admin() AND NOT EXISTS (
      SELECT 1 FROM public.providers WHERE id = v_order.provider_id AND owner_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Only the provider owner or administrator can approve orders.' USING ERRCODE = '42501';
    END IF;
    v_next_status := 'approved';
  ELSIF p_action = 'cancel' AND v_order.status IN ('draft', 'submitted', 'approved') THEN
    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
      RAISE EXCEPTION 'A cancellation reason is required.' USING ERRCODE = '22023';
    END IF;
    v_next_status := 'cancelled';
  ELSIF p_action = 'receive' AND v_order.status = 'approved' THEN
    IF v_order.branch_id IS NULL THEN
      RAISE EXCEPTION 'A branch is required before receiving stock.' USING ERRCODE = '22023';
    END IF;
    v_next_status := 'received';
  ELSE
    RAISE EXCEPTION 'Invalid purchase order transition % from status %.', p_action, v_order.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.supplier_purchase_orders
  SET status = v_next_status,
      approved_by = CASE WHEN v_next_status = 'approved' THEN v_user_id ELSE approved_by END,
      approved_at = CASE WHEN v_next_status = 'approved' THEN now() ELSE approved_at END,
      received_by = CASE WHEN v_next_status = 'received' THEN v_user_id ELSE received_by END,
      received_at = CASE WHEN v_next_status = 'received' THEN now() ELSE received_at END,
      updated_at = now()
  WHERE id = p_order_id;

  IF v_next_status = 'received' THEN
    FOR v_item IN
      SELECT poi.id, poi.product_id, poi.quantity, poi.unit_cost_sar
      FROM public.supplier_purchase_order_items poi
      WHERE poi.purchase_order_id = p_order_id
    LOOP
      INSERT INTO public.branch_inventory_stock (branch_id, product_id, quantity_on_hand)
      VALUES (v_order.branch_id, v_item.product_id, v_item.quantity)
      ON CONFLICT (branch_id, product_id)
      DO UPDATE SET
        quantity_on_hand = public.branch_inventory_stock.quantity_on_hand + EXCLUDED.quantity_on_hand,
        updated_at = now();

      INSERT INTO public.inventory_stock_movements (
        provider_id,
        branch_id,
        product_id,
        purchase_order_item_id,
        movement_type,
        quantity_delta,
        unit_cost_sar,
        reason,
        actor_id
      )
      VALUES (
        v_order.provider_id,
        v_order.branch_id,
        v_item.product_id,
        v_item.id,
        'received',
        v_item.quantity,
        v_item.unit_cost_sar,
        p_reason,
        v_user_id
      );
    END LOOP;
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    v_user_id,
    'supplier_purchase_order.' || p_action,
    'supplier_purchase_order',
    p_order_id,
    jsonb_build_object('from_status', v_order.status, 'to_status', v_next_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object('id', p_order_id, 'status', v_next_status);
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_purchase_order(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_supplier_purchase_order(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_purchase_order(UUID, UUID, UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_supplier_purchase_order(UUID, TEXT, TEXT) TO authenticated, service_role;
