import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';
import { fr, n, setN } from '../util';

/** Cigare : Mult de départ. */
const CIGARE_START = 12;

/** Martingale : 3 défaites au plus comptent (×8). */
const MARTINGALE_MAX = 3;

/** Ce qui grossit au fil de la partie (et une chose qui fond). */
export const croissanceAtouts: AtoutDef[] = [
  {
    id: 'boule-de-neige',
    name: 'Boule de neige',
    description: (self) =>
      `+1 Mult par victoire, −1 par défaite ; retombe à 0 si tu crèves. Actuellement +${n(self, 'mult')} Mult.`,
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'o', pattern: 'points', colors: [P.petrole, P.cerise] },
    initialState: () => ({ mult: 0 }),
    hooks: {
      onHandScored(ctx) {
        const m = n(ctx.self, 'mult');
        if (m > 0) return { mult: m };
      },
      onHandEnd(ctx, res) {
        if (res.outcome === 'win') {
          setN(ctx.self, 'mult', n(ctx.self, 'mult') + 1);
          ctx.api.trigger('+1 Mult');
        } else if (res.outcome === 'loss' && n(ctx.self, 'mult') > 0) {
          setN(ctx.self, 'mult', n(ctx.self, 'mult') - 1);
          ctx.api.trigger('-1 Mult');
        } else if (res.outcome === 'bust' && n(ctx.self, 'mult') > 0) {
          setN(ctx.self, 'mult', 0);
          ctx.api.trigger('Fondue !');
        }
      },
    },
  },
  {
    id: 'martingale',
    name: 'Martingale',
    description: (self) =>
      `Perdre ou crever double le Mult de ta prochaine victoire, jusqu'à ×8. Actuellement ×${
        2 ** Math.min(MARTINGALE_MAX, n(self, 'streak'))
      }.`,
    rarity: 'rare',
    cost: 8,
    art: { glyph: '2^n', pattern: 'chevrons', colors: [P.encre, P.cerise] },
    initialState: () => ({ streak: 0 }),
    hooks: {
      onHandScored(ctx) {
        const s = Math.min(MARTINGALE_MAX, n(ctx.self, 'streak'));
        if (ctx.outcome === 'win' && s > 0) return { xMult: 2 ** s };
      },
      onHandEnd(ctx, res) {
        if (res.outcome === 'loss' || res.outcome === 'bust') {
          const s = Math.min(MARTINGALE_MAX, n(ctx.self, 'streak') + 1);
          setN(ctx.self, 'streak', s);
          ctx.api.trigger(`×${2 ** s}`);
        } else if (res.outcome === 'win') {
          setN(ctx.self, 'streak', 0);
        }
      },
    },
  },
  {
    id: 'pyromane',
    name: 'Pyromane',
    description: (self) =>
      `+4 Jetons définitifs par carte que tu défausses. Actuellement +${n(self, 'chips')} Jetons.`,
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '*', pattern: 'soleil', colors: [P.bordeaux, P.petrolePale] },
    initialState: () => ({ chips: 0 }),
    hooks: {
      onDiscard(ctx) {
        setN(ctx.self, 'chips', n(ctx.self, 'chips') + 4);
        ctx.api.trigger('+4 Jetons');
      },
      onHandScored(ctx) {
        const c = n(ctx.self, 'chips');
        if (c > 0) return { chips: c };
      },
    },
  },
  {
    id: 'collectionneur',
    name: 'Collectionneur',
    description: (_self, state) =>
      `+2 Mult par atout que tu possèdes.${state ? ` Actuellement +${2 * state.atouts.length} Mult.` : ''}`,
    rarity: 'commun',
    cost: 5,
    art: { glyph: '[ ]', pattern: 'damier', colors: [P.prune, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const k = ctx.state.atouts.length;
        if (k > 0) return { mult: 2 * k };
      },
    },
  },
  {
    id: 'vieux-de-la-vieille',
    name: 'Vieux de la vieille',
    description: (self) =>
      `+3 Mult définitif par patron battu. Actuellement +${n(self, 'mult')} Mult.`,
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'XV', pattern: 'rayures', colors: [P.prune, P.cerise] },
    initialState: () => ({ mult: 0 }),
    hooks: {
      onTableEnd(ctx) {
        if (ctx.state.table?.kind !== 'patron') return;
        setN(ctx.self, 'mult', n(ctx.self, 'mult') + 3);
        ctx.api.trigger('+3 Mult');
      },
      onHandScored(ctx) {
        const m = n(ctx.self, 'mult');
        if (m > 0) return { mult: m };
      },
    },
  },
  {
    id: 'cicatrices',
    name: 'Cicatrices',
    description: (self) =>
      `+15 Jetons définitifs chaque fois que tu crèves. Actuellement +${n(self, 'chips')} Jetons.`,
    rarity: 'commun',
    cost: 4,
    art: { glyph: '#', pattern: 'chevrons', colors: [P.bordeaux, P.petrolePale] },
    initialState: () => ({ chips: 0 }),
    hooks: {
      onHandEnd(ctx, res) {
        if (res.outcome !== 'bust') return;
        setN(ctx.self, 'chips', n(ctx.self, 'chips') + 15);
        ctx.api.trigger('+15 Jetons');
      },
      onHandScored(ctx) {
        const c = n(ctx.self, 'chips');
        if (c > 0) return { chips: c };
      },
    },
  },
  {
    id: 'cigare',
    name: 'Cigare',
    description: (self) =>
      `+${fr(n(self, 'mult', CIGARE_START))} Mult, qui baisse de 2 après chaque main ; part en fumée à 0.`,
    rarity: 'commun',
    cost: 5,
    art: { glyph: '~', pattern: 'vagues', colors: [P.prune, P.cerise] },
    initialState: () => ({ mult: CIGARE_START }),
    hooks: {
      onHandScored(ctx) {
        const m = n(ctx.self, 'mult');
        if (m > 0) return { mult: m };
      },
      onHandEnd(ctx) {
        const self = ctx.self;
        if (!self) return;
        const m = n(self, 'mult') - 2;
        setN(self, 'mult', Math.max(0, m));
        if (m <= 0) {
          ctx.api.trigger('Parti en fumée');
          ctx.api.removeAtout(self.uid);
        } else {
          ctx.api.trigger('-2 Mult');
        }
      },
    },
  },
];
