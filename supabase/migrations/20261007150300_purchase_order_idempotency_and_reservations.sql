-- Migration: 20261007150300_purchase_order_idempotency_and_reservations.sql
-- FIX-DBB / C-D27:
--  1. create_supplier_purchase_order made two draft orders for two identical calls. It now takes an optional request id and keeps a
--     receipt like the stock commands (same id and same content: the first result again; same id, other content: 22023). A caller
--     that sends no id (the current screen) is de-duplicated by the content of the order, per person, inside a 10 minute window.
--  2. A product listed twice in one order returned the raw unique-key error; the lines are merged (quantities added when the unit
--     cost is the same, 22023 when the same product comes with two costs).
--  3. A delegate could cancel an order the owner had approved; cancelling an APPROVED order now needs the owner or an administrator.
--  4. quantity_reserved was never written; reserve_inventory_stock / release_inventory_stock now write it (with receipts and audit),
--     so the existing "reserved within on hand" check and the unreserved-stock rules mean something.
-- Functions are patched in place from their latest definition; the order command gains a defaulted parameter, so the old overload is
-- replaced (it keeps the same privileges) and callers with five arguments keep working.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

-- Several patches, then a new signature: the replacement inherits the privileges of the function it replaces and the old overload goes.
DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
CREATE FUNCTION pg_temp.evolve_function(p_old regprocedure, p_new_signature text, p_from text[], p_to text[]) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_old), v_crlf, chr(10));
  v_new regprocedure;
  v_grantee text;
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], v_crlf, chr(10)) IN v_def) = 0 THEN
      RAISE EXCEPTION 'evolve_function: pattern % not found in %', i, p_old;
    END IF;
    v_def := replace(v_def, replace(p_from[i], v_crlf, chr(10)), replace(p_to[i], v_crlf, chr(10)));
  END LOOP;
  EXECUTE v_def;
  v_new := to_regprocedure(p_new_signature);
  IF v_new IS NULL THEN RAISE EXCEPTION 'evolve_function: % was not created', p_new_signature; END IF;
  IF v_new <> p_old THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_new);
    FOR v_grantee IN
      SELECT DISTINCT r.rolname
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE p.oid = p_old::oid AND a.privilege_type = 'EXECUTE' AND r.rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_new, v_grantee);
    END LOOP;
    EXECUTE format('DROP FUNCTION %s', p_old);
  END IF;
END $helper$;

