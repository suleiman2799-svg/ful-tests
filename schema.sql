-- =====================================================================
-- FUL Online Tests: database schema
-- Run this whole file once in Supabase: SQL Editor > New query > Run
-- =====================================================================

-- ---------- TABLES ----------------------------------------------------

create table if not exists public.tests (
  id                 uuid primary key default gen_random_uuid(),
  lecturer_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug               text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  access_code        text not null,
  title              text not null,
  course_code        text,
  instructions       text,
  duration_minutes   int  not null check (duration_minutes between 1 and 600),
  opens_at           timestamptz,
  closes_at          timestamptz,
  shuffle_questions  boolean not null default true,
  shuffle_options    boolean not null default true,
  warn_before_submit boolean not null default false,
  one_attempt        boolean not null default true,
  release_mode       text not null default 'instant' check (release_mode in ('instant', 'manual')),
  scores_released    boolean not null default false,
  notify_email       text,
  created_at         timestamptz not null default now()
);

create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid not null references public.tests(id) on delete cascade,
  position      int  not null default 0,
  text          text not null,
  image_url     text,
  options       jsonb not null,
  correct_index int  not null,
  created_at    timestamptz not null default now()
);
create index if not exists questions_test_idx on public.questions(test_id);

create table if not exists public.question_bank (
  id            uuid primary key default gen_random_uuid(),
  lecturer_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text          text not null,
  image_url     text,
  options       jsonb not null,
  correct_index int  not null,
  tag           text,
  created_at    timestamptz not null default now()
);

create table if not exists public.attempts (
  id             uuid primary key default gen_random_uuid(),
  token          uuid not null default gen_random_uuid(),
  test_id        uuid not null references public.tests(id) on delete cascade,
  student_name   text not null,
  matric         text not null,
  department     text not null,
  email          text not null,
  started_at     timestamptz not null default now(),
  deadline_at    timestamptz not null,
  submitted_at   timestamptz,
  submit_reason  text,  -- manual | timeup | left | fullscreen | expired
  layout         jsonb not null,
  answers        jsonb not null default '{}'::jsonb,
  violations     int not null default 0,
  score          int,
  total          int,
  percentage     numeric(5,2),
  email_sent     boolean not null default false,
  score_emailed  boolean not null default false
);
create index if not exists attempts_test_idx on public.attempts(test_id);

-- ---------- ROW LEVEL SECURITY ---------------------------------------
-- Students never touch tables directly. They only use the functions below,
-- so the answer key can never be read from a browser.

alter table public.tests         enable row level security;
alter table public.questions     enable row level security;
alter table public.question_bank enable row level security;
alter table public.attempts      enable row level security;

drop policy if exists tests_owner on public.tests;
create policy tests_owner on public.tests for all to authenticated
  using (lecturer_id = (select auth.uid()))
  with check (lecturer_id = (select auth.uid()));

drop policy if exists questions_owner on public.questions;
create policy questions_owner on public.questions for all to authenticated
  using (exists (select 1 from public.tests t where t.id = test_id and t.lecturer_id = (select auth.uid())))
  with check (exists (select 1 from public.tests t where t.id = test_id and t.lecturer_id = (select auth.uid())));

drop policy if exists bank_owner on public.question_bank;
create policy bank_owner on public.question_bank for all to authenticated
  using (lecturer_id = (select auth.uid()))
  with check (lecturer_id = (select auth.uid()));

drop policy if exists attempts_read on public.attempts;
create policy attempts_read on public.attempts for select to authenticated
  using (exists (select 1 from public.tests t where t.id = test_id and t.lecturer_id = (select auth.uid())));

drop policy if exists attempts_delete on public.attempts;
create policy attempts_delete on public.attempts for delete to authenticated
  using (exists (select 1 from public.tests t where t.id = test_id and t.lecturer_id = (select auth.uid())));

-- ---------- STORAGE (question images) ---------------------------------

insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

