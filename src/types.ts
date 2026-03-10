export type RoundType = 'letters' | 'numbers';

export interface Profile {
  id: string;
  pseudo: string;
}

export interface GameRow {
  id: string;
  code: string;
  created_by: string;
  mode: 'duo' | 'solo';
  status: 'waiting' | 'active' | 'finished';
  current_round_index: number;
}

export interface RoundRow {
  id: string;
  game_id: string;
  round_index: number;
  round_type: RoundType;
  payload: {
    letters?: string[];
    numbers?: number[];
    target?: number;
  };
  letters_duration_sec: number;
  numbers_duration_sec: number;
}

export interface AttemptRow {
  id: string;
  game_id: string;
  round_id: string;
  player_id: string;
  started_at: string | null;
  deadline_at: string | null;
  answer_text: string | null;
  answer_value: number | null;
  points: number;
  status: 'pending' | 'started' | 'submitted' | 'expired';
}

export interface LeaderboardScoreRow {
  player_name: string;
  score: number;
  created_at: string;
}
