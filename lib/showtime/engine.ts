import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ARCH } from "./shows";
import type { EmitOpts, GiftEvent, RGB, Show, Stage3D } from "./types";

export type BackgroundId = "cosmos" | "aurora" | "grid";

const MAX = 7000;
const CAM_Z = 1900;
type Banner = { sender: string; emoji: string; name: string; count: number; tier: number } | null;

export function baseDuration(tier: number): number {
  return [0, 7, 11, 20, 32][tier] ?? 10;
}
function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* soft round additive sprite */
function softTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * SHOWTIME 3D engine — WebGLRenderer with ACES tone mapping + UnrealBloom, a custom
 * additive GPU particle system (per-particle size/colour/alpha in 3D), living space
 * backgrounds, camera shake/dolly + a bloom flash, and a priority queue of
 * choreographed gift shows. Shows build their own THREE objects via Stage3D.
 */
export class ShowtimeEngine implements Stage3D {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  soft: THREE.Texture;
  time = 0;

  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private raf = 0;

  private pGeo: THREE.BufferGeometry;
  private pPos: Float32Array;
  private pCol: Float32Array;
  private pSize: Float32Array;
  private pAlpha: Float32Array;
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private lmax = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private baseA = new Float32Array(MAX);
  private live = 0;

  private shows: Show[] = [];
  private bg: BackgroundId = "cosmos";
  private bgGroup = new THREE.Group();
  private stars!: THREE.Points;
  private flashMesh: THREE.Mesh;
  private flashA = 0;
  private flashCol = new THREE.Color(1, 1, 1);
  private shakeAmt = 0;
  private camZ = CAM_Z;
  private camZTarget = CAM_Z;

  onBanner: (b: Banner) => void = () => {};
  onIdle: (idle: boolean) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.soft = softTexture();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x03030a, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(45, 9 / 16, 1, 8000);
    this.camera.position.z = CAM_Z;
    this.scene.add(this.camera);
    this.scene.fog = new THREE.FogExp2(0x05030f, 0.00016);

    // particle system
    this.pPos = new Float32Array(MAX * 3);
    this.pCol = new Float32Array(MAX * 3);
    this.pSize = new Float32Array(MAX);
    this.pAlpha = new Float32Array(MAX);
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.pGeo.setAttribute("pcolor", new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.pGeo.setAttribute("psize", new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.pGeo.setAttribute("palpha", new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.soft } },
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; varying vec3 vC; varying float vA;
        void main(){ vC=pcolor; vA=palpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize*(900.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ float a=texture2D(map,gl_PointCoord).a; if(a<0.01)discard; gl_FragColor=vec4(vC*vA,a*vA); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const points = new THREE.Points(this.pGeo, pMat);
    points.frustumCulled = false;
    this.scene.add(points);

    // flash overlay (child of camera → always fills view)
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    fm.position.z = -20;
    fm.scale.set(3000, 3000, 1);
    fm.renderOrder = 999;
    this.camera.add(fm);
    this.flashMesh = fm;

    this.scene.add(this.bgGroup);
    this.buildBackground();

    // composer + bloom
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1080, 1920), 1.15, 0.62, 0.12);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
  }

