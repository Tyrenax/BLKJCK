/**
 * Variantes d'atouts à l'essai, mesurées par `--exp marginal` à côté du vrai contenu,
 * avant d'en retenir une dans src/content.
 */
import type { AtoutDef } from '../../src/engine/types';

const art = (glyph: string): AtoutDef['art'] => ({ glyph, pattern: 'uni', colors: ['nuit', 'cendre'] });

export const candidates: AtoutDef[] = [
  {
    id: 'essai-rayons-x-1',
    name: 'Rayons X +1',
    description: 'Tu vois la carte cachée du croupier ; +1 Mult par carte de sa main.',
    rarity: 'commun',
    cost: 5,
    art: art('X1'),
    hooks: {
      modifyRules: (r) => void (r.seeDealerHole = true),
      onHandScored: (ctx) => ({ mult: ctx.dealerCards.length }),
    },
  },
  {
    id: 'essai-prudent-gain-30',
    name: 'Croupier prudent + 30',
    description: "Le croupier s'arrête dès 16 ; battre le croupier : +30 Jetons.",
    rarity: 'commun',
    cost: 4,
    art: art('P3'),
    hooks: {
      modifyRules: (r) => void (r.dealerStandOn -= 1),
      onHandScored: (ctx) => (ctx.outcome === 'win' ? { chips: 30 } : undefined),
    },
  },
  {
    id: 'essai-nerveux-2',
    name: 'Croupier nerveux ±2',
    description: "Le croupier s'arrête à 19.",
    rarity: 'commun',
    cost: 5,
    art: art('N2'),
    hooks: { modifyRules: (r) => void (r.dealerStandOn += 2) },
  },
  {
    id: 'essai-prudent-2',
    name: 'Croupier prudent ±2',
    description: "Le croupier s'arrête dès 15.",
    rarity: 'commun',
    cost: 4,
    art: art('P2'),
    hooks: { modifyRules: (r) => void (r.dealerStandOn -= 2) },
  },
  {
    id: 'essai-nerveux-gain',
    name: 'Croupier nerveux + gain',
    description: "Le croupier s'arrête à 18 ; quand il crève : +4 Mult.",
    rarity: 'commun',
    cost: 5,
    art: art('NG'),
    hooks: {
      modifyRules: (r) => void (r.dealerStandOn += 1),
      onHandScored: (ctx) => (ctx.dealerBust ? { mult: 4 } : undefined),
    },
  },
  {
    id: 'essai-prudent-gain',
    name: 'Croupier prudent + gain',
    description: "Le croupier s'arrête dès 16 ; battre le croupier : +20 Jetons.",
    rarity: 'commun',
    cost: 4,
    art: art('PG'),
    hooks: {
      modifyRules: (r) => void (r.dealerStandOn -= 1),
      onHandScored: (ctx) => (ctx.outcome === 'win' ? { chips: 20 } : undefined),
    },
  },
];
