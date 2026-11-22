// 四种植物打包：每株 pos(f32) + col(u8) + idx(u16)，一个模块含四份
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'D:/work_future/fucking/work10000/.tmp/plants/';
const OUT = 'D:/work_future/fucking/work10000/moodroom/plants-assets.js';
const NAMES = ['plantMonstera', 'plantCactus', 'plantSansevieria', 'plantFiddle'];

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function pack(file) {
  const buf = readFileSync(file);
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
  const col = read(p.attributes.COLOR_0);
  const ca = json.accessors[p.attributes.COLOR_0];
  const c8 = new Uint8Array(n * 4);
  if (ca.componentType === 5126) {
    for (let i = 0; i < n * 4; i++) c8[i] = Math.round(Math.min(1, Math.max(0, col[i])) * 255);
  } else if (ca.componentType === 5123) {
    const u16 = new Uint16Array(col.buffer, col.byteOffset, n * 4);
    for (let i = 0; i < n * 4; i++) c8[i] = Math.round(u16[i] / 65535 * 255);
  } else {
    c8.set(col.subarray(0, n * 4));
  }
  return { pos, col: c8, idx, n };
}

const out = Buffer.concat(NAMES.map((nm) => {
  const { pos, col, idx, n } = pack(DIR + nm + '.glb');
  const useU32 = n > 65535;
  /* 头 12 字节：顶点数 / 索引数 / 是否 u32 ——
     必须带索引数，否则解码端无法把四段数据分开。 */
  const b = Buffer.alloc(12 + n * 16 + idx.length * (useU32 ? 4 : 2));
  let o = 0;
  b.writeUInt32LE(n, o); o += 4;
  b.writeUInt32LE(idx.length, o); o += 4;
  b.writeUInt32LE(useU32 ? 1 : 0, o); o += 4;
  for (let i = 0; i < pos.length; i++) { b.writeFloatLE(pos[i], o); o += 4; }
  b.set(col, o); o += col.length;
  for (let i = 0; i < idx.length; i++) {
    if (useU32) { b.writeUInt32LE(idx[i], o); o += 4; } else { b.writeUInt16LE(idx[i], o); o += 2; }
  }
  console.log(nm, n, 'verts', idx.length, 'idx');
  return b;
}));

const js = `/* 四种室内植物 —— 按真实叶形程序化建模，不是压扁的球。

   原实现：11 个 icosphere 压扁后随机撒在盆上，没有叶形/叶脉/枝干 → 塑料感。
   本实现：叶片用 bmesh 按叶形函数生成（宽度沿叶长变化 + 纵向弯曲 + 厚度 +
   中脉隆起），叶色沿叶长渐变，枝干带锥度和分叉。

   monstera    龟背竹    3 茎 × 4 叶，卵形叶带边缘裂口    （暖光客厅）
   cactus      柱状仙人掌 3 柱 + 纵向棱脊 + 短刺          （林间咖啡馆）
   sansevieria 虎尾兰     7 片直立剑形叶，基部宽          （夜景公寓）
   fiddle      琴叶榕     木质主干 + 2 侧枝 + 10 片圆叶   （雾林卧室）

   每株数据独立解码：pos f32 + col u8 + idx u16。 */
export const PLANTS_ASSETS = {
  names: ${JSON.stringify(NAMES)},
  data: '${out.toString('base64')}',
};
`;
writeFileSync(OUT, js, 'utf8');
console.log('plants-assets.js', (js.length / 1024).toFixed(0), 'KB');
