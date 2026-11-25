/**
 * Combines, faveurs, patrons, privilèges et sabots de départ du vrai contenu, joués dans le moteur.
 */
import { describe, expect, it } from 'vitest';
import { cardInvariantErrors, ofType, withEnhancement } from '../testing/helpers';
import type { RunState } from '../types';
import {
  atBossTableReal as atBoss,
  base,
  buyPrivilege,
  consUid,
  content,
  deckCardId,
  engine,
  F,
  give,
  giveCons,
  hand,
  HIT,
  REF,
  REF_CHIPS,
  run,
  STAND,
  toShop,
  use,
} from './helpers';

const H = () => F('haute');
const HANDS = content.balance.baseRules.handsPerTable;

/** Main en cours (playerTurn) avec ce consommable en poche. */
const dealtWith = (
  defId: string,
  player: readonly string[],
  dealer: readonly string[] = ['10C', '7D'],
  steps = [] as Parameters<typeof hand>[3],
) =>
  hand(giveCons(base(), defId), player, dealer, steps);

/** State en tableIntro de la table suivante avec ces consommables (pour l'atelier). */
function introWith(...ids: string[]): RunState {
  const shop = toShop(base(), 0);
  return giveCons(engine.dispatch(shop, { type: 'leaveShop' }).state, ...ids);
}

const workshop = (id: string, targets: number[], s?: RunState) => {
  const st = s ?? introWith(id);
  return run(st, [{ type: 'useConsumable', uid: consUid(st, id), targets }]);
};

const COMBINES: Record<string, () => void> = {
  'coup-d-oeil': () => {
    const p = dealtWith('coup-d-oeil', ['10H', '9S'], ['10C', '7D'], [use('coup-d-oeil')]);
    expect(ofType(p.events, 'holeRevealed')[0]).toMatchObject({ total: 17 });
    // Inutile avec Rayons X : refusé.
    const x = hand(giveCons(give(base(), 'rayons-x'), 'coup-d-oeil'), REF.player, REF.dealer, []).state;
    expect(engine.whyIllegal(x, { type: 'useConsumable', uid: consUid(x, 'coup-d-oeil') })).not.toBeNull();
  },
  echange: () => {
    const p = dealtWith('echange', ['10H', '6S'], ['5C', 'KD'], [use('echange', '6S')]);
    expect(p.state.table!.hand!.playerCards.map((c) => c.rank)).toEqual(['10', '5']);
    const end = run(p.state, [STAND, { type: 'nextHand' }]);
    expect(cardInvariantErrors(end.state)).toEqual([]);
  },
  'carte-brulee': () => {
    const p = dealtWith('carte-brulee', ['10H', '6S', '5D'], undefined, [use('carte-brulee')]);
    expect(ofType(p.events, 'cardBurned')[0].card).toMatchObject({ rank: '5', suit: 'diamonds' });
    expect(p.state.table!.discardPile.at(-1)).toMatchObject({ rank: '5', suit: 'diamonds' });
  },
  filet: () => {
    const caught = dealtWith('filet', ['10H', '6S', 'KD'], undefined, [use('filet')]);
    expect(ofType(caught.events, 'cardBurned')).toHaveLength(1);
    expect(caught.state.table!.hand!.playerCards).toHaveLength(2);
    expect(caught.state.phase).toBe('playerTurn');
    const drawn = dealtWith('filet', ['10H', '6S', '4D'], undefined, [use('filet')]);
    expect(drawn.state.table!.hand!.playerCards.map((c) => c.rank)).toEqual(['10', '6', '4']);
  },
  savonnette: () => {
    const p = dealtWith('savonnette', REF.player, ['10C', '7D', '2H'], [use('savonnette'), STAND]);
    expect(p.result!.dealerTotal).toBe(19);
  },
  rallonge: () => {
    const p = dealtWith('rallonge', ['10H', '6S', '6C'], undefined, [HIT]);
    expect(p.state.phase).toBe('bustChoice');
    const saved = run(p.state, [use('rallonge')]);
    expect(saved.state.phase).toBe('playerTurn');
    expect(engine.getRules(saved.state).playerLimit).toBe(23);
  },
  'tour-de-manche': () => {
    const p = dealtWith('tour-de-manche', ['10H', '6S'], undefined, [use('tour-de-manche', '6S')]);
    const six = p.state.table!.hand!.playerCards[1];
    expect(six.rank).toBe('A');
    expect(p.state.deck.find((c) => c.id === six.id)!.rank).toBe('A');
    expect(engine.previewFigure(p.state)!.figure).toBe('blackjack');
  },
  voyance: () => {
    const p = dealtWith('voyance', ['10H', '6S'], undefined, [use('voyance')]);
    expect(ofType(p.events, 'deckPeeked')[0].cards.map((c) => c.id)).toEqual(p.state.table!.drawPile.slice(0, 3).map((c) => c.id));
  },
  lorgnette: () => {
    const p = dealtWith('lorgnette', ['10H', '6S'], undefined, [use('lorgnette')]);
    const peek = ofType(p.events, 'deckPeeked')[0];
    expect(peek.owner).toBe('dealer');
    expect(peek.cards.map((c) => c.id)).toEqual(p.state.table!.dealerDrawPile.slice(0, 2).map((c) => c.id));
  },
  escamotage: () => {
    const p = dealtWith('escamotage', ['10H', '6S', 'KC'], undefined, [HIT]);
    expect(p.state.phase).toBe('bustChoice');
    const saved = run(p.state, [use('escamotage', 'KC')]);
    expect(saved.state.phase).toBe('playerTurn');
    expect(saved.state.table!.discardsLeft).toBe(content.balance.baseRules.discardsPerTable);
    expect(saved.state.table!.hand!.discards).toBe(0);
  },
};

