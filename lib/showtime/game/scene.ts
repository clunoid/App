"use client";

/**
 * PENALTY SHOOTOUT — the 3D scene (three.js). A floodlit night stadium: striped
 * pitch with real penalty-area geometry, goal with rippling net, instanced crowd,
 * floodlight towers, jumbotron, ad boards — and two HUMAN-READING stars built and
 * animated procedurally (no external assets, fully deterministic):
 * RONALDO #7 (red/green kit, tall) and MESSI #10 (sky-blue stripes, bearded).
 *
 * v2 quality pass: capsule-based bodies (rounded limbs, hands, neck, shoulder
 * mass, eyes, crisp name/number back decals), elbow-driven running with torso
 * counter-rotation, a weighted strike (plant-leg bend, hip whip, hop), explosive
 * dives with anticipation and landing, ball curve + power trails + net rebound,
 * double-bounce parries, grass burst + camera shake on contact, a FIFA-style
 * fixed vote camera with projected zone anchors so the 2D vote markers sit
 * EXACTLY on the goal zones.
 *
 * The scene is a pure VIEW: the engine resolves every kick before it plays; the
 * choreography always matches the resolved outcome exactly.
 */
import * as THREE from "three";
import { PLAYERS, type PlayerDef, type PlayerId, type Zone } from "./config";
import type { KickRecord, PenaltyEvent, PenaltyState, Phase } from "./penalty";

/* ── constants ──────────────────────────────────────────────────────────── */

const GOAL_Z = -11;
const GOAL_W = 7.32;
const GOAL_H = 2.44;
const BALL_R = 0.11;

const KICK_SETTLE = 0.45;
const KICK_CONTACT = 2.7;
const ZONE_X: Record<Zone, number> = { left: -2.5, center: 0, right: 2.5 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── canvas texture helper ──────────────────────────────────────────────── */

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ── player rig (v2 — capsule humans) ───────────────────────────────────── */

type Rig = {
  def: PlayerDef;
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  thighL: THREE.Group;
  shinL: THREE.Group;
  thighR: THREE.Group;
  shinR: THREE.Group;
  armUL: THREE.Group;
  armLL: THREE.Group;
  armUR: THREE.Group;
  armLR: THREE.Group;
  gloves: THREE.Mesh[];
  pos: THREE.Vector3;
  offset: THREE.Vector3;
  yaw: number;
  crouch: number;
  lie: number;
  lieDir: number;
};

function capsule(r: number, len: number, mat: THREE.Material, sx = 1, sz = 1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);
  m.scale.set(sx, 1, sz);
  m.castShadow = true;
  return m;
}

/** Jersey texture for the torso capsule (stripes wrap the body correctly). */
function jerseyTexture(def: PlayerDef): THREE.CanvasTexture {
  return canvasTexture(256, 256, (c) => {
    c.fillStyle = def.jersey;
    c.fillRect(0, 0, 256, 256);
    if (def.striped) {
      c.fillStyle = def.jersey2;
      for (let i = 0; i < 6; i++) c.fillRect(i * 44, 0, 20, 256);
    }
    // collar + hem trim
    c.fillStyle = def.jersey2;
    c.fillRect(0, 0, 256, 14);
    c.fillRect(0, 244, 256, 12);
  });
}

/** Crisp name + number decal for the back (transparent). */
function backDecal(def: PlayerDef): THREE.CanvasTexture {
  return canvasTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.textAlign = "center";
    c.fillStyle = def.striped ? "#0F2740" : "#FFFFFF";
    c.font = "800 40px system-ui";
    c.fillText(def.shirt, 128, 58);
    c.font = "800 165px system-ui";
    c.fillText(String(def.number), 128, 216);
  });
}

function makePlayer(def: PlayerDef, scene: THREE.Scene): Rig {
  const root = new THREE.Group();
  root.scale.setScalar(def.height);
  scene.add(root);

  const skinMat = new THREE.MeshLambertMaterial({ color: def.skin });
  const jerseyMat = new THREE.MeshLambertMaterial({ map: jerseyTexture(def) });
  const sleeveMat = new THREE.MeshLambertMaterial({ color: def.jersey });
  const shortsMat = new THREE.MeshLambertMaterial({ color: def.shorts });
  const sockMat = new THREE.MeshLambertMaterial({ color: def.socks });
  const hairMat = new THREE.MeshLambertMaterial({ color: def.hair });
  const bootMat = new THREE.MeshLambertMaterial({ color: "#15181D" });

  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  // shorts / pelvis
  const pelvis = capsule(0.155, 0.1, shortsMat, 1.2, 0.85);
  pelvis.position.y = -0.02;
  hips.add(pelvis);

  // torso
  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  const chest = capsule(0.165, 0.3, jerseyMat, 1.2, 0.72);
  chest.position.y = 0.32;
  torso.add(chest);
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), sleeveMat);
    shoulder.position.set(sx * 0.205, 0.5, 0);
    shoulder.castShadow = true;
    torso.add(shoulder);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.07, 10), skinMat);
  neck.position.y = 0.585;
  torso.add(neck);

  // crisp back name/number + small chest number
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.42),
    new THREE.MeshBasicMaterial({ map: backDecal(def), transparent: true, depthWrite: false }),
  );
  back.position.set(0, 0.34, -0.155);
  back.rotation.y = Math.PI;
  torso.add(back);

  // head
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16), skinMat);
  skull.position.y = 0.1;
  skull.castShadow = true;
  head.add(skull);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), new THREE.MeshBasicMaterial({ color: "#141414" }));
    eye.position.set(sx * 0.045, 0.115, 0.108);
    head.add(eye);
  }
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.129, 20, 12, 0, Math.PI * 2, 0, def.id === "messi" ? Math.PI * 0.62 : Math.PI * 0.5), hairMat);
  hair.position.y = 0.108;
  head.add(hair);
  if (def.id === "ronaldo") {
    const quiff = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.07), hairMat);
    quiff.position.set(0, 0.235, 0.045);
    quiff.rotation.x = -0.15;
    head.add(quiff);
  } else {
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.075, 0.055), hairMat);
    beard.position.set(0, 0.015, 0.095);
    head.add(beard);
  }

  // arms: shoulder pivot → upper (sleeve) → elbow → forearm (skin) + hand/glove
  const mkArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 0.5, 0);
    torso.add(shoulder);
    const upper = capsule(0.052, 0.16, sleeveMat);
    upper.position.y = -0.12;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);
    const fore = capsule(0.045, 0.15, skinMat);
    fore.position.y = -0.11;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skinMat);
    hand.position.y = -0.235;
    hand.castShadow = true;
    elbow.add(hand);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), new THREE.MeshLambertMaterial({ color: "#C9E265" }));
    glove.position.y = -0.24;
    glove.visible = false;
    elbow.add(glove);
    return { shoulder, elbow, glove };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // legs: hip pivot → thigh (shorts upper + skin lower) → knee → sock shin + boot
  const mkLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.105, -0.06, 0);
    hips.add(hip);
    const shortLeg = capsule(0.082, 0.1, shortsMat);
    shortLeg.position.y = -0.1;
    hip.add(shortLeg);
    const thigh = capsule(0.068, 0.16, skinMat);
    thigh.position.y = -0.28;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = capsule(0.055, 0.2, sockMat);
    shin.position.y = -0.17;
    knee.add(shin);
    const boot = new THREE.Group();
    boot.position.set(0, -0.38, 0.03);
    knee.add(boot);
    const bootBody = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.075, 0.19), bootMat);
    bootBody.position.z = 0.03;
    bootBody.castShadow = true;
    boot.add(bootBody);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), bootMat);
    toe.position.set(0, -0.01, 0.13);
    boot.add(toe);
    return { hip, knee };
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  return {
    def,
    root,
    hips,
    torso,
    head,
    thighL: legL.hip,
    shinL: legL.knee,
    thighR: legR.hip,
    shinR: legR.knee,
    armUL: armL.shoulder,
    armLL: armL.elbow,
    armUR: armR.shoulder,
    armLR: armR.elbow,
    gloves: [armL.glove, armR.glove],
    pos: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    yaw: 0,
    crouch: 0,
    lie: 0,
    lieDir: 1,
  };
}

