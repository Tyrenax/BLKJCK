import { describe, expect, it } from 'vitest';
import { testBalance } from './testing/content';
import {
  atBossTable,
  cardInvariantErrors,
  dealRigged,
  makeEngine,
  ofType,
  play,
  startedRun,
  types,
  withAtouts,
  withEnhancement,
} from './testing/helpers';
import type { RunState } from './types';

const e = makeEngine();

/** Gagne la main en cours avec assez de points pour boucler la table, puis passe à la suite. */
function winTable(s: RunState): RunState {
  const target = s.table!.target;
  const dealt = dealRigged(e, s, ['10H', '9S'], ['10C', '7D'], { score: target - 1, handsDealt: 1 }).state;
  const stood = e.dispatch(dealt, { type: 'stand' }).state;
  return e.dispatch(stood, { type: 'nextHand' }).state;
}

describe('flux de partie', () => {
  it('nouvelle partie : intro de la petite table, patron et privilège du salon déjà tirés', () => {
    const { state, events } = e.newRun('FLOW');
    expect(state.phase).toBe('tableIntro');
    expect(state.salon).toBe(1);
    expect(state.bossId).not.toBe('');
    expect(state.salonPrivilege).toBeTruthy();
    expect(state.table).toMatchObject({ kind: 'petite', bossId: null, target: 150, handsLeft: 4, discardsLeft: 2 });
    expect(state.table!.drawPile).toHaveLength(0);
    expect(events).toEqual([{ type: 'salonStarted', salon: 1, bossId: state.bossId }]);
    expect(state.deck).toHaveLength(52);
    expect(e.legalActions(state)).toEqual(['startTable', 'skipTable']);
  });

  it('même graine = même partie ; graine par défaut aléatoire', () => {
    expect(e.newRun('A').state).toEqual(e.newRun('A').state);
    expect(e.newRun().state.seed).not.toBe(e.newRun().state.seed);
  });

  it('lancer la table : handStarted puis 4 cartes, la carte cachée face cachée', () => {
    const { state: intro } = e.newRun('FLOW');
    const { state, events } = e.dispatch(intro, { type: 'startTable' });
    expect(types(events)).toEqual(['tableStarted', 'handStarted', 'cardDealt', 'cardDealt', 'cardDealt', 'cardDealt']);
    const deals = ofType(events, 'cardDealt');
    expect(deals.map((d) => [d.to, d.faceDown])).toEqual([
      ['player', false],
      ['dealer', false],
      ['player', false],
      ['dealer', true],
    ]);
    // Le total du croupier n'inclut pas sa carte cachée.
    expect(deals[3].total).toBe(deals[1].total);
    expect(state.phase).toBe('playerTurn');
    expect(state.table!.handsLeft).toBe(3);
    expect(state.table!.drawPile).toHaveLength(50);
    expect(state.table!.dealerDrawPile).toHaveLength(50);
    expect(cardInvariantErrors(state)).toEqual([]);
    expect(e.legalActions(state)).toEqual(expect.arrayContaining(['hit', 'stand', 'double', 'discard']));
  });

  it('les cartes jouées ne reviennent pas pendant la table', () => {
    let s = startedRun(e, 'NOREPEAT');
    const seen = new Set<number>();
    for (let hand = 0; hand < 4 && s.phase !== 'gameOver' && s.phase !== 'tableWon'; hand++) {
      for (const c of s.table!.hand!.playerCards) {
        expect(seen.has(c.id)).toBe(false);
        seen.add(c.id);
      }
      s = e.dispatch(s, { type: 'stand' }).state;
      if (s.phase === 'handResult') s = e.dispatch(s, { type: 'nextHand' }).state;
    }
  });

  it('fin anticipée : objectif atteint -> tableWon avec gains détaillés', () => {
    const s = structuredClone(startedRun(e, 'WIN'));
    s.money = 12;
    const won = winTable(s);
    expect(won.phase).toBe('tableWon');
    // 2 mains distribuées sur 4 : 2 non jouées. 12 $ -> 2 $ d'intérêts.
    expect(won.table!.payout).toEqual([
      { label: 'Petite table battue', amount: 3 },
      { label: '2 mains non jouées', amount: 2 },
      { label: 'Intérêts', amount: 2 },
    ]);
    const { state, events } = e.dispatch(won, { type: 'cashOut' });
    expect(state.money).toBe(12 + 7);
    expect(state.phase).toBe('shop');
    expect(state.table).toBeNull();
    expect(state.tableIndex).toBe(1);
    expect(types(events)).toEqual(['moneyChanged', 'shopEntered']);
    const intro = e.dispatch(state, { type: 'leaveShop' }).state;
    expect(intro.phase).toBe('tableIntro');
    expect(intro.table).toMatchObject({ kind: 'grande', target: 225 });
  });

  it('les intérêts sont plafonnés', () => {
    const s = structuredClone(startedRun(e, 'RICH'));
    s.money = 100;
    const interest = winTable(s).table!.payout!.find((l) => l.label === 'Intérêts')!;
    expect(interest.amount).toBe(testBalance.baseRules.interestCap);
  });

  it('objectif raté après la dernière main : gameOver', () => {
    const s = startedRun(e, 'LOSE');
    const dealt = dealRigged(e, s, ['10H', '7S'], ['10C', '9D'], { handsDealt: 3 }).state;
    expect(dealt.table!.handsLeft).toBe(0);
    const stood = e.dispatch(dealt, { type: 'stand' }).state;
    const { state, events } = e.dispatch(stood, { type: 'nextHand' });
    expect(state.phase).toBe('gameOver');
    expect(ofType(events, 'gameOver')[0].reason).toMatch(/^Objectif manqué/);
    expect(e.legalActions(state)).toEqual([]);
    expect(e.whyIllegal(state, { type: 'startTable' })).toBe('La partie est terminée.');
  });

  it('table du patron gagnée : salon suivant, nouveau patron, la boutique suit', () => {
    const s = atBossTable(startedRun(e, 'BOSS'), 't-mur');
    const won = winTable(s);
    expect(won.phase).toBe('tableWon');
    const { state, events } = e.dispatch(won, { type: 'cashOut' });
    expect(state.salon).toBe(2);
    expect(state.tableIndex).toBe(0);
    expect(types(events)).toEqual(['moneyChanged', 'salonStarted', 'shopEntered']);
    expect(ofType(events, 'salonStarted')[0]).toEqual({ type: 'salonStarted', salon: 2, bossId: state.bossId });
    expect(state.bossHistory).toHaveLength(2);
    expect(state.bossHistory![0]).not.toBe(state.bossHistory![1]);
    const intro = e.dispatch(state, { type: 'leaveShop' }).state;
    expect(intro.table).toMatchObject({ kind: 'petite', target: 300 });
  });

  it('le patron du salon final est La Maison ; la battre = victoire', () => {
    let s = structuredClone(startedRun(e, 'FINAL'));
    s.salon = testBalance.salons;
    s = atBossTable(s, 't-maison');
    const won = winTable(s);
    expect(won.phase).toBe('victory');
    expect(e.legalActions(won)).toEqual(['continueEndless']);
  });

  it('Le Mur double l’objectif affiché dès l’intro de la table du patron', () => {
    const intro = structuredClone(e.newRun('MUR').state);
    intro.tableIndex = 2;
    intro.bossId = 't-mur';
    intro.table = { ...intro.table!, kind: 'patron', bossId: 't-mur' };
    const started = e.dispatch(intro, { type: 'startTable' }).state;
    expect(started.table!.target).toBe(150 * 2 * 2);
  });

  it('Le Borgne : ta première carte arrive face cachée et se retourne quand tu restes', () => {
    const s = atBossTable(startedRun(e, 'BORGNE'), 't-borgne');
    const { state: dealt, events } = dealRigged(e, s, ['10H', '9S'], ['10C', '7D']);
    const first = ofType(events, 'cardDealt')[0];
    expect(first).toMatchObject({ to: 'player', faceDown: true, total: 0 });
    expect(ofType(events, 'cardDealt')[2].total).toBe(9);
    expect(dealt.table!.hand!.hiddenCardIds).toEqual([first.card.id]);
    expect(e.previewFigure(dealt)!.figure).toBe('petite');
    const stood = e.dispatch(dealt, { type: 'stand' });
    expect(types(stood.events)[0]).toBe('playerCardRevealed');
    expect(ofType(stood.events, 'playerCardRevealed')[0].total).toBe(19);
    expect(stood.state.table!.hand!.hiddenCardIds).toBeUndefined();
  });

  it('visibleNextCard : Compteur de cartes, ou carte marquée au sommet', () => {
    const s = startedRun(e, 'PEEK');
    expect(e.visibleNextCard(s)).toBeNull();
    const top = s.table!.drawPile[0];
    expect(e.visibleNextCard(withAtouts(s, 't-compteur'))).toEqual(top);
    const marked = structuredClone(s);
    marked.table!.drawPile[0].enhancement = 'marquee';
    marked.deck.find((c) => c.id === top.id)!.enhancement = 'marquee';
    expect(e.visibleNextCard(marked)).toMatchObject({ id: top.id, enhancement: 'marquee' });
  });

  it('Ascenseur : +1 limite par main gagnée, pour la table seulement', () => {
    const s = withAtouts(startedRun(e, 'ASC'), 't-ascenseur');
    const dealt = dealRigged(e, s, ['10H', '9S'], ['10C', '7D']).state;
    const after = e.dispatch(dealt, { type: 'stand' });
    expect(e.getRules(after.state).playerLimit).toBe(22);
    expect(ofType(after.events, 'rulesChanged')[0]).toMatchObject({ reason: 'Ascenseur' });
  });

  it('Alchimiste : améliore une carte et en ajoute une au sabot en pleine table, sans rien perdre', () => {
    const s = withAtouts(startedRun(e, 'ALCH'), 't-alchimiste');
    const dealt = dealRigged(e, s, ['10H', '9S'], ['10C', '7D']).state;
    const { state, events } = e.dispatch(dealt, { type: 'stand' });
    expect(types(events)).toEqual(expect.arrayContaining(['cardChanged', 'cardAddedToDeck']));
    expect(state.deck).toHaveLength(53);
    expect(state.deck.find((c) => c.rank === '10' && c.suit === 'hearts')!.enhancement).toBe('ardente');
    expect(cardInvariantErrors(state)).toEqual([]);
    const next = e.dispatch(state, { type: 'nextHand' }).state;
    expect(cardInvariantErrors(next)).toEqual([]);
  });

  it('Pourboire : argent à la main gagnée (atoutTriggered), à la table battue et en boutique', () => {
    const s = structuredClone(withAtouts(startedRun(e, 'TIP'), 't-pourboire'));
    s.money = 0;
    const won = winTable(s);
    expect(won.money).toBe(2); // main gagnée + onTableEnd
    const shop = e.dispatch(won, { type: 'cashOut' }).state;
    expect(shop.money).toBe(2 + 3 + 2 + 1); // gains (table 3 + 2 mains) + onShopEnter
  });

  it('une carte améliorée garde son amélioration d’une table à l’autre', () => {
    const s = withEnhancement(startedRun(e, 'KEEP'), '5C', 'doree');
    const won = winTable(s);
    const next = play(e, won, [{ type: 'cashOut' }, { type: 'leaveShop' }, { type: 'startTable' }]).state;
    const all = [...next.table!.drawPile, ...next.table!.hand!.playerCards];
    expect(all.find((c) => c.rank === '5' && c.suit === 'clubs')!.enhancement).toBe('doree');
    expect(cardInvariantErrors(next)).toEqual([]);
  });
});
