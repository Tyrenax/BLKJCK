/**
 * Profil du joueur : ce qui survit d'une partie à l'autre. Module pur, sans dépendance au navigateur :
 * le stockage (localStorage) est injecté par l'UI via ProfileStorage.
 *
 * Usage côté UI :
 *   let profile = loadProfile(storage);
 *   // à chaque fois que la partie atteint 'victory' puis, plus tard, 'gameOver' :
 *   profile = applyRunResult(profile, state);
 *   saveProfile(storage, profile);
 *
 * applyRunResult se fonde sur la phase : 'victory' compte la partie (jouée + gagnée, mise débloquée) ;
 * 'gameOver' compte une défaite, SAUF si la partie était en mode sans fin (déjà comptée gagnée à la
 * victoire) : on ne met alors à jour que les records. Toute autre phase ne change rien. L'UI l'appelle
 * donc une fois en entrant en victory et une fois en entrant en gameOver.
 *
 * Mises : une mise de rang n se débloque pour un sabot en gagnant la mise n − 1 avec ce même sabot.
 * La mise de rang 0 et tous les sabots sont disponibles d'emblée.
 */
import type { BestHandRecord, RunState } from '../engine/types';

export const PROFILE_VERSION = 1;
/** Clé de sabot quand la partie n'a pas de sabot de départ (contenu sans startingDecks). */
export const DEFAULT_DECK_KEY = 'standard';
/** Clé de mise quand la partie n'a pas de mise (contenu sans stakes). */
export const DEFAULT_STAKE_KEY = 'aucune';

export interface DeckRecord {
  played: number;
  won: number;
  /** Rang de la plus haute mise gagnée avec ce sabot (−1 : aucune). */
  bestStakeWon: number;
}

export interface StakeRecord {
  played: number;
  won: number;
}

export interface ProfileSeen {
  atouts: string[];
  consumables: string[];
  privileges: string[];
  bosses: string[];
  decks: string[];
  stakes: string[];
}

export interface Profile {
  version: number;
  runsPlayed: number;
  runsWon: number;
  byDeck: Record<string, DeckRecord>;
  byStake: Record<string, StakeRecord>;
  bestHand: BestHandRecord | null;
  /** Salon le plus loin atteint (mode sans fin compris). */
  furthestSalon: number;
  /** Collection : tout ce qui a été rencontré au moins une fois. */
  seen: ProfileSeen;
}

/** Interface de stockage injectée par l'UI (localStorage, mémoire pour les tests…). */
export interface ProfileStorage {
  read(): string | null;
  write(data: string): void;
}

export function emptyProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    runsPlayed: 0,
    runsWon: 0,
    byDeck: {},
    byStake: {},
    bestHand: null,
    furthestSalon: 0,
    seen: { atouts: [], consumables: [], privileges: [], bosses: [], decks: [], stakes: [] },
  };
}

function cloneProfile(p: Profile): Profile {
  return {
    ...p,
    byDeck: Object.fromEntries(Object.entries(p.byDeck).map(([k, v]) => [k, { ...v }])),
    byStake: Object.fromEntries(Object.entries(p.byStake).map(([k, v]) => [k, { ...v }])),
    bestHand: p.bestHand ? { ...p.bestHand, cards: p.bestHand.cards.map((c) => ({ ...c })) } : null,
    seen: {
      atouts: [...p.seen.atouts],
      consumables: [...p.seen.consumables],
      privileges: [...p.seen.privileges],
      bosses: [...p.seen.bosses],
      decks: [...p.seen.decks],
      stakes: [...p.seen.stakes],
    },
  };
}

const deckKey = (s: Readonly<RunState>): string => s.deckId ?? DEFAULT_DECK_KEY;
const stakeKey = (s: Readonly<RunState>): string => s.stakeId ?? DEFAULT_STAKE_KEY;

function addAll(into: string[], items: readonly (string | null | undefined)[]): void {
  for (const it of items) if (it && !into.includes(it)) into.push(it);
}

