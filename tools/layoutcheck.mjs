#!/usr/bin/env node
/**
 * Contrôle de mise en page de SABOT sur le fichier livré : dist/sabot.html ouvert en file://,
 * dans Edge sans tête piloté par le protocole DevTools. Aucune dépendance, aucun serveur.
 * Écrit par bjck-5a à la demande de bjck-41, rejouable après chaque build.
 *
 * Le pilote joue de vraies parties (sabots et mises variés, achats, pots-de-vin, combines, défausses)
 * et ouvre en chemin le Carnet, la vue du sabot, les réglages, le menu d'un objet, les infobulles de
 * chaque objet possédé, de chaque offre de boutique et du décor de la table. Il passe aussi par le
 * titre, le lancement (chaque sabot, chaque mise) et la collection (chaque onglet, chaque page).
 *
 * À chaque état stable (animations finies, mise en page immobile), il mesure dans la page, sans rien
 * supposer du code de l'interface (seule la scène `.stage` sert de repère) :
 *   recouvrement   un texte caché en partie ou en entier par un autre texte, un bouton ou un aplat,
 *                  ni parent ni enfant (échantillonnage des glyphes avec elementsFromPoint)
 *   sur-bouton     un texte posé par-dessus un bouton qui n'est pas le sien
 *   boutons        deux boutons qui se chevauchent
 *   deborde-boite  un texte qui sort de sa propre boîte
 *   deborde-cadre  un texte ou un bouton qui sort du cadre (fond, bordure) qui le contient
 *   rogne          un texte coupé par un conteneur qui masque son débordement
 *   hors-scene     un texte ou un bouton qui sort de la scène 1280×720
 *   tronque        un texte coupé par des points de suspension CSS ou une limite de lignes
 *   suspension     un texte qui contient « … » ou « ... » : interdit partout, sans exception
 *
 * usage : node tools/layoutcheck.mjs [--html dist/sabot.html] [--out tools/reports/layout]
 *           [--seeds 20] [--from 0] [--no-menus] [--sizes 1280x720,1920x1080] [--steps 600] [--port 9339]
 *           [--verbose] [--probe]
 * Machine juste en mémoire : la passe peut se faire en morceaux, par exemple
 *   --sizes 1280x720 --from 0 --seeds 3   puis   --from 3 --seeds 3 --no-menus   …
 * Sortie : <out>/rapport.md, <out>/cas.json et une capture rognée par cas (<out>/captures/).
 * Code de sortie : 0 si aucun cas, 1 sinon, 2 si le pilote a planté.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ───────────── Exceptions : recouvrements voulus (liste courte, explicite) ─────────────
/**
 * Calques flottants : posés par-dessus le reste exprès. Ce qu'ils recouvrent n'est pas signalé ;
 * leur propre texte est contrôlé comme les autres (débordement, rognage, sortie de scène).
 */
const FLOATING = [
  ['.tooltip', 'infobulle'],
  ['.verdict', 'tampon de verdict sur le tapis'],
  ['.pop', 'nombres et messages qui jaillissent puis s’effacent'],
  ['.hint, .hint-string, .hint-knot', 'notes d’aide épinglées de la première partie'],
  ['.crt', 'voile cathodique (balayage, vignette) sur toute la scène'],
];
/** Recouvrements voulus entre deux éléments précis : [sélecteur du texte caché, sélecteur de ce qui le cache, raison]. */
const PAIRS = [
  ['.discard-lab', '.discard canvas, .discard .sprite', 'l’étiquette « défausse » disparaît sous la pile'],
];
/** Les cartes peuvent se chevaucher entre elles (éventail) : elles ne portent pas de texte DOM, rien à exclure. */

