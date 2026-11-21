"""
夜景公寓 3D 模型台资产 v2 —— 对照参考图逐件复刻。

参考图清单（逐项落实）：
  建筑  转角落地窗（黑框，6 扇）、深色木地板、右墙竖向木格栅
  家具  双人床（白床品、凌乱堆叠）、两个床头柜、黑色书架（塞满书）、
        白球落地灯、窗边矮凳、地毯
  光源  顶部暖黄灯带（折线）、窗台蓝色 LED、壁炉橙火、白球灯
  氛围  暗调、冷蓝窗外 vs 暖黄室内

导出：合并 → 烘 AO 到顶点色 → GLB（不砍小件，面数控制 4 万内）
"""
import bpy
import math
import random

random.seed(7711)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for bl in (bpy.data.meshes, bpy.data.materials):
    for b in list(bl):
        if b.users == 0:
            bl.remove(b)


def mat(name, col, rough=0.8, metal=0.0, emis=None, power=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1)
        b.inputs["Emission Strength"].default_value = power
    return m


# 明度按参考图取：室内整体很暗，床品是唯一大面积亮色
M_FLOOR = mat("floor", (0.105, 0.068, 0.042), 0.42)     # 深木地板
M_WALL = mat("wall", (0.085, 0.080, 0.082), 0.92)        # 深灰墙
M_FRAME = mat("frame", (0.045, 0.045, 0.050), 0.38, 0.55)  # 黑钢窗框
M_SHEET = mat("sheet", (0.815, 0.810, 0.800), 0.95)      # 白床品
M_DUVET = mat("duvet", (0.735, 0.730, 0.720), 0.96)
M_BEDBASE = mat("bedbase", (0.070, 0.058, 0.050), 0.58)
M_WOOD = mat("wood", (0.125, 0.080, 0.048), 0.62)        # 木家具
M_BRICK = mat("brick", (0.240, 0.115, 0.075), 0.92)
M_SHELF = mat("shelf", (0.055, 0.052, 0.055), 0.66)
M_PLANT = mat("plant", (0.075, 0.165, 0.070), 0.86)
M_RUG = mat("rug", (0.130, 0.128, 0.130), 0.97)
M_METAL = mat("metal", (0.180, 0.180, 0.190), 0.30, 0.75)
M_LEDW = mat("ledw", (1.0, 0.82, 0.52), 0.4, emis=(1.0, 0.82, 0.52), power=2.0)
M_LEDB = mat("ledb", (0.22, 0.60, 1.0), 0.4, emis=(0.22, 0.60, 1.0), power=1.6)
M_FIRE = mat("fire", (1.0, 0.42, 0.12), 0.5, emis=(1.0, 0.42, 0.12), power=1.8)
M_BULB = mat("bulb", (1.0, 0.90, 0.72), 0.35, emis=(1.0, 0.90, 0.72), power=4.0)

BK = [(0.16, 0.05, 0.04), (0.04, 0.07, 0.10), (0.17, 0.12, 0.06),
      (0.05, 0.09, 0.05), (0.20, 0.15, 0.09), (0.10, 0.05, 0.09)]
BK_M = [mat("bk%d" % i, c, 0.86) for i, c in enumerate(BK)]


def box(w, d, h, x, y, z, m, name):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(m)
    return o


