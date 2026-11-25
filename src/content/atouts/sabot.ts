import type { AtoutDef, RunState } from '../../engine/types';
import { P } from '../palette';

/** Taille de départ du sabot. */
const FULL_DECK = 52;

function removed(state: Readonly<RunState>): number {
  return Math.max(0, FULL_DECK - state.deck.length);
}

/** Le sabot affiné : retirer des cartes (Déchiqueteuse, Autodafé) et améliorer celles qui restent. */
export const sabotAtouts: AtoutDef[] = [
  {
    id: 'sabot-leger',
    name: 'Sabot léger',
    description: (_self, state) =>
      `+2 Mult par carte retirée de ton sabot (sous 52).${
        state ? ` Actuellement +${2 * removed(state)} Mult.` : ''
      }`,
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '-52', pattern: 'rayures', colors: [P.encre, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const k = removed(ctx.state);
        if (k > 0) return { mult: 2 * k };
      },
    },
  },
  {
    id: 'poids-plume',
    name: 'Poids plume',
    description: (_self, state) =>
      `Ton sabot compte 44 cartes ou moins : ×2,5 Mult.${
        state ? ` Il en compte ${state.deck.length}.` : ''
      }`,
    rarity: 'rare',
    cost: 7,
    art: { glyph: '44', pattern: 'vagues', colors: [P.prune, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.state.deck.length <= 44) return { xMult: 2.5 };
      },
    },
  },
  {
    id: 'carte-maitresse',
    name: 'Carte maîtresse',
    description: 'Chaque carte améliorée qui marque : +3 Mult.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '+', pattern: 'losanges', colors: [P.petrole, P.cerise] },
    hooks: {
      onCardScored(_ctx, card) {
        if (card.enhancement) return { mult: 3 };
      },
    },
  },
];
