/* 房间情绪板 — 原创实现
   一个剖开的房间，样本拖进去，家具搬得动，太阳拉得动。
   几何与远/中/近三层城市由本文件程序化生成；正对窗的主景是设计师指定的
   实拍夜景照片（city-photo.js 内联为 data URI，单文件版由打包脚本一起内联）。 */

import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { CITY_PHOTO_URL } from './city-photo.js';

/* ============================== 0. 小工具 ============================== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shift(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => clamp(Math.round(v + 255 * amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function alpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ============================== 1. 材料库 ============================== */
/* cat 决定这颗样本能贴到哪些面；rough 是粗糙度；rep 是贴图平铺密度 */
const LIB = {
  wood: [
    { id: 'oak', name: '白橡', color: '#c9a173', dark: '#8a6440', rough: 0.52 },
    { id: 'walnut', name: '胡桃', color: '#7d5537', dark: '#4a2f1b', rough: 0.46 },
    { id: 'smoked', name: '烟熏橡', color: '#8e8474', dark: '#5c5449', rough: 0.58 },
    { id: 'maple', name: '枫木', color: '#dcc49b', dark: '#a98a5f', rough: 0.54 },
    { id: 'teak', name: '柚木', color: '#a26f42', dark: '#6b4425', rough: 0.44 },
    { id: 'ebony', name: '黑橡', color: '#463a30', dark: '#241c16', rough: 0.5 },
  ],
  stone: [
    { id: 'terrazzo', name: '水磨石', color: '#ddd7ca', dark: '#8d8579', chips: ['#b9ac97', '#9aa0a4', '#c07a5e'], rough: 0.42 },
    { id: 'limestone', name: '灰岩', color: '#a8a49b', dark: '#75716a', rough: 0.66 },
    { id: 'marble', name: '白纹石', color: '#d5d0c6', dark: '#8c8375', rough: 0.34 },
    { id: 'travertine', name: '洞石', color: '#cbb59a', dark: '#8e7a5f', rough: 0.6 },
    { id: 'slate', name: '板岩', color: '#5b5f63', dark: '#33373b', rough: 0.55 },
    { id: 'concrete', name: '清水混凝土', color: '#b6b3ab', dark: '#8b8880', rough: 0.72 },
  ],
  fabric: [
    { id: 'linen', name: '亚麻', color: '#cdc0a8', dark: '#a3967d', rough: 0.92 },
    { id: 'velvet', name: '丝绒', color: '#61705c', dark: '#3d4a3c', rough: 0.78 },
    { id: 'tweed', name: '粗花呢', color: '#b3896b', dark: '#7d5b44', rough: 0.95 },
    { id: 'boucle', name: '羊羔绒', color: '#e3d9c6', dark: '#b3a891', rough: 0.97 },
    { id: 'leather', name: '磨砂皮', color: '#8a6a52', dark: '#5b4133', rough: 0.62 },
    { id: 'indigo', name: '靛蓝布', color: '#3f4c60', dark: '#26303f', rough: 0.9 },
  ],
  paint: [
    { id: 'chalk', name: '米白', color: '#efe9dc', dark: '#d8d0c0', rough: 0.9 },
    { id: 'sage', name: '灰绿', color: '#9aa48f', dark: '#7c8672', rough: 0.88 },
    { id: 'clay', name: '陶土', color: '#bf7a5d', dark: '#9a5a41', rough: 0.86 },
    { id: 'deep', name: '深海', color: '#39434f', dark: '#252c35', rough: 0.84 },
    { id: 'blush', name: '雾粉', color: '#d7b3aa', dark: '#b08c83', rough: 0.87 },
    { id: 'ochre', name: '赭黄', color: '#c39653', dark: '#997038', rough: 0.86 },
    { id: 'moss', name: '苔绿', color: '#69724f', dark: '#4c5439', rough: 0.86 },
    { id: 'ink', name: '墨黑', color: '#2b2b2f', dark: '#18181b', rough: 0.82 },
  ],
};

/* 给每个样本打上类别标记，贴图生成器靠它分派 */
for (const [cat, list] of Object.entries(LIB)) {
  for (const m of list) m.cat = cat;
}

const byId = (cat, id) => LIB[cat].find((m) => m.id === id);

/* 面 → 能接受哪些类别 */
const SURFACES = {
  floor:    { name: '地面', cats: ['wood', 'stone'], rep: [2.2, 3.8] },
  wallBack: { name: '后墙', cats: ['paint', 'stone'], rep: [2.6, 1.5] },
  wallSide: { name: '左墙', cats: ['paint', 'stone'], rep: [2.2, 1.5] },
  sofa:     { name: '沙发', cats: ['fabric'], rep: [1.7, 1.7] },
  rug:      { name: '地毯', cats: ['fabric'], rep: [1.5, 1.1] },
  woodwork: { name: '木作', cats: ['wood'], rep: [1, 1] },
};
const SURFACE_KEYS = Object.keys(SURFACES);

/* ============================== 2. 程序化贴图 ============================== */
const canvasCache = new Map();

function drawWood(m) {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = m.color; g.fillRect(0, 0, S, S);
  const rows = 6, hgt = S / rows;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows; r++) {
    const y = r * hgt;
    g.fillStyle = shift(m.color, (rnd() - 0.5) * 0.16);
    g.fillRect(0, y, S, hgt);
    for (let i = 0; i < 46; i++) {
      const yy = y + rnd() * hgt;
      const amp = 0.8 + rnd() * 3.4;
      const ph = rnd() * 6.28;
      g.strokeStyle = alpha(m.dark, 0.07 + rnd() * 0.2);
      g.lineWidth = 0.5 + rnd() * 1.4;
      g.beginPath();
      for (let x = 0; x <= S; x += 14) {
        const off = Math.sin(x * 0.045 + ph) * amp + Math.sin(x * 0.012 + i) * 0.8;
        if (x === 0) g.moveTo(x, yy + off); else g.lineTo(x, yy + off);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(44,28,16,.36)';
    g.fillRect(0, y, S, 3.5);
    const jx = (r % 2 ? 0.34 : 0.72) * S + rnd() * 30;
    g.fillStyle = 'rgba(44,28,16,.26)';
    g.fillRect(jx, y, 2.5, hgt);
  }
  return c;
}

function drawStone(m) {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = m.color; g.fillRect(0, 0, S, S);
  let seed = 21;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, alpha(m.dark, 0.1));
    grd.addColorStop(1, alpha(m.dark, 0));
    g.fillStyle = grd;
    g.arc(x, y, r, 0, 7);
    g.fill();
  }
  if (m.chips) {
    for (let i = 0; i < 1400; i++) {
      const col = m.chips[Math.floor(rnd() * m.chips.length)];
      g.fillStyle = alpha(col, 0.35 + rnd() * 0.5);
      const r = 0.8 + rnd() * 2.4;
      g.beginPath();
      g.ellipse(rnd() * S, rnd() * S, r, r * (0.6 + rnd() * 0.8), rnd() * 3, 0, 7);
      g.fill();
    }
  }
  if (m.id === 'marble') {
    for (let v = 0; v < 8; v++) {
      g.strokeStyle = alpha(m.dark, 0.2 + rnd() * 0.14);
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath();
      let x = rnd() * S, y = 0;
      g.moveTo(x, y);
      while (y < S) {
        x += (rnd() - 0.5) * 40 + 8;
        y += 18 + rnd() * 26;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  if (m.id === 'travertine') {
    /* 洞石：横向层理 + 细小孔洞 */
    for (let i = 0; i < 40; i++) {
      const y = rnd() * S;
      g.fillStyle = alpha(m.dark, 0.05 + rnd() * 0.09);
      g.fillRect(0, y, S, 2 + rnd() * 9);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = alpha('#3a2c1e', 0.1 + rnd() * 0.22);
      g.beginPath();
      g.ellipse(rnd() * S, rnd() * S, 0.8 + rnd() * 2.4, 0.6 + rnd() * 1.6, rnd() * 3, 0, 7);
      g.fill();
    }
  }
  if (m.id === 'limestone') {
    /* 灰岩：细密的水平层理 */
    for (let i = 0; i < 30; i++) {
      const y = rnd() * S;
      g.fillStyle = alpha(m.dark, 0.04 + rnd() * 0.06);
      g.fillRect(0, y, S, 0.8 + rnd() * 2.6);
    }
    for (let i = 0; i < 240; i++) {
      g.fillStyle = alpha('#ffffff', 0.05 + rnd() * 0.1);
      g.beginPath();
      g.ellipse(rnd() * S, rnd() * S, 2 + rnd() * 7, 1 + rnd() * 2, 0, 0, 7);
      g.fill();
    }
  }
  if (m.id === 'slate') {
    /* 板岩：斜向层片 */
    for (let i = 0; i < 70; i++) {
      const y = rnd() * S;
      g.strokeStyle = alpha(rnd() > 0.45 ? '#ffffff' : m.dark, 0.05 + rnd() * 0.12);
      g.lineWidth = 1 + rnd() * 5;
      g.beginPath();
      g.moveTo(-20, y);
      g.lineTo(S + 20, y + (rnd() - 0.5) * 26);
      g.stroke();
    }
  }
  if (m.id === 'concrete') {
    /* 清水混凝土：大片色差 + 极细骨料 */
    for (let i = 0; i < 18; i++) {
      const x = rnd() * S, y = rnd() * S, r = 60 + rnd() * 120;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, alpha(m.dark, 0.08 + rnd() * 0.06));
      grd.addColorStop(1, alpha(m.dark, 0));
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = alpha('#ffffff', 0.03 + rnd() * 0.05);
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, 4 + rnd() * 14, 0, 7);
      g.fill();
    }
    /* 模板拼缝 */
    for (let i = 0; i < 3; i++) {
      const y = (i + 0.5) * (S / 3) + (rnd() - 0.5) * 10;
      g.fillStyle = alpha(m.dark, 0.18);
      g.fillRect(0, y, S, 2);
      g.fillStyle = alpha('#ffffff', 0.1);
      g.fillRect(0, y + 2, S, 1.5);
    }
    for (const px of [0.18, 0.5, 0.82]) {
      for (const py of [0.2, 0.52, 0.84]) {
        g.fillStyle = alpha(m.dark, 0.3);
        g.beginPath(); g.arc(px * S, py * S, 2.4, 0, 7); g.fill();
      }
    }
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = alpha(rnd() > 0.5 ? m.dark : '#ffffff', 0.05 + rnd() * 0.07);
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  return c;
}

function drawFabric(m) {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = m.color; g.fillRect(0, 0, S, S);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  if (m.id === 'leather') {
    /* 磨砂皮：几乎无织纹，只有极浅的皱纹与颗粒 */
    for (let i = 0; i < 160; i++) {
      g.strokeStyle = alpha(m.dark, 0.04 + rnd() * 0.07);
      g.lineWidth = 1 + rnd() * 2.4;
      g.beginPath();
      const x = rnd() * S, y = rnd() * S;
      g.moveTo(x, y);
      g.bezierCurveTo(x + 30 + rnd() * 40, y - 20, x + 70, y + 30, x + 110 + rnd() * 60, y + 10);
      g.stroke();
    }
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = alpha(rnd() > 0.5 ? m.dark : '#ffffff', 0.02 + rnd() * 0.05);
      g.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
    return c;
  }

  const step = m.id === 'velvet' ? 2 : 4;
  for (let y = 0; y < S; y += step) {
    for (let x = 0; x < S; x += step) {
      const on = ((x / step) + (y / step)) % 2 === 0;
      g.fillStyle = on ? alpha(m.dark, 0.15) : alpha('#ffffff', 0.09);
      g.fillRect(x, y, step, step);
    }
  }
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = alpha(rnd() > 0.5 ? m.dark : '#ffffff', 0.04 + rnd() * 0.08);
    g.fillRect(rnd() * S, rnd() * S, 2, 1);
  }
  if (m.id === 'tweed') {
    for (let i = 0; i < 700; i++) {
      g.fillStyle = alpha(rnd() > 0.5 ? '#ffffff' : m.dark, 0.3);
      g.fillRect(rnd() * S, rnd() * S, 3, 1.4);
    }
  }
  if (m.id === 'boucle') {
    /* 羊羔绒：满地小圈圈 */
    for (let i = 0; i < 2600; i++) {
      g.strokeStyle = alpha(rnd() > 0.4 ? '#ffffff' : m.dark, 0.25 + rnd() * 0.3);
      g.lineWidth = 1 + rnd() * 1.6;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, 2 + rnd() * 4, 0, 7);
      g.stroke();
    }
  }
  if (m.id === 'indigo') {
    /* 靛蓝布：稀疏竹节纹 */
    for (let i = 0; i < 300; i++) {
      g.strokeStyle = alpha('#ffffff', 0.12 + rnd() * 0.14);
      g.lineWidth = 1 + rnd();
      const x = rnd() * S, y = rnd() * S;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 6 + rnd() * 16, y + (rnd() - 0.5) * 3);
      g.stroke();
    }
  }
  return c;
}

function drawPaint(m) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = m.color; g.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = alpha(rnd() > 0.5 ? m.dark : '#ffffff', 0.015 + rnd() * 0.03);
    const r = 2 + rnd() * 9;
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, r, 0, 7);
    g.fill();
  }
  return c;
}

function baseCanvas(m) {
  if (canvasCache.has(m.id)) return canvasCache.get(m.id);
  const c = m.cat === 'wood' ? drawWood(m)
    : m.cat === 'stone' ? drawStone(m)
    : m.cat === 'fabric' ? drawFabric(m)
    : drawPaint(m);
  canvasCache.set(m.id, c);
  return c;
}

/* 样本缩略图：从贴图上 1:1 裁一块，缩到卡片大小后纹理还看得清 */
const swatchCache = new Map();
function swatchFor(m) {
  if (swatchCache.has(m.id)) return swatchCache.get(m.id);
  const c = document.createElement('canvas');
  c.width = 168;
  c.height = 132;
  const src = baseCanvas(m);
  const sx = Math.max(0, (src.width - 168) / 2);
  const sy = Math.max(0, (src.height - 132) / 2);
  c.getContext('2d').drawImage(src, sx, sy, 168, 132, 0, 0, 168, 132);
  const url = c.toDataURL();
  swatchCache.set(m.id, url);
  return url;
}

