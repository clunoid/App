"use client";

/**
 * PENALTY SHOOTOUT — the 3D scene (three.js). A floodlit night stadium: striped
 * pitch with real penalty-area geometry, goal with rippling net, instanced crowd,
 * floodlight towers, jumbotron, ad boards — and two stylized stars built and
 * animated procedurally (no external model assets, fully deterministic):
 * RONALDO #7 (red/green kit, tall) and MESSI #10 (sky-blue stripes, #10).
 *
 * The scene is a pure VIEW: the engine resolves every kick before it plays; this
 * file choreographs run-up, strike, ball flight, dives, saves, celebrations
 * (including the Siuu), net ripple, confetti and broadcast camera cuts so the
 * picture always matches the resolved outcome exactly.
 */
import * as THREE from "three";
import { PLAYERS, type PlayerDef, type PlayerId, type Zone } from "./config";
import type { KickRecord, PenaltyEvent, PenaltyState, Phase } from "./penalty";

/* ── constants ──────────────────────────────────────────────────────────── */

const GOAL_Z = -11;
const GOAL_W = 7.32;
const GOAL_H = 2.44;
const BALL_R = 0.11;

const KICK_SETTLE = 0.45; // s — shooter settles before the run
const KICK_CONTACT = 2.7; // s into the kick phase when boot meets ball
const ZONE_X: Record<Zone, number> = { left: -2.5, center: 0, right: 2.5 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* ── canvas texture helpers ─────────────────────────────────────────────── */

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

/* ── player rig ─────────────────────────────────────────────────────────── */

type Rig = {
  def: PlayerDef;
  root: THREE.Group; // at the feet
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
  pos: THREE.Vector3; // logical position (root copies this)
  offset: THREE.Vector3; // per-frame pose offset (jumps, dives, sway)
  yaw: number;
  crouch: number; // extra downward root offset applied by poses
  lie: number; // z-rotation of whole body (dives)
  lieDir: number;
};

function limb(len: number, thick: number, color: string, at: THREE.Vector3, parent: THREE.Object3D): THREE.Group {
  const joint = new THREE.Group();
  joint.position.copy(at);
  const geo = new THREE.BoxGeometry(thick, len, thick);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  joint.add(mesh);
  parent.add(joint);
  return joint;
}

function kitTexture(def: PlayerDef, back: boolean): THREE.CanvasTexture {
  return canvasTexture(256, 256, (c) => {
    c.fillStyle = def.jersey;
    c.fillRect(0, 0, 256, 256);
    if (def.striped) {
      c.fillStyle = def.jersey2;
      for (let i = 0; i < 5; i++) c.fillRect(i * 56 - 8, 0, 26, 256);
    } else {
      c.fillStyle = def.jersey2;
      c.fillRect(0, 0, 256, 18); // collar band
    }
    c.textAlign = "center";
    if (back) {
      c.fillStyle = def.striped ? "#0F2740" : "#FFFFFF";
      c.font = "800 44px system-ui";
      c.fillText(def.shirt, 128, 66);
      c.font = "800 150px system-ui";
      c.fillText(String(def.number), 128, 205);
    } else {
      c.fillStyle = def.striped ? "#0F2740" : "#FFFFFF";
      c.font = "800 56px system-ui";
      c.fillText(String(def.number), 128, 150);
    }
  });
}

function makePlayer(def: PlayerDef, scene: THREE.Scene): Rig {
  const s = def.height;
  const root = new THREE.Group();
  root.scale.setScalar(s);
  scene.add(root);

  const skinMat = new THREE.MeshLambertMaterial({ color: def.skin });

  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.2), new THREE.MeshLambertMaterial({ color: def.shorts }));
  pelvis.position.y = -0.02;
  pelvis.castShadow = true;
  hips.add(pelvis);

  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  const bodyMats = [
    new THREE.MeshLambertMaterial({ color: def.jersey }),
    new THREE.MeshLambertMaterial({ color: def.jersey }),
    new THREE.MeshLambertMaterial({ color: def.jersey }),
    new THREE.MeshLambertMaterial({ color: def.jersey }),
    new THREE.MeshLambertMaterial({ map: kitTexture(def, false) }), // front (faces -z after yaw π? front face +z)
    new THREE.MeshLambertMaterial({ map: kitTexture(def, true) }), // back
  ];
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.24), bodyMats);
  chest.position.y = 0.34;
  chest.castShadow = true;
  torso.add(chest);

  const head = new THREE.Group();
  head.position.y = 0.72;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 16), skinMat);
  skull.position.y = 0.1;
  skull.castShadow = true;
  head.add(skull);
  // hair
  const hairMat = new THREE.MeshLambertMaterial({ color: def.hair });
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 0.115;
  head.add(hair);
  if (def.id === "messi") {
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.1), hairMat);
    beard.position.set(0, 0.01, 0.09);
    head.add(beard);
  }

  // arms (shoulder pivots on torso)
  const armY = 0.58;
  const armUL = limb(0.28, 0.09, def.jersey, new THREE.Vector3(-0.26, armY, 0), torso);
  const armLL = limb(0.26, 0.08, def.skin, new THREE.Vector3(0, -0.28, 0), armUL);
  const armUR = limb(0.28, 0.09, def.jersey, new THREE.Vector3(0.26, armY, 0), torso);
  const armLR = limb(0.26, 0.08, def.skin, new THREE.Vector3(0, -0.26, 0), armUR);

  // keeper gloves (hidden unless keeping)
  const gloveMat = new THREE.MeshLambertMaterial({ color: "#C9E265" });
  const gloves: THREE.Mesh[] = [];
  for (const fore of [armLL, armLR]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), gloveMat);
    g.position.y = -0.3;
    g.visible = false;
    fore.add(g);
    gloves.push(g);
  }

  // legs (hip pivots)
  const thighL = limb(0.44, 0.12, def.shorts, new THREE.Vector3(-0.11, -0.08, 0), hips);
  const shinL = limb(0.42, 0.1, def.socks, new THREE.Vector3(0, -0.44, 0), thighL);
  const thighR = limb(0.44, 0.12, def.shorts, new THREE.Vector3(0.11, -0.08, 0), hips);
  const shinR = limb(0.42, 0.1, def.socks, new THREE.Vector3(0, -0.44, 0), thighR);
  for (const shin of [shinL, shinR]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), new THREE.MeshLambertMaterial({ color: "#111318" }));
    boot.position.set(0, -0.44, 0.06);
    boot.castShadow = true;
    shin.add(boot);
  }

  return {
    def,
    root,
    hips,
    torso,
    head,
    thighL,
    shinL,
    thighR,
    shinR,
    armUL,
    armLL,
    armUR,
    armLR,
    gloves,
    pos: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    yaw: 0,
    crouch: 0,
    lie: 0,
    lieDir: 1,
  };
}

