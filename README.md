# Duo Chiffres & Lettres (PWA mobile-first)

Application React + Vite + TypeScript pour jouer à 2 en asynchrone (style **Des chiffres et des lettres**) avec chrono strict par manche.

## 1) Ce que fait ce projet

- ✅ Jeu en 9 manches dans l’ordre : `L, L, C, L, L, C, L, L, C`.
- ✅ Chaque joueur joue quand il veut (asynchrone).
- ✅ Chrono strict par manche côté DB (`started_at` + `deadline_at`), refus après délai.
- ✅ Mode Lettres (9 lettres) avec validation serveur (table dictionnaire `words` dans Supabase).
- ✅ Mode Chiffres (6 nombres + cible solvable) + évaluation côté SQL.
- ✅ PWA installable (manifest + service worker).
- ✅ UI mobile-first dark, boutons larges, écran “Prêt ?”.
- ✅ Déploiement GitHub Pages automatisé via GitHub Actions.

---

## 2) Prérequis (expliqué pour débutant)

Avant de lancer le projet, il te faut installer :

1. **Node.js 20+** (runtime JavaScript)  
2. **Un compte Supabase** (base de données)  
3. **Un compte GitHub** (déploiement Pages)

---

## 3) Installation locale pas à pas

### Étape A — Récupérer et installer les dépendances

```bash
npm install
```

### Étape B — Créer ton fichier `.env`

1. Copie `.env.example` vers `.env`.
2. Remplis les 2 variables Supabase.

Exemple :

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
```

### Étape C — Initialiser Supabase (SQL)

1. Ouvre ton projet Supabase.
2. Va dans **SQL Editor**.
3. Copie-colle **tout** le contenu de `supabase/schema.sql`.
4. Clique **Run**.

Ce script crée :
- les tables (`players`, `games`, `rounds`, `attempts`, etc.),
- la table dictionnaire `words`,
- la sécurité RLS,
- les fonctions RPC utilisées par le front.

> Si tu mets à jour vers la version avec **mode solo**, relance simplement `supabase/schema.sql` :
> - ajout de la colonne `games.mode` (`duo`/`solo`),
> - ajout de la fonction RPC `create_solo_game_with_rounds`,
> - ajout de la fonction RPC `start_current_round_for_player` (création de tentative à la demande en solo),
> - correction `submit_numbers_attempt` pour accepter un PASS propre (`p_result=null`, `p_expression=null|'PASS'`).
> - ajout de la table `leaderboard_scores` (mode solo) et des RPC `submit_leaderboard_score`, `get_leaderboard_global`, `get_leaderboard_daily`, `get_personal_best`.
> - ajout du mode `daily` (Défi du jour) : tables `daily_challenges`, `daily_challenge_rounds`, `daily_challenge_scores` + RPC `get_or_create_daily_challenge`, `create_daily_game_with_rounds`, `submit_daily_score`, `get_daily_challenge_leaderboard`.
> - ajout du mode `multi` (3 à 8 joueurs) : RPC `create_multi_game`, `start_multi_game`, adaptation `join_game_by_code` et des seats 1..8.

### Étape D — Importer le dictionnaire FR (obligatoire pour la validation serveur Lettres)

#### Option A (petit/moyen dictionnaire): SQL direct
- Prépare un fichier SQL d’insert (ex: `supabase/import_words.sql`) avec des lignes du type:

```sql
insert into public.words(word) values ('bonjour') on conflict do nothing;
```

- Exécute ce fichier dans **Supabase SQL Editor**.

#### Option B (recommandée): script Node en batch
1. Mets tes mots (un mot par ligne) dans `data/words_fr.txt`.
2. Récupère ta `SERVICE_ROLE_KEY` dans **Supabase > Settings > API**.
3. Lance l’import avec les variables locales:

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=ta_cle_service_role \
npm run import:words
```

Le script normalise automatiquement les mots (minuscules, sans accents), insère en batch (1000), ignore les doublons, et affiche la progression.

⚠️ **Sécurité importante**
- Ne mets jamais `SUPABASE_SERVICE_ROLE_KEY` dans GitHub.
- Ne la mets pas dans `.env` frontend.
- Utilise-la uniquement en local pour l’import.

### Étape E — Lancer en local

```bash
npm run dev
```