function textureFor(key, m) {  const t = new THREE.CanvasTexture(baseCanvas(m));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const [rx, ry] = SURFACES[key].rep;
  t.repeat.set(rx, ry);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

/* ============================== 3. 渲染器与场景 ============================== */
const canvasEl = $('#stage');
const renderer = new THREE.WebGLRenderer({
  canvas: canvasEl, antialias: true, alpha: true, powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();

/* 42° 接近人眼在室内的观感；34° 是长焦，会把房间压扁成布景 */
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
/* 房间放到 11.2×10.0×3.9 后重新取景：四组参数对比（radius/phi/targetY）
   5.6/1.30/1.30、5.8/1.26/1.45、6.2/1.28/1.38、5.4/1.34/1.22，选最后一组——
   主体仍占约 26%，挂画、边柜、矮凳、整面高窗都完整入画；拉到 6.2 主体又缩成小摆件。
   phi 越大相机越低：层高提到 3.9 后 phi 1.34 机位约 2.4 m，既不吃天花黑带，
   俯角也够看清模型台内部。 */
const orbit = {
  target: new THREE.Vector3(-0.25, 1.22, -1.15),
  radius: 5.4, theta: 0.62, phi: 1.34,          // 当前值（渲染用）
  /* 视点平移：相机和 target 一起挪，视角方向不变（是"走到旁边看"，不是转头）。
     只有绕固定点转球面的话，观察位置永远动不了。 */
  pan: new THREE.Vector3(0, 0, 0),
  panVel: new THREE.Vector3(0, 0, 0),           // 平移速度：起步柔和、松键快停
};
/* 目标值：只有滚轮半径走阻尼；theta/phi 由拖拽直接同步。 */
const orbitGoal = { radius: orbit.radius, theta: orbit.theta, phi: orbit.phi };
const ORBIT_DEFAULT = { radius: 5.4, theta: 0.62, phi: 1.34 };
/* 转动范围放宽并把默认视角放到中间：原来默认 0.33 距下限 0.16 只有 0.17 rad，
   往左一拖就撞墙，实测 120 px 拖动两次都卡在同一个边界上。
   相机在房间外时侧墙单面被背面剔除，放宽后仍能从更多角度看进去，不穿帮。 */
/* 房间放大后滚轮要能退到看得见整面玻璃的距离 */
const THETA_RANGE = [0.02, 1.42], PHI_RANGE = [0.32, 1.50], RADIUS_RANGE = [1.9, 9.5];

/* 平移上限（米）：跟着 11.2×10.0×3.9 的新房间放宽，
   否则房间大了却只能挪原来那一小步，方向键会显得没用。 */
const PAN_LIMIT = { x: 2.4, y: 1.0, z: 1.9 };
const PAN_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const heldPanKeys = new Set();
/* 手感按通道分开：这是编辑器，要精确点面/拖家具，视角必须跟手、停得住。
   实测过"展示型 3D"的长阻尼 + 甩动惯性在这里是灾难：拖拽后第一帧还差 77%，
   要 15 帧才追上；松手后相机还移动 1.046 m，点面必然点偏；松键 49 帧才停。
   —— 所以拖拽即时到位、惯性去掉；只有滚轮（不参与拾取）保留平滑推拉。 */
const PAN_SPEED = 1.6;         // 稳态速度 m/s
const PAN_LAMBDA = 20;         // 起步柔和：约 50 ms 到速，不是阶跃
const PAN_STOP_LAMBDA = 34;    // 松键快速停：滑行 < 3 cm，不会"想停停不住"
const RADIUS_LAMBDA = 12;      // 滚轮推拉平滑（与拾取无关，保留）

/* 帧率无关的指数阻尼：dt 变化时收敛速度一致。固定 lerp 系数会随帧率变形。 */
const dampK = (lambda, dt) => 1 - Math.exp(-lambda * dt);

function placeCamera() {
  const r = orbit.radius, p = orbit.phi, t = orbit.theta;
  const tx = orbit.target.x + orbit.pan.x;
  const ty = orbit.target.y + orbit.pan.y;
  const tz = orbit.target.z + orbit.pan.z;
  camera.position.set(
    tx + r * Math.sin(p) * Math.sin(t),
    ty + r * Math.cos(p),
    tz + r * Math.sin(p) * Math.cos(t),
  );
  camera.lookAt(tx, ty, tz);
}

/* 按帧推进平移：起步有一点柔和（不阶跃），松键快速停住（不滑行）。
   抽成纯函数便于自测边界。 */
function panStep(keys, dt) {
  let dx = 0, dy = 0;
  if (keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('ArrowRight')) dx += 1;
  if (keys.has('ArrowUp')) dy += 1;
  if (keys.has('ArrowDown')) dy -= 1;
  const norm = Math.hypot(dx, dy) || 1;
  const t = orbit.theta;
  const rightX = Math.cos(t), rightZ = -Math.sin(t);
  const wantX = rightX * dx / norm * PAN_SPEED;
  const wantZ = rightZ * dx / norm * PAN_SPEED;
  const wantY = dy / norm * PAN_SPEED;
  /* 起步用 PAN_LAMBDA，松键用更大的 PAN_STOP_LAMBDA：滑行压到 3 cm 以内 */
  const k = dampK(dx || dy ? PAN_LAMBDA : PAN_STOP_LAMBDA, dt);
  orbit.panVel.x += (wantX - orbit.panVel.x) * k;
  orbit.panVel.y += (wantY - orbit.panVel.y) * k;
  orbit.panVel.z += (wantZ - orbit.panVel.z) * k;
  if (!dx && !dy && orbit.panVel.lengthSq() < 1.6e-5) {
    orbit.panVel.set(0, 0, 0);
    return false;
  }
  const px = orbit.pan.x, py = orbit.pan.y, pz = orbit.pan.z;
  const nx = px + orbit.panVel.x * dt;
  const ny = py + orbit.panVel.y * dt;
  const nz = pz + orbit.panVel.z * dt;
  /* 边界用"相机局部坐标系下的椭圆"整体约束，而不是世界轴逐分量 clamp。
     逐分量 clamp 时 x 先撞墙、z 还在走，视角会突然沿墙漂 0.55 m（实测），
     方向突变正是别扭的来源。椭圆把整个水平位移按比例缩回，任何方向都是整体停。 */
  const u = nx * rightX + nz * rightZ;              // 沿屏幕右方向
  const v = nx * Math.sin(t) + nz * Math.cos(t);    // 沿屏幕前后方向
  const q = Math.hypot(u / PAN_LIMIT.x, v / PAN_LIMIT.z);
  let fx = nx, fz = nz, fy = clamp(ny, -PAN_LIMIT.y, PAN_LIMIT.y);
  if (q > 1) {
    fx = nx / q; fz = nz / q;
    orbit.panVel.x = 0; orbit.panVel.z = 0;         // 到边界就停，不再推
  }
  if (fy !== ny) orbit.panVel.y = 0;
  orbit.pan.set(fx, fy, fz);
  return fx !== px || fy !== py || fz !== pz || orbit.panVel.lengthSq() > 1.6e-5;
}

/* 只有滚轮半径走阻尼（它不参与拾取）；theta/phi 由拖拽直接同步，
   R 复位也是直接写入。这里只负责把 radius 平滑逼近目标值。 */
function dampOrbit(dt) {
  const diff = orbitGoal.radius - orbit.radius;
  if (Math.abs(diff) < 1e-3) { orbit.radius = orbitGoal.radius; return false; }
  orbit.radius += diff * dampK(RADIUS_LAMBDA, dt);
  return true;
}
/* 窄窗口把相机往后拉一点，避免房间被底部抽屉压住 */
if (window.innerWidth < 1440) {
  orbit.radius = orbitGoal.radius = ORBIT_DEFAULT.radius + Math.min(1.4, (1440 - window.innerWidth) * 0.0044);
  orbit.phi = orbitGoal.phi = ORBIT_DEFAULT.phi;
}
placeCamera();

/* 环境反射：用 three 自带的房间环境，强度压低一点，避免塑料感 */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

/* 光 */
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x6d5844, 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe6c4, 2.4);
sun.castShadow = true;
/* 4096 才有足够精度投出窗棂的格子影：22 m 的范围里 2048 只有 93 texel/m，
   窗框的细边会糊成一团。 */
sun.shadow.mapSize.set(4096, 4096);
/* 正交范围要盖住整间房（11.2 m 宽 × 10 m 深）以及窗棂的投影，±11 够用。 */
sun.shadow.camera.left = -11;
sun.shadow.camera.right = 11;
sun.shadow.camera.top = 11;
sun.shadow.camera.bottom = -11;
sun.shadow.camera.near = 0.5;
/* 太阳现在在窗外、距目标约 21 m，far=20 会把整间房裁掉（阴影直接消失）。 */
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.022;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);

const bounce = new THREE.DirectionalLight(0xc9d8f2, 0.22);
bounce.position.set(-6, 4, 8);
scene.add(bounce);

/* ============================== 3.5 背景：夜里的城市 ============================== */
/* 三层楼（远 / 中 / 近各一圈圆柱）+ 正对窗的一片楼，相机转动时以不同速度移动。

   这一版把「随机矩形 + 散点灯」换成真正的建筑群：
   · 天际线由低频包络 + 三处地标构成节奏，不是锯齿状随机高度；
   · 每栋楼有明确类型（玻璃幕墙塔 / 混凝土住宅 / 退台塔 / 裙房 / 地标），
     配竖梃、楼层线、玻璃反射、右侧暗转角与顶部亮边 —— 有立面结构也有体块；
   · 窗先铺满玻璃底再按「楼层亮灯模式」点亮（整层通亮 / 半亮 / 稀疏 / 全暗），
     比逐窗纯随机更接近真实写字楼夜景；
   · 白天独立绘制：蓝天薄云、灰白混凝土与冷蓝玻璃、窗是暗的反射，
     不再是过曝去饱和的夜景。
   几何用确定性随机预计算一次，夜 / 昼共用同一座城，绘制阶段不再消耗随机数。 */

function cityCanvas({
  W = 3072, H = 768, horizon = 0.86, minH = 0.3, maxH = 0.9,
  minW = 0.012, maxW = 0.045, lit = 0.22, base = '#0b1018',
  haze = 0.5, seedBase = 7, glowTop = '#070b16',
  bloom = 0.55, street = 0.6, backRow = 0.7,
  /* 近景框景：只在正对窗那层启用；三层圆柱环绕不需要 */
  foregroundOn = 0,
} = {}) {
  const HZ = H * horizon;                         // 楼脚基线
  const put = (r, gg, b, a) => `rgba(${Math.round(r)},${Math.round(gg)},${Math.round(b)},${a.toFixed(3)})`;

  let seed = seedBase;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rr = (a, b) => a + rnd() * (b - a);
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));

  /* --- 天际线包络：低频起伏 + 三处拔高的地标 --- */
  const ph1 = rr(0, Math.PI * 2), ph2 = rr(0, Math.PI * 2);
  const envelope = (u) => 0.50 + 0.22 * Math.sin(u * Math.PI * 2.7 + ph1)
                               + 0.11 * Math.sin(u * Math.PI * 6.9 + ph2);
  /* 三处地标放在贴图中央：透过窗只能看到横向约中间 47%，
     放在 0.14 / 0.76 会全被裁掉，天际线就剩一片平铺的竖条。 */
  const marks = [0.30, 0.50, 0.70].map((m) => ({ u: m + rr(-0.022, 0.022), boost: rr(0.26, 0.42) }));

  /* --- 远景剪影带：压在主楼后面，给天际线垫一层 --- */
  const far = [];
  if (backRow > 0) {
    let fx = 0;
    while (fx < W) {
      const w = W * rr(0.004, 0.016);
      const h = H * rr(0.08, 0.30) * backRow;
      const dots = [];
      if (rnd() > 0.5) {
        const cols = Math.max(2, Math.round(w / (W * 0.0022)));
        const rows = Math.max(3, Math.round(h / (H * 0.012)));
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if (rnd() > 0.16) continue;
          dots.push({ i, j, cols, rows, a: 0.10 + rnd() * 0.18 });
        }
      }
      far.push({ x: fx, w, h, top: HZ - h, dots });
      fx += w + W * rr(0.0006, 0.003);
    }
  }

  /* --- 主楼群：几何、立面与亮灯模式一次算定 --- */
  const blocks = [];
  {
    let x = 0;
    while (x < W) {
      const bw = W * rr(minW, maxW);
      if (x + bw > W) break;                    // 不留半栋楼，贴图左右接缝才自然
      const u = (x + bw / 2) / W;
      let env = envelope(u), mark = false;
      for (const m of marks) if (Math.abs(u - m.u) < 0.026) { env += m.boost; mark = true; }

      const pick = rnd();
      const type = mark ? 'landmark'
        : pick < 0.28 ? 'curtain'
        : pick < 0.50 ? 'residential'
        : pick < 0.68 ? 'setback'
        : pick < 0.82 ? 'podium' : 'solid';
      /* 高度由包络直接决定，地标才真的拔高；再叠一点随机打破机械感 */
      const norm = cl((env - 0.16) / 0.86, 0, 1.25);
      let bh = H * (minH + (maxH - minH) * norm) * rr(0.88, 1.10);
      bh = Math.min(bh, HZ - H * 0.012);
      if (type === 'podium') bh = Math.min(bh, HZ * 0.42);
      bh = Math.max(bh, H * 0.06);
      const top = HZ - bh;

      const glassy = type === 'curtain' || type === 'landmark' || type === 'podium';
      const solid = type === 'solid';       // 暗实体楼：几乎不亮灯，给楼群留呼吸的暗块
      const cols = cl(Math.round(bw / (W * (glassy ? 0.0027 : 0.0036))), 3, 26);
      const rows = cl(Math.round(bh / (H * (glassy ? 0.0108 : 0.0130))), 3, 64);

      /* 楼层亮灯模式：整层加班 / 半亮 / 稀疏 / 全暗 / 常规散点 */
      const floorP = [];
      for (let j = 0; j < rows; j++) {
        const m = rnd();
        floorP.push(solid
          ? (m < 0.72 ? 0.008 : lit * rr(0.10, 0.34))
          : m < 0.10 ? 0.92 : m < 0.24 ? 0.55 : m < 0.40 ? 0.10
            : m < 0.52 ? 0.02 : lit * rr(0.35, 1.15));
      }
      const warm = rnd() > 0.42;
      const tint = warm ? [255, rr(188, 226), rr(126, 178)] : [rr(178, 212), rr(204, 232), 255];
      const tintCold = warm ? [188, 214, 255] : [255, 206, 150];

      /* 只存亮着的窗；暗窗统一铺玻璃底，绘制量省一半以上 */
      const litCells = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (rnd() > floorP[j]) continue;
        litCells.push({ i, j, a: 0.24 + rnd() * 0.70, cold: rnd() > 0.88, halo: rnd() > 0.984 });
      }

      blocks.push({
        x, bw, bh, top, type, glassy, solid, cols, rows, tint, tintCold, litCells,
        darkEdge: bw * rr(0.14, 0.27),
        setbacks: type === 'landmark' ? 3 : type === 'setback' ? 2 : 0,
        roof: rnd() > 0.46 ? { dx: bw * rr(0.18, 0.5), w: bw * rr(0.12, 0.26), h: H * 0.015 } : null,
        antenna: rnd() > 0.62 ? { dx: bw * rr(0.30, 0.70), h: H * rr(0.022, 0.062) } : null,
        beacon: rnd() > 0.70 ? { dx: bw * rr(0.22, 0.80), r: rr(8, 13) } : null,
        skywalk: rnd() > 0.82 ? 0.62 + rnd() * 0.16 : null,
        sign: rnd() > 0.88 ? { dx: bw * rr(0.2, 0.7), h: bh * rr(0.14, 0.30), y: rr(0.35, 0.62) } : null,
      });
      /* 楼间距拉大：原来几乎连成一整片幕墙，看不出一栋栋的轮廓 */
      x += bw + W * (type === 'podium' ? rr(0.002, 0.006) : rr(0.0035, 0.012));
    }
  }

  /* --- 近景暗楼剪影：透过窗只能看到贴图 u≈0.235~0.710，
     所以必须把框景放在这个区间的两端边缘（0.25 / 0.69），
     放在贴图最左最右会被完全裁掉。只留窄窄一栋，不挡中央楼群。 */
  const foreground = [];
  if (foregroundOn) {
    for (const u of [0.245, 0.700]) {
      const w = W * rr(0.020, 0.032);
      const x = u * W - w / 2;
      const h = H * rr(0.34, 0.58);
      const c2 = Math.max(3, Math.round(w / (W * 0.004)));
      const r2 = Math.max(5, Math.round(h / (H * 0.016)));
      const cells = [];
      for (let i = 0; i < c2; i++) for (let j = 0; j < r2; j++) {
        if (rnd() > 0.22) continue;
        cells.push({ i, j, a: 0.16 + rnd() * 0.34 });
      }
      foreground.push({ x, w, h, top: HZ - h, tone: rr(0.80, 0.94), c2, r2, cells });
    }
  }

  /* --- 街面：路灯与车灯光轨，位置也预计算 --- */
  const streetLights = [];
  if (street > 0) {
    let sx = 0;
    while (sx < W) {
      if (rnd() > 0.55) {
        streetLights.push({ x: sx, y: HZ - H * rr(0.002, 0.012), r: rr(4, 11),
          a: (0.30 + rnd() * 0.22) * street, trail: rnd() > 0.72 });
      }
      sx += W * rr(0.004, 0.02);
    }
  }

  /* --- 天空 --- */
  const paintSky = (g, day) => {
    const sky = g.createLinearGradient(0, 0, 0, HZ);
    if (day) {
      sky.addColorStop(0, '#7ea8d0'); sky.addColorStop(0.40, '#a9c6dd');
      sky.addColorStop(0.78, '#cdd9e2'); sky.addColorStop(1, '#d7d8d2');
    } else {
      sky.addColorStop(0, glowTop); sky.addColorStop(0.30, '#0e1625');
      sky.addColorStop(0.58, '#1b2340'); sky.addColorStop(0.80, '#3b3450');
      sky.addColorStop(1, '#6a4e44');
    }
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (day) {
      for (let i = 0; i < 14; i++) {
        const cx = Math.random() * W, cy = H * (0.06 + Math.random() * 0.46);
        const cw = W * (0.03 + Math.random() * 0.10), ch = H * (0.006 + Math.random() * 0.018);
        g.save(); g.translate(cx, cy); g.scale(1, ch / cw);
        const cg = g.createRadialGradient(0, 0, 0, 0, 0, cw);
        cg.addColorStop(0, `rgba(255,255,255,${(0.10 + Math.random() * 0.16).toFixed(3)})`);
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cg; g.fillRect(-cw, -cw, cw * 2, cw * 2); g.restore();
      }
    } else {
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(210,224,255,${(0.05 + Math.random() * 0.16).toFixed(3)})`;
        g.fillRect(Math.random() * W, Math.random() * H * 0.42, 1.2, 1.2);
      }
      const gl = g.createLinearGradient(0, HZ - H * 0.30, 0, HZ);
      gl.addColorStop(0, 'rgba(255,180,120,0)');
      gl.addColorStop(0.7, `rgba(255,170,110,${(0.10 * haze).toFixed(3)})`);
      gl.addColorStop(1, `rgba(255,200,150,${(0.26 * haze).toFixed(3)})`);
      g.fillStyle = gl; g.fillRect(0, HZ - H * 0.30, W, H * 0.30);
    }
  };

  /* --- 一栋楼：主体 → 反射 → 体块 → 结构线 → 玻璃底 → 亮窗 → 顶部构件 --- */
  const paintBlock = (g, b, day) => {
    const { x, bw, bh, top, cols, rows } = b;
    const bodyTop = day ? (b.glassy ? '#93aac0' : b.solid ? '#7e8a94' : '#a8b0b6')
      : b.solid ? '#070b12' : base;
    const bodyBot = day ? (b.glassy ? '#6d879e' : b.solid ? '#5e6a76' : '#828b94')
      : b.solid ? '#04060b' : 'rgba(13,17,25,1)';
    const bg = g.createLinearGradient(0, top, 0, top + bh);
    bg.addColorStop(0, bodyTop); bg.addColorStop(1, bodyBot);
    g.fillStyle = bg; g.fillRect(x, top, bw, bh + H * 0.05);

    /* 幕墙斜向反射：玻璃才像映着天 */
    if (b.glassy) {
      const rg = g.createLinearGradient(x, top, x + bw, top + bh);
      rg.addColorStop(0, day ? 'rgba(235,246,255,.22)' : 'rgba(126,166,224,.12)');
      rg.addColorStop(0.38, 'rgba(255,255,255,0)');
      rg.addColorStop(0.72, day ? 'rgba(220,238,255,.14)' : 'rgba(96,136,196,.07)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(x, top, bw, bh);
      /* 玻璃把天空的亮度从上往下带下来：上半映天、下半映城，
         这是真玻璃幕墙和「涂了蓝色的墙」最大的区别 */
      const skyRef = g.createLinearGradient(0, top, 0, top + bh);
      skyRef.addColorStop(0, day ? 'rgba(206,228,248,.34)' : 'rgba(74,96,148,.18)');
      skyRef.addColorStop(0.45, day ? 'rgba(190,214,238,.10)' : 'rgba(52,70,116,.06)');
      skyRef.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = skyRef; g.fillRect(x, top, bw, bh);
    }

    /* 右侧暗转角 / 左侧细高光 / 顶部亮边：把纸片变体块 */
    g.fillStyle = day ? 'rgba(36,52,68,.34)' : 'rgba(4,7,13,.58)';
    g.fillRect(x + bw - b.darkEdge, top, b.darkEdge, bh);
    g.fillStyle = day ? 'rgba(255,255,255,.30)' : 'rgba(150,182,228,.13)';
    g.fillRect(x, top, Math.max(1, W * 0.0005), bh);
    g.fillStyle = day ? 'rgba(240,248,255,.52)' : 'rgba(168,200,240,.22)';
    g.fillRect(x, top, bw, Math.max(1, H * 0.0016));

    /* 立面骨架：竖梃 + 楼层线 */
    const lineW = Math.max(1, W * 0.00035);
    g.fillStyle = day ? 'rgba(250,253,255,.20)' : 'rgba(146,178,222,.085)';
    for (let i = 1; i < cols; i++) g.fillRect(x + (bw * i) / cols, top, lineW, bh);
    g.fillStyle = day ? 'rgba(48,62,78,.20)' : 'rgba(3,6,12,.26)';
    for (let j = 1; j < rows; j++) g.fillRect(x, top + (bh * j) / rows, bw, Math.max(1, H * 0.0011));

    /* 所有窗位先铺玻璃底，暗楼也有可读的网格 */
    const cw = (bw / cols) * 0.66, ch = (bh / rows) * 0.46;
    g.fillStyle = day ? 'rgba(48,68,88,.52)' : 'rgba(118,150,194,.075)';
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      g.fillRect(x + (bw * (i + 0.5)) / cols - cw / 2,
        top + (bh * (j + 0.5)) / rows - ch / 2, cw, ch);
    }

    if (!day) {
      for (const c of b.litCells) {
        const wx = x + (bw * (c.i + 0.5)) / cols - cw / 2;
        const wy = top + (bh * (c.j + 0.5)) / rows - ch / 2;
        const col = c.cold ? b.tintCold : b.tint;
        g.fillStyle = put(col[0], col[1], col[2], c.a);
        g.fillRect(wx, wy, cw, ch);
        if (c.halo) {
          const hx = wx + cw / 2, hy = wy + ch / 2, r = Math.max(6, W * 0.003);
          const halo = g.createRadialGradient(hx, hy, 0, hx, hy, r);
          halo.addColorStop(0, put(col[0], col[1], col[2], 0.42));
          halo.addColorStop(1, put(col[0], col[1], col[2], 0));
          g.fillStyle = halo; g.fillRect(hx - r, hy - r, r * 2, r * 2);
        }
      }
    }

    /* 立面发光标识：少数楼有一道竖向冷光，城市才有商业感 */
    if (b.sign && !day) {
      const sx = x + b.sign.dx, sy = top + bh * b.sign.y;
      const sg = g.createLinearGradient(0, sy, 0, sy + b.sign.h);
      sg.addColorStop(0, 'rgba(140,200,255,0)');
      sg.addColorStop(0.5, 'rgba(140,200,255,.24)');
      sg.addColorStop(1, 'rgba(140,200,255,0)');
      g.fillStyle = sg; g.fillRect(sx, sy, Math.max(1.5, W * 0.0008), b.sign.h);
    }

    /* 设备层 / 空中连廊 */
    if (b.skywalk) {
      const sy = top + bh * b.skywalk;
      g.fillStyle = day ? 'rgba(250,253,255,.30)' : 'rgba(190,214,246,.20)';
      g.fillRect(x - bw * 0.05, sy, bw * 1.10, Math.max(2, H * 0.004));
    }

    /* 退台与塔冠：地标才有真正的收分节奏 */
    if (b.setbacks) {
      let cw2 = bw * 0.74, cy = top, ch2 = bh * 0.075;
      for (let s = 0; s < b.setbacks; s++) {
        g.fillStyle = day ? '#8798a8' : base;
        g.fillRect(x + (bw - cw2) / 2, cy - ch2, cw2, ch2 + 1);
        g.fillStyle = day ? 'rgba(250,253,255,.45)' : 'rgba(168,200,240,.20)';
        g.fillRect(x + (bw - cw2) / 2, cy - ch2, cw2, Math.max(1, H * 0.0014));
        cy -= ch2; cw2 *= 0.66; ch2 *= 0.82;
      }
    }

    /* 楼顶机房 / 天线 / 航空障碍灯 */
    if (b.roof) {
      g.fillStyle = day ? '#69798a' : base;
      g.fillRect(x + b.roof.dx, top - b.roof.h, b.roof.w, b.roof.h);
    }
    if (b.antenna) {
      g.fillStyle = day ? 'rgba(70,86,102,.75)' : 'rgba(150,170,200,.48)';
      g.fillRect(x + b.antenna.dx, top - b.antenna.h, Math.max(1.2, W * 0.0004), b.antenna.h);
    }
    if (b.beacon && !day) {
      const bx = x + b.beacon.dx, by = top - 5, r = b.beacon.r;
      const halo = g.createRadialGradient(bx, by, 0, bx, by, r);
      halo.addColorStop(0, 'rgba(255,96,74,.55)');
      halo.addColorStop(1, 'rgba(255,96,74,0)');
      g.fillStyle = halo; g.fillRect(bx - r, by - r, r * 2, r * 2);
      g.fillStyle = 'rgba(255,120,96,.95)'; g.fillRect(bx - 1.2, by - 1.2, 2.4, 2.4);
    }
  };

  /* --- 整幅绘制 --- */
  const paint = (day) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    paintSky(g, day);

    /* 远景剪影 */
    for (const f of far) {
      g.fillStyle = day ? 'rgba(112,132,152,.42)' : `rgba(26,33,49,${(0.5 + haze * 0.22).toFixed(3)})`;
      g.fillRect(f.x, f.top, f.w, f.h + H * 0.04);
      if (!day) for (const d of f.dots) {
        g.fillStyle = put(255, 205, 150, d.a);
        g.fillRect(f.x + (f.w * (d.i + 0.5)) / d.cols,
          f.top + (f.h * (d.j + 0.5)) / d.rows, 1.6, 1.6);
      }
    }
    for (const b of blocks) paintBlock(g, b, day);

    /* 大气透视：主楼群画完后整体蒙一层远处空气，
       让亮窗与楼体一起变淡，而不是只压楼体（否则灯会浮在雾前面）。 */
    const air = g.createLinearGradient(0, HZ - H * 0.42, 0, HZ + H * 0.02);
    air.addColorStop(0, day ? 'rgba(186,204,220,0)' : 'rgba(38,44,68,0)');
    air.addColorStop(1, day
      ? `rgba(196,212,226,${(0.11 * (0.5 + haze)).toFixed(3)})`
      : `rgba(40,46,70,${(0.16 * (0.5 + haze)).toFixed(3)})`);
    g.fillStyle = air; g.fillRect(0, HZ - H * 0.42, W, H * 0.44);

    /* 近景暗楼：最后画，压住边缘，给画面一个明确的前后层次 */
    for (const f of foreground) {
      g.fillStyle = day ? `rgba(58,72,88,${f.tone.toFixed(3)})` : `rgba(6,9,16,${f.tone.toFixed(3)})`;
      g.fillRect(f.x, f.top, f.w, f.h + H * 0.06);
      g.fillStyle = day ? 'rgba(226,238,250,.22)' : 'rgba(140,170,210,.10)';
      g.fillRect(f.x, f.top, f.w, Math.max(1, H * 0.0016));
      g.fillStyle = day ? 'rgba(255,255,255,.16)' : 'rgba(120,150,190,.06)';
      g.fillRect(f.x, f.top, Math.max(1, W * 0.0005), f.h);
      /* 近楼也有零星亮窗，才不像一块黑板 */
      for (const c of f.cells) {
        if (day && c.a < 0.30) continue;
        g.fillStyle = day ? 'rgba(210,224,236,.28)' : put(255, 200, 150, c.a);
        g.fillRect(f.x + (f.w * (c.i + 0.5)) / f.c2, f.top + (f.h * (c.j + 0.5)) / f.r2,
          Math.max(1.5, f.w / f.c2 * 0.42), Math.max(1.5, f.h / f.r2 * 0.34));
      }
    }

    /* 街面灯与车灯光轨 */
    if (!day) for (const s of streetLights) {
      const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      halo.addColorStop(0, `rgba(255,206,150,${s.a.toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,206,150,0)');
      g.fillStyle = halo; g.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      if (s.trail) {
        g.fillStyle = `rgba(255,190,130,${(s.a * 0.5).toFixed(3)})`;
        g.fillRect(s.x - s.r * 2.4, s.y - 0.8, s.r * 2.0, 1.6);
      }
    }

    /* 大气透视：地平线附近化进雾里，越远（haze 大）越明显 */
    const atmos = g.createLinearGradient(0, HZ - H * 0.30, 0, HZ);
    if (day) {
      atmos.addColorStop(0, 'rgba(190,206,220,0)');
      atmos.addColorStop(1, `rgba(198,212,224,${(0.18 * (0.5 + haze)).toFixed(3)})`);
    } else {
      atmos.addColorStop(0, 'rgba(74,62,86,0)');
      atmos.addColorStop(1, `rgba(88,70,86,${(0.16 * (0.5 + haze)).toFixed(3)})`);
    }
    g.fillStyle = atmos; g.fillRect(0, HZ - H * 0.30, W, H * 0.30);

    /* 地平线以下压暗，楼才像立在城市里而不是浮在雾上 */
    const below = g.createLinearGradient(0, HZ, 0, H);
    below.addColorStop(0, day ? 'rgba(120,136,150,.55)' : 'rgba(10,13,20,.55)');
    below.addColorStop(0.45, day ? 'rgba(138,152,164,.90)' : 'rgba(7,9,14,.92)');
    below.addColorStop(1, day ? '#b8c2cc' : '#04060a');
    g.fillStyle = below; g.fillRect(0, HZ, W, H * (1 - horizon) + 1);

    /* 夜景辉光：只抬亮处，不抬暗部 */
    if (!day && bloom > 0) {
      const bc = document.createElement('canvas');
      bc.width = W; bc.height = H;
      const bg2 = bc.getContext('2d');
      bg2.filter = `blur(${Math.round(W / 320)}px) contrast(2.4) brightness(1.12)`;
      bg2.drawImage(c, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = bloom * 0.40;
      g.drawImage(bc, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }

    /* 细颗粒压掉纯色块的塑料感 */
    for (let i = 0; i < W * H * 0.0014; i++) {
      g.fillStyle = `rgba(255,255,255,${(0.012 + Math.random() * 0.02).toFixed(3)})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1.3, 1.3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  };

  return { night: paint(false), day: paint(true) };
}

/* 三层楼，越远越淡越雾 */
function cityLayer(radius, height, y, opts) {
  const tex = cityCanvas(opts);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 96, 1, true),
    new THREE.MeshBasicMaterial({
      map: tex.night, side: THREE.BackSide, fog: false, toneMapped: false,
    }),
  );
  m.position.set(0, y, 0);
  m.userData.cityTex = tex;
  scene.add(m);
  return m;
}

/* 三层圆柱提供转视角时的视差。新的高度公式由包络直接决定，
   所以按「远层矮、淡、灯少；近层高、暗、灯多」重新配比。 */
const cityFar = cityLayer(96, 62, 15, {
  W: 2560, H: 640, horizon: 0.82, minH: 0.10, maxH: 0.30, minW: 0.010, maxW: 0.030,
  lit: 0.16, base: '#0c1320', haze: 1.0, seedBase: 23, glowTop: '#0a1220',
  bloom: 0.8, street: 0.4, backRow: 1,
});
const cityMid = cityLayer(58, 42, 10, {
  W: 3072, H: 768, horizon: 0.80, minH: 0.14, maxH: 0.44, minW: 0.014, maxW: 0.040,
  lit: 0.28, base: '#080d16', haze: 0.60, seedBase: 91, glowTop: '#0b1322',
  bloom: 0.65, street: 0.6, backRow: 0.7,
});
const cityNear = cityLayer(31, 27, 6, {
  W: 4096, H: 1024, horizon: 0.78, minH: 0.20, maxH: 0.58, minW: 0.020, maxW: 0.056,
  lit: 0.50, base: '#05080e', haze: 0.24, seedBase: 47, glowTop: '#0a1120',
  bloom: 0.5, street: 0.5, backRow: 0.45,
});
/* 雾：让远处化进夜色里 */
scene.fog = new THREE.FogExp2(0x141b28, 0.0055);
scene.background = new THREE.Color(0x0a0e16);

/* ============================== 3.6 室内：桌 · 地 · 窗 ============================== */
/* 场景设定：高层公寓靠窗的一张长桌上，摆着这间"模型屋"。
   桌子给主体一个落点，落地窗给城市一个框，地面把两者连起来。 */

/* 房间体积 8.0×7.1×3.05 ≈ 173 m³ → 11.2×10.0×3.90 ≈ 437 m³（2.52 倍）。
   层高 3.05→3.90（+28%）：挑高客厅，天花不再压着画面。 */
const INTERIOR = {
  floorY: 0,          // 二层地面
  tableTop: 0.75,     // 展示桌桌面（真实桌高）
  winZ: -4.9,         // 后墙 / 落地窗
  winBottom: 0.32,    // 窗台高（现代大平层压得很低）
  winTop: 3.25,       // 窗顶（跟着层高抬，窗上仍留 0.65 m 实墙藏灯槽）
  ceilY: 3.90,        // 层高
};

/* 一层模型台的整体缩放：8×6×3 的"房间"缩成 1.52×1.14×0.57 的展示物
   （大型鱼缸 / 建筑模型那个量级），摆在桌上才成立。 */
const MODEL_SCALE = 0.17;
/* 缩放后点光源的强度要乘 s²、照射距离要乘 s，否则一盏 6 米远的灯会照亮整个公寓 */
const MODEL_SCALE_SQ = MODEL_SCALE * MODEL_SCALE;

/* 木纹：桌面与地板共用一套画法，避免大面积纯色的"塑料感" */
function woodGrain(hex, contrast) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.fillRect(0, 0, S, S);
  let seed = 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * S;
    const w = 1 + rnd() * 3;
    g.fillStyle = rnd() > 0.5
      ? `rgba(0,0,0,${0.03 + rnd() * contrast})`
      : `rgba(255,235,205,${0.02 + rnd() * contrast * 0.6})`;
    g.fillRect(x, 0, w, S);
  }
  for (let i = 0; i < 26; i++) {
    const y = rnd() * S;
    g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * contrast})`;
    g.fillRect(0, y, S, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* 地面：深色微水泥（现代极简的常见做法）——大块无缝、极淡的云斑，
   不用拼板。微水泥靠"粗糙度略不均匀 + 极淡色差"表现，不能有直线。
   rough 值写进贴图，用同一张灰度图当 roughnessMap，反光才不是塑料均匀的一层。 */
function cementFloor(base) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  /* 云斑：大而软、对比极低。半径小了会变成"脏点" */
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 60 + rnd() * 260;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const up = rnd() > 0.5;
    grd.addColorStop(0, up ? 'rgba(255,246,235,.016)' : 'rgba(0,0,0,.030)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  /* 极细颗粒：近看才有的水泥砂感 */
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 7;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.1, 2.9);
  t.anisotropy = 8;
  return t;
}
/* 粗糙度贴图：亮=更粗糙。微水泥是"浇出来的"，有几处被踩亮的地方，
   反光要一块块不均匀，整片均匀的话立刻变塑料。 */
function cementRough() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#a8a8a8';
  g.fillRect(0, 0, S, S);
  let seed = 77;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S, y = rnd() * S, r = 50 + rnd() * 160;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${rnd() > 0.5 ? 210 : 120},${rnd() > 0.5 ? 210 : 120},${rnd() > 0.5 ? 210 : 120},.22)`);
    grd.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.1, 2.9);   // 必须与颜色贴图一致，否则反光块和色斑错位
  t.anisotropy = 8;
  return t;
}
/* 抛光木地板：参考图里地面是整个空间的反光底，必须有长条拼板 + 强反射。
   板缝是唯一允许的直线；其余交给低粗糙度和环境反射。 */
function plankFloor(colorA, colorB) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = colorA;
  g.fillRect(0, 0, S, S);
  let seed = 137;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 7;
  const hgt = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * hgt;
    g.fillStyle = r % 2 ? colorB : colorA;
    g.fillRect(0, y, S, hgt);
    /* 木纹：沿板长的细线 */
    for (let i = 0; i < 34; i++) {
      const yy = y + 4 + rnd() * (hgt - 8);
      const amp = 0.6 + rnd() * 2.2;
      const ph = rnd() * 6.28;
      g.strokeStyle = `rgba(0,0,0,${(0.05 + rnd() * 0.12).toFixed(3)})`;
      g.lineWidth = 0.5 + rnd() * 1.2;
      g.beginPath();
      for (let x = 0; x <= S; x += 16) {
        const off = Math.sin(x * 0.02 + ph) * amp;
        if (x === 0) g.moveTo(x, yy + off); else g.lineTo(x, yy + off);
      }
      g.stroke();
    }
    /* 板缝：横向深色一条 + 随机端缝 */
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(0, y, S, 2.5);
    g.fillStyle = 'rgba(0,0,0,.42)';
    g.fillRect((r % 2 ? 0.32 : 0.68) * S + rnd() * 40, y, 2, hgt);
    /* 上缘一道极淡高光，板才有厚度 */
    g.fillStyle = 'rgba(255,225,190,.05)';
    g.fillRect(0, y + 2.5, S, 1.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.4, 3.0);
  t.anisotropy = 8;
  return t;
}

/* 地板粗糙度：整体很滑（低值=强反射），只在板缝处粗糙一点 */
function plankRough() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  /* 底色必须偏亮：roughnessMap 是与材质 roughness 相乘的。
     底色 0.23 乘以 0.26 只剩 0.06 —— 地板接近全镜面，
     吊灯会在地上摊成一颗锐利的小圆球（实测就是画面里那个"悬浮光球"）。 */
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, S, S);
  let seed = 211;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 7;
  const hgt = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * hgt;
    /* 每块板的滑度略有差异：整片一致会像镜子，太假 */
    g.fillStyle = `rgba(${Math.round(150 + rnd() * 60)},${Math.round(150 + rnd() * 60)},${Math.round(150 + rnd() * 60)},.45)`;
    g.fillRect(0, y, S, hgt);
    g.fillStyle = 'rgba(235,235,235,.9)';   // 板缝更粗糙
    g.fillRect(0, y, S, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.4, 3.0);   // 必须与颜色贴图一致
  t.anisotropy = 8;
  return t;
}

/* 障子纸：半透的暖白纸面，带极淡的纤维与竖向木骨。
   参考图里障子是整面发光的背景板，纸本身要有"透光"的层次而不是一块白板。 */
function shojiPaper() {
  const W2 = 512, H2 = 512;
  const c = document.createElement('canvas');
  c.width = W2; c.height = H2;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H2);
  grd.addColorStop(0, '#efe6d4');
  grd.addColorStop(0.5, '#e6dbc6');
  grd.addColorStop(1, '#d9ccb4');
  g.fillStyle = grd;
  g.fillRect(0, 0, W2, H2);
  let seed = 313;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  /* 纸纤维 */
  for (let i = 0; i < 620; i++) {
    const x = rnd() * W2, y = rnd() * H2;
    const len = 6 + rnd() * 26;
    const vert = rnd() > 0.7;
    g.strokeStyle = `rgba(${rnd() > 0.5 ? 255 : 150},${rnd() > 0.5 ? 245 : 140},${rnd() > 0.5 ? 225 : 120},${(0.05 + rnd() * 0.09).toFixed(3)})`;
    g.lineWidth = 0.6 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(vert ? x + rnd() * 3 : x + len, vert ? y + len : y + rnd() * 3);
    g.stroke();
  }
  /* 木骨：竖向细条（横条由几何体单独做，纸只负责竖骨） */
  for (let i = 1; i < 4; i++) {
    const x = (W2 * i) / 4;
    g.fillStyle = 'rgba(52,38,26,.34)';
    g.fillRect(x - 2.5, 0, 5, H2);
    g.fillStyle = 'rgba(255,246,228,.16)';
    g.fillRect(x + 2.5, 0, 1.2, H2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* 竹帘（簾）：横向细竹 + 竖向吊绳，半透。挂在窗顶做和风的第一层。 */
function sudareTex() {
  const W2 = 512, H2 = 512;
  const c = document.createElement('canvas');
  c.width = W2; c.height = H2;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W2, H2);
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gap = 9;
  for (let y = 0; y < H2; y += gap) {
    const shade = 0.55 + rnd() * 0.4;
    g.fillStyle = `rgba(${Math.round(120 * shade)},${Math.round(96 * shade)},${Math.round(58 * shade)},.92)`;
    g.fillRect(0, y, W2, gap - 2.2);
    g.fillStyle = 'rgba(255,232,190,.10)';
    g.fillRect(0, y, W2, 1);
    g.fillStyle = 'rgba(0,0,0,.30)';
    g.fillRect(0, y + gap - 2.6, W2, 1);
  }
  /* 竖向吊绳 */
  for (let i = 1; i < 6; i++) {
    g.fillStyle = 'rgba(38,32,24,.72)';
    g.fillRect((W2 * i) / 6, 0, 2.4, H2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* 地面：和风改造后从「深色微水泥」换成「深色抛光木地板」。
   参考图里地面是整间房的反光底——低频长反光、板缝清晰、能映出灯和窗。
   所以粗糙度压到 0.16（水泥是 0.62），并保留粗糙度贴图让反光一块块不均匀。 */
/* 榻榻米：蔺草编织的横向细密纹 + 每块席四周的深色布边。
   参考图里地面就是一大片榻榻米，草的横纹比木纹更"软"，也压得住深色房间。 */
function tatamiTex() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#8d8560';
  g.fillRect(0, 0, S, S);
  let seed = 53;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  /* 草茎：横向密排，每根略有色差 */
  const step = 4;
  for (let y = 0; y < S; y += step) {
    const t = 0.82 + rnd() * 0.3;
    g.fillStyle = `rgb(${Math.round(141 * t)},${Math.round(133 * t)},${Math.round(96 * t)})`;
    g.fillRect(0, y, S, step - 1);
    g.fillStyle = 'rgba(0,0,0,.10)';
    g.fillRect(0, y + step - 1, S, 1);
    /* 草节：少量短横线 */
    if (rnd() > 0.86) {
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(rnd() * S, y, 10 + rnd() * 26, 1.4);
    }
  }
  /* 竖向编织压痕 */
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S;
    g.fillStyle = `rgba(255,246,214,${(0.03 + rnd() * 0.05).toFixed(3)})`;
    g.fillRect(x, 0, 1 + rnd() * 2, S);
  }
  /* 席边：深藏青布边 */
  const band = 26;
  g.fillStyle = '#2b3226';
  g.fillRect(0, 0, S, band);
  g.fillRect(0, S - band, S, band);
  g.fillRect(0, 0, band, S);
  g.fillRect(S - band, 0, band, S);
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(0, band, S, 2);
  g.fillRect(0, S - band - 2, S, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.6, 1.2);
  t.anisotropy = 8;
  return t;
}

const floorTex = plankFloor('#3b2e23', '#332820');
const floorRough = plankRough();
/* 桌面比地面亮"半档"就够：亮一整档会让它成为画面最亮的块，抢走模型台。
   分层靠的是模型台(暖亮) > 桌面(中深) > 地毯(深) > 地面(深)这条明度链。 */
const tableTex = woodGrain('#4e3c2c', 0.10);
tableTex.repeat.set(3, 2);
/* 桌面放大后不能再保持镜面：房间变宽、窗变高，冷色方向光会在光滑桌面上
   打出一块硬边矩形高光（实测 windowFill/rimCool/rimWarm 关掉即消失）。
   roughness 0.30 → 0.52，把高光摊开成柔和渐变。 */
const TABLE_ROUGHNESS = 0.52;

/* 地面材质：抛光木地板。roughness 0.16 会在地板上打出一块又小又圆的镜面光斑
   （实测桌左侧那颗"悬浮光球"就是嵌灯的镜面高光）；0.26 把高光摊成长条，
   才是打过蜡的木地板该有的反光形状。 */
const floorMat = new THREE.MeshStandardMaterial({
  map: floorTex, roughnessMap: floorRough, roughness: 0.42, metalness: 0.10,
  emissive: 0x241a12, emissiveIntensity: 0.6, envMapIntensity: 0.6,
});
/* 地板比房间每边多出 0.1，避免边界处露出缝 */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 10.2), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, INTERIOR.floorY, 0);
floor.receiveShadow = true;
scene.add(floor);

/* 展示桌：2.8 × 1.5 m，真桌高 0.75。深色木面 + 黑色金属细腿 */
/* 桌面给一点自发光底色：聚光只打中间，边缘全黑会读成"悬空黑洞"。
   强度接 lampK，白天自动收掉。 */
const woodTop = new THREE.MeshStandardMaterial({
  map: tableTex, color: 0x9c8874, roughness: TABLE_ROUGHNESS, metalness: 0.04,
  emissive: 0x241a12, emissiveIntensity: 0.35,
});
const tableGlowMats = [woodTop];
const woodLeg = new THREE.MeshStandardMaterial({ color: 0x121110, roughness: 0.42, metalness: 0.55 });

const TABLE = { w: 2.8, d: 1.5, h: INTERIOR.tableTop, z: -1.25 };
const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.045, TABLE.d), woodTop);
table.position.set(0, TABLE.h - 0.0225, TABLE.z);
table.castShadow = true;
table.receiveShadow = true;
scene.add(table);

for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, TABLE.h - 0.045, 0.055), woodLeg);
  leg.position.set(sx * (TABLE.w / 2 - 0.09), (TABLE.h - 0.045) / 2, TABLE.z + sz * (TABLE.d / 2 - 0.09));
  leg.castShadow = true;
  leg.receiveShadow = true;
  scene.add(leg);
}
/* 桌下横撑：一张真桌子会有，也把四条腿连起来 */
for (const sz of [-1, 1]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w - 0.2, 0.035, 0.03), woodLeg);
  rail.position.set(0, 0.16, TABLE.z + sz * (TABLE.d / 2 - 0.09));
  scene.add(rail);
}

/* 模型台：一层的房 + 家具整体装进这个组，缩放后摆在桌上。
   一层内部仍是它自己的 8×6 坐标系，交互全部在组内做，不受缩放影响。
   一层的底板厚 0.14、底面低于 y=0，所以整组要抬 0.14×scale，底板才正好贴桌面。 */
const MODEL_BASE_Y = TABLE.h + 0.14 * MODEL_SCALE;
const MODEL = new THREE.Group();
MODEL.scale.setScalar(MODEL_SCALE);
MODEL.position.set(0, MODEL_BASE_Y, TABLE.z);
scene.add(MODEL);

/* 桌面上一摊暖光：模型屋的灯落在桌上 */
const spillTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  grd.addColorStop(0, 'rgba(255,214,160,.95)');
  grd.addColorStop(0.45, 'rgba(255,196,140,.32)');
  grd.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const spill = new THREE.Mesh(
  new THREE.PlaneGeometry(2.8, 1.6),
  new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.16, fog: false, toneMapped: false }),
);
spill.rotation.x = -Math.PI / 2;
spill.position.set(0, TABLE.h + 0.004, TABLE.z);
scene.add(spill);

/* 落地窗：7.6 m 宽、窗台 0.32、窗顶 3.25——挑高客厅的整面玻璃。
   深色窗框（近黑氟碳喷涂），三根竖梃分成四格。 */
const winFrameMat = new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.34, metalness: 0.62 });
const sillMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.3 });
const winW = 7.6;
const winH = INTERIOR.winTop - INTERIOR.winBottom;
const winMidY = (INTERIOR.winTop + INTERIOR.winBottom) / 2;

function bar(w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), winFrameMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  return m;
}
/* 上下框 */
bar(winW, 0.06, 0.12, 0, INTERIOR.winTop, INTERIOR.winZ);
bar(winW, 0.07, 0.14, 0, INTERIOR.winBottom, INTERIOR.winZ);
/* 竖梃：7.6 m 分成五格，每格 1.52 m（四格会到 1.9 m，太宽） */
for (const i of [-2, -1, 0, 1, 2]) bar(0.03, winH, 0.08, i * (winW / 5), winMidY, INTERIOR.winZ);
/* 横梃：一道，跟着窗高抬到 1.85 */
bar(winW, 0.028, 0.075, 0, 1.85, INTERIOR.winZ);

/* 窗台板 */
const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.16, 0.05, 0.26), sillMat);
sill.position.set(0, INTERIOR.winBottom + 0.02, INTERIOR.winZ + 0.16);
sill.castShadow = true;
sill.receiveShadow = true;
scene.add(sill);

/* 窗四周的墙：窗只占后墙中间一块，两侧与窗下都是实墙。深炭灰涂料 */
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2e2f33, roughness: 0.92, metalness: 0.02, emissive: 0x151619, emissiveIntensity: 0.9 });
function wallPanel(w, h, x, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), wallMat);
  m.position.set(x, y, INTERIOR.winZ - 0.02);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
const APT_HALF_W = 5.6;   // 11.2 m 宽
const APT_FRONT_Z = 5.1;  // 与后墙 -4.9 之间 10.0 m 深（约 112 m² 的挑高客厅）
/* 后墙：窗两侧、窗下、窗上 */
wallPanel(APT_HALF_W - winW / 2, INTERIOR.ceilY, -(winW / 2 + (APT_HALF_W - winW / 2) / 2), INTERIOR.ceilY / 2);
wallPanel(APT_HALF_W - winW / 2, INTERIOR.ceilY, winW / 2 + (APT_HALF_W - winW / 2) / 2, INTERIOR.ceilY / 2);
wallPanel(winW, INTERIOR.winBottom, 0, INTERIOR.winBottom / 2);
wallPanel(winW, INTERIOR.ceilY - INTERIOR.winTop, 0, (INTERIOR.ceilY + INTERIOR.winTop) / 2);

/* ============================== 3.7 二层：公寓房间 ============================== */
/* 层级：模型台（一层，用户可自由修改）→ 公寓房间（二层，模型台的直接相关背景）→ 窗外城市（三层）。
   之前这一层只有桌、地、一面落地窗，四周是空的，模型台读起来像浮在黑台面上。
   这里补齐房间的围护、陈设与自己的照明，让"模型台摆在公寓里"成立。
   所有构件用 apt 前缀，避免与一层的同名变量冲突。 */
/* 大平层尺度：8.0（宽）× 7.1（深）× 3.05（层高）≈ 57 m²，深色现代客厅。 */
const APT = { halfW: APT_HALF_W, frontZ: APT_FRONT_Z, backZ: INTERIOR.winZ, ceilY: INTERIOR.ceilY };
/* 和风改造后的配色：深胡桃木护墙板、近黑铁件、障子纸、竹、以及一根红霓虹。
   二层材质带一点自发光基调：夜里全局环境只剩 0.055，深色墙不补底色会全黑。
   强度接在 setHour() 上，白天自动收掉。 */
/* 墙面：竖向木纹护墙板。参考图里墙是木的，靠板缝和微弱反光读出层次。 */
const aptPanelTex = woodGrain('#3a2c22', 0.14);
aptPanelTex.repeat.set(4.5, 0.9);
const aptWallMat = new THREE.MeshStandardMaterial({
  map: aptPanelTex, color: 0x9c8168, roughness: 0.86, metalness: 0.05,
  emissive: 0x1b1310, emissiveIntensity: 0.85,
});
const aptTrimMat = new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: 0.55, metalness: 0.35, emissive: 0x0a0806, emissiveIntensity: 0.5 });
const aptWoodMat = new THREE.MeshStandardMaterial({ map: tableTex, color: 0xa08a72, roughness: 0.46, metalness: 0.05, emissive: 0x1a1410, emissiveIntensity: 0.55 });
const aptDarkMat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.48, metalness: 0.4, emissive: 0x0b0b0d, emissiveIntensity: 0.4 });
/* 黄铜：深色空间里唯一的暖色金属，只用在把手、灯槽这种小面积 */
const aptBrassMat = new THREE.MeshStandardMaterial({ color: 0xb08d5a, roughness: 0.28, metalness: 0.85, emissive: 0x2a1e12, emissiveIntensity: 0.35 });
const aptGlowMats = [aptWallMat, aptTrimMat, aptWoodMat, aptDarkMat, wallMat];
const aptSideH = APT.ceilY - INTERIOR.floorY;
const aptDepth = APT.frontZ - APT.backZ;

/* 左右侧墙：朝内的单面（和天花同一套剖切逻辑）。
   实心盒子从房间外侧绕过去会挡住视线，单面墙在外侧被背面剔除，永远能看进去。 */
const aptWallSideMat = aptWallMat.clone();
aptWallSideMat.side = THREE.FrontSide;
/* 单面板投影必须用双面 shadowSide，不然从背面看过去不产生深度 */
aptWallSideMat.shadowSide = THREE.DoubleSide;
aptGlowMats.push(aptWallSideMat);
for (const sx of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(aptDepth, aptSideH), aptWallSideMat);
  wall.position.set(sx * APT.halfW, aptSideH / 2, (APT.frontZ + APT.backZ) / 2);
  wall.rotation.y = -sx * Math.PI / 2;      // 法线朝房间内侧
  wall.receiveShadow = true;
  /* 单面墙默认 shadowSide 是背面，投影会漏；同时把 castShadow 打开，
     否则太阳会从侧墙"穿"进屋里（旧版就是这样，室内亮度全靠补光撑着）。 */
  wall.castShadow = true;
  scene.add(wall);
  /* 踢脚：高 0.09 的一道深色细边，墙才落在地上 */
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.09, aptDepth), aptTrimMat);
  skirt.position.set(sx * (APT.halfW - 0.012), 0.045, (APT.frontZ + APT.backZ) / 2);
  scene.add(skirt);
}

/* 天花：朝下的单面材质——相机在室内时它是天花，升到顶上时被背面剔除，
   露出剖切面。深色平顶，是深色现代空间的一半底色。 */
const aptCeilMat = new THREE.MeshStandardMaterial({
  shadowSide: THREE.DoubleSide,
  color: 0x24252a, roughness: 0.97, metalness: 0,
  /* 朝下的单面收不到太阳直射，白天完全靠自发光显形；
     底色太暗（0x121317）的话，intensity 再高也是一整片纯黑。 */
  emissive: 0x313339, emissiveIntensity: 0.8, side: THREE.FrontSide,
});
const aptCeil = new THREE.Mesh(new THREE.PlaneGeometry(APT.halfW * 2, aptDepth), aptCeilMat);
aptCeil.rotation.x = Math.PI / 2;          // 法线朝下
aptCeil.position.set(0, APT.ceilY, (APT.frontZ + APT.backZ) / 2);
/* 天花也要挡光：不挡的话高角度的太阳会从屋顶漏进来 */
aptCeil.castShadow = true;
scene.add(aptCeil);
/* 不进 aptGlowMats：天花的明度在 setHour() 里单独给一条曲线 */

/* 天花上的嵌灯：深色现代不用密集筒灯，用"少而准"的几盏做重点照明。
   11.2 m 宽排两组，间距跟着放宽。 */
const aptDownlights = [];
for (const [dx, dz] of [[-3.3, 0.4], [3.3, 0.4]]) {
  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.022, 20),
    new THREE.MeshBasicMaterial({ color: 0xffdcb0, transparent: true, opacity: 0, toneMapped: false }),
  );
  can.position.set(dx, APT.ceilY - 0.014, dz);
  scene.add(can);
  aptDownlights.push(can);
  const l = new THREE.PointLight(0xffd0a0, 0, 8.5, 2);
  l.position.set(dx, APT.ceilY - 0.2, dz);
  scene.add(l);
  aptDownlights.push(l);
}

/* 展示位重点光：模型台是编辑主体，必须被一束光单独打亮。
   两盏嵌灯在 x=±2.2、z=0.4，照不到 z=-1.25 的桌面，桌面于是变成一整块死黑。
   深色现代展厅用一盏窄角轨道射灯解决——灯具可见，光有出处。 */
const aptSpotCan = new THREE.Mesh(
  new THREE.CylinderGeometry(0.09, 0.11, 0.26, 20),
  aptDarkMat,
);
aptSpotCan.position.set(0, APT.ceilY - 0.16, TABLE.z + 0.15);
scene.add(aptSpotCan);
const aptSpotGlow = new THREE.Mesh(
  new THREE.CircleGeometry(0.088, 20),
  new THREE.MeshBasicMaterial({ color: 0xffe2bc, transparent: true, opacity: 0, toneMapped: false }),
);
aptSpotGlow.rotation.x = Math.PI / 2;
aptSpotGlow.position.set(0, APT.ceilY - 0.295, TABLE.z + 0.15);
scene.add(aptSpotGlow);
/* 锥角 0.9 rad 覆盖整张 2.8 m 桌面；0.62 时只照亮右半边，左边仍是死黑。
   层高 3.05→3.90 后灯到桌面距离从 2.0 变 2.9 m，射程 5.0→7.0 才够到桌面。 */
const aptSpotLight = new THREE.SpotLight(0xffe0bc, 0, 7.0, 0.9, 0.7, 1.4);
aptSpotLight.position.set(0, APT.ceilY - 0.29, TABLE.z + 0.15);
aptSpotLight.target.position.set(0, TABLE.h, TABLE.z);
scene.add(aptSpotLight);
scene.add(aptSpotLight.target);

/* 两条线性灯带：深色现代的标志性照明，贴着天花两侧长向通铺，扫亮墙面。
   只有发光的条是不够的——墙必须被打亮，深色空间才立得起来，所以每条带下挂一盏
   长射程、低强度的点光，专门洗墙。 */
const aptStrips = [];
const aptStripLights = [];
for (const sx of [-1, 1]) {
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.014, aptDepth - 1.2),
    new THREE.MeshBasicMaterial({ color: 0xffe6c8, transparent: true, opacity: 0, toneMapped: false }),
  );
  strip.position.set(sx * (APT.halfW - 1.0), APT.ceilY - 0.014, (APT.frontZ + APT.backZ) / 2);
  scene.add(strip);
  aptStrips.push(strip);
  /* 洗墙光：贴着同侧墙放。房间深 7.1→10.0 m，两盏铺不匀，改三盏；
     层高也抬了 0.85 m，射程 7.5→9.5 才够从天花扫到地面。 */
  for (const dz of [-3.0, 0, 3.0]) {
    const l = new THREE.PointLight(0xffd8b0, 0, 9.5, 2);
    l.position.set(sx * (APT.halfW - 0.55), APT.ceilY - 0.12, (APT.frontZ + APT.backZ) / 2 + dz);
    scene.add(l);
    aptStripLights.push(l);
  }
}

/* 窗上方一道灯槽：窗顶到天花之间那条 0.43 m 的实墙正好藏它 */
const aptCove = new THREE.Mesh(
  new THREE.BoxGeometry(APT.halfW * 2 - 0.3, 0.03, 0.05),
  new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0, toneMapped: false }),
);
aptCove.position.set(0, INTERIOR.winTop + 0.06, INTERIOR.winZ + 0.22);
scene.add(aptCove);

/* 榻榻米：只做桌前一坪（2.9 × 1.6），铺在矮凳与茶台下面。
   参考图里草席是局部的小垫，主地面始终是抛光木地板——
   一开始铺了 5.6×4.0，把整片反光地板盖死，地面立刻变哑光。 */
const aptRugMat = new THREE.MeshStandardMaterial({
  map: tatamiTex(), roughness: 0.92, metalness: 0,
  emissive: 0x24241a, emissiveIntensity: 0.5,
});
const aptRug = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.6), aptRugMat);
aptRug.rotation.x = -Math.PI / 2;
aptRug.position.set(0.05, 0.010, 1.05);
aptRug.receiveShadow = true;
scene.add(aptRug);
/* 席下垫一层薄木框，榻榻米才有"放在地板上的厚度"，不会像贴纸 */
const aptRugEdgeMat = new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.86, emissive: 0x140f0b, emissiveIntensity: 0.5 });
const aptRugEdge = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.02, 1.72), aptRugEdgeMat);
aptRugEdge.position.set(0.05, 0.005, 1.05);
aptRugEdge.receiveShadow = true;
scene.add(aptRugEdge);
aptGlowMats.push(aptRugMat, aptRugEdgeMat, floorMat);

/* ---------- 窗边抬高平台（縁側）：参考图里的核心构造 ---------- */
/* 整块木台抬到 0.22 m，前沿做一道 45 mm 的深色收边，坐垫摆在台上。
   它把"窗外"和"室内"之间加了一层过渡，视线走过去先经过台面再到城市。 */
const engawaMat = new THREE.MeshStandardMaterial({
  map: plankFloor('#4a3627', '#3d2c1f'), roughness: 0.30, metalness: 0.10,
  emissive: 0x241a10, emissiveIntensity: 0.62, envMapIntensity: 0.5,
});
const ENGAWA = { h: 0.22, depth: 1.7, z: INTERIOR.winZ + 0.85 };
const aptNoseGlow = new THREE.Mesh(
  new THREE.BoxGeometry(APT.halfW * 2 - 0.6, 0.012, 0.03),
  new THREE.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0, toneMapped: false }),
);
{
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(APT.halfW * 2 - 0.5, ENGAWA.h, ENGAWA.depth), engawaMat,
  );
  deck.position.set(0, ENGAWA.h / 2, ENGAWA.z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  scene.add(deck);
  /* 前沿收边：深色压一道，台面才有厚度 */
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(APT.halfW * 2 - 0.5, 0.045, 0.06), aptTrimMat,
  );
  nose.position.set(0, ENGAWA.h - 0.022, ENGAWA.z + ENGAWA.depth / 2 + 0.03);
  scene.add(nose);
  /* 台面灯槽：沿收边一条极淡的暖光，把台沿"抬"起来 */
  aptNoseGlow.position.set(0, ENGAWA.h - 0.05, ENGAWA.z + ENGAWA.depth / 2 + 0.05);
  scene.add(aptNoseGlow);
}

/* 台上坐垫：两只方垫，布面朝上，是"可以坐在这里看城市"的唯一提示 */
const cushionTex = (() => {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6f7362';
  g.fillRect(0, 0, S, S);
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 40},${rnd() > 0.5 ? 250 : 46},${rnd() > 0.5 ? 230 : 40},${(0.03 + rnd() * 0.06).toFixed(3)})`;
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  /* 中央一道压痕，坐垫才有"被坐过"的软度 */
  const grd = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.52);
  grd.addColorStop(0, 'rgba(0,0,0,.16)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const cushionMat = new THREE.MeshStandardMaterial({
  map: cushionTex, roughness: 0.96, metalness: 0,
  emissive: 0x1c1d16, emissiveIntensity: 0.42,
});
aptGlowMats.push(cushionMat);
for (const dx of [-1.5, 0.05, 1.6]) {
  const cu = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.10, 0.62), cushionMat);
  cu.position.set(dx, ENGAWA.h + 0.05, ENGAWA.z - 0.15);
  cu.rotation.y = (dx * 0.06);
  cu.castShadow = true;
  cu.receiveShadow = true;
  scene.add(cu);
}