// ───────────── Arguments ─────────────
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const HTML = resolve(arg('html', 'dist/sabot.html'));
const OUT = resolve(arg('out', 'tools/reports/layout'));
const SEEDS = Number(arg('seeds', '20'));
/** Première graine (0 = MEP01) : permet de faire la passe en plusieurs morceaux courts. */
const FROM = Number(arg('from', '0'));
const MENUS = !argv.includes('--no-menus');
const SIZES = arg('sizes', '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number));
const MAX_STEPS = Number(arg('steps', '600'));
const PORT = Number(arg('port', '9339'));
const EDGE = [process.env.EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => p && existsSync(p));
if (!existsSync(HTML)) {
  console.error(`introuvable : ${HTML} (lance d'abord npm run build)`);
  process.exit(2);
}
if (!EDGE) {
  console.error('Edge introuvable (variable EDGE pour donner son chemin)');
  process.exit(2);
}

// ───────────── Code injecté dans la page ─────────────
/* global window, document, getComputedStyle, performance, requestAnimationFrame */
function pageLib(FLOAT_SEL, PAIRS_SEL) {
  if (window.__lc) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const stage = () => document.querySelector('.stage');
  let G = { L: 0, T: 0, k: 1 };
  let C = null;
  const geom = () => {
    const r = stage().getBoundingClientRect();
    G = { L: r.left, T: r.top, k: r.width / 1280 };
    return G;
  };
  const toS = (r) => ({ x: (r.left - G.L) / G.k, y: (r.top - G.T) / G.k, w: r.width / G.k, h: r.height / G.k });
  const box = (e) => toS(e.getBoundingClientRect());
  const rnd = (r) => r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  const union = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  const inter = (a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x;
    const h = Math.min(a.y + a.h, b.y + b.h) - y;
    return w > 0.5 && h > 0.5 ? { x, y, w, h } : null;
  };

  // caches d'une mesure
  const css = (e) => {
    let c = C.cs.get(e);
    if (!c) C.cs.set(e, (c = getComputedStyle(e)));
    return c;
  };
  const opac = (e) => {
    if (C.op.has(e)) return C.op.get(e);
    const p = e.parentElement;
    const v = parseFloat(css(e).opacity) * (p && p !== document.documentElement ? opac(p) : 1);
    C.op.set(e, v);
    return v;
  };
  const shown = (e) => e.getClientRects().length > 0 && css(e).visibility === 'visible' && opac(e) >= 0.05;
  const isFloat = (e) => !!e.closest(FLOAT_SEL);
  const ctl = (e) => e.closest('button, input, select, textarea, [role="button"], a[href]');
  const ownText = (e) => {
    if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') return (e.value || e.placeholder || '').trim();
    let t = '';
    for (const n of e.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.replace(/\s+/g, ' ').trim();
  };
  const glyphs = (e) => {
    let g = C.gl.get(e);
    if (g) return g;
    g = [];
    if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') {
      if (ownText(e)) g.push(box(e));
    } else {
      for (const n of e.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) g.push(toS(r));
      }
    }
    C.gl.set(e, g);
    return g;
  };
  const alpha = (col) => {
    if (!col || col === 'transparent') return 0;
    const slash = col.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) return slash[2] ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
    const p = col.match(/rgba?\(([^)]+)\)/);
    if (p) {
      const parts = p[1].split(/[\s,]+/).filter(Boolean);
      return parts.length >= 4 ? parseFloat(parts[3]) : 1;
    }
    return 1;
  };
  /** Ce que l'élément peint lui-même sur toute sa boîte : 'cadre', 'fond', 'image', 'canvas' ou null. */
  const surface = (e) => {
    if (C.sf.has(e)) return C.sf.get(e);
    let s = null;
    const tag = e.tagName;
    if (tag === 'IMG' || tag === 'VIDEO' || e.namespaceURI === 'http://www.w3.org/2000/svg') s = 'image';
    else if (tag === 'CANVAS') s = 'canvas';
    else {
      const c = css(e);
      if (c.borderImageSource && c.borderImageSource !== 'none') s = 'cadre';
      else if (c.backgroundImage !== 'none' || alpha(c.backgroundColor) >= 0.35) s = 'fond';
    }
    C.sf.set(e, s);
    return s;
  };
  const canvasInk = (cv, vx, vy) => {
    try {
      const g = cv.getContext('2d');
      if (!g) return false; // WebGL : fond animé
      const r = cv.getBoundingClientRect();
      const px = Math.floor(((vx - r.left) / r.width) * cv.width);
      const py = Math.floor(((vy - r.top) / r.height) * cv.height);
      if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) return false;
      return g.getImageData(px, py, 1, 1).data[3] > 200; // l'ombre portée d'une carte ne cache pas
    } catch {
      return true;
    }
  };
  /** A peint-il quelque chose d'opaque au point (x, y) de la scène ? Renvoie la nature, ou null. */
  const paints = (A, x, y, vx, vy) => {
    const s = surface(A);
    if (s === 'canvas') return canvasInk(A, vx, vy) ? 'image' : null;
    if (s) return s;
    for (const r of glyphs(A)) if (x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5) return 'texte';
    return null;
  };
  const FULL = (r) => r.w >= 1216 && r.h >= 684;
  /** Calque : le plus proche ancêtre (ou soi) qui couvre toute la scène. */
  const layerOf = (e) => {
    if (C.ly.has(e)) return C.ly.get(e);
    let L = stage();
    for (let n = e; n && n !== stage(); n = n.parentElement) {
      if (FULL(box(n))) {
        L = n;
        break;
      }
    }
    C.ly.set(e, L);
    return L;
  };
  /** Composant : l'enfant du calque qui contient l'élément (un panneau, une carte, un bloc du décor). */
  const compOf = (e) => {
    const L = layerOf(e);
    let n = e;
    while (n.parentElement && n.parentElement !== L && n !== L) n = n.parentElement;
    return n;
  };
  /**
   * A (qui peint un aplat) est-il un panneau d'un autre calque posé sur T ? Un écran, le Carnet, les
   * réglages, le voile de fin : oui (voulu). Une carte ou un objet d'un autre calque : non (signalé).
   */
  const isModal = (A, T) => {
    if (layerOf(A) === layerOf(T)) return false;
    if (FULL(box(A))) return true;
    const cb = box(compOf(A));
    return cb.w * cb.h >= 0.08 * 1280 * 720;
  };
  /** Le composant est-il au moins en partie sur la scène ? (sinon : panneau rangé hors champ, invisible) */
  const onStage = (e) => !!inter(box(compOf(e)), { x: 0, y: 0, w: 1280, h: 720 });
  const pathOf = (e) => {
    const parts = [];
    const st = stage();
    for (let n = e; n && n !== st; n = n.parentElement) {
      const c = (n.getAttribute('class') || '').trim().split(/\s+/).filter((x) => x && !/^(on|off|now|hidden|abs|t-num|t-body|t-gothic|shadow|clickable)$/.test(x));
      parts.unshift(n.tagName.toLowerCase() + (c.length ? `.${c.slice(0, 2).join('.')}` : ''));
    }
    return parts.filter((p) => !/^div\.(layer|world)/.test(p)).slice(-5).join(' > ');
  };
  const info = (e) => ({
    path: pathOf(e),
    text: (e.tagName === 'INPUT' ? e.value || e.placeholder : e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110),
    rect: rnd(box(e)),
  });
  const pairExcluded = (T, A) => PAIRS_SEL.some(([t, a]) => T.matches(t) && (A.matches(a) || !!A.closest(a)));
  /** Boîte de rognage (padding box) d'un conteneur, en unités de scène. */
  const clipBox = (P) => {
    const b = box(P);
    const c = css(P);
    const bl = parseFloat(c.borderLeftWidth) || 0;
    const bt = parseFloat(c.borderTopWidth) || 0;
    const br = parseFloat(c.borderRightWidth) || 0;
    const bb = parseFloat(c.borderBottomWidth) || 0;
    return { x: b.x + bl, y: b.y + bt, w: b.w - bl - br, h: b.h - bt - bb };
  };
  /** Une ligne de texte R sort-elle de la boîte B ? (1 px de marge en largeur ; le milieu de ligne en hauteur) */
  const outside = (R, B) => R.x < B.x - 1 || R.x + R.w > B.x + B.w + 1 || R.y + R.h / 2 < B.y || R.y + R.h / 2 > B.y + B.h;
  const clips = (c) => c.overflowX !== 'visible' || c.overflowY !== 'visible';
  /** Coupe volontairement son texte (points de suspension, limite de lignes) : signalé en « tronque ». */
  const truncates = (c) => c.textOverflow === 'ellipsis' || ((c.webkitLineClamp || 'none') !== 'none');

  function measure() {
    geom();
    C = { cs: new Map(), op: new Map(), gl: new Map(), sf: new Map(), ly: new Map() };
    const st = stage();
    const STAGE = { x: 0, y: 0, w: 1280, h: 720 };
    const issues = [];
    const seen = new Set();
    const add = (kind, a, b, zone, detail) => {
      const key = `${kind}|${pathOf(a)}|${b ? pathOf(b) : ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ kind, a: info(a), b: b ? info(b) : null, zone: rnd(zone), detail });
    };
    const force = document.createElement('style');
    force.textContent = '*{pointer-events:auto!important}';
    document.head.appendChild(force);
    let texts = [];
    try {
      const all = [...st.querySelectorAll('*')];
      texts = all.filter((e) => ownText(e) && shown(e));
      const controls = all.filter((e) => e.matches('button, input, select, textarea, [role="button"]') && shown(e));

      for (const T of texts) {
        const rects = glyphs(T);
        if (!rects.length) continue;
        const tFloat = isFloat(T);
        const tc = css(T);

        // 1. recouvrements (au-dessus du texte) et texte posé sur un bouton (en dessous)
        let n = 0;
        let hidden = 0;
        const over = new Map();
        const under = new Map();
        for (const R of rects) {
          const nx = Math.max(3, Math.min(30, Math.round(R.w / 5)));
          const ys = R.h > 14 ? [0.3, 0.5, 0.7] : [0.5];
          for (let ix = 0; ix < nx; ix++) {
            const x = R.x + 1.5 + Math.max(0, R.w - 3) * (ix / (nx - 1));
            for (const fy of ys) {
              const y = R.y + R.h * fy;
              if (x < 0 || y < 0 || x > 1280 || y > 720) continue;
              const vx = G.L + x * G.k;
              const vy = G.T + y * G.k;
              const stack = document.elementsFromPoint(vx, vy);
              const i = stack.indexOf(T);
              if (i < 0) continue; // masqué par un conteneur : voir « rogne »
              // un panneau d'un autre calque (écran, Carnet, réglages, voile) posé dessus : point caché, voulu
              let modal = false;
              for (let j = 0; j < i && !modal; j++) {
                const A = stack[j];
                if (A.contains(T) || (!tFloat && isFloat(A)) || opac(A) < 0.05) continue;
                if (surface(A) && surface(A) !== 'canvas' && isModal(A, T)) modal = true;
              }
              if (modal) {
                hidden++;
                continue;
              }
              n++;
              for (let j = 0; j < i; j++) {
                const A = stack[j];
                if (A.contains(T) || T.contains(A)) continue;
                if (!tFloat && isFloat(A)) continue;
                if (opac(A) < 0.05) continue;
                const kind = paints(A, x, y, vx, vy);
                if (!kind) continue;
                const owner = ctl(A) || A;
                const h = over.get(owner) ?? { count: 0, zone: null, kind: ctl(A) ? 'bouton' : kind, A };
                h.count++;
                h.zone = union(h.zone, { x: x - 2, y: R.y, w: 4, h: R.h });
                over.set(owner, h);
                break;
              }
              for (let j = i + 1; j < stack.length; j++) {
                const B = stack[j];
                if (B.contains(T)) {
                  if (surface(B) && surface(B) !== 'canvas') break; // le texte est peint sur le fond de son cadre
                  continue;
                }
                const c = ctl(B);
                if (c && !c.contains(T) && !(tFloat && !isFloat(c))) {
                  const h = under.get(c) ?? { count: 0, zone: null };
                  h.count++;
                  h.zone = union(h.zone, { x: x - 2, y: R.y, w: 4, h: R.h });
                  under.set(c, h);
                  break;
                }
                if (surface(B)) break;
              }
            }
          }
        }
        for (const [owner, h] of over) {
          if (pairExcluded(T, h.A) || pairExcluded(T, owner)) continue;
          const frac = h.count / Math.max(1, n);
          const ob = box(owner);
          const zone = union(union(h.zone, rects.reduce((u, R) => union(u, R), null)), ob.w * ob.h < 90000 ? ob : null);
          add('recouvrement', T, owner, zone, `${Math.round(frac * 100)} % du texte visible caché (${h.kind})`);
        }
        for (const [c, h] of under) add('sur-bouton', T, c, union(union(h.zone, box(c)), rects.reduce((u, R) => union(u, R), null)), `texte posé sur le bouton (${h.count} points)`);

        // 2. le texte sort de sa propre boîte (ou y est rogné)
        if (tc.display !== 'inline' && tc.display !== 'contents' && T.tagName !== 'INPUT') {
          const B = box(T);
          if (B.w >= 2 && B.h >= 2) {
            const bad = rects.filter((R) => outside(R, B));
            if (bad.length) {
              const z = bad.reduce((u, R) => union(u, R), null);
              if (clips(tc)) {
                if (!truncates(tc)) add('rogne', T, null, union(z, B), `texte coupé par sa propre boîte (${bad.length}/${rects.length} lignes)`);
              }
              else add('deborde-boite', T, null, union(z, B), `texte hors de sa boîte (${bad.length}/${rects.length} lignes, boîte ${Math.round(B.w)}×${Math.round(B.h)})`);
            }
          }
        }

        // 3. rogné par un ancêtre qui masque son débordement ; sorti du cadre qui le contient
        let framed = false;
        const comp = compOf(T);
        for (let P = T.parentElement; P && P !== st; P = P.parentElement) {
          const pc = css(P);
          if (clips(pc) && !truncates(pc)) {
            const K = clipBox(P);
            const bad = rects.filter((R) => outside(R, K));
            if (bad.length) {
              add('rogne', T, P, union(bad.reduce((u, R) => union(u, R), null), K), `${bad.length}/${rects.length} lignes coupées par le conteneur`);
              break;
            }
          }
          if (!framed && (surface(P) === 'cadre' || surface(P) === 'fond') && !FULL(box(P))) {
            framed = true;
            const K = box(P);
            const bad = rects.filter((R) => outside(R, K));
            if (bad.length) add('deborde-cadre', T, P, union(bad.reduce((u, R) => union(u, R), null), K), `${bad.length}/${rects.length} lignes hors du cadre`);
          }
          if (P === comp) break;
        }

        // 4. hors de la scène
        const off = rects.filter((R) => outside(R, STAGE));
        if (off.length && onStage(T)) add('hors-scene', T, null, off.reduce((u, R) => union(u, R), null), `${off.length}/${rects.length} lignes hors de la scène`);

        // 5. points de suspension écrits dans le texte (coupé par le code) : interdits, sans exception
        if (/…|\.\.\./.test(ownText(T))) add('suspension', T, null, box(T), 'texte avec « … »');
      }

      // 6. tronqué par la feuille de style (points de suspension, limite de lignes)
      for (const e of all) {
        if (!e.textContent.trim() || !shown(e)) continue;
        const c = css(e);
        if (c.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) add('tronque', e, null, box(e), 'coupé par des points de suspension CSS');
        const clamp = c.webkitLineClamp || 'none';
        if (clamp !== 'none' && e.scrollHeight > e.clientHeight + 1) add('tronque', e, null, box(e), `coupé après ${clamp} lignes`);
      }

      // 7. boutons : chevauchements, sortie de cadre, sortie de scène
      for (let i = 0; i < controls.length; i++) {
        const a = controls[i];
        const ra = box(a);
        if ((ra.x < -1 || ra.x + ra.w > 1281 || ra.y < -1 || ra.y + ra.h > 721) && onStage(a)) add('hors-scene', a, null, ra, 'bouton hors de la scène');
        for (let j = i + 1; j < controls.length; j++) {
          const b = controls[j];
          if (a.contains(b) || b.contains(a) || layerOf(a) !== layerOf(b)) continue;
          if (isFloat(a) !== isFloat(b)) continue;
          const z = inter(ra, box(b));
          if (z && z.w * z.h > 4) add('boutons', a, b, z, `${Math.round(z.w)}×${Math.round(z.h)} px en commun`);
        }
        for (let P = a.parentElement; P && P !== st; P = P.parentElement) {
          if ((surface(P) === 'cadre' || surface(P) === 'fond') && !FULL(box(P))) {
            const K = box(P);
            if (ra.x < K.x - 2 || ra.y < K.y - 2 || ra.x + ra.w > K.x + K.w + 2 || ra.y + ra.h > K.y + K.h + 2) add('deborde-cadre', a, P, union(ra, K), 'bouton hors du cadre');
            break;
          }
        }
      }
    } finally {
      force.remove();
    }
    return { issues, texts: texts.length, geom: G };
  }

  /** Signature de la mise en page (hors calques flottants) : sert à attendre la fin des animations. */
  function signature() {
    geom();
    let s = '';
    for (const e of stage().querySelectorAll('*')) {
      if (e.closest(FLOAT_SEL)) continue;
      const r = e.getBoundingClientRect();
      s += `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0};`;
    }
    for (const L of stage().querySelectorAll('.stage > * > *, .stage > *')) s += getComputedStyle(L).opacity;
    return s;
  }

  async function settle(max = 2500) {
    const t0 = performance.now();
    while (window.sabot?.busy && performance.now() - t0 < 30000) await sleep(25);
    let prev = '';
    let same = 0;
    while (performance.now() - t0 < max) {
      await frame();
      const sig = signature();
      if (sig === prev) {
        if (++same >= 2) return true;
      } else {
        same = 0;
        prev = sig;
      }
      await sleep(50);
    }
    return false;
  }

  /** Centres (unités de scène) des éléments visibles qui répondent au sélecteur. */
  function centers(sel) {
    geom();
    C = { cs: new Map(), op: new Map(), gl: new Map(), sf: new Map(), ly: new Map() };
    return [...stage().querySelectorAll(sel)]
      .filter((e) => shown(e))
      .map((e) => {
        const b = box(e);
        return { x: b.x + b.w / 2, y: b.y + b.h / 2, label: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
      })
      .filter((p) => p.x > 0 && p.y > 0 && p.x < 1280 && p.y < 720);
  }

  // ───── pilotage (vrai moteur, mêmes appels que les clics) ─────
  let seedNum = 1;
  const rand = () => {
    seedNum = (Math.imul(seedNum, 1103515245) + 12345) >>> 0;
    return (seedNum >>> 8) / 16777216;
  };
  const memo = { rerolled: new Set(), endless: false };
  const g = () => window.sabot;

  async function start(seed, opts) {
    seedNum = [...seed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
    memo.rerolled.clear();
    memo.endless = false;
    const game = g();
    game.turbo = true;
    await game.newRun(seed, opts);
    while (game.busy) await sleep(20);
  }

  async function act(a) {
    const game = g();
    game.turbo = true;
    if (game.mode !== 'normal') game.cancelMode();
    const ok = await game.act(a);
    while (game.busy) await sleep(20);
    return ok;
  }

  function summary() {
    const game = g();
    const s = game.state;
    if (!s) return null;
    return {
      phase: s.phase,
      salon: s.salon,
      tableIndex: s.tableIndex,
      kind: s.table?.kind ?? null,
      money: s.money,
      endless: !!s.endless,
      atouts: s.atouts.map((a) => a.uid),
      consumables: s.consumables.map((c) => c.uid),
      legal: game.engine.legalActions(s),
      shopKey: s.shop ? `${s.salon}-${s.tableIndex}-${s.shop.rerollsPaid ?? 0}-${s.shop.freeRerollsLeft ?? 0}` : null,
    };
  }

  const PRIORITY = { atout: 0, privilege: 1, combine: 2, faveur: 3, card: 4 };
  function decide() {
    const game = g();
    const e = game.engine;
    const s = game.state;
    if (!s) return null;
    const acts = e.enumerateActions(s);
    const of = (t) => acts.filter((a) => a.type === t);
    const one = (t) => of(t)[0] ?? null;
    const uses = of('useConsumable');
    switch (s.phase) {
      case 'tableIntro':
        if (uses.length && rand() < 0.3) return uses[Math.floor(rand() * uses.length)];
        if (one('skipTable') && rand() < 0.45) return one('skipTable');
        return one('startTable');
      case 'playerTurn': {
        if (uses.length && rand() < 0.3) return uses[Math.floor(rand() * uses.length)];
        const r = e.getRules(s);
        const h = s.table.hand;
        const v = e.handValue(h.playerCards, r.playerLimit);
        const up = e.handValue(h.dealerCards.slice(0, 1), r.dealerLimit).total;
        const m = r.playerLimit - v.total;
        if (one('double') && (m === 10 || m === 11) && up < 10) return one('double');
        if (m >= 10) return one('hit') ?? one('stand');
        if (m >= 5 && (up >= 7 || v.soft)) return one('hit') ?? one('stand');
        if (m === 4 && v.soft) return one('hit') ?? one('stand');
        return one('stand') ?? acts[0] ?? null;
      }
      case 'bustChoice': {
        const r = e.getRules(s);
        const h = s.table.hand;
        for (const a of of('discard')) {
          const rest = h.playerCards.filter((c) => c.id !== a.cardId);
          if (e.handValue(rest, r.playerLimit).total <= r.playerLimit) return a;
        }
        if (uses.length) return uses[0];
        return one('acceptBust') ?? acts[0] ?? null;
      }
      case 'handResult':
        return one('nextHand');
      case 'tableWon':
        return one('cashOut');
      case 'shop': {
        const buys = of('buy')
          .map((a) => ({ a, o: s.shop.offers.find((o) => o.offerId === a.offerId) }))
          .filter((x) => x.o && !x.o.sold)
          .sort((x, y) => (PRIORITY[x.o.kind] ?? 9) - (PRIORITY[y.o.kind] ?? 9));
        if (buys.length && rand() < 0.85) return buys[0].a;
        const key = `${s.salon}-${s.tableIndex}`;
        if (one('reroll') && s.money >= 8 && !memo.rerolled.has(key) && rand() < 0.6) {
          memo.rerolled.add(key);
          return one('reroll');
        }
        if (uses.length && rand() < 0.3) return uses[0];
        return one('leaveShop');
      }
      case 'victory':
        if (memo.endless) return null;
        memo.endless = true;
        return one('continueEndless');
      default:
        return null;
    }
  }

  /** Une combine qui se cible : renvoie vrai si le mode de ciblage s'est ouvert. */
  function enterTarget(uid) {
    const game = g();
    const inst = game.state?.consumables.find((c) => c.uid === uid);
    const def = inst && game.engine.content.consumables.find((c) => c.id === inst.defId);
    if (!def?.targeting) return false;
    game.useConsumable(uid);
    return game.mode === 'target';
  }
  function leaveModes() {
    const game = g();
    if (game.screens.deck.isOpen()) game.screens.deck.hide();
    if (game.mode !== 'normal') game.cancelMode();
    game.view.items.select(null);
  }

  /** Profil « tout vu, tout débloqué » pour contrôler les écrans de lancement et de collection pleins. */
  function fullProfile() {
    const c = g().engine.content;
    const ids = (l) => (l ?? []).map((x) => x.id);
    const raw = localStorage.getItem('sabot.profile');
    let p = null;
    try {
      p = raw ? JSON.parse(raw) : null;
    } catch {
      p = null;
    }
    p = p && typeof p === 'object' ? p : { version: 1, runsPlayed: 0, runsWon: 0, byDeck: {}, byStake: {}, bestHand: null, furthestSalon: 0 };
    p.runsPlayed = Math.max(p.runsPlayed || 0, 1234);
    p.runsWon = Math.max(p.runsWon || 0, 567);
    p.furthestSalon = Math.max(p.furthestSalon || 0, 88);
    p.byDeck = {};
    for (const d of ids(c.startingDecks)) p.byDeck[d] = { played: 888, won: 777, bestStakeWon: (c.stakes ?? []).length };
    p.byStake = {};
    for (const st of ids(c.stakes)) p.byStake[st] = { played: 888, won: 777 };
    p.seen = { atouts: ids(c.atouts), consumables: ids(c.consumables), privileges: ids(c.privileges), bosses: ids(c.bosses), decks: ids(c.startingDecks), stakes: ids(c.stakes) };
    localStorage.setItem('sabot.profile', JSON.stringify(p));
    return true;
  }

  window.__lc = { measure, settle, centers, start, act, summary, decide, enterTarget, leaveModes, fullProfile, geom };
}

// ───────────── CDP ─────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let seq = 0;
const pending = new Map();
const consoleErrors = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}… : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}
const lc = (fn, ...args) => ev(`window.__lc.${fn}(${args.map((a) => JSON.stringify(a)).join(',')})`);
async function waitFor(expr, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await ev(expr)) return true;
    } catch {
      /* page en chargement */
    }
    await sleep(150);
  }
  return false;
}

// ───────────── Relevé des cas ─────────────
const cases = new Map();
const stats = { states: 0, hovers: 0, runs: 0, tables: 0, maxSalon: 0, skips: 0, buys: 0, combines: 0, carnet: 0, deck: 0, settings: 0, menus: 0, targeting: 0, discardMode: 0, endless: 0, victories: 0, unsettled: 0 };
let shotN = 0;
mkdirSync(join(OUT, 'captures'), { recursive: true });

async function crop(zone, geomV, name) {
  const pad = 40;
  const x0 = Math.max(0, zone.x - pad);
  const y0 = Math.max(0, zone.y - pad);
  const x1 = Math.min(1280, zone.x + zone.w + pad);
  const y1 = Math.min(720, zone.y + zone.h + pad);
  const clip = { x: geomV.L + x0 * geomV.k, y: geomV.T + y0 * geomV.k, width: Math.max(8, (x1 - x0) * geomV.k), height: Math.max(8, (y1 - y0) * geomV.k), scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', clip });
  writeFileSync(join(OUT, 'captures', name), Buffer.from(r.data, 'base64'));
  return `captures/${name}`;
}

const VERBOSE = argv.includes('--verbose');
/** Rapport réécrit dès qu'un cas apparaît (et toutes les 10 mesures) : une passe interrompue garde ce qu'elle a vu. */
let dirty = false;
let reportMeta = null;
async function measure(ctx) {
  const tm = Date.now();
  const settled = await lc('settle');
  if (!settled) stats.unsettled++;
  const res = await lc('measure');
  stats.states++;
  if (VERBOSE) console.log(`    ${ctx.screen} : ${Date.now() - tm} ms, ${res.issues.length} cas`);
  if (reportMeta && (dirty || stats.states % 10 === 0)) {
    writeReport(reportMeta);
    dirty = false;
  }
  for (const iss of res.issues) {
    const key = `${iss.kind}|${iss.a.path}|${iss.b?.path ?? ''}`;
    let c = cases.get(key);
    if (!c) {
      const name = `${String(++shotN).padStart(3, '0')}-${iss.kind}.png`;
      c = { ...iss, key, first: ctx, count: 0, examples: [], capture: await crop(iss.zone, res.geom, name) };
      cases.set(key, c);
      dirty = true;
    }
    c.count++;
    const ex = `${iss.a.text}${iss.b ? ` ⟂ ${iss.b.text}` : ''}`;
    if (c.examples.length < 4 && !c.examples.some((e) => e.text === ex)) c.examples.push({ text: ex, screen: ctx.screen, seed: ctx.seed, size: ctx.size, detail: iss.detail });
  }
  return res;
}

async function hover(x, y) {
  const g = await lc('geom');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.L + x * g.k, y: g.T + y * g.k });
}
async function unhover() {
  await hover(640, 3);
}
/** Survole chaque élément visible du sélecteur et mesure avec l'infobulle ouverte. */
async function hoverAll(sel, ctx, what) {
  const pts = await lc('centers', sel);
  for (const p of pts) {
    await hover(p.x, p.y);
    stats.hovers++;
    await measure({ ...ctx, screen: `${ctx.screen}, infobulle ${what}${p.label ? ` « ${p.label} »` : ''}` });
  }
  if (pts.length) await unhover();
}

async function navigate(url) {
  await send('Page.navigate', { url });
  const ok = await waitFor(`!!window.sabot && [...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && b.textContent.includes('Nouvelle partie'))`, 20000);
  if (!ok) throw new Error('écran titre absent');
  await ev(`(${pageLib.toString()})(${JSON.stringify(FLOATING.map((f) => f[0]).join(', '))}, ${JSON.stringify(PAIRS.map((p) => [p[0], p[1]]))})`);
}

const SCREEN = {
  tableIntro: 'présentation de table',
  playerTurn: 'tour du joueur',
  bustChoice: 'crevé, choix',
  handResult: 'résultat de la main',
  tableWon: 'reçu de table',
  shop: 'boutique',
  gameOver: 'fin de partie',
  victory: 'victoire',
};

async function checkMenus(sizeLabel, hoverCollection = false) {
  const base = { seed: '-', size: sizeLabel, phase: 'menus' };
  await measure({ ...base, screen: 'titre' });
  // lancement : chaque sabot, chaque mise (survol + clic)
  await ev(`window.sabot.screens.launch?.open(), true`);
  await measure({ ...base, screen: 'lancement' });
  const nDecks = await ev(`document.querySelectorAll('.xl-deck').length`);
  for (let i = 0; i < nDecks; i++) {
    await ev(`document.querySelectorAll('.xl-deck')[${i}]?.click(), true`);
    await measure({ ...base, screen: `lancement, sabot ${i + 1}` });
  }
  await hoverAll('.xl-deck', { ...base, screen: 'lancement' }, 'de sabot');
  const nStakes = await ev(`document.querySelectorAll('.xl-stake').length`);
  for (let i = 0; i < nStakes; i++) {
    await ev(`(() => { const e = document.querySelectorAll('.xl-stake')[${i}]; if (e && !e.classList.contains('locked')) e.click(); return true; })()`);
    await measure({ ...base, screen: `lancement, mise ${i + 1}` });
  }
  await hoverAll('.xl-stake', { ...base, screen: 'lancement' }, 'de mise');
  await ev(`window.sabot.screens.launch?.hide(), true`);
  // collection : chaque onglet, chaque page
  await ev(`window.sabot.screens.collection?.open(), true`);
  const tabs = await ev(`[...document.querySelectorAll('.xc-tab:not(.xc-page)')].map((t) => t.textContent.trim())`);
  for (let t = 0; t < tabs.length; t++) {
    await ev(`document.querySelectorAll('.xc-tab:not(.xc-page)')[${t}]?.click(), true`);
    await measure({ ...base, screen: `collection, ${tabs[t]}` });
    const pages = await ev(`document.querySelectorAll('.xc-page').length`);
    for (let p = 1; p < pages; p++) {
      await ev(`document.querySelectorAll('.xc-page')[${p}]?.click(), true`);
      await measure({ ...base, screen: `collection, ${tabs[t]}, page ${p + 1}` });
      if (hoverCollection) await hoverAll('.xc-grid canvas', { ...base, screen: `collection, ${tabs[t]}, page ${p + 1}` }, 'de collection');
    }
    if (hoverCollection) await hoverAll('.xc-grid canvas', { ...base, screen: `collection, ${tabs[t]}` }, 'de collection');
  }
  await ev(`window.sabot.screens.collection?.hide(), true`);
  // réglages depuis le titre
  await ev(`window.sabot.screens.settings.open(), true`);
  await measure({ ...base, screen: 'réglages (titre)' });
  await ev(`window.sabot.screens.settings.close(), true`);
}

async function playRun(i, url, decks, stakes, sizeLabel) {
  const deckId = decks.length ? decks[i % decks.length] : undefined;
  const stakeId = stakes.length ? stakes[Math.floor(i / Math.max(1, decks.length)) % Math.min(4, stakes.length)] : undefined;
  const seed = `MEP${String(i + 1).padStart(2, '0')}`;
  await navigate(url);
  await lc('start', seed, { deckId, stakeId });
  stats.runs++;
  const base = { seed, deck: deckId, stake: stakeId, size: sizeLabel };
  const seenTables = new Set();
  const seenSalons = new Set();
  const seenShops = new Set();
  let settingsDone = false;
  let menuDone = false;
  let discardDone = false;
  let fails = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const s = await lc('summary');
    if (!s) break;
    stats.maxSalon = Math.max(stats.maxSalon, s.salon);
    const ctx = { ...base, phase: s.phase, salon: s.salon, table: s.tableIndex, screen: `${SCREEN[s.phase] ?? s.phase}${s.endless ? ' (sans fin)' : ''}` };
    const tkey = `${s.salon}-${s.tableIndex}`;
    await measure(ctx);

    if (s.phase === 'gameOver' || s.phase === 'victory') {
      if (s.phase === 'victory') stats.victories++;
      const a = await lc('decide');
      if (!a) break;
      stats.endless++;
      await lc('act', a);
      continue;
    }
    if (s.phase === 'tableIntro' && !seenTables.has(`i${tkey}`)) {
      seenTables.add(`i${tkey}`);
      stats.tables++;
      await hoverAll('.intro button', ctx, 'de bouton');
      await hoverAll('.item', ctx, 'd’objet');
    }
    if (s.phase === 'playerTurn' && !seenSalons.has(`p${s.salon}`)) {
      // une fois par salon : Carnet, vue du sabot ; une fois par partie : réglages, décor, menu d'objet
      seenSalons.add(`p${s.salon}`);
      await ev(`window.sabot.screens.carnet.open(), true`);
      stats.carnet++;
      await measure({ ...ctx, screen: 'Carnet' });
      await ev(`window.sabot.screens.carnet.hide(), true`);
      await ev(`window.sabot.openDeck(), true`);
      stats.deck++;
      await measure({ ...ctx, screen: 'vue du sabot' });
      await ev(`window.sabot.screens.deck.hide(), true`);
      if (!settingsDone) {
        settingsDone = true;
        await ev(`window.sabot.screens.settings.open(), true`);
        stats.settings++;
        await measure({ ...ctx, screen: 'réglages (en partie)' });
        await ev(`window.sabot.screens.settings.close(), true`);
      }
      if (!seenSalons.has('decor')) {
        seenSalons.add('decor');
        await hoverAll('.plaque, .score, .stats > *, .shoe, .discard, .actions button', ctx, 'du décor');
      }
      if (!menuDone && (s.atouts.length || s.consumables.length)) {
        menuDone = true;
        await ev(`window.sabot.view.items.select(${s.atouts[0] ?? s.consumables[0]}), true`);
        stats.menus++;
        await measure({ ...ctx, screen: 'menu d’objet' });
        await lc('leaveModes');
      }
    }
    if (s.phase === 'bustChoice' && !discardDone && s.legal.includes('discard')) {
      discardDone = true;
      await ev(`window.sabot.enterDiscard(), true`);
      stats.discardMode++;
      await measure({ ...ctx, screen: 'crevé, défausse à choisir' });
      await lc('leaveModes');
    }
    if (s.phase === 'shop' && !seenShops.has(s.shopKey)) {
      seenShops.add(s.shopKey);
      await hoverAll('.shop .sprite', ctx, 'd’offre');
      if (!seenSalons.has('shopButtons')) {
        seenSalons.add('shopButtons');
        await hoverAll('.shop button', ctx, 'de bouton de boutique');
      }
      if (!seenTables.has(`s${tkey}`) && s.legal.includes('shredCard')) {
        seenTables.add(`s${tkey}`);
        await ev(`window.sabot.screens.deck.open('shred'), true`);
        await measure({ ...ctx, screen: 'boutique, Déchiqueteuse' });
        await ev(`window.sabot.screens.deck.hide(), true`);
      }
    }

    const a = await lc('decide');
    if (!a) break;
    if (a.type === 'useConsumable') {
      stats.combines++;
      if (await lc('enterTarget', a.uid)) {
        stats.targeting++;
        await measure({ ...ctx, screen: 'ciblage d’une combine' });
        await lc('leaveModes');
      }
    }
    if (a.type === 'skipTable') stats.skips++;
    if (a.type === 'buy') stats.buys++;
    const ok = await lc('act', a);
    fails = ok ? 0 : fails + 1;
    if (fails >= 3) {
      console.log(`  ${seed} : action refusée trois fois (${JSON.stringify(a)}), partie arrêtée`);
      break;
    }
  }
  const end = await lc('summary');
  console.log(`  ${seed} ${deckId ?? ''} ${stakeId ?? ''} : ${end?.phase} au salon ${end?.salon}, ${stats.states} états mesurés, ${cases.size} cas`);
  return end;
}

// ───────────── Rapport ─────────────
const KIND_LABEL = {
  recouvrement: 'Recouvrements',
  'sur-bouton': 'Textes posés sur un bouton',
  boutons: 'Boutons qui se chevauchent',
  'deborde-boite': 'Textes hors de leur boîte',
  'deborde-cadre': 'Textes ou boutons hors de leur cadre',
  rogne: 'Textes rognés',
  'hors-scene': 'Hors de la scène',
  tronque: 'Textes tronqués',
  suspension: 'Textes avec « … » (interdit partout, sans exception)',
};
function writeReport(meta) {
  const list = [...cases.values()];
  writeFileSync(join(OUT, 'cas.json'), JSON.stringify({ meta, stats, consoleErrors, cases: list }, null, 1));
  const L = [];
  L.push('# Contrôle de mise en page de SABOT', '');
  L.push(`Fichier : \`${meta.html}\` (${meta.htmlDate}), ouvert en file:// dans Edge sans tête.`);
  L.push(`Tailles : ${meta.sizes.join(', ')}. Parties : ${stats.runs} (graines MEP${String(FROM + 1).padStart(2, '0')} à MEP${String(FROM + SEEDS).padStart(2, '0')} × ${meta.sizes.length} tailles), sabots : ${meta.decks.join(', ')}.`);
  L.push(`États mesurés : ${stats.states}, dont ${stats.hovers} infobulles. Tables : ${stats.tables}, salon le plus loin : ${stats.maxSalon}, pots-de-vin : ${stats.skips}, achats : ${stats.buys}, combines : ${stats.combines} (ciblages : ${stats.targeting}), Carnet : ${stats.carnet}, vue du sabot : ${stats.deck}, réglages : ${stats.settings}, victoires : ${stats.victories}.`);
  if (stats.unsettled) L.push(`États pris sans mise en page immobile après 2,5 s : ${stats.unsettled}.`);
  L.push(`Erreurs de console : ${consoleErrors.length}${consoleErrors.length ? ` (${consoleErrors.slice(0, 3).join(' | ')})` : ''}.`, '');
  L.push('## Exceptions (recouvrements voulus, non signalés)', '');
  for (const [sel, why] of FLOATING) L.push(`- \`${sel}\` : ${why} (calque flottant ; son propre texte reste contrôlé)`);
  for (const [t, a, why] of PAIRS) L.push(`- \`${t}\` sous \`${a}\` : ${why}`);
  L.push('- un panneau d’un autre calque (écran, Carnet, réglages, voile de fin) posé sur la table : voulu ; une carte ou un objet qui mord sur un texte du décor reste signalé', '');
  L.push(`## Cas trouvés : ${list.length}`, '');
  if (!list.length) L.push('Aucun.');
  for (const kind of Object.keys(KIND_LABEL)) {
    const ks = list.filter((c) => c.kind === kind);
    if (!ks.length) continue;
    L.push(`### ${KIND_LABEL[kind]} (${ks.length})`, '');
    for (const c of ks) {
      const f = c.first;
      L.push(`- **${f.screen}** (phase ${f.phase}, graine ${f.seed}, ${f.size}${f.deck ? `, ${f.deck}` : ''}) : ${c.detail}, vu ${c.count} fois. Capture : \`${c.capture}\``);
      L.push(`  - A : \`${c.a.path}\` « ${c.a.text} » ${JSON.stringify(c.a.rect)}`);
      if (c.b) L.push(`  - B : \`${c.b.path}\` « ${c.b.text} » ${JSON.stringify(c.b.rect)}`);
      for (const e of c.examples.slice(1)) L.push(`  - aussi : ${e.screen} (${e.seed}, ${e.size}) : « ${e.text} »`);
    }
    L.push('');
  }
  writeFileSync(join(OUT, 'rapport.md'), L.join('\n'));
}

