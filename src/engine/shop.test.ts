import { describe, expect, it } from 'vitest';
import { IllegalActionError } from './engine';
import { makeTestContent, testAtouts, testBalance, testConsumables, testPrivileges } from './testing/content';
import { dealRigged, makeEngine, ofType, startedRun, types, withAtouts } from './testing/helpers';
import type { RunState, ShopOffer } from './types';

const e = makeEngine();

/** Une boutique (après la petite table), avec `money` $. */
function shopState(seed = 'SHOP', money = 50, setup: (s: RunState) => RunState = (s) => s): RunState {
  const s0 = setup(startedRun(e, seed));
  const dealt = dealRigged(e, s0, ['10H', '9S'], ['10C', '7D'], { score: s0.table!.target - 1, handsDealt: 1 }).state;
  const won = e.dispatch(e.dispatch(dealt, { type: 'stand' }).state, { type: 'nextHand' }).state;
  const shop = structuredClone(e.dispatch(won, { type: 'cashOut' }).state);
  shop.money = money;
  return shop;
}

function withOffer(s: RunState, offer: Omit<ShopOffer, 'offerId' | 'sold'>): { state: RunState; offerId: number } {
  const c = structuredClone(s);
  const offerId = 9000 + c.shop!.offers.length;
  c.shop!.offers.push({ ...offer, offerId, sold: false });
  return { state: c, offerId };
}

