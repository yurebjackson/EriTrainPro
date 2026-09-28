-- Instalar antes de publicar o cadastro. Contas existentes continuam aprovadas.
begin;
alter table public.profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending','approved','rejected'));

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active is not false);
$$;
create or replace function public.account_approved() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved' and active is not false);
$$;
revoke all on function public.account_approved() from public;
grant execute on function public.account_approved() to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,name,email,role,approval_status)
 values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),new.email,'Usuário'),new.email,
   case when new.raw_user_meta_data->>'role'='aluno' then 'aluno' else 'professor' end,
   case when new.raw_user_meta_data->>'role'='aluno' then 'approved' else 'pending' end);
 return new;
end;
$$;

-- Um usuário pode editar seus dados pessoais, nunca campos administrativos.
create or replace function public.guard_profile_fields() returns trigger language plpgsql set search_path = '' as $$
begin
 if current_user in ('anon','authenticated') and not public.is_admin() then
   if (to_jsonb(new) - array['name','specialty','cref','phone','bio','avatar_url','first_access'])
      is distinct from (to_jsonb(old) - array['name','specialty','cref','phone','bio','avatar_url','first_access']) then
     raise exception 'Campos administrativos protegidos';
   end if;
 end if;
 return new;
end;
$$;
drop trigger if exists guard_profile_fields on public.profiles;
create trigger guard_profile_fields before update on public.profiles for each row execute function public.guard_profile_fields();
drop policy if exists profiles_insert on public.profiles;
revoke insert,delete,truncate,references,trigger on public.profiles from anon,authenticated;

-- Restringe todas as políticas existentes: pendentes não acessam dados de treino.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename <> 'profiles' loop
   execute format('alter table public.%I enable row level security',t);
   execute format('drop policy if exists approval_gate on public.%I',t);
   execute format('create policy approval_gate on public.%I as restrictive for all to authenticated using (public.account_approved()) with check (public.account_approved())',t);
   execute format('revoke truncate,references,trigger on public.%I from anon,authenticated',t);
 end loop;
end $$;

-- Mesmo escolhendo aluno no signup não se obtêm permissões de professor.
drop policy if exists students_professor on public.students;
create policy students_professor on public.students for all to authenticated
 using (professor_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='professor'))
 with check (professor_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='professor'));

-- Leitura do aluno é preservada; escrita de planos/exercícios exige professor.
do $$ declare t text; op text; begin
 foreach t in array array['plans','plan_days','plan_exercises','exercises','scheduled_assessments','assessments'] loop
   foreach op in array array['insert','update','delete'] loop
     execute format('drop policy if exists %I on public.%I','teacher_'||op,t);
     execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
       'teacher_'||op,t,op,
       case when op='insert' then 'with check (exists(select 1 from public.profiles where id=auth.uid() and role in (''professor'',''admin'')))'
       when op='delete' then 'using (exists(select 1 from public.profiles where id=auth.uid() and role in (''professor'',''admin'')))'
       else 'using (exists(select 1 from public.profiles where id=auth.uid() and role in (''professor'',''admin''))) with check (exists(select 1 from public.profiles where id=auth.uid() and role in (''professor'',''admin'')))' end);
   end loop;
 end loop;
end $$;

create or replace function public.review_professor(p_id uuid,p_decision text,p_plan text default 'basic')
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Acesso exclusivo do administrador ativo'; end if;
 if p_decision not in ('approved','rejected') or p_decision is null then raise exception 'Decisão inválida'; end if;
 if p_plan not in ('basic','pro','unlimited') or p_plan is null then raise exception 'Plano inválido'; end if;
 perform 1 from public.profiles where id=p_id and role='professor' and approval_status='pending' for update;
 if not found then raise exception 'Solicitação já analisada ou indisponível'; end if;
 if p_decision='approved' and not exists(select 1 from auth.users where id=p_id and email_confirmed_at is not null) then
   raise exception 'O professor precisa confirmar o e-mail primeiro';
 end if;
 update public.profiles set approval_status=p_decision,plan_type=p_plan,active=(p_decision='approved') where id=p_id;
end;
$$;
revoke all on function public.review_professor(uuid,text,text) from public,anon;
grant execute on function public.review_professor(uuid,text,text) to authenticated;
revoke all on function public.handle_new_user(), public.guard_profile_fields() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
