-- Migration: 20261007150200_inventory_inactive_products.sql
-- FIX-DBB / C-D22: a deactivated product stranded its remaining stock, because adjust_branch_inventory_stock and
-- transfer_branch_inventory_stock joined only ACTIVE products and answered "Forbidden inventory scope" for waste or a transfer, while the
-- stock still counted in valuation. Now: waste, negative adjustments and transfers work on an inactive product; a positive adjustment
-- is refused with its own message ("Product is inactive"); and a product cannot be deactivated while a draft, submitted or approved
-- purchase order still lists it. Functions are patched in place from their latest definition.

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

SELECT pg_temp.patch_function('public.adjust_branch_inventory_stock(uuid, uuid, numeric, text, text, uuid)'::regprocedure,
  $q$DECLARE v_provider UUID; v_stock public.branch_inventory_stock;$q$,
  $q$DECLARE v_active BOOLEAN; v_provider UUID; v_stock public.branch_inventory_stock;$q$);
SELECT pg_temp.patch_function('public.adjust_branch_inventory_stock(uuid, uuid, numeric, text, text, uuid)'::regprocedure,
  $q$  SELECT b.provider_id INTO v_provider FROM public.branches b JOIN public.inventory_products p
    ON p.provider_id = b.provider_id WHERE b.id = p_branch_id AND p.id = p_product_id AND p.is_active;$q$,
  $q$  SELECT b.provider_id, p.is_active INTO v_provider, v_active FROM public.branches b JOIN public.inventory_products p
    ON p.provider_id = b.provider_id WHERE b.id = p_branch_id AND p.id = p_product_id;$q$);
SELECT pg_temp.patch_function('public.adjust_branch_inventory_stock(uuid, uuid, numeric, text, text, uuid)'::regprocedure,
  $q$  v_payload := jsonb_build_object('command', 'adjust',$q$,
  $q$  IF v_active IS FALSE AND p_quantity_delta > 0 THEN
    RAISE EXCEPTION 'Product is inactive: only waste, negative adjustments and transfers are allowed for its remaining stock' USING ERRCODE = '22023'; END IF;
  v_payload := jsonb_build_object('command', 'adjust',$q$);

SELECT pg_temp.patch_function('public.transfer_branch_inventory_stock(uuid, uuid, uuid, numeric, text, uuid)'::regprocedure,
  $q$ON p.provider_id = b.provider_id WHERE b.id = p_from_branch_id AND p.id = p_product_id AND p.is_active;$q$,
  $q$ON p.provider_id = b.provider_id WHERE b.id = p_from_branch_id AND p.id = p_product_id;$q$);

CREATE OR REPLACE FUNCTION public.refuse_deactivating_ordered_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
    SELECT 1 FROM public.supplier_purchase_order_items i JOIN public.supplier_purchase_orders o ON o.id = i.purchase_order_id
    WHERE i.product_id = NEW.id AND o.status IN ('draft', 'submitted', 'approved')) THEN
    RAISE EXCEPTION 'Product has open purchase orders: cancel or receive them before deactivating it' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_deactivating_ordered_product() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS refuse_deactivating_ordered_product ON public.inventory_products;
CREATE TRIGGER refuse_deactivating_ordered_product BEFORE UPDATE OF is_active ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.refuse_deactivating_ordered_product();

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
