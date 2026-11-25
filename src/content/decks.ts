import type { Card, StartingDeckDef } from '../engine/types';
import { P } from './palette';

type Proto = Omit<Card, 'id'>;

/** Sabots de départ. Le premier est le sabot par défaut. Chacun garde au moins 20 cartes. */
export const startingDecks: StartingDeckDef[] = [
  {
    id: 'sabot-classique',
    name: 'Sabot classique',
    description: 'Les 52 cartes, sans surprise.',
    art: { glyph: '52', pattern: 'uni', colors: [P.prune, P.ivoire] },
  },
  {
    id: 'sabot-rouge',
    name: 'Sabot rouge',
    description: 'Seulement des ♥ et des ♦, chacun en double.',
    art: { glyph: '♥♦', pattern: 'damier', colors: [P.bordeaux, P.cerise] },
    buildDeck: (std: Proto[]) => std.filter((c) => c.suit === 'hearts' || c.suit === 'diamonds').flatMap((c) => [c, { ...c }]),
  },
  {
    id: 'sabot-court',
    name: 'Sabot court',
    description: 'Sans les 2, 3 et 4 : 40 cartes, des totaux plus hauts.',
    art: { glyph: '40', pattern: 'chevrons', colors: [P.petrole, P.ivoire] },
    buildDeck: (std: Proto[]) => std.filter((c) => c.rank !== '2' && c.rank !== '3' && c.rank !== '4'),
  },
  {
    id: 'sabot-petits',
    name: 'Sabot des petits',
    description: 'Sans les V, D et R : 40 cartes, plus de Charlie.',
    art: { glyph: '2-9', pattern: 'points', colors: [P.petrole, P.petrolePale] },
    buildDeck: (std: Proto[]) => std.filter((c) => c.rank !== 'J' && c.rank !== 'Q' && c.rank !== 'K'),
  },
  {
    id: 'sabot-tricheur',
    name: 'Sabot du tricheur',
    description: 'Tes As sont Marqués, mais tu as une défausse de moins par table.',
    art: { glyph: 'A', pattern: 'chevrons', colors: [P.encre, P.ivoire] },
    buildDeck: (std: Proto[]) => std.map((c) => (c.rank === 'A' ? { ...c, enhancement: 'marquee' } : c)),
    mods: [{ key: 'discardsPerTable', add: -1, source: 'sabot-tricheur' }],
  },
  {
    id: 'sabot-flambeur',
    name: 'Sabot du flambeur',
    description: "Tu commences avec 10 $ de plus, mais tu ne touches jamais d'intérêts.",
    art: { glyph: '+10', pattern: 'soleil', colors: [P.prune, P.pruneClair] },
    moneyDelta: 10,
    mods: [{ key: 'interestCap', set: 0, source: 'sabot-flambeur' }],
  },
];
