import * as THREE from "three";
import type { RGB, Show, ShowArchetype, Stage3D } from "./types";

/* ── helpers ───────────────────────────────────────────────────────────────── */
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pick = (t: RGB[]): RGB => t[(Math.random() * t.length) | 0];
const rate = (r: number, dt: number) => { const n = r * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
const col = (rgb: RGB) => new THREE.Color(rgb[0], rgb[1], rgb[2]);
const addMat = (rgb: RGB, opacity = 1) => new THREE.MeshBasicMaterial({ color: col(rgb), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

type ArchImpl = { init: (E: Stage3D, s: Show) => void; update: (E: Stage3D, s: Show, dt: number) => void; dispose?: (E: Stage3D, s: Show) => void };

/* ── BLOOM — radiant, gentle (roses, hearts) ───────────────────────────────── */
const bloom: ArchImpl = {
  init(E, s) {
    const hero = E.emojiSprite(s.ev.gift.emoji, s.theme[0]);
    hero.scale.setScalar(1);
    s.group.add(hero);
    s.o.hero = hero;
  },
  update(E, s, dt) {
    const hero = s.o.hero as THREE.Sprite;
    const pop = easeOut(clamp01(s.t / 0.5));
    const fade = s.t > s.dur - 1.3 ? clamp01((s.dur - s.t) / 1.3) : 1;
    hero.scale.setScalar(320 * pop * (1 + 0.05 * Math.sin(s.t * 4)) * (0.7 + 0.3 * fade));
    (hero.material as THREE.SpriteMaterial).opacity = fade;
    if (s.t < 0.06) E.emit(0, 0, 0, 90 * s.intensity, { color: s.theme[0], speed: 620, sizeVar: 14, size: 26, life: 1.3, drag: 1.4 });
    if (s.t < s.dur - 1.2) {
      const n = rate(30 * s.intensity, dt);
      for (let i = 0; i < n; i++) E.emit(0, 0, 0, 1, { color: pick(s.theme), speed: 170 + Math.random() * 240, size: 18 + Math.random() * 22, life: 1.7, drag: 0.7, grav: 45 });
    }
  },
};

/* ── PORTAL — a ring opens, energy swirls and surges (rocket, confetti) ─────── */
const portal: ArchImpl = {
  init(E, s) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(180, 15, 24, 140), addMat(s.theme[0]));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(120, 8, 20, 100), addMat(s.theme[1] ?? s.theme[0], 0.85));
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: E.soft, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.setScalar(380);
    s.group.add(ring, ring2, core);
    s.o.ring = ring; s.o.ring2 = ring2; s.o.core = core;
  },
  update(E, s, dt) {
    const ring = s.o.ring as THREE.Mesh, ring2 = s.o.ring2 as THREE.Mesh, core = s.o.core as THREE.Sprite;
    const open = easeOut(clamp01(s.t / 1.4));
    const fade = s.t > s.dur - 1 ? clamp01((s.dur - s.t) / 1) : 1;
    ring.rotation.z += dt * 0.6; ring2.rotation.z -= dt * 0.95;
    const sc = (0.4 + open * 1.05) * (1 + 0.03 * Math.sin(s.t * 3));
    ring.scale.setScalar(sc * fade); ring2.scale.setScalar(sc * fade);
    (ring.material as THREE.MeshBasicMaterial).opacity = fade;
    (core.material as THREE.SpriteMaterial).opacity = 0.5 * fade * (0.6 + 0.4 * Math.sin(s.t * 5));
    const surge = s.dur - 3.2;
    if (s.t < surge) {
      const n = rate(52 * s.intensity, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, R = 380 + Math.random() * 280;
        const x = Math.cos(a) * R, y = Math.sin(a) * R;
        E.emit(x, y, -60, 1, { color: pick(s.theme), dir: [-x, -y, 120], spread: 0.18, speed: 280 + Math.random() * 240, size: 16, life: 1.5, drag: 0.25 });
      }
    } else if (s.t < s.dur - 0.5) {
      if (s.s.surge !== 1) { s.s.surge = 1; E.flash([1, 1, 1], 0.6); E.shake(24 + s.intensity * 3); E.dolly(1640); }
      E.emit(0, 0, 0, rate(170 * s.intensity, dt), { color: pick(s.theme), dir: [0, 0, 1], spread: 0.7, speed: 1250, size: 20, life: 1.1, drag: 0.9 });
    } else E.dolly(1900);
  },
  dispose(E) { E.dolly(1900); },
};

