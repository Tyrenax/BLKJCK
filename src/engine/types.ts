/**
 * SABOT — contrat partagé entre le moteur (src/engine), le contenu (src/content) et l'UI (src/ui).
 *
 * Règles du contrat :
 *  - Ce fichier ne contient QUE des types (aucun code runtime), pour que tout le monde puisse l'importer.
 *  - Propriétaire : l'agent moteur (bjck-5a). Les autres demandent les changements par message ;
 *    les changements sont additifs tant que possible (on n'enlève/renomme rien sans prévenir).
 *  - RunState doit rester 100 % sérialisable en JSON (sauvegarde localStorage) : pas de fonctions,
 *    pas de Map/Set, pas de classes. Les comportements vivent dans les *Def du contenu, référencés par id.
 *  - Le moteur est pur et synchrone : dispatch(state, action) -> { state, events }.
 *    L'UI ne modifie jamais le state ; elle rejoue `events` en animation puis affiche le nouveau state.
 */

// ───────────────────────────── Cartes ─────────────────────────────

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardColor = 'red' | 'black';

/**
 * Améliorations de carte (une seule par carte). Sémantique implémentée par le moteur :
 *  - plombee   : +30 Jetons quand elle marque.
 *  - ardente   : +4 Mult quand elle marque.
 *  - cristal   : ×2 Mult quand elle marque, 1 chance sur 4 d'être détruite après la main.
 *  - doree     : +$2 quand elle marque sur une main gagnée.
 *  - marquee   : carte de tricheur — visible quand elle est au sommet de ton sabot (tu sais qu'elle arrive).
 *  - fantome   : compte 0 dans ton total, mais marque quand même ses Jetons.
 *  - elastique : vaut sa valeur OU sa valeur −3, au mieux pour toi (comme un As qui vaut 11 ou 1).
 *  - arlequin  : compte comme les quatre enseignes à la fois.
 */
export type EnhancementId =
  | 'plombee'
  | 'ardente'
  | 'cristal'
  | 'doree'
  | 'marquee'
  | 'fantome'
  | 'elastique'
  | 'arlequin';

export interface Card {
  /** Unique sur toute la partie (cartes du joueur ET du croupier). */
  id: number;
  rank: Rank;
  suit: Suit;
  enhancement?: EnhancementId;
}

export interface EnhancementDef {
  id: EnhancementId;
  name: string;
  description: string;
}

// ───────────────────────────── Figures ─────────────────────────────

/**
 * Figure = le « type de main » qui donne les Jetons/Mult de base (équivalent des mains de poker).
 * Une seule figure marque : celle de plus haute priorité parmi celles que la main satisfait.
 * Ordre de priorité (haut -> bas) :
 *  blackjack : As + carte à 10 en exactement 2 cartes (naturel).
 *  triple7   : trois 7 dans la main.
 *  charlie   : rules.charlieSize cartes ou plus sans crever.
 *  pile      : total exactement égal à la limite (hors blackjack naturel).
 *  couleur   : 3 cartes ou plus, toutes de la même enseigne.
 *  paire     : au moins deux cartes de même rang.
 *  haute     : total >= limite − 4 (17 à 20 avec une limite de 21).
 *  petite    : tout le reste.
 */
export type FigureId =
  | 'blackjack'
  | 'triple7'
  | 'charlie'
  | 'pile'
  | 'couleur'
  | 'paire'
  | 'haute'
  | 'petite';

export interface FigureDef {
  id: FigureId;
  name: string;
  description: string;
  /** Plus grand = prioritaire. */
  priority: number;
  baseChips: number;
  baseMult: number;
  /** Gain par niveau au-dessus de 1. */
  chipsPerLevel: number;
  multPerLevel: number;
}

// ───────────────────────────── Règles ─────────────────────────────

/**
 * Règles effectives d'une main. Recalculées à la demande :
 *   base (balance) -> runMods -> table.mods -> hand.mods -> boss.modifyRules -> atouts.modifyRules (gauche -> droite).
 * C'est ICI que vivent les bonus du type « la limite passe à 22 » ou « le croupier tire jusqu'à 18 ».
 */