/* ── poses (procedural, continuous — v2 with elbows + weight) ───────────── */

function zeroPose(r: Rig) {
  for (const j of [r.hips, r.torso, r.head, r.thighL, r.shinL, r.thighR, r.shinR, r.armUL, r.armLL, r.armUR, r.armLR]) {
    j.rotation.set(0, 0, 0);
  }
  r.crouch = 0;
  r.offset.set(0, 0, 0);
}

function idlePose(r: Rig, t: number) {
  const b = Math.sin(t * 1.7 + r.def.number);
  const w = Math.sin(t * 0.6 + r.def.number * 2);
  r.torso.rotation.x = 0.03 + b * 0.012;
  r.torso.rotation.z = w * 0.02;
  r.head.rotation.x = -0.04;
  r.head.rotation.y = Math.sin(t * 0.35) * 0.15;
  r.armUL.rotation.z = 0.1;
  r.armUR.rotation.z = -0.1;
  r.armLL.rotation.x = -0.28 + b * 0.03;
  r.armLR.rotation.x = -0.28 - b * 0.03;
  r.crouch = -0.005 + b * 0.004;
}

function walkPose(r: Rig, t: number, amp = 0.55) {
  const w = t * 7.5;
  const sw = Math.sin(w);
  r.thighL.rotation.x = sw * amp;
  r.thighR.rotation.x = -sw * amp;
  // knee flexes on the recovering leg
  r.shinL.rotation.x = Math.max(0, -Math.sin(w - 0.6)) * amp * 1.35;
  r.shinR.rotation.x = Math.max(0, Math.sin(w - 0.6)) * amp * 1.35;
  // pumping arms with bent elbows, torso counter-rotation
  r.armUL.rotation.x = -sw * amp * 0.75;
  r.armUR.rotation.x = sw * amp * 0.75;
  r.armLL.rotation.x = -0.95;
  r.armLR.rotation.x = -0.95;
  r.armUL.rotation.z = 0.12;
  r.armUR.rotation.z = -0.12;
  r.torso.rotation.x = 0.1 + amp * 0.1;
  r.torso.rotation.y = -sw * 0.1;
  r.head.rotation.x = -0.1;
  r.crouch = -0.015 - Math.abs(Math.cos(w)) * 0.02;
}

function keeperReadyPose(r: Rig, t: number) {
  const sway = Math.sin(t * 1.35 + 1.7);
  const hop = Math.abs(Math.sin(t * 2.7));
  r.crouch = -0.21;
  r.offset.x = sway * 0.18;
  r.offset.y = hop * 0.025;
  r.hips.rotation.x = 0.3;
  r.torso.rotation.x = 0.36;
  r.torso.rotation.z = sway * 0.04;
  r.head.rotation.x = -0.55;
  r.thighL.rotation.x = -0.7;
  r.shinL.rotation.x = 1.05;
  r.thighR.rotation.x = -0.7;
  r.shinR.rotation.x = 1.05;
  r.thighL.rotation.z = 0.12;
  r.thighR.rotation.z = -0.12;
  // arms loaded forward, palms out
  r.armUL.rotation.x = -0.55;
  r.armUR.rotation.x = -0.55;
  r.armUL.rotation.z = 0.75;
  r.armUR.rotation.z = -0.75;
  r.armLL.rotation.x = -1.15;
  r.armLR.rotation.x = -1.15;
}

function strikePose(r: Rig, k: number) {
  // plant leg = left (bent, carrying weight); kick leg = right
  if (k < 0.35) {
    const u = ease(k / 0.35);
    r.thighR.rotation.x = -1.3 * u;
    r.shinR.rotation.x = 1.45 * u;
    r.thighL.rotation.x = 0.22 * u;
    r.shinL.rotation.x = 0.32 * u;
    r.torso.rotation.x = -0.14 * u;
    r.torso.rotation.y = 0.28 * u;
    r.armUL.rotation.x = -1.15 * u;
    r.armLL.rotation.x = -0.5 * u;
    r.armUR.rotation.x = 0.55 * u;
    r.crouch = -0.05 * u;
  } else if (k < 0.58) {
    const u = ease((k - 0.35) / 0.23);
    r.thighR.rotation.x = -1.3 + 2.5 * u;
    r.shinR.rotation.x = 1.45 - 1.35 * u;
    r.thighL.rotation.x = 0.22 - 0.1 * u;
    r.shinL.rotation.x = 0.32 - 0.12 * u;
    r.torso.rotation.x = -0.14 + 0.52 * u;
    r.torso.rotation.y = 0.28 - 0.55 * u;
    r.armUL.rotation.x = -1.15 + 1.5 * u;
    r.armLL.rotation.x = -0.5 + 0.3 * u;
    r.armUR.rotation.x = 0.55 - 1.0 * u;
    r.offset.y = 0.06 * Math.sin(u * Math.PI);
    r.crouch = -0.05 + 0.03 * u;
  } else {
    const u = ease((k - 0.58) / 0.42);
    r.thighR.rotation.x = 1.2 - 0.55 * u;
    r.shinR.rotation.x = 0.1 + 0.3 * u;
    r.thighL.rotation.x = 0.12;
    r.shinL.rotation.x = 0.2;
    r.torso.rotation.x = 0.38 - 0.2 * u;
    r.torso.rotation.y = -0.27 + 0.15 * u;
    r.armUL.rotation.x = 0.35 - 0.25 * u;
    r.armUR.rotation.x = -0.45 + 0.35 * u;
  }
  r.armUL.rotation.z = 0.4;
  r.armUR.rotation.z = -0.4;
  r.head.rotation.x = 0.05;
}