/** Intègre la fin (ou la victoire) d'une partie au profil. Pure : renvoie un nouveau profil. */
export function applyRunResult(profile: Readonly<Profile>, state: Readonly<RunState>): Profile {
  const p = cloneProfile(profile as Profile);
  const won = state.phase === 'victory';
  const lost = state.phase === 'gameOver';
  if (!won && !lost) return p;

  const deck = (p.byDeck[deckKey(state)] ??= { played: 0, won: 0, bestStakeWon: -1 });
  const stake = (p.byStake[stakeKey(state)] ??= { played: 0, won: 0 });
  // En mode sans fin, la partie a déjà été comptée (gagnée) à la victoire.
  const alreadyCounted = lost && state.endless === true;
  if (!alreadyCounted) {
    p.runsPlayed++;
    deck.played++;
    stake.played++;
  }
  if (won) {
    p.runsWon++;
    deck.won++;
    stake.won++;
    deck.bestStakeWon = Math.max(deck.bestStakeWon, state.stakeLevel ?? 0);
  }

  if (state.bestHand && state.bestHand.score > (p.bestHand?.score ?? -1)) {
    p.bestHand = { ...state.bestHand, cards: state.bestHand.cards.map((c) => ({ ...c })) };
  }
  p.furthestSalon = Math.max(p.furthestSalon, state.salon);

  addAll(p.seen.atouts, [...(state.seen?.atouts ?? []), ...state.atouts.map((a) => a.defId)]);
  addAll(p.seen.consumables, [...(state.seen?.consumables ?? []), ...state.consumables.map((c) => c.defId)]);
  addAll(p.seen.privileges, [...(state.seen?.privileges ?? []), ...state.privileges]);
  addAll(p.seen.bosses, [...(state.bossHistory ?? []), state.bossId]);
  addAll(p.seen.decks, [state.deckId]);
  addAll(p.seen.stakes, [state.stakeId]);
  return p;
}

/** Plus haut rang de mise jouable avec ce sabot (0 = seulement la première). */
export function unlockedStakeLevel(profile: Readonly<Profile>, deckId?: string): number {
  const rec = profile.byDeck[deckId ?? DEFAULT_DECK_KEY];
  return Math.max(0, (rec?.bestStakeWon ?? -1) + 1);
}

export function isStakeUnlocked(profile: Readonly<Profile>, deckId: string | undefined, stakeLevel: number): boolean {
  return stakeLevel <= unlockedStakeLevel(profile, deckId);
}

export function serializeProfile(profile: Readonly<Profile>): string {
  return JSON.stringify(profile);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/** Lit un profil ; tolère les champs manquants (profil plus ancien) ; renvoie un profil vide si illisible. */
export function deserializeProfile(json: string | null | undefined): Profile {
  if (!json) return emptyProfile();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return emptyProfile();
  }
  if (!isObj(raw)) return emptyProfile();
  const p = emptyProfile();
  p.runsPlayed = num(raw.runsPlayed);
  p.runsWon = num(raw.runsWon);
  p.furthestSalon = num(raw.furthestSalon);
  if (isObj(raw.byDeck)) {
    for (const [k, v] of Object.entries(raw.byDeck)) {
      if (isObj(v)) p.byDeck[k] = { played: num(v.played), won: num(v.won), bestStakeWon: num(v.bestStakeWon, -1) };
    }
  }
  if (isObj(raw.byStake)) {
    for (const [k, v] of Object.entries(raw.byStake)) {
      if (isObj(v)) p.byStake[k] = { played: num(v.played), won: num(v.won) };
    }
  }
  if (isObj(raw.bestHand) && Array.isArray(raw.bestHand.cards) && typeof raw.bestHand.score === 'number') {
    p.bestHand = raw.bestHand as unknown as BestHandRecord;
  }
  if (isObj(raw.seen)) {
    const s = raw.seen;
    p.seen = {
      atouts: strs(s.atouts),
      consumables: strs(s.consumables),
      privileges: strs(s.privileges),
      bosses: strs(s.bosses),
      decks: strs(s.decks),
      stakes: strs(s.stakes),
    };
  }
  return p;
}

export function loadProfile(storage: ProfileStorage): Profile {
  try {
    return deserializeProfile(storage.read());
  } catch {
    return emptyProfile();
  }
}

/** Écrit le profil ; renvoie false si le stockage a refusé (navigation privée, quota…). */
export function saveProfile(storage: ProfileStorage, profile: Readonly<Profile>): boolean {
  try {
    storage.write(serializeProfile(profile));
    return true;
  } catch {
    return false;
  }
}