export interface Rules {
  /** Au-delà de ce total, le joueur crève. Défaut 21. */
  playerLimit: number;
  /** Au-delà de ce total, le croupier crève. Défaut 21. */
  dealerLimit: number;
  /** Le croupier tire tant que son total est strictement inférieur à cette valeur. Défaut 17. */
  dealerStandOn: number;
  /** Mains jouables par table. Défaut 4. */
  handsPerTable: number;
  /** Défausses par table. Défaut 2. */
  discardsPerTable: number;
  /** Nombre de cartes pour un Charlie. Défaut 5. */
  charlieSize: number;
  /** Multiplicateur appliqué au Mult quand on double. Défaut 2. */
  doubleXMult: number;
  /**
   * Part du Mult conservée sur une défaite. Défaut 0 = la banque garde ton Mult (Mult final = 1).
   * Mult final sur défaite = max(1, mult × lossMultKeep).
   */
  lossMultKeep: number;
  /** Part du Mult conservée sur une égalité. Défaut 0.5. */
  pushMultKeep: number;
  /** Une égalité compte comme une victoire pour le joueur. */
  pushCountsAsWin: boolean;
  /** Le croupier gagne les égalités (boss). Prioritaire sur pushCountsAsWin. */
  dealerWinsPush: boolean;
  /** Le joueur voit la prochaine carte de son sabot. */
  seeNextCard: boolean;
  /** La carte cachée du croupier est visible. */
  seeDealerHole: boolean;
  canDouble: boolean;
  canDiscard: boolean;
  atoutSlots: number;
  consumableSlots: number;
  /** Nombre d'offres « cartes » en boutique (atouts/combines/faveurs). Défaut 3. */
  shopOffers: number;
  /** Plafond d'intérêts par table. Défaut 5. */
  interestCap: number;
  /** Multiplie l'objectif de la table (boss). Défaut 1. */
  targetFactor: number;

  // ── Clés ajoutées après la v1 du contrat (facultatives dans balance.baseRules, voir BaseRules) ──
  /** Patron « Le Borgne » : ta 1re carte de chaque main arrive face cachée. Défaut false. */
  hidePlayerFirstCard: boolean;
  /** Cartes que le croupier tire EN PLUS après s'être arrêté (combine « Savonnette » via un mod de main). Défaut 0. */
  dealerExtraDraws: number;
  /** Relances gratuites à chaque visite de boutique (ne font pas monter le prix). Défaut 0. */
  freeRerollsPerShop: number;
  /** Retranché du coût de relance (minimum 0). Défaut 0. */
  rerollDiscount: number;
  /** Utilisations de la Déchiqueteuse par boutique. Défaut balance.shredsPerShop. */
  shredsPerShop: number;
  /**
   * La défausse peut annuler un crevé (défausser en bustChoice). Défaut false : seuls une combine
   * jouable en bustChoice ou un crochet onBust sauvent un joueur qui a crevé.
   * Facultative dans le type pour ne casser aucun objet Rules écrit à la main ; le moteur la remplit
   * toujours. Les clés ajoutées désormais suivront ce modèle.
   */
  discardAfterBust?: boolean;
  /** Ajouté au prix de tout ce qui se paie en boutique (offres, relance, Déchiqueteuse). Défaut 0. */
  shopPriceAdd?: number;
  /** Les patrons peuvent apparaître autant de salons plus tôt que leur minSalon. Défaut 0. */
  bossSalonAdvance?: number;
}

/** Clés de Rules ajoutées après la v1 : le moteur fournit leur défaut si balance.baseRules les omet. */
export type ExtendedRuleKey =
  | 'hidePlayerFirstCard'
  | 'dealerExtraDraws'
  | 'freeRerollsPerShop'
  | 'rerollDiscount'
  | 'shredsPerShop'
  | 'discardAfterBust'
  | 'shopPriceAdd'
  | 'bossSalonAdvance';

/** Type de balance.baseRules : les clés étendues y sont facultatives. */
export type BaseRules = Omit<Rules, ExtendedRuleKey> & Partial<Pick<Rules, ExtendedRuleKey>>;

export type NumericRuleKey = {
  [K in keyof Rules]-?: NonNullable<Rules[K]> extends number ? K : never;
}[keyof Rules];
export type BooleanRuleKey = {
  [K in keyof Rules]-?: NonNullable<Rules[K]> extends boolean ? K : never;
}[keyof Rules];

/** Modificateur de règle sérialisable (privilèges, combines, effets temporaires). */
export type RuleMod =
  | { key: NumericRuleKey; add: number; source: string }
  | { key: NumericRuleKey; set: number; source: string }
  | { key: BooleanRuleKey; set: boolean; source: string };

// ───────────────────────────── État de partie ─────────────────────────────

export type Phase =
  | 'tableIntro' // présentation de la table à venir (objectif, patron) — attend startTable
  | 'playerTurn' // le joueur tire / reste / double / défausse / joue une combine
  | 'bustChoice' // le joueur a crevé mais peut encore défausser une carte ou jouer une combine
  | 'handResult' // main résolue et marquée — attend nextHand
  | 'tableWon' // objectif atteint — récap des gains, attend cashOut
  | 'shop'
  | 'gameOver'
  | 'victory'; // salon final battu

export type TableKind = 'petite' | 'grande' | 'patron';
export type Outcome = 'win' | 'push' | 'loss' | 'bust';

export interface AtoutInstance {
  uid: number;
  defId: string;
  /** Compteurs propres à l'atout (scaling, charges…). Nombres uniquement. */
  state: Record<string, number>;
}

export interface ConsumableInstance {
  uid: number;
  defId: string;
}

export interface HandResult {
  outcome: Outcome;
  dealerBust: boolean;
  playerTotal: number;
  dealerTotal: number;
  figure: FigureId;
  /** Valeurs finales après application du résultat (défaite/égalité). */
  chips: number;
  mult: number;
  score: number;
}