/* 模型台下的一圈细光：标出"这是房间里的一处展示位" */
const aptPlinthGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(1.46, 1.12),
  new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, opacity: 0, toneMapped: false }),
);
aptPlinthGlow.rotation.x = -Math.PI / 2;
aptPlinthGlow.position.set(0, TABLE.h + 0.003, TABLE.z);
scene.add(aptPlinthGlow);

/* 左墙矮边柜 2.1 m：离地 0.14 的四条黑钢腿 + 深木柜体 + 门缝 + 黄铜把手。
   实心一块板会读成"黑箱子"，柜子必须有离地、有分件。 */
const CAB = { z: 0.8, legH: 0.14, bodyH: 0.52, bodyD: 0.48, len: 2.8 };
const CAB_X = -APT.halfW + CAB.bodyD / 2 + 0.05;
const aptCabinet = new THREE.Mesh(new THREE.BoxGeometry(CAB.bodyD, CAB.bodyH, CAB.len), aptWoodMat);
aptCabinet.position.set(CAB_X, CAB.legH + CAB.bodyH / 2, CAB.z);
aptCabinet.castShadow = true;
aptCabinet.receiveShadow = true;
scene.add(aptCabinet);
for (const dz of [-1.25, 1.25]) for (const dx of [-0.16, 0.16]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, CAB.legH, 0.035), aptDarkMat);
  leg.position.set(CAB_X + dx, CAB.legH / 2, CAB.z + dz);
  scene.add(leg);
}
/* 门缝：把 2.8 m 的柜体分成三段，不做一块大板 */
const seamMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
for (const dz of [-0.47, 0.47]) {
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, CAB.bodyH - 0.04, 0.006), seamMat);
  seam.position.set(CAB_X + CAB.bodyD / 2 + 0.002, CAB.legH + CAB.bodyH / 2, CAB.z + dz);
  scene.add(seam);
}
/* 黄铜小把手：深色空间里唯一的一点暖金属 */
for (const dz of [-0.24, 0.24]) {
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 10), aptBrassMat);
  knob.position.set(CAB_X + CAB.bodyD / 2 + 0.012, CAB.legH + CAB.bodyH * 0.58, CAB.z + dz);
  scene.add(knob);
}
const CAB_TOP = CAB.legH + CAB.bodyH;
/* 柜面陈设：一只深色陶罐 + 两本书，克制到不能再少 */
const aptVase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.085, 0.115, 0.34, 22),
  new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.62, metalness: 0.08 }),
);
aptVase.position.set(CAB_X, CAB_TOP + 0.17, CAB.z - 0.9);
aptVase.castShadow = true;
scene.add(aptVase);
for (let i = 0; i < 2; i++) {
  const bk = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, 0.16),
    new THREE.MeshStandardMaterial({ color: [0x2b2f36, 0x6a5a48][i], roughness: 0.92 }),
  );
  bk.position.set(CAB_X, CAB_TOP + 0.02 + i * 0.042, CAB.z + 0.76);
  bk.rotation.y = 0.06 * i;
  bk.castShadow = true;
  scene.add(bk);
}

/* 桌前两张贴地矮凳 + 坐垫：参考图里的凳子压得极低（坐高 0.30），
   人不坐椅子而盘腿/侧坐，视线更低，房间才显得高。
   深色木框 + 浅色坐垫，坐垫和縁側台上的同一套布。 */
const lowBenchMat = new THREE.MeshStandardMaterial({
  map: tableTex, color: 0x8a7259, roughness: 0.52, metalness: 0.04,
  emissive: 0x181009, emissiveIntensity: 0.5,
});
aptGlowMats.push(lowBenchMat);
for (const [bx, bz, bw2] of [[-1.15, 0.62, 1.7], [1.25, 0.62, 1.7]]) {
  /* 凳面 */
  const seat = new THREE.Mesh(new THREE.BoxGeometry(bw2, 0.07, 0.52), lowBenchMat);
  seat.position.set(bx, 0.30, bz);
  seat.castShadow = true;
  seat.receiveShadow = true;
  scene.add(seat);
  /* 四条短腿：只露 0.10，贴地感 */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.235, 0.05), aptTrimMat);
    leg.position.set(bx + sx * (bw2 / 2 - 0.09), 0.1175, bz + sz * 0.18);
    leg.castShadow = true;
    scene.add(leg);
  }
  /* 坐垫：比凳面小一圈，压出一点厚度 */
  const pad = new THREE.Mesh(new THREE.BoxGeometry(bw2 - 0.16, 0.075, 0.42), cushionMat);
  pad.position.set(bx, 0.372, bz);
  pad.castShadow = true;
  pad.receiveShadow = true;
  scene.add(pad);
}

/* 矮茶台：放在两张凳子中间，是参考图里"围坐"关系的落点 */
{
  const trayTop = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.045, 0.5), lowBenchMat);
  trayTop.position.set(0.15, 0.34, 1.5);
  trayTop.castShadow = true;
  trayTop.receiveShadow = true;
  scene.add(trayTop);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.04), aptTrimMat);
    leg.position.set(0.15 + sx * 0.34, 0.16, 1.5 + sz * 0.18);
    scene.add(leg);
  }
  /* 台上一只深釉小壶 + 一只茶杯：不多不少 */
  const pot = new THREE.Mesh(
    new THREE.SphereGeometry(0.062, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2d2a24, roughness: 0.42, metalness: 0.18 }),
  );
  pot.scale.y = 0.82;
  pot.position.set(0.06, 0.41, 1.5);
  pot.castShadow = true;
  scene.add(pot);
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.026, 0.05, 14),
    new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.76 }),
  );
  cup.position.set(0.24, 0.388, 1.46);
  cup.castShadow = true;
  scene.add(cup);
}

