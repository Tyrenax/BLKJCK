/**
 * Figures (types de main). Les conditions sont fixées par le moteur ; l'ordre de priorité et les
 * valeurs viennent du contenu (FigureDef.priority / baseChips / baseMult / …PerLevel).
 *
 *  blackjack : exactement 2 cartes, un As + un 10/V/D/R, total 21, sans Tirer ni Doubler
 *              (une carte donnée par une combine ne compte pas comme un Tirer).
 *  triple7   : au moins trois 7.
 *  charlie   : au moins rules.charlieSize cartes, sans crever.
 *  pile      : total exactement égal à la limite (exclue si la main est un Blackjack).
 *  couleur   : au moins 3 cartes partageant une même enseigne (arlequin = joker d'enseigne).
 *  paire     : au moins deux cartes de même rang.
 *  haute     : limite − 4 ≤ total ≤ limite.
 *  petite    : seulement si aucune autre figure.
 * Les cartes neutralisées par un patron comptent pour la figure (elles ne marquent simplement rien).
 */
import { cardHasSuit, isTenRank, SUITS } from './cards';
import type { Card, Content, FigureId, HandValue, Rules } from './types';

export const FIGURE_IDS: readonly FigureId[] = [
  'blackjack',
  'triple7',
  'charlie',
  'pile',
  'couleur',
  'paire',
  'haute',
  'petite',
];

export function isBlackjack(cards: readonly Card[], value: HandValue, hits: number): boolean {
  if (cards.length !== 2 || hits !== 0 || value.bust || value.total !== 21) return false;
  const [a, b] = cards;
  return (a.rank === 'A' && isTenRank(b.rank)) || (b.rank === 'A' && isTenRank(a.rank));
}

/** Toutes les figures satisfaites, triées par priorité décroissante (la première marque). */
export function detectFigures(
  content: Content,
  cards: readonly Card[],
  value: HandValue,
  rules: Readonly<Rules>,
  hits: number,
): FigureId[] {
  const found = new Set<FigureId>();
  const blackjack = isBlackjack(cards, value, hits);
  if (blackjack) found.add('blackjack');
  if (cards.filter((c) => c.rank === '7').length >= 3) found.add('triple7');
  if (!value.bust && cards.length >= rules.charlieSize) found.add('charlie');
  if (!value.bust && !blackjack && value.total === rules.playerLimit) found.add('pile');
  if (cards.length >= 3 && SUITS.some((s) => cards.every((c) => cardHasSuit(c, s)))) found.add('couleur');
  const ranks = new Set<string>();
  for (const c of cards) {
    if (ranks.has(c.rank)) {
      found.add('paire');
      break;
    }
    ranks.add(c.rank);
  }
  if (!value.bust && value.total >= rules.playerLimit - 4) found.add('haute');
  if (found.size === 0) found.add('petite');
  return sortFigures(content, [...found]);
}

export function sortFigures(content: Content, figures: FigureId[]): FigureId[] {
  const prio = (f: FigureId): number => content.figures[f]?.priority ?? -FIGURE_IDS.indexOf(f);
  return figures.sort((a, b) => prio(b) - prio(a));
}

/** Jetons et Mult de base d'une figure à un niveau donné. */
export function figureBase(content: Content, figure: FigureId, level: number): { chips: number; mult: number } {
  const def = content.figures[figure];
  if (!def) return { chips: 0, mult: 1 };
  const lv = Math.max(1, level) - 1;
  return { chips: def.baseChips + def.chipsPerLevel * lv, mult: def.baseMult + def.multPerLevel * lv };
}
