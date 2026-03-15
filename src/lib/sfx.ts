export type SfxPreset = 'timer' | 'tick' | 'win' | 'neutral';

type AudioContextLike = AudioContext;

type ToneConfig = {
  frequency: number;
  durationMs: number;
  volume: number;
  type?: OscillatorType;
};

const toneMap: Record<SfxPreset, ToneConfig> = {
  timer: { frequency: 880, durationMs: 90, volume: 0.08, type: 'sine' },
  tick: { frequency: 560, durationMs: 35, volume: 0.05, type: 'square' },
  win: { frequency: 1040, durationMs: 140, volume: 0.09, type: 'triangle' },
  neutral: { frequency: 700, durationMs: 80, volume: 0.06, type: 'sine' },
};

const resolveAudioContext = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
};

export type SfxController = {
  unlock: () => Promise<boolean>;
  play: (preset: SfxPreset) => boolean;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  isUnlocked: () => boolean;
};

export const createSfxController = (): SfxController => {
  let ctx: AudioContextLike | null = null;
  let muted = false;
  let unlocked = false;

  const ensureContext = () => {
    if (ctx) return ctx;
    const Ctx = resolveAudioContext();
    if (!Ctx) return null;
    ctx = new Ctx();
    return ctx;
  };

  const playTone = (tone: ToneConfig) => {
    const audio = ensureContext();
    if (!audio) return false;
    if (audio.state === 'suspended') return false;

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.frequency, audio.currentTime);

    const startAt = audio.currentTime;
    const endAt = startAt + tone.durationMs / 1000;

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(tone.volume, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt);

    return true;
  };

  const unlock = async () => {
    const audio = ensureContext();
    if (!audio) return false;

    try {
      if (audio.state === 'suspended') {
        await audio.resume();
      }
      unlocked = audio.state === 'running';
      if (!unlocked) return false;

      const silent = audio.createOscillator();
      const silentGain = audio.createGain();
      silentGain.gain.value = 0.00001;
      silent.connect(silentGain);
      silentGain.connect(audio.destination);
      silent.start();
      silent.stop(audio.currentTime + 0.01);
      return true;
    } catch {
      return false;
    }
  };

  return {
    unlock,
    play: (preset: SfxPreset) => {
      if (muted || !unlocked) return false;
      return playTone(toneMap[preset]);
    },
    setMuted: (nextMuted: boolean) => {
      muted = nextMuted;
    },
    isMuted: () => muted,
    isUnlocked: () => unlocked,
  };
};