export interface HandState {
  playerCards: Card[];
  /** dealerCards[0] est la carte visible, dealerCards[1] la carte cachée jusqu'à holeRevealed. */
  dealerCards: Card[];
  holeRevealed: boolean;
  /** Nombre de « Tirer » effectués pendant cette main. */
  hits: number;
  doubled: boolean;
  /** Défausses utilisées pendant cette main. */
  discards: number;
  mods: RuleMod[];
  /** Drapeaux libres pour le contenu (ex. couleur tirée par « Rouge ou Noir »). */
  flags: Record<string, number>;
  result: HandResult | null;
  /** Cartes du joueur distribuées face cachée (Le Borgne), retournées quand il reste ou crève. */
  hiddenCardIds?: number[];
}

export interface TableState {
  kind: TableKind;
  /** Défini seulement si kind === 'patron'. */
  bossId: string | null;
  target: number;
  score: number;
  /** Index de la main en cours (0-based). */
  handIndex: number;
  handsLeft: number;
  discardsLeft: number;
  /** Sabot du joueur pour cette table. L'index 0 est le sommet (prochaine carte tirée). */
  drawPile: Card[];
  discardPile: Card[];
  /** Sabot du croupier : un jeu de 52 cartes standard mélangé à chaque table. Index 0 = sommet. */
  dealerDrawPile: Card[];
  mods: RuleMod[];
  flags: Record<string, number>;
  hand: HandState | null;
  /** Défausse du croupier (ses cartes jouées, brûlées). */
  dealerDiscardPile?: Card[];
  /** Mains distribuées depuis le début de la table (handsLeft = rules.handsPerTable − handsDealt). */
  handsDealt?: number;
  /** Défausses consommées (discardsLeft = rules.discardsPerTable − discardsUsed). */
  discardsUsed?: number;
  /** Gains calculés à la victoire (phase tableWon), encaissés par cashOut. */
  payout?: PayoutLine[];
  /** Mains gagnées à cette table (résumé de partie). */
  handsWon?: number;
}

export type OfferKind = 'atout' | 'combine' | 'faveur' | 'privilege' | 'card';

export interface ShopOffer {
  offerId: number;
  kind: OfferKind;
  /** id de la Def (atout / consommable / privilège). Vide pour kind === 'card'. */
  defId: string;
  /** Carte à jouer proposée (kind === 'card'). */
  card?: Card;
  cost: number;
  sold: boolean;
}

export interface ShopState {
  offers: ShopOffer[];
  rerollCost: number;
  /** Prix actuel de la Déchiqueteuse (retirer une carte du sabot). Augmente à chaque usage. */
  shredCost: number;
  shredsLeft: number;
  /** Relances gratuites restantes dans cette boutique (rules.freeRerollsPerShop). */
  freeRerollsLeft?: number;
  /** Relances payées dans cette boutique (rerollCost = base + pas × rerollsPaid − rules.rerollDiscount). */
  rerollsPaid?: number;
}

export interface RunStats {
  handsPlayed: number;
  handsWon: number;
  busts: number;
  dealerBusts: number;
  blackjacks: number;
  bestHandScore: number;
  tablesWon: number;
  /** Cartes retirées à la Déchiqueteuse (fait monter son prix sur toute la partie). */
  cardsShredded?: number;
  /** Tables sautées contre un pot-de-vin. */
  tablesSkipped?: number;
  /** Nombre de mains marquées par figure (hors crevés), pour les apparitions conditionnelles. */
  figureCounts?: Partial<Record<FigureId, number>>;
}

export interface RunState {
  /** Version du format de sauvegarde. */
  version: number;
  seed: string;
  /** État interne du générateur aléatoire (déterministe à partir de la graine). */
  rngState: number;
  phase: Phase;
  /** 1..balance.salons */
  salon: number;
  /** 0 = petite table, 1 = grande table, 2 = table du patron. */
  tableIndex: number;
  /** Patron du salon en cours, connu dès le début du salon pour que le joueur puisse s'y préparer. */
  bossId: string;
  money: number;
  /** Toutes les cartes possédées (le sabot complet, hors table en cours). */
  deck: Card[];
  atouts: AtoutInstance[];
  consumables: ConsumableInstance[];
  privileges: string[];
  figureLevels: Record<FigureId, number>;
  runMods: RuleMod[];
  table: TableState | null;
  shop: ShopState | null;
  nextCardId: number;
  nextUid: number;
  stats: RunStats;
  /** Drapeaux libres pour le contenu, portée partie. */
  flags: Record<string, number>;
  /** Privilège proposé dans toutes les boutiques du salon (null = acheté ou plus rien à offrir). */
  salonPrivilege?: string | null;
  /** Patrons déjà tirés pendant la partie (évite les répétitions). */
  bossHistory?: string[];
  /** Sabot de départ choisi au lancement (StartingDeckDef.id). */
  deckId?: string;
  /**
   * Pots-de-vin du salon, tirés avec le patron : index 0 = petite table, 1 = grande table
   * (SkipRewardDef.id, null = déjà pris ou rien à offrir). En tableIntro, celui de la table en cours
   * est `salonSkipRewards[tableIndex]`.
   */
  salonSkipRewards?: (string | null)[];
  /** Mise choisie au lancement (StakeDef.id) et son rang dans content.stakes (0 = la plus facile). */
  stakeId?: string;
  stakeLevel?: number;
  /** Mode sans fin : la partie continue après la victoire au dernier salon. */
  endless?: boolean;
  /** Résumé de partie : une ligne par table jouée ou sautée (les plus anciennes tombent au-delà de 64). */
  history?: TableRecord[];
  /** Meilleure main de la partie, détaillée. */
  bestHand?: BestHandRecord;
  /** Rempli à la défaite : où et de combien. */
  death?: DeathRecord;
  /** Objets rencontrés pendant la partie (proposés ou obtenus), pour la collection du profil. */
  seen?: SeenRecord;
}

