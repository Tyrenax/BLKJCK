/**
 * Index du contenu par id, construit une fois par createEngine. Le contenu est lu à ce moment-là :
 * pour changer l'équilibrage, recréer un moteur.
 */
import { FIGURE_IDS, sortFigures } from './figures';
import type {
  AtoutDef,
  BossDef,
  ConsumableDef,
  Content,
  FigureId,
  PrivilegeDef,
  Rules,
  SkipRewardDef,
  StakeDef,
  StartingDeckDef,
} from './types';

export interface Registry {
  content: Content;
  atouts: Map<string, AtoutDef>;
  consumables: Map<string, ConsumableDef>;
  privileges: Map<string, PrivilegeDef>;
  bosses: Map<string, BossDef>;
  startingDecks: Map<string, StartingDeckDef>;
  skipRewards: Map<string, SkipRewardDef>;
  stakes: Map<string, StakeDef>;
  /** Figures par priorité décroissante. */
  figureOrder: FigureId[];
  /** balance.baseRules complétées par les défauts du moteur (calculé une fois). */
  baseRules: Rules;
}

function index<T extends { id: string }>(kind: string, items: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) {
    if (m.has(it.id)) throw new Error(`Contenu : ${kind} « ${it.id} » défini deux fois`);
    m.set(it.id, it);
  }
  return m;
}

export function buildRegistry(content: Content): Registry {
  return {
    content,
    atouts: index('atout', content.atouts),
    consumables: index('consommable', content.consumables),
    privileges: index('privilège', content.privileges),
    bosses: index('patron', content.bosses),
    startingDecks: index('sabot de départ', content.startingDecks ?? []),
    skipRewards: index('pot-de-vin', content.skipRewards ?? []),
    stakes: index('mise', content.stakes ?? []),
    figureOrder: sortFigures(content, [...FIGURE_IDS]),
    baseRules: {
      hidePlayerFirstCard: false,
      dealerExtraDraws: 0,
      freeRerollsPerShop: 0,
      rerollDiscount: 0,
      shredsPerShop: content.balance.shredsPerShop,
      discardAfterBust: false,
      shopPriceAdd: 0,
      bossSalonAdvance: 0,
      ...content.balance.baseRules,
    },
  };
}
