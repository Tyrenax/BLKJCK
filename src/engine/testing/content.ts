/**
 * Contenu MINIMAL de test du moteur (pas le vrai contenu, qui vit dans src/content).
 * Chaque crochet de Hooks et chaque méthode de MutationApi est exercé par au moins un objet.
 * Les valeurs des figures reprennent la table de DESIGN.md §3.
 */
import { ENHANCEMENT_IDS } from '../cards';
import type {
  AtoutDef,
  BalanceConfig,
  BossDef,
  ConsumableDef,
  Content,
  EmblemArt,
  EnhancementDef,
  EnhancementId,
  FigureDef,
  FigureId,
  PrivilegeDef,
  SkipRewardDef,
  StakeDef,
  StartingDeckDef,
} from '../types';

const art: EmblemArt = { glyph: '?', pattern: 'uni', colors: ['#150c1a', '#f4ead4'] };

const fig = (
  id: FigureId,
  priority: number,
  baseChips: number,
  baseMult: number,
  chipsPerLevel: number,
  multPerLevel: number,
): FigureDef => ({ id, name: id, description: id, priority, baseChips, baseMult, chipsPerLevel, multPerLevel });

export const testFigures: Record<FigureId, FigureDef> = {
  blackjack: fig('blackjack', 8, 60, 6, 30, 3),
  triple7: fig('triple7', 7, 77, 7, 35, 3),
  charlie: fig('charlie', 6, 50, 5, 25, 2),
  pile: fig('pile', 5, 40, 4, 20, 2),
  couleur: fig('couleur', 4, 35, 4, 15, 2),
  paire: fig('paire', 3, 25, 3, 15, 1),
  haute: fig('haute', 2, 20, 2, 10, 1),
  petite: fig('petite', 1, 10, 1, 10, 1),
};

const enhancements = Object.fromEntries(
  ENHANCEMENT_IDS.map((id) => [id, { id, name: id, description: id } satisfies EnhancementDef]),
) as Record<EnhancementId, EnhancementDef>;

