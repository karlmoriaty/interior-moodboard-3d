// 新床单独打包：pos(f32×3) + col(u8×4) + idx(u16)，与家具管线同构但独立
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'D:/work_future/fucking/work10000/.tmp/furniture2/bed.glb';
const OUT = 'D:/work_future/fucking/work10000/moodroom/bed-v2-assets.js';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const buf = readFileSync(SRC);
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), t = buf.readUInt32LE(off + 4);
  const d = buf.subarray(off + 8, off + 8 + len);
  if (t === 0x4e4f534a) json = JSON.parse(d.toString());
  if (t === 0x004e4942) bin = d;
  off += 8 + len;
}
const read = (idx) => {
  const a = json.accessors[idx], bv = json.bufferViews[a.bufferView];
  const C = COMP[a.componentType];
  return new C(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0),
    a.count * NUM[a.type]);
};

const p = json.meshes[0].primitives[0];
const pos = read(p.attributes.POSITION);
const idx = read(p.indices);
const n = json.accessors[p.attributes.POSITION].count;

const ca = json.accessors[p.attributes.COLOR_0];
const col = read(p.attributes.COLOR_0);
const c8 = new Uint8Array(n * 4);
if (ca.componentType === 5126) {
  for (let i = 0; i < n * 4; i++) c8[i] = Math.round(Math.min(1, Math.max(0, col[i])) * 255);
} else if (ca.componentType === 5123) {
  const u16 = new Uint16Array(col.buffer, col.byteOffset, n * 4);
  for (let i = 0; i < n * 4; i++) c8[i] = Math.round(u16[i] / 65535 * 255);
} else {
  c8.set(col.subarray(0, n * 4));
}

const useU32 = n > 65535;
const out = Buffer.alloc(8 + n * 16 + idx.length * (useU32 ? 4 : 2));
let o = 0;
out.writeUInt32LE(n, o); o += 4;
out.writeUInt32LE(useU32 ? 1 : 0, o); o += 4;
for (let i = 0; i < pos.length; i++) { out.writeFloatLE(pos[i], o); o += 4; }
out.set(c8, o); o += c8.length;
for (let i = 0; i < idx.length; i++) {
  if (useU32) { out.writeUInt32LE(idx[i], o); o += 4; }
  else { out.writeUInt16LE(idx[i], o); o += 2; }
}

const js = `/* 双人床 v2：按现实尺度重建（2.05×1.55 m，床面 0.60，床头板顶 0.95）。
   床腿 / 床架 / 床垫 / 床单垂边 / 被子（有褶皱）/ 床侧垂被 / 床角翻边 /
   两只枕头 / 床尾搭毯 + 格纹条 / 床头板。
   ${n} 顶点 / ${idx.length} 索引，pos f32 + col u8 + idx ${useU32 ? 'u32' : 'u16'}。 */
export const BED_V2 = {
  verts: ${n},
  data: '${out.toString('base64')}',
};
`;
writeFileSync(OUT, js, 'utf8');
console.log('bed-v2-assets.js', (js.length / 1024).toFixed(0), 'KB |', n, 'verts |', idx.length, 'idx');
