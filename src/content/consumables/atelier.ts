import type { ConsumableDef, EmblemArt, EnhancementId, Phase, Suit } from '../../engine/types';
import { balance } from '../balance';
import { enhancements } from '../enhancements';
import { P } from '../palette';
import { SUIT_GLYPH } from '../util';

/** Taille minimale du sabot (balance.minDeckSize, 10 par défaut côté moteur). */
const deckFloor = () => balance.minDeckSize ?? 10;

/** L'atelier se joue hors de la main : en boutique, avant une table ou entre deux mains. */
const WORKSHOP: Phase[] = ['shop', 'tableIntro', 'handResult'];

const SUIT_NAME: Record<Suit, string> = { hearts: 'cœur', diamonds: 'carreau', spades: 'pique', clubs: 'trèfle' };
const SUIT_ART: Record<Suit, [string, string]> = {
  hearts: [P.ivoire, P.cerise],
  diamonds: [P.prune, P.cerise],
  spades: [P.ivoire, P.encre],
  clubs: [P.cendre, P.encre],
};

function teinture(suit: Suit): ConsumableDef {
  return {
    id: `teinture-${SUIT_NAME[suit].replace('œ', 'oe').replace('è', 'e')}`,
    kind: 'combine',
    name: `Teinture de ${SUIT_NAME[suit]}`,
    description: `Jusqu'à 3 cartes de ton sabot deviennent des ${SUIT_GLYPH[suit]}.`,
    cost: 3,
    art: { glyph: SUIT_GLYPH[suit], pattern: 'vagues', colors: SUIT_ART[suit] },
    usableIn: WORKSHOP,
    targeting: { zone: 'deck', min: 1, max: 3 },
    use(ctx, targets) {
      for (const id of targets.slice(0, 3)) ctx.api.changeSuit(id, suit);
    },
  };
}

function enchant(
  id: string,
  name: string,
  enh: EnhancementId,
  max: number,
  cost: number,
  art: EmblemArt,
): ConsumableDef {
  const e = enhancements[enh];
  const effect = `${e.description.charAt(0).toLowerCase()}${e.description.slice(1).replace(/\.$/, '')}`;
  const description =
    max === 1
      ? `Une carte devient ${e.name} : ${effect}.`
      : `Jusqu'à ${max} cartes deviennent ${e.name}s (chacune : ${effect}).`;
  return {
    id,
    kind: 'combine',
    name,
    description,
    cost,
    art,
    usableIn: WORKSHOP,
    targeting: { zone: 'deck', min: 1, max },
    use(ctx, targets) {
      for (const t of targets.slice(0, max)) ctx.api.enhanceCard(t, enh);
    },
  };
}

/** Combines d'atelier : modifient durablement les cartes de ton sabot. */
export const workshopCombines: ConsumableDef[] = [
  teinture('hearts'),
  teinture('diamonds'),
  teinture('spades'),
  teinture('clubs'),
  enchant('plomb', 'Plomb', 'plombee', 2, 3, { glyph: 'Pb', pattern: 'uni', colors: [P.encre, P.petrolePale] }),
  enchant('braise', 'Braise', 'ardente', 2, 3, { glyph: '^^', pattern: 'soleil', colors: [P.nuit, P.cerise] }),
  enchant('cristal', 'Cristal', 'cristal', 1, 4, { glyph: '<>', pattern: 'losanges', colors: [P.petrole, P.cerise] }),
  enchant('dorure', 'Dorure', 'doree', 2, 3, { glyph: 'Au', pattern: 'rayures', colors: [P.nuit, P.pruneClair] }),
  enchant('marque', 'Marque', 'marquee', 2, 3, { glyph: '/-', pattern: 'chevrons', colors: [P.encre, P.ivoire] }),
  enchant('voile', 'Voile', 'fantome', 1, 4, { glyph: '0', pattern: 'vagues', colors: [P.nuit, P.cendre] }),
  enchant('ressort', 'Ressort', 'elastique', 2, 3, { glyph: '-3', pattern: 'vagues', colors: [P.prune, P.ivoire] }),
  enchant('losange', 'Losange', 'arlequin', 1, 4, { glyph: '♦♠', pattern: 'losanges', colors: [P.nuit, P.cerise] }),
  {
    id: 'faussaire',
    kind: 'combine',
    name: 'Faussaire',
    description: 'Copie une carte de ton sabot, amélioration comprise.',
    cost: 4,
    art: { glyph: '2x', pattern: 'damier', colors: [P.prune, P.ivoire] },
    usableIn: WORKSHOP,
    targeting: { zone: 'deck', min: 1, max: 1 },
    use(ctx, targets) {
      const id = targets[0];
      if (id !== undefined) ctx.api.duplicateCard(id);
    },
  },
  {
    id: 'autodafe',
    kind: 'combine',
    name: 'Autodafé',
    description: "Détruit jusqu'à 2 cartes de ton sabot.",
    cost: 4,
    art: { glyph: '!!', pattern: 'soleil', colors: [P.bordeaux, P.cendre] },
    usableIn: WORKSHOP,
    targeting: { zone: 'deck', min: 1, max: 2 },
    // Comme la Déchiqueteuse : le sabot ne descend jamais sous le plancher.
    canUse: (s) => s.deck.length > deckFloor(),
    use(ctx, targets) {
      const room = Math.max(0, ctx.state.deck.length - deckFloor());
      for (const id of targets.slice(0, Math.min(2, room))) ctx.api.destroyCard(id, 'Autodafé');
    },
  },
];
