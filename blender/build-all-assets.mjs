// 统一打包：两批家具目录合并成一份 furniture-assets.js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIRS = [
  'D:/work_future/fucking/work10000/.tmp/furniture/',
  'D:/work_future/fucking/work10000/.tmp/furniture2/',
];
const OUT = 'D:/work_future/fucking/work10000/moodroom/furniture-assets.js';

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function glb(file) {
  const buf = readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(d.toString());
    if (type === 0x004e4942) bin = d;
    off += 8 + len;
  }
  const read = (idx) => {
    const a = json.accessors[idx], bv = json.bufferViews[a.bufferView];
    const [C] = COMP[a.componentType];
    const elemBytes = C.BYTES_PER_ELEMENT * NUM[a.type];
    const start = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const want = a.count * NUM[a.type] * C.BYTES_PER_ELEMENT;
    /* GLB 的 BIN chunk 尾部按 4 字节对齐补 padding，
       直接 new C(buffer, offset, count) 会在最后一段读越界 2~3 字节。
       先按「实际可用字节」截断复制，再构造 typed array。 */
    const avail = Math.max(0, bin.buffer.byteLength - start);
    const bytes = new Uint8Array(bin.buffer, start, Math.min(want, avail));
    return new C(bytes.slice().buffer, 0, Math.floor(bytes.byteLength / C.BYTES_PER_ELEMENT));
  };
  const p = json.meshes[0].primitives[0];
  const rawCol = read(p.attributes.COLOR_0);
  const ca = json.accessors[p.attributes.COLOR_0];
  const vCount = json.accessors[p.attributes.POSITION].count;
  /* 颜色必须归一化成 RGB 三分量再写：
     1) Blender 可能导出 VEC4（RGBA），按 3 步进读会整体错位 → 彩虹色
     2) componentType 可能是 5123（u16, 0~65535），直接塞 Uint8 会截断
     统一走「按顶点、按通道归一化到 0~255」。 */
  const comps = Math.round(rawCol.length / vCount);
  const col = new Uint8Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    for (let k = 0; k < 3; k++) {
      const v = rawCol[i * comps + k];
      let b8;
      if (ca.componentType === 5126) b8 = Math.round(Math.min(1, Math.max(0, v)) * 255);
      else if (ca.componentType === 5123) b8 = Math.round(Math.min(1, v / 65535) * 255);
      else b8 = v;
      col[i * 3 + k] = b8;
    }
  }
  const rawUV = p.attributes.TEXCOORD_0 !== undefined ? read(p.attributes.TEXCOORD_0) : null;
  const uv = new Uint16Array(rawUV ? rawUV.length : vCount * 2);
  if (rawUV) {
    const ua = json.accessors[p.attributes.TEXCOORD_0];
    const scale = ua.componentType === 5126 ? 65535 : 1;
    for (let i = 0; i < rawUV.length; i++) uv[i] = Math.round(Math.min(1, Math.max(0, rawUV[i])) * scale);
  }
  return { pos: read(p.attributes.POSITION), col, uv, idx: read(p.indices) };
}

/* 收集所有资产：先扫目录里的 glb 名，按名字排序保证稳定 */
const names = [];
const files = {};
for (const d of DIRS) {
  if (!existsSync(d)) continue;
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.glb')) continue;
    const n = f.replace('.glb', '');
    if (!files[n]) { files[n] = d + f; names.push(n); }
  }
}
names.sort();

const assets = names.map(n => glb(files[n]));
const totalV = assets.reduce((a, x) => a + x.pos.length / 3, 0);
const totalI = assets.reduce((a, x) => a + x.idx.length, 0);
const HEADER = 12 * assets.length;
const buf = Buffer.alloc(HEADER + totalV * 20 + totalI * 2);
let o = 0;
for (const a of assets) {
  buf.writeUInt32LE(a.pos.length / 3, o); o += 4;
  buf.writeUInt32LE(a.idx.length, o); o += 4;
  buf.writeUInt32LE(a.uv.length > 0 ? 1 : 0, o); o += 4;
}
for (const a of assets) for (const v of a.pos) { buf.writeFloatLE(v, o); o += 4; }
for (const a of assets) {
  /* 必须按顶点数循环，不能按 col.length 步进 3 ——
     某些资产的 col 是 RGBA（4 分量/顶点），按 3 步进会多写约 1/3 字节，
     最终把索引段挤出 buffer（报 offset out of range）。 */
  const nv = a.pos.length / 3;
  for (let i = 0; i < nv; i++) {
    buf.writeUInt8(a.col[i * 3], o); o += 1;
    buf.writeUInt8(a.col[i * 3 + 1], o); o += 1;
    buf.writeUInt8(a.col[i * 3 + 2], o); o += 1;
    buf.writeUInt8(255, o); o += 1;
  }
}
for (const a of assets) for (const v of a.uv) { buf.writeUInt16LE(v, o); o += 2; }
for (const a of assets) for (const v of a.idx) { buf.writeUInt16LE(v, o); o += 2; }

const js = `/* Blender 生成的精细家具资产：pos(f32) + color(u8) + uv(u16) + idx(u16)
   建模走细分曲面 + 倒角 + 布料位移，AO 烘焙进顶点色。
   清单：${names.join(' / ')} */
export const FURNITURE_ASSETS = {
  names: ${JSON.stringify(names)},
  data: '${buf.toString('base64')}',
};
`;
writeFileSync(OUT, js, 'utf8');
console.log('furniture-assets.js', (js.length / 1024).toFixed(0), 'KB |',
  names.length, '件 |', totalV, '顶点',
  '\n', names.map((n, i) => n + ':' + (assets[i].pos.length / 3)).join(' '));
