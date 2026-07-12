"use client";

/**
 * PENALTY SHOOTOUT — the 3D scene (three.js), v3 REALISM PASS.
 *
 * Rendering: ACES filmic tone mapping, image-based environment lighting (PMREM
 * room environment), physically-based materials, and an UnrealBloom pass so
 * floodlights, powered shots and the jumbotron glow like a night broadcast.
 *
 * Players: anatomical procedural humans — tapered muscled limbs with joint
 * spheres, deltoids, chest/waist/pelvis massing, real head shapes (jaw, ears,
 * nose, brows, eyes), kit details (collar, cuffs, shorts stripe, sock bands,
 * colored boots), crisp back name/number decals. Every joint runs through an
 * exponential smoothing layer so motion is fluid, and heads track the ball.
 *
 * Goal: a true 3D net cage — sagging back net, top net, shaped side nets, rear
 * stanchions and ground bar. The ball flies THROUGH the goal mouth with
 * gravity-correct physics (initial velocity solved for the target, banana curl
 * on side shots), decelerates into the bulging net, drops and settles; parries
 * hand off to a velocity integrator with real bounces.
 *
 * The scene remains a pure VIEW of the resolved kick — outcome always matches.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { PLAYERS, type PlayerDef, type PlayerId, type Zone } from "./config";
import type { KickRecord, PenaltyEvent, PenaltyState, Phase } from "./penalty";

/* ── constants ──────────────────────────────────────────────────────────── */

const GOAL_Z = -11;
const GOAL_W = 7.32;
const GOAL_H = 2.44;
const NET_DEPTH = 0.72; // how far the cage extends behind the line
const BALL_R = 0.11;
const G = 9.81;

const KICK_SETTLE = 0.45;
const KICK_CONTACT = 2.7;
const ZONE_X: Record<Zone, number> = { left: -2.5, center: 0, right: 2.5 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── canvas texture helper ──────────────────────────────────────────────── */

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ── player rig (v3 — anatomical humans) ────────────────────────────────── */

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

/** Tapered limb segment (muscle → joint) with a joint sphere at the far end. */
function taper(rTop: number, rBot: number, len: number, mat: THREE.Material, jointR = 0): THREE.Group {
  const g = new THREE.Group();
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 12), mat);
  seg.position.y = -len / 2;
  seg.castShadow = true;
  g.add(seg);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(rTop * 1.02, 10, 8), mat);
  cap.castShadow = true;
  g.add(cap);
  if (jointR > 0) {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(jointR, 10, 8), mat);
    joint.position.y = -len;
    joint.castShadow = true;
    g.add(joint);
  }
  return g;
}

function jerseyTexture(def: PlayerDef): THREE.CanvasTexture {
  return canvasTexture(256, 256, (c) => {
    c.fillStyle = def.jersey;
    c.fillRect(0, 0, 256, 256);
    if (def.striped) {
      c.fillStyle = def.jersey2;
      for (let i = 0; i < 6; i++) c.fillRect(i * 44, 0, 20, 256);
    }
    c.fillStyle = def.jersey2;
    c.fillRect(0, 0, 256, 12);
    c.fillRect(0, 246, 256, 10);
  });
}

function backDecal(def: PlayerDef): THREE.CanvasTexture {
  return canvasTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.textAlign = "center";
    c.fillStyle = def.striped ? "#0F2740" : "#FFFFFF";
    c.font = "800 38px system-ui";
    c.fillText(def.shirt, 128, 54);
    c.font = "800 168px system-ui";
    c.fillText(String(def.number), 128, 214);
  });
}

