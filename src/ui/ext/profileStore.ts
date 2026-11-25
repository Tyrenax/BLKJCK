/**
 * Le profil côté navigateur : lecture/écriture dans localStorage (via src/profile, module pur),
 * et enregistrement d'une fin de partie une seule fois par partie et par phase.
 */
import type { RunState } from '../../engine/types';
import {
  applyRunResult,
  emptyProfile,
  loadProfile,
  type Profile,
  type ProfileStorage,
  saveProfile,
  unlockedStakeLevel,
} from '../../profile';

const KEY = 'sabot.profile';

const storage: ProfileStorage = {
  read: () => localStorage.getItem(KEY),
  write: (d) => localStorage.setItem(KEY, d),
};

let cache: Profile | null = null;
/** Profil de démonstration (captures) : jamais écrit sur le disque. */
let demo: Profile | null = null;
const recorded = new Set<string>();

export function getProfile(): Profile {
  if (demo) return demo;
  return (cache ??= loadProfile(storage));
}

export function setDemoProfile(p: Profile | null): void {
  demo = p;
}

export interface RecordResult {
  profile: Profile;
  /** Rang de mise débloqué par cette partie pour son sabot (null : rien de neuf). */
  unlockedLevel: number | null;
}

/** Intègre une victoire ou une défaite au profil (une seule fois par partie et par phase). */
export function recordRun(s: RunState): RecordResult {
  const before = getProfile();
  const key = `${s.seed}|${s.deckId ?? ''}|${s.stakeId ?? ''}|${s.phase}`;
  if (recorded.has(key) || (s.phase !== 'victory' && s.phase !== 'gameOver')) return { profile: before, unlockedLevel: null };
  recorded.add(key);
  const after = applyRunResult(before, s);
  if (demo) demo = after;
  else {
    cache = after;
    saveProfile(storage, after);
  }
  const lv0 = unlockedStakeLevel(before, s.deckId);
  const lv1 = unlockedStakeLevel(after, s.deckId);
  return { profile: after, unlockedLevel: lv1 > lv0 ? lv1 : null };
}

export { emptyProfile };