Puis ouvre l’URL locale affichée (ex: `http://localhost:5173`).

---

## 4) Commandes utiles

```bash
npm run dev      # lancer en développement
npm run build    # compiler pour la prod
npm run preview  # prévisualiser la build
npm run lint     # vérifier la qualité TypeScript/ESLint
npm run check    # lint + build
npm run import:words # importer le dictionnaire FR en base
```

### Test rapide du leaderboard solo

1. Lance une partie **solo** et termine les 9 manches.
2. Vérifie l'écran final : score final + record personnel.
3. Retourne à l'accueil puis clique **Voir le classement**.
4. Vérifie les 3 zones : global, du jour, record perso.

### Test rapide du Défi du jour

1. Depuis l'accueil, clique **🔥 Défi du jour**.
2. Termine les 9 manches.
3. Vérifie l'écran final : score final + meilleur score du jour.
4. Clique **Voir le classement** puis vérifie la section **🔥 Défi du jour**.

### Test rapide du mode multi

1. Joueur A : clique **Créer une partie multi** puis partage le code du lobby.
2. Joueur B/C : rejoignent avec ce code (tant que la room est en `waiting`).
3. Vérifie que la liste joueurs se met à jour dans le lobby.
4. Hôte : clique **Lancer la partie**.
5. Vérifie dans la partie : score perso + bloc **Classement** trié par score.

---

## 5) Déployer sur GitHub Pages

### Étape A — Ajouter les secrets GitHub

Dans ton repo GitHub : **Settings > Secrets and variables > Actions**

Créer 2 secrets :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Étape B — Activer GitHub Pages

Dans **Settings > Pages** :
- Source = **GitHub Actions**.

### Étape C — Push sur `main`

À chaque push sur `main`, le workflow `.github/workflows/deploy.yml` build et publie automatiquement.

---

## 6) Structure simple du projet

- `src/pages/HomePage.tsx` → écran d’accueil (pseudo, créer/rejoindre une partie)
- `src/pages/GamePage.tsx` → écran principal de jeu (chrono, saisie, score)
- `src/lib/gameApi.ts` → appels RPC Supabase
- `src/data/frenchWords.ts` → dictionnaire embarqué côté UI (feedback rapide)
- `supabase/schema.sql` → base SQL complète (tables + RLS + fonctions + validation dictionnaire serveur)
- `scripts/import_words.mjs` → script d’import batch des mots dans `public.words`
- `data/words_fr.txt` → fichier source (un mot par ligne) pour l’import
- `vite.config.ts` → config Vite + PWA + base GitHub Pages

---

## 7) Points importants de sécurité anti-triche

- Le tirage est enregistré en DB au moment de la création de partie.
- Le chrono est lancé côté DB via `start_attempt`.
- Les soumissions tardives passent automatiquement en `expired` (0 point).
- En chiffres, la soumission est vérifiée côté SQL :
  - expression autorisée,
  - nombres du tirage uniquement,
  - résultat entier,
  - points calculés côté DB.

---

## 8) Limitations connues + TODO (version V1 simple)

- Dictionnaire FR embarqué **minimal** (liste courte) pour rester léger.
  - TODO: brancher un dictionnaire FR libre plus complet (compressé).
- Auth simple par `player_id` localStorage (sans email/mot de passe).
  - TODO: passer à Supabase Auth si besoin multi-device sécurisé.

---

## 9) Conseils d’utilisation

1. Joueur A crée la partie et partage le code.
2. Joueur B rejoint avec ce code.
3. Chaque joueur clique **Démarrer** quand il est prêt.
4. Si l’app est fermée pendant le chrono, le temps restant est recalculé depuis `deadline_at`.
5. Une manche se débloque quand les 2 joueurs ont fini la manche en cours.

Bon jeu 🎯


---

## 10) Debug (adversaire invisible / récap manche)

Tu as un guide prêt à l’emploi dans `docs/debug.md`.

Résumé rapide :
- Vérifie la game par code (`games`).
- Vérifie les attempts avec jointure `rounds` en utilisant `round_index` (pas `round_number`).
- Vérifie les joueurs de la game (`game_players`).

⚠️ Erreur fréquente : `invalid input syntax for type uuid: "Nay"`
=> Tu as mis un pseudo à la place d’un `game_id` UUID.
