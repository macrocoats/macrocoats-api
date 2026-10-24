-- Closes Supabase's Data API (PostgREST / GraphQL) over the portal's tables.
-- The portal API is the only client of this database and connects as `postgres`
-- (the table owner, which RLS does not apply to), so nothing here affects it.
--
-- Idempotent — safe to run any number of times. Runs:
--   * after every `db:migrate` on deploy when database_mode=supabase (ansible app role),
--     so tables added by later migrations are covered too
--   * by scripts/cutover-to-supabase.sh right after the data copy
\set ON_ERROR_STOP on

-- Tables/sequences/functions created by postgres from now on get no anon/authenticated grants
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ...and none on what already exists
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- RLS with no policies: even a grant added by mistake later exposes no rows
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END $$;

-- Fail loudly if anything is still reachable
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
  IF n > 0 THEN RAISE EXCEPTION 'lockdown failed: % anon/authenticated table grants remain in public', n; END IF;

  SELECT count(*) INTO n FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  IF n > 0 THEN RAISE EXCEPTION 'lockdown failed: % public tables without RLS', n; END IF;
END $$;