/** Atelier : combines qui modifient des cartes du sabot (jouées ici en tableIntro). */
const ENCHANTS: Record<string, { enh: NonNullable<RunState['deck'][number]['enhancement']>; max: number }> = {
  plomb: { enh: 'plombee', max: 2 },
  braise: { enh: 'ardente', max: 2 },
  cristal: { enh: 'cristal', max: 1 },
  dorure: { enh: 'doree', max: 2 },
  marque: { enh: 'marquee', max: 2 },
  voile: { enh: 'fantome', max: 1 },
  ressort: { enh: 'elastique', max: 2 },
  losange: { enh: 'arlequin', max: 1 },
};
for (const [id, { enh, max }] of Object.entries(ENCHANTS)) {
  COMBINES[id] = () => {
    const s = introWith(id);
    const ids = s.deck.slice(0, max + 1).map((c) => c.id);
    expect(engine.whyIllegal(s, { type: 'useConsumable', uid: consUid(s, id), targets: ids })).not.toBeNull();
    const p = workshop(id, ids.slice(0, max), s);
    expect(p.state.deck.filter((c) => c.enhancement === enh).map((c) => c.id)).toEqual(ids.slice(0, max));
  };
}
const TEINTURES = { 'teinture-coeur': 'hearts', 'teinture-carreau': 'diamonds', 'teinture-pique': 'spades', 'teinture-trefle': 'clubs' } as const;
for (const [id, suit] of Object.entries(TEINTURES)) {
  COMBINES[id] = () => {
    const s = introWith(id);
    const ids = s.deck.filter((c) => c.suit !== suit).slice(0, 3).map((c) => c.id);
    const p = workshop(id, ids, s);
    for (const cid of ids) expect(p.state.deck.find((c) => c.id === cid)!.suit).toBe(suit);
    expect(ofType(p.events, 'cardChanged')).toHaveLength(3);
  };
}
COMBINES.faussaire = () => {
  let s = introWith('faussaire');
  s = withEnhancement(s, 'KH', 'plombee');
  const p = workshop('faussaire', [deckCardId(s, 'KH')], s);
  expect(p.state.deck).toHaveLength(53);
  expect(p.state.deck.at(-1)).toMatchObject({ rank: 'K', suit: 'hearts', enhancement: 'plombee' });
};
COMBINES.autodafe = () => {
  const s = introWith('autodafe');
  const ids = s.deck.slice(0, 2).map((c) => c.id);
  const p = workshop('autodafe', ids, s);
  expect(p.state.deck).toHaveLength(50);
  expect(ofType(p.events, 'cardDestroyed')).toHaveLength(2);
};

