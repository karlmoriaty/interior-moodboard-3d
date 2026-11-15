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
sun.shadow.mapSize.set(2048, 2048);
/* 阴影正交范围要盖住整间房：11.2 m 宽、10 m 深，±6 会在边角漏光 */
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 20;
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
aptGlowMats.push(aptWallSideMat);
for (const sx of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(aptDepth, aptSideH), aptWallSideMat);
  wall.position.set(sx * APT.halfW, aptSideH / 2, (APT.frontZ + APT.backZ) / 2);
  wall.rotation.y = -sx * Math.PI / 2;      // 法线朝房间内侧
  wall.receiveShadow = true;
  scene.add(wall);
  /* 踢脚：高 0.09 的一道深色细边，墙才落在地上 */
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.09, aptDepth), aptTrimMat);
  skirt.position.set(sx * (APT.halfW - 0.012), 0.045, (APT.frontZ + APT.backZ) / 2);
  scene.add(skirt);
}

/* 天花：朝下的单面材质——相机在室内时它是天花，升到顶上时被背面剔除，
   露出剖切面。深色平顶，是深色现代空间的一半底色。 */
const aptCeilMat = new THREE.MeshStandardMaterial({
  color: 0x24252a, roughness: 0.97, metalness: 0,
  /* 朝下的单面收不到太阳直射，白天完全靠自发光显形；
     底色太暗（0x121317）的话，intensity 再高也是一整片纯黑。 */
  emissive: 0x313339, emissiveIntensity: 0.8, side: THREE.FrontSide,
});
const aptCeil = new THREE.Mesh(new THREE.PlaneGeometry(APT.halfW * 2, aptDepth), aptCeilMat);
aptCeil.rotation.x = Math.PI / 2;          // 法线朝下
aptCeil.position.set(0, APT.ceilY, (APT.frontZ + APT.backZ) / 2);
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
  const night = mkTex(), day = mkTex();

  /* data URI 解码是异步的：先挂空纹理保证初始化与 setHour 的同步流程不中断，
     图片就绪后画进画布、标 needsUpdate，再标脏重绘。 */
  const hooks = [];
  const img = new Image();
  img.onload = () => {
    night.ctx.drawImage(img, 0, 0, PHOTO_W, PHOTO_H);
    night.tex.needsUpdate = true;

    /* 白天版从同一张照片派生：楼体轮廓逐像素一致，只是天亮了。
       若白天换回程序化城市，拉时间轴会整座城突变，那是最糟的观感。 */
    const g = day.ctx;
    g.filter = 'brightness(1.62) saturate(0.30) contrast(0.90)';
    g.drawImage(img, 0, 0, PHOTO_W, PHOTO_H);
    g.filter = 'none';
    const wash = g.createLinearGradient(0, 0, 0, PHOTO_H);
    wash.addColorStop(0, 'rgba(150,184,218,.62)');
    wash.addColorStop(0.52, 'rgba(188,206,222,.36)');
    wash.addColorStop(1, 'rgba(176,190,206,.20)');
    g.fillStyle = wash;
    g.fillRect(0, 0, PHOTO_W, PHOTO_H);
    day.tex.needsUpdate = true;
    /* 地面倒影也依赖这张图：图片就绪后通知外面重画 */
    for (const h of hooks) h(img);
    markDirty();
  };
  img.src = CITY_PHOTO_URL;

  return { night: night.tex, day: day.tex, hooks };
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

/* 左墙上一幅画：让空墙有个落点 */
{
  const poster = document.createElement('canvas');
  poster.width = poster.height = 256;
  const pg = poster.getContext('2d');
  pg.fillStyle = '#efe6d6'; pg.fillRect(0, 0, 256, 256);
  pg.fillStyle = '#8c9ba3'; pg.beginPath(); pg.arc(96, 118, 62, 0, 7); pg.fill();
  pg.fillStyle = '#c0704f'; pg.fillRect(140, 152, 84, 74);
  pg.fillStyle = '#2f2a24'; pg.fillRect(0, 208, 256, 6);
  const posterTex = new THREE.CanvasTexture(poster);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  const artFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 1.2), frameMat);
  artFrame.position.set(X0 + 0.045, 1.86, 1.35);
  artFrame.castShadow = true;
  room.add(artFrame);
  const artCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.76),
    new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.92 }),
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

