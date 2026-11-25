import type { FigureId, SkipRewardDef } from '../engine/types';
import { atouts } from './atouts';
import { tacticalCombines } from './consumables/combines';
import { faveurs } from './consumables/faveurs';
import { P } from './palette';

/**
 * Pots-de-vin : ce que tu touches en sautant une petite ou une grande table (ni gain, ni boutique).
 * grant() s'exécute une fois la table SUIVANTE présentée : un mod 'table' la vise.
 */
export const skipRewards: SkipRewardDef[] = [
  {
    id: 'enveloppe',
    name: 'Enveloppe',
    description: 'Tu touches 8 $.',
    art: { glyph: '8$', pattern: 'rayures', colors: [P.encre, P.pruneClair] },
    grant: (ctx) => ctx.api.addMoney(8, 'Enveloppe'),
  },
  {
    id: 'service-rendu',
    name: 'Service rendu',
    description: 'Une faveur au hasard (s’il te reste une place).',
    art: { glyph: 'F?', pattern: 'points', colors: [P.prune, P.pruneClair] },
    grant: (ctx) => {
      const pool = faveurs.filter((f) => !f.canAppear || f.canAppear(ctx.state));
      ctx.api.addConsumable(ctx.rng.pick(pool).id);
    },
  },
  {
    id: 'tour-appris',
    name: 'Tour appris',
    description: 'Une combine de table au hasard (s’il te reste une place).',
    art: { glyph: 'C?', pattern: 'chevrons', colors: [P.petrole, P.cerise] },
    grant: (ctx) => ctx.api.addConsumable(ctx.rng.pick(tacticalCombines).id),
  },
  {
    id: 'ami-du-croupier',
    name: 'Ami du croupier',
    description: 'La table suivante a un objectif 25 % plus bas.',
    art: { glyph: '-25', pattern: 'vagues', colors: [P.petrole, P.ivoire] },
    grant: (ctx) => ctx.api.addRuleMod('table', { key: 'targetFactor', add: -0.25, source: 'ami-du-croupier' }),
  },
  {
    id: 'rab',
    name: 'Rab',
    description: '+1 main à la table suivante.',
    art: { glyph: '+M', pattern: 'soleil', colors: [P.prune, P.ivoire] },
    grant: (ctx) => ctx.api.addRuleMod('table', { key: 'handsPerTable', add: 1, source: 'rab' }),
  },
  {
    id: 'manche-propre',
    name: 'Manche propre',
    description: '+2 défausses à la table suivante.',
    art: { glyph: '+D', pattern: 'losanges', colors: [P.encre, P.ivoire] },
    grant: (ctx) => ctx.api.addRuleMod('table', { key: 'discardsPerTable', add: 2, source: 'manche-propre' }),
  },
  {
    id: 'coude-leve',
    name: 'Coude levé',
    description: 'Ta limite augmente de 1 à la table suivante.',
    art: { glyph: '^1', pattern: 'rayures', colors: [P.petrole, P.cerise] },
    grant: (ctx) => ctx.api.addRuleMod('table', { key: 'playerLimit', add: 1, source: 'coude-leve' }),
  },
  {
    id: 'cours-particulier',
    name: 'Cours particulier',
    description: 'Ta figure la plus marquée monte d’un niveau.',
    art: { glyph: 'LV', pattern: 'damier', colors: [P.prune, P.ivoire] },
    grant: (ctx) => {
      const counts = ctx.state.stats.figureCounts ?? {};
      let best: FigureId = 'haute';
      for (const [fig, n] of Object.entries(counts) as [FigureId, number][]) if (n > (counts[best] ?? 0)) best = fig;
      ctx.api.levelUpFigure(best, 1);
    },
  },
  {
    id: 'dorure-offerte',
    name: 'Dorure offerte',
    description: 'Deux cartes de ton sabot au hasard deviennent Dorées.',
    art: { glyph: 'Au', pattern: 'points', colors: [P.encre, P.pruneClair] },
    grant: (ctx) => {
      const plain = ctx.state.deck.filter((c) => !c.enhancement);
      for (const c of ctx.rng.shuffle([...plain]).slice(0, 2)) ctx.api.enhanceCard(c.id, 'doree');
    },
  },
  {
    id: 'recrue',
    name: 'Recrue',
    description: 'Un atout commun au hasard (s’il te reste un emplacement).',
    minSalon: 2,
    art: { glyph: 'A?', pattern: 'soleil', colors: [P.bordeaux, P.ivoire] },
    grant: (ctx) => {
      const owned = new Set(ctx.state.atouts.map((a) => a.defId));
      const pool = atouts.filter((a) => a.rarity === 'commun' && !owned.has(a.id));
      if (pool.length) ctx.api.addAtout(ctx.rng.pick(pool).id);
    },
  },
];
