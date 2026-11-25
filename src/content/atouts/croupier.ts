import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';
import { isFace } from '../util';

/** Le croupier : le faire crever, lire son jeu, le battre de peu. */
export const croupierAtouts: AtoutDef[] = [
  {
    id: 'croupier-nerveux',
    name: 'Croupier nerveux',
    description: "Le croupier s'arrête à 18 au lieu de 17 ; quand il crève : +4 Mult.",
    rarity: 'commun',
    cost: 5,
    art: { glyph: '18', pattern: 'damier', colors: [P.petrole, P.cerise] },
    hooks: {
      modifyRules(r) {
        r.dealerStandOn += 1;
      },
      onHandScored(ctx) {
        if (ctx.dealerBust) return { mult: 4 };
      },
    },
  },
  {
    id: 'croupier-fatigue',
    name: 'Croupier fatigué',
    description: "Le croupier crève dès qu'il atteint 21.",
    rarity: 'rare',
    cost: 8,
    art: { glyph: 'zZ', pattern: 'vagues', colors: [P.petrole, P.cendre] },
    hooks: {
      modifyRules(r) {
        r.dealerLimit -= 1;
      },
    },
  },
  {
    id: 'croupier-prudent',
    name: 'Croupier prudent',
    description: "Le croupier s'arrête dès 16 ; battre le croupier : +30 Jetons.",
    rarity: 'commun',
    cost: 4,
    art: { glyph: '16', pattern: 'uni', colors: [P.petrole, P.petrolePale] },
    hooks: {
      modifyRules(r) {
        r.dealerStandOn -= 1;
      },
      onHandScored(ctx) {
        if (ctx.outcome === 'win') return { chips: 30 };
      },
    },
  },
  {
    id: 'casse-banque',
    name: 'Casse-banque',
    description: 'Quand le croupier crève : ×3 Mult.',
    rarity: 'peu-commun',
    cost: 7,
    art: { glyph: '×3', pattern: 'soleil', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.dealerBust) return { xMult: 3 };
      },
    },
  },
  {
    id: 'rayons-x',
    name: 'Rayons X',
    description: 'Tu vois la carte cachée du croupier ; +1 Mult par carte de sa main.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: 'X', pattern: 'rayures', colors: [P.encre, P.petroleClair] },
    hooks: {
      modifyRules(r) {
        r.seeDealerHole = true;
      },
      onHandScored(ctx) {
        if (ctx.dealerCards.length > 0) return { mult: ctx.dealerCards.length };
      },
    },
  },
  {
    id: 'david',
    name: 'David',
    description: "Battre le croupier d'exactement 1 point : ×3 Mult.",
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'D', pattern: 'points', colors: [P.encre, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.outcome === 'win' && !ctx.dealerBust && ctx.margin === 1) return { xMult: 3 };
      },
    },
  },
  {
    id: 'vampire',
    name: 'Vampire',
    description: 'Si tu ne perds pas : +3 Jetons par point du total du croupier.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: 'V', pattern: 'chevrons', colors: [P.bordeaux, P.petrolePale] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.outcome !== 'win' && ctx.outcome !== 'push') return;
        if (ctx.dealerTotal > 0) return { chips: 3 * ctx.dealerTotal };
      },
    },
  },
  {
    id: 'miroir',
    name: 'Miroir',
    description: 'Les égalités comptent comme des victoires.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '||', pattern: 'losanges', colors: [P.prune, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.pushCountsAsWin = true;
      },
    },
  },
  {
    id: 'pickpocket',
    name: 'Pickpocket',
    description: 'Après chaque main : +2 $ par V, D ou R dans la main du croupier.',
    rarity: 'commun',
    cost: 3,
    art: { glyph: 'R', pattern: 'points', colors: [P.prune, P.pruneClair] },
    hooks: {
      onHandEnd(ctx) {
        const dealer = ctx.state.table?.hand?.dealerCards ?? [];
        const faces = dealer.filter(isFace).length;
        if (faces > 0) ctx.api.addMoney(2 * faces, 'Pickpocket');
      },
    },
  },
  {
    id: 'charognard',
    name: 'Charognard',
    description: 'Chaque fois que le croupier crève : +4 $.',
    rarity: 'commun',
    cost: 3,
    art: { glyph: '$', pattern: 'chevrons', colors: [P.bordeaux, P.pruneClair] },
    hooks: {
      onHandEnd(ctx, res) {
        if (res.dealerBust) ctx.api.addMoney(4, 'Charognard');
      },
    },
  },
  {
    id: 'coupe-gorge',
    name: 'Coupe-gorge',
    description: "Battre le croupier sans qu'il crève : +2 Mult par point d'écart.",
    rarity: 'commun',
    cost: 5,
    art: { glyph: '/', pattern: 'rayures', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.outcome === 'win' && !ctx.dealerBust && ctx.margin > 0) return { mult: 2 * ctx.margin };
      },
    },
  },
];