/** Atouts factices : un par crochet (ou presque). */
export const testAtouts: AtoutDef[] = [
  {
    id: 't-marge',
    name: 'Marge',
    description: 'Limite +1.',
    rarity: 'commun',
    cost: 4,
    art,
    hooks: { modifyRules: (r) => void (r.playerLimit += 1) },
  },
  {
    id: 't-nerveux',
    name: 'Nerveux',
    description: 'Le croupier tire jusqu’à 18.',
    rarity: 'commun',
    cost: 4,
    art,
    hooks: { modifyRules: (r) => void (r.dealerStandOn = 18) },
  },
  {
    id: 't-coeur',
    name: 'Cœur',
    description: 'Chaque ♥ qui marque : +4 Mult.',
    rarity: 'commun',
    cost: 5,
    art,
    hooks: { onCardScored: (_ctx, card) => (card.suit === 'hearts' ? { mult: 4 } : undefined) },
  },
  {
    id: 't-echo',
    name: 'Écho',
    description: 'La première carte marque deux fois.',
    rarity: 'peu-commun',
    cost: 6,
    art,
    hooks: { retriggers: (ctx, card) => (ctx.playerCards[0]?.id === card.id ? 1 : 0) },
  },
  {
    id: 't-parachute',
    name: 'Parachute',
    description: 'Une fois par table, si tu crèves, la dernière carte est défaussée.',
    rarity: 'rare',
    cost: 7,
    art,
    initialState: () => ({ used: 0 }),
    hooks: {
      onTableStart: (ctx) => void (ctx.self!.state.used = 0),
      onBust: (ctx) => {
        const self = ctx.self!;
        const cards = ctx.state.table?.hand?.playerCards ?? [];
        if (self.state.used || cards.length === 0) return;
        self.state.used = 1;
        return { discardCardId: cards[cards.length - 1].id, text: 'Parachute !' };
      },
    },
  },
  {
    id: 't-boule',
    name: 'Boule',
    description: '+1 Mult définitif par main gagnée ; retombe à 0 si tu crèves.',
    rarity: 'peu-commun',
    cost: 6,
    art,
    initialState: () => ({ mult: 0 }),
    hooks: {
      onHandScored: (ctx) => (ctx.self!.state.mult ? { mult: ctx.self!.state.mult } : undefined),
      onHandEnd: (ctx, result) => {
        const self = ctx.self!;
        if (result.outcome === 'win') self.state.mult += 1;
        if (result.outcome === 'bust') self.state.mult = 0;
      },
    },
  },
  {
    id: 't-casse',
    name: 'Casse-banque',
    description: 'Croupier crevé : ×3 Mult.',
    rarity: 'rare',
    cost: 7,
    art,
    hooks: { onHandScored: (ctx) => (ctx.dealerBust ? { xMult: 3 } : undefined) },
  },
  {
    id: 't-pyro',
    name: 'Pyromane',
    description: '+8 Jetons définitifs par carte défaussée.',
    rarity: 'commun',
    cost: 5,
    art,
    initialState: () => ({ chips: 0 }),
    hooks: {
      onDiscard: (ctx) => void (ctx.self!.state.chips += 8),
      onHandScored: (ctx) => (ctx.self!.state.chips ? { chips: ctx.self!.state.chips } : undefined),
    },
  },
  {
    id: 't-tete',
    name: 'Tête brûlée',
    description: '+3 Mult par carte tirée ; compte les cartes reçues.',
    rarity: 'commun',
    cost: 5,
    art,
    initialState: () => ({ seen: 0 }),
    hooks: {
      onCardDrawn: (ctx, _card, who) => {
        if (who === 'player') ctx.self!.state.seen += 1;
      },
      onHandScored: (ctx) => (ctx.hits ? { mult: 3 * ctx.hits } : undefined),
    },
  },
  {
    id: 't-rouge',
    name: 'Rouge ou noir',
    description: 'Une couleur tirée à chaque main ; ses cartes ×1,5 Mult.',
    rarity: 'peu-commun',
    cost: 6,
    art,
    hooks: {
      onHandStart: (ctx) => ctx.api.setFlag('hand', 'rougeNoir', ctx.rng.int(0, 1)),
      onCardScored: (ctx, card) => {
        const red = card.suit === 'hearts' || card.suit === 'diamonds';
        const want = ctx.state.table?.hand?.flags.rougeNoir ?? 0;
        return (want === 1) === red ? { xMult: 1.5 } : undefined;
      },
    },
  },
  {
    id: 't-pourboire',
    name: 'Pourboire',
    description: '1 $ par main gagnée, 1 $ à chaque table battue et à chaque boutique.',
    rarity: 'commun',
    cost: 4,
    art,
    hooks: {
      onHandEnd: (ctx, result) => {
        if (result.outcome === 'win') {
          ctx.api.addMoney(1, 'Pourboire');
          ctx.api.trigger('+1 $');
        }
      },
      onTableEnd: (ctx) => ctx.api.addMoney(1, 'Pourboire'),
      onShopEnter: (ctx) => ctx.api.addMoney(1, 'Pourboire'),
    },
  },
  {
    id: 't-miroir',
    name: 'Miroir',
    description: 'Une égalité compte comme une victoire.',
    rarity: 'rare',
    cost: 7,
    art,
    hooks: { modifyRules: (r) => void (r.pushCountsAsWin = true) },
  },
  {
    id: 't-compteur',
    name: 'Compteur de cartes',
    description: 'Tu vois la prochaine carte de ton sabot.',
    rarity: 'peu-commun',
    cost: 6,
    art,
    hooks: { modifyRules: (r) => void (r.seeNextCard = true) },
  },
  {
    id: 't-ascenseur',
    name: 'Ascenseur',
    description: '+1 limite à chaque main gagnée de la table.',
    rarity: 'rare',
    cost: 7,
    art,
    hooks: {
      onHandEnd: (ctx, result) => {
        if (result.outcome === 'win') ctx.api.addRuleMod('table', { key: 'playerLimit', add: 1, source: 'Ascenseur' });
      },
    },
  },
  {
    id: 't-alchimiste',
    name: 'Alchimiste',
    description: 'Fin de main : la première carte de ta main devient ardente, un 2 rejoint ton sabot.',
    rarity: 'legendaire',
    cost: 9,
    art,
    hooks: {
      onHandEnd: (ctx) => {
        const first = ctx.state.table?.hand?.playerCards[0];
        if (first && !first.enhancement) ctx.api.enhanceCard(first.id, 'ardente');
        if (ctx.state.deck.length < 60) ctx.api.addCard({ rank: '2', suit: 'clubs' }, true);
      },
    },
  },
];