def cyl(r, h, x, y, z, m, name, verts=20, rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    if rot:
        o.rotation_euler = rot
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    o.data.materials.append(m)
    return o


def ball(r, x, y, z, m, name, seg=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(6, seg // 2),
                                         radius=r, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    return o


def soft(w, d, h, x, y, z, m, name, bevel=0.06, sub=1, wrinkle=0.0):
    """软包：倒角 → 细分 → 噪声位移（wrinkle）。
       wrinkle 让床品有柔软的起伏，不是几个方块 —— 家具的「柔软感」
       靠形体轮廓，不靠贴图。"""
    o = box(w, d, h, x, y, z, m, name)
    bpy.ops.object.modifier_add(type='BEVEL')
    bv = o.modifiers[-1]
    bv.width = bevel
    bv.segments = 2
    bpy.ops.object.modifier_apply(modifier=bv.name)
    if sub:
        sm = o.modifiers.new("s", 'SUBSURF')
        sm.levels = sub
        bpy.ops.object.modifier_apply(modifier=sm.name)
    if wrinkle > 0:
        tex = bpy.data.textures.new("w" + name, 'CLOUDS')
        tex.noise_scale = 0.22
        dm = o.modifiers.new("d", 'DISPLACE')
        dm.texture = tex
        dm.strength = wrinkle
        dm.mid_level = 0.5
        bpy.ops.object.modifier_apply(modifier=dm.name)
    bpy.ops.object.shade_smooth()
    return o


# ============================== 房间外壳 ==============================
# 房间 8(X) × 6(Y) × 3(Z)。Y=0 是窗墙，Y=6 是相机侧；剖开顶棚便于俯视。
W, D, H = 8.0, 6.0, 3.0

box(W, D, 0.14, 0, 3.0, -0.07, M_FLOOR, "floor")

# ---- 后墙：整面落地窗（6 扇 + 上下横档 + 两根边柱）----
WIN_X0, WIN_X1 = -3.7, 3.7
for i in range(5):
    px = WIN_X0 + i * (WIN_X1 - WIN_X0) / 4
    box(0.09, 0.13, H, px, 0, H / 2, M_FRAME, "mullion%d" % i)
box(WIN_X1 - WIN_X0, 0.13, 0.10, 0, 0, H - 0.05, M_FRAME, "head")
box(WIN_X1 - WIN_X0, 0.13, 0.09, 0, 0, 0.045, M_FRAME, "sill")
# 窗两侧的实墙
box(0.30, 0.13, H, -3.85, 0, H / 2, M_WALL, "wpierL")
box(0.30, 0.13, H, 3.85, 0, H / 2, M_WALL, "wpierR")

# ---- 左墙：转角窗（前半） + 实墙（后半）----
box(0.13, 2.6, H, -4.0 - 0.06, 1.3, H / 2, M_WALL, "wallL_back")
for i in range(4):
    py = 0.15 + i * 0.85
    box(0.13, 0.09, H, -4.0, py, H / 2, M_FRAME, "lsash%d" % i)
box(0.13, 2.6, 0.10, -4.0, 1.3, H - 0.05, M_FRAME, "lhead")
box(0.13, 2.6, 0.09, -4.0, 1.3, 0.045, M_FRAME, "lsill")

# ---- 右墙：竖向木格栅 ----
box(0.13, D, H, 4.0 + 0.06, 3.0, H / 2, M_WALL, "wallR")
for i in range(22):
    box(0.10, 0.07, 2.2, 3.93, 0.35 + i * 0.255, 1.1, M_WOOD, "slat%d" % i)

# ============================== 床（参考图主体）==============================
BED_X, BED_Y = 0.30, 3.55
# ---- 真实床结构：床腿 → 床架 → 床垫 → 床单 → 被子 → 枕头 → 床头板 ----
# 床腿（四角，让床离地，有阴影）
for lx in (-1.02, 1.02):
    for ly in (-0.86, 0.86):
        box(0.10, 0.10, 0.14, BED_X + lx, BED_Y + ly, 0.07, M_BEDBASE, "bedleg")
# 床架：深色布艺包边，比床垫略窄一点，露出边线
soft(2.30, 1.94, 0.26, BED_X, BED_Y, 0.27, M_BEDBASE, "bedframe", 0.05, 1)
# 床垫：白色，圆角大，比床架略小，坐上去会陷的那种厚度
soft(2.14, 1.82, 0.28, BED_X, BED_Y, 0.53, M_SHEET, "mattress", 0.11, 2, 0.010)
# 床单：铺在床垫上，四边垂下来（薄片包边）
soft(2.16, 1.84, 0.045, BED_X, BED_Y, 0.685, M_SHEET, "bedsheet", 0.02, 1, 0.008)
for side, (sw, sd, sx, sy) in {
    'L': (0.035, 1.86, -1.09, 0), 'R': (0.035, 1.86, 1.09, 0),
    'F': (2.18, 0.035, 0, 0.93),
}.items():
    soft(sw, sd, 0.26, BED_X + sx, BED_Y + sy, 0.56, M_SHEET,
         "sheetdrop" + side, 0.015, 1, 0.006)
# 被子：盖住床下半部，表面有起伏；体积感靠厚度 + 褶皱
soft(2.12, 1.22, 0.19, BED_X - 0.03, BED_Y + 0.26, 0.79, M_DUVET, "duvet", 0.10, 2, 0.016)
# 被子垂到床侧（两片，长短不一，像被人掀过）
soft(0.30, 1.14, 0.30, BED_X + 1.02, BED_Y + 0.30, 0.60, M_DUVET, "duvetdropR", 0.09, 2, 0.013)
soft(0.26, 0.90, 0.24, BED_X - 1.04, BED_Y + 0.34, 0.64, M_DUVET, "duvetdropL", 0.08, 2, 0.011)
# 被角翻起（一小片搭在床面上，增加"用过"的痕迹）
soft(0.86, 0.42, 0.09, BED_X + 0.52, BED_Y - 0.10, 0.86, M_SHEET, "fold", 0.07, 1, 0.008)
# 枕头：两只，略带弧度，靠床头斜放
soft(0.72, 0.46, 0.19, BED_X - 0.52, BED_Y - 0.66, 0.77, M_SHEET, "pillow1", 0.10, 2, 0.010)
soft(0.72, 0.46, 0.19, BED_X + 0.50, BED_Y - 0.68, 0.77, M_SHEET, "pillow2", 0.10, 2, 0.010)
# 床尾搭毯：深色薄毯盖在被子下沿，做出层次
soft(2.14, 0.42, 0.10, BED_X - 0.02, BED_Y + 0.72, 0.86, mat("throw", (0.26, 0.20, 0.16), 0.95), "throw", 0.07, 1, 0.008)
# 床头板：竖向靠墙，比床略宽，有厚度
soft(2.38, 0.13, 0.80, BED_X, BED_Y - 0.98, 0.78, M_WOOD, "headboard", 0.05, 1, 0.006)

# 床头柜 ×2
for sx in (-1.55, 1.55):
    box(0.46, 0.42, 0.40, BED_X + sx, BED_Y - 0.78, 0.20, M_WOOD, "nstd%d" % int(sx))
    box(0.40, 0.36, 0.04, BED_X + sx, BED_Y - 0.78, 0.42, M_WOOD, "nsttop%d" % int(sx))

# 地毯（床下半）
box(3.6, 2.3, 0.016, BED_X, BED_Y + 0.62, 0.008, M_RUG, "rug")

# ============================== 壁炉（左侧）==============================
FX, FY = -3.35, 4.15
box(0.62, 0.92, 1.20, FX, FY, 0.60, M_BRICK, "firebox")
box(0.07, 0.46, 0.44, FX + 0.32, FY, 0.38, M_FIRE, "fireglow")
box(0.70, 1.00, 0.08, FX, FY, 1.24, M_BEDBASE, "firetop")
# 柴火
for i in range(4):
    cyl(0.035, 0.22, FX + 0.34, FY - 0.12 + i * 0.08, 0.30,
        mat("log%d" % i, (0.090, 0.060, 0.040), 0.9), "log%d" % i,
        verts=8, rot=(math.radians(90), 0, math.radians(20 * i)))

# ============================== 书架（右后）==============================
SX, SY = 3.55, 4.55
box(0.34, 1.55, 2.10, SX, SY, 1.05, M_SHELF, "shelfbody")
for si, sz in enumerate((0.52, 0.96, 1.40, 1.84)):
    box(0.30, 1.46, 0.035, SX, SY, sz, M_WOOD, "shelfbd%d" % si)
    # 每层塞书
    by = SY - 0.66
    k = 0
    while by < SY + 0.66:
        bw = 0.028 + (k % 3) * 0.008
        bh = 0.19 + ((k * 5) % 4) * 0.022
        box(0.20, bw, bh, SX, by, sz + bh / 2 + 0.018,
            BK_M[k % len(BK_M)], "book%d_%d" % (si, k))
        by += bw + 0.006
        k += 1

# ============================== 落地灯 / 矮凳 / 绿植 ==============================
LX, LY = -2.55, 4.75
cyl(0.12, 0.035, LX, LY, 0.018, M_FRAME, "lampbase")
cyl(0.018, 1.26, LX, LY, 0.65, M_FRAME, "lampole")
ball(0.155, LX, LY, 1.36, M_BULB, "lampball")

# 窗边矮凳（参考图窗台前有个圆凳）
cyl(0.26, 0.38, 2.55, 1.15, 0.19, M_WOOD, "stool")
cyl(0.30, 0.045, 2.55, 1.15, 0.41, M_WOOD, "stooltop")

# 窗台绿植
cyl(0.13, 0.22, 3.30, 0.42, 0.11, M_BRICK, "pot")
for i in range(7):
    a = i * 0.95
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.13,
        location=(3.30 + 0.10 * math.cos(a), 0.42 + 0.10 * math.sin(a),
                  0.32 + (i % 3) * 0.11))
    o = bpy.context.object
    o.name = "leaf%d" % i
    o.data.materials.append(M_PLANT)

# ============================== 灯带 ==============================
# 顶部暖黄折线（参考图沿吊顶边缘走）
box(4.2, 0.045, 0.045, -0.9, 2.30, 2.82, M_LEDW, "ledw1")
box(0.045, 2.0, 0.045, 1.20, 1.30, 2.82, M_LEDW, "ledw2")
box(2.6, 0.045, 0.045, 2.50, 0.30, 2.82, M_LEDW, "ledw3")
# 窗台蓝色 LED 两道（参考图最标志性的细节）
box(WIN_X1 - WIN_X0 - 0.2, 0.05, 0.035, 0, 0.10, 0.115, M_LEDB, "ledb1")
box(WIN_X1 - WIN_X0 - 0.2, 0.05, 0.035, 0, 0.10, 0.68, M_LEDB, "ledb2")
# 左墙踢脚蓝光
box(0.05, 2.4, 0.035, -3.93, 1.25, 0.10, M_LEDB, "ledb3")

# ============================== 窗外城市楼群 ==============================
# 原来用一块贴图平面挂在窗外，从侧面看就是一块竖着的板，很多余。
# 改成立体楼群：真实的盒子几何，从任何角度看都合理。
M_CITY = mat("city", (0.105, 0.120, 0.165), 0.92)
M_CITY2 = mat("city2", (0.075, 0.090, 0.130), 0.94)
M_CITYWIN = mat("citywin", (1.0, 0.86, 0.58), 0.5, emis=(1.0, 0.86, 0.58), power=1.5)
M_CITYWIN2 = mat("citywin2", (0.55, 0.72, 1.0), 0.5, emis=(0.55, 0.72, 1.0), power=1.2)

import random as _r
_r.seed(3307)
# 楼群必须紧贴窗框正后方（窗外 0.4–1.0 m），否则在 8×6 的模型台里
# 会飘成一片碎片 —— 之前放到 6–10 m 外就是这个后果。
# 翻转后 y' = 6 - y，z_gltf = -y'，+3 后落在 z = -3.4 ~ -4.0。
for i in range(22):
    bx = _r.uniform(-4.0, 4.0)
    by = _r.uniform(-1.0, -0.4)      # 窗外紧邻
    bw = _r.uniform(0.28, 0.62)
    bd = _r.uniform(0.20, 0.40)
    bh = _r.uniform(0.45, 1.35)      # 矮剪影，不压过窗高
    m = M_CITY if i % 3 else M_CITY2
    box(bw, bd, bh, bx, by, bh / 2 - 0.30, m, "tower%d" % i)
    # 少量亮窗：贴在楼朝房间那一面
    nw = 1 + (i % 3)
    for k in range(nw):
        wz = 0.35 + (k * 0.34) % max(0.25, bh - 0.35)
        box(0.055, 0.02, 0.07, bx + _r.uniform(-bw * 0.25, bw * 0.25),
            by + bd / 2 + 0.005, wz,
            M_CITYWIN if (i + k) % 2 else M_CITYWIN2, "cwin%d_%d" % (i, k))

# ============================== 合并 + 烘 AO ==============================
bpy.ops.object.select_all(action='SELECT')
objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
a = bpy.context.object
a.name = "nightRoom"
a.location = (0, 0, 0)
me = a.data

col = me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
me.color_attributes.active_color_name = "Col"
for poly in me.polygons:
    m = a.data.materials[poly.material_index]
    rgb = (0.5, 0.5, 0.5)
    if m and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                c = n.inputs["Base Color"].default_value
                rgb = (c[0], c[1], c[2])
                break
    for li in poly.loop_indices:
        col.data[li].color = (rgb[0], rgb[1], rgb[2], 1.0)

ao = me.color_attributes.new(name="AO", type='BYTE_COLOR', domain='CORNER')
me.color_attributes.active_color_name = "AO"
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 20
sc.cycles.use_denoising = False
sc.render.bake.target = 'VERTEX_COLORS'
sc.render.bake.use_pass_direct = False
sc.render.bake.use_pass_indirect = False
bpy.ops.object.select_all(action='DESELECT')
a.select_set(True)
bpy.context.view_layer.objects.active = a
bpy.ops.object.bake(type='AO', margin=3)

# AO 乘进基色：柜下/墙角自然变暗，Basic/Standard 都有立体感
for i in range(len(col.data)):
    c = col.data[i].color
    k = 0.30 + 0.70 * ao.data[i].color[0]
    col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
me.color_attributes.remove(ao)
me.color_attributes.active_color_name = "Col"

tris = sum(len(p.vertices) - 2 for p in me.polygons)
print("NIGHT_V2 tris", tris, "loops", len(col.data))

OUT = r"D:\work_future\fucking\work10000\.tmp\nightscene\nightScene.glb"
import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB',
    export_apply=False, export_yup=True, export_materials='EXPORT',
    export_normals=False, export_texcoords=False,
    export_vertex_color='ACTIVE', export_cameras=False, export_lights=False)
print("NIGHT_V2_DONE", os.path.getsize(OUT))