describe('combines du contenu', () => {
  it('chaque combine a son scénario', () => {
    const missing = content.consumables.filter((c) => c.kind === 'combine' && !(c.id in COMBINES)).map((c) => c.id);
    expect(missing).toEqual([]);
  });
  for (const def of content.consumables.filter((c) => c.kind === 'combine')) {
    const sc = COMBINES[def.id];
    if (sc) it(`${def.name} — ${def.description}`, sc);
  }

  it('atelier joué en handResult : les copies sur la table suivent', () => {
    const p = hand(giveCons(base(), 'plomb'), REF.player, REF.dealer);
    const kh = deckCardId(p.state, 'KH');
    const r = run(p.state, [{ type: 'useConsumable', uid: consUid(p.state, 'plomb'), targets: [kh] }]);
    expect(r.state.table!.drawPile.find((c) => c.id === kh)?.enhancement).toBe('plombee');
    expect(cardInvariantErrors(r.state)).toEqual([]);
  });
});

describe('faveurs du contenu', () => {
  const faveurs = content.consumables.filter((c) => c.kind === 'faveur');
  it('une faveur par figure', () => expect(faveurs).toHaveLength(8));
  for (const def of faveurs) {
    it(`${def.name} — ${def.description}`, () => {
      const s = giveCons(toShop(base(), 0), def.id);
      // Triple Sept : figure secrète, mais la faveur reste jouable une fois en poche.
      const p = run(s, [{ type: 'useConsumable', uid: consUid(s, def.id) }]);
      const lv = ofType(p.events, 'figureLeveled')[0];
      const fig = content.figures[lv.figure];
      expect(lv.level).toBe(2);
      expect(def.description).toContain(`+${fig.chipsPerLevel} Jetons et +${fig.multPerLevel} Mult`);
    });
  }
  it('la faveur du Triple Sept n’apparaît qu’après avoir marqué la figure', () => {
    const t7 = faveurs.find((f) => f.canAppear)!;
    const s = base();
    expect(t7.canAppear!(s)).toBe(false);
    const p = hand(s, ['7H', '7S', '7C'], ['10C', '7D'], [HIT, STAND]);
    expect(p.result!.figure).toBe('triple7');
    expect(t7.canAppear!(p.state)).toBe(true);
  });
});

