-- P3 continuation: auditable stock commands, explicit delegation, and live supply oversight.
CREATE OR REPLACE FUNCTION public.can_access_provider_operation(
  p_provider_id UUID, p_branch_id UUID, p_operation TEXT
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_operation IN ('inventory', 'bookings', 'staff', 'reports')
    AND (p_branch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.branches WHERE id = p_branch_id AND provider_id = p_provider_id
    ))
    AND (public.is_admin() OR EXISTS (
      SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.provider_memberships m
      WHERE m.provider_id = p_provider_id AND m.user_id = auth.uid() AND m.is_active
        AND m.role IN ('manager', 'branch_manager', 'inventory_manager', 'receptionist')
        AND m.permissions -> p_operation = 'true'::jsonb
        AND (m.branch_id IS NULL OR p_branch_id IS NULL OR m.branch_id = p_branch_id)
    ));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_provider_operations(
  p_provider_id UUID, p_branch_id UUID DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_provider_operation(p_provider_id, p_branch_id, 'inventory');
$$;

REVOKE ALL ON FUNCTION public.can_access_provider_operation(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_provider_operation(UUID, UUID, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_provider_operations(UUID, UUID) FROM PUBLIC, anon;

-- Default Supabase grants must not leave unaudited writes open to clients.
REVOKE ALL ON public.inventory_suppliers, public.inventory_products, public.branch_inventory_stock,
  public.inventory_stock_movements, public.supplier_purchase_orders, public.supplier_purchase_order_items
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_suppliers, public.inventory_products TO authenticated;
GRANT SELECT ON public.branch_inventory_stock, public.inventory_stock_movements,
  public.supplier_purchase_orders, public.supplier_purchase_order_items TO authenticated;
DROP POLICY IF EXISTS "Provider operations manage branch stock" ON public.branch_inventory_stock;
ALTER TABLE public.branch_inventory_stock ADD CONSTRAINT inventory_reserved_within_on_hand
  CHECK (quantity_reserved <= quantity_on_hand);

CREATE TABLE public.inventory_command_receipts (
  request_id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  payload JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_command_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.inventory_command_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.validate_inventory_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID;
BEGIN
  IF TG_TABLE_NAME = 'inventory_products' THEN
    IF length(trim(NEW.name_en)) = 0 OR length(trim(NEW.name_ar)) = 0 OR length(trim(NEW.unit)) = 0
      OR NEW.unit_cost_sar::text IN ('NaN', 'Infinity', '-Infinity')
      OR NEW.retail_price_sar::text IN ('NaN', 'Infinity', '-Infinity')
      OR NEW.default_reorder_point::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Valid product names, unit and finite costs required' USING ERRCODE = '22023'; END IF;
    IF TG_OP = 'UPDATE' AND NEW.provider_id <> OLD.provider_id THEN
      RAISE EXCEPTION 'Product ownership cannot change' USING ERRCODE = '42501';
    END IF;
    IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.inventory_suppliers WHERE id = NEW.supplier_id AND provider_id = NEW.provider_id
    ) THEN RAISE EXCEPTION 'Supplier belongs to another provider' USING ERRCODE = '23503'; END IF;
  ELSIF TG_TABLE_NAME = 'inventory_suppliers' THEN
    IF TG_OP = 'UPDATE' AND NEW.provider_id <> OLD.provider_id THEN
      RAISE EXCEPTION 'Supplier ownership cannot change' USING ERRCODE = '42501';
    END IF;
    IF length(trim(NEW.name)) = 0 THEN RAISE EXCEPTION 'Supplier name required'; END IF;
  ELSE
    SELECT provider_id INTO v_provider FROM public.branches WHERE id = NEW.branch_id;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_products WHERE id = NEW.product_id AND provider_id = v_provider) THEN
      RAISE EXCEPTION 'Product belongs to another provider' USING ERRCODE = '23503';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_product_inventory_scope BEFORE INSERT OR UPDATE ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_scope();
CREATE TRIGGER validate_supplier_inventory_scope BEFORE INSERT OR UPDATE ON public.inventory_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_scope();
CREATE TRIGGER validate_branch_inventory_scope BEFORE INSERT OR UPDATE ON public.branch_inventory_stock
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_scope();

CREATE OR REPLACE FUNCTION public.audit_inventory_catalog()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME, NEW.id,
    jsonb_build_object('provider_id', NEW.provider_id, 'before', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, 'after', to_jsonb(NEW)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_inventory_supplier AFTER INSERT OR UPDATE ON public.inventory_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_inventory_catalog();
CREATE TRIGGER audit_inventory_product AFTER INSERT OR UPDATE ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.audit_inventory_catalog();
REVOKE ALL ON FUNCTION public.validate_inventory_scope(), public.audit_inventory_catalog() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.adjust_branch_inventory_stock(
  p_branch_id UUID, p_product_id UUID, p_quantity_delta NUMERIC, p_reason TEXT,
  p_movement_type TEXT DEFAULT 'adjustment', p_request_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID; v_stock public.branch_inventory_stock; v_payload JSONB;
  v_receipt public.inventory_command_receipts; v_result JSONB; v_next NUMERIC;
BEGIN
  SELECT b.provider_id INTO v_provider FROM public.branches b JOIN public.inventory_products p
    ON p.provider_id = b.provider_id WHERE b.id = p_branch_id AND p.id = p_product_id AND p.is_active;
  IF NOT COALESCE(public.can_manage_provider_operations(v_provider, p_branch_id), FALSE) THEN
    RAISE EXCEPTION 'Forbidden inventory scope' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL OR p_quantity_delta IS NULL OR p_quantity_delta = 0
    OR p_quantity_delta::text IN ('NaN', 'Infinity', '-Infinity') OR p_quantity_delta <> round(p_quantity_delta, 3)
    OR p_reason IS NULL OR length(trim(p_reason)) < 3
    OR p_movement_type NOT IN ('adjustment', 'waste') OR p_movement_type IS NULL
    OR (p_movement_type = 'waste' AND p_quantity_delta >= 0) THEN
    RAISE EXCEPTION 'Valid quantity, reason, movement type and request id required' USING ERRCODE = '22023'; END IF;
  v_payload := jsonb_build_object('command', 'adjust', 'branch', p_branch_id, 'product', p_product_id,
    'delta', p_quantity_delta, 'reason', trim(p_reason), 'type', p_movement_type);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_receipt FROM public.inventory_command_receipts WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_receipt.actor_id <> auth.uid() OR v_receipt.payload <> v_payload THEN
      RAISE EXCEPTION 'Request id already used for another command' USING ERRCODE = '22023'; END IF;
    RETURN v_receipt.result;
  END IF;
  INSERT INTO public.branch_inventory_stock(branch_id, product_id) VALUES (p_branch_id, p_product_id)
    ON CONFLICT (branch_id, product_id) DO NOTHING;
  SELECT * INTO v_stock FROM public.branch_inventory_stock WHERE branch_id = p_branch_id AND product_id = p_product_id FOR UPDATE;
  v_next := v_stock.quantity_on_hand + p_quantity_delta;
  IF v_next < v_stock.quantity_reserved THEN RAISE EXCEPTION 'Insufficient unreserved stock' USING ERRCODE = '22023'; END IF;
  UPDATE public.branch_inventory_stock SET quantity_on_hand = v_next, updated_at = now() WHERE id = v_stock.id;
  INSERT INTO public.inventory_stock_movements(provider_id, branch_id, product_id, movement_type, quantity_delta, reason, actor_id)
    VALUES (v_provider, p_branch_id, p_product_id, p_movement_type, p_quantity_delta, trim(p_reason), auth.uid());
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'inventory.' || p_movement_type, 'branch_inventory_stock', v_stock.id,
      v_payload || jsonb_build_object('request_id', p_request_id, 'before', v_stock.quantity_on_hand, 'after', v_next));
  v_result := jsonb_build_object('quantity_on_hand', v_next, 'request_id', p_request_id);
  INSERT INTO public.inventory_command_receipts VALUES (p_request_id, auth.uid(), v_payload, v_result, now());
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_branch_inventory_stock(
  p_from_branch_id UUID, p_to_branch_id UUID, p_product_id UUID,
  p_quantity NUMERIC, p_reason TEXT, p_request_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID; v_source public.branch_inventory_stock; v_payload JSONB;
  v_receipt public.inventory_command_receipts; v_result JSONB;
BEGIN
  SELECT b.provider_id INTO v_provider FROM public.branches b JOIN public.inventory_products p
    ON p.provider_id = b.provider_id WHERE b.id = p_from_branch_id AND p.id = p_product_id AND p.is_active;
  IF NOT COALESCE(public.can_manage_provider_operations(v_provider, p_from_branch_id), FALSE)
    OR NOT COALESCE(public.can_manage_provider_operations(v_provider, p_to_branch_id), FALSE) THEN
    RAISE EXCEPTION 'Forbidden transfer scope' USING ERRCODE = '42501'; END IF;
  IF p_to_branch_id IS NULL OR p_from_branch_id = p_to_branch_id OR p_request_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0
    OR p_quantity::text IN ('NaN', 'Infinity', '-Infinity') OR p_quantity <> round(p_quantity, 3)
    OR p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Distinct branches, positive quantity, reason and request id required' USING ERRCODE = '22023'; END IF;
  v_payload := jsonb_build_object('command', 'transfer', 'from', p_from_branch_id, 'to', p_to_branch_id,
    'product', p_product_id, 'quantity', p_quantity, 'reason', trim(p_reason));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_receipt FROM public.inventory_command_receipts WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_receipt.actor_id <> auth.uid() OR v_receipt.payload <> v_payload THEN
      RAISE EXCEPTION 'Request id already used for another command' USING ERRCODE = '22023'; END IF;
    RETURN v_receipt.result;
  END IF;
  -- Seed and lock both balances in a stable order even for opposite transfers.
  INSERT INTO public.branch_inventory_stock(branch_id, product_id)
    SELECT id, p_product_id FROM public.branches WHERE id IN (p_from_branch_id, p_to_branch_id) ORDER BY id
    ON CONFLICT (branch_id, product_id) DO NOTHING;
  PERFORM id FROM public.branch_inventory_stock WHERE branch_id IN (p_from_branch_id, p_to_branch_id)
    AND product_id = p_product_id ORDER BY branch_id FOR UPDATE;
  SELECT * INTO v_source FROM public.branch_inventory_stock WHERE branch_id = p_from_branch_id AND product_id = p_product_id;
  IF v_source.quantity_on_hand - v_source.quantity_reserved < p_quantity THEN
    RAISE EXCEPTION 'Insufficient unreserved stock' USING ERRCODE = '22023'; END IF;
  UPDATE public.branch_inventory_stock SET quantity_on_hand = quantity_on_hand +
    CASE WHEN branch_id = p_from_branch_id THEN -p_quantity ELSE p_quantity END, updated_at = now()
    WHERE branch_id IN (p_from_branch_id, p_to_branch_id) AND product_id = p_product_id;
  INSERT INTO public.inventory_stock_movements(provider_id, branch_id, product_id, movement_type, quantity_delta, reason, actor_id)
    VALUES (v_provider, p_from_branch_id, p_product_id, 'transfer_out', -p_quantity, trim(p_reason), auth.uid()),
      (v_provider, p_to_branch_id, p_product_id, 'transfer_in', p_quantity, trim(p_reason), auth.uid());
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'inventory.transfer', 'branch_inventory_stock', v_source.id, v_payload || jsonb_build_object('request_id', p_request_id));
  v_result := jsonb_build_object('request_id', p_request_id, 'quantity', p_quantity);
  INSERT INTO public.inventory_command_receipts VALUES (p_request_id, auth.uid(), v_payload, v_result, now());
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_provider_operation_membership(
  p_provider_id UUID, p_user_id UUID, p_branch_id UUID, p_role TEXT, p_permissions JSONB,
  p_is_active BOOLEAN, p_membership_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_before JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid()
  )) THEN RAISE EXCEPTION 'Only owners and admins manage delegation' USING ERRCODE = '42501'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('manager', 'branch_manager', 'inventory_manager', 'receptionist', 'stylist')
    OR p_is_active IS NULL OR jsonb_typeof(p_permissions) IS DISTINCT FROM 'object'
    OR p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Valid role, permissions, active status and reason required' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_permissions) kv WHERE kv.key NOT IN ('inventory', 'bookings', 'staff', 'reports')
    OR jsonb_typeof(kv.value) <> 'boolean') THEN RAISE EXCEPTION 'Invalid permission key or value' USING ERRCODE = '22023'; END IF;
  IF p_role = 'stylist' AND EXISTS (SELECT 1 FROM jsonb_each(p_permissions) kv WHERE kv.value = 'true'::jsonb) THEN
    RAISE EXCEPTION 'Choose an operations role before granting management permissions' USING ERRCODE = '22023'; END IF;
  IF (p_role = 'branch_manager' AND p_branch_id IS NULL) OR (p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND provider_id = p_provider_id
  )) THEN RAISE EXCEPTION 'Invalid branch scope' USING ERRCODE = '23503'; END IF;
  IF p_membership_id IS NOT NULL THEN
    SELECT to_jsonb(m) INTO v_before FROM public.provider_memberships m WHERE id = p_membership_id
      AND provider_id = p_provider_id AND user_id = p_user_id FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'Membership not found in provider' USING ERRCODE = 'P0002'; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.employees e JOIN public.branches b ON b.id = e.branch_id
      JOIN public.profiles p ON p.id = e.profile_id
      WHERE b.provider_id = p_provider_id AND e.profile_id = p_user_id
        AND p.role = 'provider_employee' AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)) THEN
      RAISE EXCEPTION 'Select registered staff linked to this provider and branch' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.provider_memberships WHERE provider_id = p_provider_id AND user_id = p_user_id
      AND branch_id IS NOT DISTINCT FROM p_branch_id) THEN RAISE EXCEPTION 'Edit the existing membership instead' USING ERRCODE = '23505'; END IF;
  END IF;
  IF p_membership_id IS NULL THEN
    INSERT INTO public.provider_memberships(user_id, provider_id, branch_id, role, permissions, is_active)
      VALUES(p_user_id, p_provider_id, p_branch_id, p_role, p_permissions, p_is_active) RETURNING id INTO v_id;
  ELSE
    UPDATE public.provider_memberships SET branch_id = p_branch_id, role = p_role, permissions = p_permissions,
      is_active = p_is_active WHERE id = p_membership_id RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES(auth.uid(), 'provider_membership.save', 'provider_membership', v_id,
      jsonb_build_object('reason', trim(p_reason), 'before', v_before, 'permissions', p_permissions, 'branch_id', p_branch_id, 'is_active', p_is_active));
  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE INSERT, UPDATE, DELETE ON public.provider_memberships FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_provider_operations_context(p_provider_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID := p_provider_id; v_owner BOOLEAN; v_branches JSONB; v_members JSONB; v_candidates JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF v_provider IS NULL THEN
    SELECT id INTO v_provider FROM public.providers WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
    IF v_provider IS NULL THEN SELECT provider_id INTO v_provider FROM public.provider_memberships
      WHERE user_id = auth.uid() AND is_active ORDER BY created_at LIMIT 1; END IF;
  END IF;
  SELECT public.is_admin() OR EXISTS (SELECT 1 FROM public.providers WHERE id = v_provider AND owner_id = auth.uid()) INTO v_owner;
  IF v_provider IS NULL OR NOT (v_owner OR EXISTS (SELECT 1 FROM public.provider_memberships
    WHERE provider_id = v_provider AND user_id = auth.uid() AND is_active)) THEN
    RAISE EXCEPTION 'No provider membership available' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name_en', b.name_en, 'name_ar', b.name_ar) ORDER BY b.name_en), '[]')
    INTO v_branches FROM public.branches b WHERE b.provider_id = v_provider AND (v_owner OR EXISTS (
      SELECT 1 FROM public.provider_memberships m WHERE m.provider_id = v_provider AND m.user_id = auth.uid()
        AND m.is_active AND (m.branch_id IS NULL OR m.branch_id = b.id)));
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id, 'branch_id', m.branch_id,
    'role', m.role, 'permissions', m.permissions, 'is_active', m.is_active,
    'display_name', COALESCE(NULLIF(concat_ws(' ', p.first_name, p.last_name), ''), m.user_id::text)) ORDER BY m.created_at), '[]')
    INTO v_members FROM public.provider_memberships m JOIN public.profiles p ON p.id = m.user_id
    WHERE m.provider_id = v_provider AND (v_owner OR m.user_id = auth.uid());
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', e.profile_id, 'display_name', e.name_en, 'branch_id', e.branch_id)), '[]')
    INTO v_candidates FROM public.employees e JOIN public.branches b ON b.id = e.branch_id
    JOIN public.profiles p ON p.id = e.profile_id
    WHERE v_owner AND b.provider_id = v_provider AND p.role = 'provider_employee' AND e.is_active;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES(auth.uid(), 'provider_operations.read', 'provider', v_provider, '{}'::jsonb);
  RETURN jsonb_build_object('provider_id', v_provider, 'can_manage_memberships', v_owner,
    'branches', v_branches, 'memberships', v_members, 'employee_candidates', v_candidates);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_chain_operations(
  p_provider_id UUID, p_start_date DATE, p_end_date DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_branches JSONB; v_totals JSONB;
BEGIN
  IF NOT COALESCE(public.can_access_provider_operation(p_provider_id, NULL, 'reports'), FALSE) THEN
    RAISE EXCEPTION 'Reports permission required' USING ERRCODE = '42501'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  WITH visible AS (
    SELECT b.* FROM public.branches b WHERE b.provider_id = p_provider_id
      AND public.can_access_provider_operation(p_provider_id, b.id, 'reports')
  ), rollup AS (
    SELECT b.id AS branch_id, b.name_en, b.name_ar,
      (SELECT COALESCE(sum(total_price), 0) FROM public.bookings WHERE branch_id = b.id AND status = 'completed'
        AND (scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date) AS revenue_sar,
      (SELECT count(*) FROM public.bookings WHERE branch_id = b.id AND status = 'completed'
        AND (scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date) AS completed_bookings,
      (SELECT count(*) FROM public.bookings WHERE branch_id = b.id
        AND (scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date) AS total_bookings,
      (SELECT count(*) FROM public.employees WHERE branch_id = b.id AND is_active) AS active_staff,
      (SELECT COALESCE(sum(s.quantity_on_hand * p.unit_cost_sar), 0) FROM public.branch_inventory_stock s
        JOIN public.inventory_products p ON p.id = s.product_id WHERE s.branch_id = b.id) AS stock_value_sar,
      (SELECT count(*) FROM public.inventory_products p LEFT JOIN public.branch_inventory_stock s ON s.product_id = p.id AND s.branch_id = b.id
        WHERE p.provider_id = b.provider_id AND p.is_active AND COALESCE(s.reorder_point_override, p.default_reorder_point) > 0
          AND COALESCE(s.quantity_on_hand - s.quantity_reserved, 0) <= COALESCE(s.reorder_point_override, p.default_reorder_point)) AS low_stock_count
    FROM visible b
  ) SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY name_en), '[]'), jsonb_build_object(
      'revenue_sar', COALESCE(sum(revenue_sar), 0), 'completed_bookings', COALESCE(sum(completed_bookings), 0),
      'total_bookings', COALESCE(sum(total_bookings), 0), 'active_staff', COALESCE(sum(active_staff), 0),
      'stock_value_sar', COALESCE(sum(stock_value_sar), 0), 'low_stock_count', COALESCE(sum(low_stock_count), 0))
    INTO v_branches, v_totals FROM rollup r;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES(auth.uid(), 'chain_operations.read', 'provider', p_provider_id,
      jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date));
  RETURN jsonb_build_object('branches', v_branches, 'totals', v_totals);
END;
$$;

DROP POLICY IF EXISTS "Delegated booking reads" ON public.bookings;
CREATE POLICY "Delegated booking reads" ON public.bookings FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.branches b WHERE b.id = bookings.branch_id AND public.can_access_provider_operation(b.provider_id, b.id, 'bookings')));
DROP POLICY IF EXISTS "Delegated booking updates" ON public.bookings;
CREATE POLICY "Delegated booking updates" ON public.bookings FOR UPDATE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.branches b WHERE b.id = bookings.branch_id AND public.can_access_provider_operation(b.provider_id, b.id, 'bookings')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.branches b WHERE b.id = bookings.branch_id AND public.can_access_provider_operation(b.provider_id, b.id, 'bookings')));
DROP POLICY IF EXISTS "Delegated staff reads" ON public.employees;
CREATE POLICY "Delegated staff reads" ON public.employees FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.branches b WHERE b.id = employees.branch_id AND public.can_access_provider_operation(b.provider_id, b.id, 'staff')));
DROP POLICY IF EXISTS "Delegated staff updates" ON public.employees;
CREATE POLICY "Delegated staff updates" ON public.employees FOR UPDATE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.branches b WHERE b.id = employees.branch_id AND public.can_access_provider_operation(b.provider_id, b.id, 'staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.branches b WHERE b.id = employees.branch_id AND public.can_access_provider_operation(b.provider_id, b.id, 'staff')));

CREATE OR REPLACE FUNCTION public.get_admin_supply_overview(
  p_page INTEGER DEFAULT 1, p_page_size INTEGER DEFAULT 20, p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL, p_provider_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_orders JSONB; v_total INTEGER; v_health JSONB; v_providers INTEGER; v_metrics JSONB; v_movements JSONB; v_movement_count INTEGER; v_activity JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'submitted', 'approved', 'received', 'cancelled') THEN RAISE EXCEPTION 'Invalid order status'; END IF;
  WITH filtered AS (
    SELECT o.*, p.business_name_en AS provider_name, b.name_en AS branch_name, s.name AS supplier_name
    FROM public.supplier_purchase_orders o JOIN public.providers p ON p.id = o.provider_id
      LEFT JOIN public.branches b ON b.id = o.branch_id JOIN public.inventory_suppliers s ON s.id = o.supplier_id
    WHERE (p_provider_id IS NULL OR o.provider_id = p_provider_id) AND (p_status IS NULL OR o.status = p_status)
      AND (NULLIF(trim(p_search), '') IS NULL OR concat_ws(' ', p.business_name_en, p.business_name_ar, s.name, o.id::text) ILIKE '%' || p_search || '%')
  ), paged AS (SELECT * FROM filtered ORDER BY created_at DESC, id LIMIT p_page_size OFFSET (p_page - 1) * p_page_size)
  SELECT (SELECT count(*) FROM filtered), COALESCE(jsonb_agg(to_jsonb(x) || jsonb_build_object('items', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('product_name', pr.name_en, 'quantity', i.quantity,
      'unit_cost_sar', i.unit_cost_sar, 'line_total_sar', i.line_total_sar)), '[]')
    FROM public.supplier_purchase_order_items i JOIN public.inventory_products pr ON pr.id = i.product_id WHERE i.purchase_order_id = x.id
  )) ORDER BY created_at DESC, id), '[]') INTO v_total, v_orders FROM paged x;
  WITH health AS (
    SELECT p.id AS provider_id, p.business_name_en AS provider_name,
      (SELECT COALESCE(sum(s.quantity_on_hand * pr.unit_cost_sar), 0) FROM public.branch_inventory_stock s
        JOIN public.inventory_products pr ON pr.id = s.product_id WHERE pr.provider_id = p.id) AS stock_value_sar,
      (SELECT count(*) FROM public.branches b CROSS JOIN public.inventory_products pr
        LEFT JOIN public.branch_inventory_stock s ON s.product_id = pr.id AND s.branch_id = b.id
        WHERE b.provider_id = p.id AND pr.provider_id = p.id AND pr.is_active
          AND COALESCE(s.reorder_point_override, pr.default_reorder_point) > 0
          AND COALESCE(s.quantity_on_hand - s.quantity_reserved, 0) <= COALESCE(s.reorder_point_override, pr.default_reorder_point)) AS low_stock_count,
      (SELECT count(*) FROM public.supplier_purchase_orders WHERE provider_id = p.id AND status IN ('draft', 'submitted', 'approved')) AS pending_orders
    FROM public.providers p WHERE (p_provider_id IS NULL OR p.id = p_provider_id)
      AND (NULLIF(trim(p_search), '') IS NULL OR concat_ws(' ', p.business_name_en, p.business_name_ar) ILIKE '%' || p_search || '%'
        OR EXISTS (SELECT 1 FROM public.inventory_suppliers s WHERE s.provider_id = p.id AND s.name ILIKE '%' || p_search || '%')
        OR EXISTS (SELECT 1 FROM public.supplier_purchase_orders o WHERE o.provider_id = p.id AND o.id::text ILIKE '%' || p_search || '%'))
      AND EXISTS (SELECT 1 FROM public.inventory_products WHERE provider_id = p.id)
  ), paged AS (SELECT * FROM health ORDER BY low_stock_count DESC, provider_id LIMIT p_page_size OFFSET (p_page - 1) * p_page_size)
  SELECT (SELECT count(*) FROM health), COALESCE(jsonb_agg(to_jsonb(h) ORDER BY low_stock_count DESC, provider_id), '[]'),
    (SELECT jsonb_build_object('stock_value_sar', COALESCE(sum(stock_value_sar), 0), 'low_stock_count', COALESCE(sum(low_stock_count), 0),
      'pending_orders', COALESCE(sum(pending_orders), 0)) FROM health) INTO v_providers, v_health, v_metrics FROM paged h;
  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]') INTO v_movements FROM (
    SELECT m.id, p.business_name_en AS provider_name, b.name_en AS branch_name, pr.name_en AS product_name,
      m.movement_type, m.quantity_delta, m.reason, m.created_at
    FROM public.inventory_stock_movements m JOIN public.providers p ON p.id = m.provider_id
      JOIN public.branches b ON b.id = m.branch_id JOIN public.inventory_products pr ON pr.id = m.product_id
    WHERE m.movement_type IN ('waste', 'adjustment') AND m.quantity_delta < 0
      AND m.created_at >= now() - interval '30 days' AND (p_provider_id IS NULL OR m.provider_id = p_provider_id)
      AND (NULLIF(trim(p_search), '') IS NULL OR concat_ws(' ', p.business_name_en, p.business_name_ar, pr.name_en, pr.name_ar) ILIKE '%' || p_search || '%'
        OR EXISTS (SELECT 1 FROM public.inventory_suppliers s WHERE s.provider_id = p.id AND s.name ILIKE '%' || p_search || '%')
        OR EXISTS (SELECT 1 FROM public.supplier_purchase_orders o WHERE o.provider_id = p.id AND o.id::text ILIKE '%' || p_search || '%'))
    ORDER BY m.created_at DESC, m.id LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  ) m;
  SELECT count(*), jsonb_build_object('negative_adjustments', count(*) FILTER (WHERE m.movement_type = 'adjustment'),
      'waste_events', count(*) FILTER (WHERE m.movement_type = 'waste')) INTO v_movement_count, v_activity
    FROM public.inventory_stock_movements m JOIN public.providers p ON p.id = m.provider_id
    JOIN public.inventory_products pr ON pr.id = m.product_id
    WHERE m.movement_type IN ('waste', 'adjustment') AND m.quantity_delta < 0 AND m.created_at >= now() - interval '30 days'
      AND (p_provider_id IS NULL OR m.provider_id = p_provider_id)
      AND (NULLIF(trim(p_search), '') IS NULL OR concat_ws(' ', p.business_name_en, p.business_name_ar, pr.name_en, pr.name_ar) ILIKE '%' || p_search || '%'
        OR EXISTS (SELECT 1 FROM public.inventory_suppliers s WHERE s.provider_id = p.id AND s.name ILIKE '%' || p_search || '%')
        OR EXISTS (SELECT 1 FROM public.supplier_purchase_orders o WHERE o.provider_id = p.id AND o.id::text ILIKE '%' || p_search || '%'));
  v_metrics := v_metrics || v_activity;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES(auth.uid(), 'supply_oversight.read', 'provider', p_provider_id,
      jsonb_build_object('page', p_page, 'status', p_status, 'search', p_search));
  RETURN jsonb_build_object('orders', v_orders, 'total_orders', v_total, 'provider_health', v_health,
    'total_providers', v_providers, 'metrics', v_metrics, 'movements', v_movements, 'total_movements', v_movement_count);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_branch_inventory_stock(UUID, UUID, NUMERIC, TEXT, TEXT, UUID),
  public.transfer_branch_inventory_stock(UUID, UUID, UUID, NUMERIC, TEXT, UUID),
  public.save_provider_operation_membership(UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, UUID, TEXT),
  public.get_provider_operations_context(UUID), public.get_provider_chain_operations(UUID, DATE, DATE),
  public.get_admin_supply_overview(INTEGER, INTEGER, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_branch_inventory_stock(UUID, UUID, NUMERIC, TEXT, TEXT, UUID),
  public.transfer_branch_inventory_stock(UUID, UUID, UUID, NUMERIC, TEXT, UUID),
  public.save_provider_operation_membership(UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, UUID, TEXT),
  public.get_provider_operations_context(UUID), public.get_provider_chain_operations(UUID, DATE, DATE),
  public.get_admin_supply_overview(INTEGER, INTEGER, TEXT, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_purchase_order(UUID, UUID, UUID, TEXT, JSONB),
  public.transition_supplier_purchase_order(UUID, TEXT, TEXT) FROM anon;

CREATE OR REPLACE FUNCTION public.validate_booking_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' AND OLD.customer_id = auth.uid() AND OLD.status IN ('pending_payment', 'confirmed') THEN RETURN NEW; END IF;
  IF ((OLD.status = 'confirmed' AND NEW.status IN ('completed', 'no_show', 'cancelled'))
    OR (OLD.status = 'pending_payment' AND NEW.status = 'cancelled')) AND (
    EXISTS (SELECT 1 FROM public.branches b JOIN public.providers p ON p.id = b.provider_id
      WHERE b.id = OLD.branch_id AND (p.owner_id = auth.uid() OR public.can_access_provider_operation(p.id, b.id, 'bookings')))
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = OLD.employee_id AND e.profile_id = auth.uid() AND e.is_active)
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid booking status transition' USING ERRCODE = '22000';
END;
$$;
REVOKE ALL ON FUNCTION public.validate_booking_status_transition() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_delegated_staff_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.branches b JOIN public.providers p ON p.id = b.provider_id WHERE b.id = OLD.branch_id AND p.owner_id = auth.uid()
  ) AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'Only owners may reassign staff identity or branch' USING ERRCODE = '42501'; END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES(auth.uid(), 'staff.update', 'employee', NEW.id, jsonb_build_object('branch_id', NEW.branch_id, 'is_active', NEW.is_active));
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_delegated_staff_changes BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.guard_delegated_staff_changes();
REVOKE ALL ON FUNCTION public.guard_delegated_staff_changes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_booking_staff(p_booking_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings bk JOIN public.branches b ON b.id = bk.branch_id
    JOIN public.providers p ON p.id = b.provider_id LEFT JOIN public.employees e ON e.id = bk.employee_id
    WHERE bk.id = p_booking_id AND p_user_id = auth.uid() AND (
      p.owner_id = p_user_id OR (e.profile_id = p_user_id AND e.is_active)
      OR public.can_access_provider_operation(p.id, b.id, 'bookings'))
  );
$$;
REVOKE ALL ON FUNCTION public.is_booking_staff(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_booking_staff(UUID, UUID) TO authenticated, service_role;