drop policy if exists "lecturers upload question images" on storage.objects;
create policy "lecturers upload question images" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "lecturers delete question images" on storage.objects;
create policy "lecturers delete question images" on storage.objects for delete to authenticated
  using (bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- INTERNAL HELPERS (not callable from the browser) ----------

create or replace function public.attempt_result(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.attempts; t public.tests; vis boolean;
begin
  select * into a from public.attempts where id = p_id;
  select * into t from public.tests where id = a.test_id;
  vis := (t.release_mode = 'instant' or t.scores_released);
  return jsonb_build_object(
    'submitted',  a.submitted_at is not null,
    'reason',     a.submit_reason,
    'released',   vis,
    'score',      case when vis then a.score end,
    'total',      a.total,
    'percentage', case when vis then a.percentage end
  );
end $$;

create or replace function public.attempt_payload(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.attempts; t public.tests; paper jsonb;
begin
  select * into a from public.attempts where id = p_id;
  select * into t from public.tests where id = a.test_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', q.id,
             'text', q.text,
             'image_url', q.image_url,
             'options', (
               select jsonb_agg(q.options -> (o.val)::int order by o.ord)
               from jsonb_array_elements_text(l.elem -> 'o') with ordinality as o(val, ord)
             )
           ) order by l.ord
         ), '[]'::jsonb)
    into paper
    from jsonb_array_elements(a.layout) with ordinality as l(elem, ord)
    join public.questions q on q.id = (l.elem ->> 'q')::uuid;

  return jsonb_build_object(
    'attempt_id',         a.id,
    'token',              a.token,
    'title',              t.title,
    'course_code',        t.course_code,
    'student_name',       a.student_name,
    'email',              a.email,
    'paper',              paper,
    'answers',            a.answers,
    'deadline_at',        a.deadline_at,
    'server_now',         now(),
    'duration_minutes',   t.duration_minutes,
    'warn_before_submit', t.warn_before_submit,
    'violations',         a.violations,
    'submitted',          a.submitted_at is not null,
    'result',             case when a.submitted_at is not null then public.attempt_result(a.id) end
  );
end $$;

