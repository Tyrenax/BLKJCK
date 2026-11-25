import { describe, expect, it } from 'vitest';
import { testBalance } from './testing/content';
import { atBossTable, dealRigged, makeEngine, ofType, play, startedRun } from './testing/helpers';
import type { RunState } from './types';

const e = makeEngine();

/** Gagne la table en cours (objectif atteint à la 2e main). */
function winTable(s: RunState): RunState {
  const dealt = dealRigged(e, s, ['10H', '9S'], ['10C', '7D'], { score: s.table!.target - 1, handsDealt: 1 }).state;
  return play(e, dealt, [{ type: 'stand' }, { type: 'nextHand' }]).state;
}

describe('mises', () => {
  it('par défaut : la première mise', () => {
    const { state } = e.newRun('STAKE');
    expect(state).toMatchObject({ stakeId: 't-blanche', stakeLevel: 0 });
    expect(state.table!.target).toBe(150);
  });

  it('cumulatives : la mise noire applique aussi la rouge', () => {
    const { state, events } = e.newRun('STAKE', { stakeId: 't-noire' });
    expect(state).toMatchObject({ stakeId: 't-noire', stakeLevel: 2, money: testBalance.startingMoney - 2 });
    expect(state.table!.target).toBe(225); // ×1,5 de la mise rouge
    const r = e.getRules(state);
    expect(r.discardsPerTable).toBe(1);
    expect(r.dealerStandOn).toBe(18);
    expect(state.runMods).toEqual([]); // les mods de mise vivent dans computeRules
    expect(events.map((x) => x.type)).toEqual(['moneyChanged', 'salonStarted']);
  });

  it('les crochets de mise tournent toute la partie, avant patron et atouts', () => {
    const s = e.dispatch(e.newRun('STAKE', { stakeId: 't-noire' }).state, { type: 'startTable' }).state;
    const r = play(e, s, [{ type: 'stand' }]).state;
    expect(r.flags.noire).toBe(1);
  });

  it('mise inconnue : erreur explicite', () => {
    expect(() => e.newRun('STAKE', { stakeId: 'nope' })).toThrow('Mise inconnue');
  });
});

describe('mode sans fin', () => {
  const finalWin = (): RunState => {
    let s = structuredClone(startedRun(e, 'ENDLESS'));
    s.salon = testBalance.salons;
    s = atBossTable(s, 't-maison');
    return winTable(s);
  };

  it('après la victoire : continueEndless encaisse la table du patron et la partie continue', () => {
    const won = finalWin();
    expect(won.phase).toBe('victory');
    expect(e.legalActions(won)).toEqual(['continueEndless']);
    expect(won.history!.at(-1)).toMatchObject({ result: 'won', kind: 'patron', payout: 0 });

    const { state, events } = e.dispatch(won, { type: 'continueEndless' });
    expect(state).toMatchObject({ phase: 'tableWon', endless: true });
    expect(ofType(events, 'tableWon')[0].total).toBeGreaterThan(0);
    expect(state.history!.at(-1)!.payout).toBe(ofType(events, 'tableWon')[0].total);
    expect(e.whyIllegal(state, { type: 'continueEndless' })).not.toBeNull();

    const shop = e.dispatch(state, { type: 'cashOut' }).state;
    expect(shop.salon).toBe(testBalance.salons + 1);
    expect(shop.phase).toBe('shop');
    const intro = e.dispatch(shop, { type: 'leaveShop' }).state;
    // Au-delà du dernier salon : objectif × endlessGrowth (2 par défaut) par salon.
    expect(intro.table!.target).toBe(testBalance.salonBaseTargets.at(-1)! * 2);
  });

  it('en mode sans fin, battre un patron ne redonne pas la victoire', () => {
    const shop = e.dispatch(e.dispatch(finalWin(), { type: 'continueEndless' }).state, { type: 'cashOut' }).state;
    let s = play(e, shop, [{ type: 'leaveShop' }, { type: 'startTable' }]).state;
    s = atBossTable(s, s.bossId || 't-mur');
    expect(winTable(s).phase).toBe('tableWon');
  });

  it('les patrons du mode sans fin sont tirés parmi tous (finale comprise)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      let s = structuredClone(startedRun(e, `END${i}`));
      s.salon = testBalance.salons;
      s = atBossTable(s, 't-maison');
      const shop = e.dispatch(e.dispatch(winTable(s), { type: 'continueEndless' }).state, { type: 'cashOut' }).state;
      seen.add(shop.bossId);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('résumé de partie', () => {
  it('une ligne par table gagnée, avec ses chiffres', () => {
    const won = winTable(startedRun(e, 'HIST'));
    expect(won.history).toEqual([
      {
        salon: 1,
        kind: 'petite',
        bossId: null,
        target: 150,
        score: won.table!.score,
        handsPlayed: 2,
        handsWon: 1,
        payout: won.table!.payout!.reduce((a, l) => a + l.amount, 0),
        result: 'won',
      },
    ]);
  });

  it('table sautée et défaite : lignes « skipped » et « lost », plus le détail de la mort', () => {
    let s = structuredClone(e.newRun('HIST').state);
    s.salonSkipRewards = ['t-enveloppe', 't-rallonge'];
    s = e.dispatch(s, { type: 'skipTable' }).state;
    expect(s.history!.at(-1)).toMatchObject({ result: 'skipped', kind: 'petite', skipRewardId: 't-enveloppe', handsPlayed: 0 });
    s = e.dispatch(s, { type: 'startTable' }).state;
    const last = dealRigged(e, s, ['10H', '7S'], ['10C', '9D'], { handsDealt: s.table!.handsLeft + s.table!.handsDealt! - 1 }).state;
    const dead = play(e, last, [{ type: 'stand' }, { type: 'nextHand' }]).state;
    expect(dead.phase).toBe('gameOver');
    expect(dead.history!.at(-1)).toMatchObject({ result: 'lost', kind: 'grande' });
    expect(dead.death).toMatchObject({ salon: 1, kind: 'grande', bossId: null, target: 225 });
    expect(dead.death!.missing).toBe(225 - dead.death!.score);
  });

  it('meilleure main détaillée', () => {
    const s = startedRun(e, 'BEST');
    const r = play(e, dealRigged(e, s, ['AS', 'KH'], ['10C', '7D']).state, [{ type: 'stand' }]).state;
    expect(r.bestHand).toMatchObject({ figure: 'blackjack', salon: 1, outcome: 'win', score: r.table!.hand!.result!.score });
    expect(r.bestHand!.cards.map((c) => c.rank)).toEqual(['A', 'K']);
    // Une main plus faible ne la remplace pas.
    const next = play(e, dealRigged(e, r, ['10H', '7S'], ['10C', '9D']).state, [{ type: 'stand' }]).state;
    expect(next.bestHand!.figure).toBe('blackjack');
  });

  it('objets rencontrés : offres de boutique, objets obtenus, privilège du salon', () => {
    const shop = e.dispatch(winTable(startedRun(e, 'SEEN')), { type: 'cashOut' }).state;
    for (const o of shop.shop!.offers) {
      if (o.kind === 'atout') expect(shop.seen!.atouts).toContain(o.defId);
      if (o.kind === 'combine' || o.kind === 'faveur') expect(shop.seen!.consumables).toContain(o.defId);
    }
    expect(shop.seen!.privileges).toContain(shop.salonPrivilege);
  });
});