/** Reset all joints, then poses add on top each frame. */
function zeroPose(r: Rig) {
  for (const j of [r.hips, r.torso, r.head, r.thighL, r.shinL, r.thighR, r.shinR, r.armUL, r.armLL, r.armUR, r.armLR]) {
    j.rotation.set(0, 0, 0);
  }
  r.crouch = 0;
  r.offset.set(0, 0, 0);
}

function idlePose(r: Rig, t: number) {
  const b = Math.sin(t * 1.8 + r.def.number);
  r.torso.rotation.x = 0.03 + b * 0.015;
  r.head.rotation.x = -0.03;
  r.armUL.rotation.z = 0.12;
  r.armUR.rotation.z = -0.12;
  r.armLL.rotation.x = -0.22 + b * 0.03;
  r.armLR.rotation.x = -0.22 - b * 0.03;
}

function walkPose(r: Rig, t: number, amp = 0.55) {
  const w = t * 7.5;
  const sw = Math.sin(w);
  r.thighL.rotation.x = sw * amp;
  r.thighR.rotation.x = -sw * amp;
  r.shinL.rotation.x = Math.max(0, -Math.sin(w - 0.7)) * amp * 1.1;
  r.shinR.rotation.x = Math.max(0, Math.sin(w - 0.7)) * amp * 1.1;
  r.armUL.rotation.x = -sw * amp * 0.7;
  r.armUR.rotation.x = sw * amp * 0.7;
  r.torso.rotation.x = 0.08;
  r.crouch = Math.abs(Math.cos(w)) * -0.02;
}

