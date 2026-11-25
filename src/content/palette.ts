/**
 * Couleurs des emblèmes (EmblemArt.colors = [fond, motif]), sous forme de NOMS de la palette
 * du skill sabot-da : l'UI (bjck-d4) les résout en variables CSS (--prune, --petrole-clair…).
 *
 * Menthe, Braise et Laiton sont des couleurs de sens (Jetons, Mult, argent) : jamais dans un emblème.
 * Le glyphe est dessiné en Ivoire cerné de Nuit par l'UI ; le fond peut être sombre ou moyen.
 * Repère utilisé ici : motif chaud (cerise, bordeaux clair) pour ce qui donne du Mult, froid
 * (pétrole clair / pâle) pour les Jetons, prune clair pour l'argent, ivoire / encre pâle / cendre
 * pour ce qui change une règle.
 */
export const P = {
  nuit: 'nuit',
  prune: 'prune',
  pruneSombre: 'prune-sombre',
  pruneClair: 'prune-clair',
  bordeaux: 'bordeaux',
  bordeauxSombre: 'bordeaux-sombre',
  bordeauxClair: 'bordeaux-clair',
  petrole: 'petrole',
  petroleSombre: 'petrole-sombre',
  petroleClair: 'petrole-clair',
  petrolePale: 'petrole-pale',
  encre: 'encre',
  encrePale: 'encre-pale',
  ivoire: 'ivoire',
  cerise: 'cerise',
  cendre: 'cendre',
} as const;

/** Noms acceptés par l'UI pour les emblèmes. */
export const EMBLEM_COLORS: readonly string[] = Object.values(P);

/** Caractères que l'UI sait dessiner net (Jersey 20, Latin-1) + les quatre enseignes. */
export function isDrawableGlyphChar(ch: string): boolean {
  if ('♠♥♦♣'.includes(ch)) return true;
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
}
