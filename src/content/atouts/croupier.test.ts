import { describe, expect, it } from 'vitest';
import { byId, cards, hookCtx, makeState, result, rulesWith, runScoring, scoringCtx, sum } from '../test/helpers';
import { croupierAtouts as C } from './croupier';

const def = (id: string) => byId(C, id);

describe('atouts — le croupier', () => {
  it('règles du croupier : nerveux 18, prudent 16, fatigué crève dès 21', () => {
    expect(rulesWith(def('croupier-nerveux')).dealerStandOn).toBe(18);
    expect(rulesWith(def('croupier-prudent')).dealerStandOn).toBe(16);
    expect(rulesWith(def('croupier-fatigue')).dealerLimit).toBe(20);
  });

  it('Rayons X et Miroir posent leur drapeau', () => {
    expect(rulesWith(def('rayons-x')).seeDealerHole).toBe(true);
    expect(rulesWith(def('miroir')).pushCountsAsWin).toBe(true);
  });

  it('Casse-banque : ×3 Mult seulement si le croupier crève', () => {
    const d = def('casse-banque');
    expect(sum(runScoring(d, scoringCtx({ dealerTotal: 24, dealerBust: true }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ dealerTotal: 18 }))).xMult).toBe(1);
  });

  it("David : ×3 Mult sur une victoire d'exactement 1 point, pas si le croupier crève", () => {
    const d = def('david');
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 19, dealerTotal: 18 }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 20, dealerTotal: 18 }))).xMult).toBe(1);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 1, dealerTotal: 25, dealerBust: true }))).xMult).toBe(1);
  });

  it('Vampire : +3 Jetons par point du croupier si tu ne perds pas (même s’il crève)', () => {
    const d = def('vampire');
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 20, dealerTotal: 18 }))).chips).toBe(54);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 18, dealerTotal: 18 }))).chips).toBe(54);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 15, dealerTotal: 24, dealerBust: true }))).chips).toBe(72);
    expect(runScoring(d, scoringCtx({ playerTotal: 17, dealerTotal: 19 }))).toEqual([]);
  });

  it('Rayons X : carte cachée visible et +1 Mult par carte du croupier', () => {
    const d = def('rayons-x');
    expect(sum(runScoring(d, scoringCtx({ dealer: cards('10c', '5d', '4h') }))).mult).toBe(3);
  });

  it('Croupier nerveux : +4 Mult quand il crève ; Croupier prudent : +30 Jetons sur une victoire', () => {
    expect(sum(runScoring(def('croupier-nerveux'), scoringCtx({ dealerTotal: 24, dealerBust: true }))).mult).toBe(4);
    expect(runScoring(def('croupier-nerveux'), scoringCtx({ dealerTotal: 18 }))).toEqual([]);
    expect(sum(runScoring(def('croupier-prudent'), scoringCtx({ playerTotal: 20, dealerTotal: 18 }))).chips).toBe(30);
    expect(runScoring(def('croupier-prudent'), scoringCtx({ playerTotal: 17, dealerTotal: 19 }))).toEqual([]);
  });

  it('Pickpocket : +2 $ par V, D, R du croupier', () => {
    const d = def('pickpocket');
    const ctx = hookCtx({ state: makeState({ hand: { dealerCards: cards('Ks', 'Qh', '10d', '2c') } }) });
    d.hooks.onHandEnd!(ctx, result());
    expect(ctx.api.moneyDelta()).toBe(4);
    const none = hookCtx({ state: makeState({ hand: { dealerCards: cards('9s', '8h') } }) });
    d.hooks.onHandEnd!(none, result());
    expect(none.api.calls).toHaveLength(0);
  });

  it('Charognard : +4 $ quand le croupier crève', () => {
    const d = def('charognard');
    const ctx = hookCtx();
    d.hooks.onHandEnd!(ctx, result({ dealerBust: true }));
    d.hooks.onHandEnd!(ctx, result({ dealerBust: false }));
    expect(ctx.api.moneyDelta()).toBe(4);
  });

  it("Coupe-gorge : +2 Mult par point d'écart sans que le croupier crève", () => {
    const d = def('coupe-gorge');
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 21, dealerTotal: 17 }))).mult).toBe(8);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 15, dealerTotal: 23, dealerBust: true }))).mult).toBe(0);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 17, dealerTotal: 19 }))).mult).toBe(0);
  });
});
