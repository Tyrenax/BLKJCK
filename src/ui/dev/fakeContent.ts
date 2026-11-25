/**
 * Faux contenu pour développer l'UI sans attendre src/content. Quelques atouts, combines,
 * faveurs, privilèges et patrons représentatifs, écrits contre le vrai contrat.
 */
import type { AtoutDef, BossDef, Card, ConsumableDef, Content, FigureDef, FigureId, PrivilegeDef, Rules } from '../../engine/types';

const fig = (id: FigureId, name: string, description: string, priority: number, c: number, m: number, cl: number, ml: number): FigureDef => ({
  id, name, description, priority, baseChips: c, baseMult: m, chipsPerLevel: cl, multPerLevel: ml,
});

const isFace = (c: Card) => c.rank === 'J' || c.rank === 'Q' || c.rank === 'K';

const baseRules: Rules = {
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
  hidePlayerFirstCard: false,
  dealerExtraDraws: 0,
  freeRerollsPerShop: 0,
  rerollDiscount: 0,
  shredsPerShop: 1,
};

const atouts: AtoutDef[] = [
  {
    id: 'marge', name: 'Marge de manœuvre', description: 'Ta limite passe à 22.', rarity: 'commun', cost: 5,
    art: { glyph: '22', pattern: 'rayures', colors: ['prune', 'prune-clair'] },
    hooks: { modifyRules: (r) => { r.playerLimit += 1; } },
  },
  {
    id: 'sang-chaud', name: 'Sang chaud', description: 'Chaque ♥ qui marque : +4 Mult.', rarity: 'commun', cost: 5,
    art: { glyph: '♥', pattern: 'soleil', colors: ['bordeaux', 'cerise'] },
    hooks: { onCardScored: (_c, card) => (card.suit === 'hearts' ? { mult: 4 } : undefined) },
  },
  {
    id: 'pique-assiette', name: 'Pique-assiette', description: 'Chaque ♠ qui marque : +30 Jetons.', rarity: 'commun', cost: 4,
    art: { glyph: '♠', pattern: 'points', colors: ['encre', 'prune'] },
    hooks: { onCardScored: (_c, card) => (card.suit === 'spades' ? { chips: 30 } : undefined) },
  },
  {
    id: 'cour-royale', name: 'Cour royale', description: 'Chaque V, D, R qui marque : ×1,5 Mult.', rarity: 'peu-commun', cost: 7,
    art: { glyph: 'R', pattern: 'losanges', colors: ['petrole', 'petrole-clair'] },
    hooks: { onCardScored: (_c, card) => (isFace(card) ? { xMult: 1.5 } : undefined) },
  },
  {
    id: 'sur-le-fil', name: 'Sur le fil', description: '+Mult égal à ton total.', rarity: 'peu-commun', cost: 6,
    art: { glyph: '=', pattern: 'vagues', colors: ['petrole-sombre', 'petrole'] },
    hooks: { onHandScored: (c) => ({ mult: c.playerTotal }) },
  },
  {
    id: 'casse-banque', name: 'Casse-banque', description: 'Quand le croupier crève : ×3 Mult.', rarity: 'rare', cost: 8,
    art: { glyph: '×3', pattern: 'damier', colors: ['bordeaux-sombre', 'bordeaux'] },
    hooks: { onHandScored: (c) => (c.dealerBust ? { xMult: 3 } : undefined) },
  },
  {
    id: 'boule-de-neige', name: 'Boule de neige', description: '+1 Mult définitif par main gagnée ; retombe à 0 si tu crèves.', rarity: 'rare', cost: 7,
    art: { glyph: '+1', pattern: 'chevrons', colors: ['prune-sombre', 'prune'] },
    initialState: () => ({ n: 0 }),
    hooks: {
      onHandScored: (c) => (c.self && c.self.state.n > 0 ? { mult: c.self.state.n } : undefined),
      onHandEnd: (ctx, res) => {
        if (!ctx.self) return;
        if (res.outcome === 'win') ctx.self.state.n += 1;
        if (res.outcome === 'bust') ctx.self.state.n = 0;
      },
    },
  },
  {
    id: 'croupier-nerveux', name: 'Croupier nerveux', description: 'Il tire jusqu\'à 18.', rarity: 'commun', cost: 5,
    art: { glyph: '18', pattern: 'uni', colors: ['petrole', 'petrole-sombre'] },
    hooks: { modifyRules: (r) => { r.dealerStandOn = Math.max(r.dealerStandOn, 19); } },
  },
  {
    id: 'rayons-x', name: 'Rayons X', description: 'La carte cachée du croupier est visible.', rarity: 'peu-commun', cost: 6,
    art: { glyph: 'X', pattern: 'damier', colors: ['encre', 'petrole-sombre'] },
    hooks: { modifyRules: (r) => { r.seeDealerHole = true; } },
  },
  {
    id: 'compteur', name: 'Compteur de cartes', description: 'Tu vois la prochaine carte de ton sabot.', rarity: 'legendaire', cost: 10,
    art: { glyph: '?', pattern: 'soleil', colors: ['prune', 'bordeaux'] },
    hooks: { modifyRules: (r) => { r.seeNextCard = true; } },
  },
];