// ───────────── Programme ─────────────
const profile = join(OUT, 'edge-profile');
rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1280,720', '--hide-scrollbars', '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
let code = 0;
const t0 = Date.now();
try {
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null;
    } catch {
      /* Edge démarre */
    }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('Edge ne répond pas');
  ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  const url = pathToFileURL(HTML).href;
  const { statSync } = await import('node:fs');
  const meta = { html: HTML, htmlDate: statSync(HTML).mtime.toISOString(), sizes: SIZES.map(([w, h]) => `${w}×${h}`), decks: [] };
  reportMeta = meta;
  if (argv.includes('--probe')) {
    // diagnostic : mesure quelques écrans et affiche les cas bruts avec le temps de mesure
    await send('Emulation.setDeviceMetricsOverride', { width: SIZES[0][0], height: SIZES[0][1], deviceScaleFactor: 1, mobile: false });
    await navigate(url);
    const steps = [
      ['titre', null],
      ['lancement', 'window.sabot.screens.launch.open()'],
      ['collection', 'window.sabot.screens.launch.hide(), window.sabot.screens.collection.open()'],
      ['présentation', "window.sabot.screens.collection.hide(), window.__lc.start('MEP01', {})"],
      ['tour', "window.__lc.act({ type: 'startTable' })"],
    ];
    for (const [name, expr] of steps) {
      if (expr) await ev(`(async () => { await (${expr}); return true; })()`);
      const ta = Date.now();
      await lc('settle');
      const tb = Date.now();
      const res = await lc('measure');
      console.log(`== ${name} : attente ${tb - ta} ms, mesure ${Date.now() - tb} ms, ${res.texts} textes, ${res.issues.length} cas`);
      for (const i of res.issues) console.log(`  ${i.kind} | ${i.a.path} «${i.a.text.slice(0, 40)}» ${i.b ? `| ${i.b.path} «${i.b.text.slice(0, 30)}»` : ''} | ${i.detail}`);
    }
    process.exitCode = 0;
    throw new Error('sonde terminée');
  }
  for (const [w, h] of SIZES) {
    const sizeLabel = `${w}×${h}`;
    console.log(`taille ${sizeLabel}`);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await navigate(url);
    const decks = await ev(`(window.sabot.engine.content.startingDecks ?? []).map((d) => d.id)`);
    const stakes = await ev(`(window.sabot.engine.content.stakes ?? []).map((d) => d.id)`);
    meta.decks = decks;
    if (MENUS) await checkMenus(sizeLabel);
    for (let i = FROM; i < FROM + SEEDS; i++) {
      try {
        await playRun(i, url, decks, stakes, sizeLabel);
      } catch (e) {
        console.log(`  partie ${i + 1} interrompue : ${e.message}`);
        consoleErrors.push(`pilote : ${e.message}`);
      }
      writeReport(meta);
    }
    // menus avec un profil plein (records, mises débloquées, collection complète)
    if (MENUS) {
      await navigate(url);
      await lc('fullProfile');
      await navigate(url);
      await checkMenus(`${sizeLabel}, profil plein`, true);
    }
    writeReport(meta);
  }
  code = cases.size ? 1 : 0;
  console.log(`${cases.size} cas, ${stats.states} états mesurés en ${Math.round((Date.now() - t0) / 1000)} s. Rapport : ${join(OUT, 'rapport.md')}`);
} catch (e) {
  console.error(`ÉCHEC : ${e.message}`);
  code = 2;
} finally {
  try {
    ws?.close();
  } catch {
    /* déjà fermé */
  }
  edge.kill();
  await sleep(600);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(code);