function divePose(r: Rig, dir: number, k: number, reachX: number) {
  if (dir === 0) {
    // star jump block
    const u = ease(Math.min(1, k * 1.5));
    r.crouch = k < 0.14 ? -0.32 * ease(k / 0.14) : -0.32 + 0.36 * ease(Math.min(1, (k - 0.14) / 0.4));
    r.offset.y = k < 0.14 ? 0 : Math.sin(Math.min(1, (k - 0.14) / 0.86) * Math.PI) * 0.5;
    r.armUL.rotation.z = 2.5 * u;
    r.armUR.rotation.z = -2.5 * u;
    r.armLL.rotation.x = -0.15;
    r.armLR.rotation.x = -0.15;
    r.thighL.rotation.z = 0.42 * u;
    r.thighR.rotation.z = -0.42 * u;
    r.head.rotation.x = -0.35;
    return;
  }
  // anticipation dip, then the explosive lateral dive
  if (k < 0.16) {
    const u = ease(k / 0.16);
    r.crouch = -0.34 * u;
    r.offset.x = -dir * 0.1 * u; // small counter-step
    r.armUL.rotation.z = 0.6 * u;
    r.armUR.rotation.z = -0.6 * u;
    r.thighL.rotation.x = -0.8 * u;
    r.shinL.rotation.x = 1.1 * u;
    r.thighR.rotation.x = -0.8 * u;
    r.shinR.rotation.x = 1.1 * u;
    r.torso.rotation.x = 0.4 * u;
    return;
  }
  const u = ease(Math.min(1, (k - 0.16) / 0.62));
  const land = clamp01((k - 0.85) / 0.15);
  r.lie = u * 1.38;
  r.lieDir = dir;
  r.offset.x = dir * reachX * u;
  r.offset.y = Math.sin(Math.min(1, (k - 0.16) / 0.84) * Math.PI) * 1.0 * (1 - land * 0.4) + u * 0.16;
  // lead arm punches to the corner, trail arm across the body
  if (dir > 0) {
    r.armUR.rotation.z = -2.85 * u;
    r.armLR.rotation.x = -0.12;
    r.armUL.rotation.z = -0.7 * u;
    r.armUL.rotation.x = -0.5 * u;
  } else {
    r.armUL.rotation.z = 2.85 * u;
    r.armLL.rotation.x = -0.12;
    r.armUR.rotation.z = 0.7 * u;
    r.armUR.rotation.x = -0.5 * u;
  }
  // lead leg extends, trail leg trails bent
  r.thighL.rotation.x = (dir > 0 ? -0.2 : -0.55) * u;
  r.thighR.rotation.x = (dir > 0 ? -0.55 : -0.2) * u;
  r.shinL.rotation.x = (dir > 0 ? 0.25 : 0.75) * u;
  r.shinR.rotation.x = (dir > 0 ? 0.75 : 0.25) * u;
  r.torso.rotation.x = 0.12 * u;
  r.head.rotation.z = -dir * 0.32 * u;
}

function celebrateSiuu(r: Rig, k: number, t: number) {
  if (k < 0.3) {
    walkPose(r, t, 0.75);
  } else if (k < 0.52) {
    const u = (k - 0.3) / 0.22;
    r.offset.y = Math.sin(u * Math.PI) * 0.8;
    r.yaw += Math.PI * 2 * ease(u);
    r.armUL.rotation.z = 0.6;
    r.armUR.rotation.z = -0.6;
    r.armLL.rotation.x = -0.6;
    r.armLR.rotation.x = -0.6;
    r.thighL.rotation.x = -0.55;
    r.thighR.rotation.x = -0.55;
    r.shinL.rotation.x = 0.8;
    r.shinR.rotation.x = 0.8;
  } else {
    // THE stance
    const u = ease(Math.min(1, (k - 0.52) / 0.1));
    r.thighL.rotation.z = 0.38 * u;
    r.thighR.rotation.z = -0.38 * u;
    r.armUL.rotation.z = 0.95 * u;
    r.armUR.rotation.z = -0.95 * u;
    r.armUL.rotation.x = 0.6 * u;
    r.armUR.rotation.x = 0.6 * u;
    r.armLL.rotation.x = -0.1;
    r.armLR.rotation.x = -0.1;
    r.torso.rotation.x = -0.2 * u;
    r.head.rotation.x = 0.14 * u;
    r.crouch = -0.07 * u + Math.sin(t * 2) * 0.004;
  }
}

function celebrateMessi(r: Rig, k: number, t: number) {
  const u = ease(Math.min(1, k * 2.2));
  r.armUL.rotation.z = 2.2 * u;
  r.armUR.rotation.z = -2.2 * u;
  r.armUL.rotation.x = -0.45 * u;
  r.armUR.rotation.x = -0.45 * u;
  if (k > 0.5) {
    const v = ease(Math.min(1, (k - 0.5) * 3));
    r.armLL.rotation.x = -1.0 * v; // fingers to the sky
    r.armLR.rotation.x = -1.0 * v;
  }
  r.head.rotation.x = -0.45 * u;
  r.torso.rotation.x = -0.12 * u;
  walkPose(r, t * 0.4, 0.14);
  r.armLL.rotation.x = Math.min(r.armLL.rotation.x, -0.2);
  r.armLR.rotation.x = Math.min(r.armLR.rotation.x, -0.2);
}