  /* ── lifecycle ─────────────────────────────────────────────────────────── */
  start() {
    if (this.raf) return;
    this.clock.start();
    const loop = () => {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.time += dt;
      this.update(dt);
      this.composer.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(2, r.width), h = Math.max(2, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  setBackground(id: BackgroundId) { if (id !== this.bg) { this.bg = id; this.buildBackground(); } }
  setFit() { /* 3D fills the canvas — no letterbox needed */ }

  /* ── orchestration ─────────────────────────────────────────────────────── */
  trigger(ev: GiftEvent) {
    const g = ev.gift;
    const existing = this.shows.find((s) => s.ev.gift.id === g.id && s.ev.sender === ev.sender && s.t < s.dur * 0.75);
    if (existing) {
      existing.intensity = Math.min(9, existing.intensity + 1);
      existing.dur = Math.min(existing.dur + baseDuration(g.tier) * 0.4, baseDuration(g.tier) * 3);
      existing.ev.count = ev.count;
      this.shake(8 + g.tier * 2);
      return;
    }
    const bigs = this.shows.filter((s) => s.tier >= 3);
    if (g.tier >= 3 && bigs.length >= 2) this.endShow(this.shows.indexOf(bigs[0]));
    if (this.shows.length >= 4) this.endShow(0);
    const group = new THREE.Group();
    this.scene.add(group);
    const show: Show = { ev, arch: g.archetype, tier: g.tier, theme: g.theme.map(hexToRgb), t: 0, dur: baseDuration(g.tier), intensity: 1, seed: Math.random() * 1000, s: {}, o: {}, group };
    ARCH[g.archetype].init(this, show);
    this.shows.push(show);
    this.onBanner({ sender: ev.sender, emoji: g.emoji, name: g.name, count: ev.count, tier: g.tier });
    this.shake(5 + g.tier * 2.5);
    this.flash(g.theme[0] ? hexToRgb(g.theme[0]) : [1, 1, 1], 0.25 + g.tier * 0.05);
  }
  private endShow(i: number) {
    const s = this.shows[i];
    if (!s) return;
    ARCH[s.arch].dispose?.(this, s);
    const disposeMat = (x: THREE.Material) => { (x as unknown as { map?: THREE.Texture }).map?.dispose(); x.dispose(); };
    s.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(disposeMat);
      else if (mat) disposeMat(mat);
    });
    this.scene.remove(s.group);
    this.shows.splice(i, 1);
  }

  private update(dt: number) {
    // particles
    for (let i = 0; i < this.live; i++) {
      this.vy[i] -= this.grav[i] * dt;
      const d = 1 - this.drag[i] * dt;
      this.vx[i] *= d; this.vy[i] *= d; this.vz[i] *= d;
      const j = i * 3;
      this.pPos[j] += this.vx[i] * dt;
      this.pPos[j + 1] += this.vy[i] * dt;
      this.pPos[j + 2] += this.vz[i] * dt;
      this.life[i] -= dt;
      const t = this.life[i] / this.lmax[i];
      this.pAlpha[i] = Math.max(0, t) * this.baseA[i];
      if (this.life[i] <= 0) { this.swap(i, --this.live); i--; }
    }
    (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.psize as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.palpha as THREE.BufferAttribute).needsUpdate = true;
    this.pGeo.setDrawRange(0, this.live);

    // shows
    for (let i = this.shows.length - 1; i >= 0; i--) {
      const s = this.shows[i];
      s.t += dt;
      ARCH[s.arch].update(this, s, dt);
      if (s.t >= s.dur) this.endShow(i);
    }
    this.onIdle(this.shows.length === 0);

    // background drift
    this.bgGroup.rotation.y += dt * 0.008;
    this.bgGroup.rotation.x = Math.sin(this.time * 0.05) * 0.03;

    // camera dolly + shake
    this.camZ += (this.camZTarget - this.camZ) * Math.min(1, dt * 3);
    this.shakeAmt *= Math.pow(0.0009, dt);
    if (this.shakeAmt < 0.2) this.shakeAmt = 0;
    this.camera.position.set((Math.random() * 2 - 1) * this.shakeAmt, (Math.random() * 2 - 1) * this.shakeAmt, this.camZ);
    this.camera.lookAt(0, 0, 0);

    // flash
    this.flashA *= Math.pow(0.015, dt);
    if (this.flashA < 0.004) this.flashA = 0;
    const fmat = this.flashMesh.material as THREE.MeshBasicMaterial;
    fmat.opacity = this.flashA;
    fmat.color.copy(this.flashCol);
  }

  private swap(a: number, b: number) {
    if (a === b) return;
    const a3 = a * 3, b3 = b * 3;
    for (let k = 0; k < 3; k++) { this.pPos[a3 + k] = this.pPos[b3 + k]; this.pCol[a3 + k] = this.pCol[b3 + k]; }
    this.pSize[a] = this.pSize[b]; this.pAlpha[a] = this.pAlpha[b];
    this.vx[a] = this.vx[b]; this.vy[a] = this.vy[b]; this.vz[a] = this.vz[b];
    this.life[a] = this.life[b]; this.lmax[a] = this.lmax[b]; this.grav[a] = this.grav[b]; this.drag[a] = this.drag[b]; this.baseA[a] = this.baseA[b];
  }

  /* ── backgrounds ───────────────────────────────────────────────────────── */
  private buildBackground() {
    this.bgGroup.clear();
    // starfield
    const N = 2600;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 1200 + Math.random() * 2600;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = -Math.abs(r * Math.cos(ph)) * 0.6 - 200;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ map: this.soft, color: 0xcfe0ff, size: 9, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bgGroup.add(this.stars);

    // nebula clouds (colours per background)
    const palette: Record<BackgroundId, number[]> = {
      cosmos: [0x3b2a86, 0x1e3a8a, 0x6d28d9],
      aurora: [0x0e7490, 0x15803d, 0x7c3aed],
      grid: [0x9d174d, 0x6d28d9, 0x1e3a8a],
    };
    const cols = palette[this.bg];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: cols[i % cols.length], transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(1800 + Math.random() * 1400);
      s.position.set((Math.random() * 2 - 1) * 1600, (Math.random() * 2 - 1) * 1400, -800 - Math.random() * 1400);
      this.bgGroup.add(s);
    }

    if (this.bg === "grid") {
      const grid = new THREE.GridHelper(6000, 60, cols[0], 0x4c1d95);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      grid.position.set(0, -820, -400);
      this.bgGroup.add(grid);
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: 0xf472b6, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      sun.scale.setScalar(1500);
      sun.position.set(0, 300, -1800);
      this.bgGroup.add(sun);
    }
  }

