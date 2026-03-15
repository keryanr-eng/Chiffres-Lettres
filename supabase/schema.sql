-- Duo Chiffres & Lettres - Supabase SQL bootstrap
-- Exécute ce script dans Supabase SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create table if not exists players (
  id uuid primary key,
  pseudo text not null check (char_length(trim(pseudo)) between 2 and 24),
  created_at timestamptz not null default now()
);

create table if not exists words (
  word text primary key
);

drop function if exists public.normalize_word(text);
create or replace function normalize_word(p_value text)
returns text language sql immutable as $$
  select lower(regexp_replace(unaccent(coalesce(p_value, '')), '[^a-z]', '', 'g'));
$$;

create or replace function is_valid_word(p_value text)
returns boolean language sql stable as $$
  select exists (
    select 1
    from words
    where word = normalize_word(p_value)
  );
$$;

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
  mode text not null default 'duo' check (mode in ('duo', 'solo', 'daily', 'multi')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  current_round_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table games add column if not exists mode text;
update games set mode = 'duo' where mode is null;
alter table games alter column mode set default 'duo';
alter table games alter column mode set not null;
alter table games drop constraint if exists games_mode_check;
alter table games add constraint games_mode_check check (mode in ('duo', 'solo', 'daily', 'multi'));


create table if not exists game_players (
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  seat int not null check (seat between 1 and 8),
  joined_at timestamptz not null default now(),
  primary key (game_id, player_id),
  unique (game_id, seat)
);


alter table game_players drop constraint if exists game_players_seat_check;
alter table game_players add constraint game_players_seat_check check (seat between 1 and 8);

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

create table if not exists leaderboard_scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  score integer not null,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_scores_score_idx on leaderboard_scores(score desc);
create index if not exists leaderboard_scores_created_at_idx on leaderboard_scores(created_at desc);


create table if not exists daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  created_at timestamptz not null default now()
);

create table if not exists daily_challenge_rounds (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references daily_challenges(id) on delete cascade,
  round_index int not null check (round_index between 0 and 8),
  round_type text not null check (round_type in ('letters','numbers')),
  payload jsonb not null,
  letters_duration_sec int not null,
  numbers_duration_sec int not null,
  unique (challenge_id, round_index)
);

create table if not exists daily_challenge_scores (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references daily_challenges(id) on delete cascade,
  player_name text not null,
  player_name_key text not null,
  score integer not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, player_name_key)
);

create index if not exists daily_challenge_rounds_challenge_idx on daily_challenge_rounds(challenge_id, round_index);
create index if not exists daily_challenge_scores_challenge_score_idx on daily_challenge_scores(challenge_id, score desc, created_at asc);
create index if not exists daily_challenge_scores_player_idx on daily_challenge_scores(player_name_key);

alter table games add column if not exists daily_challenge_id uuid references daily_challenges(id);
create index if not exists games_daily_challenge_idx on games(daily_challenge_id);

alter table players enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table rounds enable row level security;
alter table attempts enable row level security;
alter table leaderboard_scores enable row level security;
alter table daily_challenges enable row level security;
alter table daily_challenge_rounds enable row level security;
alter table daily_challenge_scores enable row level security;

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

drop policy if exists "leaderboard_scores_read" on leaderboard_scores;
create policy "leaderboard_scores_read" on leaderboard_scores for select using (true);


drop policy if exists "daily_challenges_read" on daily_challenges;
create policy "daily_challenges_read" on daily_challenges for select using (true);

drop policy if exists "daily_challenge_rounds_read" on daily_challenge_rounds;
create policy "daily_challenge_rounds_read" on daily_challenge_rounds for select using (true);

drop policy if exists "daily_challenge_scores_read" on daily_challenge_scores;
create policy "daily_challenge_scores_read" on daily_challenge_scores for select using (true);

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

create or replace function can_build_word_from_letters(p_letters text[], p_word text)
returns boolean language plpgsql as $$
declare
  pool text[] := p_letters;
  ch text;
  i int;
begin
  for i in 1..char_length(p_word) loop
    ch := substr(p_word, i, 1);
    if not (ch = any(pool)) then
      return false;
    end if;
    pool := array_remove(pool, ch);
  end loop;
  return true;
end;
$$;

create or replace function pick_random_word(p_min_len int default 4, p_max_len int default 9)
returns text language sql stable as $$
  select word
  from public.words
  where char_length(word) between p_min_len and p_max_len
  order by random()
  limit 1;