function makePlayer(def: PlayerDef, scene: THREE.Scene): Rig {
  const root = new THREE.Group();
  root.scale.setScalar(def.height);
  scene.add(root);

  const skin = new THREE.MeshStandardMaterial({ color: def.skin, roughness: 0.62 });
  const cloth = new THREE.MeshStandardMaterial({ map: jerseyTexture(def), roughness: 0.92 });
  const sleeve = new THREE.MeshStandardMaterial({ color: def.jersey, roughness: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: def.jersey2, roughness: 0.92 });
  const shorts = new THREE.MeshStandardMaterial({ color: def.shorts, roughness: 0.92 });
  const sock = new THREE.MeshStandardMaterial({ color: def.socks, roughness: 0.9 });
  const hairM = new THREE.MeshStandardMaterial({ color: def.hair, roughness: 0.75 });
  const boot = new THREE.MeshStandardMaterial({ color: def.id === "ronaldo" ? "#E8541F" : "#1E63C8", roughness: 0.35, metalness: 0.1 });

  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  // pelvis + shorts
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), shorts);
  pelvis.scale.set(1.18, 0.72, 0.88);
  pelvis.position.y = -0.03;
  pelvis.castShadow = true;
  hips.add(pelvis);

  // torso: waist → chest → shoulders
  const torso = new THREE.Group();
  torso.position.y = 0.05;
  hips.add(torso);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.145, 0.24, 14), cloth);
  waist.position.y = 0.14;
  waist.castShadow = true;
  torso.add(waist);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.195, 16, 12), cloth);
  chest.scale.set(1.08, 0.92, 0.7);
  chest.position.y = 0.36;
  chest.castShadow = true;
  torso.add(chest);
  for (const sx of [-1, 1]) {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), sleeve);
    delt.position.set(sx * 0.205, 0.485, 0);
    delt.castShadow = true;
    torso.add(delt);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.014, 8, 16), trim);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.545;
  torso.add(collar);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.08, 10), skin);
  neck.position.y = 0.585;
  torso.add(neck);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.4), new THREE.MeshBasicMaterial({ map: backDecal(def), transparent: true, depthWrite: false }));
  back.position.set(0, 0.34, -0.145);
  back.rotation.y = Math.PI;
  torso.add(back);

  // head: skull + jaw + features
  const head = new THREE.Group();
  head.position.y = 0.64;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), skin);
  skull.scale.set(0.92, 1.08, 1.0);
  skull.position.y = 0.105;
  skull.castShadow = true;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 10), skin);
  jaw.scale.set(0.82, 0.72, 0.86);
  jaw.position.set(0, 0.035, 0.02);
  head.add(jaw);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), skin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(sx * 0.105, 0.1, 0);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), new THREE.MeshBasicMaterial({ color: "#101010" }));
    eye.position.set(sx * 0.042, 0.115, 0.098);
    head.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.012), hairM);
    brow.position.set(sx * 0.042, 0.142, 0.1);
    head.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), skin);
  nose.scale.set(0.8, 1, 1.2);
  nose.position.set(0, 0.095, 0.115);
  head.add(nose);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.119, 20, 12, 0, Math.PI * 2, 0, def.id === "messi" ? Math.PI * 0.62 : Math.PI * 0.52), hairM);
  hair.scale.set(0.94, 1.1, 1.02);
  hair.position.y = 0.106;
  head.add(hair);
  if (def.id === "ronaldo") {
    const quiff = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.075), hairM);
    quiff.position.set(0, 0.222, 0.05);
    quiff.rotation.x = -0.2;
    head.add(quiff);
  } else {
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.092, 12, 10), hairM);
    beard.scale.set(0.84, 0.62, 0.8);
    beard.position.set(0, 0.012, 0.035);
    head.add(beard);
  }

  // arms
  const mkArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 0.47, 0);
    torso.add(shoulder);
    const upper = taper(0.054, 0.044, 0.24, sleeve, 0.046);
    shoulder.add(upper);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.01, 8, 14), trim);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.1;
    shoulder.add(cuff);
    const elbow = new THREE.Group();
    elbow.position.y = -0.25;
    shoulder.add(elbow);
    const fore = taper(0.043, 0.033, 0.22, skin);
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
    hand.scale.set(0.78, 1.15, 1.3);
    hand.position.y = -0.25;
    hand.castShadow = true;
    elbow.add(hand);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), new THREE.MeshStandardMaterial({ color: "#C9E265", roughness: 0.6 }));
    glove.scale.set(0.85, 1.1, 1.25);
    glove.position.y = -0.255;
    glove.visible = false;
    elbow.add(glove);
    return { shoulder, elbow, glove };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // legs
  const mkLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.06, 0);
    hips.add(hip);
    const shortLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.08, 0.16, 12), shorts);
    shortLeg.position.y = -0.08;
    shortLeg.castShadow = true;
    hip.add(shortLeg);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.15, 0.02), trim);
    stripe.position.set(side * 0.085, -0.08, 0.06);
    hip.add(stripe);
    const thigh = taper(0.078, 0.056, 0.26, skin, 0.058);
    thigh.position.y = -0.15;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const calf = taper(0.056, 0.036, 0.32, sock);
    knee.add(calf);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 8, 14), trim);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.03;
    knee.add(band);
    const bootG = new THREE.Group();
    bootG.position.set(0, -0.36, 0.025);
    knee.add(bootG);
    const bootBody = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), boot);
    bootBody.scale.set(0.78, 0.62, 1.7);
    bootBody.position.set(0, -0.015, 0.04);
    bootBody.castShadow = true;
    bootG.add(bootBody);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.235), new THREE.MeshStandardMaterial({ color: "#111318", roughness: 0.5 }));
    sole.position.set(0, -0.052, 0.045);
    bootG.add(sole);
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