describe('boutique', () => {
  it('3 offres + le privilège du salon, prix de relance et de Déchiqueteuse', () => {
    const s = shopState();
    expect(s.phase).toBe('shop');
    const offers = s.shop!.offers;
    expect(offers.filter((o) => o.kind !== 'privilege')).toHaveLength(3);
    expect(offers.filter((o) => o.kind === 'privilege').map((o) => o.defId)).toEqual([s.salonPrivilege]);
    expect(s.shop).toMatchObject({ rerollCost: 5, shredCost: 3, shredsLeft: 1, freeRerollsLeft: 0 });
    for (const o of offers) {
      if (o.kind === 'card') expect(o.card).toMatchObject({ enhancement: expect.any(String) });
      else expect(o.defId).not.toBe('');
    }
  });

  it('jamais un atout déjà possédé ni deux fois le même', () => {
    const owned = testAtouts.slice(0, testAtouts.length - 2).map((a) => a.id);
    let s = shopState('OWN', 10_000, (x) => withAtouts(x, ...owned));
    for (let i = 0; i < 40; i++) {
      const atoutOffers = s.shop!.offers.filter((o) => o.kind === 'atout').map((o) => o.defId);
      for (const id of atoutOffers) expect(owned).not.toContain(id);
      expect(new Set(atoutOffers).size).toBe(atoutOffers.length);
      s = e.dispatch(s, { type: 'reroll' }).state;
    }
  });

  it('acheter un atout, une combine, une carte', () => {
    let { state, offerId } = withOffer(shopState(), { kind: 'atout', defId: 't-coeur', cost: 5 });
    let r = e.dispatch(state, { type: 'buy', offerId });
    expect(types(r.events)).toEqual(['offerBought', 'moneyChanged', 'atoutAdded']);
    expect(r.state.money).toBe(45);
    expect(r.state.atouts.map((a) => a.defId)).toEqual(['t-coeur']);
    expect(e.whyIllegal(r.state, { type: 'buy', offerId })).toBe('Déjà vendu.');

    ({ state, offerId } = withOffer(r.state, { kind: 'combine', defId: 't-elastique', cost: 3 }));
    r = e.dispatch(state, { type: 'buy', offerId });
    expect(r.state.consumables.map((c) => c.defId)).toEqual(['t-elastique']);

    ({ state, offerId } = withOffer(r.state, {
      kind: 'card',
      defId: '',
      card: { id: 7777, rank: 'A', suit: 'hearts', enhancement: 'doree' },
      cost: 4,
    }));
    r = e.dispatch(state, { type: 'buy', offerId });
    expect(r.state.deck).toHaveLength(53);
    expect(r.state.deck.at(-1)).toEqual({ id: 7777, rank: 'A', suit: 'hearts', enhancement: 'doree' });
  });

  it('refus : argent, emplacements', () => {
    const poor = withOffer(shopState('POOR', 2), { kind: 'atout', defId: 't-coeur', cost: 5 });
    expect(e.whyIllegal(poor.state, { type: 'buy', offerId: poor.offerId })).toBe("Pas assez d'argent (il manque 3 $).");
    expect(() => e.dispatch(poor.state, { type: 'buy', offerId: poor.offerId })).toThrow(IllegalActionError);

    const full = shopState('FULL', 100, (x) => withAtouts(x, 't-marge', 't-nerveux', 't-echo', 't-boule', 't-casse'));
    const o = withOffer(full, { kind: 'atout', defId: 't-coeur', cost: 5 });
    expect(e.whyIllegal(o.state, { type: 'buy', offerId: o.offerId })).toBe("Plus d'emplacement d'atout : vends-en un d'abord.");
  });

  it('vendre un atout : moitié du prix, et pas en pleine main', () => {
    const s = shopState('SELL', 0, (x) => withAtouts(x, 't-casse'));
    const uid = s.atouts[0].uid;
    expect(e.sellValue(s, uid)).toBe(Math.floor(7 * testBalance.sellRatio));
    const r = e.dispatch(s, { type: 'sellAtout', uid });
    expect(r.state.money).toBe(3);
    expect(types(r.events)).toEqual(['atoutRemoved', 'moneyChanged']);
    const inHand = withAtouts(startedRun(e), 't-casse');
    expect(e.whyIllegal(inHand, { type: 'sellAtout', uid: inHand.atouts[0].uid })).toBe('On ne vend rien en pleine main.');
  });

  it('relance : le prix monte de 1 à chaque fois, le privilège reste', () => {
    let s = shopState('REROLL', 20);
    const priv = s.shop!.offers.find((o) => o.kind === 'privilege')!;
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) {
      costs.push(s.shop!.rerollCost);
      const r = e.dispatch(s, { type: 'reroll' });
      expect(types(r.events)).toEqual(['moneyChanged', 'shopRerolled']);
      s = r.state;
    }
    expect(costs).toEqual([5, 6, 7]);
    expect(s.money).toBe(2);
    expect(s.shop!.offers.find((o) => o.kind === 'privilege')).toEqual(priv);
    expect(e.whyIllegal(s, { type: 'reroll' })).toBe("Pas assez d'argent pour relancer (8 $).");
  });

  it('privilège : définitif, un seul par salon, et il ajuste la boutique en cours', () => {
    const base = shopState('PRIV', 40);
    const { state, offerId } = withOffer(base, { kind: 'privilege', defId: 't-mecene', cost: 6 });
    const r = e.dispatch(state, { type: 'buy', offerId });
    expect(types(r.events)).toEqual(['offerBought', 'moneyChanged', 'privilegeGained', 'moneyChanged']);
    expect(r.state.privileges).toEqual(['t-mecene']);
    expect(r.state.money).toBe(40 - 6 + 5);
    // Mécène donne une relance gratuite par boutique, utilisable tout de suite.
    expect(r.state.shop).toMatchObject({ freeRerollsLeft: 1, rerollCost: 0 });
    const free = e.dispatch(r.state, { type: 'reroll' }).state;
    expect(free.money).toBe(r.state.money);
    expect(free.shop).toMatchObject({ freeRerollsLeft: 0, rerollCost: 5, rerollsPaid: 0 });

    // Le privilège du salon, une fois acheté, ne revient pas dans les boutiques suivantes du salon.
    const realPriv = base.shop!.offers.find((o) => o.kind === 'privilege')!;
    const bought = e.dispatch(base, { type: 'buy', offerId: realPriv.offerId }).state;
    expect(bought.salonPrivilege).toBeNull();
    expect(bought.privileges).toContain(realPriv.defId);
  });

  it('Broyeur : la Déchiqueteuse passe à 2 usages dans la boutique en cours', () => {
    const s = structuredClone(shopState('BROYEUR', 100));
    s.privileges.push('t-defausse');
    const { state, offerId } = withOffer(s, { kind: 'privilege', defId: 't-broyeur', cost: 8 });
    const r = e.dispatch(state, { type: 'buy', offerId }).state;
    expect(r.shop!.shredsLeft).toBe(2);
  });

  it('Déchiqueteuse : retire une carte, prix croissant sur la partie, plancher de deck', () => {
    const s = shopState('SHRED', 20);
    const cardId = s.deck[0].id;
    const r = e.dispatch(s, { type: 'shredCard', cardId });
    expect(r.state.deck).toHaveLength(51);
    expect(ofType(r.events, 'cardDestroyed')[0]).toMatchObject({ reason: 'Déchiqueteuse' });
    expect(r.state.money).toBe(17);
    expect(r.state.shop).toMatchObject({ shredsLeft: 0, shredCost: 4 });
    expect(r.state.stats.cardsShredded).toBe(1);
    expect(e.whyIllegal(r.state, { type: 'shredCard', cardId: r.state.deck[0].id })).toBe(
      'Déchiqueteuse déjà utilisée dans cette boutique.',
    );
    const thin = structuredClone(s);
    thin.deck = thin.deck.slice(0, 10);
    expect(e.whyIllegal(thin, { type: 'shredCard', cardId: thin.deck[0].id })).toBe(
      'Ton sabot ne peut pas descendre sous 10 cartes.',
    );
  });

  it('atelier en boutique : Plomb sur 2 cartes du sabot, Faveur, Autodafé, Faussaire', () => {
    let s = structuredClone(shopState('ATELIER', 0));
    s.consumables.push(
      { uid: 501, defId: 't-plomb' },
      { uid: 502, defId: 't-faveur-paire' },
    );
    const [a, b] = [s.deck[0].id, s.deck[1].id];
    s = e.dispatch(s, { type: 'useConsumable', uid: 501, targets: [a, b] }).state;
    expect(s.deck.filter((c) => c.enhancement === 'plombee').map((c) => c.id)).toEqual([a, b]);
    expect(e.whyIllegal(s, { type: 'useConsumable', uid: 502, targets: [a] })).toBe('« Table réservée » ne prend pas de cible.');
    s = e.dispatch(s, { type: 'useConsumable', uid: 502 }).state;
    expect(s.figureLevels.paire).toBe(2);
    expect(s.consumables).toHaveLength(0);

    s = structuredClone(s);
    s.consumables.push({ uid: 503, defId: 't-autodafe' }, { uid: 504, defId: 't-faussaire' });
    expect(e.whyIllegal(s, { type: 'useConsumable', uid: 503, targets: [] })).toBe('Choisis entre 1 et 2 cartes.');
    s = e.dispatch(s, { type: 'useConsumable', uid: 503, targets: [a] }).state;
    expect(s.deck.some((c) => c.id === a)).toBe(false);
    const r = e.dispatch(s, { type: 'useConsumable', uid: 504, targets: [b] });
    expect(r.state.deck.at(-1)).toMatchObject({ rank: s.deck[0].rank, enhancement: 'plombee' });
    expect(ofType(r.events, 'cardAddedToDeck')).toHaveLength(1);
  });

  it('canAppear : une offre conditionnelle n’apparaît qu’une fois la condition remplie', () => {
    const gated = makeEngine(
      makeTestContent({
        consumables: testConsumables.map((c) =>
          c.id === 't-faveur-paire' ? { ...c, canAppear: (st) => (st.stats.figureCounts?.triple7 ?? 0) > 0 } : c,
        ),
        atouts: testAtouts.map((a) => (a.id === 't-coeur' ? { ...a, canAppear: () => false } : a)),
        privileges: testPrivileges.map((p) => ({ ...p, canAppear: () => false })),
      }),
    );
    const roll = (prep: (s: RunState) => void): Set<string> => {
      const seen = new Set<string>();
      let s = structuredClone(shopState('GATE', 100_000));
      prep(s);
      for (let i = 0; i < 80; i++) {
        s = gated.dispatch(s, { type: 'reroll' }).state;
        for (const o of s.shop!.offers) seen.add(o.defId);
      }
      return seen;
    };
    const before = roll(() => {});
    expect(before.has('t-faveur-paire')).toBe(false);
    expect(before.has('t-coeur')).toBe(false);
    expect(before.has('t-faveur-haute')).toBe(true);
    const after = roll((s) => (s.stats.figureCounts = { triple7: 1 }));
    expect(after.has('t-faveur-paire')).toBe(true);
    // Privilège du salon : aucun ne peut apparaître.
    expect(gated.newRun('GATE').state.salonPrivilege).toBeNull();
  });

  it('figureCounts compte les figures marquées', () => {
    const s0 = startedRun(e, 'COUNT');
    const dealt = dealRigged(e, s0, ['8H', '8S'], ['10C', '7D']).state;
    const r = e.dispatch(dealt, { type: 'stand' }).state;
    expect(r.stats.figureCounts).toEqual({ paire: 1 });
  });

  it('réordonner les atouts', () => {
    const s = shopState('ORDER', 0, (x) => withAtouts(x, 't-coeur', 't-casse', 't-boule'));
    const order = s.atouts.map((a) => a.uid).reverse();
    const r = e.dispatch(s, { type: 'reorderAtouts', order });
    expect(r.state.atouts.map((a) => a.uid)).toEqual(order);
    expect(r.events).toEqual([{ type: 'atoutsReordered', order }]);
    expect(e.whyIllegal(s, { type: 'reorderAtouts', order: order.slice(1) })).toBe("L'ordre doit contenir chaque atout une fois.");
  });
});

