/**
 * Cartes : rangs, enseignes, valeur de main.
 *
 * Valeur de main : chaque carte offre une ou plusieurs valeurs possibles et le moteur choisit la
 * combinaison la plus haute qui ne dépasse pas la limite (sinon la plus basse : main crevée).
 *  - As : 11 ou 1.
 *  - fantome : 0 (mais marque quand même ses Jetons).
 *  - elastique : sa valeur OU sa valeur −3 (plancher 0). Un As élastique vaut 11, 8, 1 ou 0.
 */
import type { Card, CardColor, EnhancementId, HandValue, Rank, Suit } from './types';

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const ENHANCEMENT_IDS: readonly EnhancementId[] = [
  'plombee',
  'ardente',
  'cristal',
  'doree',
  'marquee',
  'fantome',
  'elastique',
  'arlequin',
];

/** Valeur haute d'un rang : As 11, figures 10. C'est aussi ce que la carte marque en Jetons. */
export function rankValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** V, D, R. */
export function isFaceRank(rank: Rank): boolean {
  return rank === 'J' || rank === 'Q' || rank === 'K';
}

/** 10, V, D, R (la carte qui fait un Blackjack avec un As). */
export function isTenRank(rank: Rank): boolean {
  return rank === '10' || isFaceRank(rank);
}

export function suitColor(suit: Suit): CardColor {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

/** Enseignes portées par une carte (arlequin = les quatre). */
export function cardSuits(card: Card): readonly Suit[] {
  return card.enhancement === 'arlequin' ? SUITS : [card.suit];
}

export function cardHasSuit(card: Card, suit: Suit): boolean {
  return card.enhancement === 'arlequin' || card.suit === suit;
}

/** Couleurs portées par une carte (arlequin = rouge ET noire). */
export function cardColors(card: Card): readonly CardColor[] {
  return card.enhancement === 'arlequin' ? ['red', 'black'] : [suitColor(card.suit)];
}

/** Jetons marqués par la carte elle-même (2–10, figures 10, As 11), quelle que soit l'amélioration. */
export function cardChips(card: Card): number {
  return rankValue(card.rank);
}

/** Valeurs possibles d'une carte dans le total. */
export function cardValueOptions(card: Card): number[] {
  if (card.enhancement === 'fantome') return [0];
  const base = card.rank === 'A' ? [11, 1] : [rankValue(card.rank)];
  if (card.enhancement !== 'elastique') return base;
  const out = new Set<number>(base);
  for (const v of base) out.add(Math.max(0, v - 3));
  return [...out];
}

/** Total au mieux pour le joueur : le plus haut ≤ limite, sinon le plus bas (crevé). */
export function handValue(cards: readonly Card[], limit: number): HandValue {
  let totals = new Set<number>([0]);
  for (const c of cards) {
    const opts = cardValueOptions(c);
    const next = new Set<number>();
    for (const t of totals) for (const o of opts) next.add(t + o);
    totals = next;
  }
  let best = -Infinity;
  let min = Infinity;
  for (const t of totals) {
    if (t <= limit && t > best) best = t;
    if (t < min) min = t;
  }
  if (best !== -Infinity) return { total: best, soft: best !== min, bust: false };
  return { total: min, soft: false, bust: true };
}

/** 52 cartes standard, ids consécutifs à partir de `firstId`. */
export function makeStandardDeck(firstId: number): Card[] {
  const out: Card[] = [];
  let id = firstId;
  for (const suit of SUITS) for (const rank of RANKS) out.push({ id: id++, rank, suit });
  return out;
}

/** Copie superficielle (les cartes n'ont que des champs primitifs). */
export function copyCard(card: Card): Card {
  return { ...card };
}

const SUIT_SYMBOL: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RANK_LABEL: Record<Rank, string> = {
  A: 'A',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'V',
  Q: 'D',
  K: 'R',
};

/** Libellé court en français (« D♥ », « 10♠ »). */
export function cardLabel(card: Card): string {
  return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}