function keeperReadyPose(r: Rig, t: number) {
  const sway = Math.sin(t * 1.35 + 1.7);
  r.crouch = -0.2;
  r.hips.rotation.x = 0.32;
  r.torso.rotation.x = 0.34;
  r.head.rotation.x = -0.5;
  r.thighL.rotation.x = -0.65;
  r.shinL.rotation.x = 1.0;
  r.thighR.rotation.x = -0.65;
  r.shinR.rotation.x = 1.0;
  r.armUL.rotation.z = 1.0;
  r.armUR.rotation.z = -1.0;
  r.armLL.rotation.x = -0.7;
  r.armLR.rotation.x = -0.7;
  r.offset.x = sway * 0.16; // restless side-step (the "random" look)
  r.torso.rotation.z = sway * 0.05;
}

function strikePose(r: Rig, k: number) {
  // k 0..1 across the strike window (backswing → contact → follow-through)
  if (k < 0.4) {
    const u = ease(k / 0.4);
    r.thighR.rotation.x = -1.15 * u;
    r.shinR.rotation.x = 1.25 * u;
    r.torso.rotation.x = -0.12 * u;
    r.armUL.rotation.x = -0.9 * u;
    r.armUR.rotation.x = 0.5 * u;
  } else if (k < 0.62) {
    const u = ease((k - 0.4) / 0.22);
    r.thighR.rotation.x = -1.15 + 2.25 * u;
    r.shinR.rotation.x = 1.25 - 1.15 * u;
    r.torso.rotation.x = -0.12 + 0.45 * u;
    r.armUL.rotation.x = -0.9 + 1.3 * u;
    r.armUR.rotation.x = 0.5 - 0.9 * u;
  } else {
    const u = ease((k - 0.62) / 0.38);
    r.thighR.rotation.x = 1.1 - 0.5 * u;
    r.shinR.rotation.x = 0.1 + 0.25 * u;
    r.torso.rotation.x = 0.33 - 0.15 * u;
    r.armUL.rotation.x = 0.4 - 0.3 * u;
    r.armUR.rotation.x = -0.4 + 0.3 * u;
  }
  r.thighL.rotation.x = 0.12;
  r.armUL.rotation.z = 0.35;
  r.armUR.rotation.z = -0.35;
}

function divePose(r: Rig, dir: number, k: number, reachX: number) {
  // dir: -1 left, +1 right (viewer space), dir 0 = stay center
  if (dir === 0) {
    const u = ease(Math.min(1, k * 1.6));
    r.crouch = -0.2 + u * 0.15;
    r.armUL.rotation.z = 2.6 * u;
    r.armUR.rotation.z = -2.6 * u;
    r.armLL.rotation.x = -0.2;
    r.armLR.rotation.x = -0.2;
    r.head.rotation.x = -0.35;
    r.offset.y = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.42;
    return;
  }
  const u = ease(Math.min(1, k * 1.15));
  r.lie = u * 1.3;
  r.lieDir = dir;
  r.offset.x = dir * reachX * u;
  r.offset.y = Math.sin(Math.min(1, k) * Math.PI) * 0.95 + u * 0.18;
  r.armUL.rotation.z = dir > 0 ? -2.7 * u : 0.4;
  r.armUR.rotation.z = dir > 0 ? -0.4 : 2.7 * u;
  r.armLL.rotation.x = 0;
  r.armLR.rotation.x = 0;
  r.thighL.rotation.x = -0.25 * u;
  r.thighR.rotation.x = -0.4 * u;
  r.shinL.rotation.x = 0.5 * u;
  r.shinR.rotation.x = 0.35 * u;
  r.head.rotation.z = -dir * 0.3 * u;
}

function celebrateSiuu(r: Rig, k: number, t: number) {
  if (k < 0.32) {
    walkPose(r, t, 0.7); // run toward camera
  } else if (k < 0.55) {
    const u = (k - 0.32) / 0.23;
    r.offset.y = Math.sin(u * Math.PI) * 0.75;
    r.yaw += Math.PI * 2 * ease(u); // mid-air spin
    r.armUL.rotation.z = 0.5;
    r.armUR.rotation.z = -0.5;
    r.thighL.rotation.x = -0.5;
    r.thighR.rotation.x = -0.5;
    r.shinL.rotation.x = 0.7;
    r.shinR.rotation.x = 0.7;
  } else {
    // THE stance: legs planted wide, arms flared down-back, chest out
    const u = ease(Math.min(1, (k - 0.55) / 0.12));
    r.thighL.rotation.z = 0.35 * u;
    r.thighR.rotation.z = -0.35 * u;
    r.armUL.rotation.z = (0.9 + Math.sin(t * 2) * 0.02) * u;
    r.armUR.rotation.z = -(0.9 + Math.sin(t * 2) * 0.02) * u;
    r.armUL.rotation.x = 0.55 * u;
    r.armUR.rotation.x = 0.55 * u;
    r.torso.rotation.x = -0.18 * u;
    r.head.rotation.x = 0.12 * u;
    r.crouch = -0.06 * u;
  }
}

