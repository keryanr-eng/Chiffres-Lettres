# Debug rapide (adversaire invisible / récap manche)

## 1) Trouver la game par code
```sql
select id, code, created_at
from public.games
where code = 'XXXXXX';
```

## 2) Vérifier les attempts + rounds (avec round_index)
```sql
select a.created_at, a.player_id, r.round_index, r.round_type, a.answer_text, a.points, a.status
from public.attempts a
join public.rounds r on r.id = a.round_id
where a.game_id = 'UUID_GAME_ID'
order by r.round_index, a.created_at;
```

## 3) Vérifier les joueurs de la game
```sql
select gp.player_id, p.pseudo
from public.game_players gp
join public.players p on p.id = gp.player_id
where gp.game_id = 'UUID_GAME_ID';
```

## 4) Erreur classique UUID
Si tu vois une erreur du style `invalid input syntax for type uuid: "Nay"`,
tu as probablement mis un pseudo à la place d’un `game_id` UUID.
