import type { ConsumableDef, EmblemArt, FigureId, RunState } from '../../engine/types';
import { figures } from '../figures';
import { P } from '../palette';

/** Une faveur par figure : des services qu'on se rend dans l'arrière-salle. */
const FAVEURS: Record<FigureId, { id: string; name: string; art: EmblemArt }> = {
  blackjack: {
    id: 'clin-d-oeil-du-patron',
    name: "Clin d'œil du patron",
    art: { glyph: 'BJ', pattern: 'rayures', colors: [P.pruneSombre, P.pruneClair] },
  },
  triple7: {
    id: 'patte-de-lapin',
    name: 'Patte de lapin',
    art: { glyph: '777', pattern: 'soleil', colors: [P.pruneSombre, P.pruneClair] },
  },
  charlie: {
    id: 'petite-monnaie',
    name: 'Petite monnaie',
    art: { glyph: 'C', pattern: 'points', colors: [P.pruneSombre, P.pruneClair] },
  },
  pile: {
    id: 'compte-rond',
    name: 'Compte rond',
    art: { glyph: '21', pattern: 'uni', colors: [P.pruneSombre, P.pruneClair] },
  },
  couleur: {
    id: 'tenue-de-soiree',
    name: 'Tenue de soirée',
    art: { glyph: '♦♦♦', pattern: 'losanges', colors: [P.pruneSombre, P.pruneClair] },
  },
  paire: {
    id: 'table-pour-deux',
    name: 'Table pour deux',
    art: { glyph: '2', pattern: 'damier', colors: [P.pruneSombre, P.pruneClair] },
  },
  haute: {
    id: 'table-reservee',
    name: 'Table réservée',
    art: { glyph: '20', pattern: 'chevrons', colors: [P.pruneSombre, P.pruneClair] },
  },
  petite: {
    id: 'fond-de-poche',
    name: 'Fond de poche',
    art: { glyph: '12-', pattern: 'vagues', colors: [P.pruneSombre, P.pruneClair] },
  },
};

export const faveurs: ConsumableDef[] = (Object.keys(FAVEURS) as FigureId[]).map((fig) => {
  const f = FAVEURS[fig];
  const def = figures[fig];
  return {
    id: f.id,
    kind: 'faveur',
    name: f.name,
    description: `Monte la figure ${def.name} d'un niveau : +${def.chipsPerLevel} Jetons et +${def.multPerLevel} Mult.`,
    cost: 3,
    art: f.art,
    usableIn: ['shop', 'tableIntro', 'playerTurn', 'handResult'],
    // Triple Sept est une figure secrète : sa faveur n'apparaît qu'une fois la figure marquée.
    ...(fig === 'triple7' ? { canAppear: (s: Readonly<RunState>) => (s.stats.figureCounts?.triple7 ?? 0) > 0 } : {}),
    use(ctx) {
      ctx.api.levelUpFigure(fig, 1);
    },
  };
});

/** id de faveur -> figure montée (pour le simulateur et l'UI). */
export const FAVEUR_FIGURE: Record<string, FigureId> = Object.fromEntries(
  (Object.keys(FAVEURS) as FigureId[]).map((fig) => [FAVEURS[fig].id, fig]),
);
