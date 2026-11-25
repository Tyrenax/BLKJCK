import type { BossDef, Suit } from '../engine/types';
import { P } from './palette';
import { SUIT_GLYPH, isTenValue, pay } from './util';

/** Drapeau de table : mains gagnées contre La Maison. */
const MAISON_WINS = 'maisonWins';

function suitBoss(id: string, name: string, suit: Suit, colors: [string, string]): BossDef {
  return {
    id,
    name,
    description: `Tes ${SUIT_GLYPH[suit]} ne marquent pas.`,
    minSalon: 1,
    art: { glyph: SUIT_GLYPH[suit], pattern: 'damier', colors },
    hooks: {
      // Une carte Arlequin échappe aux patrons d'enseigne : c'est son intérêt.
      isCardDebuffed: (card) => card.suit === suit && card.enhancement !== 'arlequin',
    },
  };
}

/** Patrons : chacun tord une règle, lisible en une phrase sur la plaque de table. */
export const bosses: BossDef[] = [
  // ── Salon 1 et plus ──
  suitBoss('coeur-de-pierre', 'Cœur de pierre', 'hearts', [P.bordeauxSombre, P.cendre]),
  suitBoss('pique-nique', 'Pique-nique', 'spades', [P.encre, P.cendre]),
  suitBoss('carreau-casse', 'Carreau cassé', 'diamonds', [P.bordeauxSombre, P.encrePale]),
  suitBoss('trefle-fane', 'Trèfle fané', 'clubs', [P.encre, P.encrePale]),
  {
    id: 'le-tricheur',
    name: 'Le Tricheur',
    description: 'Le croupier gagne les égalités.',
    minSalon: 1,
    art: { glyph: '=', pattern: 'chevrons', colors: [P.bordeauxSombre, P.cerise] },
    hooks: {
      modifyRules(r) {
        r.dealerWinsPush = true;
      },
    },
  },
  {
    id: 'l-usurier',
    name: "L'Usurier",
    description: 'Chaque carte que tu tires te coûte 1 $.',
    minSalon: 1,
    art: { glyph: '-1$', pattern: 'rayures', colors: [P.bordeauxSombre, P.pruneClair] },
    hooks: {
      onHandStart(ctx) {
        // La distribution initiale est gratuite : on ne compte qu'à partir d'ici.
        ctx.api.setFlag('hand', 'usurier', 1);
      },
      onCardDrawn(ctx, _card, who) {
        if (who !== 'player' || ctx.api.getFlag('hand', 'usurier') !== 1) return;
        if (ctx.state.money <= 0) return;
        pay(ctx, 1, "L'Usurier");
        ctx.api.trigger('-1 $');
      },
    },
  },
  {
    id: 'le-sabot-perce',
    name: 'Le Sabot percé',
    description: 'Après chaque main, les 5 cartes du dessus de ton sabot sont défaussées, sous tes yeux.',
    minSalon: 1,
    art: { glyph: 'o.o', pattern: 'points', colors: [P.petroleSombre, P.cendre] },
    hooks: {
      onHandEnd(ctx) {
        let burnt = 0;
        // Chaque carte brûlée émet cardBurned (carte visible) : le joueur voit ce qu'il perd.
        for (let i = 0; i < 5; i++) if (ctx.api.burnTop('player')) burnt++;
        if (burnt > 0) ctx.api.trigger(burnt === 1 ? "1 carte perdue" : `${burnt} cartes perdues`);
      },
    },
  },
  // ── Salon 2 et plus ──
  {
    id: 'la-pince',
    name: 'La Pince',
    description: 'Ta limite baisse de 1.',
    minSalon: 2,
    art: { glyph: '-1', pattern: 'chevrons', colors: [P.petroleSombre, P.cerise] },
    hooks: {
      modifyRules(r) {
        r.playerLimit -= 1;
      },
    },
  },
  {
    id: 'madame-dix',
    name: 'Madame Dix',
    description: 'Tes 10, V, D et R ne marquent pas.',
    minSalon: 2,
    art: { glyph: '10', pattern: 'losanges', colors: [P.pruneSombre, P.cendre] },
    hooks: {
      isCardDebuffed: (card) => isTenValue(card),
    },
  },
  {
    id: 'le-begue',
    name: 'Le Bègue',
    description: 'Tu ne peux ni doubler ni défausser.',
    minSalon: 2,
    art: { glyph: 'B..', pattern: 'rayures', colors: [P.pruneSombre, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.canDouble = false;
        r.canDiscard = false;
      },
    },
  },
  {
    id: 'le-chrono',
    name: 'Le Chrono',
    description: 'Tu joues une main de moins.',
    minSalon: 2,
    art: { glyph: '3', pattern: 'soleil', colors: [P.petroleSombre, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.handsPerTable = Math.max(1, r.handsPerTable - 1);
      },
    },
  },
  {
    id: 'le-borgne',
    name: 'Le Borgne',
    description: 'Ta première carte de chaque main arrive face cachée.',
    // Jouer à l'aveugle divise par deux les chances de passer une table sans atout : pas avant le salon 3.
    minSalon: 3,
    art: { glyph: 'o-', pattern: 'uni', colors: [P.pruneSombre, P.encrePale] },
    hooks: {
      modifyRules(r) {
        r.hidePlayerFirstCard = true;
      },
    },
  },
  // ── Salon 3 et plus ──
  {
    id: 'le-mur',
    name: 'Le Mur',
    description: "L'objectif est doublé.",
    minSalon: 3,
    art: { glyph: 'x2', pattern: 'damier', colors: [P.bordeauxSombre, P.ivoire] },
    hooks: {
      modifyRules(r) {
        r.targetFactor *= 2;
      },
    },
  },
  {
    id: 'le-sobre',
    name: 'Le Sobre',
    description: "Le croupier s'arrête dès 19 et ne crève qu'au-delà de 22.",
    minSalon: 3,
    art: { glyph: '19', pattern: 'vagues', colors: [P.petroleSombre, P.petrolePale] },
    hooks: {
      modifyRules(r) {
        r.dealerStandOn += 2;
        r.dealerLimit += 1;
      },
    },
  },
  {
    id: 'le-radin',
    name: 'Le Radin',
    description: 'Seules tes deux premières cartes marquent.',
    minSalon: 3,
    art: { glyph: '2!', pattern: 'losanges', colors: [P.bordeauxSombre, P.cendre] },
    hooks: {
      isCardDebuffed(card, state) {
        const idx = state.table?.hand?.playerCards.findIndex((c) => c.id === card.id) ?? -1;
        return idx >= 2;
      },
    },
  },
  // ── Salon 4 et plus ──
  {
    id: 'le-douanier',
    name: 'Le Douanier',
    description: 'Tes cartes améliorées ne marquent pas.',
    minSalon: 4,
    art: { glyph: '!', pattern: 'chevrons', colors: [P.encre, P.ivoire] },
    hooks: {
      isCardDebuffed: (card) => !!card.enhancement,
    },
  },
  // ── Salon final ──
  {
    id: 'la-maison',
    name: 'La Maison',
    description: 'Objectif doublé, elle gagne les égalités, et chaque main gagnée baisse ta limite de 1.',
    minSalon: 8,
    finale: true,
    art: { glyph: 'M', pattern: 'soleil', colors: [P.nuit, P.cerise] },
    hooks: {
      modifyRules(r, _self, state) {
        r.targetFactor *= 2;
        r.dealerWinsPush = true;
        // Plus tu la bats, plus elle serre : compteur de mains gagnées à cette table.
        r.playerLimit -= state.table?.flags[MAISON_WINS] ?? 0;
      },
      onHandEnd(ctx, res) {
        if (res.outcome !== 'win') return;
        ctx.api.setFlag('table', MAISON_WINS, ctx.api.getFlag('table', MAISON_WINS) + 1);
        ctx.api.trigger('Limite -1');
        ctx.api.emit({ type: 'rulesChanged', reason: 'La Maison' });
      },
    },
  },
];