const BOSSES: Record<string, () => void> = {
  'le-tricheur': () => {
    expect(hand(atBoss(base(), 'le-tricheur'), ['10H', '8S'], ['10C', '8D']).result!.outcome).toBe('loss');
  },
  'l-usurier': () => {
    const p = hand(atBoss(base('U', 5), 'l-usurier'), ['10H', '5S', '4C'], ['10C', '7D'], [HIT, STAND]);
    expect(p.money).toBe(-1); // la distribution est gratuite, le Tirer coûte 1 $
    const broke = hand(atBoss(base('U', 0), 'l-usurier'), ['10H', '5S', '4C'], ['10C', '7D'], [HIT, STAND]);
    expect(broke.state.money).toBe(0);
  },
  'le-sabot-perce': () => {
    const p = hand(atBoss(base(), 'le-sabot-perce'), REF.player, REF.dealer);
    expect(ofType(p.events, 'cardBurned').filter((e) => e.owner === 'player')).toHaveLength(5);
    expect(cardInvariantErrors(p.state)).toEqual([]);
  },
  'la-pince': () => {
    const s = atBoss(base(), 'la-pince');
    expect(engine.getRules(s).playerLimit).toBe(20);
    expect(hand(s, ['KH', '10S'], ['10C', '7D']).result!.figure).toBe('pile');
  },
  'madame-dix': () => {
    const p = hand(atBoss(base(), 'madame-dix'), REF.player, REF.dealer);
    expect(p.steps[0]).toMatchObject({ text: 'Neutralisée' });
    expect(p.result!.chips).toBe(H().chips + 9);
  },
  'le-begue': () => {
    const s = hand(atBoss(base(), 'le-begue'), REF.player, REF.dealer, []).state;
    expect(engine.whyIllegal(s, { type: 'double' })).toBe('Doubler est interdit à cette table.');
    expect(engine.whyIllegal(s, { type: 'discard', cardId: s.table!.hand!.playerCards[0].id })).toBe(
      'Défausser est interdit à cette table.',
    );
  },
  'le-chrono': () => expect(engine.getRules(atBoss(base(), 'le-chrono')).handsPerTable).toBe(HANDS - 1),
  'le-borgne': () => {
    const p = hand(atBoss(base(), 'le-borgne'), REF.player, REF.dealer, []);
    expect(ofType(p.events, 'cardDealt')[0]).toMatchObject({ to: 'player', faceDown: true });
    expect(p.state.table!.hand!.hiddenCardIds).toHaveLength(1);
  },
  'le-mur': () => {
    const intro = structuredClone(engine.newRun('MUR').state);
    intro.tableIndex = 2;
    intro.bossId = 'le-mur';
    intro.table = { ...intro.table!, kind: 'patron', bossId: 'le-mur' };
    const t = engine.dispatch(intro, { type: 'startTable' }).state.table!;
    const b = content.balance;
    expect(t.target).toBe(Math.round(b.salonBaseTargets[0] * b.tableFactors.patron * 2));
  },
  'le-sobre': () => {
    const s = atBoss(base(), 'le-sobre');
    expect(hand(s, REF.player, ['10C', '8D', '4H']).result).toMatchObject({ dealerTotal: 22, outcome: 'loss' });
    expect(hand(s, REF.player, ['10C', '9D']).result!.dealerTotal).toBe(19);
  },
  'le-radin': () => {
    const p = hand(atBoss(base(), 'le-radin'), ['10H', '5S', '4C'], ['10C', '7D'], [HIT, STAND]);
    expect(p.steps.find((x) => x.text === 'Neutralisée')).toBeTruthy();
    expect(p.result!.chips).toBe(H().chips + 15);
  },
  'le-douanier': () => {
    const s = withEnhancement(atBoss(base(), 'le-douanier'), '10H', 'plombee');
    expect(hand(s, REF.player, REF.dealer).result!.chips).toBe(H().chips + 9);
  },
  'la-maison': () => {
    const s = atBoss(base(), 'la-maison');
    expect(hand(s, ['10H', '8S'], ['10C', '8D']).result!.outcome).toBe('loss');
    const won = hand(s, REF.player, REF.dealer);
    expect(engine.getRules(won.state).playerLimit).toBe(20);
    const intro = structuredClone(engine.newRun('MAISON').state);
    intro.salon = content.balance.salons;
    intro.tableIndex = 2;
    intro.bossId = 'la-maison';
    intro.table = { ...intro.table!, kind: 'patron', bossId: 'la-maison' };
    const t = engine.dispatch(intro, { type: 'startTable' }).state.table!;
    const b = content.balance;
    expect(t.target).toBe(Math.round(b.salonBaseTargets[b.salons - 1] * b.tableFactors.patron * 2));
  },
};
const SUIT_BOSSES = { 'coeur-de-pierre': ['10H', 'hearts'], 'pique-nique': ['9S', 'spades'], 'carreau-casse': ['9D', 'diamonds'], 'trefle-fane': ['9C', 'clubs'] } as const;
for (const [id, [spec]] of Object.entries(SUIT_BOSSES)) {
  BOSSES[id] = () => {
    const player = [spec, spec.startsWith('10') ? '9S' : '10H'];
    if (id === 'pique-nique') player[1] = '10H';
    const p = hand(atBoss(base(), id), player, ['KC', '7D']);
    expect(p.steps.filter((x) => x.text === 'Neutralisée')).toHaveLength(1);
    // Arlequin : échappe au patron d'enseigne (comportement voulu par le contenu).
    const arl = hand(withEnhancement(atBoss(base(), id), spec, 'arlequin'), player, ['KC', '7D']);
    expect(arl.steps.filter((x) => x.text === 'Neutralisée')).toHaveLength(0);
  };
}

describe('patrons du contenu', () => {
  it('chaque patron a son scénario', () => {
    expect(content.bosses.map((b) => b.id).filter((id) => !(id in BOSSES))).toEqual([]);
  });
  for (const def of content.bosses) {
    const sc = BOSSES[def.id];
    if (sc) it(`${def.name} — ${def.description}`, sc);
  }
});