function celebrateMessi(r: Rig, k: number, t: number) {
  const u = ease(Math.min(1, k * 2.2));
  r.armUL.rotation.z = 2.15 * u;
  r.armUR.rotation.z = -2.15 * u;
  r.armUL.rotation.x = -0.5 * u;
  r.armUR.rotation.x = -0.5 * u;
  if (k > 0.5) {
    const v = ease(Math.min(1, (k - 0.5) * 3));
    r.armLL.rotation.x = -0.9 * v; // both index fingers to the sky
    r.armLR.rotation.x = -0.9 * v;
  }
  r.head.rotation.x = -0.4 * u;
  r.torso.rotation.x = -0.1 * u;
  walkPose(r, t * 0.45, 0.18);
}

function keeperCelebrate(r: Rig, k: number, t: number) {
  const pump = Math.abs(Math.sin(t * 4.2));
  r.armUR.rotation.x = -2.4 - pump * 0.3;
  r.armLR.rotation.x = -1.3;
  r.armUL.rotation.z = 0.5;
  r.torso.rotation.x = -0.12;
  r.head.rotation.x = -0.25;
  r.offset.y = Math.abs(Math.sin(t * 4.2)) * 0.16;
  r.thighL.rotation.x = -0.1;
  r.thighR.rotation.x = -0.1;
}

function dejectedPose(r: Rig, k: number) {
  const u = ease(Math.min(1, k * 1.8));
  r.armUL.rotation.x = -2.5 * u;
  r.armUR.rotation.x = -2.5 * u;
  r.armLL.rotation.x = -2.1 * u;
  r.armLR.rotation.x = -2.1 * u;
  r.torso.rotation.x = 0.3 * u;
  r.head.rotation.x = 0.5 * u;
}