export interface TableRecord {
  salon: number;
  kind: TableKind;
  bossId: string | null;
  target: number;
  score: number;
  handsPlayed: number;
  handsWon: number;
  /** Gain de la table (lignes de payout) ; 0 si perdue, sautée ou victoire finale. */
  payout: number;
  result: 'won' | 'lost' | 'skipped';
  /** Récompense prise si la table a été sautée. */
  skipRewardId?: string;
}

export interface BestHandRecord {
  score: number;
  figure: FigureId;
  chips: number;
  mult: number;
  salon: number;
  outcome: Outcome;
  cards: Card[];
}

export interface DeathRecord {
  salon: number;
  kind: TableKind;
  bossId: string | null;
  target: number;
  score: number;
  /** Points qui manquaient. */
  missing: number;
}

export interface SeenRecord {
  atouts: string[];
  consumables: string[];
  privileges: string[];
}

// ───────────────────────────── Actions ─────────────────────────────

export type Action =
  | { type: 'startTable' }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double' }
  /** Retire une carte de ta main (sans la remplacer). Valide en playerTurn et bustChoice. */
  | { type: 'discard'; cardId: number }
  /** En bustChoice : accepter d'avoir crevé. */
  | { type: 'acceptBust' }
  | { type: 'nextHand' }
  | { type: 'cashOut' }
  | { type: 'buy'; offerId: number }
  | { type: 'sellAtout'; uid: number }
  | { type: 'sellConsumable'; uid: number }
  | { type: 'reroll' }
  /** Déchiqueteuse : retire définitivement une carte du sabot (boutique). */
  | { type: 'shredCard'; cardId: number }
  | { type: 'useConsumable'; uid: number; targets?: number[] }
  /** Nouvel ordre complet des uid d'atouts (l'ordre compte : déclenchement gauche -> droite). */
  | { type: 'reorderAtouts'; order: number[] }
  | { type: 'leaveShop' }
  /** Pot-de-vin : en tableIntro d'une petite ou grande table, sauter la table contre sa récompense. */
  | { type: 'skipTable' }
  /** En phase victory : continuer en mode sans fin (gains de la table, boutique, salon suivant). */
  | { type: 'continueEndless' };

export type ActionType = Action['type'];

// ───────────────────────────── Événements (pour l'UI) ─────────────────────────────

export type ScoreSource =
  | { kind: 'figure'; figure: FigureId }
  | { kind: 'card'; cardId: number }
  | { kind: 'enhancement'; cardId: number; enhancement: EnhancementId }
  | { kind: 'atout'; uid: number; cardId?: number }
  | { kind: 'boss'; bossId: string }
  | { kind: 'rule'; label: string }
  | { kind: 'stake'; stakeId: string };

export interface PayoutLine {
  label: string;
  amount: number;
}

/**
 * Journal ordonné de ce qui vient de se passer. L'UI le rejoue pas à pas.
 * Chaque événement porte assez d'info pour être animé sans relire le state.
 */
