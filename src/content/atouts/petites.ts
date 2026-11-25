import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';
import { isPrime, isSmall } from '../util';

/** Petites cartes et Charlie : beaucoup de cartes en main, des totaux bas, des effets par carte. */
export const petitesAtouts: AtoutDef[] = [
  {
    id: 'menu-fretin',
    name: 'Menu fretin',
    description: 'Chaque carte de 2 à 5 qui marque : +4 Mult.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '2-5', pattern: 'points', colors: [P.petrole, P.cerise] },
    hooks: {
      onCardScored(_ctx, card) {
        if (isSmall(card)) return { mult: 4 };
      },
    },
  },
  {
    id: 'nombres-premiers',
    name: 'Nombres premiers',
    description: 'Chaque 2, 3, 5 ou 7 qui marque : +15 Jetons et +3 Mult.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '357', pattern: 'damier', colors: [P.petrole, P.petrolePale] },
    hooks: {
      onCardScored(_ctx, card) {
        if (isPrime(card)) return { chips: 15, mult: 3 };
      },
    },
  },
  {
    id: 'sept-merveilles',
    name: 'Sept merveilles',
    description: 'Chaque 7 qui marque : +7 Jetons et +7 Mult.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '7', pattern: 'soleil', colors: [P.prune, P.cerise] },
    hooks: {
      onCardScored(_ctx, card) {
        if (card.rank === '7') return { chips: 7, mult: 7 };
      },
    },
  },
  {
    id: 'mille-pattes',
    name: 'Mille-pattes',
    description: '+15 Jetons par carte de ta main.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: '|||', pattern: 'rayures', colors: [P.petrole, P.petrolePale] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.playerCards.length > 0) return { chips: 15 * ctx.playerCards.length };
      },
    },
  },
  {
    id: 'quatre-a-quatre',
    name: 'Quatre à quatre',
    description: 'Charlie : ×3 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '4-4', pattern: 'vagues', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.figures.includes('charlie')) return { xMult: 3 };
      },
    },
  },
  {
    id: 'rase-mottes',
    name: 'Rase-mottes',
    description: 'Gagner avec 14 ou moins : ×4 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '12', pattern: 'vagues', colors: [P.encre, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.outcome === 'win' && ctx.playerTotal <= 14) return { xMult: 4 };
      },
    },
  },
  {
    id: 'echo',
    name: 'Écho',
    description: 'La dernière carte de ta main marque deux fois.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '))', pattern: 'vagues', colors: [P.petrole, P.ivoire] },
    hooks: {
      retriggers(ctx, card) {
        const last = ctx.playerCards[ctx.playerCards.length - 1];
        return last !== undefined && last.id === card.id ? 1 : 0;
      },
    },
  },
];