/* 右墙一道深色木格栅：10 m 深的房间右立面全是平墙会非常空。
   长度跟到 6.0 m、高度跟到 3.2（层高 3.9），竖条 + 暗缝给出尺度与节奏。 */
{
  const gridZ0 = -3.2, gridZ1 = 2.8, gridH = 3.2;
  const slatMat = new THREE.MeshStandardMaterial({
    map: tableTex, color: 0x8d7862, roughness: 0.62, metalness: 0.05,
    emissive: 0x16120e, emissiveIntensity: 0.5,
  });
  aptGlowMats.push(slatMat);
  for (let z = gridZ0; z <= gridZ1 + 0.001; z += 0.24) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, gridH, 0.075), slatMat);
    slat.position.set(APT.halfW - 0.055, gridH / 2, z);
    slat.castShadow = true;
    scene.add(slat);
  }
  /* 格栅底部的暗缝：让竖条"落地"，不悬浮 */
  const gridBase = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, gridZ1 - gridZ0 + 0.2), aptTrimMat);
  gridBase.position.set(APT.halfW - 0.06, 0.03, (gridZ0 + gridZ1) / 2);
  scene.add(gridBase);
}

/* ---------- 和风核心构件：障子墙 · 红霓虹 · 木梁 · 竹帘 ---------- */
/* 这四样是参考图的识别语言：
   ① 左墙整面障子（半透纸 + 木格），夜里从背后透光，是最亮的一块"墙"；
   ② 墙根一根竖向红色霓虹管，冷空间里唯一的高饱和冷红；
   ③ 天花横向木梁，把 3.9 m 的层高切成有节奏的几段；
   ④ 窗顶竹帘，压住窗外城市，避免一眼望穿。 */

/* ① 障子墙：木框 + 横竖格 + 半透纸。纸用自发光，夜里从背后"亮"起来。
   左墙 z 从 -4.4 到 -2.2（避开边柜与门），高 2.8，落在地板上。 */
/* 必须先声明：障子块内部会给它赋值，用 let 写在后面会落进 TDZ。 */
let APT_SHOJI_LIGHT = null;
const shojiMat = new THREE.MeshStandardMaterial({
  map: shojiPaper(), roughness: 0.94, metalness: 0,
  emissive: 0x6b5a3e, emissiveIntensity: 0.35, side: THREE.DoubleSide,
});
aptGlowMats.push(shojiMat);
const shojiFrameMat = new THREE.MeshStandardMaterial({
  map: tableTex, color: 0x6f5b46, roughness: 0.7, metalness: 0.04,
  emissive: 0x120d09, emissiveIntensity: 0.45,
});
aptGlowMats.push(shojiFrameMat);
{
  const zA = -4.4, zB = -2.2, y0 = 0.06, y1 = 2.86;
  const zc = (zA + zB) / 2, wSpan = zB - zA;
  /* 纸面：一整张，贴在墙前 0.06 */
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(wSpan - 0.10, y1 - y0), shojiMat);
  paper.rotation.y = Math.PI / 2;
  paper.position.set(-APT.halfW + 0.09, (y0 + y1) / 2, zc);
  scene.add(paper);
  /* 外框：上下 + 两侧 */
  for (const [w, h, d, yy, zz] of [
    [0.07, 0.10, wSpan, y1, zc],
    [0.07, 0.10, wSpan, y0, zc],
    [0.07, y1 - y0, 0.09, (y0 + y1) / 2, zA],
    [0.07, y1 - y0, 0.09, (y0 + y1) / 2, zB],
  ]) {
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shojiFrameMat);
    bar2.position.set(-APT.halfW + 0.075, yy, zz);
    bar2.castShadow = true;
    scene.add(bar2);
  }
  /* 内格：3 道横骨 + 每格 4 道竖骨（与纸上的竖纹对齐，读起来才是"格子"） */
  for (let i = 1; i < 4; i++) {
    const yy = y0 + ((y1 - y0) * i) / 4;
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, wSpan - 0.12), shojiFrameMat);
    hb.position.set(-APT.halfW + 0.085, yy, zc);
    scene.add(hb);
  }
  for (let i = 1; i < 8; i++) {
    const zz = zA + (wSpan * i) / 8;
    const vb = new THREE.Mesh(new THREE.BoxGeometry(0.04, y1 - y0 - 0.12, 0.028), shojiFrameMat);
    vb.position.set(-APT.halfW + 0.085, (y0 + y1) / 2, zz);
    scene.add(vb);
  }
  /* 背后一盏柔光：纸要"透"而不是"白"，必须有光源在它后面 */
  const backLight = new THREE.PointLight(0xffd9a8, 0, 5.2, 2);
  backLight.position.set(-APT.halfW + 0.42, 1.6, zc);
  scene.add(backLight);
  APT_SHOJI_LIGHT = backLight;
}

/* ② 红色竖霓虹：参考图里最抢眼的一笔。
   一根细管立在墙根，靠"窄、直、纯红"制造赛博感，不能做成大面积红光。 */
const NEON = [];
const neonMat = new THREE.MeshBasicMaterial({ color: 0xff2a1e, transparent: true, opacity: 0, toneMapped: false });
/* 位置按默认机位算过：相机在 (2.80, 2.46, 3.13) 看向房间中心，水平半视角 31.5°。
   贴左墙 z=-0.55 时夹角 31.7°，正好差一点出画（实测完全看不见）；
   挪到縁側台左端（z=-4.0）后夹角只有 14°，稳定入画，也符合参考图
   "霓虹立在窗前平台边、旁边一株植物"的摆法。 */
for (const [nx, ny0, nz, nh] of [
  [-4.35, ENGAWA.h, INTERIOR.winZ + 0.92, 1.45],
  [-APT.halfW + 0.32, 0.10, 1.35, 1.15],
]) {
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, nh, 12), neonMat);
  tube.position.set(nx, ny0 + nh / 2, nz);
  scene.add(tube);
  /* 管座：一小块近黑铁件，管子才不是从地上长出来的 */
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.09, 14), aptTrimMat);
  base.position.set(nx, ny0 - 0.04, nz);
  scene.add(base);
  /* 光晕：一根细管的光是"罩"在周围一小圈，不是照亮整间房 */
  const l = new THREE.PointLight(0xff3a24, 0, 2.6, 2);
  l.position.set(nx, ny0 + nh * 0.55, nz);
  scene.add(l);
  NEON.push({ tube, light: l });
}

/* ③ 天花横向木梁：4 道，把 10 m 进深切成有节奏的几段。
   梁不做满宽（留 0.5 边距），是"架在墙上"，不是"糊在天花上"。 */
const beamMat = new THREE.MeshStandardMaterial({
  map: tableTex, color: 0x5f4a37, roughness: 0.78, metalness: 0.05,
  emissive: 0x120c07, emissiveIntensity: 0.45,
});
aptGlowMats.push(beamMat);
for (const bz of [-3.6, -1.5, 0.6, 2.7]) {
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(APT.halfW * 2 - 0.5, 0.20, 0.16), beamMat,
  );
  beam.position.set(0, APT.ceilY - 0.10, bz);
  beam.castShadow = true;
  beam.receiveShadow = true;
  scene.add(beam);
}

/* ④ 竹帘：挂在窗内侧顶部，垂下 0.62。参考图里它正好压住窗景上缘。
   半透材质，城市仍然透过来，只是一层"看到但看不清全"的过滤。 */
const sudareMat = new THREE.MeshStandardMaterial({
  map: sudareTex(), transparent: true, side: THREE.DoubleSide,
  roughness: 0.9, metalness: 0, opacity: 0.92,
  emissive: 0x1a1409, emissiveIntensity: 0.4,
});
aptGlowMats.push(sudareMat);
{
  const blind = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.3, 0.62), sudareMat);
  blind.position.set(0, INTERIOR.winTop - 0.31, INTERIOR.winZ + 0.16);
  scene.add(blind);
  /* 卷轴：帘子顶端一根深色圆杆 */
  const roller = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, winW - 0.24, 14), aptTrimMat,
  );
  roller.rotation.z = Math.PI / 2;
  roller.position.set(0, INTERIOR.winTop - 0.005, INTERIOR.winZ + 0.16);
  scene.add(roller);
}

/* ⑤ 栏间（欄間）：窗顶到天花之间那道 0.65 m 的窄带，
   做成一排竖向细格，白天透光、夜里是暗剪影，正是和室的收口方式。 */
{
  const y0 = INTERIOR.winTop + 0.06, y1 = APT.ceilY - 0.20;
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const x = -winW / 2 + (winW * i) / n;
    const slat2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, y1 - y0, 0.055), shojiFrameMat,
    );
    slat2.position.set(x, (y0 + y1) / 2, INTERIOR.winZ + 0.12);
    scene.add(slat2);
  }
  for (const yy of [y0, y1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.05, 0.07), shojiFrameMat);
    rail.position.set(0, yy, INTERIOR.winZ + 0.12);
    scene.add(rail);
  }
}
/* 右后角的绿植挪到縁側台上：参考图里植物都摆在抬高的平台边缘，
   贴着窗长，是"室内 / 室外"之间那层过渡的一部分。 */
const PLANT_Z = INTERIOR.winZ + 0.85;
const PLANT_Y = ENGAWA.h;
const aptPot = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.17, 0.4, 20),
  new THREE.MeshStandardMaterial({ color: 0x8d8172, roughness: 0.86 }),
);
aptPot.position.set(APT.halfW - 0.75, PLANT_Y + 0.20, PLANT_Z);
aptPot.castShadow = true;
scene.add(aptPot);
const aptLeafMat = new THREE.MeshStandardMaterial({ color: 0x35502f, roughness: 0.9, side: THREE.DoubleSide });
for (let i = 0; i < 11; i++) {
  const a = (i / 11) * Math.PI * 2;
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.15, 5), aptLeafMat);
  leaf.position.set(
    APT.halfW - 0.75 + Math.cos(a) * 0.18,
    PLANT_Y + 0.78 + (i % 3) * 0.16,
    PLANT_Z + Math.sin(a) * 0.18,
  );
  leaf.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42);
  leaf.castShadow = true;
  scene.add(leaf);
}

/* 左墙一道推拉障子门：和室里没有平开门。
   两扇半透纸门 + 深木框，纸和左墙那面障子用同一张纹理，读起来是同一套做法。 */
const doorZ = 3.4;
const doorH = 2.9;
for (const dz of [-0.485, 0.485]) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.035, doorH, 0.94), shojiMat);
  panel.position.set(-APT.halfW + 0.03 + (dz > 0 ? 0.02 : 0), doorH / 2, doorZ + dz);
  scene.add(panel);
  /* 每扇门的木框：上下 + 左右 + 一道竖中骨 */
  const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, doorH, 0.06), shojiFrameMat);
  fr.position.set(-APT.halfW + 0.045, doorH / 2, doorZ + dz - 0.47);
  scene.add(fr);
  const fr2 = fr.clone(); fr2.position.z = doorZ + dz + 0.47; scene.add(fr2);
  const frT = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.94), shojiFrameMat);
  frT.position.set(-APT.halfW + 0.045, doorH - 0.035, doorZ + dz); scene.add(frT);
  const frB = frT.clone(); frB.position.y = 0.035; scene.add(frB);
}
/* 门套：两侧 + 顶，近黑细边 */
for (const [w, h, dy, dz] of [[0.035, doorH + 0.06, (doorH + 0.06) / 2, -0.98], [0.035, doorH + 0.06, (doorH + 0.06) / 2, 0.98], [0.035, 1.0, doorH + 0.03, 0]]) {
  const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, w), aptTrimMat);
  jamb.position.set(-APT.halfW + 0.02, dy, doorZ + dz);
  scene.add(jamb);
}
/* 引手：障子门上那种小小的横木，不做现代长拉手 */
for (const dz of [-0.10, 0.10]) {
  const hikite = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.11), aptBrassMat);
  hikite.position.set(-APT.halfW + 0.055, 1.02, doorZ + dz);
  scene.add(hikite);
}

/* 左墙一幅竖挂轴（掛軸）：和室的墙上不挂方画，挂窄长的卷轴。
   画面是一笔远山 + 一片留白，纸本色，边缘深色绫边。 */
const aptArtTex = (() => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 720;
  const g = c.getContext('2d');
  /* 纸底：米色，带一点纵向渐变 */
  const bg = g.createLinearGradient(0, 0, 0, 720);
  bg.addColorStop(0, '#ded2b8');
  bg.addColorStop(1, '#c9bb9e');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 720);
  /* 远山：两笔淡墨，浓淡分层 */
  g.fillStyle = 'rgba(58,62,58,.30)';
  g.beginPath();
  g.moveTo(-10, 300);
  g.quadraticCurveTo(60, 214, 128, 286);
  g.quadraticCurveTo(186, 236, 266, 300);
  g.lineTo(266, 420); g.lineTo(-10, 420); g.closePath();
  g.fill();
  g.fillStyle = 'rgba(38,42,40,.44)';
  g.beginPath();
  g.moveTo(-10, 372);
  g.quadraticCurveTo(78, 306, 150, 364);
  g.quadraticCurveTo(206, 330, 266, 376);
  g.lineTo(266, 470); g.lineTo(-10, 470); g.closePath();
  g.fill();
  /* 一轮淡月 */
  g.fillStyle = 'rgba(214,196,150,.30)';
  g.beginPath(); g.arc(168, 168, 30, 0, 7); g.fill();
  /* 绫边：上下深色，两侧细边 */
  g.fillStyle = '#3d362b';
  g.fillRect(0, 0, 256, 54);
  g.fillRect(0, 666, 256, 54);
  g.fillRect(0, 0, 16, 720);
  g.fillRect(240, 0, 16, 720);
  g.fillStyle = 'rgba(255,240,210,.06)';
  g.fillRect(0, 54, 256, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const aptArt = new THREE.Mesh(
  new THREE.BoxGeometry(0.035, 1.95, 0.72),
  [
    new THREE.MeshStandardMaterial({ map: aptArtTex, roughness: 0.92, emissive: 0x1a1710, emissiveIntensity: 0.5 }),
    aptDarkMat, aptDarkMat, aptDarkMat, aptDarkMat, aptDarkMat,
  ],
);
/* 画心 1.85 m：上沿 2.83 离 3.9 的天花留 1.07 m */
aptArt.position.set(-APT.halfW + 0.06, 1.85, -1.6);
scene.add(aptArt);

/* ---------- 署名：房间里的 @karlmoriaty 标注 ---------- */
/* 不做浮在画面上的水印，做成"房间里本来就该有的东西"：
   ① 桌面右下角一块黄铜制作者铭牌（平放在桌面上，像家具的落款铜牌）
   ② 縁側台右端一块小立牌（像展厅作品旁的标签牌）
   两块都可点：①去 GitHub，②去 X。悬停时铜面变亮、光标变手型。 */
const LINK_SPOTS = [];

/* 黄铜板小工具：金属渐变 + 阴刻字（深色字 + 下方一道高光，读起来是"刻进去的"） */
function brassPlateMesh(w, h, text, sub) {
  const PX = 12;                                  // 每毫米像素，够刻字清楚
  const c = document.createElement('canvas');
  c.width = Math.round(w * PX * 1000);
  c.height = Math.round(h * PX * 1000);
  const g = c.getContext('2d');
  const W2 = c.width, H2 = c.height;
  /* 拉丝黄铜：斜向渐变 + 细横向刷痕 */
  const bg = g.createLinearGradient(0, 0, W2, H2);
  bg.addColorStop(0, '#d9b880');
  bg.addColorStop(0.3, '#b8945f');
  bg.addColorStop(0.55, '#cfa971');
  bg.addColorStop(0.8, '#a3814f');
  bg.addColorStop(1, '#c9a46c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W2, H2);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * H2;
    g.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 60},${Math.random() > 0.5 ? 240 : 50},${Math.random() > 0.5 ? 210 : 40},${(0.02 + Math.random() * 0.05).toFixed(3)})`;
    g.lineWidth = 0.5 + Math.random() * 1.4;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W2, y + (Math.random() - 0.5) * 3); g.stroke();
  }
  /* 四边倒角 */
  g.strokeStyle = 'rgba(255,240,210,.55)'; g.lineWidth = Math.max(2, H2 * 0.02);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W2 - g.lineWidth, H2 - g.lineWidth);
  g.strokeStyle = 'rgba(52,34,14,.45)';
  g.strokeRect(g.lineWidth * 1.9, g.lineWidth * 1.9, W2 - g.lineWidth * 3.8, H2 - g.lineWidth * 3.8);

  /* 主字 */
  const fs = Math.round(H2 * (sub ? 0.40 : 0.48));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${fs}px "Georgia", "Times New Roman", serif`;
  const cy = sub ? H2 * 0.42 : H2 * 0.52;
  g.fillStyle = 'rgba(255,244,220,.55)';           // 阴刻的下方反光
  g.fillText(text, W2 / 2, cy + fs * 0.055);
  g.fillStyle = 'rgba(46,30,12,.88)';              // 刻痕本体
  g.fillText(text, W2 / 2, cy);
  if (sub) {
    const fs2 = Math.round(H2 * 0.17);
    g.font = `400 ${fs2}px "Georgia", "Times New Roman", serif`;
    g.fillStyle = 'rgba(52,36,16,.62)';
    g.fillText(sub, W2 / 2, H2 * 0.74);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.34, metalness: 0.82,
    emissive: 0x2a1d10, emissiveIntensity: 0.5,
  });
  aptGlowMats.push(mat);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/* ① 桌面铜牌：平放在桌面右下角，外侧朝上。
   位置避开模型台占地（模型在 x -0.68..0.68 / z -1.76..-0.74）。
   面内要再转 180°：PlaneGeometry 的 +U 映射到世界 +X，而相机在 +X 侧，
   不转的话字是倒着的（实测截图确认）。 */
const plateTable = brassPlateMesh(0.30, 0.105, 'karlmoriaty', 'interior moodboard · 2026');
plateTable.name = 'sign-table';
plateTable.rotation.x = -Math.PI / 2;
plateTable.rotation.z = Math.PI - 0.06;
plateTable.position.set(1.02, TABLE.h + 0.004, -0.66);
scene.add(plateTable);
LINK_SPOTS.push({ mesh: plateTable, url: 'https://github.com/karlmoriaty', label: '在 GitHub 上看 karlmoriaty' });

/* ② 縁側台上的小立牌：立在台右端、朝房间内侧微侧，像展厅的作品标签。
   杆 + 斜板，板面朝相机方向。 */
{
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.010, 0.30, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.42, metalness: 0.6 }),
  );
  post.position.set(0.95, ENGAWA.h + 0.15, -3.45);
  scene.add(post);
  const plate = brassPlateMesh(0.26, 0.085, '@karlmoriaty', 'X / TWITTER');
  plate.name = 'sign-engawa';
  /* 位置是按投影实测算的：x=3.55 投影到屏幕 x=1898（画面外），
     x=2.15 落到 1512（贴着右侧时间轴面板），最终取 0.95——
     在两只坐垫之间的空当，既不挡坐垫也不压 UI。 */
  plate.position.set(0.95, ENGAWA.h + 0.335, -3.45);
  plate.rotation.y = -0.42;                        // 朝相机方向偏一点
  plate.rotation.x = -0.16;
  scene.add(plate);
  LINK_SPOTS.push({ mesh: plate, url: 'https://x.com/karlmoriaty', label: '在 X 上找 karlmoriaty' });
}

/* 二层照明由天花那三盏嵌灯负责（aptDownlights），模型台内部另有自己的灯，两层分开 */

/* 玻璃：极淡一层，主要作用是让城市"隔着一层"而不是直接贴在墙上 */
const winGlass = new THREE.Mesh(
  new THREE.PlaneGeometry(winW, winH),
  new THREE.MeshBasicMaterial({ color: 0x8fb4d8, transparent: true, opacity: 0.05, depthWrite: false, fog: false }),
);
winGlass.position.set(0, winMidY, INTERIOR.winZ + 0.05);
scene.add(winGlass);

/* 窗外正对的主景：设计师指定的实拍城市夜景。
   三层圆柱（cityFar/Mid/Near）仍是程序化生成的，负责转视角时的视差；
   这一层照片负责「一眼看到的那座城」。 */

/* ---------- 白昼城市：从零绘制 ---------- */
/* 之前两版都试图"把夜景照片加工成白天"：先提亮去饱和，再按天际线重绘。
   两条路都失败，因为夜间照片的结构就是"黑楼里嵌着亮窗"——把它当亮度依据
   重绘，出来的必然是白墙配黑斑。照片里没有白天的信息，再怎么算也造不出来。
   所以改成从零画一座城：天空、太阳、云、五层由远及近的楼群，
   每层按空气透视向天色混合，楼体上有层线与竖梃——干净的几何，没有噪点。 */
/* ---------- 白昼版：对原图做色调映射，不改结构 ---------- */
/* 设计师的要求很明确：就用那张照片，改色调。之前失败不是因为"不该改色"，
   而是改得粗暴：先把 saturate 压到 0.30 变灰，再用 brightness(2.35) 顶曝光，
   亮窗直接爆成白块、暗部被拉成死灰。
   现在改成逐像素的正规曲线：
     ① 抬暗部 / 压高光（幂次曲线 + 高光滚降），亮窗变成柔和光斑而不是白块；
     ② 补回饱和度（曲线压缩会掉色）；
     ③ 暗部偏冷、高光中性，模拟白天的天光；
     ④ 少量空气雾统一色温。
   结构（楼群轮廓、窗格）完全来自原图，不会有"一块块长方形"。 */
function gradeDayFromPhoto(img, g, W, H) {
  g.clearRect(0, 0, W, H);

  /* 轻微软化：窗灯点阵在密集区太碎，blur 1.3px 并成肌理又不糊轮廓。 */
  const base = document.createElement("canvas");
  base.width = W; base.height = H;
  const bg2 = base.getContext("2d");
  bg2.filter = "blur(1.3px)";
  bg2.drawImage(img, 0, 0, W, H);
  bg2.filter = "none";
  g.drawImage(base, 0, 0);

  const id = g.getImageData(0, 0, W, H);
  const d = id.data;

  /* ---------- 色调：做成清晨 ---------- */
  /* 这张素材的本质是"入夜后的城市"，几千扇窗都亮着。
     硬做正午的结果必然是两种：要么白成一片，要么满城灯火还在。
     所以走"清晨蓝调"——天光刚起、灯还没灭的那一段，
     既有明亮的天，也保得住这座城市真实的颜色和结构。 */
  const LIFT = 0.175;
  const GAMMA = 0.46;
  const GAIN = 0.86;
  const SAT = 0.86;
  const HAZE = 0.035;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;

    /* ① 影调：抬暗部，高光滚降。滚降保住灯的形状，不糊成白块。 */
    let y = LIFT + GAIN * Math.pow(l, GAMMA);
    if (y > 0.74) y = 0.74 + (y - 0.74) * 0.48;
    const k = l > 1e-4 ? y / l : 0;
    r *= k; gg *= k; b *= k;

    /* ② 饱和度：这张照片的颜色是资产，不要压掉 */
    const l2 = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    r = l2 + (r - l2) * SAT;
    gg = l2 + (gg - l2) * SAT;
    b = l2 + (b - l2) * SAT;

    /* ③ S 曲线：找回中间调对比 */
    const l3 = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const sc = Math.min(1, Math.max(0, (l3 - 0.5) * 1.24 + 0.5)) - l3;
    r += sc; gg += sc; b += sc;

    /* ④ 分离色调：亮部偏冷（天光）、暗部偏靛 */
    const l4 = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const hi = Math.min(1, Math.max(0, (l4 - 0.44) / 0.48));
    const lo = Math.min(1, Math.max(0, (0.44 - l4) / 0.44));
    r += hi * -0.014 + lo * -0.020;
    gg += hi * 0.012 + lo * -0.002;
    b += hi * 0.048 + lo * 0.040;

    /* ⑤ 极淡大气雾 */
    r += (0.78 - r) * HAZE;
    gg += (0.85 - gg) * HAZE;
    b += (0.93 - b) * HAZE;

    d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255;
  }
  g.putImageData(id, 0, 0);

  /* ---------- 天空：深蓝 → 地平线暖光 ---------- */
  /* "清晨"这件事必须由天空说清楚。只把整体提亮是做不出早晨的，
     必须有"天顶深、地平线亮且偏暖"这个方向性，眼睛才认。 */
  const sky = g.createLinearGradient(0, 0, 0, H * 0.66);
  sky.addColorStop(0, "rgba(96,140,196,0.58)");
  sky.addColorStop(0.24, "rgba(132,170,212,0.48)");
  sky.addColorStop(0.52, "rgba(176,203,226,0.32)");
  sky.addColorStop(0.78, "rgba(214,220,224,0.22)");
  sky.addColorStop(1, "rgba(216,224,228,0)");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H * 0.66);

  /* 地平线一条暖光带：太阳还没出来，但天边已经亮了 */
  const horizonGlow = g.createLinearGradient(0, H * 0.26, 0, H * 0.52);
  horizonGlow.addColorStop(0, "rgba(240,238,230,0)");
  horizonGlow.addColorStop(0.55, "rgba(240,238,230,0.14)");
  horizonGlow.addColorStop(1, "rgba(240,238,230,0)");
  g.fillStyle = horizonGlow;
  g.fillRect(0, H * 0.26, W, H * 0.26);
}

const viewTex = (() => {
  const PHOTO_W = 1080, PHOTO_H = 470;
  const mkTex = () => {
    const c = document.createElement('canvas');
    c.width = PHOTO_W; c.height = PHOTO_H;
    const g = c.getContext('2d');
    g.fillStyle = '#080d16';                 // 图片解码前的兜底色
    g.fillRect(0, 0, PHOTO_W, PHOTO_H);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    /* 相机 (2.80,2.46,3.13) 透过 z=-4.9 的窗，打到 z=-6.4 的照片平面上，
       实际可见的 UV 约 u∈[0.235,0.710]、v∈[0.267,0.676]。
       照片 1080×470 (2.30:1)，可见窗口 9.03×3.48 m (2.60:1)。
       四组 UV 实拍对比后取 rx=1.80 / ox=-0.190×1.80 / ry=2.163 / oy=-0.520：
       这一组能同时把左侧楼群、中间弯曲条纹塔和右侧白色亮楼收进窗里，
       比例不拉伸、无空白边。严格按可见区全宽映射会把右地标切在画面外。 */
    t.repeat.set(1.80, 0.885 / 0.409);
    t.offset.set(-0.190 * 1.80, 0.0575 - 0.267 * (0.885 / 0.409));
    return { tex: t, canvas: c, ctx: g };
  };
  const night = mkTex(), dusk = mkTex(), day = mkTex();

  /* data URI 解码是异步的：先挂空纹理保证初始化与 setHour 的同步流程不中断，
     图片就绪后画进画布、标 needsUpdate，再标脏重绘。 */
  const hooks = [];
  const img = new Image();
  img.onload = () => {
    night.ctx.drawImage(img, 0, 0, PHOTO_W, PHOTO_H);
    night.tex.needsUpdate = true;

    /* ---------- 黄昏版（warm 预设 18.6 用） ---------- */
    /* 原图是深夜。直接把夜景提亮会变成"脏灰"，所以先加饱和、再按层染色：
       天空压成深靛 → 地平线推成橙金，城市本体蒙一层暖雾。
       这样窗里是"太阳刚落、灯刚亮"的那十分钟，而不是一张提亮的夜景。 */
    {
      const g = dusk.ctx;
      g.filter = 'brightness(1.12) saturate(1.50) contrast(1.06)';
      g.drawImage(img, 0, 0, PHOTO_W, PHOTO_H);
      g.filter = 'none';
      /* 天空：紫靛 → 玫红 → 橙金 */
      const sky = g.createLinearGradient(0, 0, 0, PHOTO_H * 0.60);
      sky.addColorStop(0, 'rgba(42,44,104,.66)');
      sky.addColorStop(0.42, 'rgba(138,74,104,.40)');
      sky.addColorStop(0.78, 'rgba(226,120,74,.30)');
      sky.addColorStop(1, 'rgba(255,160,86,.12)');
      g.fillStyle = sky;
      g.fillRect(0, 0, PHOTO_W, PHOTO_H * 0.60);
      /* 地平线一道余晖，把楼顶勾亮 */
      const glow = g.createLinearGradient(0, PHOTO_H * 0.34, 0, PHOTO_H * 0.74);
      glow.addColorStop(0, 'rgba(255,178,104,0)');
      glow.addColorStop(0.5, 'rgba(255,190,120,.26)');
      glow.addColorStop(1, 'rgba(255,138,70,0)');
      g.fillStyle = glow;
      g.fillRect(0, PHOTO_H * 0.34, PHOTO_W, PHOTO_H * 0.40);
      /* 下层城市压一点暖褐，别让霓虹蓝把整幅拽回冷调 */
      const warmFloor = g.createLinearGradient(0, PHOTO_H * 0.55, 0, PHOTO_H);
      warmFloor.addColorStop(0, 'rgba(120,70,48,0)');
      warmFloor.addColorStop(1, 'rgba(96,54,38,.30)');
      g.fillStyle = warmFloor;
      g.fillRect(0, PHOTO_H * 0.55, PHOTO_W, PHOTO_H * 0.45);
      dusk.tex.needsUpdate = true;
    }

    /* ---------- 白昼版（clear 预设 12.4 用）：从零绘制 ---------- */
    /* 不再从夜景派生。照片里没有白天的信息，加工出来必然是白墙配黑斑。 */
    gradeDayFromPhoto(img, day.ctx, PHOTO_W, PHOTO_H);
    day.tex.needsUpdate = true;

    /* 地面倒影也依赖这张图：图片就绪后通知外面重画 */
    for (const h of hooks) h(img);
    markDirty();
  };
  img.src = CITY_PHOTO_URL;

  return { night: night.tex, dusk: dusk.tex, day: day.tex, hooks };
})();
/* 城市平面必须在后墙之外：后墙推到 -4.9 后，原来 -4.6 会落到房间内侧穿帮。
   窗也放宽到 7.6 m，平面 14→19 才不会在两侧露边。 */