  /* ── Stage3D ───────────────────────────────────────────────────────────── */
  emit(x: number, y: number, z: number, count: number, opts: EmitOpts = {}) {
    const [cr, cg, cb] = opts.color ?? [1, 1, 1];
    const speed = opts.speed ?? 200, sv = opts.speedVar ?? speed * 0.5;
    const size = opts.size ?? 26, szv = opts.sizeVar ?? size * 0.6;
    const life = opts.life ?? 1.4, lv = opts.lifeVar ?? 0.8;
    const spread = opts.spread ?? Math.PI;
    const base = opts.dir ? new THREE.Vector3(...opts.dir).normalize() : null;
    for (let i = 0; i < count; i++) {
      if (this.live >= MAX) return;
      const k = this.live++;
      let dx: number, dy: number, dz: number;
      if (base) {
        // random direction within a cone of half-angle `spread` around base
        const u = Math.random(), phi = Math.random() * Math.PI * 2;
        const cosT = 1 - u * (1 - Math.cos(spread));
        const sinT = Math.sqrt(1 - cosT * cosT);
        const v = new THREE.Vector3(sinT * Math.cos(phi), sinT * Math.sin(phi), cosT);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), base);
        v.applyQuaternion(q);
        dx = v.x; dy = v.y; dz = v.z;
      } else {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
        dx = Math.sin(ph) * Math.cos(th); dy = Math.sin(ph) * Math.sin(th); dz = Math.cos(ph);
      }
      const sp = speed + (Math.random() * 2 - 1) * sv;
      this.pPos[k * 3] = x; this.pPos[k * 3 + 1] = y; this.pPos[k * 3 + 2] = z;
      this.vx[k] = dx * sp; this.vy[k] = dy * sp; this.vz[k] = dz * sp;
      this.pCol[k * 3] = cr; this.pCol[k * 3 + 1] = cg; this.pCol[k * 3 + 2] = cb;
      this.pSize[k] = Math.max(2, size + (Math.random() * 2 - 1) * szv);
      this.lmax[k] = this.life[k] = Math.max(0.2, life + (Math.random() * 2 - 1) * lv);
      this.baseA[k] = 1;
      this.pAlpha[k] = 1;
      this.grav[k] = opts.grav ?? 0;
      this.drag[k] = opts.drag ?? 0.6;
    }
  }
  flash(rgb: RGB, strength: number) { this.flashCol.setRGB(rgb[0], rgb[1], rgb[2]); this.flashA = Math.min(1, Math.max(this.flashA, strength)); }
  shake(amount: number) { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  dolly(z: number) { this.camZTarget = z; }
  emojiSprite(emoji: string, color: RGB): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(${(color[0] * 255) | 0},${(color[1] * 255) | 0},${(color[2] * 255) | 0},0.9)`);
    grad.addColorStop(0.5, `rgba(${(color[0] * 255) | 0},${(color[1] * 255) | 0},${(color[2] * 255) | 0},0.15)`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.font = "150px system-ui, 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(emoji, 128, 138);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  }
}