function keeperCelebrate(r: Rig, k: number, t: number) {
  const pump = Math.abs(Math.sin(t * 4.4));
  r.armUR.rotation.x = -2.5 - pump * 0.25;
  r.armLR.rotation.x = -1.5;
  r.armUL.rotation.x = -1.4;
  r.armLL.rotation.x = -1.2;
  r.torso.rotation.x = -0.14;
  r.head.rotation.x = -0.3;
  r.offset.y = pump * 0.2;
  r.thighL.rotation.x = -0.15;
  r.thighR.rotation.x = -pump * 0.6;
  r.shinR.rotation.x = pump * 0.9;
}

function dejectedPose(r: Rig, k: number) {
  const u = ease(Math.min(1, k * 1.8));
  r.armUL.rotation.x = -2.6 * u;
  r.armUR.rotation.x = -2.6 * u;
  r.armUL.rotation.z = -0.45 * u;
  r.armUR.rotation.z = 0.45 * u;
  r.armLL.rotation.x = -2.2 * u;
  r.armLR.rotation.x = -2.2 * u;
  r.torso.rotation.x = 0.32 * u;
  r.head.rotation.x = 0.5 * u;
}

/* ── the scene ──────────────────────────────────────────────────────────── */

export type ZoneAnchor = { zone: Zone; x: number; y: number }; // CSS %

