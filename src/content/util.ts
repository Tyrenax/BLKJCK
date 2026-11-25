import type {
  AtoutInstance,
  Card,
  CardColor,
  HookContext,
  Rank,
  ScoreEffect,
  ScoreEffects,
  Suit,
} from '../engine/types';

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const SUIT_GLYPH: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

export function suitColor(suit: Suit): CardColor {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

/** Une carte Arlequin compte comme les quatre enseignes (donc les deux couleurs). */
export function hasSuit(card: Card, suit: Suit): boolean {
  return card.suit === suit || card.enhancement === 'arlequin';
}

export function hasColor(card: Card, color: CardColor): boolean {
  return card.enhancement === 'arlequin' || suitColor(card.suit) === color;
}

/** V, D, R. */
export function isFace(card: Card): boolean {
  return card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
}

/** Cartes à 10 points : 10, V, D, R. */
export function isTenValue(card: Card): boolean {
  return card.rank === '10' || isFace(card);
}

/** 2 à 5. */
export function isSmall(card: Card): boolean {
  return card.rank === '2' || card.rank === '3' || card.rank === '4' || card.rank === '5';
}

export function isPrime(card: Card): boolean {
  return card.rank === '2' || card.rank === '3' || card.rank === '5' || card.rank === '7';
}

/** Valeur « haute » d'un rang (As = 11, V/D/R = 10). C'est aussi sa valeur en Jetons. */
export function rankValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/**
 * Total d'une main selon les règles du moteur (types.ts) :
 * As = 11 ou 1, Fantôme = 0, Élastique = sa valeur ou sa valeur − 3 ; au mieux pour le joueur
 * (le plus haut total qui ne dépasse pas la limite, sinon le plus bas).
 * Sert aux combines qui doivent anticiper un tirage (Filet). Le moteur reste la référence.
 */
export function handTotal(cards: readonly Card[], limit: number): { total: number; bust: boolean } {
  let min = 0;
  const bumps: number[] = [];
  for (const c of cards) {
    if (c.enhancement === 'fantome') continue;
    if (c.rank === 'A') {
      min += 1;
      bumps.push(10);
    } else if (c.enhancement === 'elastique') {
      const v = rankValue(c.rank);
      min += v - 3;
      bumps.push(3);
    } else {
      min += rankValue(c.rank);
    }
  }
  // Toutes les sommes atteignables (peu de bosses : au plus quelques As/élastiques).
  let reachable = new Set<number>([min]);
  for (const b of bumps) {
    const next = new Set<number>(reachable);
    for (const t of reachable) next.add(t + b);
    reachable = next;
  }
  let best = -1;
  for (const t of reachable) if (t <= limit && t > best) best = t;
  if (best >= 0) return { total: best, bust: false };
  return { total: min, bust: true };
}

/** Lit un compteur numérique d'un atout (0 par défaut). */
export function n(self: AtoutInstance | null | undefined, key: string, fallback = 0): number {
  const v = self?.state[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Écrit un compteur numérique d'un atout. */
export function setN(self: AtoutInstance | null | undefined, key: string, value: number): void {
  if (self) self.state[key] = value;
}

/** Fait payer le joueur sans jamais passer sous 0 $. */
export function pay(ctx: HookContext, amount: number, reason: string): void {
  const due = Math.min(Math.max(0, Math.floor(amount)), Math.max(0, ctx.state.money));
  if (due > 0) ctx.api.addMoney(-due, reason);
}

/** Nombre au format français (1.5 -> « 1,5 »). */
export function fr(x: number): string {
  return String(Math.round(x * 100) / 100).replace('.', ',');
}

/** Normalise le retour d'un crochet de marquage en tableau. */
export function effectsOf(e: ScoreEffects): ScoreEffect[] {
  if (!e) return [];
  return Array.isArray(e) ? e : [e];
}