export type GameEvent =
  | { type: 'tableStarted'; kind: TableKind; bossId: string | null; target: number; salon: number }
  | { type: 'handStarted'; handIndex: number; handsLeft: number }
  | {
      type: 'cardDealt';
      to: 'player' | 'dealer';
      card: Card;
      faceDown: boolean;
      /** Total visible du destinataire après cette carte (pour le croupier : cartes visibles seulement). */
      total: number;
      soft: boolean;
    }
  | { type: 'holeRevealed'; card: Card; total: number }
  | { type: 'playerBust'; total: number; limit: number; canRecover: boolean }
  | { type: 'bustRecovered'; total: number }
  | { type: 'cardDiscarded'; owner: 'player' | 'dealer'; card: Card; total: number }
  | { type: 'cardDestroyed'; card: Card; reason: string }
  | { type: 'cardChanged'; before: Card; after: Card }
  | { type: 'cardAddedToDeck'; card: Card }
  | { type: 'cardsSwapped'; playerCard: Card; dealerCard: Card }
  | { type: 'deckPeeked'; owner: 'player' | 'dealer'; cards: Card[] }
  | { type: 'dealerStands'; total: number }
  | { type: 'dealerBust'; total: number; limit: number }
  | { type: 'outcome'; outcome: Outcome; dealerBust: boolean; playerTotal: number; dealerTotal: number }
  | { type: 'scoreStart'; figure: FigureId; level: number; chips: number; mult: number }
  | {
      type: 'scoreStep';
      source: ScoreSource;
      chips?: number;
      mult?: number;
      xMult?: number;
      money?: number;
      /** Texte court à faire jaillir (« +4 Mult », « Encore ! »). Fourni par le moteur si absent du contenu. */
      text: string;
      chipsAfter: number;
      multAfter: number;
    }
  | {
      type: 'scoreEnd';
      outcome: Outcome;
      chips: number;
      mult: number;
      handScore: number;
      tableScore: number;
      target: number;
    }
  | { type: 'atoutTriggered'; uid: number; text: string }
  | { type: 'atoutChanged'; uid: number }
  | { type: 'atoutAdded'; uid: number; defId: string }
  | { type: 'atoutRemoved'; uid: number; defId: string }
  | { type: 'consumableAdded'; uid: number; defId: string }
  | { type: 'consumableUsed'; uid: number; defId: string }
  | { type: 'figureLeveled'; figure: FigureId; level: number }
  /** `rules` = règles effectives juste après le changement (pour animer la Jauge cran par cran). */
  | { type: 'rulesChanged'; reason: string; rules?: Rules }
  | { type: 'moneyChanged'; delta: number; total: number; reason: string }
  | { type: 'tableWon'; payout: PayoutLine[]; total: number }
  | { type: 'shopEntered' }
  | { type: 'shopRerolled' }
  | { type: 'offerBought'; offerId: number }
  | { type: 'privilegeGained'; defId: string }
  | { type: 'salonStarted'; salon: number; bossId: string }
  | { type: 'gameOver'; reason: string }
  | { type: 'victory' }
  /** Le patron vient d'agir hors marquage (équivalent de atoutTriggered). */
  | { type: 'bossTriggered'; bossId: string; text: string }
  /** Une carte du joueur distribuée face cachée est retournée. `total` = vrai total du joueur. */
  | { type: 'playerCardRevealed'; card: Card; total: number }
  /** Carte du sommet d'un sabot envoyée directement à la défausse (burnTop). */
  | { type: 'cardBurned'; owner: 'player' | 'dealer'; card: Card }
  /** Sabot vide : la défausse est remélangée dedans (cas limite, deck très affiné). */
  | { type: 'deckReshuffled'; owner: 'player' | 'dealer'; count: number }
  | { type: 'consumableRemoved'; uid: number; defId: string }
  | { type: 'atoutsReordered'; order: number[] }
  /** Table sautée contre un pot-de-vin (les effets de la récompense suivent). */
  | { type: 'tableSkipped'; kind: TableKind; rewardId: string };

// ───────────────────────────── Aléatoire ─────────────────────────────

/** Générateur déterministe fourni par le moteur. Le contenu n'utilise JAMAIS Math.random. */
export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number;
  /** Vrai avec une probabilité `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
}

// ───────────────────────────── Crochets du contenu ─────────────────────────────

/** Lecture d'une main pendant le marquage. */
export interface ScoringContext {
  state: Readonly<RunState>;
  rules: Readonly<Rules>;
  rng: Rng;
  /** L'atout dont le crochet s'exécute (null pour un patron). Son `state` peut être modifié. */
  self: AtoutInstance | null;
  playerCards: readonly Card[];
  dealerCards: readonly Card[];
  playerTotal: number;
  dealerTotal: number;
  /** playerTotal − dealerTotal (dealerTotal compté 0 si le croupier a crevé). */
  margin: number;
  outcome: Outcome;
  dealerBust: boolean;
  /** Figure qui marque. */
  figure: FigureId;
  /** Toutes les figures que la main satisfait (ex. une Pile peut aussi contenir une paire). */
  figures: readonly FigureId[];
  hits: number;
  doubled: boolean;
  discards: number;
  /** Valeurs courantes au moment de l'appel. */
  chips: number;
  mult: number;
}

/** Effet de marquage renvoyé par un crochet. Appliqué dans l'ordre : chips, mult, xMult, money. */
export interface ScoreEffect {
  chips?: number;
  mult?: number;
  xMult?: number;
  money?: number;
  /** Texte court optionnel à afficher (sinon généré : « +4 Mult »). */
  text?: string;
  /**
   * La main marquera 0 quoi qu'il arrive ensuite (Tapis, Roulette russe). L'effet s'applique et la
   * cascade continue normalement ; à la fin, les Jetons tombent à 0 (scoreStep « Main annulée »).
   */
  nullify?: true;
}

