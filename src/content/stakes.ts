/**
 * Mises : la difficulté choisie au lancement, du tripot entre amis à la dette envers la maison.
 * CUMULATIVES (moteur) : jouer une mise applique aussi toutes celles d'avant. Chaque mise n'ajoute
 * donc qu'un cran, et son texte ne décrit que ce cran.
 * Écrit par bjck-5a à la demande de bjck-41 ; calibrage par bjck-6a (cible : −3 à −5 points de taux
 * de victoire du robot malin par mise).
 */
import type { StakeDef } from '../engine/types';
import { bosses } from './bosses';
import { P } from './palette';

const MAISON_ID = 'la-maison';
const maison = bosses.find((b) => b.id === MAISON_ID);

export const stakes: StakeDef[] = [
  {
    id: 'entre-amis',
    name: 'Entre amis',
    description: 'La partie normale.',
    art: { glyph: 'I', pattern: 'uni', colors: [P.petrole, P.petroleClair] },
  },
  {
    id: 'petite-cave',
    name: 'Petite cave',
    description: 'Les objectifs montent de 15 %.',
    art: { glyph: 'II', pattern: 'points', colors: [P.petrole, P.petrolePale] },
    targetFactor: 1.15,
  },
  {
    id: 'table-serieuse',
    name: 'Table sérieuse',
    description: 'Une défausse de moins par table.',
    art: { glyph: 'III', pattern: 'rayures', colors: [P.prune, P.pruneClair] },
    mods: [{ key: 'discardsPerTable', add: -1, source: 'table-serieuse' }],
  },
  {
    id: 'gros-jeu',
    name: 'Gros jeu',
    description: 'Tout coûte 1 $ de plus en boutique.',
    art: { glyph: 'IV', pattern: 'damier', colors: [P.prune, P.cendre] },
    mods: [{ key: 'shopPriceAdd', add: 1, source: 'gros-jeu' }],
  },
  {
    id: 'sans-credit',
    name: 'Sans crédit',
    description: 'Tes intérêts sont plafonnés à 2 $.',
    art: { glyph: 'V', pattern: 'losanges', colors: [P.encre, P.encrePale] },
    mods: [{ key: 'interestCap', set: 2, source: 'sans-credit' }],
  },
  {
    id: 'cave-du-patron',
    name: 'La cave du patron',
    description: 'Une main de moins à la table du patron.',
    art: { glyph: 'VI', pattern: 'chevrons', colors: [P.bordeauxSombre, P.bordeauxClair] },
    hooks: {
      modifyRules(r, _self, state) {
        if (state.table?.kind === 'patron') r.handsPerTable = Math.max(1, r.handsPerTable - 1);
      },
    },
  },
  {
    id: 'dernier-avertissement',
    name: 'Dernier avertissement',
    description: 'Les objectifs montent encore de 15 %.',
    art: { glyph: 'VII', pattern: 'vagues', colors: [P.bordeaux, P.cerise] },
    targetFactor: 1.15,
  },
  {
    id: 'la-dette',
    name: 'La dette',
    description:
      "−1 emplacement d'atout. Patrons un salon plus tôt. En sans fin, La Maison à chaque table.",
    art: { glyph: 'VIII', pattern: 'soleil', colors: [P.nuit, P.cerise] },
    mods: [
      { key: 'atoutSlots', add: -1, source: 'la-dette' },
      { key: 'bossSalonAdvance', add: 1, source: 'la-dette' },
    ],
    hooks: {
      // En sans fin, les règles de La Maison restent en vigueur partout (sauf quand c'est elle le
      // patron de la table : ses propres crochets s'appliquent déjà).
      modifyRules(r, _self, state) {
        if (state.endless && state.table?.bossId !== MAISON_ID) maison?.hooks.modifyRules?.(r, null, state);
      },
      onHandEnd(ctx, res) {
        if (ctx.state.endless && ctx.state.table?.bossId !== MAISON_ID) maison?.hooks.onHandEnd?.(ctx, res);
      },
    },
  },
];