export class PenaltyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;

  private ronaldo!: Rig;
  private messi!: Rig;
  private ball!: THREE.Mesh;
  private netBack!: THREE.Mesh;
  private netBase!: Float32Array;
  private crowd!: THREE.InstancedMesh;
  private crowdBase!: { x: number; y: number; z: number; ph: number }[];
  private crowdHype = 0;
  private jumboTex!: THREE.CanvasTexture;
  private zonePanels: Record<Zone, THREE.Mesh> = {} as Record<Zone, THREE.Mesh>;
  private confetti!: THREE.Points;
  private confettiData!: { v: THREE.Vector3; life: number }[];
  private debris!: THREE.Points;
  private debrisData!: { v: THREE.Vector3; life: number }[];
  private trail!: THREE.Points;
  private trailPos: THREE.Vector3[] = [];

  private phase: Phase = "vote";
  private phaseAt = 0;
  private kick: KickRecord | null = null;
  private kickShooter: PlayerId = "ronaldo";
  private kickAt = 0;
  private resultAt = 0;
  private matchEndAt = 0;
  private winner: PlayerId | null = null;
  private netHit: { x: number; y: number; at: number } | null = null;
  private contactDone = false;
  private shake = 0;
  private lastNow = 0;
  private frameDt = 0.016;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    // preserveDrawingBuffer lets capture tools and screenshots read frames at any time
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 200);

    this.buildWorld();
    this.ronaldo = makePlayer(PLAYERS.ronaldo, this.scene);
    this.messi = makePlayer(PLAYERS.messi, this.scene);
    this.resize();
  }

  dispose(): void {
    this.disposed = true;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize(): void {
    const w = this.container.clientWidth || 540;
    const h = this.container.clientHeight || 960;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Screen anchors (CSS %) of the three goal zones — lets the 2D vote markers
   *  sit exactly on the goal, FIFA-style. */
  zoneAnchors(): ZoneAnchor[] {
    const out: ZoneAnchor[] = [];
    const v = new THREE.Vector3();
    for (const z of ["left", "center", "right"] as Zone[]) {
      v.set(ZONE_X[z], 1.15, GOAL_Z).project(this.camera);
      out.push({ zone: z, x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100 });
    }
    return out;
  }

  /* ── world ────────────────────────────────────────────────────────────── */

  private buildWorld() {
    const sc = this.scene;
    sc.background = new THREE.Color("#0B1730");
    sc.fog = new THREE.Fog("#0B1730", 40, 90);

    sc.add(new THREE.HemisphereLight("#9DB8E8", "#14351C", 0.85));
    sc.add(new THREE.AmbientLight("#405070", 0.35));
    const sun = new THREE.DirectionalLight("#FFF4D6", 1.7);
    sun.position.set(9, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.far = 50;
    sc.add(sun);

    // pitch (real penalty geometry: spot at z=0, goal line at z=-11)
    const PW = 46;
    const PD = 40;
    const pitchTex = canvasTexture(1024, 1024, (c) => {
      const px = (x: number) => ((x + PW / 2) / PW) * 1024;
      const pz = (z: number) => ((z + 14) / PD) * 1024;
      for (let i = 0; i < 10; i++) {
        c.fillStyle = i % 2 ? "#2E8B3D" : "#288036";
        c.fillRect(0, (1024 / 10) * i, 1024, 1024 / 10 + 1);
      }
      c.strokeStyle = "rgba(255,255,255,0.92)";
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(px(-PW / 2), pz(GOAL_Z));
      c.lineTo(px(PW / 2), pz(GOAL_Z));
      c.stroke();
      c.strokeRect(px(-20.15), pz(GOAL_Z), px(20.15) - px(-20.15), pz(GOAL_Z + 16.5) - pz(GOAL_Z));
      c.strokeRect(px(-9.16), pz(GOAL_Z), px(9.16) - px(-9.16), pz(GOAL_Z + 5.5) - pz(GOAL_Z));
      c.fillStyle = "rgba(255,255,255,0.95)";
      c.beginPath();
      c.arc(px(0), pz(0), 4.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(px(0), pz(0), pz(9.15) - pz(0), Math.PI * 0.22, Math.PI * 0.78);
      c.stroke();
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), new THREE.MeshLambertMaterial({ map: pitchTex }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.z = 6;
    pitch.receiveShadow = true;
    sc.add(pitch);

    // goal frame
    const postMat = new THREE.MeshLambertMaterial({ color: "#F4F6F8" });
    for (const x of [-GOAL_W / 2, GOAL_W / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_H + 0.06, 12), postMat);
      post.position.set(x, GOAL_H / 2, GOAL_Z);
      post.castShadow = true;
      sc.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_W + 0.12, 12), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_H, GOAL_Z);
    sc.add(bar);

    // net
    const netTex = canvasTexture(256, 128, (c) => {
      c.clearRect(0, 0, 256, 128);
      c.strokeStyle = "rgba(235,240,248,0.5)";
      c.lineWidth = 1;
      for (let x = 0; x <= 256; x += 10) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, 128);
        c.stroke();
      }
      for (let y = 0; y <= 128; y += 10) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(256, y);
        c.stroke();
      }
    });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = new THREE.MeshLambertMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.netBack = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_H, 28, 12), netMat);
    this.netBack.position.set(0, GOAL_H / 2, GOAL_Z - 0.85);
    sc.add(this.netBack);
    this.netBase = Float32Array.from(this.netBack.geometry.getAttribute("position").array);
    const netTop = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 0.9), netMat);
    netTop.rotation.x = -Math.PI / 2 - 0.18;
    netTop.position.set(0, GOAL_H - 0.02, GOAL_Z - 0.42);
    sc.add(netTop);
    for (const x of [-GOAL_W / 2, GOAL_W / 2]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(0.9, GOAL_H), netMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(x, GOAL_H / 2, GOAL_Z - 0.42);
      sc.add(side);
    }

    // zone glow panels (vote shares)
    const zoneGeo = new THREE.PlaneGeometry(GOAL_W / 3 - 0.12, GOAL_H - 0.14);
    (["left", "center", "right"] as Zone[]).forEach((z) => {
      const mat = new THREE.MeshBasicMaterial({ color: "#7FD8FF", transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(zoneGeo, mat);
      m.position.set(ZONE_X[z], GOAL_H / 2, GOAL_Z - 0.05);
      this.zonePanels[z] = m;
      sc.add(m);
    });

    // ball
    const ballTex = canvasTexture(128, 128, (c) => {
      c.fillStyle = "#F6F7F9";
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = "#15181D";
      for (let i = 0; i < 14; i++) {
        const x = (i * 47) % 128;
        const y = (i * 31 + 20) % 128;
        c.beginPath();
        c.arc(x, y, 9, 0, Math.PI * 2);
        c.fill();
      }
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 16), new THREE.MeshLambertMaterial({ map: ballTex }));
    this.ball.castShadow = true;
    this.ball.position.set(0, BALL_R, 0);
    sc.add(this.ball);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    this.trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: "#FFD75E", size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
    this.trail.visible = false;
    sc.add(this.trail);

    this.buildStands();
    this.buildDressing();
    this.buildParticles();
  }

  private buildStands() {
    const sc = this.scene;
    const seat = new THREE.BoxGeometry(0.42, 0.5, 0.42);
    const palette = ["#31405E", "#3C4E71", "#22304A", "#C8CFDA", "#B3161F", "#75C4EA", "#39547E", "#802431"].map((c) => new THREE.Color(c));
    const spots: { x: number; y: number; z: number; ph: number }[] = [];
    const addStand = (cx: number, cz: number, w: number, yaw: number) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 6.4, 9), new THREE.MeshLambertMaterial({ color: "#131B2C" }));
      base.position.set(cx, 3.0, cz);
      base.rotation.y = yaw;
      sc.add(base);
      const rows = 9;
      const cols = Math.floor(w / 0.85);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lx = (c - cols / 2) * 0.85 + (r % 2) * 0.3;
          const ly = 1.1 + r * 0.62;
          const lz = r * 0.72;
          const cos = Math.cos(yaw);
          const sin = Math.sin(yaw);
          spots.push({ x: cx + lx * cos + lz * sin, y: ly, z: cz + lz * cos - lx * sin, ph: (r * 13 + c * 7) % 20 });
        }
      }
    };
    addStand(0, -18.5, 34, 0);
    addStand(-19, -2, 26, Math.PI / 2);
    addStand(19, -2, 26, -Math.PI / 2);

    this.crowdBase = spots;
    this.crowd = new THREE.InstancedMesh(seat, new THREE.MeshLambertMaterial(), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((s, i) => {
      m4.setPosition(s.x, s.y, s.z);
      this.crowd.setMatrixAt(i, m4);
      this.crowd.setColorAt(i, palette[(i * 7) % palette.length]);
    });
    if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
    sc.add(this.crowd);
  }

  private buildDressing() {
    const sc = this.scene;
    const boardTex = (text: string) =>
      canvasTexture(512, 64, (c) => {
        c.fillStyle = "#101826";
        c.fillRect(0, 0, 512, 64);
        c.fillStyle = "#7FD8FF";
        c.font = "800 40px system-ui";
        c.textAlign = "center";
        c.fillText(text, 256, 45);
      });
    const boards = ["CLUNOID.COM", "SHOWTIME", "CLUNOID.COM", "SHOWTIME", "CLUNOID.COM"];
    boards.forEach((t, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.85, 0.1), new THREE.MeshLambertMaterial({ map: boardTex(t), emissive: "#16273C", emissiveIntensity: 0.7 }));
      b.position.set((i - 2) * 6.8, 0.45, GOAL_Z - 2.2);
      sc.add(b);
    });

    for (const [x, z] of [
      [-15, -14],
      [15, -14],
      [-15, 9],
      [15, 9],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 13, 8), new THREE.MeshLambertMaterial({ color: "#2A3548" }));
      pole.position.set(x, 6.5, z);
      sc.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.5), new THREE.MeshBasicMaterial({ color: "#FFF7DE" }));
      head.position.set(x, 13.2, z);
      head.lookAt(0, 0, -4);
      sc.add(head);
      const glowTex = canvasTexture(128, 128, (c) => {
        const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
        g.addColorStop(0, "rgba(255,248,220,0.9)");
        g.addColorStop(1, "rgba(255,248,220,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
      });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
      glow.scale.setScalar(6);
      glow.position.set(x, 13.2, z);
      sc.add(glow);
    }

    this.jumboTex = canvasTexture(512, 192, (c) => this.drawJumbo(c, ""));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(10.5, 4, 0.4), new THREE.MeshBasicMaterial({ map: this.jumboTex }));
    screen.position.set(0, 9.6, -19.5);
    this.scene.add(screen);
  }

  private drawJumbo(c: CanvasRenderingContext2D, name: string) {
    c.fillStyle = "#0A1220";
    c.fillRect(0, 0, 512, 192);
    c.strokeStyle = "#233754";
    c.lineWidth = 6;
    c.strokeRect(4, 4, 504, 184);
    c.textAlign = "center";
    if (name) {
      c.fillStyle = "#FFD75E";
      c.font = "800 30px system-ui";
      c.fillText("LEGENDARY SUPPORTER", 256, 62);
      c.fillStyle = "#FFFFFF";
      c.font = "800 52px system-ui";
      c.fillText(name.slice(0, 16).toUpperCase(), 256, 130);
    } else {
      c.fillStyle = "#7FD8FF";
      c.font = "800 44px system-ui";
      c.fillText("CLUNOID", 256, 88);
      c.fillStyle = "#5C6B7A";
      c.font = "700 30px system-ui";
      c.fillText("PENALTY SHOWDOWN", 256, 138);
    }
  }

  private buildParticles() {
    const make = (n: number, colors: string[], size: number) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const cs = colors.map((c) => new THREE.Color(c));
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] = -50;
        const c = cs[i % cs.length];
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
      this.scene.add(pts);
      return { pts, data: Array.from({ length: n }, () => ({ v: new THREE.Vector3(), life: 0 })) };
    };
    const conf = make(700, ["#FFD75E", "#FF7A6B", "#7FD8FF", "#4ED6A4", "#FFFFFF"], 0.14);
    this.confetti = conf.pts;
    this.confettiData = conf.data;
    const deb = make(140, ["#2E8B3D", "#1F6B2D", "#8B6B3D"], 0.07);
    this.debris = deb.pts;
    this.debrisData = deb.data;
  }

  private burst(pts: THREE.Points, data: { v: THREE.Vector3; life: number }[], center: THREE.Vector3, n: number, spread: number, up: number) {
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    let spawned = 0;
    for (let i = 0; i < data.length && spawned < n; i++) {
      const d = data[i];
      if (d.life > 0) continue;
      d.life = 0.7 + Math.random() * 1.6;
      d.v.set((Math.random() - 0.5) * spread, up * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * spread);
      pos.setXYZ(i, center.x + (Math.random() - 0.5) * 0.3, center.y, center.z + (Math.random() - 0.5) * 0.3);
      spawned++;
    }
    pos.needsUpdate = true;
  }

  private updateParticles(pts: THREE.Points, data: { v: THREE.Vector3; life: number }[], dt: number, g: number) {
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= g * dt;
      pos.setXYZ(i, pos.getX(i) + d.v.x * dt, Math.max(0.02, pos.getY(i) + d.v.y * dt), pos.getZ(i) + d.v.z * dt);
      if (d.life <= 0) pos.setY(i, -50);
    }
    if (any) pos.needsUpdate = true;
  }

  /* ── events in ────────────────────────────────────────────────────────── */

  onEvents(evs: PenaltyEvent[]): void {
    const now = this.lastNow || performance.now();
    for (const e of evs) {
      if (e.kind === "phase") {
        this.phase = e.phase;
        this.phaseAt = now;
      } else if (e.kind === "kickoff") {
        this.kick = e.rec;
        this.kickShooter = e.shooter;
        this.kickAt = now;
        this.netHit = null;
        this.contactDone = false;
        this.trailPos.length = 0;
      } else if (e.kind === "result") {
        this.resultAt = now;
        if (e.rec.goal) {
          this.crowdHype = 1;
          this.burst(this.confetti, this.confettiData, new THREE.Vector3(0, 3, GOAL_Z + 2), 240, 7, 4);
        }
      } else if (e.kind === "matchEnd") {
        this.winner = e.winner;
        this.matchEndAt = now;
        this.crowdHype = 1;
        this.burst(this.confetti, this.confettiData, new THREE.Vector3(0, 6, 0), 480, 14, 4);
      } else if (e.kind === "jumbotron") {
        const cv = this.jumboTex.image as HTMLCanvasElement;
        this.drawJumbo(cv.getContext("2d")!, e.sender);
        this.jumboTex.needsUpdate = true;
      } else if (e.kind === "matchStart") {
        this.winner = null;
        const cv = this.jumboTex.image as HTMLCanvasElement;
        this.drawJumbo(cv.getContext("2d")!, "");
        this.jumboTex.needsUpdate = true;
      }
    }
  }

  /* ── per-frame ────────────────────────────────────────────────────────── */

  render(state: PenaltyState, now: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.25, this.lastNow ? (now - this.lastNow) / 1000 : 0.016);
    this.lastNow = now;
    this.frameDt = dt;
    const t = now / 1000;

    const shooter = this.kickShooter === "ronaldo" ? this.ronaldo : this.messi;
    const keeper = this.kickShooter === "ronaldo" ? this.messi : this.ronaldo;
    const stagedShooterId: PlayerId =
      this.phase === "kick" || this.phase === "result"
        ? this.kickShooter
        : state.kickIndex % 2 === 0
          ? state.shootsFirst
          : state.shootsFirst === "ronaldo"
            ? "messi"
            : "ronaldo";
    const sRig = stagedShooterId === "ronaldo" ? this.ronaldo : this.messi;
    const kRig = stagedShooterId === "ronaldo" ? this.messi : this.ronaldo;

    this.ronaldo.gloves.forEach((g) => (g.visible = kRig === this.ronaldo));
    this.messi.gloves.forEach((g) => (g.visible = kRig === this.messi));

    zeroPose(this.ronaldo);
    zeroPose(this.messi);
    this.ronaldo.lie = 0;
    this.messi.lie = 0;

    switch (this.phase) {
      case "vote":
        this.stageVote(sRig, kRig, state, t);
        break;
      case "kick":
        this.stageKick(shooter, keeper, now, t);
        break;
      case "result":
        this.stageResult(shooter, keeper, now, t);
        break;
      case "matchEnd":
        this.stageMatchEnd(now, t);
        break;
    }

    // zone glow panels follow live vote shares during the window
    const votes = state.shotVotes;
    const totalVotes = votes.left + votes.center + votes.right;
    (["left", "center", "right"] as Zone[]).forEach((z) => {
      const mat = this.zonePanels[z].material as THREE.MeshBasicMaterial;
      const share = totalVotes > 0 ? votes[z] / totalVotes : 0;
      const target = this.phase === "vote" ? 0.05 + share * 0.28 : 0;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 6);
    });

    this.applyRig(this.ronaldo);
    this.applyRig(this.messi);
    this.updateCrowd(t, dt);
    this.updateParticles(this.confetti, this.confettiData, dt, 6.5);
    this.updateParticles(this.debris, this.debrisData, dt, 9);
    this.updateNet(now);

    // camera shake (decaying), applied after staging set the camera
    if (this.shake > 0.002) {
      const a = this.shake * 0.09;
      this.camera.position.x += Math.sin(now * 0.061) * a;
      this.camera.position.y += Math.sin(now * 0.047) * a * 0.6;
      this.shake *= Math.pow(0.02, dt); // fast decay
    }

    this.renderer.render(this.scene, this.camera);
  }

  private applyRig(r: Rig) {
    r.root.position.set(r.pos.x + r.offset.x, r.crouch + r.offset.y, r.pos.z + r.offset.z);
    r.root.rotation.set(0, r.yaw, r.lie * -r.lieDir);
  }

  private walkTo(r: Rig, x: number, z: number, faceYaw: number, t: number, dt: number, speed = 2.4): boolean {
    const dx = x - r.pos.x;
    const dz = z - r.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.06) {
      r.pos.set(x, 0, z);
      r.yaw += (faceYaw - r.yaw) * Math.min(1, dt * 8);
      return true;
    }
    const step = Math.min(d, speed * dt);
    r.pos.x += (dx / d) * step;
    r.pos.z += (dz / d) * step;
    r.yaw = Math.atan2(dx, dz);
    walkPose(r, t);
    return false;
  }

  /* ── staging ──────────────────────────────────────────────────────────── */

  private stageVote(sRig: Rig, kRig: Rig, state: PenaltyState, tNow: number) {
    const dt = this.frameDt;
    const sReady = this.walkTo(sRig, 1.15, 3.1, Math.PI, tNow, dt);
    const kReady = this.walkTo(kRig, 0, -10.55, 0, tNow, dt, 3.0);
    if (sReady) {
      idlePose(sRig, tNow);
      sRig.yaw = Math.PI;
    }
    if (kReady) keeperReadyPose(kRig, tNow);
    this.ball.position.set(0, BALL_R, 0);
    this.ball.rotation.set(0, 0, 0);
    this.trail.visible = false;

    // FIFA-style fixed vote camera: ball low-center, goal + keeper upper-center
    const sway = Math.sin(tNow * 0.14) * 0.15;
    this.camera.position.set(sway, 2.05, 8.3);
    this.camera.lookAt(0, 1.42, -8);
  }

  private stageKick(shooter: Rig, keeper: Rig, now: number, tNow: number) {
    const rec = this.kick;
    if (!rec) return;
    const kt = (now - this.kickAt) / 1000;
    const flight = 0.62 - 0.24 * rec.power01;
    const targetX = this.kickTargetX(rec);
    const targetY = rec.zone === "center" ? (rec.goal && rec.dive === "center" ? 2.02 : 1.15) : 1.3;

    // ── shooter ──
    shooter.yaw = Math.PI;
    const runFrom = new THREE.Vector3(1.15, 0, 3.1);
    const contact = new THREE.Vector3(0.16, 0, 0.32);
    if (kt < KICK_SETTLE) {
      shooter.pos.copy(runFrom);
      idlePose(shooter, tNow);
      shooter.torso.rotation.x = 0.12;
      shooter.head.rotation.x = -0.22; // eyes up at the goal
    } else if (kt < KICK_CONTACT - 0.24) {
      const u = ease((kt - KICK_SETTLE) / (KICK_CONTACT - 0.24 - KICK_SETTLE));
      shooter.pos.lerpVectors(runFrom, contact, u);
      walkPose(shooter, tNow * 1.95, 0.55 + 0.35 * u); // accelerating stride
      shooter.torso.rotation.x = 0.14 + 0.12 * u;
    } else {
      shooter.pos.copy(contact);
      strikePose(shooter, clamp01((kt - (KICK_CONTACT - 0.24)) / 0.7));
    }

    // contact moment: thump FX
    if (!this.contactDone && kt >= KICK_CONTACT) {
      this.contactDone = true;
      this.burst(this.debris, this.debrisData, new THREE.Vector3(0.05, 0.05, 0.2), 26, 1.6, 2.2);
      this.shake = 0.55 + rec.power01 * 0.5;
    }

    // ── keeper ──
    keeper.pos.set(0, 0, -10.55);
    keeper.yaw = 0;
    const diveDir = rec.dive === "center" ? 0 : rec.dive === "left" ? -1 : 1;
    const reachX = 1.5 + 0.6 * rec.reach01;
    const diveStart = KICK_CONTACT - (rec.instinct ? 0.3 : 0.12); // reading it = moving early
    if (kt < diveStart) {
      keeperReadyPose(keeper, tNow);
    } else {
      divePose(keeper, diveDir, (kt - diveStart) / 0.85, reachX);
    }

    // ── ball ──
    if (kt < KICK_CONTACT) {
      this.ball.position.set(0, BALL_R, 0);
      this.trail.visible = false;
    } else {
      const fu = clamp01((kt - KICK_CONTACT) / flight);
      const saved = !rec.goal;
      const interceptU = 0.94;
      const u = saved ? Math.min(fu, interceptU) : fu;
      const bend = Math.pow(u, 1.18); // late bend toward the corner
      const bx = targetX * bend;
      const bz = (GOAL_Z + 0.15) * u;
      const arc = rec.zone === "center" ? 0.5 : 0.75;
      const by = BALL_R + (targetY - BALL_R) * u + Math.sin(u * Math.PI) * arc * (1 - rec.power01 * 0.5);
      if (saved && fu >= interceptU) {
        // caught or parried
        const holdT = (kt - KICK_CONTACT - flight * interceptU) / 0.55;
        if (rec.dive === "center") {
          this.ball.position.set(0, 1.15, -10.35); // clutched
        } else {
          // double-bounce parry away from goal
          const u2 = clamp01(holdT);
          const px = Math.sign(targetX) * (Math.abs(targetX) + 0.9);
          if (u2 < 0.55) {
            const s = u2 / 0.55;
            this.ball.position.set(bx + (px - bx) * s, Math.max(BALL_R, by * (1 - s) + Math.sin(s * Math.PI) * 0.5), bz + 1.5 * s);
          } else {
            const s = (u2 - 0.55) / 0.45;
            this.ball.position.set(px + 0.5 * s, Math.max(BALL_R, BALL_R + Math.sin(s * Math.PI) * 0.22), bz + 1.5 + 0.9 * s);
          }
        }
      } else {
        this.ball.position.set(bx, by, bz);
        if (rec.goal && fu >= 1 && !this.netHit) {
          this.netHit = { x: targetX, y: targetY, at: now };
          this.crowdHype = Math.max(this.crowdHype, 0.7);
          this.shake = Math.max(this.shake, 0.35);
        }
        if (rec.goal && fu >= 1) {
          // ball settles in the net with a soft rebound
          const settle = clamp01((kt - KICK_CONTACT - flight) / 0.45);
          const rz = GOAL_Z - 0.55 + Math.sin(settle * Math.PI) * 0.18 * (1 - settle);
          this.ball.position.set(targetX, Math.max(BALL_R, targetY - ease(settle) * (targetY - BALL_R)), rz);
        }
      }
      this.ball.rotation.x -= (0.4 + rec.power01 * 0.45) * (this.ball.position.z < -1 ? 1 : 0);
      if (rec.power01 > 0.35 && fu > 0 && fu < 1.05) {
        this.trail.visible = true;
        this.trailPos.unshift(this.ball.position.clone());
        if (this.trailPos.length > 40) this.trailPos.pop();
        const attr = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < 40; i++) {
          const p = this.trailPos[Math.min(i, this.trailPos.length - 1)] ?? this.ball.position;
          attr.setXYZ(i, p.x, p.y, p.z);
        }
        attr.needsUpdate = true;
        (this.trail.material as THREE.PointsMaterial).color.set(rec.power01 > 0.85 ? "#FF8A3C" : "#FFD75E");
      }
    }

    // ── camera: broadcast angle, then goal-line cut ──
    const cutT = KICK_CONTACT + flight * 0.6;
    if (kt < cutT) {
      const u = ease(clamp01(kt / KICK_CONTACT));
      this.camera.position.set(1.45 - u * 0.4, 2.5 - u * 0.35, 8.8 - u * 1.1);
      const baseLook = new THREE.Vector3(0.15, 1.15, -3.2);
      const look = new THREE.Vector3().lerpVectors(baseLook, this.ball.position, clamp01((kt - KICK_CONTACT + 0.1) / 0.35));
      this.camera.lookAt(look);
    } else {
      const side = targetX >= 0 ? 1 : -1;
      this.camera.position.set(side * 5.2, 1.9, GOAL_Z + 5.6);
      this.camera.lookAt(targetX * 0.6, 1.15, GOAL_Z - 0.4);
    }
  }

  private kickTargetX(rec: KickRecord): number {
    if (rec.zone === "center") return 0;
    const sign = rec.zone === "left" ? -1 : 1;
    if (rec.goal && rec.dive === rec.zone) {
      const reach = 1.5 + 0.6 * rec.reach01;
      return sign * Math.min(3.2, reach + 0.75);
    }
    return sign * 2.5;
  }

  private stageResult(shooter: Rig, keeper: Rig, now: number, tNow: number) {
    const rec = this.kick;
    const rt = (now - this.resultAt) / 1000;
    const k = clamp01(rt / 3.0);
    this.trail.visible = false;
    if (!rec) return;

    if (rec.goal) {
      const celebrating = shooter;
      if (celebrating.def.id === "ronaldo") {
        if (k < 0.3) this.walkTo(celebrating, 2.4, 3.4, 0, tNow, this.frameDt, 3.4);
        celebrateSiuu(celebrating, k, tNow);
        if (k >= 0.3) celebrating.yaw = 0.35;
      } else {
        this.walkTo(celebrating, 1.6, 3.0, 0, tNow, this.frameDt, 1.4);
        celebrateMessi(celebrating, k, tNow);
        celebrating.yaw = 0.15;
      }
      keeper.pos.set(rec.dive === "center" ? 0 : (rec.dive === "left" ? -1 : 1) * 1.6, 0, -10.4);
      keeper.yaw = 0;
      dejectedPose(keeper, k);
      const orbit = tNow * 0.5;
      this.camera.position.set(celebrating.pos.x + Math.sin(orbit) * 3.6, 1.7, celebrating.pos.z + Math.cos(orbit) * 3.6);
      this.camera.lookAt(celebrating.pos.x, 1.15, celebrating.pos.z);
    } else {
      keeper.pos.set(0, 0, -9.9);
      keeper.yaw = 0;
      keeperCelebrate(keeper, k, tNow);
      shooter.pos.set(0.4, 0, 0.6);
      shooter.yaw = Math.PI;
      dejectedPose(shooter, k);
      const orbit = tNow * 0.45;
      this.camera.position.set(Math.sin(orbit) * 3.4, 1.8, -9.9 + Math.cos(orbit) * 3.4);
      this.camera.lookAt(0, 1.2, -9.9);
    }
  }

  private stageMatchEnd(now: number, tNow: number) {
    const mt = (now - this.matchEndAt) / 1000;
    const k = clamp01(mt / 3.5);
    const win = this.winner === "messi" ? this.messi : this.ronaldo;
    const lose = this.winner === "messi" ? this.ronaldo : this.messi;
    this.walkTo(win, 0, 2.2, 0, tNow, this.frameDt, 1.8);
    if (win.def.id === "ronaldo") celebrateSiuu(win, Math.min(1, k + 0.3), tNow);
    else celebrateMessi(win, k, tNow);
    lose.pos.set(-2.4, 0, 0.8);
    lose.yaw = 0.4;
    dejectedPose(lose, k);
    this.ball.position.set(0.6, BALL_R, 0.4);
    if (Math.random() < 0.22) this.burst(this.confetti, this.confettiData, new THREE.Vector3((Math.random() - 0.5) * 10, 7, (Math.random() - 0.5) * 6), 22, 4, 3);

    const orbit = tNow * 0.3;
    this.camera.position.set(Math.sin(orbit) * 9.5, 4.2, 2.2 + Math.cos(orbit) * 9.5);
    this.camera.lookAt(0, 1.2, 1.2);
  }

  /* ── ambient systems ──────────────────────────────────────────────────── */

  private updateCrowd(t: number, dt: number) {
    this.crowdHype = Math.max(0, this.crowdHype - dt * 0.35);
    const amp = 0.05 + this.crowdHype * 0.3;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < this.crowdBase.length; i++) {
      const s = this.crowdBase[i];
      const y = s.y + Math.abs(Math.sin(t * (2 + this.crowdHype * 4) + s.ph)) * amp;
      m4.setPosition(s.x, y, s.z);
      this.crowd.setMatrixAt(i, m4);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  private updateNet(now: number) {
    if (!this.netHit) return;
    const age = (now - this.netHit.at) / 1000;
    const attr = this.netBack.geometry.getAttribute("position") as THREE.BufferAttribute;
    if (age > 1.1) {
      attr.array.set(this.netBase);
      attr.needsUpdate = true;
      this.netHit = null;
      return;
    }
    const decay = Math.exp(-age * 4) * Math.sin(age * 26) * 0.4 + Math.exp(-age * 6) * 0.5;
    for (let i = 0; i < attr.count; i++) {
      const bx = this.netBase[i * 3];
      const by = this.netBase[i * 3 + 1];
      const dx = bx - this.netHit.x;
      const dy = by + GOAL_H / 2 - this.netHit.y;
      const g = Math.exp(-(dx * dx + dy * dy) * 1.4);
      attr.setZ(i, this.netBase[i * 3 + 2] - g * decay);
    }
    attr.needsUpdate = true;
  }
}
