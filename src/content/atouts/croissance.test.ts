import { describe, expect, it } from 'vitest';
import {
  byId,
  card,
  hookCtx,
  instance,
  makeState,
  result,
  rulesWith,
  runScoring,
  scoringCtx,
  sum,
} from '../test/helpers';
import { argentAtouts } from './argent';
import { croissanceAtouts } from './croissance';
import { legendairesAtouts } from './legendaires';
import { sabotAtouts } from './sabot';

const G = (id: string) => byId(croissanceAtouts, id);
const A = (id: string) => byId(argentAtouts, id);
const S = (id: string) => byId(sabotAtouts, id);
const L = (id: string) => byId(legendairesAtouts, id);
const text = (d: { description: unknown }, ...args: unknown[]) =>
  typeof d.description === 'function' ? (d.description as (...a: unknown[]) => string)(...args) : String(d.description);

describe('atouts — ce qui grossit', () => {
  it('Boule de neige : +1 par victoire, −1 par défaite (jamais sous 0), 0 en crevant', () => {
    const d = G('boule-de-neige');
    const self = instance(d);
    const ctx = hookCtx({ self });
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'loss' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'push' }));
    expect(self.state.mult).toBe(2);
    expect(sum(runScoring(d, scoringCtx({ self }))).mult).toBe(2);
    d.hooks.onHandEnd!(ctx, result({ outcome: 'bust' }));
    expect(self.state.mult).toBe(0);
    d.hooks.onHandEnd!(ctx, result({ outcome: 'loss' }));
    expect(self.state.mult).toBe(0);
  });

  it('Martingale : ×2^pertes sur la victoire suivante, puis remise à zéro', () => {
    const d = G('martingale');
    const self = instance(d);
    const ctx = hookCtx({ self });
    d.hooks.onHandEnd!(ctx, result({ outcome: 'loss' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'bust' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'push' }));
    expect(self.state.streak).toBe(2);
    expect(text(d, self)).toContain('×4');
    expect(sum(runScoring(d, scoringCtx({ self, outcome: 'loss' }))).xMult).toBe(1);
    expect(sum(runScoring(d, scoringCtx({ self, outcome: 'win' }))).xMult).toBe(4);
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    expect(self.state.streak).toBe(0);
  });

  it('Martingale : plafonnée à ×8 (3 défaites)', () => {
    const d = G('martingale');
    const self = instance(d);
    const ctx = hookCtx({ self });
    for (let i = 0; i < 6; i++) d.hooks.onHandEnd!(ctx, result({ outcome: 'loss' }));
    expect(self.state.streak).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ self, outcome: 'win' }))).xMult).toBe(8);
    expect(text(d, self)).toContain('×8');
  });

  it('Pyromane : +4 Jetons définitifs par défausse', () => {
    const d = G('pyromane');
    const self = instance(d);
    d.hooks.onDiscard!(hookCtx({ self }), card('9s'));
    d.hooks.onDiscard!(hookCtx({ self }), card('2h'));
    expect(sum(runScoring(d, scoringCtx({ self }))).chips).toBe(8);
  });

  it('Collectionneur : +2 Mult par atout possédé', () => {
    const d = G('collectionneur');
    const state = makeState({ atouts: [instance(d, 1), instance(d, 2), instance(d, 3)] });
    expect(sum(runScoring(d, scoringCtx({ state }))).mult).toBe(6);
    expect(text(d, instance(d), state)).toContain('Actuellement +6 Mult');
    expect(text(d, instance(d))).not.toContain('Actuellement');
  });

  it('Vieux de la vieille : +3 Mult par patron battu, rien aux autres tables', () => {
    const d = G('vieux-de-la-vieille');
    const self = instance(d);
    d.hooks.onTableEnd!(hookCtx({ self, state: makeState({ table: { kind: 'grande' } }) }));
    d.hooks.onTableEnd!(hookCtx({ self, state: makeState({ table: { kind: 'patron', bossId: 'le-mur' } }) }));
    expect(sum(runScoring(d, scoringCtx({ self }))).mult).toBe(3);
  });

  it('Cicatrices : +15 Jetons par main crevée', () => {
    const d = G('cicatrices');
    const self = instance(d);
    d.hooks.onHandEnd!(hookCtx({ self }), result({ outcome: 'bust' }));
    d.hooks.onHandEnd!(hookCtx({ self }), result({ outcome: 'loss' }));
    expect(sum(runScoring(d, scoringCtx({ self }))).chips).toBe(15);
  });

  it('Cigare : +12 Mult, −2 par main, se retire à 0', () => {
    const d = G('cigare');
    const self = instance(d, 42);
    expect(sum(runScoring(d, scoringCtx({ self }))).mult).toBe(12);
    let ctx = hookCtx({ self });
    for (let i = 0; i < 5; i++) d.hooks.onHandEnd!(ctx, result());
    expect(self.state.mult).toBe(2);
    expect(ctx.api.argsOf('removeAtout')).toHaveLength(0);
    ctx = hookCtx({ self });
    d.hooks.onHandEnd!(ctx, result());
    expect(ctx.api.argsOf('removeAtout')).toEqual([[42]]);
  });
});

