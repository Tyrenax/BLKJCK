import type { ConsumableDef, Phase } from '../../engine/types';
import { P } from '../palette';
import { handTotal } from '../util';

const DURING_HAND: Phase[] = ['playerTurn'];
const DURING_HAND_OR_BUST: Phase[] = ['playerTurn', 'bustChoice'];

/** Combines tactiques : jouées pendant une main, usage unique. */
export const tacticalCombines: ConsumableDef[] = [
  {
    id: 'coup-d-oeil',
    kind: 'combine',
    name: "Coup d'œil",
    description: 'Retourne la carte cachée du croupier.',
    cost: 3,
    art: { glyph: 'o_', pattern: 'points', colors: [P.encre, P.ivoire] },
    usableIn: DURING_HAND,
    canUse(state, rules) {
      const hand = state.table?.hand;
      return !!hand && !hand.holeRevealed && !rules.seeDealerHole;
    },
    use(ctx) {
      ctx.api.revealHole();
    },
  },
  {
    id: 'echange',
    kind: 'combine',
    name: 'Échange',
    description: 'Échange une de tes cartes contre la carte visible du croupier.',
    cost: 4,
    art: { glyph: '<->', pattern: 'chevrons', colors: [P.petrole, P.cerise] },
    usableIn: DURING_HAND_OR_BUST,
    targeting: { zone: 'playerHand', min: 1, max: 1 },
    canUse(state) {
      return (state.table?.hand?.dealerCards.length ?? 0) > 0;
    },
    use(ctx, targets) {
      const visible = ctx.state.table?.hand?.dealerCards[0];
      const mine = targets[0];
      if (visible && mine !== undefined) ctx.api.swapWithDealer(mine, visible.id);
    },
  },
  {
    id: 'carte-brulee',
    kind: 'combine',
    name: 'Carte brûlée',
    description: 'Envoie la prochaine carte de ton sabot à la défausse, sous tes yeux.',
    cost: 3,
    art: { glyph: 'X_', pattern: 'soleil', colors: [P.bordeaux, P.ivoire] },
    usableIn: ['playerTurn', 'handResult'],
    canUse(state) {
      return (state.table?.drawPile.length ?? 0) > 0;
    },
    use(ctx) {
      ctx.api.burnTop('player');
    },
  },
  {
    id: 'filet',
    kind: 'combine',
    name: 'Filet',
    description: 'Tire une carte ; si elle te ferait crever, elle part à la défausse à la place.',
    cost: 4,
    art: { glyph: '#+', pattern: 'damier', colors: [P.petrole, P.ivoire] },
    usableIn: DURING_HAND,
    canUse(state) {
      return !!state.table?.hand && state.table.drawPile.length > 0;
    },
    use(ctx) {
      const hand = ctx.state.table?.hand;
      if (!hand) return;
      const [next] = ctx.api.peek('player', 1);
      if (!next) return;
      const after = handTotal([...hand.playerCards, next], ctx.rules.playerLimit);
      if (after.bust) ctx.api.burnTop('player');
      else ctx.api.drawToPlayer();
    },
  },
  {
    id: 'savonnette',
    kind: 'combine',
    name: 'Savonnette',
    description: "Pour cette main, le croupier tire une carte de plus après s'être arrêté.",
    cost: 4,
    art: { glyph: '+1', pattern: 'vagues', colors: [P.petrole, P.cerise] },
    usableIn: DURING_HAND,
    use(ctx) {
      ctx.api.addRuleMod('hand', { key: 'dealerExtraDraws', add: 1, source: 'savonnette' });
    },
  },
  {
    id: 'rallonge',
    kind: 'combine',
    name: 'Rallonge',
    description: 'Ta limite augmente de 2 pour cette main.',
    cost: 4,
    art: { glyph: '+2', pattern: 'rayures', colors: [P.petrole, P.ivoire] },
    usableIn: DURING_HAND_OR_BUST,
    use(ctx) {
      ctx.api.addRuleMod('hand', { key: 'playerLimit', add: 2, source: 'rallonge' });
    },
  },
  {
    id: 'tour-de-manche',
    kind: 'combine',
    name: 'Tour de manche',
    description: 'Change une carte de ta main en As, définitivement.',
    cost: 5,
    art: { glyph: 'A!', pattern: 'losanges', colors: [P.prune, P.ivoire] },
    usableIn: DURING_HAND_OR_BUST,
    targeting: { zone: 'playerHand', min: 1, max: 1 },
    use(ctx, targets) {
      const id = targets[0];
      if (id !== undefined) ctx.api.changeRank(id, 'A');
    },
  },
  {
    id: 'voyance',
    kind: 'combine',
    name: 'Voyance',
    description: 'Montre les 3 prochaines cartes de ton sabot.',
    cost: 3,
    art: { glyph: '???', pattern: 'soleil', colors: [P.prune, P.petroleClair] },
    usableIn: ['playerTurn', 'handResult'],
    canUse(state) {
      return (state.table?.drawPile.length ?? 0) > 0;
    },
    use(ctx) {
      ctx.api.peek('player', 3);
    },
  },
  {
    id: 'lorgnette',
    kind: 'combine',
    name: 'Lorgnette',
    description: 'Montre les 2 prochaines cartes du sabot du croupier.',
    cost: 3,
    art: { glyph: 'oo', pattern: 'uni', colors: [P.petrole, P.petroleClair] },
    usableIn: DURING_HAND,
    canUse(state) {
      return (state.table?.dealerDrawPile.length ?? 0) > 0;
    },
    use(ctx) {
      ctx.api.peek('dealer', 2);
    },
  },
  {
    id: 'escamotage',
    kind: 'combine',
    name: 'Escamotage',
    description: 'Retire une carte de ta main sans utiliser de défausse.',
    cost: 4,
    art: { glyph: '-1', pattern: 'points', colors: [P.encre, P.cendre] },
    usableIn: DURING_HAND_OR_BUST,
    targeting: { zone: 'playerHand', min: 1, max: 1 },
    use(ctx, targets) {
      const id = targets[0];
      if (id !== undefined) ctx.api.discardFromHand(id);
    },
  },
];
