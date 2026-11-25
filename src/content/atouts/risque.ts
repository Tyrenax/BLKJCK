import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';
import { n, setN } from '../util';

/** La prise de risque : tirer plus, doubler, jouer sans filet — et quelques assurances. */
export const risqueAtouts: AtoutDef[] = [
  {
    id: 'tete-brulee',
    name: 'Tête brûlée',
    description: '+3 Mult par carte tirée pendant la main.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '>>', pattern: 'soleil', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.hits > 0) return { mult: 3 * ctx.hits };
      },
    },
  },
  {
    id: 'sang-froid',
    name: 'Sang-froid',
    description: 'Rester avec deux cartes : +40 Jetons.',
    rarity: 'commun',
    cost: 4,
    art: { glyph: '2', pattern: 'uni', colors: [P.petrole, P.petrolePale] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.playerCards.length === 2 && !ctx.doubled) return { chips: 40 };
      },
    },
  },
  {
    id: 'quitte-ou-double',
    name: 'Quitte ou double',
    description: 'Doubler donne ×3 Mult au lieu de ×2.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'Q/D', pattern: 'chevrons', colors: [P.prune, P.cerise] },
    hooks: {
      modifyRules(r) {
        r.doubleXMult += 1;
      },
    },
  },
  {
    id: 'parachute',
    name: 'Parachute',
    description: (self) =>
      `Une fois par table, si tu crèves, ta dernière carte est défaussée à ta place. ${
        n(self, 'used') > 0 ? 'Déjà ouvert.' : 'Prêt.'
      }`,
    rarity: 'peu-commun',
    cost: 7,
    art: { glyph: 'U', pattern: 'rayures', colors: [P.petrole, P.cerise] },
    initialState: () => ({ used: 0 }),
    hooks: {
      onTableStart(ctx) {
        setN(ctx.self, 'used', 0);
      },
      onBust(ctx) {
        if (n(ctx.self, 'used') > 0) return;
        const cards = ctx.state.table?.hand?.playerCards ?? [];
        const last = cards[cards.length - 1];
        if (!last) return;
        setN(ctx.self, 'used', 1);
        return { discardCardId: last.id, text: 'Parachute !' };
      },
    },
  },
  {
    id: 'harnais',
    name: 'Harnais',
    description: 'Tu peux défausser après avoir crevé.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'H', pattern: 'points', colors: [P.petrole, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.discardAfterBust = true;
      },
    },
  },
  {
    id: 'lot-de-consolation',
    name: 'Lot de consolation',
    description: 'Sur une défaite, tu gardes la moitié de ton Mult.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '½', pattern: 'points', colors: [P.prune, P.cerise] },
    hooks: {
      modifyRules(r) {
        r.lossMultKeep = Math.max(r.lossMultKeep, 0.5);
      },
    },
  },
  {
    id: 'compteur-de-cartes',
    name: 'Compteur de cartes',
    description: 'Tu vois la prochaine carte de ton sabot.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '?', pattern: 'damier', colors: [P.encre, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.seeNextCard = true;
      },
    },
  },
  {
    id: 'tapis',
    name: 'Tapis',
    description: 'Victoire : ×3 Mult. Défaite : la main marque 0.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '?!', pattern: 'losanges', colors: [P.bordeaux, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.outcome === 'win') return { xMult: 3 };
        // nullify : la main marque 0 même si un atout à droite rajoute des Jetons.
        if (ctx.outcome === 'loss') return { chips: -ctx.chips, nullify: true, text: 'Tapis perdu' };
      },
    },
  },
  {
    id: 'roulette-russe',
    name: 'Roulette russe',
    description: 'Victoire : 5 chances sur 6 de ×2 Mult, 1 sur 6 de marquer 0.',
    rarity: 'peu-commun',
    cost: 5,
    art: { glyph: '1/6', pattern: 'soleil', colors: [P.encre, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.outcome !== 'win') return;
        if (ctx.rng.chance(1 / 6)) return { chips: -ctx.chips, nullify: true, text: 'Pan !' };
        return { xMult: 2, text: 'Clic.' };
      },
    },
  },
  {
    id: 'sans-filet',
    name: 'Sans filet',
    description: '×2,5 Mult, mais tu ne peux plus défausser.',
    rarity: 'rare',
    cost: 7,
    art: { glyph: '×2½', pattern: 'chevrons', colors: [P.bordeaux, P.cerise] },
    hooks: {
      modifyRules(r) {
        r.canDiscard = false;
      },
      onHandScored() {
        return { xMult: 2.5 };
      },
    },
  },
  {
    id: 'dix-de-der',
    name: 'Dix de der',
    description: 'Dernière main de la table : ×3 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: 'DER', pattern: 'rayures', colors: [P.prune, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const table = ctx.state.table;
        if (table && table.handIndex >= ctx.rules.handsPerTable - 1) return { xMult: 3 };
      },
    },
  },
];
