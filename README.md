# Duo Chiffres & Lettres (PWA mobile-first)

Application React + Vite + TypeScript pour jouer à 2 en asynchrone (style **Des chiffres et des lettres**) avec chrono strict par manche.

## 1) Ce que fait ce projet

- ✅ Jeu en 9 manches dans l’ordre : `L, L, C, L, L, C, L, L, C`.
- ✅ Chaque joueur joue quand il veut (asynchrone).
- ✅ Chrono strict par manche côté DB (`started_at` + `deadline_at`), refus après délai.
- ✅ Mode Lettres (9 lettres) + validation locale dictionnaire FR embarqué.
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
- la sécurité RLS,
- les fonctions RPC utilisées par le front.

### Étape D — Lancer en local

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
```

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
- `src/data/frenchWords.ts` → dictionnaire FR embarqué (version légère)
- `supabase/schema.sql` → base SQL complète (tables + RLS + fonctions)
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
- Validation lettres côté serveur simplifiée (score/temps gérés serveur, dictionnaire local front).
  - TODO: stocker un hash dictionnaire ou table SQL pour validation serveur stricte.
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
