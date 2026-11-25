import { describe, expect, it } from 'vitest';
import { makeTestContent, testAtouts, testBalance } from './testing/content';
import {
  cardInvariantErrors,
  dealRigged,
  makeEngine,
  matches,
  ofType,
  startedRun,
  types,
  withAtouts,
  withConsumables,
} from './testing/helpers';
import type { AtoutDef, EmblemArt, RunState } from './types';

const e = makeEngine();
const idOf = (s: RunState, spec: string): number => s.table!.hand!.playerCards.find((c) => matches(c, spec))!.id;
const art: EmblemArt = { glyph: '?', pattern: 'uni', colors: ['#000', '#fff'] };

describe('combines en pleine main (MutationApi)', () => {
  it("Coup d'œil : révèle la carte cachée une seule fois", () => {
    const s = withConsumables(startedRun(e), 't-coup-oeil');
    const dealt = dealRigged(e, s, ['10H', '9S'], ['10C', '7D']).state;
    const used = e.dispatch(dealt, { type: 'useConsumable', uid: dealt.consumables[0].uid });
    expect(types(used.events)).toEqual(['consumableUsed', 'holeRevealed']);
    expect(ofType(used.events, 'holeRevealed')[0].total).toBe(17);
    const stood = e.dispatch(used.state, { type: 'stand' });
    expect(types(stood.events)).not.toContain('holeRevealed');
  });

  it('Échange : les cartes changent de camp puis retournent à leur propriétaire', () => {
    const s = withConsumables(startedRun(e), 't-echange');
    const dealt = dealRigged(e, s, ['10H', '6S'], ['5C', 'KD']).state;
    const six = idOf(dealt, '6S');
    const r = e.dispatch(dealt, { type: 'useConsumable', uid: dealt.consumables[0].uid, targets: [six] });
    expect(ofType(r.events, 'cardsSwapped')[0]).toMatchObject({ playerCard: { rank: '6' }, dealerCard: { rank: '5' } });
    expect(r.state.table!.hand!.playerCards.map((c) => c.rank)).toEqual(['10', '5']);
    expect(cardInvariantErrors(r.state)).toEqual([]);
    const stood = e.dispatch(r.state, { type: 'stand' }).state;
    const next = e.dispatch(stood, { type: 'nextHand' }).state;
    expect(next.table!.discardPile.some((c) => c.id === six)).toBe(true);
    expect(next.table!.dealerDiscardPile!.some((c) => c.rank === '5' && c.suit === 'clubs')).toBe(true);
    expect(cardInvariantErrors(next)).toEqual([]);
  });

  it('Carte brûlée : on voit la prochaine carte, elle part à la défausse', () => {
    const s = withConsumables(startedRun(e), 't-brulee');
    const dealt = dealRigged(e, s, ['10H', '6S', '5D'], ['10C', '7D']).state;
    const r = e.dispatch(dealt, { type: 'useConsumable', uid: dealt.consumables[0].uid });
    expect(types(r.events)).toEqual(['consumableUsed', 'deckPeeked', 'cardBurned']);
    expect(ofType(r.events, 'deckPeeked')[0].cards[0]).toMatchObject({ rank: '5', suit: 'diamonds' });
    expect(r.state.table!.discardPile.at(-1)).toMatchObject({ rank: '5', suit: 'diamonds' });
    expect(cardInvariantErrors(r.state)).toEqual([]);
  });

  it('Pioche : drawToPlayer ne compte pas comme un Tirer', () => {
    const s = withConsumables(startedRun(e), 't-pioche');
    const dealt = dealRigged(e, s, ['10H', '6S', '2D'], ['10C', '7D']).state;
    const r = e.dispatch(dealt, { type: 'useConsumable', uid: dealt.consumables[0].uid });
    expect(types(r.events)).toEqual(['consumableUsed', 'cardDealt', 'cardBurned', 'deckPeeked']);
    expect(r.state.table!.hand!.playerCards).toHaveLength(3);
    expect(r.state.table!.hand!.hits).toBe(0);
    expect(cardInvariantErrors(r.state)).toEqual([]);
  });

  it('Pioche qui fait crever : crevé (bustChoice seulement s’il reste une combine de secours)', () => {
    const s = withConsumables(startedRun(e), 't-pioche');
    const dealt = dealRigged(e, s, ['10H', '6S', 'KD'], ['10C', '7D']).state;
    const r = e.dispatch(dealt, { type: 'useConsumable', uid: dealt.consumables[0].uid });
    expect(r.state.phase).toBe('handResult');
    expect(r.state.table!.hand!.result!.outcome).toBe('bust');
    const s2 = withConsumables(startedRun(e), 't-pioche', 't-elastique');
    const dealt2 = dealRigged(e, s2, ['10H', '6S', 'KD'], ['10C', '7D']).state;
    const r2 = e.dispatch(dealt2, { type: 'useConsumable', uid: dealt2.consumables[0].uid });
    expect(r2.state.phase).toBe('bustChoice');
  });

  it('Tour de manche : la carte devient un As pour la suite de la partie', () => {
    const s = withConsumables(startedRun(e), 't-manche');
    const dealt = dealRigged(e, s, ['10H', '6S'], ['10C', '7D']).state;
    const six = idOf(dealt, '6S');
    const r = e.dispatch(dealt, { type: 'useConsumable', uid: dealt.consumables[0].uid, targets: [six] });
    expect(ofType(r.events, 'cardChanged')[0]).toMatchObject({ before: { rank: '6' }, after: { rank: 'A' } });
    expect(r.state.deck.find((c) => c.id === six)!.rank).toBe('A');
    expect(e.previewFigure(r.state)!.figure).toBe('blackjack');
    expect(cardInvariantErrors(r.state)).toEqual([]);
  });

  it('Clin d’œil : atout et combine ajoutés seulement s’il reste de la place', () => {
    const s0 = structuredClone(startedRun(e));
    s0.phase = 'shop';
    s0.table = null;
    s0.shop = { offers: [], rerollCost: 5, shredCost: 3, shredsLeft: 1, freeRerollsLeft: 0, rerollsPaid: 0 };
    const s = withConsumables(s0, 't-faveur-haute', 't-elastique');
    const r = e.dispatch(s, { type: 'useConsumable', uid: s.consumables[0].uid });
    expect(types(r.events)).toEqual(['consumableUsed', 'figureLeveled', 'atoutAdded', 'consumableAdded']);
    const full = withAtouts(withConsumables(s0, 't-faveur-haute', 't-elastique'), ...testAtouts.slice(0, 5).map((a) => a.id));
    full.consumables.push({ uid: 999, defId: 't-plomb' });
    const r2 = e.dispatch(full, { type: 'useConsumable', uid: full.consumables[0].uid });
    expect(types(r2.events)).toEqual(['consumableUsed', 'figureLeveled']);
  });

  it('les cibles sont contrôlées', () => {
    const s = withConsumables(startedRun(e), 't-manche');
    const dealt = dealRigged(e, s, ['10H', '6S'], ['10C', '7D']).state;
    const uid = dealt.consumables[0].uid;
    expect(e.whyIllegal(dealt, { type: 'useConsumable', uid, targets: [] })).toBe('Choisis 1 carte.');
    expect(e.whyIllegal(dealt, { type: 'useConsumable', uid, targets: [dealt.table!.hand!.dealerCards[0].id] })).toBe(
      'Cette carte ne peut pas être ciblée.',
    );
    expect(e.whyIllegal(dealt, { type: 'useConsumable', uid: 4242 })).toBe('Objet introuvable.');
  });
});

