import type { AtoutDef, CardColor } from '../../engine/types';
import { P } from '../palette';
import { SUITS, hasColor, hasSuit, n, setN } from '../util';

const COLOR_OF = (v: number): CardColor => (v === 1 ? 'black' : 'red');

/** Les enseignes : chaque couleur son effet ; Teinture et Arlequin pour les forcer. */
export const enseignesAtouts: AtoutDef[] = [
  {
    id: 'sang-chaud',
    name: 'Sang chaud',
    description: 'Chaque ♥ qui marque : +5 Mult.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '♥', pattern: 'soleil', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onCardScored(_ctx, card) {
        if (hasSuit(card, 'hearts')) return { mult: 5 };
      },
    },
  },
  {
    id: 'pique-assiette',
    name: 'Pique-assiette',
    description: 'Chaque ♠ qui marque : +30 Jetons.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '♠', pattern: 'damier', colors: [P.encre, P.petrolePale] },
    hooks: {
      onCardScored(_ctx, card) {
        if (hasSuit(card, 'spades')) return { chips: 30 };
      },
    },
  },
  {
    id: 'riviere-de-carreaux',
    name: 'Rivière de carreaux',
    description: 'Chaque ♦ qui marque : +2 $.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: '♦', pattern: 'vagues', colors: [P.prune, P.pruneClair] },
    hooks: {
      onCardScored(_ctx, card) {
        if (hasSuit(card, 'diamonds')) return { money: 2 };
      },
    },
  },
  {
    id: 'trefle-a-quatre-feuilles',
    name: 'Quatre-feuilles',
    description: 'Chaque ♣ qui marque : 1 chance sur 3 de ×2 Mult.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '♣', pattern: 'points', colors: [P.petrole, P.cerise] },
    hooks: {
      onCardScored(ctx, card) {
        if (hasSuit(card, 'clubs') && ctx.rng.chance(1 / 3)) return { xMult: 2, text: 'Veinard !' };
      },
    },
  },
  {
    id: 'rouge-ou-noir',
    name: 'Rouge ou noir',
    description: (self, state) =>
      `Une couleur tirée par main : ses cartes qui marquent, ×1,5 Mult.${
        state?.table?.hand ? ` Cette main : ${COLOR_OF(n(self, 'color')) === 'red' ? 'rouge' : 'noir'}.` : ''
      }`,
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'R/N', pattern: 'damier', colors: [P.bordeaux, P.cerise] },
    initialState: () => ({ color: 0 }),
    hooks: {
      onHandStart(ctx) {
        const v = ctx.rng.int(0, 1);
        setN(ctx.self, 'color', v);
        ctx.api.trigger(v === 1 ? 'Noir !' : 'Rouge !');
      },
      onCardScored(ctx, card) {
        if (hasColor(card, COLOR_OF(n(ctx.self, 'color')))) return { xMult: 1.5 };
      },
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Main toute rouge ou toute noire : ×2,5 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '♠♣', pattern: 'uni', colors: [P.encre, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const cards = ctx.playerCards;
        if (cards.length === 0) return;
        if (cards.every((c) => hasColor(c, 'red')) || cards.every((c) => hasColor(c, 'black'))) {
          return { xMult: 2.5 };
        }
      },
    },
  },
  {
    id: 'arc-en-ciel',
    name: 'Arc-en-ciel',
    description: 'Trois enseignes ou plus dans ta main : ×2 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '♥♣', pattern: 'soleil', colors: [P.prune, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const suits = SUITS.filter((s) => ctx.playerCards.some((c) => hasSuit(c, s))).length;
        if (suits >= 3) return { xMult: 2 };
      },
    },
  },
];