const cityView = new THREE.Mesh(
  new THREE.PlaneGeometry(19, 8.5),
  new THREE.MeshBasicMaterial({ map: viewTex.night, fog: false, toneMapped: false }),
);
cityView.position.set(0, 1.9, INTERIOR.winZ - 1.5);
cityView.userData.cityTex = viewTex;
scene.add(cityView);

/* 交叉淡入用的第二层：三档贴图硬切会在切换时刻闪一下（拖时间轴尤其明显）。
   同一平面位置再叠一层，按权重分配 opacity，两档之间就有过渡。 */
const cityOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(19, 8.5),
  new THREE.MeshBasicMaterial({
    map: viewTex.night, fog: false, toneMapped: false,
    transparent: true, opacity: 0, depthWrite: false,
  }),
);
cityOverlay.position.set(0, 1.9, INTERIOR.winZ - 1.49);
cityOverlay.userData.cityTex = viewTex;
cityOverlay.renderOrder = 1;
scene.add(cityOverlay);

/* ---------- 地面倒影：抛光地板最重要的证据 ---------- */
/* 参考图里地板是"能把窗和霓虹拖成一道长反光"的。three 的 StandardMaterial
   没有实时反射，这里用一张镜像 + 垂直压扁 + 模糊的贴图，加色叠在地面上：
   它不是物理正确的反射，但读起来就是"打过蜡的木地板映着窗"。 */
const reflCanvas = document.createElement('canvas');
reflCanvas.width = 512; reflCanvas.height = 512;
const reflTex = new THREE.CanvasTexture(reflCanvas);
reflTex.colorSpace = THREE.SRGBColorSpace;
const reflMat = new THREE.MeshBasicMaterial({
  map: reflTex, transparent: true, opacity: 0, depthWrite: false,
  blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
});
/* 倒影只铺贴近窗的一条带（2.6 m 深），不铺到房间中央：
   铺太深时，城市里某颗特别亮的窗会被模糊成一颗"悬浮光球"落在桌边（实测过）。 */
const floorRefl = new THREE.Mesh(new THREE.PlaneGeometry(winW + 1.0, 2.6), reflMat);
floorRefl.rotation.x = -Math.PI / 2;
floorRefl.position.set(0, 0.014, INTERIOR.winZ + 1.55);
floorRefl.renderOrder = -1;
scene.add(floorRefl);

/* 图片就绪后把城市镜像画进倒影画布 */
viewTex.hooks.push((img) => {
  const g = reflCanvas.getContext('2d');
  g.clearRect(0, 0, 512, 512);

  /* 先把城市翻转到临时画布 */
  const tmp = document.createElement('canvas');
  tmp.width = 512; tmp.height = 512;
  const tg = tmp.getContext('2d');
  tg.save();
  tg.translate(0, 512);
  tg.scale(1, -1);
  tg.filter = 'blur(2px) brightness(0.85)';
  tg.drawImage(img, 0, 0, 512, 512 * 2.6);
  tg.restore();

  /* 纵向运动模糊：把同一张图沿 y 反复叠加 26 次。
     地板反光是"沿视线拖长的竖条"，各向同性高斯只会把亮窗糊成一颗圆球，
     那颗圆球落在桌边就是画面里突兀的"悬浮光球"。叠加后峰值被摊平约 20 倍。 */
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.055;
    g.drawImage(tmp, 0, i * 7);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  /* 顶部（靠近窗）亮、往下迅速衰减：地板反光是一条渐变带，不是一整块 */
  const fade = g.createLinearGradient(0, 0, 0, 512);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.42, 'rgba(0,0,0,.42)');
  fade.addColorStop(0.78, 'rgba(0,0,0,.08)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, 512, 512);
  /* 左右再收一道：掠射角处反光本就更弱 */
  const side = g.createLinearGradient(0, 0, 512, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.16, 'rgba(0,0,0,.55)');
  side.addColorStop(0.38, 'rgba(0,0,0,1)');
  side.addColorStop(0.62, 'rgba(0,0,0,1)');
  side.addColorStop(0.84, 'rgba(0,0,0,.55)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'source-over';
  reflTex.needsUpdate = true;
  markDirty();
});

/* 窗外的一层城市反光：让玻璃后面"有光"，而不是一块黑板 */
const cityGlowTex = (() => {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(120,140,190,0)');
  grd.addColorStop(0.45, 'rgba(120,132,170,.10)');
  grd.addColorStop(0.82, 'rgba(210,160,120,.20)');
  grd.addColorStop(1, 'rgba(255,190,140,.28)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const cityGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(winW + 1.0, winH + 0.4),
  new THREE.MeshBasicMaterial({ map: cityGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
);
cityGlow.position.set(0, winMidY, INTERIOR.winZ - 0.5);
scene.add(cityGlow);

/* 室内补光：公寓尺度下不需要一盏大功率点光把整间照亮，
   窗那边一层冷补光，加两道很轻的轮廓光就够。 */
const windowFill = new THREE.DirectionalLight(0x9db8dc, 0.32);
windowFill.position.set(-1.6, 2.4, INTERIOR.winZ + 0.4);
windowFill.target.position.set(0, 0.7, 0);
scene.add(windowFill);
scene.add(windowFill.target);

/* 轮廓光：从后上方擦过桌子与模型边缘，把主体从暗背景里"剥"出来 */
const rimCool = new THREE.DirectionalLight(0x9fb8e0, 0.55);
rimCool.position.set(-2.4, 2.6, -2.2);
scene.add(rimCool);
const rimWarm = new THREE.DirectionalLight(0xffbb88, 0.32);
rimWarm.position.set(2.6, 1.4, -1.8);
scene.add(rimWarm);

/* 黄昏灌进来的那一道暖光：warm 预设的室内之所以"没效果"，
   是因为屋里只有冷白的天光和冷补光，窗外的暖调照不进屋。
   这盏灯从窗口方向斜射进来，只在天光偏暖时点亮（见 setHour）。 */
const duskSpill = new THREE.DirectionalLight(0xff9c5a, 0);
duskSpill.position.set(1.2, 2.2, INTERIOR.winZ + 0.6);
duskSpill.target.position.set(-0.4, 0.6, 1.2);
scene.add(duskSpill);
scene.add(duskSpill.target);

/* 近处两团虚焦的光，转视角时会有位移 */
function bokehSprite(size) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,238,208,.95)');
  grd.addColorStop(0.45, 'rgba(255,214,160,.42)');
  grd.addColorStop(1, 'rgba(255,198,140,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
  );
  return m;
}
/* 光斑跟着新后墙与层高走，别留在房间内侧 */
const bokehA = bokehSprite(6.4);
bokehA.position.set(-4.6, 3.0, INTERIOR.winZ - 0.6);
const bokehB = bokehSprite(3.6);
bokehB.position.set(3.8, 3.8, INTERIOR.winZ - 0.9);
const bokehC = bokehSprite(2.4);
bokehC.position.set(6.2, 2.2, INTERIOR.winZ - 0.4);
for (const b of [bokehA, bokehB, bokehC]) { b.material.opacity = 0.42; b.renderOrder = -1; scene.add(b); }

/* ============================== 4. 房间 ============================== */
const room = new THREE.Group();
MODEL.add(room);

const W = 8, D = 6, H = 3, T = 0.14;
const X0 = -W / 2, X1 = W / 2, Z0 = -D / 2, Z1 = D / 2;

/* 每个面一个共享材质：换材料时全部构件一起变 */
const surfaceMat = {};
for (const k of SURFACE_KEYS) {
  surfaceMat[k] = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
}

function box(w, h, d, x, y, z, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  if (opts.surface) m.userData.surface = opts.surface;
  (opts.parent || room).add(m);
  return m;
}

/* 外皮：墙的外侧、顶边、地板侧面都是它。
   一间屋子如果外面也是白的，看上去就是块纸板；有一层深色外壳，
   内外一分，模型感立刻出来。 */
const shellMat = new THREE.MeshStandardMaterial({ color: 0x232c35, roughness: 0.88, metalness: 0.06 });

function shell(inner) {
  /* 六面材质顺序：+x -x +y -y +z -z */
  const m = [shellMat, shellMat, shellMat, shellMat, shellMat, shellMat];
  for (const [i, key] of Object.entries(inner)) m[Number(i)] = surfaceMat[key];
  return m;
}

/* 地面 */
box(W, T, D, 0, -T / 2, 0, shell({ 2: 'floor' }), { cast: false, surface: 'floor' });

/* 模型直接摆在桌面上，不再自带基座 */

/* 后墙：留一个 2.6 × 1.5 的窗（内侧朝 +z，只有这一面用墙纸） */
const WIN = { x0: -1.3, x1: 1.3, y0: 0.95, y1: 2.45 };
const backFaces = shell({ 4: 'wallBack' });
box(WIN.x0 - X0, H, T, (X0 + WIN.x0) / 2, H / 2, Z0 - T / 2, backFaces, { surface: 'wallBack' });
box(X1 - WIN.x1, H, T, (WIN.x1 + X1) / 2, H / 2, Z0 - T / 2, backFaces, { surface: 'wallBack' });
box(WIN.x1 - WIN.x0, WIN.y0, T, 0, WIN.y0 / 2, Z0 - T / 2, backFaces, { surface: 'wallBack' });
box(WIN.x1 - WIN.x0, H - WIN.y1, T, 0, (H + WIN.y1) / 2, Z0 - T / 2, backFaces, { surface: 'wallBack' });

/* 左墙（内侧朝 +x） */
box(T, H, D, X0 - T / 2, H / 2, 0, shell({ 0: 'wallSide' }), { surface: 'wallSide' });

/* 踢脚与压顶：一条深色细边，剖切更清楚 */
const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.72 });
box(W, 0.07, 0.02, 0, 0.035, Z0 + 0.011, trimMat, { cast: false });
box(0.02, 0.07, D, X0 + 0.011, 0.035, 0, trimMat, { cast: false });
box(W, 0.03, T + 0.01, 0, H - 0.015, Z0 - T / 2, trimMat, { cast: false });
box(T + 0.01, 0.03, D, X0 - T / 2, H - 0.015, 0, trimMat, { cast: false });

/* 窗框 */
const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.62 });
const fw = 0.055;
box(WIN.x1 - WIN.x0 + fw * 2, fw, 0.1, 0, WIN.y0, Z0 + 0.03, frameMat);
box(WIN.x1 - WIN.x0 + fw * 2, fw, 0.1, 0, WIN.y1, Z0 + 0.03, frameMat);
box(fw, WIN.y1 - WIN.y0, 0.1, WIN.x0, (WIN.y0 + WIN.y1) / 2, Z0 + 0.03, frameMat);
box(fw, WIN.y1 - WIN.y0, 0.1, WIN.x1, (WIN.y0 + WIN.y1) / 2, Z0 + 0.03, frameMat);
box(0.035, WIN.y1 - WIN.y0, 0.09, 0, (WIN.y0 + WIN.y1) / 2, Z0 + 0.03, frameMat);
box(WIN.x1 - WIN.x0, 0.035, 0.09, 0, 1.72, Z0 + 0.03, frameMat);

/* 窗玻璃（很淡的一层） */
const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0),
  new THREE.MeshPhysicalMaterial({
    color: 0xdfeef7, transparent: true, opacity: 0.14, roughness: 0.06,
    metalness: 0, side: THREE.DoubleSide, envMapIntensity: 1.4,
  }),
);
glass.position.set(0, (WIN.y0 + WIN.y1) / 2, Z0 + 0.02);
room.add(glass);

/* 一层模型台的小窗：望出去是二层公寓房间的漫射光，不是三层城市。
   城市只在落地窗外出现一次，三层才不会互相串。做成磨砂玻璃 + 几道竖向光带，
   昼夜各一版；只换贴图，不动一层任何家具 / 材质 / 交互。 */
const skyCard = new THREE.Mesh(
  new THREE.PlaneGeometry(2.9, 1.68),
  new THREE.MeshBasicMaterial({ map: null, toneMapped: false }),
);
skyCard.position.set(0, 1.7, Z0 - 0.24);
room.add(skyCard);

function alcoveTex(night) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 320);
  if (night) {
    grd.addColorStop(0, '#241d18');
    grd.addColorStop(0.52, '#3b2d23');
    grd.addColorStop(1, '#57422f');
  } else {
    grd.addColorStop(0, '#8b8276');
    grd.addColorStop(0.52, '#b5a793');
    grd.addColorStop(1, '#d8c6a8');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 320);
  for (let i = 0; i < 5; i++) {
    const x = 40 + i * 110;
    const lg = g.createLinearGradient(x - 34, 0, x + 34, 0);
    lg.addColorStop(0, 'rgba(255,214,170,0)');
    lg.addColorStop(0.5, night ? 'rgba(255,198,146,.24)' : 'rgba(255,246,224,.30)');
    lg.addColorStop(1, 'rgba(255,214,170,0)');
    g.fillStyle = lg;
    g.fillRect(x - 34, 0, 68, 320);
  }
  const b = document.createElement('canvas');
  b.width = 512; b.height = 320;
  const bg = b.getContext('2d');
  bg.filter = 'blur(13px)';
  bg.drawImage(c, 0, 0);
  bg.filter = 'none';
  const t = new THREE.CanvasTexture(b);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}
const roomViewTex = { night: alcoveTex(true), day: alcoveTex(false) };
skyCard.material.map = roomViewTex.night;
skyCard.material.needsUpdate = true;

/* 窗两侧的亚麻帘：只到窗高，垂一点，不抢主体 */
const curtainMat = new THREE.MeshStandardMaterial({
  color: 0xcfc4b0, roughness: 0.96, transparent: true, opacity: 0.86,
  side: THREE.DoubleSide,
});
for (const sx of [-1, 1]) {
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 1.82, 10, 1), curtainMat);
  const pos = curtain.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    pos.setZ(i, Math.sin(px * 19) * 0.035);
  }
  curtain.geometry.computeVertexNormals();
  curtain.position.set(sx * (WIN.x1 + 0.24), (WIN.y0 + WIN.y1) / 2 - 0.04, Z0 + 0.10);
  curtain.castShadow = true;
  room.add(curtain);
}
const curtainRod = new THREE.Mesh(
  new THREE.CylinderGeometry(0.012, 0.012, 3.35, 10),
  new THREE.MeshStandardMaterial({ color: 0x3a332a, roughness: 0.45, metalness: 0.5 }),
);
curtainRod.rotation.z = Math.PI / 2;
curtainRod.position.set(0, WIN.y1 + 0.10, Z0 + 0.12);
room.add(curtainRod);

/* 后墙顶部一道洗墙灯带：夜里让墙有层次，不再是平涂 */
const cove = new THREE.Mesh(
  new THREE.BoxGeometry(7.7, 0.022, 0.05),
  new THREE.MeshBasicMaterial({ color: 0xffc38a, toneMapped: false }),
);
cove.position.set(0, H - 0.07, Z0 + 0.075);
room.add(cove);
/* 灯在模型组里：距离是世界单位，必须乘上缩放，否则一盏 6.5 m 的灯会照亮整个公寓 */
const coveLight = new THREE.PointLight(0xffc08a, 2.4, 6.5 * MODEL_SCALE, 2);
coveLight.position.set(0.4, H - 0.28, Z0 + 0.42);
room.add(coveLight);

/* 后墙被灯照亮的一小片：假光，但比再开一个点光源便宜也柔和 */
const wallGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(3.6, 2.5),
  new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }),
);
wallGlow.position.set(2.35, 1.35, Z0 + 0.09);
room.add(wallGlow);

/* 落地灯在地板上留下的一摊光：光源有了落点，屋子才不只是"亮着" */
const floorPool = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 3.0),
  new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false, fog: false }),
);
floorPool.rotation.x = -Math.PI / 2;
floorPool.position.set(2.75, 0.022, -2.05);
room.add(floorPool);

/* 窗格光：城市的光从落地窗斜着落进屋，地板上一片带竖梃影子的冷光。
   这是"窗外有光"在室内唯一的证据，也和落地灯的暖光池形成冷暖对照。 */
const windowCastTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const light = g.createLinearGradient(0, 0, 0, 512);
  light.addColorStop(0, 'rgba(150,186,240,.26)');
  light.addColorStop(0.55, 'rgba(132,170,228,.11)');
  light.addColorStop(1, 'rgba(120,155,215,0)');
  g.fillStyle = light;
  g.beginPath();
  g.moveTo(178, 0); g.lineTo(334, 0); g.lineTo(470, 512); g.lineTo(42, 512);
  g.closePath(); g.fill();
  /* 竖梃与横梃挡出来的暗缝 */
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,.85)';
  for (const u of [0.30, 0.50, 0.70]) {
    g.beginPath();
    g.moveTo(178 + 156 * u, 0);
    g.lineTo(187 + 156 * u, 0);
    g.lineTo(42 + 428 * u, 512);
    g.lineTo(29 + 428 * u, 512);
    g.closePath(); g.fill();
  }
  g.fillRect(0, 238, 512, 9);
  g.globalCompositeOperation = 'source-over';
  /* 羽化：梯形的两条斜边如果留着硬边，看上去就是一块贴片而不是光 */
  const soft = document.createElement('canvas');
  soft.width = soft.height = 512;
  const sg = soft.getContext('2d');
  sg.filter = 'blur(12px)';
  sg.drawImage(c, 0, 0);
  g.clearRect(0, 0, 512, 512);
  g.drawImage(soft, 0, 0);
  const fade = g.createRadialGradient(256, 230, 40, 256, 256, 330);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.72, 'rgba(0,0,0,.82)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const windowCast = new THREE.Mesh(
  new THREE.PlaneGeometry(4.4, 5.2),
  new THREE.MeshBasicMaterial({ map: windowCastTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false, fog: false }),
);
windowCast.rotation.x = -Math.PI / 2;
windowCast.position.set(0, 0.019, -0.55);
room.add(windowCast);

/* 桌面上的接触阴影已经由真实地面接管，这里不再另加一层 */

/* 左墙上一幅画：换成设计师给的月夜图（内联，保持单文件可双击打开） */
const MOON_ART_URL = 'data:image/jpeg;base64,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';
{
  /* 图片是竖幅 484x1036（比例 0.467），原画框是横的 1.06x0.76。
     改成竖幅框 0.52x1.11（比例 0.468），整张图不裁切、不拉伸。 */
  const poster = document.createElement("canvas");
  poster.width = 484; poster.height = 1036;
  const pg = poster.getContext("2d");
  pg.fillStyle = "#0d151c"; pg.fillRect(0, 0, 484, 1036);
  const posterTex = new THREE.CanvasTexture(poster);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  const moonImg = new Image();
  moonImg.onload = () => {
    pg.drawImage(moonImg, 0, 0, 484, 1036);
    posterTex.needsUpdate = true;
  };
  moonImg.src = MOON_ART_URL;
  const artFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.52, 0.71), frameMat);
  artFrame.position.set(X0 + 0.045, 1.86, 1.35);
  artFrame.castShadow = true;
  room.add(artFrame);
  const artCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 1.42),
    new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.92, emissive: 0x3a4a58, emissiveIntensity: 0.22 }),
  );
  artCanvas.rotation.y = Math.PI / 2;
  artCanvas.position.set(X0 + 0.073, 1.86, 1.35);
  room.add(artCanvas);

}

/* ============================== 5. 家具 ============================== */
const PIECES = new THREE.Group();
MODEL.add(PIECES);

const legMat = new THREE.MeshStandardMaterial({ color: 0x2f2720, roughness: 0.55, metalness: 0.15 });
const leavesMat = new THREE.MeshStandardMaterial({ color: 0x4e6b45, roughness: 0.85 });
const shadeMat = new THREE.MeshStandardMaterial({
  color: 0xf6ecd9, roughness: 0.9, emissive: 0xffb066, emissiveIntensity: 0,
  side: THREE.DoubleSide,
});
const pendantMat = new THREE.MeshStandardMaterial({
  color: 0x6d5142, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide,
});

const accentMat = new THREE.MeshStandardMaterial({ color: 0x9a5f43, roughness: 0.86 });
const throwMat = new THREE.MeshStandardMaterial({ color: 0x69735f, roughness: 0.96 });
const paperMat = new THREE.MeshStandardMaterial({ color: 0xe9e1d1, roughness: 0.94 });
const bookRust = new THREE.MeshStandardMaterial({ color: 0x8b4d3a, roughness: 0.78 });
const bookInk = new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: 0.78 });
const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xc7b8a3, roughness: 0.48, metalness: 0.02 });

function pieceGroup(name, w, d, h) {
  const g = new THREE.Group();
  g.userData.piece = { name, w, d, h, type: name };
  return g;
}
function addBox(parent, w, h, d, x, y, z, mat, surface) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (surface) m.userData.surface = surface;
  parent.add(m);
  return m;
}
function addCyl(parent, rt, rb, h, x, y, z, mat, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function makeSofa() {
  const g = pieceGroup('sofa', 2.35, 0.95, 0.86);
  const mat = surfaceMat.sofa;
  const w = 2.35, d = 0.95;
  /* 底座压低、坐垫与靠背分开，别再把沙发画成一块白砖 */
  addBox(g, w, 0.18, d, 0, 0.22, 0, mat, 'sofa');
  addBox(g, w, 0.52, 0.18, 0, 0.60, -d / 2 + 0.09, mat, 'sofa');
  addBox(g, 0.16, 0.46, d, -w / 2 + 0.08, 0.53, 0, mat, 'sofa');
  addBox(g, 0.16, 0.46, d, w / 2 - 0.08, 0.53, 0, mat, 'sofa');
  for (const sx of [-1, 1]) {
    addBox(g, (w - 0.36) / 2 - 0.025, 0.16, d - 0.22, sx * 0.49, 0.43, 0.03, mat, 'sofa');
    const back = addBox(g, 0.78, 0.34, 0.13, sx * 0.52, 0.71, -d / 2 + 0.22, mat, 'sofa');
    back.rotation.x = -0.10;
  }
  /* 一只赭色靠枕，一点对比就够 */
  const pillow = addBox(g, 0.34, 0.30, 0.13, -0.66, 0.67, -0.22, accentMat);
  pillow.rotation.z = 0.14;
  /* 左扶手上搭一条薄毯 */
  addBox(g, 0.40, 0.035, 0.56, -w / 2 + 0.08, 0.775, 0.12, throwMat);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addCyl(g, 0.024, 0.02, 0.13, sx * (w / 2 - 0.12), 0.075, sz * (d / 2 - 0.12), legMat, 10);
  return g;
}

function makeArmchair() {
  const g = pieceGroup('armchair', 0.92, 0.88, 0.82);
  const mat = surfaceMat.sofa;
  const w = 0.92, d = 0.88;
  addBox(g, w, 0.24, d, 0, 0.26, 0, mat, 'sofa');
  addBox(g, w, 0.52, 0.15, 0, 0.64, -d / 2 + 0.075, mat, 'sofa');
  addBox(g, 0.13, 0.36, d, -w / 2 + 0.065, 0.56, 0, mat, 'sofa');
  addBox(g, 0.13, 0.36, d, w / 2 - 0.065, 0.56, 0, mat, 'sofa');
  addBox(g, w - 0.26, 0.13, d - 0.2, 0, 0.44, 0.03, mat, 'sofa');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addCyl(g, 0.024, 0.02, 0.14, sx * (w / 2 - 0.1), 0.07, sz * (d / 2 - 0.1), legMat, 10);
  return g;
}

function makeCoffeeTable() {
  const g = pieceGroup('coffeeTable', 1.32, 0.74, 0.4);
  const mat = surfaceMat.woodwork;
  addBox(g, 1.32, 0.055, 0.74, 0, 0.38, 0, mat, 'woodwork');
  addBox(g, 1.2, 0.04, 0.62, 0, 0.16, 0, mat, 'woodwork');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.05, 0.36, 0.05, sx * 0.6, 0.18, sz * 0.31, legMat);
  /* 桌面两本书 + 一只浅陶碗，尺度就出来了 */
  addBox(g, 0.26, 0.026, 0.19, -0.30, 0.425, 0.10, bookInk);
  addBox(g, 0.24, 0.022, 0.17, -0.28, 0.449, 0.09, bookRust);
  addBox(g, 0.22, 0.004, 0.15, -0.28, 0.462, 0.09, paperMat);
  const bowl = addCyl(g, 0.115, 0.075, 0.055, 0.30, 0.438, -0.08, ceramicMat, 24);
  bowl.scale.y = 0.8;
  return g;
}

function makeSideTable() {
  const g = pieceGroup('sideTable', 0.44, 0.44, 0.5);
  const mat = surfaceMat.woodwork;
  addCyl(g, 0.22, 0.22, 0.035, 0, 0.48, 0, mat, 24);
  addCyl(g, 0.035, 0.045, 0.47, 0, 0.24, 0, legMat, 10);
  addCyl(g, 0.17, 0.19, 0.02, 0, 0.01, 0, legMat, 20);
  return g;
}

function makeDiningTable() {
  const g = pieceGroup('diningTable', 1.7, 0.88, 0.75);
  const mat = surfaceMat.woodwork;
  addBox(g, 1.7, 0.06, 0.88, 0, 0.72, 0, mat, 'woodwork');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.06, 0.7, 0.06, sx * 0.74, 0.35, sz * 0.36, legMat);
  addBox(g, 1.5, 0.05, 0.05, 0, 0.6, 0, legMat);
  return g;
}

function makeChair() {
  const g = pieceGroup('chair', 0.46, 0.48, 0.86);
  const mat = surfaceMat.woodwork;
  addBox(g, 0.44, 0.045, 0.44, 0, 0.44, 0, mat, 'woodwork');
  addBox(g, 0.42, 0.42, 0.04, 0, 0.66, -0.2, mat, 'woodwork');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.035, 0.44, 0.035, sx * 0.18, 0.22, sz * 0.18, legMat);
  return g;
}

