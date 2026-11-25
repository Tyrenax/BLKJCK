import type { BalanceConfig, BaseRules } from '../engine/types';

/** Règles de départ d'une main (DESIGN §2). Les atouts et patrons les tordent. */
export const baseRules: BaseRules = {
  playerLimit: 21,
  dealerLimit: 21,
  dealerStandOn: 17,
  handsPerTable: 5,
  discardsPerTable: 2,
  charlieSize: 4,
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
  /** La défausse sculpte la main AVANT de crever ; elle ne rattrape plus un crevé (sauf Harnais). */
  discardAfterBust: false,
};

/**
 * Économie et difficulté. PROVISOIRE (2026-11-24) — salons 6–8 non mesurés.
 * Salon 1 sans achat à 95 / 85 / 75 %, salons 2–5 calés par `npm run sim -- --exp calage-salons`
 * (90 % de passage du robot malin par salon), salons 6–8 extrapolés à ×1,8 en attendant la fin du calage.
 */
export const balance: BalanceConfig = {
  salons: 8,
  salonBaseTargets: [160, 225, 480, 680, 1250, 2250, 4050, 7300],
  tableFactors: { petite: 1, grande: 1.43, patron: 1.67 },
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
  offerKindWeights: { atout: 60, combine: 22, faveur: 12, card: 6 },
  baseRules,
  cardOfferCost: 4,
  minDeckSize: 20,
  /** Un total au-dessus de 21 bat toujours le croupier : chaque point de limite est une zone gagnée. */
  maxPlayerLimit: 23,
};