describe('clés de règle de boutique et de patron', () => {
  it('shopPriceAdd : offres, relance et Déchiqueteuse coûtent plus cher', () => {
    const s0 = structuredClone(startedRun(e, 'PRICE'));
    s0.runMods.push({ key: 'shopPriceAdd', add: 2, source: 'test' });
    const dealt = dealRigged(e, s0, ['10H', '9S'], ['10C', '7D'], { score: s0.table!.target - 1, handsDealt: 1 }).state;
    const won = e.dispatch(e.dispatch(dealt, { type: 'stand' }).state, { type: 'nextHand' }).state;
    const shop = e.dispatch(won, { type: 'cashOut' }).state.shop!;
    expect(shop.rerollCost).toBe(testBalance.rerollBaseCost + 2);
    expect(shop.shredCost).toBe(testBalance.shredBaseCost + 2);
    for (const o of shop.offers.filter((x) => x.kind === 'card')) expect(o.cost).toBe(4 + 2);
  });

  it('bossSalonAdvance : les patrons d’un salon plus loin peuvent sortir plus tôt', () => {
    const adv = makeEngine(
      makeTestContent({ stakes: [{ id: 'adv', name: 'adv', description: '', art: { glyph: 'A', pattern: 'uni', colors: ['prune', 'ivoire'] }, mods: [{ key: 'bossSalonAdvance', add: 1, source: 'adv' }] }] }),
    );
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) seen.add(adv.newRun(`ADV${i}`).state.bossId);
    expect(seen.has('t-percé')).toBe(true); // minSalon 2, tiré au salon 1
  });
});
