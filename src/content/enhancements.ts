import type { EnhancementDef, EnhancementId } from '../engine/types';

/** Textes des améliorations de carte. La sémantique est implémentée par le moteur (types.ts). */
export const enhancements: Record<EnhancementId, EnhancementDef> = {
  plombee: { id: 'plombee', name: 'Plombée', description: '+30 Jetons quand elle marque.' },
  ardente: { id: 'ardente', name: 'Ardente', description: '+4 Mult quand elle marque.' },
  cristal: {
    id: 'cristal',
    name: 'Cristal',
    description: '×2 Mult quand elle marque ; casse 1 fois sur 4 après la main.',
  },
  doree: { id: 'doree', name: 'Dorée', description: '+2 $ quand elle marque sur une main gagnée.' },
  marquee: {
    id: 'marquee',
    name: 'Marquée',
    description: 'Tu la vois avant de la tirer.',
  },
  fantome: {
    id: 'fantome',
    name: 'Fantôme',
    description: 'Compte 0 dans ton total, mais marque quand même ses Jetons.',
  },
  elastique: {
    id: 'elastique',
    name: 'Élastique',
    description: 'Vaut sa valeur ou 3 de moins, au mieux.',
  },
  arlequin: {
    id: 'arlequin',
    name: 'Arlequin',
    description: "Porte les 4 enseignes et échappe aux patrons d'enseigne.",
  },
};