-- Grades an attempt on the server. Idempotent: a submitted attempt is never re-graded.
create or replace function public.grade_attempt(p_id uuid, p_answers jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attempts; sc int := 0; tot int := 0; r record; pick int; ans jsonb;
begin
  select * into a from public.attempts where id = p_id for update;
  if not found or a.submitted_at is not null then return; end if;

  ans := case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end;

  for r in
    select (l.elem ->> 'q')::uuid as qid, l.elem -> 'o' as perm, q.correct_index
      from jsonb_array_elements(a.layout) as l(elem)
      join public.questions q on q.id = (l.elem ->> 'q')::uuid
  loop
    tot := tot + 1;
    if (ans ->> r.qid::text) ~ '^[0-9]+$' then
      pick := (ans ->> r.qid::text)::int;
      if pick < jsonb_array_length(r.perm) and (r.perm ->> pick)::int = r.correct_index then
        sc := sc + 1;
      end if;
    end if;
  end loop;

  update public.attempts set
    answers       = ans,
    submitted_at  = now(),
    submit_reason = p_reason,
    score         = sc,
    total         = tot,
    percentage    = case when tot = 0 then 0 else round(sc * 100.0 / tot, 2) end
  where id = p_id;
end $$;

revoke all on function public.attempt_result(uuid)                 from public, anon, authenticated;
revoke all on function public.attempt_payload(uuid)                from public, anon, authenticated;
revoke all on function public.grade_attempt(uuid, jsonb, text)     from public, anon, authenticated;

-- ---------- PUBLIC FUNCTIONS (used by the student site) ---------------

-- Grades any attempt that ran past its deadline without being submitted
-- (for example: the student's phone died). Safe for anyone to call.
create or replace function public.finalize_expired(p_test uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id, answers from public.attempts
     where test_id = p_test and submitted_at is null
       and deadline_at + interval '30 seconds' < now()
  loop
    perform public.grade_attempt(r.id, r.answers, 'expired');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.get_test_public(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tests; n int; st text;
begin
  select * into t from public.tests where slug = lower(trim(p_slug));
  if not found then
    raise exception 'Test not found. Check the link and try again.';
  end if;
  select count(*) into n from public.questions where test_id = t.id;
  st := case
    when t.opens_at  is not null and now() < t.opens_at  then 'upcoming'
    when t.closes_at is not null and now() > t.closes_at then 'closed'
    else 'open' end;
  return jsonb_build_object(
    'title', t.title, 'course_code', t.course_code, 'instructions', t.instructions,
    'duration_minutes', t.duration_minutes, 'opens_at', t.opens_at, 'closes_at', t.closes_at,
    'question_count', n, 'status', st, 'warn_before_submit', t.warn_before_submit
  );
end $$;

create or replace function public.start_attempt(
  p_slug text, p_code text, p_name text, p_matric text, p_department text, p_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.tests; a public.attempts; lay jsonb; m text; mail text; new_id uuid;
begin
  select * into t from public.tests where slug = lower(trim(p_slug));
  if not found then raise exception 'Test not found. Check the link and try again.'; end if;

  if trim(coalesce(p_name, '')) = '' or trim(coalesce(p_matric, '')) = ''
     or trim(coalesce(p_department, '')) = '' or trim(coalesce(p_email, '')) = '' then
    raise exception 'Fill in all the fields.';
  end if;
  mail := lower(trim(p_email));
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if upper(trim(coalesce(p_code, ''))) <> upper(t.access_code) then
    raise exception 'That access code is not correct.';
  end if;

  perform public.finalize_expired(t.id);
  m := upper(regexp_replace(trim(p_matric), '\s+', '', 'g'));

  -- Resume an unfinished attempt (same matric number and same email only)
  select * into a from public.attempts
   where test_id = t.id
     and upper(regexp_replace(matric, '\s+', '', 'g')) = m
     and submitted_at is null
   order by started_at desc limit 1;
  if found then
    if lower(a.email) <> mail then
      raise exception 'A test is already in progress for this matric number. Use the same email you started with.';
    end if;
    return public.attempt_payload(a.id);
  end if;

  if t.opens_at  is not null and now() < t.opens_at  then raise exception 'This test has not opened yet.'; end if;
  if t.closes_at is not null and now() > t.closes_at then raise exception 'This test is closed.'; end if;

  if t.one_attempt and exists (
       select 1 from public.attempts
        where test_id = t.id
          and upper(regexp_replace(matric, '\s+', '', 'g')) = m
          and submitted_at is not null) then
    raise exception 'This matric number has already submitted this test.';
  end if;

  -- Build this student's personal paper: question order and option order
  select coalesce(jsonb_agg(
           jsonb_build_object('q', x.id, 'o', (
             select jsonb_agg(i order by case when t.shuffle_options then random() else i::float8 end)
               from generate_series(0, jsonb_array_length(x.options) - 1) as i
           )) order by x.ord_key
         ), '[]'::jsonb)
    into lay
    from (
      select q.id, q.options,
             case when t.shuffle_questions then random() else q.position::float8 end as ord_key
        from public.questions q where q.test_id = t.id
    ) x;

  if jsonb_array_length(lay) = 0 then raise exception 'This test has no questions yet.'; end if;

  insert into public.attempts (test_id, student_name, matric, department, email, deadline_at, layout)
  values (t.id, trim(p_name), upper(trim(p_matric)), trim(p_department), mail,
          now() + make_interval(mins => t.duration_minutes), lay)
  returning id into new_id;

  return public.attempt_payload(new_id);
end $$;

create or replace function public.get_attempt(p_attempt uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt and token = p_token;
  if not found then raise exception 'Test session not found.'; end if;
  if a.submitted_at is null and a.deadline_at + interval '30 seconds' < now() then
    perform public.grade_attempt(a.id, a.answers, 'expired');
  end if;
  return public.attempt_payload(a.id);
end $$;

create or replace function public.save_answers(
  p_attempt uuid, p_token uuid, p_answers jsonb, p_violations int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt and token = p_token;
  if not found then raise exception 'Test session not found.'; end if;
  if a.submitted_at is not null then return jsonb_build_object('submitted', true); end if;
  if now() <= a.deadline_at + interval '30 seconds' and jsonb_typeof(p_answers) = 'object' then
    update public.attempts
       set answers = p_answers, violations = greatest(violations, coalesce(p_violations, 0))
     where id = a.id;
  end if;
  return jsonb_build_object('ok', true, 'server_now', now());
end $$;

create or replace function public.submit_attempt(
  p_attempt uuid, p_token uuid, p_answers jsonb, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.attempts; ans jsonb; why text;
begin
  select * into a from public.attempts where id = p_attempt and token = p_token;
  if not found then raise exception 'Test session not found.'; end if;
  if a.submitted_at is not null then return public.attempt_result(a.id); end if;

  why := case when p_reason in ('manual', 'timeup', 'left', 'fullscreen') then p_reason else 'manual' end;
  if now() <= a.deadline_at + interval '30 seconds' then
    ans := coalesce(p_answers, a.answers);
  else
    ans := a.answers;  -- too late: only what was autosaved counts
    why := 'timeup';
  end if;

  perform public.grade_attempt(a.id, ans, why);
  return public.attempt_result(a.id);
end $$;

grant execute on function public.get_test_public(text)                                   to anon, authenticated;
grant execute on function public.start_attempt(text, text, text, text, text, text)       to anon, authenticated;
grant execute on function public.get_attempt(uuid, uuid)                                 to anon, authenticated;
grant execute on function public.save_answers(uuid, uuid, jsonb, int)                    to anon, authenticated;
grant execute on function public.submit_attempt(uuid, uuid, jsonb, text)                 to anon, authenticated;
grant execute on function public.finalize_expired(uuid)                                  to anon, authenticated;
