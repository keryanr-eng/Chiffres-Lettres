-- Duo Chiffres & Lettres - Supabase SQL bootstrap
-- Exécute ce script dans Supabase SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create table if not exists players (
  id uuid primary key,
  pseudo text not null check (char_length(trim(pseudo)) between 2 and 24),
  created_at timestamptz not null default now()
);

create table if not exists round_config (
  id boolean primary key default true,
  letters_duration_sec int not null default 45,
  numbers_duration_sec int not null default 60
);
insert into round_config (id) values (true) on conflict (id) do nothing;

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references players(id),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  current_round_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists game_players (
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  seat int not null check (seat in (1,2)),
  joined_at timestamptz not null default now(),
  primary key (game_id, player_id),
  unique (game_id, seat)
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_index int not null check (round_index between 0 and 8),
  round_type text not null check (round_type in ('letters','numbers')),
  payload jsonb not null,
  letters_duration_sec int not null,
  numbers_duration_sec int not null,
  unique (game_id, round_index)
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  started_at timestamptz,
  deadline_at timestamptz,
  answer_text text,
  answer_value int,
  points int not null default 0,
  status text not null default 'pending' check (status in ('pending','started','submitted','expired')),
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

alter table players enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table rounds enable row level security;
alter table attempts enable row level security;

drop policy if exists "players_rw" on players;
create policy "players_rw" on players for all using (true) with check (true);

drop policy if exists "games_rw" on games;
create policy "games_rw" on games for all using (true) with check (true);

drop policy if exists "game_players_rw" on game_players;
create policy "game_players_rw" on game_players for all using (true) with check (true);

drop policy if exists "rounds_read" on rounds;
create policy "rounds_read" on rounds for select using (true);

drop policy if exists "attempts_read" on attempts;
create policy "attempts_read" on attempts for select using (true);

create or replace function gen_game_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out_code text := '';
  i int;
begin
  loop
    out_code := '';
    for i in 1..6 loop
      out_code := out_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from games where code = out_code);
  end loop;
  return out_code;
end;
$$;

create or replace function gen_letters_payload()
returns jsonb language plpgsql as $$
declare
  vowels text[] := array['a','e','i','o','u','y'];
  consonants text[] := array['b','c','d','f','g','h','j','k','l','m','n','p','q','r','s','t','v','w','x','z'];
  i int;
  out_letters text[] := '{}';
begin
  for i in 1..4 loop
    out_letters := out_letters || vowels[1 + floor(random() * array_length(vowels,1))::int];
  end loop;
  for i in 1..5 loop
    out_letters := out_letters || consonants[1 + floor(random() * array_length(consonants,1))::int];
  end loop;
  return jsonb_build_object('letters', out_letters);
end;
$$;

create or replace function combine_step(a int, b int)
returns int language plpgsql as $$
declare
  op int := floor(random()*4)::int;
begin
  if op = 0 then return a + b; end if;
  if op = 1 then return a - b; end if;
  if op = 2 then return a * b; end if;
  if b <> 0 and mod(a,b)=0 then return a / b; end if;
  return a + b;
end;
$$;

create or replace function gen_numbers_payload()
returns jsonb language plpgsql as $$
declare
  big_pool int[] := array[25,50,75,100];
  small_pool int[] := array[1,2,3,4,5,6,7,8,9,10];
  nums int[] := '{}';
  work int[];
  target int;
  i int;
  idx int;
  a int;
  b int;
  tmp int;
begin
  nums := nums || big_pool[1 + floor(random()*4)::int];
  nums := nums || big_pool[1 + floor(random()*4)::int];
  for i in 1..4 loop
    nums := nums || small_pool[1 + floor(random()*10)::int];
  end loop;

  for i in 1..100 loop
    work := nums;
    while array_length(work,1) > 1 loop
      idx := 1 + floor(random() * array_length(work,1))::int;
      a := work[idx];
      work := array_remove(work, a);
      idx := 1 + floor(random() * array_length(work,1))::int;
      b := work[idx];
      work := array_remove(work, b);
      tmp := combine_step(a,b);
      work := work || tmp;
    end loop;
    target := work[1];
    if target between 100 and 999 then
      return jsonb_build_object('numbers', nums, 'target', target);
    end if;
  end loop;
  return jsonb_build_object('numbers', nums, 'target', 500);