/** Combines et faveurs factices : couvrent les méthodes de MutationApi. */
export const testConsumables: ConsumableDef[] = [
  {
    id: 't-coup-oeil',
    kind: 'combine',
    name: "Coup d'œil",
    description: 'Retourne la carte cachée du croupier.',
    cost: 3,
    art,
    usableIn: ['playerTurn'],
    canUse: (s) => !!s.table?.hand && !s.table.hand.holeRevealed,
    use: (ctx) => ctx.api.revealHole(),
  },
  {
    id: 't-echange',
    kind: 'combine',
    name: 'Échange',
    description: 'Échange une de tes cartes avec la carte visible du croupier.',
    cost: 4,
    art,
    usableIn: ['playerTurn', 'bustChoice'],
    targeting: { zone: 'playerHand', min: 1, max: 1 },
    use: (ctx, [id]) => {
      const up = ctx.state.table!.hand!.dealerCards[0];
      ctx.api.swapWithDealer(id, up.id);
    },
  },
  {
    id: 't-elastique',
    kind: 'combine',
    name: 'Élastique',
    description: 'Limite +2 pour cette main.',
    cost: 3,
    art,
    usableIn: ['playerTurn', 'bustChoice'],
    use: (ctx) => ctx.api.addRuleMod('hand', { key: 'playerLimit', add: 2, source: 'Élastique' }),
  },
  {
    id: 't-savonnette',
    kind: 'combine',
    name: 'Savonnette',
    description: 'Le croupier doit tirer une carte de plus.',
    cost: 3,
    art,
    usableIn: ['playerTurn'],
    use: (ctx) => ctx.api.addRuleMod('hand', { key: 'dealerExtraDraws', add: 1, source: 'Savonnette' }),
  },
  {
    id: 't-brulee',
    kind: 'combine',
    name: 'Carte brûlée',
    description: 'Regarde la prochaine carte de ton sabot puis brûle-la.',
    cost: 3,
    art,
    usableIn: ['playerTurn', 'bustChoice'],
    canUse: (s) => (s.table?.drawPile.length ?? 0) > 0,
    use: (ctx) => {
      ctx.api.peek('player', 1);
      ctx.api.burnTop('player');
    },
  },
  {
    id: 't-pioche',
    kind: 'combine',
    name: 'Pioche',
    description: 'Tire une carte sans que ça compte comme un Tirer ; brûle la carte du croupier.',
    cost: 3,
    art,
    usableIn: ['playerTurn'],
    use: (ctx) => {
      ctx.api.drawToPlayer();
      ctx.api.burnTop('dealer');
      ctx.api.peek('dealer', 2);
    },
  },
  {
    id: 't-manche',
    kind: 'combine',
    name: 'Tour de manche',
    description: 'Une carte de ta main devient un As (définitif).',
    cost: 5,
    art,
    usableIn: ['playerTurn', 'bustChoice'],
    targeting: { zone: 'playerHand', min: 1, max: 1 },
    use: (ctx, [id]) => ctx.api.changeRank(id, 'A'),
  },
  {
    id: 't-plomb',
    kind: 'combine',
    name: 'Plomb',
    description: '1 ou 2 cartes de ton sabot deviennent plombées.',
    cost: 3,
    art,
    usableIn: ['shop', 'handResult', 'tableIntro'],
    targeting: { zone: 'deck', min: 1, max: 2 },
    use: (ctx, ids) => ids.forEach((id) => ctx.api.enhanceCard(id, 'plombee')),
  },
  {
    id: 't-teinture',
    kind: 'combine',
    name: 'Teinture ♥',
    description: "Jusqu'à 3 cartes deviennent ♥.",
    cost: 3,
    art,
    usableIn: ['shop', 'handResult', 'tableIntro'],
    targeting: { zone: 'deck', min: 1, max: 3 },
    use: (ctx, ids) => ids.forEach((id) => ctx.api.changeSuit(id, 'hearts')),
  },
  {
    id: 't-autodafe',
    kind: 'combine',
    name: 'Autodafé',
    description: "Détruit jusqu'à 2 cartes.",
    cost: 3,
    art,
    usableIn: ['shop'],
    targeting: { zone: 'deck', min: 1, max: 2 },
    canUse: (s) => s.deck.length > 14,
    use: (ctx, ids) => ids.forEach((id) => ctx.api.destroyCard(id, 'Autodafé')),
  },
  {
    id: 't-faussaire',
    kind: 'combine',
    name: 'Faussaire',
    description: 'Copie une carte de ton sabot.',
    cost: 4,
    art,
    usableIn: ['shop', 'handResult'],
    targeting: { zone: 'deck', min: 1, max: 1 },
    canUse: (s) => s.deck.length < 70,
    use: (ctx, [id]) => void ctx.api.duplicateCard(id),
  },
  {
    id: 't-faveur-paire',
    kind: 'faveur',
    name: 'Table réservée',
    description: 'Paire +1 niveau.',
    cost: 3,
    art,
    usableIn: ['shop', 'handResult', 'tableIntro', 'playerTurn'],
    use: (ctx) => ctx.api.levelUpFigure('paire'),
  },
  {
    id: 't-faveur-haute',
    kind: 'faveur',
    name: 'Clin d’œil',
    description: 'Main haute +1 niveau ; gagne un atout et une combine si la place le permet.',
    cost: 3,
    art,
    usableIn: ['shop'],
    use: (ctx) => {
      ctx.api.levelUpFigure('haute');
      ctx.api.addAtout('t-marge');
      ctx.api.addConsumable('t-elastique');
    },
  },
];

