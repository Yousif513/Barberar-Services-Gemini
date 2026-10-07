-- Migration: 20261007150100_inventory_moving_average_cost.sql
-- FIX-DBB / C-D21b: stock was valued at the product's CURRENT unit cost, so editing a cost from SAR 10 to SAR 50 turned 100 units
-- worth SAR 1,000 into SAR 5,000. Each branch balance now carries a moving-average cost that changes only when stock arrives
-- (purchase-order receipt at the order line cost, transfer-in at the source average); valuation reads it. Cost edits are audited
-- with before/after and a reason, through set_inventory_product_cost. Stock that exists today is valued once at the current
-- product cost, the only cost on record for it. Functions are patched in place from their latest definition.

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

ALTER TABLE public.branch_inventory_stock ADD COLUMN IF NOT EXISTS average_unit_cost_sar NUMERIC(12,4)
  CHECK (average_unit_cost_sar IS NULL OR average_unit_cost_sar >= 0);

UPDATE public.branch_inventory_stock s
SET average_unit_cost_sar = p.unit_cost_sar
FROM public.inventory_products p
WHERE p.id = s.product_id AND s.average_unit_cost_sar IS NULL;

-- A new balance row starts at the product's current cost (nothing else is known for it yet).
CREATE OR REPLACE FUNCTION public.default_branch_stock_cost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.average_unit_cost_sar IS NULL THEN
    SELECT unit_cost_sar INTO NEW.average_unit_cost_sar FROM public.inventory_products WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.default_branch_stock_cost() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS branch_stock_default_cost ON public.branch_inventory_stock;
CREATE TRIGGER branch_stock_default_cost BEFORE INSERT ON public.branch_inventory_stock
  FOR EACH ROW EXECUTE FUNCTION public.default_branch_stock_cost();

-- Receipt of a purchase order: the average moves to the weighted mean of what was on hand and what arrived at the order cost.
SELECT pg_temp.patch_function('public.transition_supplier_purchase_order(uuid, text, text)'::regprocedure,
  $q$      INSERT INTO public.branch_inventory_stock (branch_id, product_id, quantity_on_hand)
      VALUES (v_order.branch_id, v_item.product_id, v_item.quantity)
      ON CONFLICT (branch_id, product_id)
      DO UPDATE SET
        quantity_on_hand = public.branch_inventory_stock.quantity_on_hand + EXCLUDED.quantity_on_hand,$q$,
  $q$      INSERT INTO public.branch_inventory_stock (branch_id, product_id, quantity_on_hand, average_unit_cost_sar)
      VALUES (v_order.branch_id, v_item.product_id, v_item.quantity, v_item.unit_cost_sar)
      ON CONFLICT (branch_id, product_id)
      DO UPDATE SET
        average_unit_cost_sar = round((public.branch_inventory_stock.quantity_on_hand
            * COALESCE(public.branch_inventory_stock.average_unit_cost_sar, v_item.unit_cost_sar)
            + EXCLUDED.quantity_on_hand * v_item.unit_cost_sar)
          / (public.branch_inventory_stock.quantity_on_hand + EXCLUDED.quantity_on_hand), 4),
        quantity_on_hand = public.branch_inventory_stock.quantity_on_hand + EXCLUDED.quantity_on_hand,$q$);

-- Transfer: the receiving branch takes the source average into its own; the movements record the cost they carried.
SELECT pg_temp.patch_function('public.transfer_branch_inventory_stock(uuid, uuid, uuid, numeric, text, uuid)'::regprocedure,
  $q$  UPDATE public.branch_inventory_stock SET quantity_on_hand = quantity_on_hand +
    CASE WHEN branch_id = p_from_branch_id THEN -p_quantity ELSE p_quantity END, updated_at = now()$q$,
  $q$  UPDATE public.branch_inventory_stock SET
    average_unit_cost_sar = CASE WHEN branch_id = p_to_branch_id
      THEN round((quantity_on_hand * COALESCE(average_unit_cost_sar, v_source.average_unit_cost_sar)
        + p_quantity * v_source.average_unit_cost_sar) / (quantity_on_hand + p_quantity), 4)
      ELSE average_unit_cost_sar END,
    quantity_on_hand = quantity_on_hand +
    CASE WHEN branch_id = p_from_branch_id THEN -p_quantity ELSE p_quantity END, updated_at = now()$q$);
