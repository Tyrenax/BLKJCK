/** Réglages du joueur (préférence par navigateur : localStorage suffit). */

export interface Settings {
  /** Intensité de l'écran cathodique 0–100. */
  crt: number;
  /** Fumée animée. */
  bgMotion: boolean;
  /** Secousses d'écran. */
  shake: boolean;
  /** Vitesse du jeu. */
  speed: 1 | 2 | 4;
  /** Volume 0–100. */
  volume: number;
  muted: boolean;
  /** Spectre du prochain tirage sur la Jauge. */
  spectrum: boolean;
  /** Musique 0–100 (coupée par défaut). */
  music: number;
  /** Enchaîner les mains : la suivante part seule après le verdict. */
  autoNext: boolean;
}

const KEY = 'sabot.settings';

function defaults(): Settings {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { crt: 45, bgMotion: !reduced, shake: !reduced, speed: 1, volume: 70, muted: false, spectrum: true, music: 0, autoNext: false };
}

function load(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      crt: typeof p.crt === 'number' ? Math.max(0, Math.min(100, p.crt)) : d.crt,
      bgMotion: typeof p.bgMotion === 'boolean' ? p.bgMotion : d.bgMotion,
      shake: typeof p.shake === 'boolean' ? p.shake : d.shake,
      speed: p.speed === 2 || p.speed === 4 ? p.speed : 1,
      volume: typeof p.volume === 'number' ? Math.max(0, Math.min(100, p.volume)) : d.volume,
      muted: typeof p.muted === 'boolean' ? p.muted : d.muted,
      spectrum: typeof p.spectrum === 'boolean' ? p.spectrum : d.spectrum,
      music: typeof p.music === 'number' ? Math.max(0, Math.min(100, p.music)) : d.music,
      autoNext: typeof p.autoNext === 'boolean' ? p.autoNext : d.autoNext,
    };
  } catch {
    return d;
  }
}

export const settings: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* stockage indisponible : on garde en mémoire */
  }
  for (const l of listeners) l(settings);
}

export function onSettings(l: (s: Settings) => void): () => void {
  listeners.add(l);
  l(settings);
  return () => listeners.delete(l);
}