export type ScoreEffects = ScoreEffect | ScoreEffect[] | void;

/** Contexte des crochets hors marquage. `api` permet d'agir sur la partie proprement. */
export interface HookContext {
  state: Readonly<RunState>;
  rules: Readonly<Rules>;
  rng: Rng;
  self: AtoutInstance | null;
  api: MutationApi;
}

/**
 * Seule porte d'entrée du contenu pour modifier la partie. Chaque méthode émet les événements
 * correspondants. Implémentée par le moteur.
 */
export interface MutationApi {
  addMoney(amount: number, reason: string): void;
  /** Ajoute un modificateur de règle pour la main / la table / toute la partie. */
  addRuleMod(scope: 'hand' | 'table' | 'run', mod: RuleMod): void;
  levelUpFigure(figure: FigureId, levels?: number): void;

  /** Cartes : `cardId` peut désigner une carte en main, dans le sabot de table ou dans le deck. */
  enhanceCard(cardId: number, enhancement: EnhancementId | null): void;
  changeSuit(cardId: number, suit: Suit): void;
  changeRank(cardId: number, rank: Rank): void;
  destroyCard(cardId: number, reason: string): void;
  /** Crée une carte et l'ajoute au deck (et au sabot de la table en cours si `toDrawPile`). */
  addCard(card: Omit<Card, 'id'>, toDrawPile?: boolean): Card;
  /** Copie une carte existante dans le deck. */
  duplicateCard(cardId: number): Card;

  /** Actions de table (pendant une main). */
  drawToPlayer(): Card | null;
  /** Défausse une carte de la main du joueur sans consommer de défausse. */
  discardFromHand(cardId: number): void;
  /** Envoie la carte du sommet d'un sabot à la défausse. */
  burnTop(owner: 'player' | 'dealer'): Card | null;
  /** Montre les `count` prochaines cartes d'un sabot (événement deckPeeked). */
  peek(owner: 'player' | 'dealer', count: number): Card[];
  revealHole(): void;
  /** Échange une carte du joueur avec une carte du croupier. */
  swapWithDealer(playerCardId: number, dealerCardId: number): void;

  addAtout(defId: string): AtoutInstance | null;
  removeAtout(uid: number): void;
  addConsumable(defId: string): ConsumableInstance | null;

  setFlag(scope: 'hand' | 'table' | 'run', key: string, value: number): void;
  getFlag(scope: 'hand' | 'table' | 'run', key: string): number;

  /** Signale visuellement qu'un atout vient d'agir (hors marquage). */
  trigger(text: string): void;
  emit(event: GameEvent): void;
}

/** Résultat possible d'un crochet onBust : sauver le joueur en retirant une carte de sa main. */
export interface BustSave {
  discardCardId: number;
  text?: string;
}

/**
 * Crochets communs aux atouts et aux patrons. Tous optionnels.
 * Ordre d'appel : le patron d'abord, puis les atouts de gauche à droite.
 */
export interface Hooks {
  /** Modifie le brouillon de règles (muter `rules` directement). Doit être pur et idempotent. */
  modifyRules?(rules: Rules, self: AtoutInstance | null, state: Readonly<RunState>): void;
  onTableStart?(ctx: HookContext): void;
  /** Après la distribution initiale. */
  onHandStart?(ctx: HookContext): void;
  /** Après chaque carte reçue (distribution initiale comprise). */
  onCardDrawn?(ctx: HookContext, card: Card, who: 'player' | 'dealer'): void;
  /** Après une défausse volontaire du joueur. */
  onDiscard?(ctx: HookContext, card: Card): void;
  /** Le joueur vient de dépasser la limite. Le premier crochet qui renvoie un BustSave le sauve. */
  onBust?(ctx: HookContext): BustSave | void;
  /** Une carte « morte » ne marque rien et ne déclenche rien (elle compte toujours dans le total). */
  isCardDebuffed?(card: Card, state: Readonly<RunState>): boolean;
  /** Nombre de re-déclenchements supplémentaires d'une carte qui marque. */
  retriggers?(ctx: ScoringContext, card: Card): number;
  /** Pour chaque carte du joueur qui marque, de gauche à droite. */
  onCardScored?(ctx: ScoringContext, card: Card): ScoreEffects;
  /** Une fois par main, après toutes les cartes. */
  onHandScored?(ctx: ScoringContext): ScoreEffects;
  /**
   * Après le marquage ET aussi quand le joueur a crevé (outcome === 'bust', aucun marquage).
   * Sert aux compteurs (séries, boule de neige) et aux gains d'argent conditionnels.
   */
  onHandEnd?(ctx: HookContext, result: HandResult): void;
  /** Table gagnée, avant le calcul des gains. */
  onTableEnd?(ctx: HookContext): void;
  onShopEnter?(ctx: HookContext): void;
}

// ───────────────────────────── Définitions de contenu ─────────────────────────────

export type Rarity = 'commun' | 'peu-commun' | 'rare' | 'legendaire';

