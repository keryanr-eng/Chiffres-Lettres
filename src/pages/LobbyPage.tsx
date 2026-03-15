import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchGameBundle, startMultiGame } from '../lib/gameApi';
import { readProfile } from '../lib/profile';

export function LobbyPage() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const profile = readProfile();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [gameStatus, setGameStatus] = useState<'waiting' | 'active' | 'finished'>('waiting');
  const [mode, setMode] = useState<'duo' | 'solo' | 'daily' | 'multi'>('multi');
  const [hostId, setHostId] = useState('');
  const [players, setPlayers] = useState<Array<{ id: string; pseudo: string }>>([]);

  const refresh = async () => {
    if (!profile) return;
    const bundle = await fetchGameBundle(gameId, profile.id);
    setGameCode(bundle.game.code);
    setGameStatus(bundle.game.status);
    setMode(bundle.game.mode);
    setHostId(bundle.game.created_by);
    setPlayers(bundle.players);
    setLoading(false);

    if (bundle.game.status === 'active') {
      navigate(`/game/${gameId}`);
    }
  };

  useEffect(() => {
    if (!profile) {
      setError('Crée ton pseudo depuis l’accueil avant de rejoindre une room.');
      setLoading(false);
      return;
    }

    refresh().catch((err) => {
      setError((err as Error).message);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!profile || gameStatus !== 'waiting') return;
    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, gameStatus, gameId]);

  const isHost = profile?.id === hostId;

  const onStart = async () => {
    if (!profile) return;
    setError('');
    try {
      await startMultiGame(gameId, profile.id);
      navigate(`/game/${gameId}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copyCode = async () => {
    if (!gameCode) return;
    try {
      await navigator.clipboard.writeText(gameCode);
    } catch {
      // no-op
    }
  };

  return (
    <main className="mx-auto max-w-md min-h-screen p-4 flex flex-col gap-4">
      <section className="card">
        <p className="text-sm text-brand-500 font-semibold">Partie multi</p>
        <h1 className="text-2xl font-black mt-1">Lobby</h1>
        <p className="text-sm text-slate-300 mt-1">Mode: {mode}</p>
      </section>

      <section className="card">
        <p className="text-sm text-slate-400">Code de la room</p>
        <p className="text-3xl font-black tracking-widest">{gameCode || '...'}</p>
        <button className="btn-secondary mt-3" onClick={copyCode}>Copier le code</button>
      </section>

      <section className="card">
        <h2 className="font-bold">Joueurs ({players.length}/8)</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {players.map((player) => (
            <li key={player.id} className="rounded-lg bg-slate-800 px-3 py-2 flex items-center justify-between">
              <span>{player.pseudo}</span>
              {player.id === hostId ? <span className="text-xs text-brand-500 font-semibold">Hôte</span> : null}
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <button className="btn-primary" onClick={onStart} disabled={players.length < 2}>Lancer la partie</button>
      ) : (
        <p className="text-sm text-slate-300">En attente du lancement par l’hôte…</p>
      )}

      <button className="btn-secondary" onClick={() => navigate('/')}>Retour menu</button>

      {loading ? <p className="text-sm text-slate-400">Chargement…</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </main>
  );
}