function setHour(h, silent) {
  state.hour = clamp(h, 6, 23);
  const hour = state.hour;
  const t = (hour - 6) / 17;                       // 0 清晨 → 1 深夜（时间轴位置）
  const dayT = clamp((hour - 6.2) / 13.4, 0, 1);   // 6:12 日出 → 19:36 日落
  const arc = Math.sin(dayT * Math.PI);            // 太阳高度因子

  const elev = 3 + arc * 64;
  const azim = lerp(-0.95, 0.95, dayT);
  const R = 16;
  const rad = (elev * Math.PI) / 180;
  const horiz = Math.cos(rad) * R;
  sun.position.set(
    -Math.sin(azim) * horiz,
    Math.sin(rad) * R + 1.4,
    Math.cos(azim) * horiz * 0.85 + 1.5,
  );
  sun.target.position.set(0, 0.8, 0);

  /* 天光强度按钟点走：日出后一小时到满，18:00 之后开始往下掉，20:12 归零 */
  const dayF = hour < 7.5 ? smooth(clamp((hour - 6) / 1.5, 0, 1))
    : hour < 18 ? 1
    : 1 - smooth(clamp((hour - 18) / 2.2, 0, 1));

  const warmK = clamp(1 - elev / 58, 0, 1) * clamp(dayF + 0.15, 0, 1);

  const cDay = new THREE.Color(0xfff4e6);
  const cGold = new THREE.Color(0xff9a4e);
  const cMoon = new THREE.Color(0x93a9de);
  const c = new THREE.Color().copy(cDay).lerp(cGold, warmK);
  if (dayF < 0.06) c.lerp(cMoon, 1 - dayF / 0.06);
  sun.color.copy(c);
  sun.intensity = dayF < 0.06 ? 0.10 : lerp(0.18, 1.55, dayF);

  hemi.intensity = lerp(0.09, 0.28, dayF);
  hemi.color.set(dayF > 0.3 ? 0xdfe9ff : 0x8294bb);
  hemi.groundColor.set(dayF > 0.3 ? 0x6d5844 : 0x302a23);

  bounce.intensity = lerp(0.03, 0.24, dayF);

  /* 场景级的那几盏原本是常量，无论几点都把屋子均匀洗白——夜里没有暗部，
     就谈不上氛围。现在全部跟着天光收放：白天由太阳主导，天黑后交给屋里的灯。 */
  scene.environmentIntensity = lerp(0.055, 0.30, dayF);
  windowFill.intensity = lerp(0.42, 0.32, dayF);   // 夜里窗外城市更亮，冷补光反而要略强
  rimCool.intensity = lerp(0.18, 0.55, dayF);
  rimWarm.intensity = lerp(0.12, 0.32, dayF);
  spill.material.opacity = lerp(0.22, 0.16, dayF);

  /* 城市贴图按天光切：白天用白昼版，窗不再亮着灯，室内外光线才对得上 */
  const isNight = dayF < 0.5;
  for (const m of [cityFar, cityMid, cityNear, cityView]) {
    const pair = m.userData.cityTex;
    const tex = isNight ? pair.night : pair.day;
    if (m.material.map !== tex) { m.material.map = tex; m.material.needsUpdate = true; }
  }
  skyCard.material.map = (hour >= 17.2 || hour < 7.2) ? roomViewTex.night : roomViewTex.day;
  /* 夜里窗后是房间的暖光，白天是漫射天光；都只是二层，不是城市 */
  skyCard.material.needsUpdate = true;
  scene.background.set(isNight ? 0x0a0e16 : 0x9aa9bc);
  scene.fog.color.set(isNight ? 0x141b28 : 0xa8b6c6);
  scene.fog.density = isNight ? 0.0055 : 0.0022;
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
  const s = pickSurface(e);
  highlight(s ? s.key : null);
  canvasEl.style.cursor = s ? 'pointer' : 'grab';
});

function endDrag(e) {
  if (mode === 'orbit' && !dragInfo.moved) {
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
    const n = viewTex.night, d = viewTex.day;
    const ok = n && d && n !== d && n.image && d.image
      && n.image.width === 1080 && n.image.height === 470
      && n.repeat.x > 1 && n.repeat.y > 1      // 可见窗口重映射生效
      && Math.abs(n.repeat.x - d.repeat.x) < 1e-9
      && CITY_PHOTO_URL.startsWith('data:image/jpeg;base64,')
      && CITY_PHOTO_URL.length > 100000;        // 单文件版必须内联，不能外链
    return ok ? `ok(${n.image.width}x${n.image.height},uv=${n.repeat.x.toFixed(2)}/${n.repeat.y.toFixed(2)},inline)`
      : 'FAIL';
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
