import type { AtoutDef } from '../../engine/types';
import { P } from '../palette';
import { n, pay, setN } from '../util';

/** La limite et la Jauge : repousser le point où l'on crève, et viser juste sous la butée. */
export const limiteAtouts: AtoutDef[] = [
  {
    id: 'marge-de-manoeuvre',
    name: 'Marge de manœuvre',
    description: 'Ta limite augmente de 1.',
    rarity: 'peu-commun',
    cost: 7,
    art: { glyph: '+1', pattern: 'rayures', colors: [P.petrole, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.playerLimit += 1;
      },
    },
  },
  {
    id: 'vingt-trois',
    name: 'Le Vingt-Trois',
    description: 'Ta limite augmente de 2, mais tu as une défausse de moins par table.',
    rarity: 'rare',
    cost: 8,
    art: { glyph: '23', pattern: 'chevrons', colors: [P.bordeaux, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.playerLimit += 2;
        r.discardsPerTable = Math.max(0, r.discardsPerTable - 1);
      },
    },
  },
  {
    id: 'plafond-de-verre',
    name: 'Plafond de verre',
    description: 'Ta limite augmente de 2 ; chaque point au-dessus de 21 où tu finis te coûte 1 $.',
    rarity: 'rare',
    cost: 8,
    art: { glyph: '+3', pattern: 'losanges', colors: [P.petrole, P.cendre] },
    hooks: {
      modifyRules(r) {
        r.playerLimit += 2;
      },
      onHandEnd(ctx, res) {
        if (res.outcome !== 'bust' && res.playerTotal > 21) pay(ctx, res.playerTotal - 21, 'Plafond de verre');
      },
    },
  },
  {
    id: 'funambule',
    name: 'Funambule',
    description: 'Finir à 1 point sous ta limite : ×3 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '-1', pattern: 'vagues', colors: [P.prune, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.playerTotal === ctx.rules.playerLimit - 1) return { xMult: 3 };
      },
    },
  },
  {
    id: 'pile-poil',
    name: 'Pile poil',
    description: 'Pile : ×3 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '=', pattern: 'soleil', colors: [P.petrole, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        if (ctx.figures.includes('pile')) return { xMult: 3 };
      },
    },
  },
  {
    id: 'sur-le-fil',
    name: 'Sur le fil',
    description: '+2 Mult par point de ton total au-dessus de 17.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '17', pattern: 'rayures', colors: [P.encre, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const over = ctx.playerTotal - 17;
        if (over > 0) return { mult: 2 * over };
      },
    },
  },
  {
    id: 'ascenseur',
    name: 'Ascenseur',
    description: (self) =>
      `Chaque main gagnée : limite +1 jusqu'à la fin de la table (23 au plus). Actuellement +${n(self, 'bonus')}.`,
    rarity: 'peu-commun',
    cost: 7,
    art: { glyph: '^', pattern: 'chevrons', colors: [P.petrole, P.petroleClair] },
    initialState: () => ({ bonus: 0 }),
    hooks: {
      modifyRules(r, self) {
        r.playerLimit += n(self, 'bonus');
      },
      onTableStart(ctx) {
        setN(ctx.self, 'bonus', 0);
      },
      onHandEnd(ctx, res) {
        if (res.outcome !== 'win') return;
        setN(ctx.self, 'bonus', n(ctx.self, 'bonus') + 1);
        ctx.api.trigger('Limite +1');
        ctx.api.emit({ type: 'rulesChanged', reason: 'Ascenseur' });
      },
      onTableEnd(ctx) {
        setN(ctx.self, 'bonus', 0);
      },
    },
  },
  {
    id: 'altitude',
    name: 'Altitude',
    description: '+5 Mult par point de limite au-dessus de 21.',
    rarity: 'commun',
    cost: 5,
    art: { glyph: '21+', pattern: 'points', colors: [P.prune, P.cerise] },
    hooks: {
      onHandScored(ctx) {
        const extra = ctx.rules.playerLimit - 21;
        if (extra > 0) return { mult: 5 * extra };
      },
    },
  },
  {
    id: 'corde-raide',
    name: 'Corde raide',
    description: '×2 Mult, mais ta limite baisse de 1.',
    rarity: 'peu-commun',
    cost: 6,
    art: { glyph: '×2', pattern: 'vagues', colors: [P.bordeaux, P.cerise] },
    hooks: {
      modifyRules(r) {
        r.playerLimit -= 1;
      },
      onHandScored() {
        return { xMult: 2 };
      },
    },
  },
];
