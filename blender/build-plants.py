"""
四种真实形态的室内植物 —— 替代原来「压扁球体当叶子」的做法。

原实现：11 个 icosphere 压扁后随机撒在盆上，没有叶形/叶脉/枝干，
        表面光滑无细节 → 就是用户说的塑料感。
本实现：叶片用 bmesh 按叶形函数生成（宽度沿叶长变化 + 弯曲 + 厚度），
        叶脉用中脉隆起表现，颜色沿叶长做深浅渐变，枝干带分叉。

四种（每房间一种，保证不重复）：
  monstera   龟背竹     —— 大卵形叶 + 边缘裂口，宽叶下垂（暖光客厅）
  cactus     柱状仙人掌 —— 六棱柱 + 纵向棱脊 + 短刺（林间咖啡馆）
  sansevieria 虎尾兰    —— 直立剑形叶 + 横向斑纹（夜景公寓）
  fiddle     琴叶榕     —— 椭圆厚叶 + 明显中脉 + 木质主干（雾林卧室）
"""
import bpy
import bmesh
import math
import os
import random

OUT_DIR = r"D:\work_future\fucking\work10000\.tmp\plants"
os.makedirs(OUT_DIR, exist_ok=True)

random.seed(5150)


def clear():
    global MAT
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for bl in (bpy.data.meshes, bpy.data.materials):
        for b in list(bl):
            if b.users == 0:
                bl.remove(b)
    MAT = None   # 材质已被删，全局引用必须一起清，否则下一株 StructRNA 报错


MAT = None


def ensure_mat():
    global MAT
    if MAT is None:
        MAT = bpy.data.materials.new("plantMat")
        MAT.use_nodes = True
    return MAT


def vcol(obj, rgb):
    """把顶点色写到物体的 Col 层（后续合并后仍保留）"""
    me = obj.data
    if not me.color_attributes:
        me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
    layer = me.color_attributes["Col"]
    me.color_attributes.active_color_name = "Col"
    for i in range(len(layer.data)):
        layer.data[i].color = (rgb[0], rgb[1], rgb[2], 1.0)
    me.materials.append(ensure_mat())


def finish(obj, name):
    obj.name = name
    obj.data.materials.append(ensure_mat())
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


# ============================== 叶片生成 ==============================
def make_leaf(name, length, width, curve=0.35, lobes=0, tip=1.0,
              base_ratio=0.18, mid_ratio=1.0, seg=12, width_seg=4,
              thick=0.0045, droop=0.0, twist=0.0):
    """按叶形函数生成一片叶子。

    length    叶长（沿 +Y）
    width     最大叶宽（沿 X）
    curve     纵向弯曲（叶尖上翘为正）
    lobes     边缘裂口数（龟背竹用）
    tip       叶尖尖锐度（>1 更尖）
    base_ratio 叶基宽度占比
    mid_ratio  最宽处位置（0.5 = 中间）
    width_seg  横向分段（做中脉隆起）
    droop     叶尖下垂量（负值向下）
    """
    bm = bmesh.new()
    rows = []

    for i in range(seg + 1):
        t = i / seg
        # 叶形：基窄 → 中宽 → 尖；tip>1 让尖端更瘦
        s = math.sin(math.pi * min(1.0, t ** (0.85 if tip >= 1 else 1.0)))
        w = width * base_ratio + (width - width * base_ratio) * (s ** tip)
        # 中宽位置可调
        w *= 1.0 - abs(t - mid_ratio) * 0.55
        # 裂口：边缘做周期性收窄（龟背竹）
        if lobes > 0:
            notch = 0.62 + 0.38 * abs(math.cos(t * math.pi * lobes))
            w *= notch
        w = max(w, 0.004)

        # 纵向弯曲 + 叶尖下垂
        y = t * length
        z = curve * (t ** 1.8) * length + droop * (t ** 2.4) * length

        row = []
        for j in range(width_seg + 1):
            u = j / width_seg * 2 - 1          # -1..1
            x = u * w * 0.5
            # 中脉隆起 + 叶缘下卷（U 形横截面）
            zz = z - 0.055 * (u ** 2) * w * 2.2
            row.append(bm.verts.new((x, y, zz)))
        rows.append(row)

    bm.verts.ensure_lookup_table()
    for i in range(seg):
        for j in range(width_seg):
            a = rows[i][j]
            b = rows[i][j + 1]
            c = rows[i + 1][j + 1]
            d = rows[i + 1][j]
            try:
                bm.faces.new((a, b, c, d))
            except ValueError:
                pass

    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)

    # 厚度
    bpy.context.view_layer.objects.active = obj
    sol = obj.modifiers.new("sol", 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = 0
    bpy.ops.object.modifier_apply(modifier=sol.name)

    if twist:
        bpy.ops.object.mode_set(mode='OBJECT')
        obj.rotation_euler = (0, 0, twist)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    return finish(obj, name)


def make_stem(name, length, radius, seg=8, taper=0.55, bend=0.0):
    """枝干：带锥度的圆柱，可选侧弯"""
    bm = bmesh.new()
    rings = []
    steps = 6
    for i in range(steps + 1):
        t = i / steps
        r = radius * (1 - (1 - taper) * t)
        y = t * length
        x = bend * (t ** 2) * length
        ring = []
        for k in range(seg):
            a = k / seg * math.pi * 2
            ring.append(bm.verts.new((x + math.cos(a) * r, y, math.sin(a) * r)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()
    for i in range(steps):
        for k in range(seg):
            k2 = (k + 1) % seg
            try:
                bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            except ValueError:
                pass
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name)


def make_pot(name, r_top, r_bot, h, rgb):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=r_bot, radius2=r_top,
                                    depth=h, location=(0, 0, h / 2))
    o = bpy.context.object
    o.name = name
    vcol(o, rgb)
    return finish(o, name)


def make_soil(name, r, z):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=0.02, location=(0, 0, z))
    o = bpy.context.object
    o.name = name
    vcol(o, (0.085, 0.065, 0.048))
    return finish(o, name)


