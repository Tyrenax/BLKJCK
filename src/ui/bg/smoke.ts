/**
 * Fond : fumée en bruit déformé par domaine, calculée en 320×180 et agrandie en gros pixels,
 * avec le tapis Pétrole de la table. Tramage ordonné sur une rampe de palette (aucun dégradé lisse).
 * Réagit au jeu : chaleur (près de la limite), bouffée claire (victoire), teinte du patron.
 */
import { rgb01, type ColorName } from '../core/palette';

const W = 320;
const H = 180;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uHeat;
uniform float uFlash;
uniform float uBoss;
uniform float uAberr;
uniform float uFelt;
uniform vec3 cNuit, cNuitClair, cPruneS, cPrune, cPruneC, cBordS, cBord, cBordC, cPet, cPetS, cPetC, cLaitonN, cLaitonS;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float x = q.x; float y = q.y;
  float b = 0.0;
  if (y < 0.5) b = (x < 0.5) ? 0.0 : (x < 1.5) ? 8.0 : (x < 2.5) ? 2.0 : 10.0;
  else if (y < 1.5) b = (x < 0.5) ? 12.0 : (x < 1.5) ? 4.0 : (x < 2.5) ? 14.0 : 6.0;
  else if (y < 2.5) b = (x < 0.5) ? 3.0 : (x < 1.5) ? 11.0 : (x < 2.5) ? 1.0 : 9.0;
  else b = (x < 0.5) ? 15.0 : (x < 1.5) ? 7.0 : (x < 2.5) ? 13.0 : 5.0;
  return (b + 0.5) / 16.0;
}

float smoke(vec2 p) {
  float t = uTime;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.035)), fbm(p + vec2(5.2, 1.3) - vec2(t * 0.02, 0.0)));
  vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + t * 0.04), fbm(p + 3.2 * q + vec2(8.3, 2.8) - t * 0.03));
  return fbm(p + 3.0 * r);
}

// rampe froide / chaude, choisie au tramage selon la chaleur
vec3 ramp(float v, float warm, float d) {
  float lv = clamp(v * 4.0 + d - 0.5, 0.0, 3.999);
  float idx = floor(lv);
  vec3 c0 = mix(cNuit, cNuit, warm);
  vec3 c1 = warm > 0.5 ? cBordS : cPruneS;
  vec3 c2 = warm > 0.5 ? cBord : cPrune;
  vec3 c3 = warm > 0.5 ? cBordC : cPruneC;
  if (idx < 0.5) return c0;
  if (idx < 1.5) return c1;
  if (idx < 2.5) return c2;
  return c3;
}

// forme du tapis (superellipse) en unités de scène
float feltShape(vec2 s) {
  vec2 c = vec2(640.0, 374.0);
  vec2 d = abs(s - c) / vec2(596.0, 306.0);
  return pow(d.x, 3.2) + pow(d.y, 3.2);
}

