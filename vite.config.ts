import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Garde-fou : le faux moteur de développement, les scénarios, le robot de démo et le contenu de
 * test du moteur ne doivent jamais finir dans le livrable. Chaque marqueur est une chaîne propre
 * à ce code-là (les chaînes survivent à la minification). Le build échoue sinon.
 */
const DEV_ONLY_MARKERS: [string, string][] = [
  ['La carte cachée du croupier est visible.', 'faux contenu (src/ui/dev/fakeContent.ts)'],
  ['"marquage"', 'faux moteur (src/ui/dev/fakeEngine.ts)'],
  ["'marquage'", 'faux moteur (src/ui/dev/fakeEngine.ts)'],
  ['NUITBLANCHE', 'parties de démo (src/ui/ext/demo.ts)'],
  ['"t-tricheur"', 'contenu de test du moteur (src/engine/testing)'],
];

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Livrable : un seul fichier `dist/sabot.html`, jouable d'un double-clic, hors ligne, sans serveur.
 * Le JS (un seul module, imports dynamiques compris), le CSS et les polices (data: URL) sont mis
 * en ligne dans le HTML. Un module inline n'est soumis à aucune règle CORS : il marche en file://.
 */
function singleFile(): Plugin {
  return {
    name: 'sabot-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') return this.error('index.html introuvable dans le bundle');
      let html = String(page.source);
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          const tag = new RegExp(`<script type="module"[^>]*src="[^"]*${escapeRe(item.fileName)}"[^>]*></script>`);
          // « </script » dans le code fermerait la balise : on l'échappe
          const code = item.code.replace(/<\/script/gi, '<\\/script');
          if (tag.test(html)) html = html.replace(tag, () => `<script type="module">${code}</script>`);
          else if (item.isEntry) return this.error(`balise du module ${item.fileName} introuvable`);
          else return this.error(`morceau JS séparé ${item.fileName} : tout doit tenir dans un seul module`);
        } else if (name.endsWith('.css')) {
          const css = String(item.source);
          const link = new RegExp(`<link rel="stylesheet"[^>]*href="[^"]*${escapeRe(name)}"[^>]*>`);
          html = html.replace(link, () => `<style>${css}</style>`);
        }
      }
      // contrôles du livrable
      const leaks = [...new Set(DEV_ONLY_MARKERS.filter(([m]) => html.includes(m)).map(([, what]) => what))];
      if (leaks.length) return this.error(`code de développement dans le livrable : ${leaks.join(', ')}`);
      if (/\b(src|href)="(\.?\/)?assets\//.test(html)) return this.error('le livrable référence encore des fichiers externes');
      for (const name of Object.keys(bundle)) delete bundle[name];
      this.emitFile({ type: 'asset', fileName: 'sabot.html', source: html });
      const kb = Math.round(new TextEncoder().encode(html).length / 1024);
      console.log(`\n  dist/sabot.html : ${kb} Ko, fichier unique, sans code de développement.\n`);
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false },
  build: {
    target: 'es2022',
    // tout en ligne : polices et images en data: URL, un seul CSS, un seul module
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
  plugins: [singleFile()],
  test: { include: ['src/**/*.test.ts', 'tools/**/*.test.ts'], environment: 'node' },
});