/* ── poses (unchanged API — smoothing layer added at apply time) ────────── */

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
  r.shinL.rotation.x = Math.max(0, -Math.sin(w - 0.6)) * amp * 1.35;
  r.shinR.rotation.x = Math.max(0, Math.sin(w - 0.6)) * amp * 1.35;
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
  r.armUL.rotation.x = -0.55;
  r.armUR.rotation.x = -0.55;
  r.armUL.rotation.z = 0.75;
  r.armUR.rotation.z = -0.75;
  r.armLL.rotation.x = -1.15;
  r.armLR.rotation.x = -1.15;
}

function strikePose(r: Rig, k: number) {
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
  if (k < 0.16) {
    const u = ease(k / 0.16);
    r.crouch = -0.34 * u;
    r.offset.x = -dir * 0.1 * u;
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
    r.armLL.rotation.x = -1.0 * v;
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

export type ZoneAnchor = { zone: Zone; x: number; y: number };

export class PenaltyScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
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
  private kick: KickRecord | null = null;
  private kickShooter: PlayerId = "ronaldo";
  private kickAt = 0;
  private resultAt = 0;
  private matchEndAt = 0;
  private winner: PlayerId | null = null;
  private netHit: { x: number; y: number; at: number } | null = null;
  private contactDone = false;
  private shake = 0;
  /** free-ball integrator after arrival (net catch or parry) */
  private ballSim: { p: THREE.Vector3; v: THREE.Vector3 } | null = null;
  private smoothMap = new Map<THREE.Group, THREE.Euler>();
  private lastNow = 0;
  private frameDt = 0.016;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 200);

    // image-based lighting: makes PBR materials read like a real broadcast
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1080, 1920), 0.5, 0.85, 0.82));
    this.composer.addPass(new OutputPass());

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
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize(): void {
    const w = this.container.clientWidth || 540;
    const h = this.container.clientHeight || 960;
    const pr = Math.min(1.6, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

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
    sc.background = new THREE.Color("#0A1428");
    sc.fog = new THREE.Fog("#0A1428", 42, 95);

    sc.add(new THREE.HemisphereLight("#93AEDF", "#123018", 0.7));
    sc.add(new THREE.AmbientLight("#36486B", 0.3));
    const key = new THREE.DirectionalLight("#FFF2D2", 2.0);
    key.position.set(9, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    key.shadow.camera.far = 50;
    key.shadow.bias = -0.0004;
    sc.add(key);
    const fill = new THREE.DirectionalLight("#8FB4FF", 0.55);
    fill.position.set(-10, 9, -6);
    sc.add(fill);

    // pitch
    const PW = 46;
    const PD = 40;
    const pitchTex = canvasTexture(2048, 2048, (c) => {
      const px = (x: number) => ((x + PW / 2) / PW) * 2048;
      const pz = (z: number) => ((z + 14) / PD) * 2048;
      for (let i = 0; i < 12; i++) {
        c.fillStyle = i % 2 ? "#2F8F3F" : "#288337";
        c.fillRect(0, (2048 / 12) * i, 2048, 2048 / 12 + 1);
      }
      // subtle mow noise
      c.globalAlpha = 0.05;
      for (let i = 0; i < 300; i++) {
        c.fillStyle = i % 2 ? "#FFFFFF" : "#0B3A16";
        c.fillRect((i * 733) % 2048, (i * 397) % 2048, 60, 3);
      }
      c.globalAlpha = 1;
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(px(-PW / 2), pz(GOAL_Z));
      c.lineTo(px(PW / 2), pz(GOAL_Z));
      c.stroke();
      c.strokeRect(px(-20.15), pz(GOAL_Z), px(20.15) - px(-20.15), pz(GOAL_Z + 16.5) - pz(GOAL_Z));
      c.strokeRect(px(-9.16), pz(GOAL_Z), px(9.16) - px(-9.16), pz(GOAL_Z + 5.5) - pz(GOAL_Z));
      c.fillStyle = "rgba(255,255,255,0.95)";
      c.beginPath();
      c.arc(px(0), pz(0), 9, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(px(0), pz(0), pz(9.15) - pz(0), Math.PI * 0.22, Math.PI * 0.78);
      c.stroke();
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.z = 6;
    pitch.receiveShadow = true;
    sc.add(pitch);

    this.buildGoal();

    // zone glow panels
    const zoneGeo = new THREE.PlaneGeometry(GOAL_W / 3 - 0.12, GOAL_H - 0.14);
    (["left", "center", "right"] as Zone[]).forEach((z) => {
      const mat = new THREE.MeshBasicMaterial({ color: "#7FD8FF", transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(zoneGeo, mat);
      m.position.set(ZONE_X[z], GOAL_H / 2, GOAL_Z - 0.03);
      this.zonePanels[z] = m;
      sc.add(m);
    });

    // ball — classic panel look
    const ballTex = canvasTexture(256, 256, (c) => {
      c.fillStyle = "#F8F9FB";
      c.fillRect(0, 0, 256, 256);
      c.fillStyle = "#15181D";
      for (let i = 0; i < 14; i++) {
        const x = (i * 94) % 256;
        const y = (i * 62 + 40) % 256;
        c.beginPath();
        c.arc(x, y, 17, 0, Math.PI * 2);
        c.fill();
      }
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 18), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35 }));
    this.ball.castShadow = true;
    this.ball.position.set(0, BALL_R, 0);
    sc.add(this.ball);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    this.trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: "#FFDF6E", size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
    this.trail.visible = false;
    sc.add(this.trail);

    this.buildStands();
    this.buildDressing();
    this.buildParticles();
  }

  /** True 3D goal: frame + sagging net cage the ball flies into. */
  private buildGoal() {
    const sc = this.scene;
    const postMat = new THREE.MeshStandardMaterial({ color: "#F5F7FA", roughness: 0.32, metalness: 0.05 });
    const postR = 0.062;
    for (const x of [-GOAL_W / 2, GOAL_W / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_H + 0.06, 14), postMat);
      post.position.set(x, GOAL_H / 2, GOAL_Z);
      post.castShadow = true;
      sc.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_W + 0.12, 14), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_H, GOAL_Z);
    bar.castShadow = true;
    sc.add(bar);

    // rear stanchions + ground bar
    for (const x of [-GOAL_W / 2, GOAL_W / 2]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.35, 10), postMat);
      st.position.set(x, 1.0, GOAL_Z - NET_DEPTH + 0.06);
      st.rotation.x = 0.32;
      sc.add(st);
    }
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, GOAL_W, 10), postMat);
    ground.rotation.z = Math.PI / 2;
    ground.position.set(0, 0.03, GOAL_Z - NET_DEPTH);
    sc.add(ground);

    // fine net texture
    const netTex = canvasTexture(512, 256, (c) => {
      c.clearRect(0, 0, 512, 256);
      c.strokeStyle = "rgba(238,243,250,0.55)";
      c.lineWidth = 1;
      for (let x = 0; x <= 512; x += 11) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, 256);
        c.stroke();
      }
      for (let y = 0; y <= 256; y += 11) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(512, y);
        c.stroke();
      }
    });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });

    // back net with natural sag (top hangs near the bar line, bottom sits deeper)
    const backGeo = new THREE.PlaneGeometry(GOAL_W, GOAL_H, 36, 14);
    {
      const attr = backGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const x = attr.getX(i);
        const y = attr.getY(i); // -H/2..H/2
        const vNorm = (y + GOAL_H / 2) / GOAL_H; // 0 bottom → 1 top
        const sagBack = (1 - vNorm) * (NET_DEPTH - 0.28); // bottom deeper
        const bow = Math.sin(((x + GOAL_W / 2) / GOAL_W) * Math.PI) * 0.08 * (1 - vNorm);
        attr.setZ(i, -sagBack - bow);
      }
      attr.needsUpdate = true;
      backGeo.computeVertexNormals();
    }
    this.netBack = new THREE.Mesh(backGeo, netMat);
    this.netBack.position.set(0, GOAL_H / 2, GOAL_Z - 0.28);
    sc.add(this.netBack);
    this.netBase = Float32Array.from(backGeo.getAttribute("position").array);

    // top net: crossbar back to the stanchion line
    const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, Math.hypot(NET_DEPTH - 0.2, 0.42), 24, 4), netMat);
    top.position.set(0, GOAL_H - 0.21, GOAL_Z - (NET_DEPTH - 0.2) / 2 - 0.05);
    top.rotation.x = -Math.PI / 2 + Math.atan2(0.42, NET_DEPTH - 0.2);
    sc.add(top);

    // side nets: shaped quads (front top, front bottom, back bottom, back top)
    for (const sx of [-1, 1]) {
      const x = (sx * GOAL_W) / 2;
      const g = new THREE.PlaneGeometry(1, 1, 8, 8);
      const attr = g.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const u = attr.getX(i) + 0.5; // 0 front → 1 back
        const v = attr.getY(i) + 0.5; // 0 bottom → 1 top
        const z = GOAL_Z - u * NET_DEPTH;
        const yTop = GOAL_H - u * 0.42; // slopes down toward the back
        attr.setXYZ(i, x, v * yTop, z);
      }
      attr.needsUpdate = true;
      g.computeVertexNormals();
      sc.add(new THREE.Mesh(g, netMat));
    }
  }

  private buildStands() {
    const sc = this.scene;
    const seat = new THREE.BoxGeometry(0.42, 0.5, 0.42);
    const palette = ["#31405E", "#3C4E71", "#22304A", "#C8CFDA", "#B3161F", "#75C4EA", "#39547E", "#802431"].map((c) => new THREE.Color(c));
    const spots: { x: number; y: number; z: number; ph: number }[] = [];
    const addStand = (cx: number, cz: number, w: number, yaw: number) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 6.4, 9), new THREE.MeshLambertMaterial({ color: "#111a2b" }));
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
        c.fillStyle = "#0E1626";
        c.fillRect(0, 0, 512, 64);
        c.fillStyle = "#7FD8FF";
        c.font = "800 40px system-ui";
        c.textAlign = "center";
        c.fillText(text, 256, 45);
      });
    const boards = ["CLUNOID.COM", "SHOWTIME", "CLUNOID.COM", "SHOWTIME", "CLUNOID.COM"];
    boards.forEach((t, i) => {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 0.85, 0.1),
        new THREE.MeshStandardMaterial({ map: boardTex(t), emissive: "#1E3A5C", emissiveIntensity: 0.9, roughness: 0.6 }),
      );
      b.position.set((i - 2) * 6.8, 0.45, GOAL_Z - 2.4);
      sc.add(b);
    });

    for (const [x, z] of [
      [-15, -14],
      [15, -14],
      [-15, 9],
      [15, 9],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 13, 8), new THREE.MeshStandardMaterial({ color: "#26334A", roughness: 0.7 }));
      pole.position.set(x, 6.5, z);
      sc.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: "#0B0F18", emissive: "#FFF4D2", emissiveIntensity: 2.6 }));
      head.position.set(x, 13.2, z);
      head.lookAt(0, 0, -4);
      sc.add(head);
    }

    this.jumboTex = canvasTexture(512, 192, (c) => this.drawJumbo(c, ""));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(10.5, 4, 0.4), new THREE.MeshStandardMaterial({ map: this.jumboTex, emissive: "#FFFFFF", emissiveMap: this.jumboTex, emissiveIntensity: 0.65, roughness: 0.8 }));
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
      } else if (e.kind === "kickoff") {
        this.kick = e.rec;
        this.kickShooter = e.shooter;
        this.kickAt = now;
        this.netHit = null;
        this.contactDone = false;
        this.ballSim = null;
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

    const votes = state.shotVotes;
    const totalVotes = votes.left + votes.center + votes.right;
    (["left", "center", "right"] as Zone[]).forEach((z) => {
      const mat = this.zonePanels[z].material as THREE.MeshBasicMaterial;
      const share = totalVotes > 0 ? votes[z] / totalVotes : 0;
      const target = this.phase === "vote" ? 0.05 + share * 0.28 : 0;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 6);
    });

    this.applyRig(this.ronaldo, dt);
    this.applyRig(this.messi, dt);
    this.updateCrowd(t, dt);
    this.updateParticles(this.confetti, this.confettiData, dt, 6.5);
    this.updateParticles(this.debris, this.debrisData, dt, 9);
    this.updateNet(now);

    if (this.shake > 0.002) {
      const a = this.shake * 0.09;
      this.camera.position.x += Math.sin(now * 0.061) * a;
      this.camera.position.y += Math.sin(now * 0.047) * a * 0.6;
      this.shake *= Math.pow(0.02, dt);
    }

    this.composer.render();
  }

  /** Smoothed application: every joint eases toward its target — fluid motion. */
  private applyRig(r: Rig, dt: number) {
    const k = 1 - Math.exp(-dt * 22);
    for (const j of [r.hips, r.torso, r.head, r.thighL, r.shinL, r.thighR, r.shinR, r.armUL, r.armLL, r.armUR, r.armLR]) {
      let e = this.smoothMap.get(j);
      if (!e) {
        e = j.rotation.clone();
        this.smoothMap.set(j, e);
      }
      e.x += (j.rotation.x - e.x) * k;
      e.y += (j.rotation.y - e.y) * k;
      e.z += (j.rotation.z - e.z) * k;
      j.rotation.set(e.x, e.y, e.z);
    }
    r.root.position.set(r.pos.x + r.offset.x, r.crouch + r.offset.y, r.pos.z + r.offset.z);
    r.root.rotation.set(0, r.yaw, r.lie * -r.lieDir);
  }

  /** Turn the head toward a world point (clamped, blended over the pose). */
  private aimHead(r: Rig, target: THREE.Vector3, w: number) {
    if (r.lie > 0.2) return;
    const p = new THREE.Vector3();
    r.head.getWorldPosition(p);
    const d = target.clone().sub(p);
    const yawWorld = Math.atan2(d.x, d.z);
    let rel = yawWorld - r.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const pitch = Math.atan2(d.y - 0.1, Math.hypot(d.x, d.z));
    r.head.rotation.y = r.head.rotation.y * (1 - w) + clamp(rel, -1.1, 1.1) * w;
    r.head.rotation.x = r.head.rotation.x * (1 - w) + clamp(-pitch, -0.7, 0.7) * w;
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
    const targetY = rec.zone === "center" ? (rec.goal && rec.dive === "center" ? 2.0 : 1.12) : 1.28;
    const saved = !rec.goal;
    // goals fly INTO the net; saves are intercepted near the line
    const targetZ = saved ? -10.8 : GOAL_Z - 0.42;

    // physically-correct launch velocity for this target + flight time
    const vx = targetX / flight;
    const vz = (targetZ - 0) / flight;
    const vy = (targetY - BALL_R + 0.5 * G * flight * flight) / flight;
    const curl = rec.zone === "center" ? 0 : Math.sign(targetX) * (0.22 + rec.power01 * 0.18);

    /* ── shooter ── */
    shooter.yaw = Math.PI;
    const runFrom = new THREE.Vector3(1.15, 0, 3.1);
    const contact = new THREE.Vector3(0.16, 0, 0.32);
    if (kt < KICK_SETTLE) {
      shooter.pos.copy(runFrom);
      idlePose(shooter, tNow);
      shooter.torso.rotation.x = 0.12;
      shooter.head.rotation.x = -0.22;
    } else if (kt < KICK_CONTACT - 0.24) {
      const u = ease((kt - KICK_SETTLE) / (KICK_CONTACT - 0.24 - KICK_SETTLE));
      shooter.pos.lerpVectors(runFrom, contact, u);
      walkPose(shooter, tNow * 1.95, 0.55 + 0.35 * u);
      shooter.torso.rotation.x = 0.14 + 0.12 * u;
    } else {
      shooter.pos.copy(contact);
      strikePose(shooter, clamp01((kt - (KICK_CONTACT - 0.24)) / 0.7));
    }

    if (!this.contactDone && kt >= KICK_CONTACT) {
      this.contactDone = true;
      this.burst(this.debris, this.debrisData, new THREE.Vector3(0.05, 0.05, 0.2), 26, 1.6, 2.2);
      this.shake = 0.55 + rec.power01 * 0.5;
    }

    /* ── keeper ── */
    keeper.pos.set(0, 0, -10.55);
    keeper.yaw = 0;
    const diveDir = rec.dive === "center" ? 0 : rec.dive === "left" ? -1 : 1;
    const reachX = 1.5 + 0.6 * rec.reach01;
    const diveStart = KICK_CONTACT - (rec.instinct ? 0.3 : 0.12);
    if (kt < diveStart) {
      keeperReadyPose(keeper, tNow);
      this.aimHead(keeper, this.ball.position, 0.7);
    } else {
      divePose(keeper, diveDir, (kt - diveStart) / 0.85, reachX);
    }

    /* ── ball ── */
    if (kt < KICK_CONTACT) {
      this.ball.position.set(0, BALL_R, 0);
      this.trail.visible = false;
    } else if (this.ballSim) {
      // free ball: gravity + bounces (+ net drag inside the cage)
      const s = this.ballSim;
      const dt2 = this.frameDt;
      s.v.y -= G * dt2;
      const insideNet = s.p.z < GOAL_Z + 0.05 && Math.abs(s.p.x) < GOAL_W / 2 && s.p.y < GOAL_H;
      if (insideNet) {
        const drag = Math.exp(-dt2 * 7);
        s.v.x *= drag;
        s.v.z *= drag;
        if (s.p.z < GOAL_Z - NET_DEPTH + 0.12) s.v.z += 14 * dt2; // back net pushes out
      }
      s.p.addScaledVector(s.v, dt2);
      if (s.p.y < BALL_R) {
        s.p.y = BALL_R;
        s.v.y = Math.abs(s.v.y) * 0.42;
        s.v.x *= 0.78;
        s.v.z *= 0.78;
        if (s.v.y < 0.4) s.v.y = 0;
      }
      this.ball.position.copy(s.p);
      this.ball.rotation.x -= s.v.length() * dt2 * 2.2;
    } else {
      const ft = Math.min(kt - KICK_CONTACT, flight);
      const u = clamp01(ft / flight);
      const bx = vx * ft + curl * Math.sin(u * Math.PI);
      const by = BALL_R + vy * ft - 0.5 * G * ft * ft;
      const bz = vz * ft;
      this.ball.position.set(bx, Math.max(BALL_R, by), bz);
      this.ball.rotation.x -= (0.5 + rec.power01 * 0.5) * this.frameDt * 30;

      if (u >= 1) {
        // arrival: hand off to the integrator with the real arrival velocity
        const arriveV = new THREE.Vector3(vx, vy - G * flight, vz);
        if (saved) {
          if (rec.dive === "center") {
            this.ball.position.set(0, 1.15, -10.35); // clutched to the chest
          } else {
            // parry: keeper deflects it wide with restitution
            const away = Math.sign(targetX) || 1;
            this.ballSim = { p: this.ball.position.clone(), v: new THREE.Vector3(away * 3.2, Math.abs(arriveV.y) * 0.4 + 2.2, 4.6) };
          }
        } else {
          this.ballSim = { p: this.ball.position.clone(), v: arriveV.multiplyScalar(0.55) }; // net absorbs
          if (!this.netHit) {
            this.netHit = { x: targetX, y: targetY, at: now };
            this.crowdHype = Math.max(this.crowdHype, 0.7);
            this.shake = Math.max(this.shake, 0.35);
          }
        }
      }

      if (rec.power01 > 0.35 && u > 0 && u < 1) {
        this.trail.visible = true;
        this.trailPos.unshift(this.ball.position.clone());
        if (this.trailPos.length > 40) this.trailPos.pop();
        const attr = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < 40; i++) {
          const p = this.trailPos[Math.min(i, this.trailPos.length - 1)] ?? this.ball.position;
          attr.setXYZ(i, p.x, p.y, p.z);
        }
        attr.needsUpdate = true;
        (this.trail.material as THREE.PointsMaterial).color.set(rec.power01 > 0.85 ? "#FF8A3C" : "#FFDF6E");
      } else if (u >= 1) {
        this.trail.visible = false;
      }
    }

    // both players watch the ball once it's away
    if (kt > KICK_CONTACT + 0.1) {
      this.aimHead(shooter, this.ball.position, 0.8);
      if (this.kick?.dive === "center") this.aimHead(keeper, this.ball.position, 0.6);
    }

    /* ── camera ── */
    const cutT = KICK_CONTACT + flight * 0.6;
    if (kt < cutT) {
      const u = ease(clamp01(kt / KICK_CONTACT));
      this.camera.position.set(1.45 - u * 0.4, 2.5 - u * 0.35, 8.8 - u * 1.1);
      const baseLook = new THREE.Vector3(0.15, 1.15, -3.2);
      const look = new THREE.Vector3().lerpVectors(baseLook, this.ball.position, clamp01((kt - KICK_CONTACT + 0.1) / 0.35));
      this.camera.lookAt(look);
    } else {
      const side = targetX >= 0 ? 1 : -1;
      this.camera.position.set(side * 4.9, 1.55, GOAL_Z + 5.2);
      this.camera.lookAt(targetX * 0.65, 1.05, GOAL_Z - 0.5);
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

    // let a live parry keep rolling out naturally
    if (this.ballSim && rec && !rec.goal && rec.dive !== "center") {
      const s = this.ballSim;
      const dt2 = this.frameDt;
      s.v.y -= G * dt2;
      s.p.addScaledVector(s.v, dt2);
      if (s.p.y < BALL_R) {
        s.p.y = BALL_R;
        s.v.y = Math.abs(s.v.y) * 0.42;
        s.v.x *= 0.78;
        s.v.z *= 0.78;
        if (s.v.y < 0.4) s.v.y = 0;
      }
      this.ball.position.copy(s.p);
    }

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
    if (age > 1.2) {
      attr.array.set(this.netBase);
      attr.needsUpdate = true;
      this.netBack.geometry.computeVertexNormals();
      this.netHit = null;
      return;
    }
    const decay = Math.exp(-age * 3.6) * Math.sin(age * 24) * 0.35 + Math.exp(-age * 5) * 0.55;
    for (let i = 0; i < attr.count; i++) {
      const bx = this.netBase[i * 3];
      const by = this.netBase[i * 3 + 1];
      const dx = bx - this.netHit.x;
      const dy = by + GOAL_H / 2 - this.netHit.y;
      const g = Math.exp(-(dx * dx + dy * dy) * 1.5);
      attr.setZ(i, this.netBase[i * 3 + 2] - g * decay);
    }
    attr.needsUpdate = true;
  }
}
