import { supabase } from './supabase';
import type { AttemptRow, DailyChallengeInfo, DailySubmitResult, GameRow, LeaderboardScoreRow, RoundRow } from '../types';

export const ROUND_FLOW = ['letters', 'letters', 'numbers', 'letters', 'letters', 'numbers', 'letters', 'letters', 'numbers'] as const;

export const ensurePlayer = async (playerId: string, pseudo: string) => {
  await supabase.from('players').upsert({ id: playerId, pseudo }, { onConflict: 'id' });
};

export const createGame = async (playerId: string) => {
  const { data, error } = await supabase.rpc('create_game_with_rounds', { p_creator: playerId });
  if (error) throw error;
  return data as { game_id: string; code: string };
};

export const createSoloGame = async (playerId: string) => {
  const { data, error } = await supabase.rpc('create_solo_game_with_rounds', { p_creator: playerId });
  if (error) throw error;
  return data as { game_id: string; code: string };
};

export const createMultiGame = async (playerId: string) => {
  const { data, error } = await supabase.rpc('create_multi_game', { p_creator: playerId });
  if (error) throw error;
  return data as { game_id: string; code: string };
};


export const getOrCreateDailyChallenge = async () => {
  const { data, error } = await supabase.rpc('get_or_create_daily_challenge');
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as DailyChallengeInfo[]) : [];
  const row = rows[0] ?? null;
  if (!row) throw new Error('Défi du jour indisponible');
  return row;
};

export const createDailyGame = async (playerId: string) => {
  const { data, error } = await supabase.rpc('create_daily_game_with_rounds', { p_creator: playerId });
  if (error) throw error;
  return data as { game_id: string; code: string; challenge_date: string };
};

export const joinGame = async (playerId: string, code: string) => {
  const { data, error } = await supabase.rpc('join_game_by_code', {
    p_player: playerId,
    p_code: code.toUpperCase(),
  });
  if (error) throw error;
  return data as { game_id: string; mode: 'duo' | 'multi'; status: 'waiting' | 'active' | 'finished' };
};

export const fetchGameBundle = async (gameId: string, playerId: string) => {
  const { data, error } = await supabase.rpc('get_game_state', {
    p_game_id: gameId,
    p_player_id: playerId,
  });
  if (error) throw error;

  const payload = data as {
    game: GameRow;
    rounds: RoundRow[];
    attempts: AttemptRow[];
    players: { id: string; pseudo: string }[];
  };

  const myAttempts = (payload.attempts ?? []).filter((attempt) => attempt.player_id === playerId);

  return {
    game: payload.game,
    rounds: payload.rounds ?? [],
    attempts: myAttempts,
    allAttempts: payload.attempts ?? [],
    players: payload.players ?? [],
  };
};

export const startRound = async (attemptId: string) => {
  const { data, error } = await supabase.rpc('start_attempt', { p_attempt_id: attemptId });
  if (error) throw error;
  return data as { started_at: string; deadline_at: string };
};

export const startCurrentRoundForPlayer = async (gameId: string, playerId: string) => {
  const { data, error } = await supabase.rpc('start_current_round_for_player', {
    p_game_id: gameId,
    p_player_id: playerId,
  });
  if (error) throw error;
  return data as { attempt_id: string; start: { started_at: string; deadline_at: string } };
};

export const submitLetters = async (attemptId: string, answer: string) => {
  const { data, error } = await supabase.rpc('submit_letters_attempt', {
    p_attempt_id: attemptId,
    p_answer: answer,
  });
  if (error) throw error;
  return data as { points: number; status: 'submitted' | 'expired' | 'invalid'; answer_text?: string };
};

export const submitNumbers = async (attemptId: string, finalValue: number | null, trace?: string | null) => {
  const { data, error } = await supabase.rpc('submit_numbers_attempt', {
    p_attempt_id: attemptId,
    p_result: finalValue,
    p_expression: trace ?? null,
  });
  if (error) throw error;
  return data as { points: number; computed_value: number; status: string };
};

export const submitLeaderboardScore = async (playerName: string, score: number) => {
  const { data, error } = await supabase.rpc('submit_leaderboard_score', {
    p_player_name: playerName,
    p_score: score,
  });
  if (error) throw error;
  return data as { ok: boolean };
};

export const fetchGlobalLeaderboard = async () => {
  const { data, error } = await supabase.rpc('get_leaderboard_global');
  if (error) throw error;
  return (data ?? []) as LeaderboardScoreRow[];
};

export const fetchDailyLeaderboard = async () => {
  const { data, error } = await supabase.rpc('get_leaderboard_daily');
  if (error) throw error;
  return (data ?? []) as LeaderboardScoreRow[];
};

export const fetchPersonalBest = async (playerName: string) => {
  const { data, error } = await supabase.rpc('get_personal_best', {
    p_player_name: playerName,
  });
  if (error) throw error;

  const rows = Array.isArray(data) ? (data as Array<{ best_score: number | null }>) : [];
  return rows[0]?.best_score ?? null;
};


export const submitDailyScore = async (playerName: string, score: number) => {
  const { data, error } = await supabase.rpc('submit_daily_score', {
    p_player_name: playerName,
    p_score: score,
  });
  if (error) throw error;
  return data as DailySubmitResult;
};

export const fetchDailyChallengeLeaderboard = async () => {
  const { data, error } = await supabase.rpc('get_daily_challenge_leaderboard');
  if (error) throw error;
  return (data ?? []) as LeaderboardScoreRow[];
};

export const startMultiGame = async (gameId: string, playerId: string) => {
  const { data, error } = await supabase.rpc('start_multi_game', {
    p_game_id: gameId,
    p_player_id: playerId,
  });
  if (error) throw error;
  return data as { ok: boolean; game_id: string };
};
