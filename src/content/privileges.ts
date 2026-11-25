import type { PrivilegeDef } from '../engine/types';
import { FIGURE_IDS } from './figures';
import { P } from './palette';

/** Privilèges : définitifs, un par salon en boutique. */
export const privileges: PrivilegeDef[] = [
  {
    id: 'main-supplementaire',
    name: 'Main de plus',
    description: '+1 main par table.',
    cost: 10,
    art: { glyph: '+1', pattern: 'soleil', colors: [P.nuit, P.ivoire] },
    mods: [{ key: 'handsPerTable', add: 1, source: 'main-supplementaire' }],
  },
  {
    id: 'defausse-supplementaire',
    name: 'Défausse de plus',
    description: '+1 défausse par table.',
    cost: 7,
    art: { glyph: 'D+', pattern: 'chevrons', colors: [P.nuit, P.ivoire] },
    mods: [{ key: 'discardsPerTable', add: 1, source: 'defausse-supplementaire' }],
  },
  {
    id: 'manche-longue',
    name: 'Manche longue',
    description: "+1 emplacement d'atout.",
    cost: 10,
    art: { glyph: '6', pattern: 'rayures', colors: [P.nuit, P.ivoire] },
    mods: [{ key: 'atoutSlots', add: 1, source: 'manche-longue' }],
  },
  {
    id: 'double-fond',
    name: 'Double fond',
    description: '+1 emplacement pour tes combines et faveurs.',
    cost: 6,
    art: { glyph: '3', pattern: 'damier', colors: [P.nuit, P.ivoire] },
    mods: [{ key: 'consumableSlots', add: 1, source: 'double-fond' }],
  },
  {
    id: 'vitrine',
    name: 'Vitrine',
    description: '+1 offre en boutique.',
    cost: 7,
    art: { glyph: '4', pattern: 'losanges', colors: [P.nuit, P.ivoire] },
    mods: [{ key: 'shopOffers', add: 1, source: 'vitrine' }],
  },
  {
    id: 'coffre-fort',
    name: 'Coffre-fort',
    description: "Ton plafond d'intérêts augmente de 5 $.",
    cost: 7,
    art: { glyph: '%', pattern: 'uni', colors: [P.nuit, P.pruneClair] },
    mods: [{ key: 'interestCap', add: 5, source: 'coffre-fort' }],
  },
  {
    id: 'arrangement',
    name: 'Arrangement',
    description: 'Sur une égalité, tu gardes tout ton Mult.',
    cost: 6,
    art: { glyph: '=', pattern: 'vagues', colors: [P.nuit, P.ivoire] },
    mods: [{ key: 'pushMultKeep', set: 1, source: 'arrangement' }],
  },
  {
    id: 'ami-de-la-maison',
    name: 'Ami de la maison',
    description: 'Tes relances coûtent 2 $ de moins.',
    cost: 6,
    art: { glyph: '-2$', pattern: 'points', colors: [P.nuit, P.pruneClair] },
    mods: [{ key: 'rerollDiscount', add: 2, source: 'ami-de-la-maison' }],
  },
  {
    id: 'broyeur',
    name: 'Broyeur',
    description: 'La Déchiqueteuse sert deux fois par boutique.',
    cost: 6,
    art: { glyph: 'x2', pattern: 'chevrons', colors: [P.nuit, P.cendre] },
    mods: [{ key: 'shredsPerShop', add: 1, source: 'broyeur' }],
  },
  {
    id: 'carnet-d-adresses',
    name: "Carnet d'adresses",
    description: "Toutes tes figures montent d'un niveau.",
    cost: 8,
    art: { glyph: 'ABC', pattern: 'rayures', colors: [P.nuit, P.pruneClair] },
    onBuy(ctx) {
      for (const fig of FIGURE_IDS) ctx.api.levelUpFigure(fig, 1);
    },
  },
  {
    id: 'passe-droit',
    name: 'Passe-droit',
    description: 'Ta limite augmente de 1, pour toute la partie (23 au plus).',
    cost: 15,
    minSalon: 5,
    art: { glyph: '22', pattern: 'soleil', colors: [P.nuit, P.cerise] },
    mods: [{ key: 'playerLimit', add: 1, source: 'passe-droit' }],
  },
];