# ============================== 合并 + 导出的通用尾段 ==============================
def export_plant(name, target=14000):
    bpy.ops.object.select_all(action='SELECT')
    objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    a = bpy.context.object
    a.name = name
    a.location = (0, 0, 0)
    me = a.data

    # 顶点色已由各件写好（合并后保留），确认激活层
    if me.color_attributes:
        me.color_attributes.active_color_name = "Col"

    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > target:
        dm = a.modifiers.new('d', 'DECIMATE')
        dm.ratio = target / tris
        bpy.ops.object.modifier_apply(modifier=dm.name)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')

    out = os.path.join(OUT_DIR, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True,
                              export_yup=True, export_materials='EXPORT',
                              export_normals=False, export_texcoords=True,
                              export_vertex_color='ACTIVE', export_cameras=False,
                              export_lights=False)
    print("PLANT", name, os.path.getsize(out), "tris", tris)


# 叶色：基部深、尖部浅（模拟自然受光）
C_LEAF_D = (0.055, 0.135, 0.048)
C_LEAF_M = (0.095, 0.205, 0.072)
C_LEAF_L = (0.145, 0.300, 0.105)
C_STEM = (0.095, 0.115, 0.062)
C_POT_T = (0.245, 0.185, 0.145)
C_POT_C = (0.300, 0.290, 0.275)
C_CACTUS = (0.135, 0.235, 0.135)
C_SANS = (0.115, 0.175, 0.085)
C_SANS_EDGE = (0.195, 0.245, 0.115)


# ============================== 1. 龟背竹（暖光客厅）==============================
clear()
make_pot("pot", 0.20, 0.15, 0.30, C_POT_C)
make_soil("soil", 0.185, 0.295)
# 三根主茎，各自斜出
for si, (bx, bz, lean) in enumerate([(0, 0, 0.16), (0.07, 0.03, -0.22), (-0.06, -0.04, 0.30)]):
    st = make_stem("stem%d" % si, 0.54, 0.021, 8, 0.7, lean)
    st.location = (bx, 0, 0.28)
    # make_stem 沿 +Y 生成；绕 X 轴 +90° 才是竖直向上。
    # 留 6° 倾斜让三根茎自然外张。
    st.rotation_euler = (math.radians(84), 0, bz)
    vcol(st, C_STEM)
    # 每根茎 3 片叶，越大越靠上
    for li in range(4):
        t = 0.38 + li * 0.21
        L = 0.33 + li * 0.085
        lf = make_leaf("leaf%d_%d" % (si, li), L, L * 0.76,
                       curve=0.16, lobes=4, tip=0.82, base_ratio=0.34,
                       seg=14, width_seg=5, thick=0.005, droop=0.28)
        lf.location = (bx + lean * t * 0.30, lean * t * 0.22, 0.40 + t * 0.42)
        lf.rotation_euler = (math.radians(54 + li * 7), math.radians(random.uniform(-18, 18)),
                             math.radians(si * 120 + li * 38))
        vcol(lf, C_LEAF_M if li % 2 else C_LEAF_D)
export_plant("plantMonstera", 15000)