const consumables: ConsumableDef[] = [
  {
    id: 'coup-d-oeil', kind: 'combine', name: 'Coup d\'œil', description: 'Retourne la carte cachée du croupier.', cost: 3,
    art: { glyph: 'Vu', pattern: 'points', colors: ['petrole-sombre', 'petrole'] },
    usableIn: ['playerTurn', 'bustChoice'],
    canUse: (s) => !!s.table?.hand && !s.table.hand.holeRevealed,
    use: (ctx) => ctx.api.revealHole(),
  },
  {
    id: 'elastique', kind: 'combine', name: 'Élastique', description: 'Limite +2 pour cette main.', cost: 3,
    art: { glyph: '+2', pattern: 'vagues', colors: ['prune', 'prune-clair'] },
    usableIn: ['playerTurn', 'bustChoice'],
    use: (ctx) => ctx.api.addRuleMod('hand', { key: 'playerLimit', add: 2, source: 'elastique' }),
  },
  {
    id: 'echange', kind: 'combine', name: 'Échange', description: 'Échange une de tes cartes avec la carte visible du croupier.', cost: 4,
    art: { glyph: '<>', pattern: 'chevrons', colors: ['encre', 'prune'] },
    usableIn: ['playerTurn', 'bustChoice'],
    targeting: { zone: 'playerHand', min: 1, max: 1 },
    use: (ctx, t) => {
      const d = ctx.state.table?.hand?.dealerCards[0];
      if (d && t[0] !== undefined) ctx.api.swapWithDealer(t[0], d.id);
    },
  },
  {
    id: 'plomb', kind: 'combine', name: 'Plomb', description: 'Leste 1 ou 2 cartes de ton sabot (+30 Jetons quand elles marquent).', cost: 3,
    art: { glyph: 'Pb', pattern: 'rayures', colors: ['encre', 'prune-sombre'] },
    usableIn: ['shop', 'handResult', 'tableIntro'],
    targeting: { zone: 'deck', min: 1, max: 2 },
    use: (ctx, t) => t.forEach((id) => ctx.api.enhanceCard(id, 'plombee')),
  },
  {
    id: 'faveur-paire', kind: 'faveur', name: 'Clin d\'œil du patron', description: 'Monte la Paire d\'un niveau.', cost: 3,
    art: { glyph: '♦♦', pattern: 'soleil', colors: ['petrole', 'petrole-sombre'] },
    usableIn: ['shop', 'handResult', 'tableIntro', 'playerTurn'],
    use: (ctx) => ctx.api.levelUpFigure('paire'),
  },
];

const privileges: PrivilegeDef[] = [
  { id: 'main-de-plus', name: 'Habitué', description: '+1 main par table.', cost: 10, art: { glyph: '+1', pattern: 'chevrons', colors: ['prune-sombre', 'prune'] }, mods: [{ key: 'handsPerTable', add: 1, source: 'main-de-plus' }] },
  { id: 'defausse-de-plus', name: 'Manche large', description: '+1 défausse par table.', cost: 10, art: { glyph: '+1', pattern: 'vagues', colors: ['petrole-sombre', 'petrole'] }, mods: [{ key: 'discardsPerTable', add: 1, source: 'defausse-de-plus' }] },
  { id: 'rallonge', name: 'Rallonge', description: 'Ta limite +1, pour toujours.', cost: 14, art: { glyph: '+1', pattern: 'soleil', colors: ['bordeaux-sombre', 'bordeaux'] }, mods: [{ key: 'playerLimit', add: 1, source: 'rallonge' }] },
];

