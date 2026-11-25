/**
 * Scénarios de démonstration pour le faux moteur (?dev=1&scenario=…) : un sabot truqué
 * et une suite d'actions jouées toutes seules. Sert aux captures d'écran.
 */
import type { Action } from '../../engine/types';
import type { FakeOptions } from './fakeEngine';

export interface Scenario {
  opts: FakeOptions;
  actions: Action[];
}

export const SCENARIOS: Record<string, Scenario> = {
  /** Une main complète : tirer jusqu'à pile 21, le croupier crève, longue cascade. */
  cascade: {
    opts: {
      atouts: ['sang-chaud', 'pique-assiette', 'cour-royale', 'sur-le-fil', 'casse-banque'],
      consumables: ['elastique', 'coup-d-oeil'],
      money: 9,
      stack: {
        player: [{ rank: '5', suit: 'hearts', enhancement: 'ardente' }, { rank: '6', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
        dealer: [{ rank: '10', suit: 'clubs' }, { rank: '6', suit: 'diamonds' }, { rank: '9', suit: 'clubs' }],
      },
    },
    actions: [{ type: 'startTable' }, { type: 'hit' }, { type: 'stand' }],
  },
  /** Défaite : la banque garde ton Mult. */
  loss: {
    opts: {
      atouts: ['sang-chaud', 'sur-le-fil'],
      stack: {
        player: [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'hearts' }],
        dealer: [{ rank: '10', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
      },
    },
    actions: [{ type: 'startTable' }, { type: 'stand' }],
  },
  /** Crevé, sans rattrapage possible (aucune défausse, aucune combine). */
  bust: {
    opts: {
      atouts: ['marge'],
      stack: {
        player: [{ rank: '9', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: 'K', suit: 'clubs' }],
        dealer: [{ rank: '7', suit: 'hearts' }, { rank: '10', suit: 'clubs' }],
      },
    },
    actions: [{ type: 'startTable' }, { type: 'hit' }, { type: 'acceptBust' }],
  },
  /** Crevé avec une dernière chance (défausses restantes) : phase bustChoice. */
  bustchoice: {
    opts: {
      stack: {
        player: [{ rank: '9', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: 'K', suit: 'clubs' }],
        dealer: [{ rank: '7', suit: 'hearts' }, { rank: '10', suit: 'clubs' }],
      },
    },
    actions: [{ type: 'startTable' }, { type: 'hit' }],
  },
  /** Changement de limite en pleine main : la Jauge s'allonge (Élastique, +2). */
  limit: {
    opts: {
      consumables: ['elastique'],
      atouts: ['marge'],
      stack: {
        player: [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }, { rank: '5', suit: 'clubs' }],
        dealer: [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
      },
    },
    actions: [{ type: 'startTable' }, { type: 'useConsumable', uid: 2 }, { type: 'hit' }, { type: 'stand' }],
  },
  /** Patron « La Pince » : la règle se fait rogner à 20. */
  boss: {
    opts: { tableIndex: 2, bossId: 'la-pince', atouts: ['marge', 'rayons-x'], stack: { player: [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'spades' }] } },
    actions: [],
  },
  /** Main en cours, rien d'automatique (pour jouer à la main). */
  play: {
    opts: { atouts: ['sang-chaud', 'pique-assiette', 'compteur'], consumables: ['echange', 'plomb'], money: 12 },
    actions: [{ type: 'startTable' }],
  },
  /** Table battue (objectif minuscule) : écran d'encaissement. */
  won: { opts: { target: 5, money: 7 }, actions: [{ type: 'startTable' }, { type: 'stand' }, { type: 'nextHand' }] },
  /** Boutique. */
  shop: { opts: { target: 5, money: 24, atouts: ['sang-chaud', 'marge'], consumables: ['plomb'] }, actions: [{ type: 'startTable' }, { type: 'stand' }, { type: 'nextHand' }, { type: 'cashOut' }] },
  /** Fin de partie. */
  over: { opts: { target: 99999, rules: { handsPerTable: 1 } }, actions: [{ type: 'startTable' }, { type: 'stand' }, { type: 'nextHand' }] },
  /** Victoire. */
  victory: { opts: { target: 5, salon: 8, tableIndex: 2, bossId: 'la-maison' }, actions: [{ type: 'startTable' }, { type: 'stand' }, { type: 'nextHand' }, { type: 'cashOut' }] },
  /** Gros score : flammes sur le compteur. */
  big: {
    opts: {
      atouts: ['cour-royale', 'sur-le-fil', 'casse-banque', 'sang-chaud'],
      stack: {
        player: [{ rank: 'A', suit: 'hearts', enhancement: 'cristal' }, { rank: 'K', suit: 'hearts', enhancement: 'plombee' }],
        dealer: [{ rank: '10', suit: 'clubs' }, { rank: '6', suit: 'diamonds' }, { rank: 'Q', suit: 'clubs' }],
      },
    },
    actions: [{ type: 'startTable' }, { type: 'stand' }],
  },
};
