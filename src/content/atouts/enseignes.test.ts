import { describe, expect, it } from 'vitest';
import { byId, card, cards, fakeRng, hookCtx, instance, makeState, runScoring, scoringCtx, sum } from '../test/helpers';
import { enseignesAtouts as E } from './enseignes';

const def = (id: string) => byId(E, id);

describe('atouts — les enseignes', () => {
  it('Sang chaud / Pique-assiette / Rivière de carreaux : par carte de leur enseigne', () => {
    const hand = [card('2h'), card('3h'), card('Ks'), card('4d')];
    expect(sum(runScoring(def('sang-chaud'), scoringCtx({ cards: hand }))).mult).toBe(10);
    expect(sum(runScoring(def('pique-assiette'), scoringCtx({ cards: hand }))).chips).toBe(30);
    expect(sum(runScoring(def('riviere-de-carreaux'), scoringCtx({ cards: hand }))).money).toBe(2);
  });

  it('une carte Arlequin compte pour toutes les enseignes', () => {
    const hand = [card('9c', 'arlequin')];
    expect(sum(runScoring(def('sang-chaud'), scoringCtx({ cards: hand }))).mult).toBe(5);
    expect(sum(runScoring(def('pique-assiette'), scoringCtx({ cards: hand }))).chips).toBe(30);
  });

  it('Trèfle à quatre feuilles : ×2 Mult sur un tirage favorable (1 chance sur 3)', () => {
    const d = def('trefle-a-quatre-feuilles');
    const hand = cards('5c', '6c', '7h');
    // 0.1 < 1/3 : réussi ; 0.9 : raté.
    expect(sum(runScoring(d, scoringCtx({ cards: hand, rng: fakeRng([0.1, 0.9]) }))).xMult).toBe(2);
    expect(sum(runScoring(d, scoringCtx({ cards: hand, rng: fakeRng([0.9]) }))).xMult).toBe(1);
  });

  it('Rouge ou noir : tire une couleur par main, ×1,5 par carte de cette couleur', () => {
    const d = def('rouge-ou-noir');
    const self = instance(d);
    const ctx = hookCtx({ self, rng: fakeRng([0.9]) }); // int(0,1) -> 1 = noir
    d.hooks.onHandStart!(ctx);
    expect(self.state.color).toBe(1);
    expect(ctx.api.argsOf('trigger')[0]).toEqual(['Noir !']);
    const hand = cards('Ks', 'Qc', '2h');
    expect(sum(runScoring(d, scoringCtx({ cards: hand, self }))).xMult).toBeCloseTo(2.25);
    self.state.color = 0;
    expect(sum(runScoring(d, scoringCtx({ cards: hand, self }))).xMult).toBeCloseTo(1.5);
    const inHand = makeState({ hand: { playerCards: hand } });
    expect(typeof d.description === 'function' && d.description(self, inHand)).toContain('Cette main : rouge');
    expect(typeof d.description === 'function' && d.description(self, makeState({ table: null }))).not.toContain(
      'Cette main',
    );
  });

  it('Monochrome : ×2,5 si toutes les cartes sont de la même couleur', () => {
    const d = def('monochrome');
    expect(sum(runScoring(d, scoringCtx({ cards: cards('Ks', '9c') }))).xMult).toBe(2.5);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('Kh', '9d', '2h') }))).xMult).toBe(2.5);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('Kh', '9c') }))).xMult).toBe(1);
    expect(sum(runScoring(d, scoringCtx({ cards: [card('Kh'), card('9c', 'arlequin')] }))).xMult).toBe(2.5);
  });

  it('Arc-en-ciel : ×2 avec trois enseignes ou plus', () => {
    const d = def('arc-en-ciel');
    expect(sum(runScoring(d, scoringCtx({ cards: cards('2s', '3h', '4d') }))).xMult).toBe(2);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('2s', '3h', '4d', '5c') }))).xMult).toBe(2);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('2s', '3h', '4h') }))).xMult).toBe(1);
    expect(sum(runScoring(d, scoringCtx({ cards: [card('2s'), card('4d', 'arlequin')] }))).xMult).toBe(2);
  });
});
