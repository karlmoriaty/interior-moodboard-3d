// 把夜景场景 GLB 合并：应用每个 node 的 TRS 变换到顶点，再打包
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'D:/work_future/fucking/work10000/.tmp/nightscene/nightScene.glb';
const OUT = 'D:/work_future/fucking/work10000/moodroom/night-scene-assets.js';

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

/* 四元数 → 3×3 旋转矩阵，再叠加缩放和平移 */
function trsMatrix(node) {
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = [
    (1 - (yy + zz)) * s[0], (xy - wz) * s[1], (xz + wy) * s[2],
    (xy + wz) * s[0], (1 - (xx + zz)) * s[1], (yz - wx) * s[2],
    (xz - wy) * s[0], (yz + wx) * s[1], (1 - (xx + yy)) * s[2],
  ];
  return { m, t };
}

const parts = [];
let totalV = 0, totalI = 0;
for (const node of json.nodes) {
  if (node.mesh === undefined) continue;
  const mesh = json.meshes[node.mesh];
  const p = mesh.primitives[0];
  const pos = read(p.attributes.POSITION);
  const col = read(p.attributes.COLOR_0);
  const idx = read(p.indices);
  const n = json.accessors[p.attributes.POSITION].count;
  const ca = json.accessors[p.attributes.COLOR_0];

  const { m, t } = trsMatrix(node);
  const wp = new Float32Array(pos.length);
  for (let i = 0; i < n; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    wp[i * 3] = m[0] * px + m[1] * py + m[2] * pz + t[0];
    wp[i * 3 + 1] = m[3] * px + m[4] * py + m[5] * pz + t[1];
    wp[i * 3 + 2] = m[6] * px + m[7] * py + m[8] * pz + t[2];
  }

  /* Blender 的 BYTE_COLOR 导出成 Uint16 normalized(5123)，不是 Uint8！
     之前按 Uint8 读，两个字节被当成一个颜色分量，颜色全乱（地板成粉紫）。 */
  const c8 = new Uint8Array(n * 4);
  if (ca.componentType === 5126) {
    for (let i = 0; i < n * 4; i++) c8[i] = Math.round(Math.min(1, Math.max(0, col[i])) * 255);
  } else if (ca.componentType === 5123) {
    const u16 = new Uint16Array(col.buffer, col.byteOffset, n * 4);
    for (let i = 0; i < n * 4; i++) c8[i] = Math.round(u16[i] / 65535 * 255);
  } else {
    for (let i = 0; i < n * 4; i++) c8[i] = col[i];
  }
  parts.push({ pos: wp, col: c8, idx, n });
  totalV += n;
  totalI += idx.length;
}

const useU32 = totalV > 65535;
const out = Buffer.alloc(8 + totalV * 16 + totalI * (useU32 ? 4 : 2));
let o = 0;
out.writeUInt32LE(totalV, o); o += 4;
out.writeUInt32LE(useU32 ? 1 : 0, o); o += 4;
/* 分离存储：先全部 pos，再全部 col，最后全部 idx —— 和网页端解析顺序一致 */
for (const part of parts) {
  for (let i = 0; i < part.pos.length; i++) { out.writeFloatLE(part.pos[i], o); o += 4; }
}
for (const part of parts) { out.set(part.col, o); o += part.col.length; }
let idxBase = 0;
for (const part of parts) {
  for (let i = 0; i < part.idx.length; i++) {
    const v = part.idx[i] + idxBase;
    if (useU32) { out.writeUInt32LE(v, o); o += 4; }
    else { out.writeUInt16LE(v, o); o += 2; }
  }
  idxBase += part.n;
}

const js = `/* 夜景公寓 3D 场景几何：Blender 建 → GLB → 应用 TRS → 合并打包。
   ${parts.length} 个部件 / ${totalV} 顶点 / ${totalI} 索引。
   pos(f32) + color(u8) + index(${useU32 ? 'u32' : 'u16'})，零外部依赖。 */
export const NIGHT_SCENE = {
  data: '${out.toString('base64')}',
};
`;
writeFileSync(OUT, js, 'utf8');
console.log('night-scene-assets.js', (js.length / 1024).toFixed(0), 'KB |',
  parts.length, 'parts |', totalV, 'verts |', useU32 ? 'u32' : 'u16');
