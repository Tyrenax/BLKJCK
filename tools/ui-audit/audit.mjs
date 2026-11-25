// Audit de mise en page de SABOT : mesure chaque écran dans ses pires cas (src/ui/dev/audit.ts, ?audit=1).
// Usage : node tools/ui-audit/audit.mjs [--sizes 1280x720,1920x1080] [--filter boutique,infobulles] [--probe] [--shot "<regex de cas>"] [--out <dossier>]
// Démarre Vite le temps de l'audit puis l'arrête ; une seule instance d'Edge sans tête. Sortie : <taille>-summary.txt, -report.json et captures annotées.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1];
};
const sizes = opt('sizes', '1280x720').split(',').map((s) => s.split('x').map(Number));
const filter = opt('filter', '');
const shotRe = opt('shot', '') ? new RegExp(opt('shot', '')) : null;
const doProbe = args.includes('--probe');
const outDir = resolve(opt('out', join(tmpdir(), 'sabot-ui-audit')));
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const VITE_PORT = 5173;
const CDP_PORT = 9353;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Un audit complet dans une taille de fenêtre. */
async function auditSize(W, H) {
  const tag = `${W}x${H}`;
  const profile = join(outDir, `edge-${tag}`);
  rmSync(profile, { recursive: true, force: true });
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let ws;
  let seq = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    // jamais d'attente infinie : un cas bloqué échoue au bout de deux minutes
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      setTimeout(() => pending.delete(id) && rej(new Error(`${method} : pas de réponse en 120 s`)), 120000);
    });
  };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr.slice(0, 60)} : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${tag}-${name}.png`), Buffer.from(r.data, 'base64'));
  };
  const sig = (s) => (s ?? '').replace(/ « .*$/, '').replace(/^\[infobulle de [^\]]*\] /, '');
  try {
    for (let i = 0; i < 80 && !ws; i++) {
      try {
        const page = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page');
        if (page) {
          ws = new WebSocket(page.webSocketDebuggerUrl);
          break;
        }
      } catch {}
      await sleep(250);
    }
    if (!ws) throw new Error('Edge ne répond pas');
    if (ws.readyState !== WebSocket.OPEN) await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception');
      else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://localhost:${VITE_PORT}/?audit=1` });
    for (let i = 0; i < 200 && !(await ev('!!window.__audit').catch(() => false)); i++) await sleep(150);
    await sleep(1500); // l'éventail de cartes du titre retombe
    const list = (await ev('window.__audit.list()')).filter((c) => !filter || filter.split(',').some((f) => c.group === f || c.name.includes(f)));
    const results = [];
    const seen = new Set();
    let shots = 0;
    for (const c of list) {
      const r = await ev(`window.__audit.run(${c.index})`);
      results.push(r);
      const name = String(c.index).padStart(3, '0');
      if (shotRe?.test(c.name)) {
        r.shot = `${tag}-${name}.png`;
        await shot(name);
      } else if (r.findings.length || r.error) {
        const s = `${c.group}|${r.error ? 'erreur' : r.findings.map((f) => `${f.kind}:${sig(f.a)}:${sig(f.b)}`).sort().join(',')}`;
        if (!seen.has(s) && shots < 120) {
          seen.add(s);
          shots++;
          r.shot = `${tag}-${name}.png`;
          await shot(name);
        }
      }
    }
    const probe = doProbe ? await ev('window.__audit.probe()') : null;
    writeFileSync(join(outDir, `${tag}-report.json`), JSON.stringify({ results, probe, errors }, null, 1));
    const groups = {};
    for (const r of results) {
      const g = (groups[r.group] ??= { cases: 0, flagged: 0, findings: 0 });
      g.cases++;
      if (r.findings.length || r.error) g.flagged++;
      g.findings += r.findings.length;
    }
    const total = results.reduce((a, r) => a + r.findings.length, 0);
    const lines = [`[${tag}] ${results.length} cas, ${total} constats`];
    for (const [g, v] of Object.entries(groups)) lines.push(`  ${g} : ${v.cases} cas, ${v.flagged} signalés, ${v.findings} constats`);
    const bySig = new Map();
    for (const r of results) {
      if (r.error) lines.push(`  ERREUR ${r.group} / ${r.name} : ${r.error.split('\n')[0]}`);
      for (const f of r.findings) {
        const k = `${r.group} | ${f.kind} | ${sig(f.a)} | ${sig(f.b)}`;
        const e = bySig.get(k) ?? { n: 0, ex: `${r.name} : ${f.a}${f.b ? ` / ${f.b}` : ''} (${f.detail})`, shot: r.shot };
        e.n++;
        bySig.set(k, e);
      }
    }
    if (bySig.size) lines.push('', 'constats regroupés (groupe | type | élément | autre élément) :');
    for (const [k, e] of [...bySig.entries()].sort((a, b) => b[1].n - a[1].n)) lines.push(`  ${e.n}× ${k}\n      ex. ${e.ex}${e.shot ? ` [${e.shot}]` : ''}`);
    if (probe) lines.push('', 'capacité (sûr / courant) :', ...probe.map((p) => `  ${p.label} : largeur ${p.width} px, règle sur 3 lignes = ${p.rule3?.sûr} / ${p.rule3?.courant} car., nom sur une ligne = ${p.name1?.sûr} / ${p.name1?.courant} car.`));
    lines.push('', `erreurs console : ${errors.length}`, ...errors.slice(0, 5));
    writeFileSync(join(outDir, `${tag}-summary.txt`), lines.join('\n'));
    console.log(lines.join('\n'));
    return total + errors.length;
  } finally {
    try {
      ws?.close();
    } catch {}
    edge.kill();
    await sleep(500);
  }
}

if (await up(`http://localhost:${VITE_PORT}/`)) {
  console.error(`Le port ${VITE_PORT} est déjà pris : arrête l'autre serveur avant l'audit.`);
  process.exit(2);
}
const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let bad = 0;
try {
  for (let i = 0; i < 120 && !(await up(`http://localhost:${VITE_PORT}/`)); i++) await sleep(500);
  for (const [W, H] of sizes) bad += await auditSize(W, H);
} finally {
  vite.kill();
  for (let i = 0; i < 20 && (await up(`http://localhost:${VITE_PORT}/`)); i++) await sleep(250);
  console.log((await up(`http://localhost:${VITE_PORT}/`)) ? `ATTENTION : le port ${VITE_PORT} répond encore.` : 'Vite arrêté.');
  console.log(`Résultats dans ${outDir}`);
}
process.exit(bad ? 1 : 0);