end;
$$;

create or replace function create_game_with_rounds(p_creator uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_game_id uuid := gen_random_uuid();
  v_code text := gen_game_code();
  cfg record;
  flow text[] := array['letters','letters','numbers','letters','letters','numbers','letters','letters','numbers'];
  i int;
begin
  select * into cfg from round_config where id = true;
  insert into games(id, code, created_by, status, current_round_index) values (v_game_id, v_code, p_creator, 'waiting', 0);
  insert into game_players(game_id, player_id, seat) values (v_game_id, p_creator, 1);

  for i in 1..9 loop
    insert into rounds(game_id, round_index, round_type, payload, letters_duration_sec, numbers_duration_sec)
    values (
      v_game_id,
      i - 1,
      flow[i],
      case when flow[i] = 'letters' then gen_letters_payload() else gen_numbers_payload() end,
      cfg.letters_duration_sec,
      cfg.numbers_duration_sec
    );
  end loop;

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

grant execute on function create_game_with_rounds(uuid) to anon, authenticated;

create or replace function join_game_by_code(p_player uuid, p_code text)
returns void language plpgsql security definer as $$
declare
  g games%rowtype;
begin
  select * into g from games where code = upper(trim(p_code));
  if g.id is null then raise exception 'Code invalide'; end if;

  if exists(select 1 from game_players where game_id = g.id and player_id = p_player) then return; end if;

  if (select count(*) from game_players where game_id = g.id) >= 2 then
    raise exception 'Cette partie est déjà complète';
  end if;

  insert into game_players(game_id, player_id, seat) values (g.id, p_player, 2);
  update games set status = 'active' where id = g.id;

  insert into attempts(game_id, round_id, player_id)
  select g.id, r.id, gp.player_id
  from rounds r
  join game_players gp on gp.game_id = g.id
  where r.game_id = g.id
  on conflict do nothing;
end;
$$;

grant execute on function join_game_by_code(uuid,text) to anon, authenticated;

create or replace function start_attempt(p_attempt_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  a attempts%rowtype;
  r rounds%rowtype;
  dur int;
  start_ts timestamptz := now();
  dl timestamptz;
begin
  select * into a from attempts where id = p_attempt_id;
  if a.id is null then raise exception 'Attempt introuvable'; end if;
  if a.status <> 'pending' then
    return jsonb_build_object('started_at', a.started_at, 'deadline_at', a.deadline_at);
  end if;

  select * into r from rounds where id = a.round_id;
  dur := case when r.round_type = 'letters' then r.letters_duration_sec else r.numbers_duration_sec end;
  dl := start_ts + make_interval(secs => dur);

  update attempts
  set started_at = start_ts,
      deadline_at = dl,
      status = 'started'
  where id = p_attempt_id;

  return jsonb_build_object('started_at', start_ts, 'deadline_at', dl);
end;
$$;

grant execute on function start_attempt(uuid) to anon, authenticated;

create or replace function contains_only_drawn_numbers(p_round_id uuid, p_expression text)
returns boolean language plpgsql as $$
declare
  drawn int[];
  tok text;
  toks text[];
  pool int[];
begin
  select array(select jsonb_array_elements_text(payload->'numbers')::int) into drawn from rounds where id = p_round_id;
  pool := drawn;
  toks := regexp_split_to_array(regexp_replace(p_expression, '[^0-9]+', ' ', 'g'), '\s+');

  foreach tok in array toks loop
    if tok = '' then continue; end if;
    if not (tok::int = any(pool)) then return false; end if;
    pool := array_remove(pool, tok::int);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function compute_numbers_value(p_expression text)
returns int language plpgsql as $$
declare
  sanitized text;
  v numeric;
begin
  sanitized := regexp_replace(p_expression, '\s+', '', 'g');
  if sanitized !~ '^[0-9\+\-\*\/\(\)]+$' then
    raise exception 'Expression invalide';
  end if;
  execute format('select (%s)::numeric', sanitized) into v;
  if v != trunc(v) then raise exception 'Le résultat doit être entier'; end if;
  return v::int;
end;
$$;

create or replace function advance_round_if_ready(p_game_id uuid)
returns void language plpgsql as $$
declare
  idx int;
  rid uuid;
  pending_count int;
begin
  select current_round_index into idx from games where id = p_game_id;
  select id into rid from rounds where game_id = p_game_id and round_index = idx;
  select count(*) into pending_count from attempts where round_id = rid and status in ('pending','started');

  if pending_count = 0 then
    if idx < 8 then
      update games set current_round_index = idx + 1 where id = p_game_id;
    else
      update games set status = 'finished' where id = p_game_id;
    end if;
  end if;
end;
$$;

create or replace function submit_letters_attempt(p_attempt_id uuid, p_answer text)
returns jsonb language plpgsql security definer as $$
declare
  a attempts%rowtype;
  pts int := 0;
  clean text := lower(regexp_replace(unaccent(p_answer), '[^a-z]', '', 'g'));
begin
  select * into a from attempts where id = p_attempt_id;
  if a.id is null then raise exception 'Attempt introuvable'; end if;
  if a.deadline_at is null or now() > a.deadline_at then
    update attempts set status = 'expired', points = 0 where id = p_attempt_id;
    perform advance_round_if_ready(a.game_id);
    return jsonb_build_object('points', 0, 'status', 'expired');
  end if;

  pts := least(char_length(clean), 9);
  if char_length(clean) = 9 then pts := pts + 5; end if;

  update attempts
  set answer_text = clean,
      answer_value = char_length(clean),
      points = pts,
      status = 'submitted'
  where id = p_attempt_id;

  perform advance_round_if_ready(a.game_id);
  return jsonb_build_object('points', pts, 'status', 'submitted');
end;
$$;

create or replace function submit_numbers_attempt(p_attempt_id uuid, p_expression text)
returns jsonb language plpgsql security definer as $$
declare
  a attempts%rowtype;
  target int;
  computed int;
  diff int;
  pts int;
begin
  select at.* into a from attempts at where at.id = p_attempt_id;
  if a.id is null then raise exception 'Attempt introuvable'; end if;
  if a.deadline_at is null or now() > a.deadline_at then
    update attempts set status = 'expired', points = 0 where id = p_attempt_id;
    perform advance_round_if_ready(a.game_id);
    return jsonb_build_object('points', 0, 'status', 'expired', 'computed_value', null);
  end if;

  if not contains_only_drawn_numbers(a.round_id, p_expression) then
    raise exception 'Expression invalide: nombres non autorisés';
  end if;

  computed := compute_numbers_value(p_expression);
  select (payload->>'target')::int into target from rounds where id = a.round_id;
  diff := abs(target - computed);

  pts := case
    when diff = 0 then 10
    when diff between 1 and 5 then 7
    when diff between 6 and 10 then 5
    when diff between 11 and 20 then 3
    else 0
  end;

  update attempts
  set answer_text = p_expression,
      answer_value = computed,
      points = pts,
      status = 'submitted'
  where id = p_attempt_id;

  perform advance_round_if_ready(a.game_id);
  return jsonb_build_object('points', pts, 'status', 'submitted', 'computed_value', computed);
end;
$$;

grant execute on function submit_letters_attempt(uuid,text) to anon, authenticated;
grant execute on function submit_numbers_attempt(uuid,text) to anon, authenticated;
