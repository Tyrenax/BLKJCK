import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';

/** L'argent : en gagner, en garder, et le transformer en Mult. */
export const argentAtouts: AtoutDef[] = [
  {
    id: 'pourboire',
    name: 'Pourboire',
    description: '+2 $ par main gagnée.',
    rarity: 'commun',
    cost: 3,
    art: { glyph: '+1$', pattern: 'points', colors: [P.petrole, P.pruneClair] },
    hooks: {
      onHandEnd(ctx, res) {
        if (res.outcome === 'win') ctx.api.addMoney(2, 'Pourboire');
      },
    },
  },
  {
    id: 'flambeur',
    name: 'Flambeur',
    description: (_self, state) =>
      `+1 Mult par tranche de 3 $ que tu possèdes.${
        state ? ` Actuellement +${Math.floor(Math.max(0, state.money) / 3)} Mult.` : ''
      }`,
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '$/3', pattern: 'soleil', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const m = Math.floor(Math.max(0, ctx.state.money) / 3);
        if (m > 0) return { mult: m };
      },
    },
  },
  {
    id: 'preteur-sur-gages',
    name: 'Prêteur sur gages',
    description: "Ton plafond d'intérêts augmente de 10 $.",
    rarity: 'peu-commun',
    cost: 4,
    art: { glyph: '%', pattern: 'losanges', colors: [P.encre, P.pruneClair] },
    hooks: {
      modifyRules(r) {
        r.interestCap += 10;
      },
    },
  },
  {
    id: 'tirelire',
    name: 'Tirelire',
    description: '+6 $ à chaque table battue.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: '3$', pattern: 'uni', colors: [P.prune, P.pruneClair] },
    hooks: {
      onTableEnd(ctx) {
        ctx.api.addMoney(6, 'Tirelire');
      },
    },
  },
  {
    id: 'racket',
    name: 'Racket',
    description: 'Table battue : +2 $ de plus par main non jouée.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: '$$', pattern: 'rayures', colors: [P.bordeaux, P.pruneClair] },
    hooks: {
      onTableEnd(ctx) {
        const left = ctx.state.table?.handsLeft ?? 0;
        if (left > 0) ctx.api.addMoney(2 * left, 'Racket');
      },
    },
  },
  {
    id: 'carte-de-fidelite',
    name: 'Carte de fidélité',
    description: 'Les deux premières relances de chaque boutique sont gratuites.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: '0$', pattern: 'damier', colors: [P.petrole, P.pruneClair] },
    hooks: {
      modifyRules(r) {
        r.freeRerollsPerShop += 2;
      },
    },
  },
];