const PRIVILEGES: Record<string, (shop: RunState) => void> = {
  'main-supplementaire': (s) => expect(engine.getRules(buyPrivilege(s, 'main-supplementaire').state).handsPerTable).toBe(HANDS + 1),
  'defausse-supplementaire': (s) =>
    expect(engine.getRules(buyPrivilege(s, 'defausse-supplementaire').state).discardsPerTable).toBe(
      content.balance.baseRules.discardsPerTable + 1,
    ),
  'manche-longue': (s) =>
    expect(engine.getRules(buyPrivilege(s, 'manche-longue').state).atoutSlots).toBe(content.balance.baseRules.atoutSlots + 1),
  'double-fond': (s) =>
    expect(engine.getRules(buyPrivilege(s, 'double-fond').state).consumableSlots).toBe(
      content.balance.baseRules.consumableSlots + 1,
    ),
  vitrine: (s) => {
    const r = run(buyPrivilege(s, 'vitrine').state, [{ type: 'reroll' }]).state;
    expect(r.shop!.offers.filter((o) => o.kind !== 'privilege')).toHaveLength(content.balance.baseRules.shopOffers + 1);
  },
  'coffre-fort': (s) =>
    expect(engine.getRules(buyPrivilege(s, 'coffre-fort').state).interestCap).toBe(content.balance.baseRules.interestCap + 5),
  arrangement: (s) => {
    const after = buyPrivilege(s, 'arrangement').state;
    const table = engine.dispatch(engine.dispatch(after, { type: 'leaveShop' }).state, { type: 'startTable' }).state;
    expect(hand(table, ['10H', '8S'], ['10C', '8D']).result).toMatchObject({ outcome: 'push', mult: H().mult });
  },
  'ami-de-la-maison': (s) =>
    expect(buyPrivilege(s, 'ami-de-la-maison').state.shop!.rerollCost).toBe(content.balance.rerollBaseCost - 2),
  broyeur: (s) => expect(buyPrivilege(s, 'broyeur').state.shop!.shredsLeft).toBe(content.balance.shredsPerShop + 1),
  'carnet-d-adresses': (s) => {
    const p = buyPrivilege(s, 'carnet-d-adresses');
    expect(Object.values(p.state.figureLevels).every((lv) => lv === 2)).toBe(true);
  },
  'passe-droit': (s) => {
    expect(content.privileges.find((p) => p.id === 'passe-droit')!.minSalon).toBe(5);
    expect(engine.getRules(buyPrivilege(s, 'passe-droit').state).playerLimit).toBe(22);
  },
};

describe('privilèges du contenu', () => {
  it('chaque privilège a son scénario', () => {
    expect(content.privileges.map((p) => p.id).filter((id) => !(id in PRIVILEGES))).toEqual([]);
  });
  const shop = toShop(base(), 100);
  for (const def of content.privileges) {
    const sc = PRIVILEGES[def.id];
    if (sc) it(`${def.name} — ${def.description}`, () => sc(shop));
  }
});

describe('sabots de départ du contenu', () => {
  const decks = content.startingDecks ?? [];
  if (decks.length === 0) it.skip('aucun sabot de départ dans le contenu pour l’instant', () => {});
  for (const def of decks) {
    it(`${def.name} — ${def.description}`, () => {
      const { state } = engine.newRun('DECK', { deckId: def.id });
      expect(state.deckId).toBe(def.id);
      expect(state.deck.length).toBeGreaterThan(0);
      expect(new Set(state.deck.map((c) => c.id)).size).toBe(state.deck.length);
      const started = engine.dispatch(state, { type: 'startTable' }).state;
      expect(cardInvariantErrors(started)).toEqual([]);
      const stood = engine.dispatch(started, { type: 'stand' }).state;
      expect(stood.phase).toBe('handResult');
    });
  }
});

// Garde-fou : la main de référence vaut bien ce que les scénarios supposent.
it('main de référence', () => {
  const r = hand(base(), REF.player, REF.dealer).result!;
  expect(r).toMatchObject({ outcome: 'win', figure: 'haute', chips: REF_CHIPS(), mult: H().mult });
});

