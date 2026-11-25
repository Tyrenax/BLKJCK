import { describe, expect, it } from 'vitest';
import { bosses } from './bosses';
import { privileges } from './privileges';
import { byId, card, cards, hookCtx, makeRules, makeState, result, rulesWith, runScoring, scoringCtx } from './test/helpers';
import { FIGURE_IDS } from './figures';

const B = (id: string) => byId(bosses, id);

describe('patrons', () => {
  it("patrons d'enseigne : l'enseigne ne marque pas, sauf une carte Arlequin", () => {
    const d = B('coeur-de-pierre');
    const s = makeState();
    expect(d.hooks.isCardDebuffed!(card('Kh'), s)).toBe(true);
    expect(d.hooks.isCardDebuffed!(card('Kh', 'arlequin'), s)).toBe(false);
    expect(d.hooks.isCardDebuffed!(card('Ks'), s)).toBe(false);
    expect(B('pique-nique').hooks.isCardDebuffed!(card('2s'), s)).toBe(true);
    expect(B('carreau-casse').hooks.isCardDebuffed!(card('2d'), s)).toBe(true);
    expect(B('trefle-fane').hooks.isCardDebuffed!(card('2c'), s)).toBe(true);
  });

  it('règles tordues', () => {
    expect(rulesWith(B('le-tricheur')).dealerWinsPush).toBe(true);
    expect(rulesWith(B('la-pince')).playerLimit).toBe(20);
    expect(rulesWith(B('le-begue'))).toMatchObject({ canDouble: false, canDiscard: false });
    expect(rulesWith(B('le-chrono')).handsPerTable).toBe(makeRules().handsPerTable - 1);
    expect(rulesWith(B('le-borgne')).hidePlayerFirstCard).toBe(true);
    expect(rulesWith(B('le-mur')).targetFactor).toBe(2);
    expect(rulesWith(B('le-sobre'))).toMatchObject({ dealerStandOn: 19, dealerLimit: 22 });
  });

  it('Madame Dix : 10, V, D, R neutralisés', () => {
    const d = B('madame-dix');
    const s = makeState();
    expect(cards('10s', 'Jh', 'Qd', 'Kc', '9s', 'As').map((c) => d.hooks.isCardDebuffed!(c, s))).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('Le Radin : seules les deux premières cartes de la main marquent', () => {
    const d = B('le-radin');
    const hand = cards('2s', '3h', '4d', '5c');
    const state = makeState({ hand: { playerCards: hand } });
    expect(hand.map((c) => d.hooks.isCardDebuffed!(c, state))).toEqual([false, false, true, true]);
    expect(runScoring(d, scoringCtx({ cards: hand, state }))).toEqual([]);
  });

  it('Le Douanier : les cartes améliorées ne marquent pas', () => {
    const d = B('le-douanier');
    expect(d.hooks.isCardDebuffed!(card('9s', 'plombee'), makeState())).toBe(true);
    expect(d.hooks.isCardDebuffed!(card('9s'), makeState())).toBe(false);
  });

  it("L'Usurier : la distribution est gratuite, chaque carte tirée ensuite coûte 1 $", () => {
    const d = B('l-usurier');
    const ctx = hookCtx({ state: makeState({ money: 5 }) });
    d.hooks.onCardDrawn!(ctx, card('9s'), 'player'); // distribution initiale
    d.hooks.onHandStart!(ctx);
    d.hooks.onCardDrawn!(ctx, card('2h'), 'dealer');
    d.hooks.onCardDrawn!(ctx, card('3h'), 'player');
    d.hooks.onCardDrawn!(ctx, card('4h'), 'player');
    expect(ctx.api.moneyDelta()).toBe(-2);
    const broke = hookCtx({ state: makeState({ money: 0 }) });
    d.hooks.onHandStart!(broke);
    d.hooks.onCardDrawn!(broke, card('3h'), 'player');
    expect(broke.api.argsOf('addMoney')).toHaveLength(0);
  });

  it('Le Sabot percé : 5 cartes brûlées après chaque main (sabot court : ce qui reste)', () => {
    const d = B('le-sabot-perce');
    const ctx = hookCtx({ state: makeState({ table: { drawPile: cards('2s', '3s', '4s', '5s', '6s', '7s') } }) });
    d.hooks.onHandEnd!(ctx, result());
    expect(ctx.api.argsOf('burnTop')).toHaveLength(5);
    expect(ctx.state.table!.drawPile).toHaveLength(1);
    const short = hookCtx({ state: makeState({ table: { drawPile: cards('2s') } }) });
    d.hooks.onHandEnd!(short, result());
    expect(short.api.argsOf('trigger')).toEqual([['1 carte perdue']]);
  });

  it('La Maison : objectif ×2, égalités perdues, limite −1 par main gagnée à sa table', () => {
    const d = B('la-maison');
    expect(d.finale).toBe(true);
    const state = makeState({ table: { kind: 'patron', bossId: 'la-maison', handIndex: 3 } });
    expect(rulesWith(d, { state })).toMatchObject({ targetFactor: 2, dealerWinsPush: true, playerLimit: 21 });
    const ctx = hookCtx({ state });
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'loss' }));
    d.hooks.onHandEnd!(ctx, result({ outcome: 'win' }));
    expect(ctx.api.argsOf('setFlag')).toEqual([
      ['table', 'maisonWins', 1],
      ['table', 'maisonWins', 2],
    ]);
    state.table!.flags.maisonWins = 2;
    expect(rulesWith(d, { state }).playerLimit).toBe(19);
  });
});

describe('privilèges', () => {
  it('chaque privilège change une règle ou agit à l’achat', () => {
    for (const p of privileges) expect(!!p.mods?.length || !!p.onBuy).toBe(true);
  });

  it("Carnet d'adresses monte toutes les figures", () => {
    const ctx = hookCtx();
    byId(privileges, 'carnet-d-adresses').onBuy!(ctx);
    expect(ctx.api.argsOf('levelUpFigure').map((a) => a[0]).sort()).toEqual([...FIGURE_IDS].sort());
  });

  it('Passe-droit est cher et tardif', () => {
    const p = byId(privileges, 'passe-droit');
    expect(p.minSalon).toBeGreaterThanOrEqual(5);
    expect(p.cost).toBeGreaterThanOrEqual(15);
  });
});