/**
 * Illustration procédurale : l'UI compose un emblème à partir de ces champs,
 * ce qui évite de dessiner un sprite par carte tout en gardant chaque carte reconnaissable.
 */
export interface EmblemArt {
  /** 1 à 3 caractères dessinés en grand (ex. '♥', '22', '×3', 'XV'). */
  glyph: string;
  pattern: 'rayures' | 'damier' | 'soleil' | 'losanges' | 'vagues' | 'points' | 'chevrons' | 'uni';
  /** Deux couleurs CSS : [fond, motif]. Choisir dans la palette du skill sabot-da. */
  colors: [string, string];
}

export interface AtoutDef {
  id: string;
  name: string;
  /** Texte de règle. Peut dépendre de l'état (ex. « Actuellement +12 Mult »). */
  description: string | ((self: AtoutInstance, state?: Readonly<RunState>) => string);
  rarity: Rarity;
  cost: number;
  art: EmblemArt;
  initialState?: () => Record<string, number>;
  hooks: Hooks;
  /** Condition d'apparition en boutique (consultée au tirage des offres). Absente = toujours. */
  canAppear?(state: Readonly<RunState>): boolean;
}

export interface ConsumableTargeting {
  /** Où le joueur choisit ses cibles. 'deck' = n'importe quelle carte de son sabot (vue du sabot). */
  zone: 'playerHand' | 'dealerHand' | 'deck';
  min: number;
  max: number;
}

export interface ConsumableDef {
  id: string;
  /** combine = tour de tricheur (tactique ou modification de cartes) ; faveur = monte une figure de niveau. */
  kind: 'combine' | 'faveur';
  name: string;
  description: string;
  cost: number;
  art: EmblemArt;
  /** Phases où l'objet est jouable. */
  usableIn: Phase[];
  targeting?: ConsumableTargeting;
  /** Condition supplémentaire (ex. « il faut une carte cachée »). */
  canUse?(state: Readonly<RunState>, rules: Readonly<Rules>): boolean;
  use(ctx: HookContext, targets: number[]): void;
  /** Condition d'apparition en boutique (ex. faveur du Triple Sept après l'avoir marqué une fois). */
  canAppear?(state: Readonly<RunState>): boolean;
}

export interface PrivilegeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  art: EmblemArt;
  /** Privilège requis avant de pouvoir apparaître (chaîne d'amélioration). */
  requires?: string;
  /** Premier salon où il peut être proposé. */
  minSalon?: number;
  /** Condition d'apparition (consultée au tirage du privilège du salon). */
  canAppear?(state: Readonly<RunState>): boolean;
  /** Modificateurs permanents ajoutés à runMods à l'achat. */
  mods?: RuleMod[];
  onBuy?(ctx: HookContext): void;
}

export interface BossDef {
  id: string;
  /** Nom du patron (ex. « La Pince »). */
  name: string;
  /** Sa règle, en une phrase lisible par le joueur. */
  description: string;
  /** Premier salon où il peut apparaître. */
  minSalon: number;
  /** Réservé au salon final. */
  finale?: boolean;
  art: EmblemArt;
  hooks: Hooks;
}

/** Sabot de départ, choisi au lancement de la partie (rejouabilité). */
export interface StartingDeckDef {
  id: string;
  name: string;
  description: string;
  art: EmblemArt;
  /**
   * Fonction pure : reçoit les 52 cartes standard (sans id) et renvoie le sabot de départ (au moins
   * une carte). Le moteur attribue les ids. Absente = les 52 cartes standard.
   */
  buildDeck?(standard: Omit<Card, 'id'>[]): Omit<Card, 'id'>[];
  /** Modificateurs permanents ajoutés à runMods au lancement (ex. une défausse de moins). */
  mods?: RuleMod[];
  /** Ajouté à balance.startingMoney (peut être négatif ; l'argent ne descend pas sous 0). */
  moneyDelta?: number;
  /** Au lancement, après le sabot, les mods et l'argent : donner un atout, une combine… */
  onStart?(ctx: HookContext): void;
}

/**
 * Récompense d'un pot-de-vin : le joueur saute une petite ou grande table (ni gain, ni boutique).
 * Tirée au début du salon, avec le patron, pour être affichée à l'avance.
 */
export interface SkipRewardDef {
  id: string;
  name: string;
  description: string;
  art: EmblemArt;
  /** Premier salon où elle peut être tirée. */
  minSalon?: number;
  /**
   * Appliquée quand le joueur saute la table, une fois la table SUIVANTE présentée (tableIntro) :
   * un addRuleMod('table', …) vise donc la table suivante.
   */
  grant(ctx: HookContext): void;
}