describe('extensions bjck-6a / bjck-41', () => {
  it('ScoreEffect.nullify : la main marque 0 même si un atout à droite rajoute des Jetons', () => {
    const tapis: AtoutDef = {
      id: 'x-tapis',
      name: 'Tapis',
      description: '',
      rarity: 'commun',
      cost: 1,
      art,
      hooks: { onHandScored: (ctx) => ({ chips: -ctx.chips, nullify: true, text: 'Tapis !' }) },
    };
    const vampire: AtoutDef = { ...tapis, id: 'x-vampire', hooks: { onHandScored: () => ({ chips: 50 }) } };
    const eng = makeEngine(makeTestContent({ atouts: [tapis, vampire] }));
    const s = structuredClone(startedRun(eng));
    s.atouts.push({ uid: 800, defId: 'x-tapis', state: {} }, { uid: 801, defId: 'x-vampire', state: {} });
    const dealt = dealRigged(eng, s, ['10H', '9S'], ['10C', '7D']).state;
    const { state, events } = eng.dispatch(dealt, { type: 'stand' });
    const steps = ofType(events, 'scoreStep');
    expect(steps.map((x) => x.text)).toEqual(['+10', '+9', 'Tapis !', '+50 Jetons', 'Main annulée']);
    expect(steps.at(-1)).toMatchObject({ chipsAfter: 0 });
    expect(state.table!.hand!.result).toMatchObject({ score: 0, chips: 0 });
    expect(ofType(events, 'scoreEnd')[0].handScore).toBe(0);
  });

  it('balance.maxPlayerLimit plafonne la limite après tous les crochets', () => {
    const eng = makeEngine(makeTestContent({ balance: { ...testBalance, maxPlayerLimit: 22 } }));
    const s = structuredClone(withAtouts(startedRun(eng), 't-marge', 't-marge'));
    s.runMods.push({ key: 'playerLimit', add: 5, source: 'test' });
    expect(eng.getRules(s).playerLimit).toBe(22);
  });
});