vec3 scene(vec2 px, float d) {
  vec2 s = px * 4.0 + 2.0; // centre du gros pixel, en unités de scène
  vec2 p = px / vec2(70.0, 70.0);
  float v = smoke(p * vec2(1.0, 1.3));
  v = v * 1.15 - 0.18 + uFlash * 0.35;
  float warmAmt = clamp(uHeat * 0.85 + uBoss * 0.55, 0.0, 1.0);
  float warm = step(d, warmAmt * smoothstep(0.25, 0.75, v + 0.15));
  vec3 room = ramp(v, warm, d);

  if (uFelt < 0.5) return room;
  float f = feltShape(s);
  if (f > 1.13) return room;
  if (f > 1.0) {
    // bourrelet de velours + filet de laiton terni
    float k = (f - 1.0) / 0.13;
    if (k < 0.16) return cLaitonS;
    if (k < 0.28) return cLaitonN;
    if (k > 0.86) return cNuit;
    return (k < 0.5) ? cPruneC : cPrune;
  }
  // tapis : Pétrole, usure tramée, reflets, lignes peintes
  float wear = fbm(px / 34.0 + vec2(3.0, 7.0));
  vec3 c = cPet;
  if (wear + (d - 0.5) * 0.12 > 0.7) c = mix(cPet, cPetC, 0.3);
  if (wear + (d - 0.5) * 0.12 < 0.3) c = cPetS;
  // bord sombre du tapis
  if (f > 0.9 && d < (f - 0.9) * 8.0) c = cPetS;
  // lignes peintes : arc sous la main du croupier
  float arc = length((s - vec2(640.0, -170.0)) / vec2(1.55, 1.0));
  if (abs(arc - 400.0) < 2.5 && abs(s.x - 640.0) < 330.0) c = cPetC;
  if (abs(arc - 412.0) < 2.0 && abs(s.x - 640.0) < 322.0 && mod(floor(s.x / 12.0), 2.0) < 1.0) c = cPetC;
  // fumée qui passe sur le tapis
  if (v > 0.62 + d * 0.25) c = mix(c, cPruneC, 0.18 + uHeat * 0.1);
  return c;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  frag.y = uRes.y - frag.y;
  vec2 uv = frag / uRes;
  // très légère courbure
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 cuv = 0.5 + cc * (1.0 + 0.035 * r2);
  vec2 px = floor(cuv * uRes);
  float d = bayer4(px);
  vec3 col = scene(px, d);
  // aberration chromatique sur les bords : on décale R et B d'un gros pixel
  float edge = smoothstep(0.18, 0.32, r2) * uAberr;
  if (edge > 0.5) {
    vec3 cr = scene(px + vec2(1.0, 0.0), d);
    vec3 cb = scene(px - vec2(1.0, 0.0), d);
    col = vec3(cr.r, col.g, cb.b);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface SmokeControls {
  heat: number;
  flash: number;
  boss: number;
  felt: boolean;
  motion: boolean;
  aberration: number;
}

export class Smoke {
  readonly controls: SmokeControls = { heat: 0, flash: 0, boss: 0, felt: true, motion: true, aberration: 0.6 };
  private gl: WebGLRenderingContext | null;
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private time = 0;
  private heat = 0;
  private boss = 0;
  private flash = 0;
  private acc = 0;
  private dirty = true;
  private fallback: CanvasRenderingContext2D | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false, alpha: false });
    if (this.gl) this.init(this.gl);
    else this.fallback = canvas.getContext('2d');
  }

  private init(gl: WebGLRenderingContext): void {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(p));
      this.gl = null;
      this.fallback = this.canvas.getContext('2d');
      return;
    }
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uTime', 'uHeat', 'uFlash', 'uBoss', 'uAberr', 'uFelt']) this.u[n] = gl.getUniformLocation(p, n);
    const colors: Record<string, ColorName> = {
      cNuit: 'nuit', cNuitClair: 'nuit-clair', cPruneS: 'prune-sombre', cPrune: 'prune', cPruneC: 'prune-clair',
      cBordS: 'bordeaux-sombre', cBord: 'bordeaux', cBordC: 'bordeaux-clair', cPet: 'petrole', cPetS: 'petrole-sombre',
      cPetC: 'petrole-clair', cLaitonN: 'laiton-nuit', cLaitonS: 'laiton-sombre',
    };
    for (const [u, c] of Object.entries(colors)) gl.uniform3fv(gl.getUniformLocation(p, u), rgb01(c));
    gl.uniform2f(this.u.uRes, W, H);
    gl.viewport(0, 0, W, H);
  }

  private blazeLeft = 0;
  /** La fumée s'embrase une seconde (main énorme). */
  blaze(ms = 1000): void {
    this.blazeLeft = Math.max(this.blazeLeft, ms);
    this.controls.flash = Math.min(1, this.controls.flash + 0.5);
  }

  /** Bouffée claire (victoire). */
  puff(power = 1): void {
    this.controls.flash = Math.min(1, this.controls.flash + power);
  }

  update(realDt: number): void {
    const c = this.controls;
    // lissage des réactions
    const k = Math.min(1, realDt / 400);
    if (this.blazeLeft > 0) this.blazeLeft = Math.max(0, this.blazeLeft - realDt);
    const targetHeat = this.blazeLeft > 0 ? 1 : c.heat;
    const nh = this.heat + (targetHeat - this.heat) * (this.blazeLeft > 0 ? Math.min(1, realDt / 80) : k);
    const nb = this.boss + (c.boss - this.boss) * Math.min(1, realDt / 900);
    c.flash = Math.max(0, c.flash - realDt / 900);
    const nf = c.flash;
    if (Math.abs(nh - this.heat) > 0.002 || Math.abs(nb - this.boss) > 0.002 || Math.abs(nf - this.flash) > 0.002) this.dirty = true;
    this.heat = nh;
    this.boss = nb;
    this.flash = nf;
    if (c.motion) {
      this.time += realDt / 1000;
      this.dirty = true;
    }
    // ~30 images/s suffisent pour une fumée lente
    this.acc += realDt;
    if (!this.dirty || this.acc < 33) return;
    this.acc = 0;
    this.dirty = false;
    this.draw();
  }

  markDirty(): void {
    this.dirty = true;
  }

  private draw(): void {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    gl.uniform1f(this.u.uTime, this.time + 40);
    gl.uniform1f(this.u.uHeat, this.heat);
    gl.uniform1f(this.u.uFlash, this.flash);
    gl.uniform1f(this.u.uBoss, this.boss);
    gl.uniform1f(this.u.uAberr, this.controls.aberration);
    gl.uniform1f(this.u.uFelt, this.controls.felt ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
