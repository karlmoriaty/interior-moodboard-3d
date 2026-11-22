// 物理常识检测：悬空 / 穿墙 / 穿顶 / 物件互相重叠
const PORT = 9333;
const BASE = process.argv[2];

const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws fail')); });
let id = 1, sid = null;
function send(method, params, s) {
  return new Promise((resolve, reject) => {
    const myId = id++;
    const h = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === myId) {
        ws.removeEventListener('message', h);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    ws.addEventListener('message', h);
    const o = { id: myId, method, params: params || {} };
    if (s) o.sessionId = s;
    ws.send(JSON.stringify(o));
    setTimeout(() => reject(new Error('timeout')), 45000);
  });
}
const t = await send('Target.createTarget', { url: 'about:blank' });
const at = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
sid = at.sessionId;
await send('Runtime.enable', {}, sid);
await send('Page.enable', {}, sid);
await send('Page.navigate', { url: BASE + '/?probe=1' }, sid);
await new Promise(r => setTimeout(r, 9000));

const SCRIPT = `(() => {
  const THREE = window.__THREE;
  /* 基准必须取模型台台面高度（PIECES 父级的 y）。
     原来用 PIECES 包围盒最低点 —— 采集时若 PIECES 还是空的（存档版本刚升，
     家具还没铺完），BASE_Y 会取 0，于是所有家具都被判成「悬空 0.78」。 */
  const BASE_Y = (window.__pieces && window.__pieces.parent) ? window.__pieces.parent.position.y : 0;
  /* 物件都挂在 MODEL 下、整体抬到桌面上，检测必须减掉这个基准 */
  const scenes = ['warm', 'cafe', 'night', 'forest'];
  const out = {};

  for (const sc of scenes) {
    const card = document.querySelector('#scene-list .scene[data-s="' + sc + '"]');
    if (!card) continue;
    card.click();

    const list = [];
    for (const g of window.__pieces.children) {
      const p = g.userData.piece;
      if (!p) continue;
      const bb = new THREE.Box3().setFromObject(g);
      list.push({
        type: p.type,
        x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2),
        minX: +bb.min.x.toFixed(2), maxX: +bb.max.x.toFixed(2),
        minY: +(bb.min.y - BASE_Y).toFixed(2), maxY: +(bb.max.y - BASE_Y).toFixed(2),
        minZ: +bb.min.z.toFixed(2), maxZ: +bb.max.z.toFixed(2),
      });
    }

    const issues = [];
    const RX = 4, RZ = 3, RY = 3;   // 房间 8×6×3 的半宽/半深/层高
    for (const o of list) {
      // 穿墙
      if (o.minX < -RX - 0.02) issues.push(o.type + ' 穿左墙 x=' + o.minX);
      if (o.maxX > RX + 0.02) issues.push(o.type + ' 穿右墙 x=' + o.maxX);
      if (o.minZ < -RZ - 0.02) issues.push(o.type + ' 穿后墙 z=' + o.minZ);
      if (o.maxZ > RZ + 0.02) issues.push(o.type + ' 穿前墙 z=' + o.maxZ);
      // 穿顶
      if (o.maxY > RY + 0.02) issues.push(o.type + ' 穿顶 y=' + o.maxY);
      // 悬空：不是吊装类的，底部应该贴地
      const hanging = ['pendant', 'fireplace', 'glassRoof'].includes(o.type);
      if (!hanging && o.minY > 0.05) issues.push(o.type + ' 悬空 底部y=' + o.minY);
      // 陷进地板
      if (o.minY < -0.05) issues.push(o.type + ' 陷进地板 y=' + o.minY);
    }

    // 互相重叠（体量交集 > 阈值）
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.type === 'glassRoof' || b.type === 'glassRoof') continue;
        if (a.type === 'rugSmall' || b.type === 'rugSmall') continue;
        const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        if (ox > 0.05 && oz > 0.05 && oy > 0.05) {
          issues.push(a.type + ' × ' + b.type + ' 重叠 ' +
            ox.toFixed(2) + '×' + oz.toFixed(2) + '×' + oy.toFixed(2));
        }
      }
    }
    out[sc] = { count: list.length, issues };
  }
  return JSON.stringify(out, null, 1);
})()`;

const r = await send('Runtime.evaluate', { expression: SCRIPT, returnByValue: true }, sid);
console.log(r.result.value || JSON.stringify(r).slice(0, 800));
await send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
ws.close();
process.exit(0);