const bosses: BossDef[] = [
  { id: 'la-pince', name: 'La Pince', description: 'Ta limite est de 20.', minSalon: 1, art: { glyph: '20', pattern: 'rayures', colors: ['bordeaux-sombre', 'bordeaux'] }, hooks: { modifyRules: (r) => { r.playerLimit -= 1; } } },
  { id: 'le-mur', name: 'Le Mur', description: 'L\'objectif est doublé.', minSalon: 1, art: { glyph: '×2', pattern: 'damier', colors: ['encre', 'prune-sombre'] }, hooks: { modifyRules: (r) => { r.targetFactor *= 2; } } },
  { id: 'madame-dix', name: 'Madame Dix', description: 'Les V, D, R ne marquent pas.', minSalon: 1, art: { glyph: 'D', pattern: 'losanges', colors: ['prune', 'bordeaux'] }, hooks: { isCardDebuffed: (c) => isFace(c) } },
  { id: 'la-maison', name: 'La Maison', description: 'Objectif ×2, elle gagne les égalités, et ta limite baisse de 1 à chaque main.', minSalon: 8, finale: true, art: { glyph: 'M', pattern: 'soleil', colors: ['bordeaux-sombre', 'cerise'] }, hooks: { modifyRules: (r) => { r.targetFactor *= 2; r.dealerWinsPush = true; } } },
];

export const fakeContent: Content = {
  figures: {
    blackjack: fig('blackjack', 'Blackjack', 'As et carte à 10, en deux cartes.', 8, 60, 6, 30, 3),
    triple7: fig('triple7', 'Triple sept', 'Trois 7 dans la main.', 7, 77, 7, 35, 3),
    charlie: fig('charlie', 'Charlie', 'Cinq cartes sans crever.', 6, 50, 5, 25, 2),
    pile: fig('pile', 'Pile', 'Total pile sur la limite.', 5, 40, 4, 20, 2),
    couleur: fig('couleur', 'Couleur', 'Trois cartes ou plus de la même enseigne.', 4, 35, 4, 15, 2),
    paire: fig('paire', 'Paire', 'Deux cartes de même rang.', 3, 25, 3, 15, 1),
    haute: fig('haute', 'Main haute', 'Total à 4 points ou moins de la limite.', 2, 20, 2, 10, 1),
    petite: fig('petite', 'Petite main', 'Tout le reste.', 1, 10, 1, 10, 1),
  },
  enhancements: {
    plombee: { id: 'plombee', name: 'Plombée', description: '+30 Jetons quand elle marque.' },
    ardente: { id: 'ardente', name: 'Ardente', description: '+4 Mult quand elle marque.' },
    cristal: { id: 'cristal', name: 'Cristal', description: '×2 Mult quand elle marque. 1 chance sur 4 de se briser.' },
    doree: { id: 'doree', name: 'Dorée', description: '+2 $ quand elle marque sur une main gagnée.' },
    marquee: { id: 'marquee', name: 'Marquée', description: 'Tu la vois venir quand elle est au sommet de ton sabot.' },
    fantome: { id: 'fantome', name: 'Fantôme', description: 'Compte 0 dans ton total, mais marque ses Jetons.' },
    elastique: { id: 'elastique', name: 'Élastique', description: 'Vaut sa valeur ou sa valeur −3, au mieux pour toi.' },
    arlequin: { id: 'arlequin', name: 'Arlequin', description: 'Compte comme les quatre enseignes.' },
  },
  atouts,
  consumables,
  privileges,
  bosses,
  balance: {
    salons: 8,
    salonBaseTargets: [300, 800, 1800, 4000, 9000, 18000, 36000, 70000],
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
    rarityWeights: { commun: 60, 'peu-commun': 28, rare: 10, legendaire: 2 },
    offerKindWeights: { atout: 60, combine: 20, faveur: 10, card: 10 },
    baseRules,
  },
};
