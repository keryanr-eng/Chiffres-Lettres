import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FRENCH_WORDS } from '../data/frenchWords';
import { createGame, fetchGameBundle, joinGame, startRound, submitLetters, submitNumbers } from '../lib/gameApi';
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

type LetterTile = { id: string; letter: string };
type PlayerLite = { id: string; pseudo: string };

const dictionary = new Set(FRENCH_WORDS.map((word) => normalizeWord(word)));

const secondsLeft = (deadline: string | null) => {
  if (!deadline) return 0;
  return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
};

const initCalcTiles = (numbers: number[] = []) =>
  numbers.map((value, idx) => ({ id: `${idx}-${value}`, value }));

const initLetterTiles = (letters: string[] = []) =>
  letters.map((letter, idx) => ({ id: `l-${idx}-${letter}`, letter }));

const applyOperation = (a: number, b: number, op: CalcOp) => {
  if (op === '+') return { ok: true, value: a + b } as const;
  if (op === '-') return { ok: true, value: a - b } as const;
  if (op === '*') return { ok: true, value: a * b } as const;
  if (b === 0 || a % b !== 0) return { ok: false, value: 0 } as const;
  return { ok: true, value: a / b } as const;
};

const vibrateLight = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(10);
  }
};

export function GamePage() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const profile = readProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [allGameAttempts, setAllGameAttempts] = useState<AttemptRow[]>([]);
  const [gameCode, setGameCode] = useState('');
  const [gameStatus, setGameStatus] = useState<'waiting' | 'active' | 'finished'>('waiting');
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [clock, setClock] = useState(0);
  const [allAttempts, setAllAttempts] = useState<AttemptRow[]>([]);
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [letterSubmitError, setLetterSubmitError] = useState('');
  const [dismissedResultRound, setDismissedResultRound] = useState<number | null>(null);

  const [letterTiles, setLetterTiles] = useState<LetterTile[]>([]);
  const [letterOrder, setLetterOrder] = useState<string[]>([]);
  const [selectedLetterIds, setSelectedLetterIds] = useState<string[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);

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
  const canSubmitNumbers = isStarted && clock > 0 && calcFinalValue !== null;
  const inputDisabled = !isStarted || clock === 0 || isFinished;

  const myScore = allGameAttempts
    .filter((attempt) => attempt.player_id === profile?.id)
    .reduce((sum, a) => sum + (a.points ?? 0), 0);

  const target = round?.payload.target ?? 0;
  const liveGap = calcFinalValue === null ? '-' : Math.abs(target - calcFinalValue);

  const composedWord = useMemo(() => {
    const byId = new Map(letterTiles.map((tile) => [tile.id, tile.letter]));
    return selectedLetterIds.map((id) => byId.get(id) ?? '').join('');
  }, [letterTiles, selectedLetterIds]);

  const normalizedWord = useMemo(() => normalizeWord(composedWord), [composedWord]);

  const letterValidation = useMemo(() => {
    if (round?.round_type !== 'letters') return { valid: false, message: '' };
    if (!normalizedWord) return { valid: false, message: '' };

    const available = [...(round.payload.letters ?? [])];
    for (const char of normalizedWord) {
      const idx = available.indexOf(char);
      if (idx === -1) return { valid: false, message: '⚠️ Ce mot utilise des lettres absentes du tirage.' };
      available.splice(idx, 1);
    }

    if (!dictionary.has(normalizedWord)) return { valid: false, message: '⚠️ Mot invalide (hors dictionnaire).' };
    return { valid: true, message: '✅ Mot valide. Tu peux valider.' };
  }, [round, normalizedWord]);

  const refresh = async () => {
    if (!profile) return;
    setLoading(true);
    const bundle = await fetchGameBundle(gameId, profile.id);
    setRounds(bundle.rounds);
    setAttempts(bundle.attempts);
    setGameCode(bundle.game.code);
    setCurrentRoundIndex(bundle.game.current_round_index);
    setGameStatus(bundle.game.status);

    const roundId = bundle.rounds[bundle.game.current_round_index]?.id;

    const [{ data: currentRoundAttempts }, { data: allAttemptsData }, { data: gamePlayersData }] = await Promise.all([
      roundId ? supabase.from('attempts').select('*').eq('round_id', roundId) : Promise.resolve({ data: [] }),
      supabase.from('attempts').select('*').eq('game_id', gameId),
      supabase
        .from('game_players')
        .select('player_id, players!inner(id, pseudo)')
        .eq('game_id', gameId),
    ]);

    setAllAttempts((currentRoundAttempts ?? []) as AttemptRow[]);
    setAllGameAttempts((allAttemptsData ?? []) as AttemptRow[]);
    const parsedPlayers = (gamePlayersData ?? []).map((row) => {
      const playersField = (row as { players: { id: string; pseudo: string }[] }).players;
      const player = Array.isArray(playersField) ? playersField[0] : null;
      return { id: player?.id ?? '', pseudo: player?.pseudo ?? 'Joueur' };
    }).filter((player) => player.id);
    setPlayers(parsedPlayers);
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

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`attempts-game-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attempts', filter: `game_id=eq.${gameId}` },
        () => {
          refresh().catch(() => undefined);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, profile?.id]);

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

  useEffect(() => {
    if (round?.round_type !== 'letters') return;
    const tiles = initLetterTiles(round.payload.letters);
    setLetterTiles(tiles);
    setLetterOrder(tiles.map((tile) => tile.id));
    setSelectedLetterIds([]);
    setIsShuffling(false);
    setLetterSubmitError('');
  }, [round?.id, round?.round_type, round?.payload.letters]);

  useEffect(() => {
    setDismissedResultRound(null);
  }, [currentRoundIndex]);

  const onStartRound = async () => {
    if (!myAttempt) return;
    await startRound(myAttempt.id);
    await refresh();
  };

  const onSubmit = async () => {
    if (!myAttempt || !round || !isStarted || isFinished) return;
    vibrateLight();

    if (round.round_type === 'letters') {
      if (!letterValidation.valid) {
        setLetterSubmitError('Mot invalide. Corrige ton mot avant de valider.');
        return;
      }

      setLetterSubmitError('');
      const result = await submitLetters(myAttempt.id, composedWord);
      if (result.status === 'invalid') {
        setLetterSubmitError('Mot invalide. Corrige ton mot avant de valider.');
        return;
      }
      setSelectedLetterIds([]);
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

  const onLetterTileClick = (tileId: string) => {
    if (inputDisabled || round?.round_type !== 'letters') return;
    if (selectedLetterIds.includes(tileId)) return;
    vibrateLight();
    setLetterSubmitError('');
    setSelectedLetterIds((prev) => [...prev, tileId]);
  };

  const onWordTileClick = (tileId: string, index: number) => {
    if (inputDisabled || round?.round_type !== 'letters') return;
    vibrateLight();
    setSelectedLetterIds((prev) => {
      if (prev[index] !== tileId) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
    setLetterSubmitError('');
  };

  const onBackspace = () => {
    if (inputDisabled || selectedLetterIds.length === 0) return;
    vibrateLight();
    setSelectedLetterIds((prev) => prev.slice(0, -1));
    setLetterSubmitError('');
  };

  const onClearWord = () => {
    if (inputDisabled || selectedLetterIds.length === 0) return;
    vibrateLight();
    setSelectedLetterIds([]);
    setLetterSubmitError('');
  };

  const onShuffleLetters = () => {
    if (inputDisabled || round?.round_type !== 'letters') return;
    vibrateLight();
    setLetterOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setIsShuffling(true);
    window.setTimeout(() => setIsShuffling(false), 180);
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

  const usedLetterIds = new Set(selectedLetterIds);
  const letterById = new Map(letterTiles.map((tile) => [tile.id, tile]));

  const currentRoundFinishedByBoth = allAttempts.length === 2 && allAttempts.every((a) => a.status === 'submitted' || a.status === 'expired');

  const displayedResultRoundIndex = currentRoundFinishedByBoth
    ? currentRoundIndex
    : currentRoundIndex > 0
      ? currentRoundIndex - 1
      : null;

  const resultRound = displayedResultRoundIndex !== null ? rounds[displayedResultRoundIndex] : undefined;
  const resultRoundAttempts = resultRound
    ? allGameAttempts.filter((attempt) => attempt.round_id === resultRound.id)
    : [];

  const showResultPanel =
    displayedResultRoundIndex !== null &&
    dismissedResultRound !== displayedResultRoundIndex &&
    resultRoundAttempts.length === 2 &&
    resultRoundAttempts.every((attempt) => attempt.status === 'submitted' || attempt.status === 'expired');

  const totalsByPlayer = allGameAttempts.reduce<Record<string, number>>((acc, attempt) => {
    acc[attempt.player_id] = (acc[attempt.player_id] ?? 0) + (attempt.points ?? 0);
    return acc;
  }, {});

  const goToNextRound = () => {
    setDismissedResultRound(displayedResultRoundIndex);
    refresh().catch(() => undefined);
  };

  const onReplay = async () => {
    if (!profile) return;
    try {
      const newGame = await createGame(profile.id);
      const opponent = players.find((player) => player.id !== profile.id);
      if (opponent) {
        await joinGame(opponent.id, newGame.code);
      }
      navigate(`/game/${newGame.game_id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!profile) {
    return <main className="p-4">Profil absent.</main>;
  }

  if (gameStatus === 'finished') {
    const sortedFinal = players
      .map((player) => ({
        ...player,
        total: totalsByPlayer[player.id] ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    return (
      <main className="mx-auto max-w-md min-h-screen p-4 flex flex-col gap-4">
        <section className="card">
          <h1 className="text-2xl font-black">Partie terminée 🎉</h1>
          <p className="text-slate-300 mt-1">Score final</p>
          <div className="mt-3 space-y-2">
            {sortedFinal.map((player) => (
              <div key={player.id} className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
                <p className="font-semibold">{player.pseudo}</p>
                <p className="font-black">{player.total} pts</p>
              </div>
            ))}
          </div>
        </section>

        <button className="btn-primary" onClick={onReplay}>Rejouer</button>
        <button className="btn-secondary" onClick={() => navigate('/')}>Retour menu</button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md min-h-screen p-4 flex flex-col gap-4 overflow-x-hidden">
      <section className="card">
        <p className="text-sm text-slate-400">Code partie à partager</p>
        <p className="text-3xl font-black tracking-widest">{gameCode || '...'}</p>
      </section>

      {showResultPanel ? (
        <section className="card">
          <h2 className="font-bold">Résultat manche {displayedResultRoundIndex! + 1}</h2>
          <div className="mt-3 space-y-2">
            {players.map((player) => {
              const attempt = resultRoundAttempts.find((row) => row.player_id === player.id);
              return (
                <div key={player.id} className="rounded-lg bg-slate-800 px-3 py-2">
                  <p className="font-semibold">{player.pseudo}</p>
                  <p className="text-sm text-slate-300">Réponse : {attempt?.answer_text ?? '—'}</p>
                  <p className="text-sm">Points manche : <strong>{attempt?.points ?? 0}</strong></p>
                  <p className="text-sm">Total : <strong>{totalsByPlayer[player.id] ?? 0}</strong></p>
                </div>
              );
            })}
          </div>
          <button className="btn-primary mt-3" onClick={goToNextRound}>Manche suivante</button>
        </section>
      ) : null}

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-base">{roundTitle}</h2>
          <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-sm font-bold text-brand-500">{clock}s</span>
        </div>

        {canStart ? <button className="btn-primary" onClick={onStartRound}>Démarrer</button> : null}

        {myAttempt && myAttempt.status !== 'pending' ? (
          <>
            {round?.round_type === 'letters' ? (
              <>
                <div className={`grid grid-cols-3 gap-2 transition-transform duration-200 ${isShuffling ? 'scale-[0.97]' : 'scale-100'}`}>
                  {letterOrder.map((tileId) => {
                    const tile = letterById.get(tileId);
                    if (!tile) return null;
                    const used = usedLetterIds.has(tile.id);
                    return (
                      <button
                        key={tile.id}
                        className={`rounded-lg px-3 py-3 text-center text-xl font-black uppercase border transition ${
                          used
                            ? 'bg-slate-800/40 border-slate-700/40 text-slate-500'
                            : 'bg-slate-800 border-slate-700 text-slate-100 active:scale-[0.98]'
                        }`}
                        disabled={inputDisabled || used}
                        onClick={() => onLetterTileClick(tile.id)}
                      >
                        {tile.letter}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                  <p className="text-xs text-slate-400 mb-2">Mot en cours</p>
                  <div className="flex flex-wrap gap-2 min-h-10">
                    {selectedLetterIds.length === 0 ? (
                      <span className="text-slate-500 text-sm">Aucune lettre sélectionnée.</span>
                    ) : (
                      selectedLetterIds.map((id, idx) => (
                        <button
                          key={`${id}-${idx}`}
                          className="rounded-md bg-brand-500 text-slate-950 px-2 py-1 text-sm font-bold"
                          onClick={() => onWordTileClick(id, idx)}
                          disabled={inputDisabled}
                        >
                          {letterById.get(id)?.letter ?? ''}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-sm">
                  <button className="btn-secondary py-2" onClick={onBackspace} disabled={inputDisabled || selectedLetterIds.length === 0}>Retour</button>
                  <button className="btn-secondary py-2" onClick={onClearWord} disabled={inputDisabled || selectedLetterIds.length === 0}>Effacer</button>
                  <button className="btn-secondary py-2 col-span-2" onClick={onShuffleLetters} disabled={inputDisabled}>Mélanger</button>
                </div>

                {letterSubmitError ? <p className="text-rose-400 text-sm">{letterSubmitError}</p> : null}
                {isStarted && clock > 0 && letterValidation.message ? <p className="text-xs">{letterValidation.message}</p> : null}
              </>
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

            <button
              className="btn-primary"
              disabled={round?.round_type === 'letters' ? !isStarted || clock <= 0 : !canSubmitNumbers}
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
        <div className="space-y-1">
          {players.map((player) => (
            <p key={player.id}>{player.pseudo} : <strong>{totalsByPlayer[player.id] ?? 0}</strong> pts</p>
          ))}
        </div>
        <p className="text-sm text-slate-400 mt-2">Ton total : {myScore} pts</p>
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
