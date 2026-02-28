import { ChangeEvent, FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGame, ensurePlayer, joinGame } from '../lib/gameApi';
import { readProfile, saveProfile } from '../lib/profile';

export function HomePage() {
  const navigate = useNavigate();
  const defaultProfile = readProfile();
  const [pseudo, setPseudo] = useState(defaultProfile?.pseudo ?? '');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const withPlayer = async () => {
    const profile = pseudo.trim() ? saveProfile(pseudo) : defaultProfile;
    if (!profile || !profile.pseudo) throw new Error('Choisis un pseudo avant de continuer.');
    await ensurePlayer(profile.id, profile.pseudo);
    return profile;
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const player = await withPlayer();
      const result = await createGame(player.id);
      navigate(`/game/${result.game_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const player = await withPlayer();
      await joinGame(player.id, joinCode);
      const { data } = await (await import('../lib/supabase')).supabase
        .from('games')
        .select('id')
        .eq('code', joinCode.toUpperCase())
        .single();
      navigate(`/game/${data?.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-md p-4 flex flex-col gap-4 justify-center">
      <section className="card text-center">
        <p className="text-xs uppercase tracking-widest text-brand-500">PWA Duo</p>
        <h1 className="text-2xl font-black mt-2">Des chiffres et des lettres</h1>
        <p className="text-slate-300 mt-2">Jeu asynchrone à 2 joueurs avec chrono strict par manche.</p>
      </section>

      <form onSubmit={onCreate} className="card flex flex-col gap-3">
        <label className="text-sm">Ton pseudo</label>
        <input
          className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-3"
          value={pseudo}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPseudo(e.target.value)}
          placeholder="Ex: Alex"
          maxLength={24}
        />
        <button className="btn-primary" disabled={loading}>Créer une partie</button>
      </form>

      <form onSubmit={onJoin} className="card flex flex-col gap-3">
        <label className="text-sm">Rejoindre avec un code</label>
        <input
          className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-3 uppercase"
          value={joinCode}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setJoinCode(e.target.value)}
          placeholder="ABCD12"
          maxLength={6}
        />
        <button className="btn-secondary" disabled={loading || joinCode.length < 4}>Rejoindre</button>
      </form>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
    </main>
  );
}
