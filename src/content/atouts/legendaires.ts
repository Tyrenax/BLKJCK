import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';
import { fr, n, setN } from '../util';

const PARRAIN_START = 1.5;
const PARRAIN_STEP = 0.5;
const PARRAIN_MAX = 4;

/** Légendaires : rares en boutique, chacun peut porter une partie. */
export const legendairesAtouts: AtoutDef[] = [
  {
    id: 'le-parrain',
    name: 'Le Parrain',
    description: (self) =>
      `×1,5 Mult, et ×0,5 de plus par patron battu avec lui, jusqu'à ×4. Actuellement ×${fr(
        n(self, 'x', PARRAIN_START),
      )}.`,
    rarity: 'legendaire',
    cost: 10,
    art: { glyph: 'P', pattern: 'soleil', colors: [P.nuit, P.cerise] },
    initialState: () => ({ x: PARRAIN_START }),
    hooks: {
      onHandScored(ctx) {
        return { xMult: n(ctx.self, 'x', PARRAIN_START) };
      },
      onTableEnd(ctx) {
        const x = n(ctx.self, 'x', PARRAIN_START);
        if (ctx.state.table?.kind !== 'patron' || x >= PARRAIN_MAX) return;
        setN(ctx.self, 'x', Math.min(PARRAIN_MAX, x + PARRAIN_STEP));
        ctx.api.trigger('×0,5 de plus');
      },
    },
  },
  {
    id: 'l-ambidextre',
    name: "L'Ambidextre",
    description: 'Toutes tes cartes marquent deux fois.',
    rarity: 'legendaire',
    cost: 10,
    art: { glyph: '<>', pattern: 'losanges', colors: [P.nuit, P.ivoire] },
    hooks: {
      retriggers() {
        return 1;
      },
    },
  },
];