function makeShelf() {
  const g = pieceGroup('shelf', 0.94, 0.34, 1.86);
  const mat = surfaceMat.woodwork;
  addBox(g, 0.04, 1.86, 0.34, -0.45, 0.93, 0, mat, 'woodwork');
  addBox(g, 0.04, 1.86, 0.34, 0.45, 0.93, 0, mat, 'woodwork');
  for (let i = 0; i < 5; i++) addBox(g, 0.86, 0.03, 0.32, 0, 0.16 + i * 0.4, 0, mat, 'woodwork');
  addBox(g, 0.9, 0.02, 0.32, 0, 1.86, 0, mat, 'woodwork');
  addBox(g, 0.86, 1.7, 0.02, 0, 0.95, -0.15, mat, 'woodwork');
  /* 几本书，别整面空板 */
  const bookMats = [bookInk, bookRust, paperMat];
  for (let shelf = 0; shelf < 3; shelf++) {
    let bx = -0.32;
    for (let i = 0; i < 4; i++) {
      const bh = 0.20 + ((i + shelf) % 3) * 0.035;
      addBox(g, 0.045, bh, 0.20, bx, 0.18 + shelf * 0.4 + bh / 2, 0.015, bookMats[(i + shelf) % 3]);
      bx += 0.055;
    }
  }
  addBox(g, 0.22, 0.16, 0.20, 0.22, 1.27, 0.01, ceramicMat);
  return g;
}

function makeSideboard() {
  const g = pieceGroup('sideboard', 1.4, 0.42, 0.74);
  const mat = surfaceMat.woodwork;
  addBox(g, 1.4, 0.5, 0.42, 0, 0.45, 0, mat, 'woodwork');
  addBox(g, 1.44, 0.03, 0.44, 0, 0.71, 0, mat, 'woodwork');
  addBox(g, 0.68, 0.44, 0.015, -0.35, 0.45, 0.212, mat, 'woodwork');
  addBox(g, 0.68, 0.44, 0.015, 0.35, 0.45, 0.212, mat, 'woodwork');
  addCyl(g, 0.012, 0.012, 0.1, -0.06, 0.45, 0.225, legMat, 8);
  addCyl(g, 0.012, 0.012, 0.1, 0.06, 0.45, 0.225, legMat, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addCyl(g, 0.018, 0.014, 0.2, sx * 0.64, 0.1, sz * 0.16, legMat, 8);
  return g;
}

function makeRoundTable() {
  const g = pieceGroup('roundTable', 0.62, 0.62, 0.52);
  const mat = surfaceMat.woodwork;
  addCyl(g, 0.31, 0.31, 0.04, 0, 0.5, 0, mat, 32);
  addCyl(g, 0.035, 0.045, 0.46, 0, 0.25, 0, legMat, 12);
  addCyl(g, 0.2, 0.22, 0.02, 0, 0.01, 0, legMat, 24);
  return g;
}

function makeBench() {
  const g = pieceGroup('bench', 1.4, 0.4, 0.46);
  const mat = surfaceMat.sofa;
  addBox(g, 1.36, 0.1, 0.38, 0, 0.41, 0, mat, 'sofa');
  for (const sx of [-1, 1]) {
    addBox(g, 0.05, 0.36, 0.34, sx * 0.6, 0.18, 0, surfaceMat.woodwork, 'woodwork');
  }
  addBox(g, 1.16, 0.05, 0.06, 0, 0.22, 0, surfaceMat.woodwork, 'woodwork');
  return g;
}

function makeStool() {
  const g = pieceGroup('stool', 0.36, 0.36, 0.44);
  addCyl(g, 0.18, 0.17, 0.08, 0, 0.4, 0, surfaceMat.sofa, 24);
  addCyl(g, 0.05, 0.06, 0.36, 0, 0.18, 0, surfaceMat.woodwork, 16);
  addCyl(g, 0.15, 0.16, 0.02, 0, 0.01, 0, legMat, 20);
  return g;
}

function makeLamp() {
  const g = pieceGroup('lamp', 0.42, 0.42, 1.62);
  addCyl(g, 0.16, 0.19, 0.025, 0, 0.02, 0, legMat, 20);
  addCyl(g, 0.018, 0.018, 1.4, 0, 0.72, 0, legMat, 8);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.21, 0.3, 22, 1, true), shadeMat);
  shade.position.set(0, 1.48, 0);
  shade.castShadow = false;
  g.add(shade);
  /* 向下照的锥形光，而不是全向点光：点光会直怼后墙烧出一个白圆斑，
     锥形光的边缘软，墙上只剩一层渐变，地板上留一摊暖光池。 */
  const bulb = new THREE.SpotLight(0xffb877, 0, 7 * MODEL_SCALE, 1.05, 0.9, 1.6);
  bulb.position.set(0, 1.42, 0);
  bulb.target.position.set(0, 0, 0.6);
  g.add(bulb);
  g.add(bulb.target);
  g.userData.bulb = bulb;
  /* 灯罩周围一圈晕，跟着灯走 */
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }),
  );
  halo.position.set(0, 1.46, 0);
  g.add(halo);
  g.userData.halo = halo;
  return g;
}

function makePlant() {
  const g = pieceGroup('plant', 0.58, 0.58, 1.2);
  addCyl(g, 0.19, 0.14, 0.34, 0, 0.17, 0, new THREE.MeshStandardMaterial({ color: 0x8c7f70, roughness: 0.9 }), 18);
  addCyl(g, 0.022, 0.03, 0.42, 0, 0.5, 0, legMat, 8);
  const leaf = new THREE.IcosahedronGeometry(0.26, 1);
  const spots = [[0, 0.72, 0, 1], [-0.16, 0.9, 0.08, 0.8], [0.17, 0.98, -0.06, 0.72], [0.02, 1.14, 0.04, 0.55], [-0.1, 1.04, -0.14, 0.5]];
  for (const [x, y, z, s] of spots) {
    const m = new THREE.Mesh(leaf, leavesMat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

function makePendant() {
  const g = pieceGroup('pendant', 0.52, 0.52, 3);
  addCyl(g, 0.007, 0.007, 0.68, 0, 2.66, 0, legMat, 6);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.28, 26, 1, true), pendantMat);
  shade.position.set(0, 2.2, 0);
  g.add(shade);
  const bulb = new THREE.PointLight(0xffc089, 0, 6.5 * MODEL_SCALE, 2);
  bulb.position.set(0, 2.1, 0);
  g.add(bulb);
  g.userData.bulb = bulb;
  return g;
}

const BUILD = {
  sofa: makeSofa, armchair: makeArmchair, coffeeTable: makeCoffeeTable, sideTable: makeSideTable,
  diningTable: makeDiningTable, chair: makeChair, shelf: makeShelf, lamp: makeLamp, plant: makePlant,
  pendant: makePendant, sideboard: makeSideboard, roundTable: makeRoundTable, bench: makeBench,
  stool: makeStool,
};

function placePiece(type, x, z, rot) {
  if (!BUILD[type]) return null;
  const g = BUILD[type]();
  g.position.set(x, 0, z);
  g.rotation.y = rot || 0;
  if (type !== 'pendant') {
    const p = g.userData.piece;
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w * 1.32, p.d * 1.32),
      contactMat,
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.019;
    blob.renderOrder = 2;
    g.add(blob);
  }
  PIECES.add(g);
  return g;
}

/* 家具脚下的接触阴影：一张柔边黑圆，比实时阴影更“实” */
const contactTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,.72)');
  grd.addColorStop(0.45, 'rgba(0,0,0,.34)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const contactMat = new THREE.MeshBasicMaterial({
  map: contactTex, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false,
});

/* 家具落点：按占地（含旋转）夹在房间内，吸附 10cm 网格 */
function footprint(g) {
  const p = g.userData.piece;
  const c = Math.abs(Math.cos(g.rotation.y));
  const s = Math.abs(Math.sin(g.rotation.y));
  return { hx: (c * p.w + s * p.d) / 2, hz: (s * p.w + c * p.d) / 2 };
}
function clampPos(g, x, z) {
  const { hx, hz } = footprint(g);
  return [
    clamp(Math.round(x * 10) / 10, X0 + hx, X1 - hx),
    clamp(Math.round(z * 10) / 10, Z0 + hz, Z1 - hz),
  ];
}
function placeAt(type, x, z, rot) {
  const g = placePiece(type, 0, 0, rot || 0);
  if (!g) return null;
  const [cx, cz] = clampPos(g, x, z);
  g.position.set(cx, 0, cz);
  return g;
}

/* 家具位置变化后同步到状态并重绘 */
function syncPieces() {
  state.pieces = PIECES.children.map((g) => ({
    type: g.userData.piece.type,
    x: +g.position.x.toFixed(2),
    z: +g.position.z.toFixed(2),
    r: +g.rotation.y.toFixed(3),
  }));
  markDirty();
}

/* 地毯（也是一个可换材料的“面”）：加一圈深色包边，才像一块真正的毯子 */
const rugEdge = new THREE.Mesh(
  new THREE.BoxGeometry(3.9, 0.006, 2.78),
  new THREE.MeshStandardMaterial({ color: 0x6b5542, roughness: 0.95 }),
);
rugEdge.position.set(0.85, 0.004, -1.5);
room.add(rugEdge);
const rug = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.014, 2.6), surfaceMat.rug);
rug.position.set(0.85, 0.011, -1.5);
rug.receiveShadow = true;
rug.userData.surface = 'rug';
room.add(rug);

/* 初始布置：窗边阅读角，左边留一张小餐桌 */
const initialPieces = [
  ['sofa', 1.5, -2.3, 0],
  ['coffeeTable', 1.45, -1.12, 0],
  ['armchair', -1.35, -1.15, 1.2],
  ['lamp', 3.1, -2.42, 0],
  ['plant', -0.62, -2.55, 0.4],
  ['diningTable', -2.1, 1.45, 0],
  ['chair', -2.1, 0.65, 0],
  ['chair', -2.1, 2.25, Math.PI],
  ['shelf', -3.55, -0.55, Math.PI / 2],
];

/* ============================== 6. 应用材料 ============================== */
const state = {
  mats: {
    floor: ['wood', 'oak'],
    wallBack: ['paint', 'chalk'],
    wallSide: ['paint', 'chalk'],
    sofa: ['fabric', 'boucle'],
    rug: ['fabric', 'tweed'],
    woodwork: ['wood', 'walnut'],
  },
  hour: 20.8,
  pieces: [],
};

function applyMat(key, cat, id) {
  const m = byId(cat, id);
  if (!m) return;
  const mat = surfaceMat[key];
  if (mat.map) mat.map.dispose();
  mat.map = textureFor(key, m);
  mat.color.set(0xffffff);
  mat.roughness = m.rough;
  mat.metalness = 0;
  mat.envMapIntensity = 0.5;
  mat.needsUpdate = true;
  state.mats[key] = [cat, id];
  paintSlots();
  refreshCards();
  applyBackdrop();
  updateMood();
}

function applyStateMats() {
  for (const k of SURFACE_KEYS) {
    const [cat, id] = state.mats[k];
    const m = byId(cat, id);
    if (!m) continue;
    const mat = surfaceMat[k];
    if (mat.map) mat.map.dispose();
    mat.map = textureFor(k, m);
    mat.roughness = m.rough;
    mat.metalness = 0;
    mat.envMapIntensity = 0.5;
    mat.needsUpdate = true;
  }
}

/* ============================== 7. 光照与时间 ============================== */
/* 页面背景：不是固定的图，而是由这间房自己的材料算出来的。
   墙色决定上半，地色决定下半，日光决定它的明暗与冷暖。
   所以把墙刷成陶土、地面换成大理石，整页的底色会跟着走。 */
const mixRGB = (A, B, t) => [0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t);
const scaleRGB = (A, k) => A.map((v) => clamp(v * k, 0, 255));
const cssRGB = (A, a) => (a === undefined
  ? `rgb(${A.map(Math.round).join(',')})`
  : `rgba(${A.map(Math.round).join(',')},${a.toFixed(3)})`);

function rgbToHue([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 38;
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return h * 60;
}
function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const f = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
}
/* 取材料的色相，但把彩度与明度拉回"纸"的区间：
   这样墙刷成灰、地板换成灰木，页面也不会塌成水泥色。 */
function tint(base, l, s, k) {
  return hslToRgb(rgbToHue(base), s, clamp(l * k, 0, 1));
}

function matRGB(key) {
  const [cat, id] = state.mats[key];
  const m = byId(cat, id);
  return hexToRgb(m ? m.color : '#cccccc');
}

let lastBgKey = '';
function applyBackdrop(force) {
  const hour = state.hour;
  const key = `${hour.toFixed(2)}|${state.mats.floor.join('')}|${state.mats.wallBack.join('')}|${state.mats.wallSide.join('')}`;
  if (!force && key === lastBgKey) return;
  lastBgKey = key;

  const dayT = clamp((hour - 6.2) / 13.4, 0, 1);
  const arc = Math.sin(dayT * Math.PI);
  const dayF = hour < 7.5 ? smooth(clamp((hour - 6) / 1.5, 0, 1))
    : hour < 18 ? 1 : 1 - smooth(clamp((hour - 18) / 2.2, 0, 1));
  const warmK = clamp(1 - (3 + arc * 64) / 58, 0, 1);

  const wall = mixRGB(matRGB('wallBack'), matRGB('wallSide'), 0.5);
  const floor = matRGB('floor');
  const fabric = matRGB('sofa');
  const cream = [252, 247, 238];
  const light = 0.72 + dayF * 0.28;          // 夜里整页收暗一档，但不至于变成暗黑界面
  const sat = 0.14 + warmK * 0.07;

  const a = tint(mixRGB(wall, cream, 0.55), 0.955, sat * 0.55, light);
  const b = tint(mixRGB(mixRGB(wall, floor, 0.42), cream, 0.34), 0.885, sat * 0.9, light);
  const c = tint(mixRGB(mixRGB(wall, floor, 0.75), cream, 0.16), 0.775, sat, light);

  const st = document.documentElement.style;
  st.setProperty('--bg-a', cssRGB(a));
  st.setProperty('--bg-b', cssRGB(b));
  st.setProperty('--bg-c', cssRGB(c));

  /* 左上那一片光：黄昏与清晨最暖 */
  const glowCol = mixRGB([255, 206, 150], [255, 246, 226], dayF * 0.75);
  st.setProperty('--bg-glow', cssRGB(glowCol, 0.30 + warmK * 0.28));
  st.setProperty('--bg-floor', cssRGB(mixRGB(floor, [0, 0, 0], 0.30), 0.10 + (1 - dayF) * 0.07));
  st.setProperty('--bg-ring', cssRGB(mixRGB(floor, [0, 0, 0], 0.30), 0.13 + (1 - dayF) * 0.05));

  /* 墙 / 地 / 织物三团化开的色 */
  const wf = 0.45 + dayF * 0.55;
  st.setProperty('--wash-1', cssRGB(mixRGB(wall, cream, 0.55), 0.26 * wf));
  st.setProperty('--wash-2', cssRGB(floor, 0.13 * wf));
  st.setProperty('--wash-3', cssRGB(fabric, 0.11 * wf));

  /* 墙上那个拱：比墙亮一档，细线勾边 */
  st.setProperty('--arch-1', cssRGB(mixRGB(cream, glowCol, 0.35), 0.52 * (0.7 + dayF * 0.3)));
  st.setProperty('--arch-2', cssRGB(cream, 0.18 * (0.7 + dayF * 0.3)));
  st.setProperty('--arch-line', cssRGB(mixRGB(floor, [0, 0, 0], 0.32), 0.17));
}

/* 三档之间做交叉淡入，避免硬切闪光。
   权重是钟点的连续函数，三段之间各自有一个 1 小时左右的过渡带：
   5.0–5.9 夜→昏、6.1–7.0 昏→昼、16.2–17.0 昼→昏、19.0–19.9 昏→夜。 */
function cityWeights(hour) {
  const ramp = (h, a, b) => clamp((h - a) / (b - a), 0, 1);
  const day = Math.min(ramp(hour, 6.1, 7.0), 1 - ramp(hour, 16.2, 17.0));
  const dusk = Math.max(
    ramp(hour, 5.0, 5.9) - ramp(hour, 6.1, 7.0),     // 破晓
    ramp(hour, 16.2, 17.0) - ramp(hour, 19.0, 19.9), // 黄昏
    0,
  );
  return { day: clamp(day, 0, 1), dusk: clamp(dusk, 0, 1), night: clamp(1 - day - dusk, 0, 1) };
}

function setHour(h, silent) {
  state.hour = clamp(h, 6, 23);
  const hour = state.hour;
  const t = (hour - 6) / 17;                       // 0 清晨 → 1 深夜（时间轴位置）
  const dayT = clamp((hour - 6.2) / 13.4, 0, 1);   // 6:12 日出 → 19:36 日落
  const arc = Math.sin(dayT * Math.PI);            // 太阳高度因子

  const elev = 5 + arc * 29;
  const azim = lerp(-1.05, 0.45, dayT);
  const R = 16;
  const rad = (elev * Math.PI) / 180;
  const horiz = Math.cos(rad) * R;
  /* 太阳必须在窗外（z < 窗面 -4.9）。旧版写的是 +cos(azim)·horiz·0.85，
     结果太阳一直在相机背后（实测 12:24 落在 z=+6.9），
     光根本进不了窗，室内几乎全靠补光——只开太阳时整间屋子是黑的。 */
  sun.position.set(
    -Math.sin(azim) * horiz,
    Math.sin(rad) * R + 1.4,
    -Math.abs(Math.cos(azim)) * horiz * 0.85 - 1.5,
  );
  sun.target.position.set(0, 0.8, 0);

  /* 天光强度按钟点走：日出后一小时到满，18:00 之后开始往下掉，20:12 归零 */
  const dayF = hour < 7.5 ? smooth(clamp((hour - 6) / 1.5, 0, 1))
    : hour < 18 ? 1
    : 1 - smooth(clamp((hour - 18) / 2.2, 0, 1));

  const warmK = clamp(1 - elev / 58, 0, 1) * clamp(dayF + 0.15, 0, 1) * 0.72;

  /* 时段先定下来，光照和贴图都要按它分档。
     night / dusk / day 三档：之前只有"白天/夜里"两档，黄昏落进白天，
     于是暖光(18.6)与清亮(12.4)共用同一张灰白贴图，窗外发死。 */
  const phase = hour >= 19.8 || hour < 5.6 ? 'night'
    : (hour >= 17.0 || hour < 7.0) ? 'dusk' : 'day';

  const cDay = new THREE.Color(0xfff4e6);
  const cGold = new THREE.Color(0xff9a4e);
  const cMoon = new THREE.Color(0x93a9de);
  const c = new THREE.Color().copy(cDay).lerp(cGold, warmK);
  if (dayF < 0.06) c.lerp(cMoon, 1 - dayF / 0.06);
  sun.color.copy(c);
  sun.intensity = dayF < 0.06 ? 0.10 : lerp(0.18, 3.10, dayF);

  /* 天光与环境：白天要"涌进屋里"而不是只照亮窗外。
     旧值白天 hemi 0.28 / environment 0.30 / windowFill 0.32（比夜里还低），
     深色木墙吸光，屋里于是发闷。三个值按 dayF 抬上去。 */
  hemi.intensity = lerp(0.09, 0.36, dayF);
  hemi.color.set(dayF > 0.3 ? 0xdfe9ff : 0x8294bb);
  hemi.groundColor.set(dayF > 0.3 ? 0x6d5844 : 0x302a23);

  bounce.intensity = lerp(0.03, 0.34, dayF);

  /* 场景级的那几盏原本是常量，无论几点都把屋子均匀洗白——夜里没有暗部，
     就谈不上氛围。现在全部跟着天光收放：白天由太阳主导，天黑后交给屋里的灯。 */
  scene.environmentIntensity = lerp(0.055, 0.44, dayF);
  /* windowFill 是"从窗进来的天光"。旧值白天 0.32 比夜里 0.42 还低，
     等于白天窗口反而更暗，屋里自然闷。现在白天抬到 1.05。 */
  windowFill.intensity = lerp(0.42, 0.88, dayF);
  rimCool.intensity = lerp(0.18, 0.56, dayF);
  rimWarm.intensity = lerp(0.12, 0.34, dayF);
  spill.material.opacity = lerp(0.22, 0.16, dayF);

  /* 黄昏暖光：只在暖光时段起。dayF 已从 1 落到 0.8 左右，太阳低、光色转金，
     这时屋里必须也被染暖，否则窗外黄昏、屋里冷白，割裂感很强。
     duskWarmK 同时用来把两盏冷补光"调暖、调弱"——它们强度不低
     （windowFill 0.94 / rimCool 0.6），不处理会把暖光直接冲成灰。 */
  const duskWarmK = phase === 'dusk' ? clamp(1 - Math.abs(hour - 18.2) / 2.0, 0, 1) : 0;
  duskSpill.intensity = duskWarmK * 1.35;
  if (duskWarmK > 0.01) {
    windowFill.color.setHex(0xffc79a);
    rimCool.color.setHex(0xffb98c);
    rimCool.intensity *= 1 - duskWarmK * 0.7;
    windowFill.intensity *= 1 - duskWarmK * 0.35;
    hemi.color.set(0xffd2a4);
    hemi.groundColor.set(0x7a4a2c);
    scene.environmentIntensity *= 1 - duskWarmK * 0.3;
  } else {
    windowFill.color.setHex(0x9db8dc);
    rimCool.color.setHex(0x9fb8e0);
  }

  /* 城市贴图按 phase 三档切，两档之间用第二层交叉淡入。
     phase 硬切会在 17:00 / 19:48 闪一下（拖时间轴尤其明显），实测确认。 */
  const w = cityWeights(hour);
  const order = [['night', w.night], ['dusk', w.dusk], ['day', w.day]]
    .sort((a, b) => b[1] - a[1]);
  const baseKey = order[0][0], overKey = order[1][0];
  const sum = order[0][1] + order[1][1];
  if (cityView.material.map !== viewTex[baseKey]) {
    cityView.material.map = viewTex[baseKey];
    cityView.material.needsUpdate = true;
  }
  if (cityOverlay.material.map !== viewTex[overKey]) {
    cityOverlay.material.map = viewTex[overKey];
    cityOverlay.material.needsUpdate = true;
  }
  cityOverlay.material.opacity = sum > 1e-6 ? clamp(order[1][1] / sum, 0, 1) : 0;
  cityOverlay.visible = cityOverlay.material.opacity > 0.004;
  /* 三层圆柱只有 night/day 两版，取权重更高的那档；它们在最远处只负责视差 */
  const cylKey = w.day > 0.55 ? 'day' : 'night';
  for (const m of [cityFar, cityMid, cityNear]) {
    const pair = m.userData.cityTex;
    const want = pair[cylKey] || pair.night;
    if (m.material.map !== want) { m.material.map = want; m.material.needsUpdate = true; }
  }
  skyCard.material.map = (w.day > 0.5) ? roomViewTex.day : roomViewTex.night;
  /* 夜里窗后是房间的暖光，白天是漫射天光；都只是二层，不是城市 */
  skyCard.material.needsUpdate = true;
  /* 背景 / 雾按权重插值，而不是三选一：这样淡入过程中环境色也是连续变的 */
  const isNight = w.night > 0.5;
  scene.background.setHex(0x0a0e16).lerp(new THREE.Color(0x241d28), w.dusk)
    .lerp(new THREE.Color(0x9aa9bc), w.day);
  scene.fog.color.setHex(0x141b28).lerp(new THREE.Color(0x2e2530), w.dusk)
    .lerp(new THREE.Color(0xa8b6c6), w.day);
  scene.fog.density = 0.0055 * w.night + 0.0040 * w.dusk + 0.0022 * w.day;
  /* 城市反光从 1.0 收到 0.72：原值在窗下半铺出一片暖白雾，
     夜景会发灰；收一点后窗外恢复通透，辉光只留给真正的灯点。 */
  /* 窗外换成实拍夜景后，这两层是给「程序化城市」补光用的：
     再叠上去会把照片染成棕黄，还会在某栋楼上压出一团假光斑。
     照片自带城市光晕与散景，这里只留极淡的一层氛围。 */
  cityGlow.material.opacity = isNight ? 0.10 : 0.05;
  for (const b of [bokehA, bokehB, bokehC]) b.material.opacity = isNight ? 0.06 : 0.03;

  /* 灯：天黑之后逐个亮起来。灯罩、灯晕、墙面光斑、地板光池共用同一个系数，
     这样"亮"是一整套亮，不会只亮一个灯罩而四周还是黑的。 */
  const lampK = clamp(
    smooth(clamp((hour - 17.2) / 2.6, 0, 1)) + smooth(clamp((6.8 - hour) / 1.6, 0, 1)), 0, 1,
  );
  shadeMat.emissiveIntensity = lampK * 1.35;
  /* 二层：嵌灯 + 两条线性灯带，灯面与点光一起亮 */
  for (const o of aptDownlights) {
    if (o.isLight) o.intensity = lampK * 3.4;
    else o.material.opacity = lampK * 0.95;
  }
  for (const s of aptStrips) s.material.opacity = lampK * 0.85;
  for (const l of aptStripLights) l.intensity = lampK * 3.2;
  aptSpotLight.intensity = lampK * 9.0;
  aptSpotGlow.material.opacity = lampK * 0.9;
  for (const m of tableGlowMats) m.emissiveIntensity = lerp(0.12, 0.35, lampK);
  for (const m of aptGlowMats) {
    const hi = m === aptWallMat ? 0.85
      : (m === floorMat || m === aptRugMat || m === wallMat) ? 0.95 : 0.5;
    m.emissiveIntensity = lerp(0.30, hi, lampK);
  }
  /* 天花是朝下的单面：白天太阳从上往下照，打不到它的背面。
     若跟墙一样在白天把自发光降到 0.30，它会变成画面顶部一整片纯黑。
     所以白天单独给它更高的底（跟着 lampK 反向走），夜里再收暗。 */
  aptCeilMat.emissiveIntensity = lerp(1.30, 0.55, lampK);
  aptCove.material.opacity = lampK * 0.42;
  aptPlinthGlow.material.opacity = lampK * 0.14;
  /* 模型内的点光：距离缩了 s 倍，强度要缩 s² 才等价（衰减是 1/d²） */
  coveLight.intensity = lampK * 2.6 * MODEL_SCALE_SQ;
  cove.visible = lampK > 0.04;
  wallGlow.material.opacity = lampK * 0.13;
  floorPool.material.opacity = lampK * 0.30;
  windowCast.material.opacity = lampK * 0.52;
  PIECES.traverse((o) => {
    if (o.userData.bulb) o.userData.bulb.intensity = lampK * 3.0 * MODEL_SCALE_SQ;
    if (o.userData.halo) o.userData.halo.material.opacity = lampK * 0.48;
  });

  /* 和风新构件：障子背光 + 縁側台沿灯 + 红色竖霓虹。
     灯全亮之后它们才起，白天彻底收掉——否则白天会看到"没通电的霓虹"。 */
  if (APT_SHOJI_LIGHT) APT_SHOJI_LIGHT.intensity = lampK * 4.4;
  shojiMat.emissiveIntensity = lerp(0.16, 0.62, lampK);
  aptNoseGlow.material.opacity = lampK * 0.42;
  neonMat.opacity = lampK * 0.95;
  for (const n of NEON) {
    n.light.intensity = lampK * 1.55;
  }
  /* 地面倒影：夜里窗和霓虹才亮，倒影跟着走；白天几乎收掉 */
  reflMat.opacity = lampK * 0.85;

  /* 夜里降曝光：受 ACES 影响的只有屋内实物，窗外城市是 toneMapped:false，
     不会跟着暗下去——室内沉下来、窗外依旧亮，明暗差自然就出来了。 */
  renderer.toneMappingExposure = lerp(0.86, 0.95, dayF);

  const label = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  $('#clock-time').textContent = label;
  $('#rail-fill').style.height = `${t * 100}%`;
  $('#rail-knob').style.top = `${t * 100}%`;
  $('#rail').setAttribute('aria-valuenow', hour.toFixed(1));
  document.body.dataset.time = hour < 7.4 ? 'dawn' : hour < 16.5 ? 'day' : hour < 20 ? 'evening' : 'night';
  applyBackdrop();

  updateMood();
  if (!silent) pushHistory();
}

