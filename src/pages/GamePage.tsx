import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FRENCH_WORDS } from '../data/frenchWords';
import { fetchGameBundle, startRound, submitLetters, submitNumbers } from '../lib/gameApi';
import { normalizeWord } from '../lib/normalize';
import { readProfile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import type { AttemptRow, RoundRow } from '../types';

type CalcTile = { id: string; value: number };
type CalcStep = 'pick_first' | 'pick_operation' | 'pick_second';
type CalcOp = '+' | '-' | '*' | '/';
type CalcSnapshot = {
  tiles: CalcTile[];
  history: string[];
  trace: string;
  finalValue: number | null;
  step: CalcStep;
  firstTileId: string | null;
  operation: CalcOp | null;
};

const dictionary = new Set(FRENCH_WORDS.map((word) => normalizeWord(word)));

const secondsLeft = (deadline: string | null) => {
  if (!deadline) return 0;
  return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
};

const initCalcTiles = (numbers: number[] = []) =>
  numbers.map((value, idx) => ({ id: `${idx}-${value}`, value }));

const applyOperation = (a: number, b: number, op: CalcOp) => {
  if (op === '+') return { ok: true, value: a + b } as const;
  if (op === '-') return { ok: true, value: a - b } as const;
  if (op === '*') return { ok: true, value: a * b } as const;
  if (b === 0 || a % b !== 0) return { ok: false, value: 0 } as const;
  return { ok: true, value: a / b } as const;
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
  const [clock, setClock] = useState(0);
  const [allAttempts, setAllAttempts] = useState<AttemptRow[]>([]);

  const [calcTiles, setCalcTiles] = useState<CalcTile[]>([]);
  const [calcHistory, setCalcHistory] = useState<string[]>([]);
  const [calcTrace, setCalcTrace] = useState('');
  const [calcUndoStack, setCalcUndoStack] = useState<CalcSnapshot[]>([]);
  const [calcFinalValue, setCalcFinalValue] = useState<number | null>(null);
  const [calcError, setCalcError] = useState('');
  const [calcStep, setCalcStep] = useState<CalcStep>('pick_first');
  const [firstTileId, setFirstTileId] = useState<string | null>(null);
  const [operation, setOperation] = useState<CalcOp | null>(null);

  const myAttempt = attempts.find((a) => a.round_id === rounds[currentRoundIndex]?.id);
  const round = rounds[currentRoundIndex];
  const roundTitle = `Manche ${currentRoundIndex + 1}/9 · ${round?.round_type === 'numbers' ? 'Chiffres' : 'Lettres'}`;

  const isStarted = myAttempt?.status === 'started';
  const isFinished = myAttempt?.status === 'submitted' || myAttempt?.status === 'expired';
  const canStart = myAttempt?.status === 'pending';
  const isTimeUpWithoutSubmit = isStarted && clock === 0;
  const canSubmitLetters = isStarted && clock > 0;
  const canSubmitNumbers = isStarted && clock > 0 && calcFinalValue !== null;
  const inputDisabled = !isStarted || clock === 0 || isFinished;

  const myScore = attempts.reduce((sum, a) => sum + (a.points ?? 0), 0);
  const oppScore = allAttempts
    .filter((a) => a.player_id !== profile?.id)
    .reduce((sum, a) => sum + (a.points ?? 0), 0);

  const target = round?.payload.target ?? 0;
  const liveGap = calcFinalValue === null ? '-' : Math.abs(target - calcFinalValue);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const isWaitingState = !!myAttempt && (myAttempt.status === 'pending' || myAttempt.status === 'submitted' || myAttempt.status === 'expired');

  useEffect(() => {
    if (!profile || !isWaitingState) return;
    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isWaitingState, gameId]);

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

  useEffect(() => {
    if (round?.round_type !== 'numbers') return;
    setCalcTiles(initCalcTiles(round.payload.numbers));
    setCalcHistory([]);
    setCalcTrace('');
    setCalcUndoStack([]);
    setCalcFinalValue(null);
    setCalcError('');
    setCalcStep('pick_first');
    setFirstTileId(null);
    setOperation(null);
  }, [round?.id, round?.round_type, round?.payload.numbers]);

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
    if (!myAttempt || !round || !isStarted || isFinished) return;
    if (round.round_type === 'letters') {
      await submitLetters(myAttempt.id, word);
      setWord('');
    } else {
      await submitNumbers(myAttempt.id, calcFinalValue, calcTrace || `Résultat final: ${String(calcFinalValue)}`);
    }
    await refresh();
  };

  const onPass = async () => {
    if (!myAttempt || !round || !isTimeUpWithoutSubmit || isFinished) return;
    if (round.round_type === 'letters') {
      await submitLetters(myAttempt.id, '');
    } else {
      await submitNumbers(myAttempt.id, null, 'Passé (temps écoulé)');
    }
    await refresh();
  };

  const clearSelection = () => {
    setCalcStep('pick_first');
    setFirstTileId(null);
    setOperation(null);
    setCalcError('');
  };

  const selectOperation = (op: CalcOp) => {
    if (inputDisabled || round?.round_type !== 'numbers') return;
    if (calcStep !== 'pick_operation') return;
    setOperation(op);
    setCalcStep('pick_second');
    setCalcError('');
  };

  const onTileClick = (tileId: string) => {
    if (inputDisabled || round?.round_type !== 'numbers') return;

    if (calcStep === 'pick_first') {
      setFirstTileId(tileId);
      setCalcStep('pick_operation');
      setOperation(null);
      setCalcError('');
      return;
    }

    if (calcStep === 'pick_operation') {
      if (tileId === firstTileId) {
        setCalcStep('pick_first');
        setFirstTileId(null);
      } else {
        setFirstTileId(tileId);
      }
      setCalcError('');
      return;
    }

    if (calcStep === 'pick_second') {
      if (!firstTileId || !operation || firstTileId === tileId) return;
      const aTile = calcTiles.find((tile) => tile.id === firstTileId);
      const bTile = calcTiles.find((tile) => tile.id === tileId);
      if (!aTile || !bTile) return;

      const result = applyOperation(aTile.value, bTile.value, operation);
      if (!result.ok) {
        setCalcError('Division non entière interdite.');
        setCalcStep('pick_operation');
        return;
      }

      const snapshot: CalcSnapshot = {
        tiles: calcTiles,
        history: calcHistory,
        trace: calcTrace,
        finalValue: calcFinalValue,
        step: calcStep,
        firstTileId,
        operation,
      };

      const opLabel = operation === '*' ? '×' : operation === '/' ? '÷' : operation;
      const stepText = `${aTile.value} ${opLabel} ${bTile.value} = ${result.value}`;
      const remaining = calcTiles.filter((tile) => tile.id !== aTile.id && tile.id !== bTile.id);
      const newTile: CalcTile = {
        id: `r-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        value: result.value,
      };
      const nextHistory = [...calcHistory, stepText];

      setCalcUndoStack((prev) => [...prev, snapshot]);
      setCalcTiles([...remaining, newTile]);
      setCalcHistory(nextHistory);
      setCalcTrace(nextHistory.join(' | '));
      setCalcFinalValue(result.value);
      setCalcStep('pick_first');
      setFirstTileId(null);
      setOperation(null);
      setCalcError('');
    }
  };

  const undoLast = () => {
    if (inputDisabled || calcUndoStack.length === 0) return;
    const previous = calcUndoStack[calcUndoStack.length - 1];
    setCalcUndoStack((stack) => stack.slice(0, -1));
    setCalcTiles(previous.tiles);
    setCalcHistory(previous.history);
    setCalcTrace(previous.trace);
    setCalcFinalValue(previous.finalValue);
    setCalcStep('pick_first');
    setFirstTileId(null);
    setOperation(null);
    setCalcError('');
  };

  const restartCalc = () => {
    if (round?.round_type !== 'numbers') return;
    setCalcTiles(initCalcTiles(round.payload.numbers));
    setCalcHistory([]);
    setCalcTrace('');
    setCalcUndoStack([]);
    setCalcFinalValue(null);
    setCalcError('');
    setCalcStep('pick_first');
    setFirstTileId(null);
    setOperation(null);
  };

  if (!profile) {
    return <main className="p-4">Profil absent.</main>;
  }

  return (
    <main className="mx-auto max-w-md min-h-screen p-4 flex flex-col gap-4 overflow-x-hidden">
      <section className="card">
        <p className="text-sm text-slate-400">Code partie à partager</p>
        <p className="text-3xl font-black tracking-widest">{gameCode || '...'}</p>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-base">{roundTitle}</h2>
          <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-sm font-bold text-brand-500">{clock}s</span>
        </div>

        {canStart ? <button className="btn-primary" onClick={onStartRound}>Démarrer</button> : null}

        {myAttempt && myAttempt.status !== 'pending' ? (
          <>
            {round?.round_type === 'letters' ? (
              <div className="grid grid-cols-3 gap-2">
                {round.payload.letters?.map((letter, idx) => (
                  <span
                    key={`${letter}-${idx}`}
                    className="rounded-lg bg-slate-800 px-3 py-3 text-center text-xl font-black uppercase"
                  >
                    {letter}
                  </span>
                ))}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-xl bg-slate-800/70 border border-slate-700 px-3 py-2">
                  <p className="text-sm text-slate-300">Cible</p>
                  <p className="text-2xl font-black">{target}</p>
                </div>

                <p className="text-xs text-slate-400">
                  {calcStep === 'pick_first' ? 'Étape 1/3 : sélectionne le 1er nombre.' : null}
                  {calcStep === 'pick_operation' ? 'Étape 2/3 : choisis une opération.' : null}
                  {calcStep === 'pick_second' ? 'Étape 3/3 : sélectionne le 2e nombre.' : null}
                </p>

                <div className="grid grid-cols-3 gap-2">
                  {calcTiles.map((tile) => {
                    const isFirst = firstTileId === tile.id;
                    const disabledInStepC = calcStep === 'pick_second' && isFirst;
                    return (
                      <button
                        key={tile.id}
                        className={`rounded-lg px-3 py-3 text-lg font-black border transition ${
                          isFirst
                            ? 'bg-brand-500 text-slate-950 border-brand-500'
                            : 'bg-slate-800 border-slate-700'
                        } ${disabledInStepC ? 'opacity-50' : ''}`}
                        onClick={() => onTileClick(tile.id)}
                        disabled={inputDisabled || disabledInStepC}
                      >
                        {tile.value}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(['+', '-', '*', '/'] as const).map((op) => {
                    const isSelected = operation === op;
                    return (
                      <button
                        key={op}
                        className={`btn-secondary px-0 ${isSelected ? 'ring-2 ring-brand-500' : ''}`}
                        disabled={inputDisabled || calcStep !== 'pick_operation'}
                        onClick={() => selectOperation(op)}
                      >
                        {op === '*' ? '×' : op === '/' ? '÷' : op}
                      </button>
                    );
                  })}
                </div>

                {calcError ? <p className="text-amber-300 text-xs">{calcError}</p> : null}

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <button className="btn-secondary py-2" disabled={inputDisabled || calcUndoStack.length === 0} onClick={undoLast}>Annuler</button>
                  <button className="btn-secondary py-2" disabled={inputDisabled} onClick={restartCalc}>Recommencer</button>
                  <button className="btn-secondary py-2" disabled={inputDisabled || calcStep === 'pick_first'} onClick={clearSelection}>Effacer sélection</button>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-3">
                  <p className="text-xs text-slate-400">Résultat actuel</p>
                  <p className="text-3xl font-black">{calcFinalValue ?? '-'}</p>
                  <p className="text-sm text-slate-300 mt-1">Écart : <strong>{liveGap}</strong></p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 max-h-36 overflow-y-auto">
                  <p className="text-xs text-slate-400 mb-2">Historique</p>
                  {calcHistory.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucune opération pour le moment.</p>
                  ) : (
                    <ul className="text-sm space-y-1">
                      {calcHistory.map((line, idx) => (
                        <li key={`${line}-${idx}`} className="text-slate-200">{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {round?.round_type === 'letters' ? (
              <>
                <input
                  className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-3 disabled:opacity-60"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="Ton mot"
                  disabled={inputDisabled}
                />
                {isStarted && clock > 0 && letterCheck ? <p className="text-xs">{letterCheck}</p> : null}
              </>
            ) : null}

            <button
              className="btn-primary"
              disabled={round?.round_type === 'letters' ? !canSubmitLetters : !canSubmitNumbers}
              onClick={onSubmit}
            >
              Valider
            </button>
          </>
        ) : null}

        {isTimeUpWithoutSubmit ? (
          <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <p className="text-xs text-amber-300">Temps écoulé — en attente de l'adversaire</p>
            <button className="text-xs underline text-amber-200" onClick={onPass}>Passer</button>
          </div>
        ) : null}

        {isFinished ? (
          <p className="text-emerald-400 text-sm">Manche terminée. Attends l’autre joueur pour débloquer la suite.</p>
        ) : null}
      </section>

      <section className="card">
        <h2 className="font-bold">Score</h2>
        <p>Toi : <strong>{myScore}</strong> pts</p>
        <p>Adversaire : <strong>{oppScore}</strong> pts</p>
      </section>

      <button
        className="text-sm text-slate-400 underline self-start"
        onClick={() => refresh().catch((e) => setError((e as Error).message))}
      >
        Actualiser
      </button>

      {loading ? <p className="text-slate-400 text-sm">Chargement...</p> : null}
      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
    </main>
  );
}
