-- Migration: 20261007150000_inventory_audit_allow_list.sql
-- FIX-DBB / C-D29: audit_inventory_catalog logged whole rows, so a supplier's contact phone and e-mail were copied into
-- admin_audit_logs. It now logs only an allow-list of columns per table, plus the NAMES (never the values) of every other
-- column that changed. The function is patched in place from its latest definition.

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

-- The columns of each catalogue table whose values are safe to keep in the log (identifiers, state, money, units, product names).
CREATE OR REPLACE FUNCTION public.inventory_audit_values(p_table TEXT, p_row JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  FROM jsonb_each(COALESCE(p_row, '{}'::jsonb)) e
  WHERE e.key = ANY (CASE p_table
    WHEN 'inventory_suppliers' THEN ARRAY['id', 'provider_id', 'status']
    WHEN 'inventory_products' THEN ARRAY['id', 'provider_id', 'supplier_id', 'sku', 'name_en', 'name_ar', 'category', 'unit',
      'unit_cost_sar', 'retail_price_sar', 'default_reorder_point', 'is_active']
    ELSE ARRAY['id', 'provider_id'] END);
$$;

-- Names of the columns whose value differs between two rows (no values), so the log still shows that a contact detail changed.
CREATE OR REPLACE FUNCTION public.inventory_changed_columns(p_old JSONB, p_new JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb)
  FROM (SELECT key AS k FROM jsonb_object_keys(COALESCE(p_old, '{}'::jsonb) || COALESCE(p_new, '{}'::jsonb)) AS key) keys
  WHERE k NOT IN ('updated_at', 'created_at')
    AND (COALESCE(p_old, '{}'::jsonb) -> k) IS DISTINCT FROM (COALESCE(p_new, '{}'::jsonb) -> k);
$$;
REVOKE ALL ON FUNCTION public.inventory_audit_values(TEXT, JSONB), public.inventory_changed_columns(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.audit_inventory_catalog()'::regprocedure,
  $q$'before', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, 'after', to_jsonb(NEW)));$q$,
  $q$'before', CASE WHEN TG_OP = 'UPDATE' THEN public.inventory_audit_values(TG_TABLE_NAME, to_jsonb(OLD)) ELSE NULL END,
      'after', public.inventory_audit_values(TG_TABLE_NAME, to_jsonb(NEW)),
      'changed_columns', public.inventory_changed_columns(CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END, to_jsonb(NEW))));$q$);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