export const testPrivileges: PrivilegeDef[] = [
  {
    id: 't-main',
    name: '+1 main',
    description: '+1 main par table.',
    cost: 10,
    art,
    mods: [{ key: 'handsPerTable', add: 1, source: '+1 main' }],
  },
  {
    id: 't-defausse',
    name: '+1 défausse',
    description: '+1 défausse par table.',
    cost: 8,
    art,
    mods: [{ key: 'discardsPerTable', add: 1, source: '+1 défausse' }],
  },
  {
    id: 't-broyeur',
    name: 'Broyeur',
    description: 'Déchiqueteuse deux fois par boutique.',
    cost: 8,
    art,
    requires: 't-defausse',
    mods: [{ key: 'shredsPerShop', add: 1, source: 'Broyeur' }],
  },
  {
    id: 't-mecene',
    name: 'Mécène',
    description: 'Gagne 5 $ et une relance gratuite par boutique.',
    cost: 6,
    art,
    mods: [{ key: 'freeRerollsPerShop', add: 1, source: 'Mécène' }],
    onBuy: (ctx) => ctx.api.addMoney(5, 'Mécène'),
  },
  {
    id: 't-passe-droit',
    name: 'Passe-droit',
    description: 'Limite +1.',
    cost: 12,
    art,
    minSalon: 3,
    mods: [{ key: 'playerLimit', add: 1, source: 'Passe-droit' }],
  },
];

