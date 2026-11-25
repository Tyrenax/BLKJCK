import { describe, expect, it } from 'vitest';
import {
  byId,
  cards,
  hookCtx,
  instance,
  makeRules,
  makeState,
  result,
  rulesWith,
  runScoring,
  scoringCtx,
  sum,
} from '../test/helpers';
import { limiteAtouts as L } from './limite';

const def = (id: string) => byId(L, id);

describe('atouts — la limite', () => {
  it('Marge de manœuvre : limite +1, cumulable avec un patron qui la baisse', () => {
    expect(rulesWith(def('marge-de-manoeuvre')).playerLimit).toBe(22);
    expect(rulesWith(def('marge-de-manoeuvre'), { base: { playerLimit: 20 } }).playerLimit).toBe(21);
  });

  it('Le Vingt-Trois : limite +2 et une défausse de moins (jamais sous 0)', () => {
    const r = rulesWith(def('vingt-trois'));
    expect(r.playerLimit).toBe(23);
    expect(r.discardsPerTable).toBe(makeRules().discardsPerTable - 1);
    expect(rulesWith(def('vingt-trois'), { base: { discardsPerTable: 0 } }).discardsPerTable).toBe(0);
  });

  it('Plafond de verre : limite +2, paie 1 $ par point au-dessus de 21, jamais sous 0 $', () => {
    const d = def('plafond-de-verre');
    expect(rulesWith(d).playerLimit).toBe(23);
    const ctx = hookCtx({ state: makeState({ money: 10 }) });
    d.hooks.onHandEnd!(ctx, result({ playerTotal: 23 }));
    expect(ctx.api.moneyDelta()).toBe(-2);
    const poor = hookCtx({ state: makeState({ money: 1 }) });
    d.hooks.onHandEnd!(poor, result({ playerTotal: 24 }));
    expect(poor.api.moneyDelta()).toBe(-1);
    const broke = hookCtx({ state: makeState({ money: 0 }) });
    d.hooks.onHandEnd!(broke, result({ playerTotal: 24 }));
    expect(broke.api.calls).toHaveLength(0);
    const bust = hookCtx({ state: makeState({ money: 10 }) });
    d.hooks.onHandEnd!(bust, result({ outcome: 'bust', playerTotal: 26 }));
    expect(bust.api.calls).toHaveLength(0);
    const ok = hookCtx({ state: makeState({ money: 10 }) });
    d.hooks.onHandEnd!(ok, result({ playerTotal: 21 }));
    expect(ok.api.calls).toHaveLength(0);
  });

  it('Funambule : ×3 Mult à 1 point sous la limite, suit la limite effective', () => {
    const d = def('funambule');
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 20 }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 21 }))).xMult).toBe(1);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 22, rules: { playerLimit: 23 } }))).xMult).toBe(3);
  });

  it('Pile poil : ×3 Mult quand la main fait une Pile', () => {
    const d = def('pile-poil');
    expect(sum(runScoring(d, scoringCtx({ cards: cards('7s', '7h', '7d'), figure: 'pile' }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('10s', '9h'), figure: 'haute' }))).xMult).toBe(1);
  });

  it('Sur le fil : +2 Mult par point au-dessus de 17', () => {
    const d = def('sur-le-fil');
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 20 }))).mult).toBe(6);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 17 }))).mult).toBe(0);
    expect(sum(runScoring(d, scoringCtx({ playerTotal: 12 }))).mult).toBe(0);
  });

  it('Ascenseur : +1 limite par main gagnée, remis à 0 à chaque table', () => {
    const d = def('ascenseur');
    const self = instance(d);
    const ctx = hookCtx({ self });
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'loss' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    expect(self.state.bonus).toBe(2);
    expect(rulesWith(d, { self }).playerLimit).toBe(23);
    expect(ctx.api.argsOf('emit')).toHaveLength(2);
    expect(typeof d.description === 'function' && d.description(self)).toContain('Actuellement +2');
    d.hooks.onTableStart!(hookCtx({ self }));
    expect(self.state.bonus).toBe(0);
    expect(rulesWith(d, { self }).playerLimit).toBe(21);
  });

  it('Altitude : +5 Mult par point de limite au-dessus de 21', () => {
    const d = def('altitude');
    expect(sum(runScoring(d, scoringCtx({ rules: { playerLimit: 23 } }))).mult).toBe(10);
    expect(sum(runScoring(d, scoringCtx({ rules: { playerLimit: 20 } }))).mult).toBe(0);
  });

  it('Corde raide : ×2 Mult toujours, limite −1', () => {
    const d = def('corde-raide');
    expect(rulesWith(d).playerLimit).toBe(20);
    expect(sum(runScoring(d, scoringCtx({ outcome: 'loss' }))).xMult).toBe(2);
  });
});