$$;

create or replace function gen_letters_payload()
returns jsonb language plpgsql as $$
declare
  weighted_letters text[] := array[
    'e','e','e','e','e','e','e','e','e','a','a','a','a','a','a','i','i','i','i','i',
    's','s','s','n','n','n','r','r','r','t','t','t','o','o','o','l','l','l','u','u','u',
    'd','d','c','c','m','m','p','p','v','v','g','g','b','b','f','f','h','j','q','k','w','x','y','z'
  ];
  fallback_vowels text[] := array['e','e','e','a','a','i','i','o','u','y'];
  fallback_consonants text[] := array['s','s','n','n','r','r','t','t','l','l','d','c','m','p','v','g','b','f','h','j','q','k','w','x','z'];
  base_word text;
  letters text[] := '{}';
  i int;
  next_char text;
  j int;
  k int;
begin
  base_word := pick_random_word(4, 9);

  if base_word is not null and base_word <> '' then
    for i in 1..char_length(base_word) loop
      letters := letters || substr(base_word, i, 1);
    end loop;

    while array_length(letters, 1) < 9 loop
      letters := letters || weighted_letters[1 + floor(random() * array_length(weighted_letters,1))::int];
    end loop;
  else
    for i in 1..4 loop
      letters := letters || fallback_vowels[1 + floor(random() * array_length(fallback_vowels,1))::int];
    end loop;
    for i in 1..5 loop
      letters := letters || fallback_consonants[1 + floor(random() * array_length(fallback_consonants,1))::int];
    end loop;
  end if;

  for j in reverse array_length(letters, 1)..2 loop
    k := 1 + floor(random() * j)::int;
    next_char := letters[j];
    letters[j] := letters[k];
    letters[k] := next_char;
  end loop;

  return jsonb_build_object(
    'letters', letters,
    'base_word_len', coalesce(char_length(base_word), 0)
  );
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

create or replace function create_rounds_for_game(p_game_id uuid)
returns void language plpgsql security definer as $$
declare
  cfg record;
  flow text[] := array['letters','letters','numbers','letters','letters','numbers','letters','letters','numbers'];
  i int;
begin
  if exists(select 1 from rounds where game_id = p_game_id) then
    return;
  end if;

  select * into cfg from round_config where id = true;

  for i in 1..9 loop
    insert into rounds(game_id, round_index, round_type, payload, letters_duration_sec, numbers_duration_sec)
    values (
      p_game_id,
      i - 1,
      flow[i],
      case when flow[i] = 'letters' then gen_letters_payload() else gen_numbers_payload() end,
      cfg.letters_duration_sec,
      cfg.numbers_duration_sec
    )
    on conflict (game_id, round_index) do nothing;
  end loop;
end;
$$;