describe("atouts — l'argent", () => {
  it('Pourboire : +2 $ par victoire', () => {
    const ctx = hookCtx();
    A('pourboire').hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    A('pourboire').hooks.onHandEnd!(ctx, result({ outcome: 'push' }));
    expect(ctx.api.moneyDelta()).toBe(2);
  });

  it('Flambeur : +1 Mult par tranche de 3 $', () => {
    const d = A('flambeur');
    expect(sum(runScoring(d, scoringCtx({ state: makeState({ money: 17 }) }))).mult).toBe(5);
    expect(sum(runScoring(d, scoringCtx({ state: makeState({ money: 2 }) }))).mult).toBe(0);
  });

  it("Prêteur sur gages et Carte de fidélité changent les règles d'économie", () => {
    expect(rulesWith(A('preteur-sur-gages')).interestCap).toBe(15);
    expect(rulesWith(A('carte-de-fidelite')).freeRerollsPerShop).toBe(2);
  });

  it('Tirelire : +6 $ par table ; Racket : +2 $ par main non jouée', () => {
    const ctx = hookCtx({ state: makeState({ table: { handsLeft: 2 } }) });
    A('tirelire').hooks.onTableEnd!(ctx);
    A('racket').hooks.onTableEnd!(ctx);
    expect(ctx.api.moneyDelta()).toBe(10);
  });
});

describe('atouts — le sabot affiné', () => {
  it('Sabot léger : +2 Mult par carte retirée sous 52', () => {
    const d = S('sabot-leger');
    const state = makeState();
    state.deck = state.deck.slice(0, 45);
    expect(sum(runScoring(d, scoringCtx({ state }))).mult).toBe(14);
    expect(text(d, instance(d), state)).toContain('+14 Mult');
  });

  it('Poids plume : ×2,5 à 44 cartes ou moins', () => {
    const d = S('poids-plume');
    const thin = makeState();
    thin.deck = thin.deck.slice(0, 44);
    expect(sum(runScoring(d, scoringCtx({ state: thin }))).xMult).toBe(2.5);
    expect(sum(runScoring(d, scoringCtx({ state: makeState() }))).xMult).toBe(1);
  });

  it('Carte maîtresse : +3 Mult par carte améliorée', () => {
    const hand = [card('9s', 'plombee'), card('2h'), card('Kd', 'cristal')];
    expect(sum(runScoring(S('carte-maitresse'), scoringCtx({ cards: hand }))).mult).toBe(6);
  });
});

describe('atouts — légendaires', () => {
  it('Le Parrain : ×1,5, +0,5 par patron battu, plafond ×4', () => {
    const d = L('le-parrain');
    const self = instance(d);
    expect(sum(runScoring(d, scoringCtx({ self }))).xMult).toBe(1.5);
    d.hooks.onTableEnd!(hookCtx({ self, state: makeState({ table: { kind: 'grande' } }) }));
    d.hooks.onTableEnd!(hookCtx({ self, state: makeState({ table: { kind: 'patron', bossId: 'le-mur' } }) }));
    expect(sum(runScoring(d, scoringCtx({ self }))).xMult).toBe(2);
    const boss = makeState({ table: { kind: 'patron', bossId: 'le-mur' } });
    for (let i = 0; i < 8; i++) d.hooks.onTableEnd!(hookCtx({ self, state: boss }));
    expect(sum(runScoring(d, scoringCtx({ self }))).xMult).toBe(4);
    expect(text(d, self)).toContain('×4');
  });

  it("L'Ambidextre : chaque carte marque deux fois", () => {
    const d = L('l-ambidextre');
    expect(d.hooks.retriggers!(scoringCtx(), card('2s'))).toBe(1);
  });
});