/* ── COSMIC — the multi-stage showpiece (galaxy, universe, thunder) ─────────── */
const cosmic: ArchImpl = {
  init(E, s) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(160, 16, 24, 140), addMat(s.theme[0]));
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(210, 56, 56),
      new THREE.MeshStandardMaterial({ color: col(s.theme[1] ?? s.theme[0]), emissive: col(s.theme[0]).multiplyScalar(0.3), roughness: 0.5, metalness: 0.25 }),
    );
    planet.scale.setScalar(0.0001);
    const pring = new THREE.Mesh(new THREE.TorusGeometry(340, 9, 16, 140), addMat(s.theme[2] ?? s.theme[0], 0.7));
    pring.rotation.x = 1.15;
    planet.add(pring);
    const light = new THREE.PointLight(0xffffff, 3, 4000);
    light.position.set(-500, 350, 700);
    const amb = new THREE.AmbientLight(0x223047, 0.7);
    s.group.add(ring, planet, light, amb);
    s.o.ring = ring; s.o.planet = planet;
  },
  update(E, s, dt) {
    const T = s.dur, warp = 6, superStart = T - 6, fade = T - 2;
    const ring = s.o.ring as THREE.Mesh, planet = s.o.planet as THREE.Mesh;
    if (s.t < 0.06) { E.flash(s.theme[0], 0.55); E.shake(16); }
    ring.rotation.z += dt * 0.8;
    const ringVis = clamp01(1 - (s.t - 4) / 2);
    ring.scale.setScalar(0.4 + easeOut(clamp01(s.t / 1.6)) * 1.15);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * ringVis;
    ring.visible = ringVis > 0.02;
    if (s.t < warp) {
      E.dolly(s.t < 3 ? 1250 : 1900);
      const n = rate(120 * s.intensity, dt);
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, R = Math.random() * 130; E.emit(Math.cos(a) * R, Math.sin(a) * R, -350, 1, { color: Math.random() < 0.5 ? [1, 1, 1] : pick(s.theme), dir: [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 1], spread: 0.04, speed: 1500 + Math.random() * 1300, size: 12, life: 1.2, drag: 0 }); }
    } else if (s.t < superStart) {
      planet.scale.setScalar(easeOut(clamp01((s.t - warp) / 2.5)));
      planet.rotation.y += dt * 0.28;
      const n = rate(46 * s.intensity, dt);
      for (let i = 0; i < n; i++) { const a = s.t * 1.3 + Math.random() * Math.PI * 2, R = 350 + Math.random() * 90; E.emit(Math.cos(a) * R, Math.sin(a) * R * 0.5, Math.sin(a) * 90, 1, { color: pick(s.theme), dir: [-Math.sin(a), 0, Math.cos(a)], spread: 0.2, speed: 120, size: 16, life: 2, drag: 0.4 }); }
    } else if (s.t < fade) {
      if (s.s.nova !== 1) { s.s.nova = 1; E.flash([1, 1, 1], 0.95); E.shake(36 + s.intensity * 5); }
      planet.scale.multiplyScalar(Math.max(0.001, 1 - dt * 0.8));
      E.emit(0, 0, 0, rate(250 * s.intensity, dt), { color: pick(s.theme), speed: 1450, size: 24, life: 1.4, drag: 0.6 });
    } else { planet.scale.multiplyScalar(Math.max(0.001, 1 - dt * 1.2)); E.dolly(1900); }
  },
  dispose(E) { E.dolly(1900); },
};

/* ── BEAST — a luminous creature charges across in 3D (lion, phoenix) ───────── */
const beast: ArchImpl = {
  init(E, s) {
    const hero = E.emojiSprite(s.ev.gift.emoji, s.theme[0]);
    hero.scale.setScalar(240);
    const shock = new THREE.Mesh(new THREE.TorusGeometry(60, 10, 20, 120), addMat(s.theme[0], 0));
    shock.rotation.x = Math.PI / 2;
    s.group.add(hero, shock);
    s.o.hero = hero; s.o.shock = shock;
  },
  update(E, s, dt) {
    const T = s.dur, hero = s.o.hero as THREE.Sprite, shock = s.o.shock as THREE.Mesh;
    const cross = Math.min(1, s.t / (T * 0.5));
    const fade = s.t > T - 1.4 ? clamp01((T - s.t) / 1.4) : 1;
    const x = cross < 1 ? -720 + cross * 720 : 0;
    const y = Math.sin(s.t * 4) * 70 * (1 - cross);
    hero.position.set(x, y, 0);
    hero.scale.setScalar((cross < 1 ? 250 : 320 * easeOut(clamp01((s.t - T * 0.5) / 0.6))) * fade);
    (hero.material as THREE.SpriteMaterial).opacity = fade;
    if (cross < 1) {
      E.emit(x, y, 0, rate(130 * s.intensity, dt), { color: pick(s.theme), dir: [-1, 0, 0], spread: 0.6, speed: 260, size: 18, life: 1.1, drag: 0.8, grav: 55 });
    } else {
      if (s.s.roar !== 1) { s.s.roar = 1; E.flash([1, 1, 1], 0.75); E.shake(30 + s.intensity * 5); E.emit(0, 0, 0, 90 * s.intensity, { color: pick(s.theme), speed: 640, size: 22, life: 1.4, drag: 0.8 }); }
      const sp = s.t - T * 0.5;
      shock.scale.setScalar(1 + sp * 11);
      (shock.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - sp * 0.9);
    }
  },
};

export const ARCH: Record<ShowArchetype, ArchImpl> = { bloom, portal, cosmic, beast };
