import { describe, expect, it } from 'vitest';
import {
  byId,
  cards,
  cascadeScore,
  fakeRng,
  hookCtx,
  instance,
  makeRules,
  makeState,
  rulesWith,
  runScoring,
  scoringCtx,
  sum,
} from '../test/helpers';
import { croupierAtouts } from './croupier';
import { petitesAtouts } from './petites';
import { risqueAtouts as R } from './risque';

const def = (id: string) => byId(R, id);

describe('atouts — le risque', () => {
  it('Tête brûlée : +3 Mult par carte tirée (Doubler compris dans hits)', () => {
    expect(sum(runScoring(def('tete-brulee'), scoringCtx({ hits: 3 }))).mult).toBe(9);
    expect(sum(runScoring(def('tete-brulee'), scoringCtx({ hits: 0 }))).mult).toBe(0);
  });

  it('Sang-froid : +40 Jetons en restant à deux cartes, pas en doublant', () => {
    const d = def('sang-froid');
    expect(sum(runScoring(d, scoringCtx({ cards: cards('10s', '8h') }))).chips).toBe(40);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('10s', '8h'), doubled: true }))).chips).toBe(0);
    expect(sum(runScoring(d, scoringCtx({ cards: cards('5s', '5h', '8d') }))).chips).toBe(0);
  });

  it('Quitte ou double : doubler vaut ×3', () => {
    expect(rulesWith(def('quitte-ou-double')).doubleXMult).toBe(3);
  });

  it('Parachute : sauve une fois par table en défaussant la dernière carte', () => {
    const d = def('parachute');
    const self = instance(d);
    const hand = cards('10s', '6h', '9d');
    const state = makeState({ hand: { playerCards: hand } });
    const save = d.hooks.onBust!(hookCtx({ self, state }));
    expect(save).toEqual({ discardCardId: hand[2]!.id, text: 'Parachute !' });
    expect(d.hooks.onBust!(hookCtx({ self, state }))).toBeUndefined();
    expect(typeof d.description === 'function' && d.description(self)).toContain('Déjà ouvert');
    d.hooks.onTableStart!(hookCtx({ self }));
    expect(d.hooks.onBust!(hookCtx({ self, state }))).toBeDefined();
  });

  it('Harnais : rétablit la défausse après crevé', () => {
    expect(rulesWith(def('harnais')).discardAfterBust).toBe(true);
    expect(rulesWith(def('harnais'), { base: { discardAfterBust: false } }).discardAfterBust).toBe(true);
  });

  it('Lot de consolation : garde au moins la moitié du Mult sur défaite', () => {
    expect(rulesWith(def('lot-de-consolation')).lossMultKeep).toBe(0.5);
    expect(rulesWith(def('lot-de-consolation'), { base: { lossMultKeep: 0.8 } }).lossMultKeep).toBe(0.8);
  });

  it('Compteur de cartes : voit la prochaine carte', () => {
    expect(rulesWith(def('compteur-de-cartes')).seeNextCard).toBe(true);
  });

  it('Tapis : ×3 sur victoire, Jetons à 0 sur défaite, rien sur égalité', () => {
    const d = def('tapis');
    expect(sum(runScoring(d, scoringCtx({ outcome: 'win' }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ outcome: 'loss', chips: 57 }))).chips).toBe(-57);
    expect(runScoring(d, scoringCtx({ outcome: 'push' }))).toEqual([]);
  });

  it('Tapis à gauche de Vampire et de Mille-pattes sur une défaite : la main marque 0', () => {
    const tapis = def('tapis');
    const vampire = byId(croupierAtouts, 'vampire');
    const millePattes = byId(petitesAtouts, 'mille-pattes');
    const loss = { cards: cards('10s', '7h'), dealer: cards('10c', '9d'), outcome: 'loss' as const };
    expect(cascadeScore([millePattes], loss)).toBeGreaterThan(0);
    expect(cascadeScore([tapis, vampire, millePattes], loss)).toBe(0);
    const eff = runScoring(tapis, scoringCtx({ ...loss, chips: 50 }));
    expect(eff[0]).toMatchObject({ chips: -50, nullify: true });
    const win = { cards: cards('10s', '9h'), dealer: cards('10c', '7d') };
    expect(cascadeScore([tapis, millePattes], win)).toBeGreaterThan(cascadeScore([millePattes], win));
  });

  it('Roulette russe : ×2 ou Jetons à 0 sur victoire, rien sinon', () => {
    const d = def('roulette-russe');
    expect(sum(runScoring(d, scoringCtx({ outcome: 'win', rng: fakeRng([0.5]) }))).xMult).toBe(2);
    const pan = sum(runScoring(d, scoringCtx({ outcome: 'win', chips: 40, rng: fakeRng([0.05]) })));
    expect(pan).toMatchObject({ chips: -40, xMult: 1 });
    expect(runScoring(d, scoringCtx({ outcome: 'win', rng: fakeRng([0.05]) }))[0]?.nullify).toBe(true);
    expect(runScoring(d, scoringCtx({ outcome: 'loss' }))).toEqual([]);
  });

  it('Sans filet : ×2,5 Mult, défausse interdite', () => {
    const d = def('sans-filet');
    expect(rulesWith(d).canDiscard).toBe(false);
    expect(sum(runScoring(d, scoringCtx())).xMult).toBe(2.5);
  });

  it('Dix de der : ×3 sur la dernière main de la table (suit le nombre de mains)', () => {
    const d = def('dix-de-der');
    const hands = makeRules().handsPerTable;
    const last = makeState({ table: { handIndex: hands - 1, handsLeft: 0 } });
    const first = makeState({ table: { handIndex: 0, handsLeft: hands - 1 } });
    expect(sum(runScoring(d, scoringCtx({ state: last }))).xMult).toBe(3);
    expect(sum(runScoring(d, scoringCtx({ state: first }))).xMult).toBe(1);
    expect(sum(runScoring(d, scoringCtx({ state: last, rules: { handsPerTable: hands + 1 } }))).xMult).toBe(1);
  });
});
