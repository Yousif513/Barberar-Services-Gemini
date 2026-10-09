-- P-12 (privacy review 2026-10-08): only whole words were reserved, so 'primora-official' or 'admin-support' were accepted as professional handles
-- (impersonation of the platform or its staff). Reserved patterns now catch a reserved word anywhere in the handle: 'substring' patterns match inside
-- any part ('primora' blocks 'primoraofficial', 'the-primora-team'), 'token' patterns match a whole hyphen-separated part ('admin' blocks
-- 'admin-support' but not 'badminton-coach'). A new pattern is one INSERT. Administrators change handles through admin_change_professional_handle.
--
-- Handle existence for anonymous callers: professional_handle_available and professional_handle_problem have no anon privilege, and
-- public_professional_profile answers NULL for an unknown, unpublished or hidden handle alike (checked in the tests). A signed-in professional choosing a
-- handle does learn that one is taken: that is what choosing a handle is.
CREATE TABLE IF NOT EXISTS public.professional_reserved_handle_patterns (
  pattern TEXT PRIMARY KEY,
  match_kind TEXT NOT NULL DEFAULT 'token',
  reason TEXT NOT NULL DEFAULT 'impersonation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT professional_reserved_pattern_shape CHECK (pattern ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT professional_reserved_pattern_kind CHECK (match_kind IN ('token', 'substring'))
);
ALTER TABLE public.professional_reserved_handle_patterns ENABLE ROW LEVEL SECURITY;

INSERT INTO public.professional_reserved_handle_patterns (pattern, match_kind, reason) VALUES
  ('primora', 'substring', 'brand'),
  ('official', 'token', 'impersonation'), ('admin', 'token', 'impersonation'), ('administrator', 'token', 'impersonation'),
  ('moderator', 'token', 'impersonation'), ('support', 'token', 'impersonation'), ('staff', 'token', 'impersonation'),
  ('verified', 'token', 'impersonation'), ('security', 'token', 'impersonation'), ('billing', 'token', 'impersonation'),
  ('payments', 'token', 'impersonation'), ('refunds', 'token', 'impersonation')
ON CONFLICT (pattern) DO NOTHING;

SELECT public.grant_data_api_access('public.professional_reserved_handle_patterns');
SELECT public.attach_admin_audit_trigger('public.professional_reserved_handle_patterns');

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.professional_handle_problem(text, uuid)'::regprocedure,
$from$  IF EXISTS (SELECT 1 FROM public.professional_reserved_handles WHERE handle = p_handle) THEN RETURN 'reserved'; END IF;$from$,
$to$  IF EXISTS (SELECT 1 FROM public.professional_reserved_handles WHERE handle = p_handle) THEN RETURN 'reserved'; END IF;
  IF EXISTS (SELECT 1 FROM public.professional_reserved_handle_patterns r
              WHERE (r.match_kind = 'substring' AND position(r.pattern IN p_handle) > 0)
                 OR (r.match_kind = 'token' AND ('-' || p_handle || '-') LIKE ('%-' || r.pattern || '-%'))) THEN RETURN 'reserved'; END IF;$to$);
