/**
 * Chaque atout du vrai contenu, joué dans une vraie main : le comportement doit correspondre à la
 * phrase affichée. Valeurs de figure lues dans le contenu (F), valeurs d'atout tirées de la phrase.
 */
import { describe, expect, it } from 'vitest';
import { cardInvariantErrors, withEnhancement } from '../testing/helpers';
import type { RunState } from '../types';
import {
  atBossTableReal,
  base,
  content,
  DOUBLE,
  discard,
  engine,
  F,
  give,
  hand,
  HIT,
  nextRigged,
  REF,
  REF_CHIPS,
  run,
  setAtoutState,
  STAND,
  toShop,
  winTable,
} from './helpers';

const H = () => F('haute');
/** Mains par table de la balance actuelle (bjck-6a la règle : jamais écrite en dur). */
const HANDS = content.balance.baseRules.handsPerTable;
const DISCARDS = content.balance.baseRules.discardsPerTable;
type Scenario = () => void;

/** Une main de référence avec ces atouts (10♥ 9♠ contre 10♣ 7♦). */
const ref = (...ids: string[]) => hand(give(base(), ...ids), REF.player, REF.dealer);

const SCENARIOS: Record<string, Scenario> = {
  // ── La limite ──
  'marge-de-manoeuvre': () => {
    const s = give(base(), 'marge-de-manoeuvre');
    expect(engine.getRules(s).playerLimit).toBe(22);
    const r = hand(s, ['10H', '6S', '6C'], ['10C', '7D'], [HIT, STAND]).result!;
    expect(r).toMatchObject({ outcome: 'win', playerTotal: 22, figure: 'pile' });
  },
  'vingt-trois': () => {
    const r = engine.getRules(give(base(), 'vingt-trois'));
    expect(r.playerLimit).toBe(23);
    expect(r.discardsPerTable).toBe(DISCARDS - 1);
    expect(r.handsPerTable).toBe(HANDS);
  },
  'plafond-de-verre': () => {
    const s = give(base('PV', 10), 'plafond-de-verre');
    expect(engine.getRules(s).playerLimit).toBe(23);
    const p = hand(s, ['10H', '6S', '7C'], ['10C', '7D'], [HIT, STAND]);
    expect(p.result).toMatchObject({ outcome: 'win', playerTotal: 23 });
    expect(p.money).toBe(-2); // 2 points au-dessus de 21
  },
  funambule: () => {
    const r = hand(give(base(), 'funambule'), ['KH', '10S'], ['10C', '7D']).result!;
    expect(r).toMatchObject({ playerTotal: 20, chips: H().chips + 20, mult: H().mult * 3 });
  },
  'pile-poil': () => {
    const r = hand(give(base(), 'pile-poil'), ['10H', '5S', '6C'], ['10C', '7D'], [HIT, STAND]).result!;
    expect(r).toMatchObject({ figure: 'pile', chips: F('pile').chips + 21, mult: F('pile').mult * 3 });
  },
  'sur-le-fil': () => {
    expect(ref('sur-le-fil').result).toMatchObject({ mult: H().mult + 2 * (19 - 17) });
  },
  ascenseur: () => {
    // Main gagnée : limite +1 jusqu'à la fin de la table. La main suivante tient à 22 sans crever.
    const p1 = ref('ascenseur');
    expect(engine.getRules(p1.state).playerLimit).toBe(22);
    const p2 = nextRigged(p1, ['10H', '6S', '6C'], ['10C', '7D'], [HIT, STAND]);
    expect(p2.result).toMatchObject({ outcome: 'win', playerTotal: 22 });
    expect(engine.getRules(p2.state).playerLimit).toBe(23);
    // Fin de table : remis à zéro.
    const won = winTable(give(base(), 'ascenseur'));
    expect(engine.getRules(won.state).playerLimit).toBe(21);
  },
  altitude: () => {
    expect(ref('marge-de-manoeuvre', 'altitude').result).toMatchObject({ mult: H().mult + 5 });
    expect(ref('altitude').result).toMatchObject({ mult: H().mult });
  },
  'corde-raide': () => {
    const s = give(base(), 'corde-raide');
    expect(engine.getRules(s).playerLimit).toBe(20);
    expect(hand(s, REF.player, REF.dealer).result).toMatchObject({ mult: H().mult * 2 });
  },

  // ── Le croupier ──
  'croupier-nerveux': () => {
    const r = hand(give(base(), 'croupier-nerveux'), REF.player, ['10C', '7D', '4H']).result!;
    expect(r.dealerTotal).toBe(21);
    expect(engine.getRules(give(base(), 'croupier-nerveux')).dealerStandOn).toBe(18);
    // Quand il crève : +4 Mult.
    const bust = hand(give(base(), 'croupier-nerveux'), REF.player, ['10C', '6D', 'KD']).result!;
    expect(bust).toMatchObject({ dealerBust: true, mult: H().mult + 4 });
  },
  'croupier-fatigue': () => {
    const r = hand(give(base(), 'croupier-fatigue'), REF.player, ['10C', '6D', '5H']).result!;
    expect(r).toMatchObject({ outcome: 'win', dealerBust: true, dealerTotal: 21 });
  },
  'croupier-prudent': () => {
    const p = hand(give(base(), 'croupier-prudent'), REF.player, ['10C', '6D', '5H']);
    expect(p.result).toMatchObject({ outcome: 'win', dealerTotal: 16, chips: REF_CHIPS() + 30 });
    expect(p.state.table!.hand!.dealerCards).toHaveLength(2);
    expect(hand(give(base(), 'croupier-prudent'), ['10H', '7S'], ['10C', '9D']).result!.chips).toBe(H().chips + 17);
  },
  'casse-banque': () => {
    const r = hand(give(base(), 'casse-banque'), REF.player, ['10C', '6D', 'KD']).result!;
    expect(r).toMatchObject({ dealerBust: true, mult: H().mult * 3 });
    expect(ref('casse-banque').result!.mult).toBe(H().mult);
  },
  'rayons-x': () => {
    expect(engine.getRules(give(base(), 'rayons-x')).seeDealerHole).toBe(true);
    expect(ref('rayons-x').result!.mult).toBe(H().mult + 2);
    expect(hand(give(base(), 'rayons-x'), REF.player, ['10C', '6D', 'KD']).result!.mult).toBe(H().mult + 3);
  },
  david: () => {
    const r = hand(give(base(), 'david'), ['10H', '8S'], ['10C', '7D']).result!;
    expect(r).toMatchObject({ outcome: 'win', mult: H().mult * 3 });
    expect(ref('david').result!.mult).toBe(H().mult); // écart de 2
  },
  vampire: () => {
    expect(ref('vampire').result).toMatchObject({ chips: REF_CHIPS() + 3 * 17 });
    const loss = hand(give(base(), 'vampire'), ['10H', '7S'], ['10C', '9D']).result!;
    expect(loss).toMatchObject({ outcome: 'loss', chips: H().chips + 17 });
  },
  miroir: () => {
    const r = hand(give(base(), 'miroir'), ['10H', '8S'], ['10C', '8D']).result!;
    expect(r).toMatchObject({ outcome: 'win', mult: H().mult });
  },
  pickpocket: () => {
    const p = hand(give(base(), 'pickpocket'), ['10H', '9S'], ['KC', 'QD']);
    expect(p.result!.outcome).toBe('loss');
    expect(p.money).toBe(2 * 2);
  },
  charognard: () => {
    expect(hand(give(base(), 'charognard'), REF.player, ['10C', '6D', 'KD']).money).toBe(4);
    expect(ref('charognard').money).toBe(0);
  },
  'coupe-gorge': () => {
    expect(ref('coupe-gorge').result).toMatchObject({ mult: H().mult + 2 * 2 });
    expect(hand(give(base(), 'coupe-gorge'), REF.player, ['10C', '6D', 'KD']).result!.mult).toBe(H().mult);
  },

  // ── Les enseignes ──
  'sang-chaud': () => expect(ref('sang-chaud').result).toMatchObject({ mult: H().mult + 5 }),
  'pique-assiette': () => expect(ref('pique-assiette').result).toMatchObject({ chips: REF_CHIPS() + 30 }),
  'riviere-de-carreaux': () => {
    expect(hand(give(base(), 'riviere-de-carreaux'), ['10D', '9D'], ['10C', '7D']).money).toBe(2 * 2);
  },
  'trefle-a-quatre-feuilles': () => {
    let lucky = 0;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const p = hand(give(base(`TREFLE${i}`), 'trefle-a-quatre-feuilles'), ['10C', '9C'], ['10H', '7D']);
      lucky += p.steps.filter((x) => x.text === 'Veinard !').length;
    }
    expect(lucky / (2 * N)).toBeGreaterThan(0.2);
    expect(lucky / (2 * N)).toBeLessThan(0.47);
  },
  'rouge-ou-noir': () => {
    const p = ref('rouge-ou-noir');
    // 10♥ rouge, 9♠ noir : exactement une des deux cartes est de la couleur tirée.
    expect(p.result!.mult).toBe(H().mult * 1.5);
    const said = p.events.filter((e) => e.type === 'atoutTriggered').map((e) => (e as { text: string }).text);
    expect(said.some((t) => t === 'Rouge !' || t === 'Noir !')).toBe(true);
  },
  monochrome: () => {
    expect(hand(give(base(), 'monochrome'), ['10H', '9D'], ['10C', '7D']).result!.mult).toBe(H().mult * 2.5);
    expect(ref('monochrome').result!.mult).toBe(H().mult);
  },
  'arc-en-ciel': () => {
    const r = hand(give(base(), 'arc-en-ciel'), ['5H', '4S', '3D'], ['10C', '6D', 'KD'], [HIT, STAND]).result!;
    expect(r).toMatchObject({ outcome: 'win', chips: F('petite').chips + 12, mult: F('petite').mult * 2 });
    // Deux enseignes seulement : rien.
    expect(ref('arc-en-ciel').result!.mult).toBe(H().mult);
  },

  // ── Les grosses cartes ──
  'cour-royale': () => {
    const r = hand(give(base(), 'cour-royale'), ['KH', 'QS'], ['10C', '7D']).result!;
    expect(r).toMatchObject({ chips: H().chips + 20, mult: H().mult * 2 * 2 });
  },
  'gros-calibre': () => expect(ref('gros-calibre').result).toMatchObject({ chips: REF_CHIPS() + 20 }),
  'le-naturel': () => {
    const p = hand(give(base(), 'le-naturel'), ['AS', 'KH'], ['10C', '7D']);
    expect(p.result).toMatchObject({ figure: 'blackjack', chips: F('blackjack').chips + 21, mult: F('blackjack').mult * 5 });
    expect(p.money).toBe(3);
  },
  'as-dans-la-manche': () => {
    const r = hand(give(base(), 'as-dans-la-manche'), ['AS', '8H'], ['10C', '7D']).result!;
    expect(r).toMatchObject({ chips: H().chips + 11 + 8, mult: H().mult + 8 });
    // Deux As (12, Petite main) : +8 Mult chacun.
    expect(hand(give(base(), 'as-dans-la-manche'), ['AS', 'AH'], ['10C', '6D', 'KD']).result!.mult).toBe(F('paire').mult + 16);
  },
  'haute-societe': () => {
    expect(hand(give(base(), 'haute-societe'), ['KH', 'QS'], ['10C', '7D']).result!.mult).toBe(H().mult * 3);
    // As + 10 + R en 3 cartes (21 pile) : toujours que des As et des cartes à 10 points.
    expect(hand(give(base(), 'haute-societe'), ['KH', '10S', 'AD'], ['10C', '7D'], [HIT, STAND]).result).toMatchObject({
      figure: 'pile',
      mult: F('pile').mult * 3,
    });
    expect(ref('haute-societe').result!.mult).toBe(H().mult);
  },
  jumeaux: () => {
    const r = hand(give(base(), 'jumeaux'), ['9H', '9S'], ['10C', '7D']).result!;
    expect(r).toMatchObject({ figure: 'paire', mult: F('paire').mult + 15 });
  },

  // ── Petites cartes et Charlie ──
  'menu-fretin': () => {
    const r = hand(give(base(), 'menu-fretin'), ['10H', '5S', '4C'], ['10C', '7D'], [HIT, STAND]).result!;
    expect(r).toMatchObject({ chips: H().chips + 19, mult: H().mult + 4 * 2 });
  },
  'nombres-premiers': () => {
    const r = hand(give(base(), 'nombres-premiers'), ['10H', '7S'], ['10C', '6D', 'KD']).result!;
    expect(r).toMatchObject({ chips: H().chips + 17 + 15, mult: H().mult + 3 });
  },
  'sept-merveilles': () => {
    const r = hand(give(base(), 'sept-merveilles'), ['10H', '7S'], ['10C', '6D', 'KD']).result!;
    expect(r).toMatchObject({ chips: H().chips + 17 + 7, mult: H().mult + 7 });
  },
  'mille-pattes': () => expect(ref('mille-pattes').result).toMatchObject({ chips: REF_CHIPS() + 15 * 2 }),
  'quatre-a-quatre': () => {
    // Charlie de base à rules.charlieSize cartes (4 dans la balance actuelle).
    const n = content.balance.baseRules.charlieSize;
    const cards = ['2H', '3S', '4C', '5D', '2S'].slice(0, n);
    const hits = Array.from({ length: n - 2 }, () => HIT);
    const r = hand(give(base(), 'quatre-a-quatre'), cards, ['10C', '6D', 'KD'], [...hits, STAND]).result!;
    expect(r).toMatchObject({ figure: 'charlie', mult: F('charlie').mult * 3 });
  },
  'rase-mottes': () => {
    const r = hand(give(base(), 'rase-mottes'), ['10H', '4S'], ['10C', '6D', 'KD']).result!;
    expect(r).toMatchObject({ outcome: 'win', playerTotal: 14, mult: F('petite').mult * 4 });
    expect(hand(give(base(), 'rase-mottes'), ['10H', '5S'], ['10C', '6D', 'KD']).result!.mult).toBe(F('petite').mult);
  },
  echo: () => {
    const p = ref('echo');
    expect(p.result!.chips).toBe(REF_CHIPS() + 9);
    expect(p.steps.map((x) => x.text)).toContain('Encore !');
  },

  // ── Le risque ──
  'tete-brulee': () => {
    const r = hand(give(base(), 'tete-brulee'), ['10H', '5S', '4C'], ['10C', '7D'], [HIT, STAND]).result!;
    expect(r.mult).toBe(H().mult + 3);
  },
  'sang-froid': () => {
    expect(ref('sang-froid').result!.chips).toBe(REF_CHIPS() + 40);
    expect(hand(give(base(), 'sang-froid'), ['10H', '5S', '4C'], ['10C', '7D'], [HIT, STAND]).result!.chips).toBe(
      H().chips + 19,
    );
  },
  'quitte-ou-double': () => {
    const r = hand(give(base(), 'quitte-ou-double'), ['5H', '6S', '9C'], ['10C', '7D'], [DOUBLE]).result!;
    expect(r).toMatchObject({ outcome: 'win', mult: H().mult * 3 });
  },
  parachute: () => {
    const p = hand(give(base(), 'parachute'), ['10H', '6S', 'KC', 'QC'], ['10C', '7D'], [HIT]);
    expect(p.state.phase).toBe('playerTurn');
    expect(p.state.table!.discardsLeft).toBe(2);
    // Second crevé de la table : déjà ouvert, la main est perdue.
    const again = run(p.state, [HIT]);
    expect(again.state.table!.hand!.result!.outcome).toBe('bust');
  },
  harnais: () => {
    const s = give(base(), 'harnais');
    const busted = hand(s, ['10H', '6S', 'KC'], ['10C', '7D'], [HIT]);
    expect(busted.state.phase).toBe('bustChoice');
    const saved = run(busted.state, [discard('KC')]);
    expect(saved.state.phase).toBe('playerTurn');
    // Sans Harnais : trop tard.
    expect(hand(base(), ['10H', '6S', 'KC'], ['10C', '7D'], [HIT]).state.phase).toBe('handResult');
  },
  'lot-de-consolation': () => {
    const r = hand(give(base(), 'lot-de-consolation'), ['9H', '9S'], ['10C', '9D']).result!;
    expect(r).toMatchObject({ outcome: 'loss', mult: Math.max(1, F('paire').mult * 0.5) });
  },
  'compteur-de-cartes': () => {
    const s = give(base(), 'compteur-de-cartes');
    expect(engine.visibleNextCard(s)).toEqual(s.table!.drawPile[0]);
  },
  tapis: () => {
    expect(ref('tapis').result!.mult).toBe(H().mult * 3);
    // Défaite : 0, même avec un atout à Jetons placé à droite.
    const loss = hand(give(base(), 'tapis', 'mille-pattes'), ['10H', '7S'], ['10C', '9D']);
    expect(loss.result).toMatchObject({ outcome: 'loss', score: 0 });
    expect(loss.steps.map((x) => x.text)).toEqual(expect.arrayContaining(['Tapis perdu', 'Main annulée']));
  },
  'roulette-russe': () => {
    let dead = 0;
    const N = 150;
    for (let i = 0; i < N; i++) {
      const r = hand(give(base(`RR${i}`), 'roulette-russe'), REF.player, REF.dealer).result!;
      if (r.score === 0) dead++;
      else expect(r.mult).toBe(H().mult * 2);
    }
    expect(dead / N).toBeGreaterThan(0.06);
    expect(dead / N).toBeLessThan(0.3);
  },
  'sans-filet': () => {
    const s = give(base(), 'sans-filet');
    expect(hand(s, REF.player, REF.dealer).result!.mult).toBe(H().mult * 2.5);
    const dealt = hand(s, REF.player, REF.dealer, []).state;
    expect(engine.whyIllegal(dealt, { type: 'discard', cardId: dealt.table!.hand!.playerCards[0].id })).toBe(
      'Défausser est interdit à cette table.',
    );
  },
  'dix-de-der': () => {
    const s = give(base(), 'dix-de-der');
    expect(hand(s, REF.player, REF.dealer, [STAND], { handsDealt: HANDS - 1 }).result!.mult).toBe(H().mult * 3);
    expect(hand(s, REF.player, REF.dealer, [STAND], { handsDealt: HANDS - 2 }).result!.mult).toBe(H().mult);
  },

  // ── Ce qui grossit ──
  'boule-de-neige': () => {
    const p1 = ref('boule-de-neige');
    expect(p1.state.atouts[0].state.mult).toBe(1);
    const p2 = nextRigged(p1, REF.player, REF.dealer);
    expect(p2.result!.mult).toBe(H().mult + 1);
    expect(p2.state.atouts[0].state.mult).toBe(2);
    // Main perdue : −1.
    const lost = nextRigged(p2, ['10H', '7S'], ['10C', '9D']);
    expect(lost.state.atouts[0].state.mult).toBe(1);
    // Crevé : retombe à 0.
    const p3 = nextRigged(lost, ['10H', '6S', 'KC'], ['10C', '7D'], [HIT]);
    expect(p3.result!.outcome).toBe('bust');
    expect(p3.state.atouts[0].state.mult).toBe(0);
  },
  martingale: () => {
    const p1 = hand(give(base(), 'martingale'), ['10H', '7S'], ['10C', '9D']);
    expect(p1.state.atouts[0].state.streak).toBe(1);
    const p2 = nextRigged(p1, REF.player, REF.dealer);
    expect(p2.result!.mult).toBe(H().mult * 2);
    expect(p2.state.atouts[0].state.streak).toBe(0);
  },
  pyromane: () => {
    const p = hand(give(base(), 'pyromane'), ['10H', '6S', '9C'], ['10C', '7D'], [discard('6S'), HIT, STAND]);
    expect(p.result!.chips).toBe(H().chips + 19 + 4);
    expect(p.state.atouts[0].state.chips).toBe(4);
  },
  collectionneur: () => {
    expect(ref('collectionneur', 'pourboire').result!.mult).toBe(H().mult + 2 * 2);
  },
  'vieux-de-la-vieille': () => {
    // +3 Mult par patron battu ; une autre table ne compte pas.
    expect(winTable(give(base(), 'vieux-de-la-vieille')).state.atouts[0].state.mult).toBe(0);
    const won = winTable(atBossTableReal(give(base(), 'vieux-de-la-vieille'), 'le-tricheur'));
    expect(won.state.atouts[0].state.mult).toBe(3);
  },
  cicatrices: () => {
    const p1 = hand(give(base(), 'cicatrices'), ['10H', '6S', 'KC'], ['10C', '7D'], [HIT]);
    expect(p1.state.atouts[0].state.chips).toBe(15);
    expect(nextRigged(p1, REF.player, REF.dealer).result!.chips).toBe(REF_CHIPS() + 15);
  },
  cigare: () => {
    const p = ref('cigare');
    expect(p.result!.mult).toBe(H().mult + 12);
    expect(p.state.atouts[0].state.mult).toBe(10);
    // À 2 : dernière bouffée, puis l'atout se retire lui-même pendant son crochet.
    const last = hand(setAtoutState(give(base(), 'cigare', 'pourboire'), 'cigare', { mult: 2 }), REF.player, REF.dealer);
    expect(last.result!.mult).toBe(H().mult + 2);
    expect(last.state.atouts.map((a) => a.defId)).toEqual(['pourboire']);
    expect(last.events.some((e) => e.type === 'atoutRemoved')).toBe(true);
    expect(last.money).toBe(2); // l'atout à sa droite (Pourboire) s'est quand même déclenché
    expect(cardInvariantErrors(last.state)).toEqual([]);
  },

  // ── L'argent ──
  pourboire: () => {
    expect(ref('pourboire').money).toBe(2);
    expect(hand(give(base(), 'pourboire'), ['10H', '7S'], ['10C', '9D']).money).toBe(0);
  },
  flambeur: () => {
    expect(hand(give(base('FL', 9), 'flambeur'), REF.player, REF.dealer).result!.mult).toBe(H().mult + 3);
  },
  'preteur-sur-gages': () => {
    expect(engine.getRules(give(base(), 'preteur-sur-gages')).interestCap).toBe(content.balance.baseRules.interestCap + 10);
  },
  tirelire: () => {
    const won = winTable(give(base(), 'tirelire'));
    expect(won.events.some((e) => e.type === 'moneyChanged' && e.reason === 'Tirelire' && e.delta === 6)).toBe(true);
  },
  racket: () => {
    const won = winTable(give(base(), 'racket'));
    // 2 mains distribuées : les autres sont non jouées.
    expect(won.events.some((e) => e.type === 'moneyChanged' && e.reason === 'Racket' && e.delta === 2 * (HANDS - 2))).toBe(true);
  },
  'carte-de-fidelite': () => {
    const shop = toShop(give(base(), 'carte-de-fidelite'), 0);
    expect(shop.shop).toMatchObject({ freeRerollsLeft: 2, rerollCost: 0 });
    const after = run(shop, [{ type: 'reroll' }, { type: 'reroll' }]).state;
    expect(after.money).toBe(0);
    expect(after.shop!.rerollCost).toBe(content.balance.rerollBaseCost);
  },

  // ── Le sabot affiné ──
  'sabot-leger': () => {
    const s = give(base(), 'sabot-leger');
    s.deck = s.deck.filter((c) => !(c.rank === '2' && (c.suit === 'clubs' || c.suit === 'spades')));
    expect(hand(s, REF.player, REF.dealer).result!.mult).toBe(H().mult + 2 * 2);
  },
  'poids-plume': () => {
    const s = give(base(), 'poids-plume');
    s.deck = s.deck.filter((c) => !['2', '3'].includes(c.rank));
    expect(s.deck).toHaveLength(44);
    expect(hand(s, REF.player, REF.dealer).result!.mult).toBe(H().mult * 2.5);
    expect(ref('poids-plume').result!.mult).toBe(H().mult);
  },
  'carte-maitresse': () => {
    const s = withEnhancement(give(base(), 'carte-maitresse'), '10H', 'plombee');
    expect(hand(s, REF.player, REF.dealer).result).toMatchObject({ chips: REF_CHIPS() + 30, mult: H().mult + 3 });
  },

  // ── Légendaires ──
  'le-parrain': () => {
    expect(ref('le-parrain').result!.mult).toBe(H().mult * 1.5);
    const won = winTable(atBossTableReal(give(base(), 'le-parrain'), 'le-tricheur'));
    expect(won.state.atouts[0].state.x).toBe(2);
    // Table qui n'est pas celle du patron : pas de bonus. Plafond ×4.
    expect(winTable(give(base(), 'le-parrain')).state.atouts[0].state.x).toBe(1.5);
    const capped = winTable(atBossTableReal(setAtoutState(give(base(), 'le-parrain'), 'le-parrain', { x: 4 }), 'le-tricheur'));
    expect(capped.state.atouts[0].state.x).toBe(4);
  },
  'l-ambidextre': () => {
    expect(ref('l-ambidextre').result!.chips).toBe(H().chips + 2 * 19);
  },
};

describe('atouts du contenu, joués dans le moteur', () => {
  it('chaque atout a son scénario', () => {
    const missing = content.atouts.map((a) => a.id).filter((id) => !(id in SCENARIOS));
    expect(missing).toEqual([]);
  });
  for (const def of content.atouts) {
    const desc = typeof def.description === 'string' ? def.description : def.description(
      { uid: 0, defId: def.id, state: def.initialState ? def.initialState() : {} },
      undefined as unknown as RunState,
    );
    const scenario = SCENARIOS[def.id];
    if (scenario) it(`${def.name} — ${desc}`, scenario);
  }
});
