import { supabase } from './supabase';
import type { AttemptRow, GameRow, RoundRow } from '../types';

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

export const joinGame = async (playerId: string, code: string) => {
  const { error } = await supabase.rpc('join_game_by_code', {
    p_player: playerId,
    p_code: code.toUpperCase(),
  });
  if (error) throw error;
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
