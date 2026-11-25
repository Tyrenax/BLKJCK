import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';
import { isFace, isTenValue } from '../util';

/** Les grosses cartes : V, D, R, 10 et As. Se marie avec un sabot affiné (moins de petites cartes). */
export const tetesAtouts: AtoutDef[] = [
  {
    id: 'cour-royale',
    name: 'Cour royale',
    description: 'Chaque V, D ou R qui marque : ×2 Mult.',
    rarity: 'peu-commun',
    cost: 7,
    art: { glyph: 'VDR', pattern: 'losanges', colors: [P.prune, P.cerise] },
    hooks: {
      onCardScored(_ctx, card) {
        if (isFace(card)) return { xMult: 2 };
      },
    },
  },
  {
    id: 'gros-calibre',
    name: 'Gros calibre',
    description: 'Chaque 10, V, D ou R qui marque : +20 Jetons.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: '10', pattern: 'chevrons', colors: [P.encre, P.petrolePale] },
    hooks: {
      onCardScored(_ctx, card) {
        if (isTenValue(card)) return { chips: 20 };
      },
    },
  },
  {
    id: 'le-naturel',
    name: 'Le Naturel',
    description: 'Blackjack : ×5 Mult et +3 $.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'BJ', pattern: 'soleil', colors: [P.encre, P.pruneClair] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.figures.includes('blackjack')) return { xMult: 5, money: 3 };
      },
    },
  },
  {
    id: 'as-dans-la-manche',
    name: 'As dans la manche',
    description: 'Chaque As qui marque : +8 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'A', pattern: 'rayures', colors: [P.prune, P.cerise] },
    hooks: {
      onCardScored(_ctx, card) {
        if (card.rank === 'A') return { mult: 8 };
      },
    },
  },
  {
    id: 'haute-societe',
    name: 'Haute société',
    description: 'Ta main ne contient que des As et des cartes à 10 points : ×3 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'AR', pattern: 'damier', colors: [P.prune, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const cards = ctx.playerCards;
        if (cards.length > 0 && cards.every((c) => c.rank === 'A' || isTenValue(c))) return { xMult: 3 };
      },
    },
  },
  {
    id: 'jumeaux',
    name: 'Jumeaux',
    description: 'Ta main contient une Paire : +15 Mult.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: 'II', pattern: 'uni', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.figures.includes('paire')) return { mult: 15 };
      },
    },
  },
];