SELECT pg_temp.patch_function('public.transfer_branch_inventory_stock(uuid, uuid, uuid, numeric, text, uuid)'::regprocedure,
  $q$  INSERT INTO public.inventory_stock_movements(provider_id, branch_id, product_id, movement_type, quantity_delta, reason, actor_id)
    VALUES (v_provider, p_from_branch_id, p_product_id, 'transfer_out', -p_quantity, trim(p_reason), auth.uid()),
      (v_provider, p_to_branch_id, p_product_id, 'transfer_in', p_quantity, trim(p_reason), auth.uid());$q$,
  $q$  INSERT INTO public.inventory_stock_movements(provider_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_sar, reason, actor_id)
    VALUES (v_provider, p_from_branch_id, p_product_id, 'transfer_out', -p_quantity, round(v_source.average_unit_cost_sar, 2), trim(p_reason), auth.uid()),
      (v_provider, p_to_branch_id, p_product_id, 'transfer_in', p_quantity, round(v_source.average_unit_cost_sar, 2), trim(p_reason), auth.uid());$q$);

-- Adjustments and waste are valued at the average cost of the stock they remove or add.
SELECT pg_temp.patch_function('public.adjust_branch_inventory_stock(uuid, uuid, numeric, text, text, uuid)'::regprocedure,
  $q$  INSERT INTO public.inventory_stock_movements(provider_id, branch_id, product_id, movement_type, quantity_delta, reason, actor_id)
    VALUES (v_provider, p_branch_id, p_product_id, p_movement_type, p_quantity_delta, trim(p_reason), auth.uid());$q$,
  $q$  INSERT INTO public.inventory_stock_movements(provider_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_sar, reason, actor_id)
    VALUES (v_provider, p_branch_id, p_product_id, p_movement_type, p_quantity_delta, round(v_stock.average_unit_cost_sar, 2), trim(p_reason), auth.uid());$q$);

-- Valuation reads the recorded average, never the product's current cost.
SELECT pg_temp.patch_function('public.get_admin_supply_overview(integer, integer, text, text, uuid)'::regprocedure,
  $q$sum(s.quantity_on_hand * pr.unit_cost_sar)$q$,
  $q$sum(s.quantity_on_hand * COALESCE(s.average_unit_cost_sar, pr.unit_cost_sar))$q$);
SELECT pg_temp.patch_function('public.get_provider_chain_operations(uuid, date, date)'::regprocedure,
  $q$sum(s.quantity_on_hand * p.unit_cost_sar)$q$,
  $q$sum(s.quantity_on_hand * COALESCE(s.average_unit_cost_sar, p.unit_cost_sar))$q$);

-- Cost edits: one log row with before, after and the reason. The command supplies the reason; a direct edit is logged without one.
CREATE OR REPLACE FUNCTION public.audit_inventory_cost_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason TEXT := NULLIF(current_setting('primora.cost_change_reason', true), '');
BEGIN
  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'inventory_products.cost_change', 'inventory_products', NEW.id,
    jsonb_build_object('provider_id', NEW.provider_id, 'before', OLD.unit_cost_sar, 'after', NEW.unit_cost_sar,
      'reason', v_reason, 'via', CASE WHEN v_reason IS NULL THEN 'direct_update' ELSE 'command' END));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_inventory_cost_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_inventory_product_cost ON public.inventory_products;
CREATE TRIGGER audit_inventory_product_cost AFTER UPDATE OF unit_cost_sar ON public.inventory_products
  FOR EACH ROW WHEN (OLD.unit_cost_sar IS DISTINCT FROM NEW.unit_cost_sar) EXECUTE FUNCTION public.audit_inventory_cost_change();

CREATE OR REPLACE FUNCTION public.set_inventory_product_cost(p_product_id UUID, p_unit_cost_sar NUMERIC, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product public.inventory_products;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_product FROM public.inventory_products WHERE id = p_product_id FOR UPDATE;
  IF v_product.id IS NULL OR NOT COALESCE(public.can_access_provider_wide(v_product.provider_id, 'inventory'), FALSE) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002'; END IF;
  IF p_unit_cost_sar IS NULL OR p_unit_cost_sar < 0 OR p_unit_cost_sar::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_unit_cost_sar <> round(p_unit_cost_sar, 2) OR p_unit_cost_sar >= 100000000
    OR p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A cost with at most two decimals and a reason of at least 3 characters are required' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('primora.cost_change_reason', trim(p_reason), true);
  UPDATE public.inventory_products SET unit_cost_sar = p_unit_cost_sar, updated_at = now() WHERE id = p_product_id;
  PERFORM set_config('primora.cost_change_reason', '', true);
  RETURN jsonb_build_object('id', p_product_id, 'unit_cost_sar', p_unit_cost_sar);
END;
$$;
REVOKE ALL ON FUNCTION public.set_inventory_product_cost(UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_inventory_product_cost(UUID, NUMERIC, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