describe('mises du contenu (cumulatives)', () => {
  const startedWith = (stakeId: string, seed = 'MISE') =>
    engine.dispatch(engine.newRun(seed, { stakeId }).state, { type: 'startTable' }).state;
  const stakeIds = (content.stakes ?? []).map((x) => x.id);
  const b = content.balance;
  const STAKES: Record<string, () => void> = {
    'entre-amis': () => {
      const s = engine.newRun('MISE').state;
      expect(s).toMatchObject({ stakeId: 'entre-amis', stakeLevel: 0 });
      expect(s.table!.target).toBe(Math.round(b.salonBaseTargets[0] * b.tableFactors.petite));
    },
    'petite-cave': () => {
      expect(engine.newRun('MISE', { stakeId: 'petite-cave' }).state.table!.target).toBe(
        Math.round(b.salonBaseTargets[0] * b.tableFactors.petite * 1.15),
      );
    },
    'table-serieuse': () => {
      expect(engine.getRules(startedWith('table-serieuse')).discardsPerTable).toBe(b.baseRules.discardsPerTable - 1);
    },
    'gros-jeu': () => {
      const shop = toShop(startedWith('gros-jeu'), 100);
      for (const o of shop.shop!.offers) {
        const def =
          o.kind === 'atout'
            ? content.atouts.find((a) => a.id === o.defId)
            : o.kind === 'privilege'
              ? content.privileges.find((p) => p.id === o.defId)
              : content.consumables.find((c) => c.id === o.defId);
        const base = o.kind === 'card' ? (b.cardOfferCost ?? 4) : def!.cost;
        expect(o.cost).toBe(base + 1);
      }
      expect(shop.shop!.rerollCost).toBe(b.rerollBaseCost + 1);
      expect(shop.shop!.shredCost).toBe(b.shredBaseCost + 1 + b.shredCostStep * (shop.stats.cardsShredded ?? 0));
    },
    'sans-credit': () => expect(engine.getRules(startedWith('sans-credit')).interestCap).toBe(2),
    'cave-du-patron': () => {
      const s = startedWith('cave-du-patron');
      expect(engine.getRules(s).handsPerTable).toBe(b.baseRules.handsPerTable);
      expect(engine.getRules(atBoss(s, 'le-tricheur')).handsPerTable).toBe(b.baseRules.handsPerTable - 1);
    },
    'dernier-avertissement': () => {
      expect(engine.newRun('MISE', { stakeId: 'dernier-avertissement' }).state.table!.target).toBe(
        Math.round(b.salonBaseTargets[0] * b.tableFactors.petite * 1.15 * 1.15),
      );
    },
    'la-dette': () => {
      const s = startedWith('la-dette');
      expect(engine.getRules(s).atoutSlots).toBe(b.baseRules.atoutSlots - 1);
      // Les patrons arrivent un salon plus tôt : des patrons du salon 2 dès le salon 1.
      const early = new Set<string>();
      for (let i = 0; i < 60; i++) early.add(engine.newRun(`DETTE${i}`, { stakeId: 'la-dette' }).state.bossId);
      const minSalon2 = content.bosses.filter((x) => (x.minSalon ?? 1) === 2).map((x) => x.id);
      expect([...early].some((id) => minSalon2.includes(id))).toBe(true);
      for (let i = 0; i < 60; i++) expect(minSalon2).not.toContain(engine.newRun(`AMIS${i}`).state.bossId);
      // En sans fin, La Maison garde ses règles à chaque table.
      expect(engine.getRules(s).dealerWinsPush).toBe(false);
      const endless = structuredClone(s);
      endless.endless = true;
      const r = engine.getRules(endless);
      expect(r.dealerWinsPush).toBe(true);
      expect(r.targetFactor).toBeCloseTo(1.15 * 1.15 * 2, 5);
      const won = hand(endless, REF.player, REF.dealer);
      expect(engine.getRules(won.state).playerLimit).toBe(20);
    },
  };
  it('chaque mise a son scénario, de la plus douce à la plus dure', () => {
    expect(stakeIds.filter((id) => !(id in STAKES))).toEqual([]);
    expect(stakeIds[0]).toBe('entre-amis');
    expect(stakeIds.at(-1)).toBe('la-dette');
  });
  for (const def of content.stakes ?? []) {
    const sc = STAKES[def.id];
    if (sc) it(`${def.name} — ${def.description}`, sc);
  }
  it('mise inconnue de l’UI : erreur explicite', () => {
    expect(() => engine.newRun('MISE', { stakeId: 'mise-inconnue' })).toThrow('Mise inconnue');
  });
});