/* ============================== 8. 情绪读数 ============================== */
function updateMood() {
  let lum = 0, warm = 0, n = 0, dark = 0;
  for (const k of SURFACE_KEYS) {
    const [cat, id] = state.mats[k];
    const m = byId(cat, id);
    if (!m) continue;
    const c = new THREE.Color(m.color);
    const hsl = {};
    c.getHSL(hsl);
    lum += hsl.l;
    warm += (c.r - c.b) * 1.9 + 0.5;
    if (hsl.l < 0.42) dark++;
    n++;
  }
  lum /= n; warm /= n; dark /= n;

  const hour = state.hour;
  const arc = Math.sin(clamp((hour - 6.2) / 13.4, 0, 1) * Math.PI);
  const lightLevel = 0.25 + arc * 0.75;

  const bright = clamp(lum * 1.15 * lightLevel + 0.05, 0.02, 0.98);
  const warmV = clamp(warm * (0.65 + (1 - arc) * 0.4), 0.02, 0.98);
  const quiet = clamp(0.2 + dark * 0.62 + (1 - lightLevel) * 0.45 - lum * 0.18, 0.02, 0.98);

  const vals = { warm: warmV, bright, quiet };
  for (const k of ['warm', 'bright', 'quiet']) {
    const row = document.querySelector(`.meter .row[data-k="${k}"]`);
    row.querySelector('b').textContent = Math.round(vals[k] * 100);
    row.querySelector('u span').style.width = `${Math.round(vals[k] * 100)}%`;
  }

  const lead = Object.entries(vals).sort((a, b) => b[1] - a[1])[0][0];
  const why = {
    warm: '低角度的光、暖色木料和织物把房间往黄昏里推。',
    bright: '浅色表面把天光弹得到处都是，房间读起来是敞的。',
    quiet: '深色表面吃光，只有几盏灯在低处发亮。',
  }[lead];
  const tone = { warm: '偏暖', bright: '偏亮', quiet: '偏静' }[lead];
  $('#verdict').textContent = `此刻这间房${tone}。${why}`;
  $('#feel-name').textContent = tone;
  markDirty();
}

/* ============================== 9. 表面列表 ============================== */
let selectedSurface = null;

function paintSlots() {
  const host = $('#slots');
  if (host.childElementCount === 0) {
    for (const k of SURFACE_KEYS) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.dataset.k = k;
      b.innerHTML = `<span class="dot"></span><span>${SURFACES[k].name}</span>`;
      b.addEventListener('click', () => selectSurface(selectedSurface === k ? null : k));
      host.appendChild(b);
    }
  }
  for (const b of host.children) {
    const k = b.dataset.k;
    const [cat, id] = state.mats[k];
    const m = byId(cat, id);
    b.querySelector('.dot').style.background = m ? m.color : '#ddd';
    b.classList.toggle('on', selectedSurface === k);
  }
}

function selectSurface(k) {
  selectedSurface = k;
  paintSlots();
  const hint = $('#ghost-hint');
  if (k) {
    hint.textContent = `已选：${SURFACES[k].name} · 点一块样本贴上去`;
    hint.style.left = '50%';
    hint.style.top = '86px';
    hint.classList.add('on');
    clearTimeout(selectSurface._t);
    selectSurface._t = setTimeout(() => hint.classList.remove('on'), 2200);
  }
  refreshCards();
}

/* ============================== 10. 样本抽屉 ============================== */
const FURNITURE = [
  { id: 'sofa', name: '沙发', sub: '2.35 m' },
  { id: 'armchair', name: '单椅', sub: '0.92 m' },
  { id: 'bench', name: '长凳', sub: '1.40 m' },
  { id: 'coffeeTable', name: '茶几', sub: '1.32 m' },
  { id: 'sideTable', name: '边几', sub: '0.44 m' },
  { id: 'roundTable', name: '圆几', sub: '0.62 m' },
  { id: 'diningTable', name: '餐桌', sub: '1.70 m' },
  { id: 'chair', name: '餐椅', sub: '0.46 m' },
  { id: 'stool', name: '矮凳', sub: '0.36 m' },
  { id: 'sideboard', name: '边柜', sub: '1.40 m' },
  { id: 'shelf', name: '书架', sub: '0.94 m' },
  { id: 'lamp', name: '落地灯', sub: '1.60 m' },
  { id: 'pendant', name: '吊灯', sub: '吊装' },
  { id: 'plant', name: '绿植', sub: '1.20 m' },
];

let tab = 'wood';
const cardsHost = $('#cards');

/* 家具缩略图：用第二个离屏渲染器把每件家具拍一张，避免卡片只有色块 */
let THUMBS = null;
function buildThumbs() {
  if (THUMBS) return THUMBS;
  const S = 200;
  let rt;
  try {
    rt = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    THUMBS = {};
    return THUMBS;
  }
  rt.setPixelRatio(1);
  rt.setSize(S, S, false);
  rt.outputColorSpace = THREE.SRGBColorSpace;
  rt.toneMapping = THREE.ACESFilmicToneMapping;
  rt.toneMappingExposure = 1.02;

  const sc = new THREE.Scene();
  sc.environment = scene.environment;
  sc.environmentIntensity = 0.55;
  sc.add(new THREE.HemisphereLight(0xffffff, 0x6b5844, 1.5));
  const key = new THREE.DirectionalLight(0xfff3e4, 2.1);
  key.position.set(3.2, 5, 4);
  sc.add(key);

  const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 80);
  THUMBS = {};
  for (const f of FURNITURE) {
    const g = BUILD[f.id]();
    sc.add(g);
    const bb = new THREE.Box3().setFromObject(g);
    const c = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    let maxDim = Math.max(size.x, size.y, size.z);
    if (f.id === 'pendant') { c.set(0, 2.18, 0); maxDim = 0.75; }
    const dist = (maxDim / 2) / Math.tan((cam.fov * Math.PI) / 360) * 1.24;
    cam.position.set(c.x + dist * 0.46, c.y + dist * 0.4, c.z + dist * 0.78);
    cam.lookAt(c.x, c.y - maxDim * 0.06, c.z);
    rt.render(sc, cam);
    THUMBS[f.id] = rt.domElement.toDataURL('image/png');
    sc.remove(g);
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  rt.dispose();
  rt.forceContextLoss();
  return THUMBS;
}

function refreshCards() {
  const isFurn = tab === 'furniture';
  const list = isFurn ? FURNITURE : LIB[tab];
  if (cardsHost.dataset.tab !== tab) {
    cardsHost.dataset.tab = tab;
    cardsHost.innerHTML = '';
    const thumbs = isFurn ? buildThumbs() : null;
    for (const item of list) {
      const b = document.createElement('button');
      b.className = 'card';
      b.dataset.id = item.id;
      if (isFurn) {
        const src = thumbs[item.id];
        const bg = src ? `background-image:url(${src})` : 'background:rgba(0,0,0,.04)';
        b.innerHTML = `<span class="sw ph" style="${bg}"></span><small>${item.name}</small><span class="tag">${item.sub}</span>`;
      } else {
        b.innerHTML = `<span class="sw" style="background-image:url(${swatchFor(byId(tab, item.id))})"></span><small>${item.name}</small>`;
      }
      b.addEventListener('pointerdown', (e) => startCardDrag(e, b, isFurn ? 'furniture' : tab, item.id));
      cardsHost.appendChild(b);
    }
  }
  if (isFurn) return;
  for (const b of cardsHost.children) {
    const used = SURFACE_KEYS.some((k) => state.mats[k][0] === tab && state.mats[k][1] === b.dataset.id);
    b.classList.toggle('used', used);
    b.classList.toggle('on', selectedSurface && state.mats[selectedSurface][1] === b.dataset.id && state.mats[selectedSurface][0] === tab);
  }
}

for (const b of $$('#tabs button')) {
  b.addEventListener('click', () => {
    tab = b.dataset.t;
    for (const o of $$('#tabs button')) {
      o.classList.toggle('on', o === b);
      o.setAttribute('aria-selected', o === b ? 'true' : 'false');
    }
    refreshCards();
  });
}

/* ============================== 11. 指针交互 ============================== */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
/* 拾取平面在模型台的地面高度（世界坐标），命中后再换算回一层的局部坐标。
   一层的局部地面是 y=0，对应世界高度 MODEL_BASE_Y。 */
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -MODEL_BASE_Y);
const hitPoint = new THREE.Vector3();

function setNDC(e) {
  const r = canvasEl.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

/* 署名铭牌拾取：命中就返回那条记录，用于悬停高亮与点击跳转 */
function pickLink(e) {
  if (!LINK_SPOTS.length) return null;
  setNDC(e);
  raycaster.setFromCamera(ndc, camera);
  const meshes = LINK_SPOTS.map((s) => s.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  return LINK_SPOTS.find((s) => s.mesh === hits[0].object) || null;
}

function pickSurface(e) {
  setNDC(e);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(room.children, true);
  for (const h of hits) {
    if (h.object.userData.surface) return { key: h.object.userData.surface, point: h.point, object: h.object };
  }
  return null;
}

function pickPiece(e) {
  setNDC(e);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(PIECES.children, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.piece) o = o.parent;
  return o && o.userData.piece ? { group: o, point: hits[0].point } : null;
}

function floorPoint(e) {
  setNDC(e);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return null;
  /* 世界坐标 → 一层的局部坐标：模型台被缩放并抬到桌上，不换算会整体错位 */
  const local = MODEL.worldToLocal(hitPoint.clone());
  return local.setY(0);
}

/* 悬停高亮 */
let hovered = null;
function highlight(key) {
  if (hovered === key) return;
  if (hovered && surfaceMat[hovered]) surfaceMat[hovered].emissive.setHex(0x000000);
  hovered = key;
  if (key && surfaceMat[key]) surfaceMat[key].emissive.setHex(0x5a2a12);
}

/* 轨道控制 */
let mode = null;
let hoveredLink = null;
const dragInfo = { x: 0, y: 0, theta: 0, phi: 0, moved: false };

canvasEl.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  try { canvasEl.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
  const piece = pickPiece(e);
  if (piece && !e.shiftKey) {
    mode = 'piece';
    dragInfo.piece = piece.group;
    dragInfo.start = floorPoint(e);
    dragInfo.origin = piece.group.position.clone();
    canvasEl.classList.add('dragging');
    pushHistory();
  } else {
    mode = 'orbit';
    dragInfo.x = e.clientX;
    dragInfo.y = e.clientY;
    dragInfo.theta = orbit.theta;
    dragInfo.phi = orbit.phi;
    dragInfo.moved = false;
  }
});

canvasEl.addEventListener('pointermove', (e) => {
  if (mode === 'orbit') {
    const dx = e.clientX - dragInfo.x, dy = e.clientY - dragInfo.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragInfo.moved = true;
    /* 即时跟手：目标值与当前值同步写入，不经过阻尼。
       编辑器里点面 / 拖家具依赖指针与画面严格对齐，60 ms 的滞后就会点偏。
       灵敏度从 0.006/0.005 降到 0.0026/0.0022：实测 120 px 拖动会让画面
       位移 634 px（放大 5 倍），太"窜"；降到约 2 倍才接近手上的力度。 */
    orbit.theta = orbitGoal.theta = clamp(dragInfo.theta - dx * 0.0026, ...THETA_RANGE);
    orbit.phi = orbitGoal.phi = clamp(dragInfo.phi - dy * 0.0022, ...PHI_RANGE);
    placeCamera();
    markDirty();
    canvasEl.classList.add('dragging');
    return;
  }
  if (mode === 'piece') {
    const p = floorPoint(e);
    if (p && dragInfo.start) {
      const g = dragInfo.piece;
      const [nx, nz] = clampPos(
        g,
        dragInfo.origin.x + (p.x - dragInfo.start.x),
        dragInfo.origin.z + (p.z - dragInfo.start.z),
      );
      g.position.set(nx, 0, nz);
      syncPieces();
    }
    return;
  }
  if (cardDrag.active) {
    moveGhost(e);
    const s = pickSurface(e);
    highlight(s ? s.key : null);
    canvasEl.classList.toggle('over-surface', !!s);
    return;
  }
  /* 悬停在署名铭牌上：手型 + 铜面提亮，让人知道这是能点的 */
  if (mode !== 'orbit') {
    const link = pickLink(e);
    const onLink = link !== null;
    canvasEl.style.cursor = onLink ? 'pointer' : 'grab';
    if (onLink !== !!hoveredLink) {
      if (hoveredLink) hoveredLink.mesh.material.emissiveIntensity = 0.5;
      hoveredLink = link;
      if (link) link.mesh.material.emissiveIntensity = 1.5;
      markDirty();
    }
    if (onLink) { highlight(null); return; }
  }
  const s = pickSurface(e);
  highlight(s ? s.key : null);
  canvasEl.style.cursor = s ? 'pointer' : 'grab';
});

function endDrag(e) {
  if (mode === 'orbit' && !dragInfo.moved) {
    /* 先看是不是点在署名铭牌上：是就跳转，不回落到选面 */
    const link = pickLink(e);
    if (link) {
      window.open(link.url, '_blank', 'noopener');
      toast(`打开 ${link.url.replace('https://', '')}`);
      mode = null;
      canvasEl.classList.remove('dragging');
      markDirty();
      return;
    }
    const s = pickSurface(e);
    if (s) selectSurface(s.key === selectedSurface ? null : s.key);
  }
  /* 不做甩动惯性：松手即停，这样紧接着的点击/拖家具落点才准 */
  mode = null;
  canvasEl.classList.remove('dragging');
  markDirty();
}
canvasEl.addEventListener('pointerup', endDrag);
canvasEl.addEventListener('pointercancel', () => { mode = null; canvasEl.classList.remove('dragging'); });
canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());

canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  /* 写目标半径，由帧循环阻尼逼近：滚轮不再一格一跳 */
  orbitGoal.radius = clamp(orbitGoal.radius + e.deltaY * 0.0026, ...RADIUS_RANGE);
  markDirty();
}, { passive: false });

/* ---------- 从卡片拖样本 / 家具 ---------- */
const cardDrag = { active: false, kind: null, cat: null, id: null };
const ghost = $('#ghost-hint');

function startCardDrag(e, el, cat, id) {
  e.preventDefault();
  cardDrag.active = true;
  cardDrag.cat = cat;
  cardDrag.id = id;
  cardDrag.kind = cat === 'furniture' ? 'furn' : 'mat';
  cardDrag.moved = false;
  cardDrag.x = e.clientX;
  cardDrag.y = e.clientY;
  moveGhost(e);
  try { el.setPointerCapture(e.pointerId); } catch { /* 合成事件没有真实指针，忽略 */ }
  el.addEventListener('pointermove', onCardMove);
  el.addEventListener('pointerup', onCardUp);
  el.addEventListener('pointercancel', onCardUp);
}

function onCardMove(e) {
  if (!cardDrag.active) return;
  if (Math.abs(e.clientX - cardDrag.x) + Math.abs(e.clientY - cardDrag.y) > 6) cardDrag.moved = true;
  moveGhost(e);
  if (cardDrag.kind === 'mat') {
    const s = pickSurface(e);
    highlight(s ? s.key : null);
    canvasEl.classList.toggle('over-surface', !!s);
  }
}

function onCardUp(e) {
  const el = e.currentTarget;
  el.removeEventListener('pointermove', onCardMove);
  el.removeEventListener('pointerup', onCardUp);
  el.removeEventListener('pointercancel', onCardUp);
  if (!cardDrag.active) return;
  cardDrag.active = false;
  ghost.classList.remove('on');
  highlight(null);
  canvasEl.classList.remove('over-surface');

  /* 没拖动 = 点选：样本直接贴到已选的面，家具给一句提示 */
  if (!cardDrag.moved) {
    if (cardDrag.kind === 'mat') {
      if (selectedSurface) applyToSurface(selectedSurface, cardDrag.cat, cardDrag.id);
      else toast('先点一个面，或把样本拖进去');
    } else {
      toast('把家具拖进屋子里放下');
    }
    return;
  }

  const r = canvasEl.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) return;

  if (cardDrag.kind === 'mat') {
    const s = pickSurface(e);
    if (!s) { toast('要放到地面、墙、沙发、地毯或木作上'); return; }
    applyToSurface(s.key, cardDrag.cat, cardDrag.id);
  } else {
    const p = floorPoint(e);
    if (!p) return;
    pushHistory();
    const g = placeAt(cardDrag.id, p.x, p.z, 0);
    if (!g) return;
    syncPieces();
    const f = FURNITURE.find((x) => x.id === cardDrag.id);
    toast(`放了一张${f ? f.name : '家具'}`);
  }
}

function moveGhost(e) {
  ghost.textContent = cardDrag.kind === 'mat'
    ? `贴到 ${SURFACES[selectedSurface] ? SURFACES[selectedSurface].name : '任意表面'}`
    : '拖进屋子里放下';
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
  ghost.classList.add('on');
}

let toastTimer = null;
function toast(msg) {
  ghost.textContent = msg;
  ghost.style.left = '50%';
  ghost.style.top = '86px';
  ghost.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ghost.classList.remove('on'), 2000);
}

const CAT_NAME = { wood: '木', stone: '石', fabric: '织物', paint: '涂料', furniture: '家具' };

function applyToSurface(key, cat, id) {
  if (!SURFACES[key].cats.includes(cat)) {
    const need = SURFACES[key].cats.map((c) => CAT_NAME[c]).join(' 或 ');
    toast(`${SURFACES[key].name}只能贴${need}`);
    return;
  }
  pushHistory();
  applyMat(key, cat, id);
  selectSurface(null);
}

/* ============================== 12. 历史 ============================== */
const undoStack = [];
const redoStack = [];

function snapshot() {
  return JSON.stringify({
    mats: state.mats,
    hour: state.hour,
    pieces: PIECES.children.map((g) => ({
      type: g.userData.piece.type,
      x: +g.position.x.toFixed(2),
      z: +g.position.z.toFixed(2),
      r: +g.rotation.y.toFixed(3),
    })),
  });
}
function pushHistory() {
  const snap = snapshot();
  if (undoStack[undoStack.length - 1] === snap) return;
  undoStack.push(snap);
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  syncTools();
}
function restore(snap) {
  const s = JSON.parse(snap);
  state.mats = s.mats;
  applyStateMats();
  PIECES.clear();
  for (const p of s.pieces) placePiece(p.type, p.x, p.z, p.r);
  setHour(s.hour, true);
  paintSlots();
  refreshCards();
  updateMood();
}
function undo() {
  if (undoStack.length < 2) return;
  redoStack.push(undoStack.pop());
  restore(undoStack[undoStack.length - 1]);
  syncTools();
}
function redo() {
  if (!redoStack.length) return;
  const s = redoStack.pop();
  undoStack.push(s);
  restore(s);
  syncTools();
}
function syncTools() {
  $('#undo').disabled = undoStack.length < 2;
  $('#redo').disabled = redoStack.length === 0;
}

/* ============================== 13. 界面接线 ============================== */
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);

/* 时间轴拖拽 */
const rail = $('#rail');
let railDrag = false;
function railFromY(clientY) {
  const r = rail.getBoundingClientRect();
  const t = clamp((clientY - r.top) / r.height, 0, 1);
  return 6 + t * 17;
}
rail.addEventListener('pointerdown', (e) => {
  railDrag = true;
  rail.classList.add('dragging');
  rail.setPointerCapture(e.pointerId);
  pushHistory();
  setHour(railFromY(e.clientY), true);
});
rail.addEventListener('pointermove', (e) => { if (railDrag) setHour(railFromY(e.clientY), true); });
rail.addEventListener('pointerup', () => { railDrag = false; rail.classList.remove('dragging'); });
rail.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') { setHour(state.hour + 0.5); e.preventDefault(); }
  if (e.key === 'ArrowDown') { setHour(state.hour - 0.5); e.preventDefault(); }
});
for (const b of $$('.ticks button')) {
  b.addEventListener('click', () => { pushHistory(); setHour(parseFloat(b.dataset.h)); });
}

/* 情绪预设 */
const PRESETS = {
  warm: {
    mats: { floor: ['wood', 'oak'], wallBack: ['paint', 'chalk'], wallSide: ['paint', 'clay'], sofa: ['fabric', 'linen'], rug: ['fabric', 'tweed'], woodwork: ['wood', 'walnut'] },
    hour: 18.6,
  },
  clear: {
    mats: { floor: ['stone', 'marble'], wallBack: ['paint', 'chalk'], wallSide: ['paint', 'chalk'], sofa: ['fabric', 'linen'], rug: ['fabric', 'linen'], woodwork: ['wood', 'oak'] },
    hour: 12.4,
  },
  quiet: {
    mats: { floor: ['wood', 'smoked'], wallBack: ['paint', 'deep'], wallSide: ['paint', 'deep'], sofa: ['fabric', 'velvet'], rug: ['fabric', 'tweed'], woodwork: ['wood', 'walnut'] },
    hour: 22.2,
  },
};
for (const b of $$('.mood')) {
  b.addEventListener('click', () => {
    pushHistory();
    const p = PRESETS[b.dataset.m];
    state.mats = JSON.parse(JSON.stringify(p.mats));
    applyStateMats();
    setHour(p.hour, true);
    for (const o of $$('.mood')) o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
    paintSlots();
    refreshCards();
    updateMood();
    pushHistory();
  });
}

/* 存图：走完整后处理，导出的图和屏幕上看到的一致 */
$('#shot').addEventListener('click', () => {
  renderFrame();
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'room-mood.png';
  a.click();
  toast('已存成图片');
});

/* 链接 */
function encodeState() {
  const s = { m: state.mats, h: +state.hour.toFixed(2), p: PIECES.children.map((g) => [g.userData.piece.type, +g.position.x.toFixed(2), +g.position.z.toFixed(2), +g.rotation.y.toFixed(2)]) };
  const json = JSON.stringify(s);
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return b64;
}
function decodeState(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const s = JSON.parse(json);
    state.mats = s.m;
    state.hour = s.h;
    applyStateMats();
    PIECES.clear();
    for (const [type, x, z, r] of s.p) placePiece(type, x, z, r);
    return true;
  } catch { return false; }
}
$('#share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#r=${encodeState()}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('链接已复制');
  } catch {
    location.hash = `r=${encodeState()}`;
    toast('链接已写进地址栏');
  }
});

$('#reset').addEventListener('click', () => {
  pushHistory();
  location.hash = '';
  state.mats = {
    floor: ['wood', 'oak'], wallBack: ['paint', 'chalk'], wallSide: ['paint', 'chalk'],
    sofa: ['fabric', 'linen'], rug: ['fabric', 'tweed'], woodwork: ['wood', 'walnut'],
  };
  applyStateMats();
  PIECES.clear();
  for (const p of initialPieces) placePiece(...p);
  setHour(18.5, true);
  paintSlots();
  refreshCards();
  updateMood();
  pushHistory();
  toast('回到初始状态');
});

/* 帮助 */
const help = $('#help');
$('#help-btn').addEventListener('click', () => help.showModal());
$('#help-close').addEventListener('click', () => help.close());

/* 键盘 */
const PAN_OWNERS = ['INPUT', 'TEXTAREA', 'SELECT'];
window.addEventListener('keydown', (e) => {
  if (PAN_OWNERS.includes(e.target.tagName)) return;
  if (e.target.isContentEditable) return;
  /* 时间轴自己用上下键拨时段；焦点在它上面时方向键归它，不抢。
     事件也可能派发到 window/document，此时 target 不是 Node，contains 会抛错。 */
  const onRail = e.target === rail
    || (e.target instanceof Node && rail && rail.contains(e.target));
  if (PAN_KEYS.has(e.key) && !onRail) {
    e.preventDefault();
    heldPanKeys.add(e.key);
    return;
  }
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (k === '1' || k === '2' || k === '3') {
    $$('.mood')[Number(k) - 1].click();
  } else if (k === '[') { pushHistory(); setHour(state.hour - 0.5); }
  else if (k === ']') { pushHistory(); setHour(state.hour + 0.5); }
  else if (k === 'r') {
    /* 回默认视角要"立刻到位"，不能让惯性还在继续推，否则按了 R 画面还在滑 */
    orbit.radius = orbitGoal.radius = ORBIT_DEFAULT.radius;
    orbit.theta = orbitGoal.theta = ORBIT_DEFAULT.theta;
    orbit.phi = orbitGoal.phi = ORBIT_DEFAULT.phi;
    orbit.target.set(-0.25, 1.22, -1.15);
    orbit.pan.set(0, 0, 0);
    orbit.panVel.set(0, 0, 0);
    heldPanKeys.clear();
    placeCamera();
    markDirty();
  }
});
/* 松键、切走窗口都要松开，否则视角会一直飘 */
window.addEventListener('keyup', (e) => { heldPanKeys.delete(e.key); });
window.addEventListener('blur', () => heldPanKeys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) heldPanKeys.clear(); });

/* ============================== 13.5 电影级后处理 ============================== */
/* vendor 里只有 three 核心，没有 EffectComposer / UnrealBloomPass。
   这里用 WebGLRenderTarget + ShaderMaterial 手搭一条零依赖管线：
     场景 → 亮部提取 → 两级分离高斯 → 合成（辉光 / 色彩分级 / 暗角 / 胶片颗粒 / 色差）
   目的是把「渲染图」推成「电影画面」：窗外的城市灯、屋里的灯带、模型台里的灯都要发光。
   ?nopost=1 可关闭，用于 A/B 视觉对照与性能兜底。 */
