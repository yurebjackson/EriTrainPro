-- Diagnóstico somente leitura: não retorna contas, senhas ou chaves.
-- Execute inteiro no SQL Editor e copie o valor da coluna diagnostico.
select jsonb_pretty(jsonb_build_object(
  'columns', (select jsonb_agg(to_jsonb(c)) from (
    select table_name, column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns where table_schema = 'public'
    order by table_name, ordinal_position
  ) c),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname = 'public'),
  'rls', (select jsonb_agg(jsonb_build_object('table', c.relname, 'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')),
  'triggers', (select jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'table', c.relname,
    'trigger', pg_get_triggerdef(t.oid), 'function', pg_get_functiondef(t.tgfoid)))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and ((n.nspname = 'auth' and c.relname = 'users') or n.nspname = 'public')),
  'constraints', (select jsonb_agg(jsonb_build_object('table', c.relname, 'definition', pg_get_constraintdef(k.oid)))
    from pg_constraint k join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'),
  'functions', (select jsonb_agg(jsonb_build_object('name', p.proname, 'definition', pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
  'grants', (select jsonb_agg(to_jsonb(g)) from (
    select grantee, table_name, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon','authenticated')
  ) g)
)) as diagnostico;