/* ── the scene ──────────────────────────────────────────────────────────── */

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
  private jumboText = "";
  private zonePanels: Record<Zone, THREE.Mesh> = {} as Record<Zone, THREE.Mesh>;
  private confetti!: THREE.Points;
  private confettiData!: { v: THREE.Vector3; life: number }[];
  private trail!: THREE.Points;
  private trailPos: THREE.Vector3[] = [];

  private phase: Phase = "role";
  private phaseAt = 0;
  private kick: KickRecord | null = null;
  private kickShooter: PlayerId = "ronaldo";
  private kickAt = 0;
  private resultAt = 0;
  private matchEndAt = 0;
  private winner: PlayerId | null = null;
  private netHit: { x: number; y: number; at: number } | null = null;
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

  /* ── world building ───────────────────────────────────────────────────── */

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
    const PD = 40; // z from -14 to +26
    const pitchTex = canvasTexture(1024, 1024, (c) => {
      const px = (x: number) => ((x + PW / 2) / PW) * 1024;
      const pz = (z: number) => ((z + 14) / PD) * 1024;
      for (let i = 0; i < 10; i++) {
        c.fillStyle = i % 2 ? "#2E8B3D" : "#288036";
        c.fillRect(0, (1024 / 10) * i, 1024, 1024 / 10 + 1);
      }
      c.strokeStyle = "rgba(255,255,255,0.92)";
      c.lineWidth = 3.4;
      // goal line
      c.beginPath();
      c.moveTo(px(-PW / 2), pz(GOAL_Z));
      c.lineTo(px(PW / 2), pz(GOAL_Z));
      c.stroke();
      // penalty area (16.5m deep, 40.3m wide)
      c.strokeRect(px(-20.15), pz(GOAL_Z), px(20.15) - px(-20.15), pz(GOAL_Z + 16.5) - pz(GOAL_Z));
      // six-yard box
      c.strokeRect(px(-9.16), pz(GOAL_Z), px(9.16) - px(-9.16), pz(GOAL_Z + 5.5) - pz(GOAL_Z));
      // spot
      c.fillStyle = "rgba(255,255,255,0.95)";
      c.beginPath();
      c.arc(px(0), pz(0), 4.5, 0, Math.PI * 2);
      c.fill();
      // arc at the top of the box
      c.beginPath();
      c.arc(px(0), pz(0), pz(9.15) - pz(0), Math.PI * 0.22, Math.PI * 0.78);
      c.stroke();
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), new THREE.MeshLambertMaterial({ map: pitchTex }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.z = 6; // covers z -14..26
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

    // net (back plane ripples on goals; top + sides for depth)
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

    // zone highlight panels inside the goal mouth (live vote shares)
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

    // ball trail
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    this.trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: "#FFD75E", size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
    this.trail.visible = false;
    sc.add(this.trail);

    this.buildStands();
    this.buildDressing();
    this.buildConfetti();
  }

  private buildStands() {
    const sc = this.scene;
    const seat = new THREE.BoxGeometry(0.42, 0.5, 0.42);
    const palette = ["#31405E", "#3C4E71", "#22304A", "#C8CFDA", "#B3161F", "#75C4EA", "#39547E", "#802431"].map((c) => new THREE.Color(c));
    const spots: { x: number; y: number; z: number; ph: number }[] = [];
    const addStand = (cx: number, cz: number, w: number, yaw: number) => {
      // tribune base
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
    addStand(0, -18.5, 34, 0); // behind the goal
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
    // ad boards ringing the goal
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

    // floodlight towers
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

    // jumbotron above the stand behind the goal
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

  private buildConfetti() {
    const N = 700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const colors = ["#FFD75E", "#FF7A6B", "#7FD8FF", "#4ED6A4", "#FFFFFF"].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] = -50; // parked offscreen
      const c = colors[i % colors.length];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.confettiData = Array.from({ length: N }, () => ({ v: new THREE.Vector3(), life: 0 }));
    this.scene.add(this.confetti);
  }

  private burstConfetti(center: THREE.Vector3, n: number, spread: number) {
    const pos = this.confetti.geometry.getAttribute("position") as THREE.BufferAttribute;
    let spawned = 0;
    for (let i = 0; i < this.confettiData.length && spawned < n; i++) {
      const d = this.confettiData[i];
      if (d.life > 0) continue;
      d.life = 2.2 + Math.random() * 1.4;
      d.v.set((Math.random() - 0.5) * spread, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * spread);
      pos.setXYZ(i, center.x + (Math.random() - 0.5), center.y, center.z + (Math.random() - 0.5));
      spawned++;
    }
    pos.needsUpdate = true;
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
        this.trailPos.length = 0;
      } else if (e.kind === "result") {
        this.resultAt = now;
        if (e.rec.goal) {
          this.crowdHype = 1;
          this.burstConfetti(new THREE.Vector3(0, 3, GOAL_Z + 2), 260, 8);
        }
      } else if (e.kind === "matchEnd") {
        this.winner = e.winner;
        this.matchEndAt = now;
        this.crowdHype = 1;
        this.burstConfetti(new THREE.Vector3(0, 6, 0), 500, 16);
      } else if (e.kind === "jumbotron") {
        this.jumboText = e.sender;
        const cv = this.jumboTex.image as HTMLCanvasElement;
        this.drawJumbo(cv.getContext("2d")!, e.sender);
        this.jumboTex.needsUpdate = true;
      } else if (e.kind === "matchStart") {
        this.winner = null;
        this.jumboText = "";
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
    // outside kick/result phases, "shooter" for staging = whoever kicks next
    const stagedShooterId: PlayerId = this.phase === "kick" || this.phase === "result" ? this.kickShooter : state.kickIndex % 2 === 0 ? state.shootsFirst : state.shootsFirst === "ronaldo" ? "messi" : "ronaldo";
    const sRig = stagedShooterId === "ronaldo" ? this.ronaldo : this.messi;
    const kRig = stagedShooterId === "ronaldo" ? this.messi : this.ronaldo;

    // keeper gloves
    this.ronaldo.gloves.forEach((g) => (g.visible = kRig === this.ronaldo));
    this.messi.gloves.forEach((g) => (g.visible = kRig === this.messi));

    zeroPose(this.ronaldo);
    zeroPose(this.messi);
    this.ronaldo.lie = 0;
    this.messi.lie = 0;

    switch (this.phase) {
      case "role":
        this.stageRole(t);
        break;
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

    // zone vote highlight panels (during voting only)
    const votes = state.shotVotes;
    const totalVotes = votes.left + votes.center + votes.right;
    (["left", "center", "right"] as Zone[]).forEach((z) => {
      const mat = this.zonePanels[z].material as THREE.MeshBasicMaterial;
      const share = totalVotes > 0 ? votes[z] / totalVotes : 0;
      const target = this.phase === "vote" ? 0.06 + share * 0.3 : 0;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 6);
    });

    this.applyRig(this.ronaldo);
    this.applyRig(this.messi);
    this.updateCrowd(t, dt);
    this.updateConfetti(dt);
    this.updateNet(now);

    this.renderer.render(this.scene, this.camera);
  }

  private applyRig(r: Rig) {
    r.root.position.set(r.pos.x + r.offset.x, r.crouch + r.offset.y, r.pos.z + r.offset.z);
    r.root.rotation.set(0, r.yaw, r.lie * -r.lieDir);
  }

  /** Move a rig toward a mark; returns true when close (idle allowed). */
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

  /* ── phase staging ────────────────────────────────────────────────────── */

  private stageRole(tNow: number) {
    const dt = this.frameDt;
    const a = this.walkTo(this.ronaldo, -1.25, 1.7, Math.PI, tNow, dt);
    const b = this.walkTo(this.messi, 1.25, 1.7, Math.PI, tNow, dt);
    if (a) idlePose(this.ronaldo, tNow);
    if (b) idlePose(this.messi, tNow + 2);
    this.ball.position.set(0, BALL_R, 0);
    this.trail.visible = false;

    const ang = Math.sin(tNow * 0.12) * 0.3;
    this.camera.position.set(Math.sin(ang) * 7.5, 2.2 + Math.sin(tNow * 0.4) * 0.1, 6.4 + Math.cos(ang) * 1.2);
    this.camera.lookAt(0, 1.25, 0.4);
  }

  private stageVote(sRig: Rig, kRig: Rig, state: PenaltyState, tNow: number) {
    const dt = this.frameDt;
    const sReady = this.walkTo(sRig, 0.85, 0, 2.9, Math.PI, tNow, dt);
    const kReady = this.walkTo(kRig, 0, -10.55, 0, tNow, dt, 3.0);
    if (sReady) {
      idlePose(sRig, tNow);
      sRig.yaw = Math.PI; // face the goal
    }
    if (kReady) keeperReadyPose(kRig, tNow);
    this.ball.position.set(0, BALL_R, 0);
    this.ball.rotation.set(0, 0, 0);
    this.trail.visible = false;

    const sway = Math.sin(tNow * 0.17);
    this.camera.position.set(4.6 + sway * 0.6, 2.6, 6.6);
    this.camera.lookAt(0, 1.0, -4.5);
  }

  private stageKick(shooter: Rig, keeper: Rig, now: number, tNow: number) {
    const rec = this.kick;
    if (!rec) return;
    const kt = (now - this.kickAt) / 1000; // seconds into the kick phase
    const flight = 0.62 - 0.24 * rec.power01; // s
    const targetX = this.kickTargetX(rec);
    const targetY = rec.zone === "center" ? (rec.goal && rec.dive === "center" ? 2.02 : 1.15) : 1.3;

    // ── shooter ──
    shooter.yaw = Math.PI;
    const runFrom = new THREE.Vector3(0.85, 0, 2.9);
    const contact = new THREE.Vector3(0.16, 0, 0.32);
    if (kt < KICK_SETTLE) {
      shooter.pos.copy(runFrom);
      idlePose(shooter, tNow);
      shooter.torso.rotation.x = 0.12; // eyes down the run
    } else if (kt < KICK_CONTACT - 0.24) {
      const u = ease((kt - KICK_SETTLE) / (KICK_CONTACT - 0.24 - KICK_SETTLE));
      shooter.pos.lerpVectors(runFrom, contact, u);
      walkPose(shooter, tNow * 1.9, 0.8);
      shooter.torso.rotation.x = 0.22;
    } else {
      shooter.pos.copy(contact);
      strikePose(shooter, clamp01((kt - (KICK_CONTACT - 0.24)) / 0.7));
    }

    // ── keeper ──
    keeper.pos.set(0, 0, -10.55);
    keeper.yaw = 0;
    const diveDir = rec.dive === "center" ? 0 : rec.dive === "left" ? -1 : 1;
    const reachX = 1.5 + 0.6 * rec.reach01;
    const diveStart = KICK_CONTACT - 0.12;
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
      const bx = targetX * u;
      const bz = (GOAL_Z + 0.15) * u;
      const arc = rec.zone === "center" ? 0.5 : 0.75;
      const by = BALL_R + (targetY - BALL_R) * u + Math.sin(u * Math.PI) * arc * (1 - rec.power01 * 0.5);
      if (saved && fu >= interceptU) {
        // caught / parried at the line
        const holdT = (kt - KICK_CONTACT - flight * interceptU) / 0.5;
        if (rec.dive === "center") {
          this.ball.position.set(0, 1.15, -10.35); // clutched to the chest
        } else {
          const px = Math.sign(targetX) * (Math.abs(targetX) + 0.7);
          const u2 = clamp01(holdT);
          this.ball.position.set(bx + (px - bx) * u2, Math.max(BALL_R, by * (1 - u2) + 0.4 * Math.sin(u2 * Math.PI)), bz + 1.6 * u2);
        }
      } else {
        this.ball.position.set(bx, by, bz);
        if (rec.goal && fu >= 1 && !this.netHit) {
          this.netHit = { x: targetX, y: targetY, at: now };
          this.crowdHype = Math.max(this.crowdHype, 0.7);
        }
        if (rec.goal && fu >= 1) {
          // ball settles in the net
          const settle = clamp01((kt - KICK_CONTACT - flight) / 0.4);
          this.ball.position.set(targetX, Math.max(BALL_R, targetY - settle * (targetY - BALL_R)), GOAL_Z - 0.55);
        }
      }
      this.ball.rotation.x -= (0.35 + rec.power01 * 0.4) * (this.ball.position.z < -1 ? 1 : 0);
      // golden trail on powered shots
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

    // ── camera: broadcast angle behind the shooter (goal + keeper in frame),
    //    then a cut to the goal-line camera as the ball arrives ──
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
      // beat him: just beyond the gloves, inside the post
      const reach = 1.5 + 0.6 * rec.reach01;
      return sign * Math.min(3.2, reach + 0.75);
    }
    return sign * 2.5;
  }

  private stageResult(shooter: Rig, keeper: Rig, now: number, tNow: number) {
    const rec = this.kick;
    const rt = (now - this.resultAt) / 1000;
    const k = clamp01(rt / 3.2);
    this.trail.visible = false;

    if (!rec) return;
    if (rec.goal) {
      // scorer celebrates toward the camera corner
      const celebrating = shooter;
      if (celebrating.def.id === "ronaldo") {
        if (k < 0.32) this.walkTo(celebrating, 2.4, 3.4, 0, tNow, this.frameDt, 3.4);
        celebrateSiuu(celebrating, k, tNow);
        if (k >= 0.32) celebrating.yaw = 0.35;
      } else {
        this.walkTo(celebrating, 1.6, 3.0, 0, tNow, this.frameDt, 1.4);
        celebrateMessi(celebrating, k, tNow);
        celebrating.yaw = 0.15;
      }
      // keeper rises, hands on head
      keeper.pos.set(rec.dive === "center" ? 0 : (rec.dive === "left" ? -1 : 1) * 1.6, 0, -10.4);
      keeper.yaw = 0;
      dejectedPose(keeper, k);
      const orbit = tNow * 0.5;
      this.camera.position.set(celebrating.pos.x + Math.sin(orbit) * 3.6, 1.7, celebrating.pos.z + Math.cos(orbit) * 3.6);
      this.camera.lookAt(celebrating.pos.x, 1.15, celebrating.pos.z);
    } else {
      // keeper is the hero
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
    if (Math.random() < 0.25) this.burstConfetti(new THREE.Vector3((Math.random() - 0.5) * 10, 7, (Math.random() - 0.5) * 6), 24, 4);

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

  private updateConfetti(dt: number) {
    const pos = this.confetti.geometry.getAttribute("position") as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < this.confettiData.length; i++) {
      const d = this.confettiData[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 6.5 * dt;
      d.v.x *= 0.995;
      pos.setXYZ(i, pos.getX(i) + d.v.x * dt, Math.max(0.02, pos.getY(i) + d.v.y * dt), pos.getZ(i) + d.v.z * dt);
      if (d.life <= 0) pos.setY(i, -50);
    }
    if (any) pos.needsUpdate = true;
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
      const dy = by + GOAL_H / 2 - this.netHit.y; // plane local → world-ish
      const g = Math.exp(-(dx * dx + dy * dy) * 1.4);
      attr.setZ(i, this.netBase[i * 3 + 2] - g * decay);
    }
    attr.needsUpdate = true;
  }
}
