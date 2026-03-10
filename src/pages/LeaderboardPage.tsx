import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDailyLeaderboard, fetchGlobalLeaderboard, fetchPersonalBest } from '../lib/gameApi';
import { readProfile } from '../lib/profile';
import type { LeaderboardScoreRow } from '../types';

const medal = (idx: number) => {
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return `#${idx + 1}`;
};

const LeaderboardList = ({ title, rows }: { title: string; rows: LeaderboardScoreRow[] }) => (
  <section className="card">
    <h2 className="font-bold text-lg">{title}</h2>
    <ul className="mt-3 space-y-2">
      {rows.length === 0 ? (
        <li className="text-sm text-slate-400">Aucun score pour le moment.</li>
      ) : (
        rows.map((row, idx) => (
          <li key={`${row.player_name}-${row.created_at}-${idx}`} className="rounded-lg bg-slate-800 px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{medal(idx)} {row.player_name}</p>
            <p className="text-sm font-black">{row.score} pts</p>
          </li>
        ))
      )}
    </ul>
  </section>
);

export function LeaderboardPage() {
  const navigate = useNavigate();
  const profile = readProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalTop, setGlobalTop] = useState<LeaderboardScoreRow[]>([]);
  const [dailyTop, setDailyTop] = useState<LeaderboardScoreRow[]>([]);
  const [personalBest, setPersonalBest] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [globalRows, dailyRows] = await Promise.all([fetchGlobalLeaderboard(), fetchDailyLeaderboard()]);
        setGlobalTop(globalRows);
        setDailyTop(dailyRows);

        if (profile?.pseudo) {
          const best = await fetchPersonalBest(profile.pseudo);
          setPersonalBest(best);
        } else {
          setPersonalBest(null);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    load().catch(() => undefined);
  }, [profile?.pseudo]);

  const podium = useMemo(() => globalTop.slice(0, 3), [globalTop]);

  return (
    <main className="mx-auto max-w-md min-h-screen p-4 flex flex-col gap-4">
      <section className="card">
        <h1 className="text-2xl font-black">Leaderboard Solo</h1>
        <p className="text-sm text-slate-300 mt-1">Progresse manche après manche et bats ton record.</p>
      </section>

      {podium.length > 0 ? (
        <section className="card">
          <h2 className="font-bold">Podium global</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {podium.map((row, idx) => (
              <div key={`${row.player_name}-${idx}`} className="rounded-lg bg-slate-800 px-2 py-2">
                <p className="text-lg">{medal(idx)}</p>
                <p className="text-xs truncate">{row.player_name}</p>
                <p className="text-sm font-black">{row.score}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <LeaderboardList title="🏆 Classement global" rows={globalTop} />
      <LeaderboardList title="📅 Classement du jour" rows={dailyTop} />

      <section className="card">
        <h2 className="font-bold">🎯 Ton record</h2>
        {profile?.pseudo ? (
          <p className="mt-2 text-sm">{profile.pseudo} : <strong>{personalBest ?? 0} pts</strong></p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Renseigne un pseudo sur l’accueil pour voir ton record.</p>
        )}
      </section>

      <button className="btn-secondary" onClick={() => navigate('/')}>Retour menu</button>
      {loading ? <p className="text-sm text-slate-400">Chargement...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </main>
  );
}