# ============================== 2. 柱状仙人掌（咖啡馆）==============================
clear()
make_pot("pot", 0.16, 0.13, 0.24, C_POT_T)
make_soil("soil", 0.147, 0.235)
# 主柱 + 两侧小柱
cols = [(0, 0, 0.92, 0.075), (0.105, 0.04, 0.52, 0.048), (-0.09, -0.06, 0.40, 0.042)]
for ci, (cx, cy, ch, cr) in enumerate(cols):
    # 六棱柱做棱脊
    bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=cr, depth=ch,
                                        location=(cx, cy, 0.24 + ch / 2))
    o = bpy.context.object
    o.name = "cactus%d" % ci
    # 顶部倒圆
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    bm.to_mesh(o.data)
    bm.free()
    vcol(o, C_CACTUS)
    finish(o, "cactus%d" % ci)
    # 顶盖
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=cr * 0.98,
                                        location=(cx, cy, 0.24 + ch))
    cap = bpy.context.object
    cap.name = "cap%d" % ci
    cap.scale = (1, 1, 0.42)
    bpy.ops.object.transform_apply(scale=True)
    vcol(cap, C_CACTUS)
    finish(cap, "cap%d" % ci)
    # 短刺：沿棱线分布
    for si in range(10):
        a = si * 0.9 + ci
        sz = 0.24 + (si / 10) * ch * 0.88
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.006, radius2=0.0,
                                        depth=0.032,
                                        location=(cx + math.cos(a) * cr * 0.98,
                                                  cy + math.sin(a) * cr * 0.98, sz))
        sp = bpy.context.object
        sp.name = "spine%d_%d" % (ci, si)
        sp.rotation_euler = (math.pi / 2, 0, a)
        bpy.ops.object.transform_apply(rotation=True)
        vcol(sp, (0.34, 0.30, 0.20))
        finish(sp, "spine%d_%d" % (ci, si))
export_plant("plantCactus", 10000)


# ============================== 3. 虎尾兰（夜景公寓）==============================
clear()
make_pot("pot", 0.155, 0.135, 0.26, C_POT_T)
make_soil("soil", 0.142, 0.255)
# 7 片直立剑形叶，长短不一、略微外张
for i in range(7):
    h = 0.62 + (i % 4) * 0.17
    wd = 0.092 + (i % 3) * 0.014
    lf = make_leaf("sans%d" % i, h, wd,
                   curve=-0.05, lobes=0, tip=1.15, base_ratio=0.85,
                   mid_ratio=0.18, seg=16, width_seg=3, thick=0.006)
    a = i * 0.9
    r = 0.035 + (i % 3) * 0.028
    lf.location = (math.cos(a) * r, math.sin(a) * r, 0.26)
    # 竖直 + 外倾
    lf.rotation_euler = (math.radians(90 + math.cos(a) * 8),
                         math.radians(math.sin(a) * 11), 0)
    vcol(lf, C_SANS_EDGE if i % 2 else C_SANS)
export_plant("plantSansevieria", 11000)


# ============================== 4. 琴叶榕（雾林卧室）==============================
clear()
make_pot("pot", 0.19, 0.155, 0.28, C_POT_C)
make_soil("soil", 0.177, 0.275)
# 木质主干 + 两条侧枝
trunk = make_stem("trunk", 0.95, 0.034, 10, 0.60, 0.06)
trunk.location = (0, 0, 0.26)
trunk.rotation_euler = (math.radians(88), 0, 0)
vcol(trunk, (0.135, 0.105, 0.070))
for bi, (by, bz, blen) in enumerate([(0.42, 0.55, 0.34), (0.62, -0.62, 0.28)]):
    br = make_stem("branch%d" % bi, blen, 0.022, 8, 0.6, 0.30)
    br.location = (0, 0, 0.26 + by)
    # 侧枝从主干 55°~70° 斜上出，和主干形成分叉
    br.rotation_euler = (math.radians(62), 0, bz)
    vcol(br, (0.135, 0.105, 0.070))
    # 每枝 3 片叶
    for li in range(3):
        t = 0.5 + li * 0.24
        L = 0.30
        lf = make_leaf("fleaf%d_%d" % (bi, li), L, L * 0.62,
                       curve=0.10, lobes=0, tip=0.85, base_ratio=0.22,
                       seg=14, width_seg=5, thick=0.006, droop=0.10)
        lf.location = (t * blen * math.cos(math.radians(62)) * math.sin(bz) * -1,
                       t * blen * math.cos(math.radians(62)) * math.cos(bz),
                       0.26 + by + t * blen * math.sin(math.radians(62)))
        lf.rotation_euler = (math.radians(44 + li * 9),
                             math.radians(random.uniform(-20, 20)),
                             math.radians(bz * 40 + li * 45))
        vcol(lf, C_LEAF_M if li % 2 else C_LEAF_L)
# 顶冠 3 片
for li in range(3):
    lf = make_leaf("ftop%d" % li, 0.28, 0.175,
                   curve=0.14, lobes=0, tip=0.85, base_ratio=0.22,
                   seg=14, width_seg=5, thick=0.006, droop=0.12)
    a = li * 2.1
    lf.location = (math.cos(a) * 0.08, math.sin(a) * 0.08, 1.18)
    lf.rotation_euler = (math.radians(36), math.radians(math.sin(a) * 20),
                         math.radians(li * 120))
    vcol(lf, C_LEAF_L)
export_plant("plantFiddle", 16000)

print("ALL_PLANTS_DONE")