export interface BalanceConfig {
  salons: number;
  /** Objectif de base par salon (index 0 = salon 1). */
  salonBaseTargets: number[];
  /** Facteur d'objectif par type de table. */
  tableFactors: Record<TableKind, number>;
  /** Gain de base par type de table. */
  tableRewards: Record<TableKind, number>;
  startingMoney: number;
  /** $ gagnés par main non jouée quand la table est battue. */
  moneyPerUnusedHand: number;
  /** $1 d'intérêt par tranche de `interestStep` dollars possédés (plafonné par rules.interestCap). */
  interestStep: number;
  rerollBaseCost: number;
  rerollCostStep: number;
  shredBaseCost: number;
  shredCostStep: number;
  shredsPerShop: number;
  /** Fraction du prix récupérée à la revente. */
  sellRatio: number;
  /** Poids de tirage boutique. */
  rarityWeights: Record<Rarity, number>;
  offerKindWeights: Record<Exclude<OfferKind, 'privilege'>, number>;
  baseRules: BaseRules;
  /** Prix d'une carte à jouer améliorée en boutique. Défaut 4. */
  cardOfferCost?: number;
  /** La Déchiqueteuse refuse de descendre le sabot sous cette taille. Défaut 10. */
  minDeckSize?: number;
  /** Plafond dur de rules.playerLimit, appliqué après tous les modificateurs et crochets. */
  maxPlayerLimit?: number;
  /** Mode sans fin : facteur d'objectif par salon au-delà du dernier. Défaut 2. */
  endlessGrowth?: number;
}

/**
 * Mise (difficulté choisie au lancement). content.stakes est ordonné de la plus facile à la plus dure
 * et les mises sont CUMULATIVES : choisir la mise de rang n applique aussi toutes les précédentes.
 */
export interface StakeDef {
  id: string;
  name: string;
  description: string;
  art: EmblemArt;
  /** Modificateurs appliqués à toute la partie (après runMods, avant patron et atouts). */
  mods?: RuleMod[];
  /** Multiplie l'objectif de chaque table. */
  targetFactor?: number;
  /** Crochets actifs toute la partie (appelés avant le patron et les atouts ; self = null). */
  hooks?: Hooks;
  /** Au lancement, après le sabot de départ. */
  onStart?(ctx: HookContext): void;
}

/** Tout le contenu du jeu, assemblé par src/content/index.ts et injecté dans le moteur. */
export interface Content {
  figures: Record<FigureId, FigureDef>;
  enhancements: Record<EnhancementId, EnhancementDef>;
  atouts: AtoutDef[];
  consumables: ConsumableDef[];
  privileges: PrivilegeDef[];
  bosses: BossDef[];
  balance: BalanceConfig;
  /** Sabots de départ proposés à l'écran titre. Le premier est le sabot par défaut. */
  startingDecks?: StartingDeckDef[];
  /** Récompenses de pot-de-vin (action skipTable). Absentes = pas de pot-de-vin. */
  skipRewards?: SkipRewardDef[];
  /** Mises, de la plus facile à la plus dure (cumulatives). Absentes = pas de choix de mise. */
  stakes?: StakeDef[];
}

// ───────────────────────────── API du moteur ─────────────────────────────

export interface HandValue {
  total: number;
  /** Vrai si un As (ou une carte élastique) est encore compté à sa valeur haute. */
  soft: boolean;
  bust: boolean;
}

export interface FigurePreview {
  figure: FigureId;
  figures: FigureId[];
  level: number;
  chips: number;
  mult: number;
}

export interface DispatchResult {
  state: RunState;
  events: GameEvent[];
}

export interface NewRunOptions {
  /** StartingDeckDef.id. Défaut : le premier sabot de content.startingDecks (ou 52 cartes standard). */
  deckId?: string;
  /** StakeDef.id. Défaut : la première mise de content.stakes (ou aucune). */
  stakeId?: string;
}

export interface Engine {
  content: Content;
  /** Lève une erreur si options.deckId ne correspond à aucun sabot de départ. */
  newRun(seed?: string, options?: NewRunOptions): DispatchResult;
  /** Ne mute jamais `state`. Lève une erreur si l'action est illégale (voir legalActions). */
  dispatch(state: RunState, action: Action): DispatchResult;
  /** Types d'actions jouables maintenant (l'UI grise le reste). */
  legalActions(state: RunState): ActionType[];
  /** Pourquoi une action précise est refusée, ou null si elle est légale. Texte affichable. */
  whyIllegal(state: RunState, action: Action): string | null;
  getRules(state: RunState): Rules;
  handValue(cards: readonly Card[], limit: number): HandValue;
  /** Figure que la main actuelle marquerait si le joueur restait maintenant. */
  previewFigure(state: RunState): FigurePreview | null;
  /** Carte au sommet du sabot si le joueur a le droit de la voir (seeNextCard ou carte marquée). */
  visibleNextCard(state: RunState): Card | null;
  /** Vrai si la carte est neutralisée par le patron en cours. */
  isDebuffed(state: RunState, card: Card): boolean;
  /** Valeur de revente d'un atout / consommable. */
  sellValue(state: RunState, uid: number): number;
  serialize(state: RunState): string;
  deserialize(json: string): RunState | null;
}

/** Signature attendue de src/engine/index.ts. */
export type CreateEngine = (content: Content) => Engine;