SELECT pg_temp.evolve_function(
  'public.create_supplier_purchase_order(uuid, uuid, uuid, text, jsonb)'::regprocedure,
  'public.create_supplier_purchase_order(uuid, uuid, uuid, text, jsonb, uuid)',
  ARRAY[
    $q$p_items jsonb)
 RETURNS jsonb$q$,
    $q$  v_unit_cost NUMERIC(10,2);$q$,
    $q$  INSERT INTO public.supplier_purchase_orders ($q$,
    $q$    VALUES (
      v_order_id,
      v_product.id,
      v_quantity,
      v_unit_cost
    );$q$,
    $q$    v_total := v_total + round((v_quantity * v_unit_cost)::numeric, 2);$q$,
    $q$  UPDATE public.supplier_purchase_orders
  SET subtotal_sar = v_total,$q$,
    $q$  RETURN jsonb_build_object('id', v_order_id, 'status', 'draft', 'subtotal_sar', v_total);$q$
  ],
  ARRAY[
    $q$p_items jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb$q$,
    $q$  v_unit_cost NUMERIC(10,2);
  v_request UUID;
  v_payload JSONB;
  v_receipt public.inventory_command_receipts;
  v_result JSONB;$q$,
    $q$  -- Replay: the same request id (or, without one, the same order content from the same person within 10 minutes) returns the first result.
  v_payload := jsonb_build_object('command', 'create_purchase_order', 'provider', p_provider_id, 'branch', p_branch_id,
    'supplier', p_supplier_id, 'notes', trim(COALESCE(p_notes, '')),
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('product', i ->> 'product_id', 'quantity', i ->> 'quantity', 'unit', i ->> 'unit_cost_sar')
        ORDER BY i ->> 'product_id', i ->> 'quantity', i ->> 'unit_cost_sar'), '[]'::jsonb) FROM jsonb_array_elements(p_items) i));
  v_request := COALESCE(p_request_id,
    md5(v_user_id::text || v_payload::text || floor(extract(epoch FROM now()) / 600)::text)::uuid);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_request::text, 0));
  SELECT * INTO v_receipt FROM public.inventory_command_receipts WHERE request_id = v_request;
  IF FOUND THEN
    IF v_receipt.actor_id <> v_user_id OR v_receipt.payload <> v_payload THEN
      RAISE EXCEPTION 'Request id already used for another command' USING ERRCODE = '22023';
    END IF;
    RETURN v_receipt.result;
  END IF;

  INSERT INTO public.supplier_purchase_orders ($q$,
    $q$    VALUES (v_order_id, v_product.id, v_quantity, v_unit_cost)
    ON CONFLICT (purchase_order_id, product_id) DO UPDATE
      SET quantity = public.supplier_purchase_order_items.quantity + EXCLUDED.quantity
      WHERE public.supplier_purchase_order_items.unit_cost_sar = EXCLUDED.unit_cost_sar;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The same product appears twice with different unit costs.' USING ERRCODE = '22023';
    END IF;$q$,
    $q$    -- the order total is summed from the merged lines after the loop$q$,
    $q$  SELECT COALESCE(sum(line_total_sar), 0) INTO v_total
  FROM public.supplier_purchase_order_items WHERE purchase_order_id = v_order_id;

  UPDATE public.supplier_purchase_orders
  SET subtotal_sar = v_total,$q$,
    $q$  v_result := jsonb_build_object('id', v_order_id, 'status', 'draft', 'subtotal_sar', v_total, 'request_id', v_request);
  INSERT INTO public.inventory_command_receipts VALUES (v_request, v_user_id, v_payload, v_result, now());
  RETURN v_result;$q$
  ]);