const POST_ON = !location.search.includes('nopost');
const post = (() => {
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (frag, uniforms) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: frag, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false,
  });

  /* 亮部提取：软阈值，避免硬边光晕 */
  const bright = mk(`
    varying vec2 vUv; uniform sampler2D tSrc; uniform float uThreshold; uniform float uSoft;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + uSoft, l), 1.0);
    }`, {
    /* 阈值在线性 HDR 空间取：1.0 只让真正的自发光表面溢出，
       低于 0.6 会把整片窗的城市贴图当光源，窗外会洗成白雾。 */
    tSrc: { value: null }, uThreshold: { value: 1.00 }, uSoft: { value: 0.28 },
  });

  /* 分离式高斯：5 tap，靠双线性采样拿到 9 tap 的质量 */
  const blur = mk(`
    varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uDir;
    void main(){
      vec3 s = texture2D(tSrc, vUv).rgb * 0.227027;
      s += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.316216;
      s += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.070270;
      gl_FragColor = vec4(s, 1.0);
    }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });

  /* 合成：辉光 + 中性分级 + 暗角 + 色差 → sRGB 编码 → 最后才加胶片颗粒。
     颗粒必须在编码之后加：线性空间里 0.01 的抖动经 sRGB 曲线在暗部会被放大成可见噪斑。 */
  const comp = mk(`
    varying vec2 vUv;
    uniform sampler2D tScene, tBloom;
    uniform vec2 uRes;
    uniform float uTime, uBloom, uVignette, uGrain, uCA, uContrast, uExposure;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    /* three 渲染到 RenderTarget 时会跳过 ACES 且输出线性空间，
       所以这里必须自己做一遍 ACES，否则等于把线性 HDR 直接编码 → 整片洗白。
       公式与 three 的 ACESFilmicToneMapping 保持一致。 */
    vec3 rrtOdtFit(vec3 v){
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color){
      const mat3 IN = mat3(
        vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777)
      );
      const mat3 OUT = mat3(
        vec3( 1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276),
        vec3(-0.07367, -0.00605,  1.07602)
      );
      color *= uExposure / 0.6;
      color = IN * color;
      color = rrtOdtFit(color);
      color = OUT * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 lin2srgb(vec3 c){
      c = max(c, vec3(0.0));
      return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
                 step(vec3(0.0031308), c));
    }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uCA * (0.25 + r2);
      vec3 base = vec3(
        texture2D(tScene, vUv + off).r,
        texture2D(tScene, vUv).g,
        texture2D(tScene, vUv - off).b
      );
      vec3 bloom = texture2D(tBloom, vUv).rgb;
      /* 辉光加在线性 HDR 空间，再整体过 ACES：灯光会自然溢出而不是被硬贴上去 */
      vec3 c = base + bloom * uBloom;
      float l = dot(clamp(c, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
      c *= mix(vec3(0.995, 0.998, 1.008), vec3(1.025, 1.006, 0.982), smoothstep(0.15, 0.85, l));
      c *= 1.0 - uVignette * smoothstep(0.10, 0.92, r2 * 1.75);
      c = aces(c);                                       // 线性 HDR → 显示线性
      c = lin2srgb(c);                                   // → sRGB 显示空间
      c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
      float g = hash(vUv * uRes + vec2(uTime * 37.0, uTime * 17.0)) - 0.5;
      c += g * uGrain * (1.0 - 0.45 * l);                // 颗粒放在编码之后
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`, {
    tScene: { value: null }, tBloom: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 }, uBloom: { value: 0.52 }, uVignette: { value: 0.22 },
    uGrain: { value: 0.014 }, uCA: { value: 0.0010 },
    uContrast: { value: 1.05 }, uExposure: { value: 0.98 },
  });

  /* HalfFloat 必需：8 位线性 RT 在暗部只有 2~3 个量化级，
     编码回 sRGB 后会放大成紫蓝色带/噪斑（实测）。 */
  const mkRT = (w, h, depth) => new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: THREE.HalfFloatType,
    depthBuffer: !!depth, stencilBuffer: false,
  });
  let sceneRT = null, brightRT = null, blurA = null, blurB = null;
  let W = 1, H = 1, bw = 1, bh = 1;

  function resize(w, h) {
    const pr = renderer.getPixelRatio();
    W = Math.max(2, Math.floor(w * pr)); H = Math.max(2, Math.floor(h * pr));
    bw = Math.max(2, Math.floor(W / 2)); bh = Math.max(2, Math.floor(H / 2));
    for (const rt of [sceneRT, brightRT, blurA, blurB]) if (rt) rt.dispose();
    sceneRT = mkRT(W, H, true);
    brightRT = mkRT(bw, bh, false);
    blurA = mkRT(bw, bh, false);
    blurB = mkRT(bw, bh, false);
    comp.uniforms.uRes.value.set(W, H);
  }

  function blit(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  function render() {
    if (!sceneRT) resize(window.innerWidth, window.innerHeight);
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);

    bright.uniforms.tSrc.value = sceneRT.texture;
    blit(bright, brightRT);
    blur.uniforms.tSrc.value = brightRT.texture;
    blur.uniforms.uDir.value.set(1.35 / bw, 0); blit(blur, blurA);
    blur.uniforms.tSrc.value = blurA.texture;
    blur.uniforms.uDir.value.set(0, 1.35 / bh); blit(blur, blurB);
    /* 第二级：更大半径，做出「光晕」而不是「模糊的边」 */
    blur.uniforms.tSrc.value = blurB.texture;
    blur.uniforms.uDir.value.set(3.1 / bw, 0); blit(blur, blurA);
    blur.uniforms.tSrc.value = blurA.texture;
    blur.uniforms.uDir.value.set(0, 3.1 / bh); blit(blur, blurB);

    comp.uniforms.tScene.value = sceneRT.texture;
    comp.uniforms.tBloom.value = blurB.texture;
    comp.uniforms.uTime.value = performance.now() * 0.001;
    blit(comp, null);
  }
  return { resize, render, uniforms: comp.uniforms, bright, blur };
})();

/* 统一渲染入口：后处理失败时自动回退到直出，绝不让画面变黑 */
let postFailed = false;
function renderFrame() {
  if (!POST_ON || postFailed) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  try { post.render(); }
  catch (err) { postFailed = true; console.warn('后处理不可用，已回退直出：', err); renderer.setRenderTarget(null); renderer.render(scene, camera); }
}

/* ============================== 14. 尺寸与循环 ============================== */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (POST_ON && !postFailed) post.resize(w, h);
}
window.addEventListener('resize', resize);

let needsRender = true;
function markDirty() { needsRender = true; }

/* 前 30 帧无条件渲染：贴图是运行时画的，头几帧可能在编译着色器、
   也可能被子采样裁到一半，连续画一段能保证首屏是完整的。 */
let warmFrames = 30;
let lastFrameT = 0;
/* 抽成具名函数：setAnimationLoop 与自测走的是同一份生产代码路径。
   无头浏览器 --dump-dom 下 rAF 几乎不推进，自测直接喂时间戳就能确定性地验证。 */
function frameStep(now) {
  if (warmFrames > 0) { warmFrames--; lastFrameT = now; renderFrame(); return; }
  /* dt 上限 0.05 s：切回标签页时不会一次跳很远 */
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameT) / 1000 || 0.016));
  /* 每帧都调 panStep（即便没按键）——松键后速度要在这里衰减到零，才有滑停 */
  const panMoving = panStep(heldPanKeys, dt);
  const orbitMoving = dampOrbit(dt);
  if (panMoving || orbitMoving) { placeCamera(); needsRender = true; }
  lastFrameT = now;
  if (!needsRender) return;
  needsRender = false;
  renderFrame();
}
renderer.setAnimationLoop(frameStep);

/* 交互后手动标脏 */
['pointermove', 'pointerdown', 'pointerup', 'wheel'].forEach((ev) =>
  canvasEl.addEventListener(ev, markDirty, { passive: true }));
window.addEventListener('resize', markDirty);
rail.addEventListener('pointermove', markDirty);
document.addEventListener('pointermove', markDirty);

/* ============================== 15. 启动 ============================== */
applyStateMats();
for (const p of initialPieces) placePiece(...p);
paintSlots();
refreshCards();

const hashMatch = location.hash.match(/#r=(.+)$/);
if (hashMatch) decodeState(hashMatch[1]);
else if (location.hash.startsWith('#m=')) {
  const key = location.hash.slice(3);
  if (PRESETS[key]) {
    state.mats = JSON.parse(JSON.stringify(PRESETS[key].mats));
    applyStateMats();
    setHour(PRESETS[key].hour, true);
  }
}

/* 深链：?tab=furniture 之类直接打开某个抽屉 */
{
  const want = new URLSearchParams(location.search).get('tab');
  if (want && ['wood', 'stone', 'fabric', 'paint', 'furniture'].includes(want)) {
    tab = want;
    for (const o of $$('#tabs button')) {
      o.classList.toggle('on', o.dataset.t === tab);
      o.setAttribute('aria-selected', o.dataset.t === tab ? 'true' : 'false');
    }
  }
}

setHour(state.hour, true);
paintSlots();
refreshCards();
updateMood();
pushHistory();
markDirty();

/* 调试：?snap=1 让页面自己把画面 POST 回来（无头截图拿不到新帧时的兜底） */
if (location.search.includes('snap')) {
  setTimeout(() => {
    renderFrame();
    const data = canvasEl.toDataURL('image/png');
    fetch('/shot', { method: 'POST', body: data })
      .then(() => { document.title = 'SNAP ok'; })
      .catch(() => { document.title = 'SNAP fail'; });
  }, 900);
}

/* 调试：?selftest=1 跑一遍关键路径，结果写进标题 */
if (location.search.includes('selftest')) {
  renderer.render(scene, camera);          // 让相机与物体的矩阵先更新，拾取才准
  const log = [];
  const step = (name, fn) => {
    try { const r = fn(); log.push(`${name}=${r === undefined ? 'ok' : r}`); }
    catch (err) { log.push(`${name}=ERR(${err.message})`); }
  };
  const pev = (type, x, y) => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true });
  const cardOf = (tabName, id) => {
    document.querySelector(`#tabs button[data-t="${tabName}"]`).click();
    return [...document.querySelectorAll('#cards .card')].find((b) => b.dataset.id === id);
  };
  step('applyStoneFloor', () => { applyMat('floor', 'stone', 'marble'); return state.mats.floor.join('/'); });
  step('blockWrongCat', () => {
    const before = state.mats.floor.join('/');
    applyToSurface('floor', 'fabric', 'linen');
    return before === state.mats.floor.join('/') ? 'blocked' : 'LEAK';
  });
  step('placeAndUndo', () => {
    pushHistory();
    placePiece('chair', 0, 0, 0);
    const n1 = PIECES.children.length;
    pushHistory();
    undo();
    return PIECES.children.length === n1 - 1 ? 'ok' : 'FAIL';
  });
  step('redo', () => {
    const n0 = PIECES.children.length;
    redo();
    return PIECES.children.length === n0 + 1 ? 'ok' : 'FAIL';
  });
  step('encodeDecode', () => {
    const code = encodeState();
    const n0 = PIECES.children.length;
    const done = decodeState(code);
    return done && PIECES.children.length === n0 ? `ok(${code.length})` : 'FAIL';
  });
  step('moodNumbers', () => [...document.querySelectorAll('.meter .row b')].map((b) => b.textContent).join(','));
  step('clock', () => document.querySelector('#clock-time').textContent);
  /* 窗外城市：设计师指定的实拍夜景，夜/昼两张贴图来自同一张照片，
     并对齐到落地窗的可见 UV 区（不能只剩中段或把楼拉变形）。 */
  step('cityPhoto', () => {
    const n = viewTex.night, d = viewTex.day, k = viewTex.dusk;
    const ok = n && d && k && n !== d && n !== k && d !== k
      && n.image && d.image && k.image
      && n.image.width === 1080 && n.image.height === 470
      && n.repeat.x > 1 && n.repeat.y > 1      // 可见窗口重映射生效
      && Math.abs(n.repeat.x - d.repeat.x) < 1e-9
      && Math.abs(n.repeat.x - k.repeat.x) < 1e-9
      && CITY_PHOTO_URL.startsWith('data:image/jpeg;base64,')
      && CITY_PHOTO_URL.length > 100000;        // 单文件版必须内联，不能外链
    return ok ? `ok(3档 ${n.image.width}x${n.image.height},uv=${n.repeat.x.toFixed(2)}/${n.repeat.y.toFixed(2)},inline)`
      : 'FAIL';
  });
  /* 阴影方向：太阳必须在窗外（z < winZ），光才可能照进屋。
     之前算 azim 时用了 +cos，正午太阳落在 z=+6.9（相机背后），
     室内只剩补光、桌下没有影子，肉眼看只是"有点平"，很难定位。
     用断言把几何关系钉死，再去测三个时刻。 */
  step('sunThroughWindow', () => {
    const sc = sun.shadow.camera;
    const camOK = sc.far >= 40 && sc.right >= 10 && sun.shadow.mapSize.x >= 2048;
    const wallsCast = scene.children.filter((o) => o.isMesh
      && o.geometry && o.geometry.type === 'PlaneGeometry'
      && Math.abs(Math.abs(o.position.x) - APT.halfW) < 0.01).every((o) => o.castShadow);
    const samples = [8, 12.4, 17, 22];
    let allOutside = true;
    for (const h of samples) {
      setHour(h);
      /* 方向灯的位置决定光从哪来：z 必须小于窗面 */
      if (sun.position.z >= INTERIOR.winZ) allOutside = false;
    }
    setHour(20.7);
    const ok = camOK && allOutside && wallsCast && INTERIOR.winZ < 0;
    return ok ? `ok(太阳在窗外z<${INTERIOR.winZ},shadow far=${sc.far},墙投影=${wallsCast})`
      : `FAIL(cam=${camOK},outside=${allOutside},walls=${wallsCast})`;
  });
  /* 挂画：月夜图必须内联（单文件可双击打开），画框比例要和图片一致。
     图片异步加载，若 src 写错会留一块空画布，所以也查贴图已经有内容。 */
  step('moonArt', () => {
    const ok = MOON_ART_URL.startsWith('data:image/jpeg;base64,')
      && MOON_ART_URL.length > 50000;
    let framed = false;
    scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry'
          && Math.abs(o.geometry.parameters.width - 0.65) < 1e-6
          && Math.abs(o.geometry.parameters.height - 1.42) < 1e-6) {
        const m = o.material;
        framed = !!(m && m.map && m.map.image && m.map.image.width === 484);
      }
    });
    /* 0.65/1.42=0.4577，图片 484/1036=0.467，误差 <2% 即不拉伸 */
    const ratioOK = Math.abs((0.65 / 1.42) / (484 / 1036) - 1) < 0.03;
    return ok && framed && ratioOK ? 'ok(内联月夜图 484x1036,画框比例吻合)'
      : `FAIL(inline=${ok},framed=${framed},ratio=${ratioOK})`;
  });
  /* 署名铭牌：两块都在场、坐标在场景内、链接正确、能被射线拾取到。
     拾取必须在屏幕上的实际位置试，不能拿世界坐标冒充。 */
  step('signPlates', () => {
    if (LINK_SPOTS.length !== 2) return `FAIL(count=${LINK_SPOTS.length})`;
    const urls = LINK_SPOTS.map((s) => s.url).sort().join('|');
    const want = 'https://github.com/karlmoriaty|https://x.com/karlmoriaty';
    if (urls !== want) return `FAIL(urls=${urls})`;
    /* 逐一投影到屏幕，再在该像素上做射线拾取，确认点得到自己 */
    const hitOk = LINK_SPOTS.every((s) => {
      const p = s.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      const cx = (p.x * 0.5 + 0.5) * window.innerWidth;
      const cy = (-p.y * 0.5 + 0.5) * window.innerHeight;
      if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return false;
      const got = pickLink({ clientX: cx, clientY: cy });
      return got && got.mesh === s.mesh;
    });
    return hitOk ? 'ok(2 plates, clickable, urls)' : 'FAIL(pick or offscreen)';
  });
  /* 电影级后处理：必须先跑一次 renderFrame()，uniform 才会绑定到 RT。
     检查链路接通、RT 已建、参数有效、失败能回退。 */
  step('postPipeline', () => {
    renderFrame();                       // 自测开头只做了直出，这里先接通管线
    const u = post.uniforms;
    const ok = POST_ON && !postFailed
      && u.tScene.value !== null && u.tBloom.value !== null
      && u.uBloom.value > 0 && u.uExposure.value > 0
      && post.bright.uniforms.uThreshold.value > 0;
    return ok ? `ok(bloom=${u.uBloom.value},th=${post.bright.uniforms.uThreshold.value})`
      : `FAIL(on=${POST_ON},failed=${postFailed})`;
  });
  /* 房间体积：上一轮要求扩到原来的 2~3 倍且层高提高，写成可复验断言 */
  step('roomVolume', () => {
    const w = APT.halfW * 2, d = APT.frontZ - APT.backZ, h = APT.ceilY;
    const volume = w * d * h;
    const ratio = volume / (8.0 * 7.1 * 3.05);
    const ok = ratio >= 2 && ratio <= 3 && h > 3.05;
    return ok ? `ok(${w.toFixed(1)}x${d.toFixed(1)}x${h.toFixed(2)}=${volume.toFixed(0)}m3,${ratio.toFixed(2)}x)`
      : `FAIL(${volume.toFixed(0)}m3,${ratio.toFixed(2)}x)`;
  });
  step('cards', () => document.querySelectorAll('#cards .card').length);
  step('slots', () => document.querySelectorAll('#slots .slot').length);
  step('thumbs', () => { const t = buildThumbs(); return `${Object.keys(t).length}/${FURNITURE.length}`; });
  step('pickSofa', () => {
    renderer.render(scene, camera);          // 保证矩阵是最新的（自测在首帧之前跑）
    const sofa = PIECES.children.find((g) => g.userData.piece && g.userData.piece.type === 'sofa');
    if (!sofa) return 'NOSOFA';
    /* sofa.position 是一层的局部坐标；模型台被缩放并抬到桌上，
       必须先转成世界坐标再投影，否则算出来的屏幕点落在空处 */
    const v = sofa.localToWorld(new THREE.Vector3(0, 0.45, 0)).project(camera);
    const hit = pickPiece({ clientX: (v.x * 0.5 + 0.5) * window.innerWidth, clientY: (-v.y * 0.5 + 0.5) * window.innerHeight });
    return hit ? hit.group.userData.piece.type : `MISS(ndc=${v.x.toFixed(2)},${v.y.toFixed(2)})`;
  });
  step('clampPiece', () => {
    const g = placeAt('bench', 99, -99, 0);
    return g ? `${g.position.x.toFixed(1)},${g.position.z.toFixed(1)}` : 'FAIL';
  });
  step('dragFurnitureCat', () => {
    const before = PIECES.children.length;
    const g = placeAt('bench', 1.2, 0.6, 0);
    return `${PIECES.children.length - before}@${g.position.x.toFixed(1)},${g.position.z.toFixed(1)}`;
  });
  step('rejectFurnitureOnFloor', () => {
    const before = state.mats.floor.join('/');
    applyToSurface('floor', 'furniture', 'sofa');
    return before === state.mats.floor.join('/') ? 'blocked' : 'LEAK';
  });
  /* 端到端：真的派发一次「从抽屉拖家具进屋」的指针序列 */
  step('e2eDragBench', () => {
    const card = cardOf('furniture', 'bench');
    if (!card) return 'NOCARD';
    const r = card.getBoundingClientRect();
    const before = PIECES.children.length;
    const tx = Math.round(window.innerWidth * 0.52);
    const ty = Math.round(window.innerHeight * 0.36);
    card.dispatchEvent(pev('pointerdown', r.left + 20, r.top + 20));
    card.dispatchEvent(pev('pointermove', tx, ty));
    card.dispatchEvent(pev('pointerup', tx, ty));
    const added = PIECES.children.length - before;
    return added === 1 ? 'ok' : `FAIL(+${added})`;
  });
  /* 端到端：点选一个面，再点一块涂料 */
  step('e2eClickPaint', () => {
    selectSurface('wallBack');
    const card = cardOf('paint', 'sage');
    if (!card) return 'NOCARD';
    const r = card.getBoundingClientRect();
    card.dispatchEvent(pev('pointerdown', r.left + 20, r.top + 20));
    card.dispatchEvent(pev('pointerup', r.left + 20, r.top + 20));
    return state.mats.wallBack.join('/');
  });
  /* 视角操作：范围夹取、按住/松开、时间轴不抢键、R 归零、阻尼手感 */
  const kev = (type, key, target) => (target || window).dispatchEvent(
    new KeyboardEvent(type, { key, bubbles: true, cancelable: true }),
  );
  const resetCam = () => {
    heldPanKeys.clear();
    orbit.pan.set(0, 0, 0);
    orbit.panVel.set(0, 0, 0);
    orbit.radius = orbitGoal.radius = ORBIT_DEFAULT.radius;
    orbit.theta = orbitGoal.theta = ORBIT_DEFAULT.theta;
    orbit.phi = orbitGoal.phi = ORBIT_DEFAULT.phi;
    placeCamera();
  };
  step('panClamp', () => {
    resetCam();
    const keys = new Set(['ArrowLeft', 'ArrowUp']);
    for (let i = 0; i < 600; i++) panStep(keys, 0.05);
    const ok = Math.abs(orbit.pan.x) <= PAN_LIMIT.x + 1e-6
      && Math.abs(orbit.pan.z) <= PAN_LIMIT.z + 1e-6
      && Math.abs(orbit.pan.y - PAN_LIMIT.y) < 1e-6;
    const wallVel = orbit.panVel.length() < 1e-6;   // 撞墙后不该还在推
    resetCam();
    return ok && wallVel ? `${PAN_LIMIT.x.toFixed(2)},${PAN_LIMIT.y.toFixed(2)}` : `LEAK(v=${orbit.panVel.length().toFixed(3)})`;
  });
  step('panKeyHoldRelease', () => {
    heldPanKeys.clear();
    kev('keydown', 'ArrowRight');
    const held = heldPanKeys.has('ArrowRight');
    kev('keyup', 'ArrowRight');
    return held && !heldPanKeys.has('ArrowRight') ? 'ok' : 'FAIL';
  });
  step('panRailKeepsKeys', () => {
    heldPanKeys.clear();
    kev('keydown', 'ArrowUp', rail);
    const notStolen = !heldPanKeys.has('ArrowUp');
    heldPanKeys.clear();
    return notStolen ? 'ok' : 'STOLEN';
  });
  step('panResetByR', () => {
    orbit.pan.set(0.4, 0.2, -0.3);
    kev('keydown', 'r');
    const ok = orbit.pan.length() === 0;
    placeCamera();
    return ok ? 'ok' : 'FAIL';
  });
  /* 手感：起步有一点柔和（不阶跃），但松键必须"停得住"——滑行 < 3 cm、20 帧内静止 */
  step('panEaseInOut', () => {
    resetCam();
    heldPanKeys.add('ArrowRight');
    const p0 = orbit.pan.clone();
    panStep(heldPanKeys, 0.016);
    const firstStep = orbit.pan.distanceTo(p0);
    const pSteady = orbit.pan.clone();
    for (let i = 0; i < 40; i++) panStep(heldPanKeys, 0.016);
    const steadyStep = orbit.pan.distanceTo(pSteady) / 40;
    heldPanKeys.clear();
    const pRelease = orbit.pan.clone();
    let framesToStop = 0, stopped = false;
    for (let i = 0; i < 240; i++) {
      if (!panStep(heldPanKeys, 0.016)) { stopped = true; framesToStop = i; break; }
    }
    const glide = orbit.pan.distanceTo(pRelease);
    resetCam();
    const easing = firstStep < steadyStep * 0.5;
    /* 阈值 0.04 m：PAN_STOP_LAMBDA 34 实测滑行 0.035 m、11 帧静止。
       这是"停得住"的量级（3.5 cm），对比改前的 0.18 m / 49 帧。 */
    const stops = glide < 0.04 && stopped && framesToStop < 20;
    return easing && stops
      ? `ok(${firstStep.toFixed(4)}<${steadyStep.toFixed(4)},glide=${glide.toFixed(3)},${framesToStop}f)`
      : `FAIL(first=${firstStep.toFixed(4)},steady=${steadyStep.toFixed(4)},glide=${glide.toFixed(3)},stop=${stopped},${framesToStop}f)`;
  });
  /* 拖拽即时跟手：当前角度与目标零滞后，且没有惯性状态能让松手后继续滑。
     用不变量验证而非派发合成 pointer —— 后者会触发拾取与历史栈，在自测上下文里会挂住页面。
     真实事件序列由临时验证页单独覆盖（thetaDelta120px / camMovesAfterRelease）。 */
  step('dragIsImmediate', () => {
    resetCam();
    const th0 = orbit.theta;
    orbit.theta = orbitGoal.theta = clamp(th0 - 120 * 0.0026, ...THETA_RANGE);
    placeCamera();
    const lag = Math.abs(orbit.theta - orbitGoal.theta);
    const delta = Math.abs(orbit.theta - th0);
    const c0 = camera.position.clone();
    for (let i = 0; i < 60; i++) { dampOrbit(0.016); placeCamera(); }
    const drift = camera.position.distanceTo(c0);
    resetCam();
    return lag < 1e-9 && delta > 0.05 && drift < 1e-9
      ? `ok(${delta.toFixed(3)}rad,lag=${lag.toFixed(6)},drift=${drift.toFixed(6)})`
      : `FAIL(delta=${delta.toFixed(3)},lag=${lag.toFixed(6)},drift=${drift.toFixed(6)})`;
  });
  /* 编辑器关键：转视角后立刻点面，拾取必须跟着新的相机矩阵走。
     用纯投影 + 已有 pickSofa 覆盖，不在这里派发 pointerdown ——
     合成 pointerdown 会触发 setPointerCapture / pushHistory，在自测上下文里会挂住页面。 */
  step('pickAfterRotate', () => {
    resetCam();
    const proj = (v) => {
      const p = v.clone().project(camera);
      return [(p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight];
    };
    const pt = new THREE.Vector3(0, 0.01, 0);
    const [x0, y0] = proj(MODEL.localToWorld(pt.clone()));
    const before = pickSurface({ clientX: x0, clientY: y0 });
    orbit.theta = orbitGoal.theta = ORBIT_DEFAULT.theta + 0.3;
    placeCamera();
    const [x1, y1] = proj(MODEL.localToWorld(pt.clone()));
    const after = pickSurface({ clientX: x1, clientY: y1 });
    const shifted = Math.hypot(x1 - x0, y1 - y0);
    resetCam();
    return before && after && before.key === after.key && shifted > 20
      ? `ok(${before.key},${shifted.toFixed(0)}px)` : `FAIL(${before && before.key}/${after && after.key},${shifted.toFixed(0)}px)`;
  });
  /* 链路：按住键 → 逐帧推进 → 相机位置真的变了 */
  step('panMovesCamera', () => {
    resetCam();
    const before = camera.position.clone();
    kev('keydown', 'ArrowRight');
    for (let i = 0; i < 20; i++) panStep(heldPanKeys, 0.016);
    placeCamera();
    const moved = camera.position.distanceTo(before) > 0.02;
    kev('keyup', 'ArrowRight');
    resetCam();
    return moved ? 'ok' : 'FAIL';
  });
  /* 生产帧循环验证：直接喂时间戳给 frameStep（与 setAnimationLoop 同一个函数），
     确认按住键相机真的动、松键后很快静止、最后零漂移。
     不依赖无头浏览器的 rAF：--dump-dom 下 rAF 几乎不推进，那样测出来的是环境假象。 */
  step('panFrameLoop', () => {
    for (let i = 0; i < 31; i++) frameStep(i * 16.7);   // 跑完暖机帧
    resetCam();
    const before = camera.position.clone();
    kev('keydown', 'ArrowLeft');
    let t = 31 * 16.7;
    for (let i = 0; i < 24; i++) { t += 16.7; frameStep(t); }
    const moved = camera.position.distanceTo(before);
    kev('keyup', 'ArrowLeft');
    for (let i = 0; i < 120; i++) { t += 16.7; frameStep(t); }
    const settled = camera.position.clone();
    for (let i = 0; i < 20; i++) { t += 16.7; frameStep(t); }
    const drift = camera.position.distanceTo(settled);
    resetCam();
    return moved > 0.02 && drift < 1e-6
      ? `ok(${moved.toFixed(2)}m,drift=${drift.toFixed(6)})`
      : `FAIL(moved=${moved.toFixed(3)},drift=${drift.toFixed(6)})`;
  });
  /* 只有滚轮半径走阻尼（它不参与拾取）；theta/phi 必须始终同步 */
  step('wheelDampingOnly', () => {
    resetCam();
    orbitGoal.radius = 4.2;
    const k1 = dampOrbit(0.016);
    const lagging = orbit.radius > 4.2 && orbit.radius < ORBIT_DEFAULT.radius;
    const anglesSync = orbit.theta === orbitGoal.theta && orbit.phi === orbitGoal.phi;
    for (let i = 0; i < 200; i++) dampOrbit(0.016);
    const converged = Math.abs(orbit.radius - 4.2) < 1e-3;
    resetCam();
    return k1 && lagging && anglesSync && converged ? 'ok' : 'FAIL';
  });
  document.title = 'SELFTEST ' + log.join(' | ');
}

/* 调试探针：?probe=1 时暴露拾取函数，用来定位画面上的可疑对象（只读，不改状态） */
if (location.search.includes('probe')) {
  window.__scene = scene;
  window.__cam = camera;
  window.__THREE = THREE;
  window.__cityWeights = cityWeights;
  window.__cityOverlay = cityOverlay;
  window.__state = state;
  window.__LINK_SPOTS = LINK_SPOTS;
  window.__lights = { sun, hemi, bounce, windowFill, rimCool, duskSpill, renderer, scene };
  window.__viewTex = viewTex;
  window.__probe = (cx, cy) => {
    const ndc = new THREE.Vector2(
      (cx / window.innerWidth) * 2 - 1,
      -(cy / window.innerHeight) * 2 + 1,
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, camera);
    const hits = rc.intersectObjects(scene.children, true);
    return hits.slice(0, 5).map((h) => {
      const o = h.object;
      const g = o.geometry;
      return {
        dist: +h.distance.toFixed(2),
        point: [h.point.x, h.point.y, h.point.z].map((v) => +v.toFixed(2)),
        type: g ? g.type : '?',
        mat: o.material ? (Array.isArray(o.material) ? 'multi' : o.material.type) : '?',
        pos: [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(2)),
        scale: +o.scale.x.toFixed(2),
        name: o.name || '',
        blend: o.material && !Array.isArray(o.material) ? o.material.blending : null,
        opacity: o.material && !Array.isArray(o.material) ? +o.material.opacity.toFixed(2) : null,
      };
    });
  };
}
