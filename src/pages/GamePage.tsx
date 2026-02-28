import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FRENCH_WORDS } from '../data/frenchWords';
import { fetchGameBundle, startRound, submitLetters, submitNumbers } from '../lib/gameApi';
import { normalizeWord } from '../lib/normalize';
import { readProfile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import type { AttemptRow, RoundRow } from '../types';

const dictionary = new Set(FRENCH_WORDS.map((word) => normalizeWord(word)));

const secondsLeft = (deadline: string | null) => {
  if (!deadline) return 0;
  return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
};

export function GamePage() {
  const { gameId = '' } = useParams();
  const profile = readProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [gameCode, setGameCode] = useState('');
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [word, setWord] = useState('');
  const [expr, setExpr] = useState('');
  const [clock, setClock] = useState(0);
  const [allAttempts, setAllAttempts] = useState<AttemptRow[]>([]);

  const myAttempt = attempts.find((a) => a.round_id === rounds[currentRoundIndex]?.id);
  const round = rounds[currentRoundIndex];

  const refresh = async () => {
    if (!profile) return;
    setLoading(true);
    const bundle = await fetchGameBundle(gameId, profile.id);
    setRounds(bundle.rounds);
    setAttempts(bundle.attempts);
    setGameCode(bundle.game.code);
    setCurrentRoundIndex(bundle.game.current_round_index);
    const roundId = bundle.rounds[bundle.game.current_round_index]?.id;
    if (roundId) {
      const { data } = await supabase.from('attempts').select('*').eq('round_id', roundId);
      setAllAttempts((data ?? []) as AttemptRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!profile) {
      setError('Crée ton pseudo depuis la page d’accueil.');
      setLoading(false);
      return;
    }
    refresh().catch((e) => {
      setError((e as Error).message);
      setLoading(false);
    });
    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!myAttempt?.deadline_at) {
      setClock(0);
      return;
    }
    setClock(secondsLeft(myAttempt.deadline_at));
    const timer = window.setInterval(() => {
      setClock(secondsLeft(myAttempt.deadline_at));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [myAttempt?.deadline_at]);

  const canStart = myAttempt?.status === 'pending';
  const canSubmit = myAttempt?.status === 'started' && clock > 0;

  const letterCheck = useMemo(() => {
    if (round?.round_type !== 'letters') return '';
    const normalized = normalizeWord(word);
    if (!normalized) return '';
    const available = [...(round.payload.letters ?? [])];
    for (const char of normalized) {
      const idx = available.indexOf(char);
      if (idx === -1) return '⚠️ Ce mot utilise des lettres absentes du tirage.';
      available.splice(idx, 1);
    }
    if (!dictionary.has(normalized)) return '⚠️ Mot non trouvé dans le dictionnaire embarqué.';
    return '✅ Mot valide localement. Tu peux soumettre.';
  }, [round, word]);

  const onStartRound = async () => {
    if (!myAttempt) return;
    await startRound(myAttempt.id);
    await refresh();
  };

  const onSubmit = async () => {
    if (!myAttempt || !round) return;
    if (round.round_type === 'letters') {
      await submitLetters(myAttempt.id, word);
      setWord('');
    } else {
      await submitNumbers(myAttempt.id, expr);
      setExpr('');
    }
    await refresh();
  };

  const myScore = attempts.reduce((sum, a) => sum + (a.points ?? 0), 0);
  const oppScore = allAttempts
    .filter((a) => a.player_id !== profile?.id)
    .reduce((sum, a) => sum + (a.points ?? 0), 0);

  if (!profile) {
    return <main className="p-4">Profil absent.</main>;
  }

  return (
    <main className="mx-auto max-w-md min-h-screen p-4 flex flex-col gap-4">
      <section className="card">
        <p className="text-sm text-slate-400">Code partie à partager</p>
        <p className="text-3xl font-black tracking-widest">{gameCode || '...'}</p>
      </section>

      <section className="card flex justify-between">
        <div>
          <p className="text-xs text-slate-400">Manche</p>
          <p className="text-lg font-bold">{currentRoundIndex + 1} / 9</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Type</p>
          <p className="text-lg font-bold capitalize">{round?.round_type ?? '-'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Temps restant</p>
          <p className="text-lg font-bold text-brand-500">{clock}s</p>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">1) Prêt ?</h2>
        <p className="text-sm text-slate-300">Le tirage est caché jusqu’au clic sur Démarrer.</p>
        {canStart ? <button className="btn-primary" onClick={onStartRound}>Démarrer la manche</button> : null}

        {myAttempt?.status === 'started' ? (
          <>
            <h3 className="font-bold">2) Tirage</h3>
            {round?.round_type === 'letters' ? (
              <div className="flex gap-2 flex-wrap">
                {round.payload.letters?.map((letter, idx) => (
                  <span key={`${letter}-${idx}`} className="rounded-lg bg-slate-800 px-3 py-2 text-xl font-black uppercase">{letter}</span>
                ))}
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {round?.payload.numbers?.map((n, idx) => (
                    <span key={`${n}-${idx}`} className="rounded-lg bg-slate-800 px-3 py-2 text-xl font-black">{n}</span>
                  ))}
                </div>
                <p>Cible : <strong>{round.payload.target}</strong></p>
              </>
            )}

            {round?.round_type === 'letters' ? (
              <>
                <input className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-3" value={word} onChange={(e) => setWord(e.target.value)} placeholder="Ton mot" />
                {letterCheck ? <p className="text-xs">{letterCheck}</p> : null}
              </>
            ) : (
              <input className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-3" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="Ex: (100+7)*5" />
            )}
            <button className="btn-primary" disabled={!canSubmit} onClick={onSubmit}>Soumettre</button>
          </>
        ) : null}

        {myAttempt?.status === 'submitted' || myAttempt?.status === 'expired' ? (
          <p className="text-emerald-400">Manche terminée. Attends l’autre joueur pour débloquer la suite.</p>
        ) : null}
      </section>

      <section className="card">
        <h2 className="font-bold">Score</h2>
        <p>Toi : <strong>{myScore}</strong> pts</p>
        <p>Adversaire : <strong>{oppScore}</strong> pts</p>
      </section>

      <button className="btn-secondary" onClick={() => refresh().catch((e) => setError((e as Error).message))}>Rafraîchir</button>
      {loading ? <p className="text-slate-400 text-sm">Chargement...</p> : null}
      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
    </main>
  );
}