create or replace function create_game_with_rounds(p_creator uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_game_id uuid := gen_random_uuid();
  v_code text := gen_game_code();
begin
  insert into games(id, code, created_by, mode, status, current_round_index) values (v_game_id, v_code, p_creator, 'duo', 'waiting', 0);
  insert into game_players(game_id, player_id, seat) values (v_game_id, p_creator, 1);

  perform create_rounds_for_game(v_game_id);

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

grant execute on function create_game_with_rounds(uuid) to anon, authenticated;

create or replace function create_solo_game_with_rounds(p_creator uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_game_id uuid := gen_random_uuid();
  v_code text := gen_game_code();
begin
  insert into games(id, code, created_by, mode, status, current_round_index) values (v_game_id, v_code, p_creator, 'solo', 'active', 0);
  insert into game_players(game_id, player_id, seat) values (v_game_id, p_creator, 1);

  perform create_rounds_for_game(v_game_id);

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

grant execute on function create_solo_game_with_rounds(uuid) to anon, authenticated;


create or replace function create_multi_game(p_creator uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_game_id uuid := gen_random_uuid();
  v_code text := gen_game_code();
begin
  insert into games(id, code, created_by, mode, status, current_round_index)
  values (v_game_id, v_code, p_creator, 'multi', 'waiting', 0);

  insert into game_players(game_id, player_id, seat) values (v_game_id, p_creator, 1);

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

grant execute on function create_multi_game(uuid) to anon, authenticated;

drop function if exists join_game_by_code(uuid,text);
create or replace function join_game_by_code(p_player uuid, p_code text)
returns jsonb language plpgsql security definer as $$
declare
  g games%rowtype;
  max_players int;
  next_seat int;
begin
  select * into g from games where code = upper(trim(p_code));
  if g.id is null then raise exception 'Code invalide'; end if;

  if g.mode in ('solo', 'daily') then
    raise exception 'Ce code n''accepte pas de joueur invité';
  end if;

  if g.status <> 'waiting' then
    raise exception 'La partie a déjà démarré';
  end if;

  if exists(select 1 from game_players where game_id = g.id and player_id = p_player) then
    return jsonb_build_object('game_id', g.id, 'mode', g.mode, 'status', g.status);
  end if;

  max_players := case when g.mode = 'duo' then 2 else 8 end;

  if (select count(*) from game_players where game_id = g.id) >= max_players then
    raise exception 'Cette partie est déjà complète';
  end if;

  select min(seat_num) into next_seat
  from generate_series(1, max_players) as seat_num
  where not exists (
    select 1 from game_players gp
    where gp.game_id = g.id and gp.seat = seat_num
  );

  insert into game_players(game_id, player_id, seat) values (g.id, p_player, next_seat);

  if g.mode = 'duo' then
    perform create_rounds_for_game(g.id);
    insert into attempts(game_id, round_id, player_id)
    select g.id, r.id, gp.player_id
    from rounds r
    join game_players gp on gp.game_id = g.id
    where r.game_id = g.id
    on conflict do nothing;

    update games set status = 'active' where id = g.id;
    g.status := 'active';
  end if;

  return jsonb_build_object('game_id', g.id, 'mode', g.mode, 'status', g.status);
end;
$$;

grant execute on function join_game_by_code(uuid,text) to anon, authenticated;


create or replace function start_multi_game(p_game_id uuid, p_player_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  g games%rowtype;
begin
  select * into g from games where id = p_game_id;
  if g.id is null then raise exception 'Partie introuvable'; end if;
  if g.mode <> 'multi' then raise exception 'Cette partie n''est pas multi'; end if;
  if g.created_by <> p_player_id then raise exception 'Seul l''hôte peut lancer la partie'; end if;
  if g.status <> 'waiting' then raise exception 'La partie a déjà démarré'; end if;

  perform create_rounds_for_game(g.id);

  insert into attempts(game_id, round_id, player_id)
  select g.id, r.id, gp.player_id
  from rounds r
  join game_players gp on gp.game_id = g.id
  where r.game_id = g.id
  on conflict do nothing;

  update games set status = 'active' where id = g.id;

  return jsonb_build_object('ok', true, 'game_id', g.id);
end;
$$;

grant execute on function start_multi_game(uuid,uuid) to anon, authenticated;

create or replace function get_game_state(p_game_id uuid, p_player_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  is_member boolean;
begin
  select exists(
    select 1
    from game_players gp
    where gp.game_id = p_game_id
      and gp.player_id = p_player_id
  ) into is_member;

  if not is_member then
    raise exception 'Accès refusé à cette partie';
  end if;

  return jsonb_build_object(
    'game', (select row_to_json(g) from (select * from games where id = p_game_id) g),
    'rounds', (select coalesce(jsonb_agg(r order by r.round_index), '[]'::jsonb) from rounds r where r.game_id = p_game_id),
    'attempts', (select coalesce(jsonb_agg(a order by a.created_at), '[]'::jsonb) from attempts a where a.game_id = p_game_id),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'pseudo', p.pseudo) order by gp.seat), '[]'::jsonb)
      from game_players gp
      join players p on p.id = gp.player_id
      where gp.game_id = p_game_id
    )
  );
end;
$$;

grant execute on function get_game_state(uuid,uuid) to anon, authenticated;

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

create or replace function start_current_round_for_player(p_game_id uuid, p_player_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  g games%rowtype;
  r rounds%rowtype;
  attempt_id uuid;
begin
  select * into g from games where id = p_game_id;
  if g.id is null then raise exception 'Partie introuvable'; end if;

  if not exists(
    select 1 from game_players gp
    where gp.game_id = p_game_id and gp.player_id = p_player_id
  ) then
    raise exception 'Accès refusé à cette partie';
  end if;

  select * into r from rounds where game_id = p_game_id and round_index = g.current_round_index;
  if r.id is null then raise exception 'Manche introuvable'; end if;

  insert into attempts(game_id, round_id, player_id)
  values (p_game_id, r.id, p_player_id)
  on conflict (round_id, player_id) do nothing;

  select id into attempt_id
  from attempts
  where round_id = r.id and player_id = p_player_id;

  return jsonb_build_object(
    'attempt_id', attempt_id,
    'start', start_attempt(attempt_id)
  );
end;
$$;

grant execute on function start_current_round_for_player(uuid,uuid) to anon, authenticated;

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
  clean text := normalize_word(p_answer);
begin
  select * into a from attempts where id = p_attempt_id;
  if a.id is null then raise exception 'Attempt introuvable'; end if;
  if a.deadline_at is null or now() > a.deadline_at then
    update attempts set status = 'expired', points = 0 where id = p_attempt_id;
    perform advance_round_if_ready(a.game_id);
    return jsonb_build_object('points', 0, 'status', 'expired');
  end if;

  if clean = '' or not is_valid_word(clean) then
    return jsonb_build_object('points', 0, 'status', 'invalid', 'answer_text', clean);
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
  return jsonb_build_object('points', pts, 'status', 'submitted', 'answer_text', clean);
end;
$$;

create or replace function submit_numbers_attempt(
  p_attempt_id uuid,
  p_expression text default null,
  p_result int default null
)
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

  if p_result is null and (p_expression is null or btrim(p_expression) = '' or upper(btrim(p_expression)) = 'PASS') then
    update attempts
    set answer_text = 'PASS',
        answer_value = null,
        points = 0,
        status = 'submitted'
    where id = p_attempt_id;

    perform advance_round_if_ready(a.game_id);
    return jsonb_build_object('points', 0, 'status', 'submitted', 'computed_value', null, 'answer_text', 'PASS');
  end if;

  if p_result is not null then
    computed := p_result;
  else
    if p_expression is null or btrim(p_expression) = '' then
      raise exception 'Résultat ou expression requis';
    end if;
    if not contains_only_drawn_numbers(a.round_id, p_expression) then
      raise exception 'Expression invalide: nombres non autorisés';
    end if;
    computed := compute_numbers_value(p_expression);
  end if;

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
  set answer_text = coalesce(nullif(p_expression, ''), format('Résultat: %s', computed)),
      answer_value = computed,
      points = pts,
      status = 'submitted'
  where id = p_attempt_id;

  perform advance_round_if_ready(a.game_id);
  return jsonb_build_object('points', pts, 'status', 'submitted', 'computed_value', computed);
end;
$$;

grant execute on function submit_letters_attempt(uuid,text) to anon, authenticated;
grant execute on function submit_numbers_attempt(uuid,text,int) to anon, authenticated;

create or replace function submit_leaderboard_score(p_player_name text, p_score integer)
returns jsonb language plpgsql security definer as $$
begin
  insert into leaderboard_scores(player_name, score)
  values (left(coalesce(nullif(btrim(p_player_name), ''), 'Anonyme'), 40), greatest(coalesce(p_score, 0), 0));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function get_leaderboard_global()
returns table(player_name text, score integer, created_at timestamptz)
language sql
security definer
as $$
  select ls.player_name, ls.score, ls.created_at
  from leaderboard_scores ls
  order by ls.score desc, ls.created_at asc
  limit 20;
$$;

create or replace function get_leaderboard_daily()
returns table(player_name text, score integer, created_at timestamptz)
language sql
security definer
as $$
  select ls.player_name, ls.score, ls.created_at
  from leaderboard_scores ls
  where ls.created_at::date = current_date
  order by ls.score desc, ls.created_at asc
  limit 20;
$$;

create or replace function get_personal_best(p_player_name text)
returns table(best_score integer)
language sql
security definer
as $$
  select max(ls.score)::integer as best_score
  from leaderboard_scores ls
  where lower(ls.player_name) = lower(coalesce(p_player_name, ''));
$$;

grant execute on function submit_leaderboard_score(text,integer) to anon, authenticated;
grant execute on function get_leaderboard_global() to anon, authenticated;
grant execute on function get_leaderboard_daily() to anon, authenticated;
grant execute on function get_personal_best(text) to anon, authenticated;


drop function if exists get_or_create_daily_challenge();
create or replace function get_or_create_daily_challenge()
returns table(challenge_id uuid, challenge_date date)
language plpgsql
security definer
as $$
declare
  v_id uuid;
  cfg record;
  flow text[] := array['letters','letters','numbers','letters','letters','numbers','letters','letters','numbers'];
  i int;
begin
  select dc.id into v_id from daily_challenges dc where dc.challenge_date = current_date;

  if v_id is null then
    insert into daily_challenges(challenge_date)
    values (current_date)
    on conflict (challenge_date) do nothing
    returning id into v_id;

    if v_id is null then
      select dc.id into v_id from daily_challenges dc where dc.challenge_date = current_date;
    end if;

    select * into cfg from round_config where id = true;

    for i in 1..9 loop
      insert into daily_challenge_rounds(
        challenge_id,
        round_index,
        round_type,
        payload,
        letters_duration_sec,
        numbers_duration_sec
      )
      values (
        v_id,
        i - 1,
        flow[i],
        case when flow[i] = 'letters' then gen_letters_payload() else gen_numbers_payload() end,
        cfg.letters_duration_sec,
        cfg.numbers_duration_sec
      )
      on conflict (challenge_id, round_index) do nothing;
    end loop;
  end if;

  return query
  select dc.id, dc.challenge_date
  from daily_challenges dc
  where dc.id = v_id;
end;
$$;

grant execute on function get_or_create_daily_challenge() to anon, authenticated;

create or replace function create_daily_game_with_rounds(p_creator uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_game_id uuid := gen_random_uuid();
  v_code text := gen_game_code();
  v_challenge record;
begin
  select * into v_challenge from get_or_create_daily_challenge();

  insert into games(id, code, created_by, mode, status, current_round_index, daily_challenge_id)
  values (v_game_id, v_code, p_creator, 'daily', 'active', 0, v_challenge.challenge_id);

  insert into game_players(game_id, player_id, seat)
  values (v_game_id, p_creator, 1)
  on conflict (game_id, player_id) do nothing;

  insert into rounds(game_id, round_index, round_type, payload, letters_duration_sec, numbers_duration_sec)
  select
    v_game_id,
    dcr.round_index,
    dcr.round_type,
    dcr.payload,
    dcr.letters_duration_sec,
    dcr.numbers_duration_sec
  from daily_challenge_rounds dcr
  where dcr.challenge_id = v_challenge.challenge_id
  order by dcr.round_index;

  return jsonb_build_object('game_id', v_game_id, 'code', v_code, 'challenge_date', v_challenge.challenge_date);
end;
$$;

grant execute on function create_daily_game_with_rounds(uuid) to anon, authenticated;

create or replace function submit_daily_score(p_player_name text, p_score integer)
returns jsonb language plpgsql security definer as $$
declare
  v_challenge record;
  v_player_name text := left(coalesce(nullif(btrim(p_player_name), ''), 'Anonyme'), 40);
  v_key text := lower(v_player_name);
  v_score int := greatest(coalesce(p_score, 0), 0);
  v_best int;
  v_existing int;
begin
  select * into v_challenge from get_or_create_daily_challenge();

  select dcs.score into v_existing
  from daily_challenge_scores dcs
  where dcs.challenge_id = v_challenge.challenge_id
    and dcs.player_name_key = v_key;

  insert into daily_challenge_scores(challenge_id, player_name, player_name_key, score)
  values (v_challenge.challenge_id, v_player_name, v_key, v_score)
  on conflict (challenge_id, player_name_key)
  do update set
    score = greatest(daily_challenge_scores.score, excluded.score),
    player_name = case when excluded.score > daily_challenge_scores.score then excluded.player_name else daily_challenge_scores.player_name end,
    created_at = case when excluded.score > daily_challenge_scores.score then now() else daily_challenge_scores.created_at end;

  select dcs.score into v_best
  from daily_challenge_scores dcs
  where dcs.challenge_id = v_challenge.challenge_id
    and dcs.player_name_key = v_key;

  return jsonb_build_object(
    'challenge_id', v_challenge.challenge_id,
    'challenge_date', v_challenge.challenge_date,
    'best_score', coalesce(v_best, v_score),
    'is_new_best', coalesce(v_existing is null or v_score > v_existing, true)
  );
end;
$$;

grant execute on function submit_daily_score(text,integer) to anon, authenticated;

create or replace function get_daily_challenge_leaderboard()
returns table(player_name text, score integer, created_at timestamptz)
language sql
security definer
as $$
  with challenge as (
    select challenge_id from get_or_create_daily_challenge()
  )
  select dcs.player_name, dcs.score, dcs.created_at
  from daily_challenge_scores dcs
  join challenge c on c.challenge_id = dcs.challenge_id
  order by dcs.score desc, dcs.created_at asc
  limit 20;
$$;

grant execute on function get_daily_challenge_leaderboard() to anon, authenticated;
