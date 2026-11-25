/**
 * Aléatoire déterministe. L'état du générateur vit dans `RunState.rngState` : même graine + mêmes
 * actions = même partie. Générateur : mulberry32 (32 bits, rapide, largement suffisant pour un jeu).
 */
import type { Rng } from './types';

/** Hache une graine texte en entier 32 bits non signé (FNV-1a + mélange final). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface RngHolder {
  rngState: number;
}

/** Crée un Rng qui lit et écrit son état dans `holder.rngState`. */
export function createRng(holder: RngHolder): Rng {
  const next = (): number => {
    const a = (holder.rngState + 0x6d2b79f5) >>> 0;
    holder.rngState = a;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    chance(p: number): boolean {
      return next() < p;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Rng.pick : liste vide');
      return items[Math.floor(next() * items.length)];
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
      }
      return items;
    },
  };
}

/** Tirage pondéré. Renvoie null si la liste est vide ou si tous les poids sont nuls. */
export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Graine lisible de 8 caractères pour une nouvelle partie sans graine imposée. Seul endroit où le
 * moteur consomme de l'entropie extérieure (crypto, à défaut l'horloge) ; tout le reste découle de la graine.
 */
export function randomSeed(): string {
  const bytes = new Uint32Array(8);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    let x = Date.now() >>> 0;
    for (let i = 0; i < bytes.length; i++) {
      x = hashSeed(`${x}:${i}`);
      bytes[i] = x;
    }
  }
  let out = '';
  for (const b of bytes) out += SEED_ALPHABET[b % SEED_ALPHABET.length];
  return out;
}