-- An approved order is the owner's decision: a delegate may cancel drafts and submitted orders only.
SELECT pg_temp.patch_function('public.transition_supplier_purchase_order(uuid, text, text)'::regprocedure,
  $q$    v_next_status := 'cancelled';$q$,
  $q$    IF v_order.status = 'approved' AND NOT public.is_admin() AND NOT EXISTS (
      SELECT 1 FROM public.providers WHERE id = v_order.provider_id AND owner_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Only the provider owner or administrator can cancel an approved order.' USING ERRCODE = '42501';
    END IF;
    v_next_status := 'cancelled';$q$);

-- Reservations: the only writers of quantity_reserved.
CREATE OR REPLACE FUNCTION public.reserve_inventory_stock(p_branch_id UUID, p_product_id UUID, p_quantity NUMERIC, p_reason TEXT, p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID; v_active BOOLEAN; v_stock public.branch_inventory_stock; v_payload JSONB;
  v_receipt public.inventory_command_receipts; v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT b.provider_id, p.is_active INTO v_provider, v_active FROM public.branches b JOIN public.inventory_products p
    ON p.provider_id = b.provider_id WHERE b.id = p_branch_id AND p.id = p_product_id;
  IF NOT COALESCE(public.can_manage_provider_operations(v_provider, p_branch_id), FALSE) THEN
    RAISE EXCEPTION 'Forbidden inventory scope' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_quantity <> round(p_quantity, 3) OR p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Valid quantity, reason and request id required' USING ERRCODE = '22023'; END IF;
  IF v_active IS FALSE THEN RAISE EXCEPTION 'Product is inactive: stock cannot be reserved' USING ERRCODE = '22023'; END IF;
  v_payload := jsonb_build_object('command', 'reserve', 'branch', p_branch_id, 'product', p_product_id,
    'quantity', p_quantity, 'reason', trim(p_reason));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_receipt FROM public.inventory_command_receipts WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_receipt.actor_id <> auth.uid() OR v_receipt.payload <> v_payload THEN
      RAISE EXCEPTION 'Request id already used for another command' USING ERRCODE = '22023'; END IF;
    RETURN v_receipt.result;
  END IF;
  SELECT * INTO v_stock FROM public.branch_inventory_stock WHERE branch_id = p_branch_id AND product_id = p_product_id FOR UPDATE;
  IF v_stock.id IS NULL OR v_stock.quantity_on_hand - v_stock.quantity_reserved < p_quantity THEN
    RAISE EXCEPTION 'Insufficient unreserved stock' USING ERRCODE = '22023'; END IF;
  UPDATE public.branch_inventory_stock SET quantity_reserved = quantity_reserved + p_quantity, updated_at = now() WHERE id = v_stock.id;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'inventory.reserve', 'branch_inventory_stock', v_stock.id,
      v_payload || jsonb_build_object('request_id', p_request_id, 'before', v_stock.quantity_reserved, 'after', v_stock.quantity_reserved + p_quantity));
  v_result := jsonb_build_object('quantity_reserved', v_stock.quantity_reserved + p_quantity, 'request_id', p_request_id);
  INSERT INTO public.inventory_command_receipts VALUES (p_request_id, auth.uid(), v_payload, v_result, now());
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_inventory_stock(p_branch_id UUID, p_product_id UUID, p_quantity NUMERIC, p_reason TEXT, p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID; v_stock public.branch_inventory_stock; v_payload JSONB;
  v_receipt public.inventory_command_receipts; v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT b.provider_id INTO v_provider FROM public.branches b JOIN public.inventory_products p
    ON p.provider_id = b.provider_id WHERE b.id = p_branch_id AND p.id = p_product_id;
  IF NOT COALESCE(public.can_manage_provider_operations(v_provider, p_branch_id), FALSE) THEN
    RAISE EXCEPTION 'Forbidden inventory scope' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_quantity <> round(p_quantity, 3) OR p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Valid quantity, reason and request id required' USING ERRCODE = '22023'; END IF;
  v_payload := jsonb_build_object('command', 'release', 'branch', p_branch_id, 'product', p_product_id,
    'quantity', p_quantity, 'reason', trim(p_reason));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_receipt FROM public.inventory_command_receipts WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_receipt.actor_id <> auth.uid() OR v_receipt.payload <> v_payload THEN
      RAISE EXCEPTION 'Request id already used for another command' USING ERRCODE = '22023'; END IF;
    RETURN v_receipt.result;
  END IF;
  SELECT * INTO v_stock FROM public.branch_inventory_stock WHERE branch_id = p_branch_id AND product_id = p_product_id FOR UPDATE;
  IF v_stock.id IS NULL OR v_stock.quantity_reserved < p_quantity THEN
    RAISE EXCEPTION 'Cannot release more than is reserved' USING ERRCODE = '22023'; END IF;
  UPDATE public.branch_inventory_stock SET quantity_reserved = quantity_reserved - p_quantity, updated_at = now() WHERE id = v_stock.id;
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'inventory.release', 'branch_inventory_stock', v_stock.id,
      v_payload || jsonb_build_object('request_id', p_request_id, 'before', v_stock.quantity_reserved, 'after', v_stock.quantity_reserved - p_quantity));
  v_result := jsonb_build_object('quantity_reserved', v_stock.quantity_reserved - p_quantity, 'request_id', p_request_id);
  INSERT INTO public.inventory_command_receipts VALUES (p_request_id, auth.uid(), v_payload, v_result, now());
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_inventory_stock(UUID, UUID, NUMERIC, TEXT, UUID),
  public.release_inventory_stock(UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_inventory_stock(UUID, UUID, NUMERIC, TEXT, UUID),
  public.release_inventory_stock(UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
