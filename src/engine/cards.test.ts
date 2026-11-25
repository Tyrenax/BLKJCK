import { describe, expect, it } from 'vitest';
import { cardValueOptions, handValue } from './cards';
import { detectFigures } from './figures';
import { baseRules } from './rules';
import { buildRegistry } from './registry';
import { testContent } from './testing/content';
import { parseSpec } from './testing/helpers';
import type { Card, EnhancementId, Rules } from './types';

let nextId = 1000;
function c(spec: string, enhancement?: EnhancementId): Card {
  const card: Card = { id: nextId++, ...parseSpec(spec) };
  if (enhancement) card.enhancement = enhancement;
  return card;
}
const hand = (...specs: string[]): Card[] => specs.map((s) => c(s));
const rules = (over: Partial<Rules> = {}): Rules => ({ ...baseRules(buildRegistry(testContent)), ...over });

describe('valeur de main', () => {
  it('compte les As au mieux', () => {
    expect(handValue(hand('AS', 'KH'), 21)).toEqual({ total: 21, soft: true, bust: false });
    expect(handValue(hand('AS', 'AH'), 21)).toEqual({ total: 12, soft: true, bust: false });
    expect(handValue(hand('AS', 'AH', '9C'), 21)).toEqual({ total: 21, soft: true, bust: false });
    expect(handValue(hand('AS', '6H', 'KC'), 21)).toEqual({ total: 17, soft: false, bust: false });
    expect(handValue(hand('AS', 'AH', 'AD', 'AC'), 21)).toEqual({ total: 14, soft: true, bust: false });
  });

  it('crève au-delà de la limite avec le total minimal', () => {
    expect(handValue(hand('10S', '6H', 'KC'), 21)).toEqual({ total: 26, soft: false, bust: true });
    expect(handValue(hand('KS', 'QH', 'AC', 'AD'), 21)).toEqual({ total: 22, soft: false, bust: true });
  });

  it('respecte la limite courante', () => {
    expect(handValue(hand('10S', '6H', '6C'), 22)).toEqual({ total: 22, soft: false, bust: false });
    expect(handValue(hand('AS', 'KH'), 20).total).toBe(11);
    expect(handValue(hand('10S', 'KH'), 19).bust).toBe(true);
  });

  it('main vide', () => {
    expect(handValue([], 21)).toEqual({ total: 0, soft: false, bust: false });
  });

  it('carte fantôme : 0 dans le total', () => {
    expect(cardValueOptions(c('KS', 'fantome'))).toEqual([0]);
    expect(handValue([c('KS', 'fantome'), c('10H'), c('9C')], 21)).toEqual({ total: 19, soft: false, bust: false });
  });

  it('carte élastique : valeur ou valeur −3, au mieux', () => {
    expect(cardValueOptions(c('8S', 'elastique')).sort((a, b) => a - b)).toEqual([5, 8]);
    expect(cardValueOptions(c('2S', 'elastique')).sort((a, b) => a - b)).toEqual([0, 2]);
    expect(cardValueOptions(c('AS', 'elastique')).sort((a, b) => a - b)).toEqual([0, 1, 8, 11]);
    // 10 + 9 + K élastique = 29 ou 26 -> crevé ; 10 + 6 + 8 élastique = 21 (8 compte 5)
    expect(handValue([c('10S'), c('6H'), c('8C', 'elastique')], 21)).toEqual({ total: 21, soft: false, bust: false });
    expect(handValue([c('10S'), c('5H'), c('8C', 'elastique')], 21)).toEqual({ total: 20, soft: false, bust: false });
    // 10 + 2 + 8 élastique = 20, et l'élastique peut encore descendre : main « souple ».
    expect(handValue([c('10S'), c('2H'), c('8C', 'elastique')], 21)).toEqual({ total: 20, soft: true, bust: false });
    expect(handValue([c('10S'), c('9H'), c('KC', 'elastique')], 21).bust).toBe(true);
  });
});

describe('figures', () => {
  const figs = (cards: Card[], r: Rules = rules(), hits = 0) =>
    detectFigures(testContent, cards, handValue(cards, r.playerLimit), r, hits);

  it('Blackjack : As + carte à 10 en 2 cartes, sans Tirer', () => {
    expect(figs(hand('AS', 'KH'))[0]).toBe('blackjack');
    expect(figs(hand('10D', 'AC'))[0]).toBe('blackjack');
    expect(figs(hand('AS', 'KH'), rules(), 1)[0]).not.toBe('blackjack');
    expect(figs(hand('AS', '5H', '5C'))).not.toContain('blackjack');
    // La Pince (limite 20) : A+R vaut 11, pas de Blackjack.
    expect(figs(hand('AS', 'KH'), rules({ playerLimit: 20 }))).not.toContain('blackjack');
    // La carte à 10 fantôme ne fait pas 21.
    expect(figs([c('AS'), c('KH', 'fantome')])).not.toContain('blackjack');
  });

  it('Pile exclue d’un Blackjack, mais reconnue sinon', () => {
    expect(figs(hand('AS', 'KH'))).not.toContain('pile');
    expect(figs(hand('7S', '7H', '7C'))).toEqual(['triple7', 'pile', 'paire', 'haute']);
    expect(figs(hand('10S', '6H', '6C'), rules({ playerLimit: 22 }))[0]).toBe('pile');
  });

  it('Triple Sept prime sur tout sauf le Blackjack', () => {
    expect(figs(hand('7S', '7H', '7C'))[0]).toBe('triple7');
  });

  it('Charlie selon rules.charlieSize, jamais crevé', () => {
    expect(figs(hand('2S', '3H', '4C', '2D', '5S'))[0]).toBe('charlie');
    expect(figs(hand('2S', '3H', '4C', '2D'))[0]).not.toBe('charlie');
    expect(figs(hand('2S', '3H', '4C', '2D'), rules({ charlieSize: 4 }))[0]).toBe('charlie');
    expect(figs(hand('KS', 'QH', '4C', '2D', '5S'))).not.toContain('charlie');
  });

  it('Couleur : 3 cartes de même enseigne, arlequin joker', () => {
    expect(figs(hand('2H', '5H', '9H'))[0]).toBe('couleur');
    expect(figs(hand('2H', '5H'))).not.toContain('couleur');
    expect(figs([c('2H'), c('5S', 'arlequin'), c('9H')])[0]).toBe('couleur');
    expect(figs([c('2C'), c('5S', 'arlequin'), c('9H')])).not.toContain('couleur');
  });

  it('Paire, Main haute, Petite main', () => {
    expect(figs(hand('8S', '8H'))[0]).toBe('paire');
    expect(figs(hand('10S', '8H'))[0]).toBe('haute');
    expect(figs(hand('10S', '7H'))).toEqual(['haute']);
    expect(figs(hand('10S', '6H'))).toEqual(['petite']);
    // Main haute relative à la limite : avec 22, 17 n'est plus « haute ».
    expect(figs(hand('10S', '7H'), rules({ playerLimit: 22 }))).toEqual(['petite']);
  });

  it('liste triée par priorité du contenu', () => {
    expect(figs(hand('7S', '7H', '7C', '2H', '5H'), rules({ playerLimit: 30 }))).toEqual([
      'triple7',
      'charlie',
      'paire',
      'haute',
    ]);
  });
});
