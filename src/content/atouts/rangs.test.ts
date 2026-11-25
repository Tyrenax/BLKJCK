import { describe, expect, it } from 'vitest';
import { byId, cards, makeState, runScoring, scoringCtx, sum } from '../test/helpers';
import { petitesAtouts } from './petites';
import { tetesAtouts } from './tetes';

const T = (id: string) => byId(tetesAtouts, id);
const S = (id: string) => byId(petitesAtouts, id);

describe('atouts — les grosses cartes', () => {
  it('Cour royale : ×2 par V, D, R', () => {
    expect(sum(runScoring(T('cour-royale'), scoringCtx({ cards: cards('Ks', 'Jh', '10d') }))).xMult).toBe(4);
  });

  it('Gros calibre : +20 Jetons par carte à 10 points', () => {
    expect(sum(runScoring(T('gros-calibre'), scoringCtx({ cards: cards('Ks', '10h', '9d', 'As') }))).chips).toBe(40);
  });

  it('Le Naturel : ×5 Mult et +3 $ sur un Blackjack', () => {
    const s = sum(runScoring(T('le-naturel'), scoringCtx({ cards: cards('As', 'Kh'), figure: 'blackjack' })));
    expect(s.xMult).toBe(5);
    expect(s.money).toBe(3);
    expect(sum(runScoring(T('le-naturel'), scoringCtx({ figure: 'haute' }))).xMult).toBe(1);
  });

  it('As dans la manche : +8 Mult par As qui marque', () => {
    expect(sum(runScoring(T('as-dans-la-manche'), scoringCtx({ cards: cards('Kd', 'As', 'Ah') }))).mult).toBe(16);
  });

  it('Haute société : ×3 si la main ne contient que des As et des cartes à 10 points', () => {
    const d = T('haute-societe');
    expect(sum(runScoring(d, scoringCtx({ cards: cards('As', 'Kh') }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('10s', 'Qh') }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('10s', '9h') }))).xMult).toBe(1);
  });

  it('Jumeaux : +15 Mult quand la main contient une Paire, même si une autre figure marque', () => {
    const d = T('jumeaux');
    expect(sum(runScoring(d, scoringCtx({ figure: 'haute', figures: ['haute', 'paire'] }))).mult).toBe(15);
    expect(sum(runScoring(d, scoringCtx({ figure: 'haute', figures: ['haute'] }))).mult).toBe(0);
  });
});

describe('atouts — petites cartes et Charlie', () => {
  it('Menu fretin : +4 Mult par carte de 2 à 5', () => {
    expect(sum(runScoring(S('menu-fretin'), scoringCtx({ cards: cards('2s', '5h', '6d', '4c') }))).mult).toBe(12);
  });

  it('Nombres premiers : +15 Jetons et +3 Mult par 2, 3, 5, 7', () => {
    const s = sum(runScoring(S('nombres-premiers'), scoringCtx({ cards: cards('2s', '4h', '7d', '9c') })));
    expect(s.chips).toBe(30);
    expect(s.mult).toBe(6);
  });

  it('Sept merveilles : +7 Jetons et +7 Mult par 7', () => {
    const s = sum(runScoring(S('sept-merveilles'), scoringCtx({ cards: cards('7s', '7h', '6d') })));
    expect(s).toMatchObject({ chips: 14, mult: 14 });
  });

  it('Mille-pattes : +15 Jetons par carte', () => {
    expect(sum(runScoring(S('mille-pattes'), scoringCtx({ cards: cards('2s', '3h', '4d', '5c', '6s') }))).chips).toBe(75);
  });

  it('Quatre à quatre : ×3 sur un Charlie', () => {
    expect(sum(runScoring(S('quatre-a-quatre'), scoringCtx({ figure: 'charlie' }))).xMult).toBe(3);
    expect(sum(runScoring(S('quatre-a-quatre'), scoringCtx({ figure: 'haute' }))).xMult).toBe(1);
  });

  it('Rase-mottes : ×4 sur une victoire à 14 ou moins', () => {
    const d = S('rase-mottes');
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 14, dealerTotal: 23, dealerBust: true }))).xMult).toBe(4);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 15, dealerTotal: 23, dealerBust: true }))).xMult).toBe(1);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 14, dealerTotal: 18 }))).xMult).toBe(1);
  });

  it('Écho : la dernière carte marque deux fois', () => {
    const d = S('echo');
    const hand = cards('2s', '3h', '9d');
    const ctx = scoringCtx({ cards: hand, state: makeState() });
    expect(hand.map((c) => d.hooks.retriggers!(ctx, c))).toEqual([0, 0, 1]);
  });
});
