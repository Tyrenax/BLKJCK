/**
 * Accès à la palette depuis le code (canvas, shader). Les valeurs viennent de tokens.css :
 * aucun hex n'est écrit en dur ailleurs.
 */
export type ColorName =
  | 'nuit' | 'prune' | 'bordeaux' | 'petrole' | 'petrole-clair' | 'ivoire' | 'encre' | 'cerise'
  | 'menthe' | 'braise' | 'laiton' | 'cendre'
  | 'nuit-clair' | 'prune-sombre' | 'prune-clair' | 'bordeaux-sombre' | 'bordeaux-clair'
  | 'petrole-sombre' | 'petrole-pale' | 'petrole-glace' | 'ivoire-sombre' | 'ivoire-ombre' | 'encre-pale'
  | 'cerise-sombre' | 'cerise-pale' | 'menthe-sombre' | 'menthe-nuit' | 'braise-sombre'
  | 'braise-clair' | 'laiton-sombre' | 'laiton-clair' | 'laiton-nuit' | 'cendre-sombre'
  | 'cendre-clair' | 'plomb' | 'plomb-clair';

const cache = new Map<string, string>();

/** Couleur CSS calculée d'un jeton de palette (« #rrggbb »). */
export function col(name: ColorName): string {
  let v = cache.get(name);
  if (!v) {
    v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || '#ff00ff';
    cache.set(name, v);
  }
  return v;
}

/**
 * Résout une couleur venant du contenu (EmblemArt.colors) : un nom de palette (« prune »),
 * une variable (« --prune », « var(--prune) ») ou toute couleur CSS valide.
 */
export function resolveColor(c: string): string {
  const s = c.trim();
  const m = /^var\(\s*--([\w-]+)\s*\)$/.exec(s) ?? /^--([\w-]+)$/.exec(s);
  if (m) return col(m[1] as ColorName);
  if (/^[a-z][a-z-]*$/.test(s)) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--${s}`).trim();
    if (v) return v;
  }
  return s;
}

/** [r, g, b] dans [0, 1] pour le shader. */
export function rgb01(name: ColorName): [number, number, number] {
  const hex = col(name).replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map((h) => h + h).join('') : hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