export const testBosses: BossDef[] = [
  {
    id: 't-pince',
    name: 'La Pince',
    description: 'Ta limite est de 20.',
    minSalon: 1,
    art,
    hooks: { modifyRules: (r) => void (r.playerLimit = 20) },
  },
  {
    id: 't-dix',
    name: 'Madame Dix',
    description: 'Les V, D, R ne marquent pas.',
    minSalon: 1,
    art,
    hooks: { isCardDebuffed: (card) => card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' },
  },
  {
    id: 't-mur',
    name: 'Le Mur',
    description: "L'objectif est doublé.",
    minSalon: 1,
    art,
    hooks: { modifyRules: (r) => void (r.targetFactor *= 2) },
  },
  {
    id: 't-borgne',
    name: 'Le Borgne',
    description: 'Ta première carte de chaque main est distribuée face cachée.',
    minSalon: 1,
    art,
    hooks: { modifyRules: (r) => void (r.hidePlayerFirstCard = true) },
  },
  {
    id: 't-percé',
    name: 'Le Sabot percé',
    description: 'Après chaque main, 3 cartes de ton sabot partent à la défausse.',
    minSalon: 2,
    art,
    hooks: {
      onHandEnd: (ctx) => {
        for (let i = 0; i < 3; i++) ctx.api.burnTop('player');
        ctx.api.trigger('Percé !');
      },
    },
  },
  {
    id: 't-maison',
    name: 'La Maison',
    description: 'Objectif ×2, elle gagne les égalités, ta limite baisse de 1 à chaque main.',
    minSalon: 1,
    finale: true,
    art,
    hooks: {
      modifyRules: (r) => {
        r.targetFactor *= 2;
        r.dealerWinsPush = true;
      },
      onHandEnd: (ctx) => ctx.api.addRuleMod('table', { key: 'playerLimit', add: -1, source: 'La Maison' }),
    },
  },
];

export const testStartingDecks: StartingDeckDef[] = [
  { id: 't-classique', name: 'Classique', description: '52 cartes.', art },
  {
    id: 't-rouge',
    name: 'Sabot rouge',
    description: 'Que des ♥ et des ♦, chacune en double.',
    art,
    buildDeck: (cards) => cards.filter((c) => c.suit === 'hearts' || c.suit === 'diamonds').flatMap((c) => [c, { ...c }]),
  },
  {
    id: 't-tricheur',
    name: 'Sabot du tricheur',
    description: 'Les 4 As sont marqués, une défausse de moins, une combine Élastique.',
    art,
    buildDeck: (cards) => cards.map((c) => (c.rank === 'A' ? { ...c, enhancement: 'marquee' as const } : c)),
    mods: [{ key: 'discardsPerTable', add: -1, source: 'Sabot du tricheur' }],
    onStart: (ctx) => void ctx.api.addConsumable('t-elastique'),
  },
  {
    id: 't-flambeur',
    name: 'Sabot du flambeur',
    description: '+10 $, pas d’intérêts.',
    art,
    moneyDelta: 10,
    mods: [{ key: 'interestCap', set: 0, source: 'Sabot du flambeur' }],
  },
];

export const testSkipRewards: SkipRewardDef[] = [
  {
    id: 't-enveloppe',
    name: 'Enveloppe',
    description: '+5 $.',
    art,
    grant: (ctx) => ctx.api.addMoney(5, 'Enveloppe'),
  },
  {
    id: 't-rallonge',
    name: 'Rallonge',
    description: 'La table suivante : +1 main.',
    art,
    grant: (ctx) => ctx.api.addRuleMod('table', { key: 'handsPerTable', add: 1, source: 'Rallonge' }),
  },
];

/** Mises de test, de la plus facile à la plus dure (cumulatives). */
export const testStakes: StakeDef[] = [
  { id: 't-blanche', name: 'Mise blanche', description: 'Les règles de base.', art },
  { id: 't-rouge', name: 'Mise rouge', description: 'Objectifs ×1,5.', art, targetFactor: 1.5 },
  {
    id: 't-noire',
    name: 'Mise noire',
    description: 'Une défausse de moins, le croupier tire jusqu’à 18, 2 $ de moins au départ.',
    art,
    mods: [{ key: 'discardsPerTable', add: -1, source: 'Mise noire' }],
    hooks: {
      modifyRules: (r) => void (r.dealerStandOn += 1),
      onHandEnd: (ctx) => ctx.api.setFlag('run', 'noire', ctx.api.getFlag('run', 'noire') + 1),
    },
    onStart: (ctx) => ctx.api.addMoney(-2, 'Mise noire'),
  },
];

export const testBalance: BalanceConfig = {
  salons: 3,
  salonBaseTargets: [150, 300, 600],
  tableFactors: { petite: 1, grande: 1.5, patron: 2 },
  tableRewards: { petite: 3, grande: 4, patron: 5 },
  startingMoney: 4,
  moneyPerUnusedHand: 1,
  interestStep: 5,
  rerollBaseCost: 5,
  rerollCostStep: 1,
  shredBaseCost: 3,
  shredCostStep: 1,
  shredsPerShop: 1,
  sellRatio: 0.5,
  rarityWeights: { commun: 60, 'peu-commun': 30, rare: 9, legendaire: 1 },
  offerKindWeights: { atout: 50, combine: 25, faveur: 10, card: 15 },
  baseRules: {
    playerLimit: 21,
    dealerLimit: 21,
    dealerStandOn: 17,
    handsPerTable: 4,
    discardsPerTable: 2,
    charlieSize: 5,
    doubleXMult: 2,
    lossMultKeep: 0,
    pushMultKeep: 0.5,
    pushCountsAsWin: false,
    dealerWinsPush: false,
    seeNextCard: false,
    seeDealerHole: false,
    canDouble: true,
    canDiscard: true,
    atoutSlots: 5,
    consumableSlots: 2,
    shopOffers: 3,
    interestCap: 5,
    targetFactor: 1,
  },
};

export function makeTestContent(overrides: Partial<Content> = {}): Content {
  return {
    figures: testFigures,
    enhancements,
    atouts: testAtouts,
    consumables: testConsumables,
    privileges: testPrivileges,
    bosses: testBosses,
    balance: testBalance,
    startingDecks: testStartingDecks,
    skipRewards: testSkipRewards,
    stakes: testStakes,
    ...overrides,
  };
}

export const testContent: Content = makeTestContent();
