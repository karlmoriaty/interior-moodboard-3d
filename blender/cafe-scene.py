"""
林间咖啡馆 · Blender 仿真场景（重写版）

坐标约定（全程一致，不再混淆）：
  X 向右，Y 向房间深处（Y=0 是窗墙，Y=7 是相机侧），Z 向上。
  所有建体函数参数顺序统一为 (宽, 深, 高, x, y, z)。
  房间：X ∈ [-4.5, 4.5]，Y ∈ [0, 7]，Z ∈ [0, 3.4]。

目标：按参考图还原，Cycles 出图要接近照片。
"""
import bpy
import math
import os
from mathutils import Vector

# ============================== 清场 ==============================
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(block):
        if b.users == 0:
            block.remove(b)

SC = bpy.context.scene
SC.render.engine = 'CYCLES'
SC.cycles.samples = 180
SC.cycles.use_denoising = True
SC.render.resolution_x = 1400
SC.render.resolution_y = 850

W, D, H = 6.8, 5.6, 3.0
X0, X1 = -W / 2, W / 2
WIN_TOP = 2.86


# ============================== 材质 ==============================
def pbr(name, base, rough=0.7, metal=0.0, noise=0, wave=0, bump=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if noise or wave:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        if wave:
            t = nt.nodes.new("ShaderNodeTexWave")
            t.inputs["Scale"].default_value = wave
            t.inputs["Distortion"].default_value = 11.0
            t.inputs["Detail"].default_value = 4.0
        else:
            t = nt.nodes.new("ShaderNodeTexNoise")
            t.inputs["Scale"].default_value = noise
            t.inputs["Detail"].default_value = 6.0
            t.inputs["Roughness"].default_value = 0.62
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.015
        nt.links.new(t.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


M_WOOD_D = pbr("wood_dark", (0.062, 0.038, 0.024), 0.60, 0, wave=2.0, bump=0.30)
M_WOOD_M = pbr("wood_mid", (0.140, 0.082, 0.048), 0.56, 0, wave=2.4, bump=0.26)
M_FLOOR = pbr("floor", (0.090, 0.058, 0.036), 0.42, 0, wave=1.2, bump=0.20)
M_WALL = pbr("wall", (0.185, 0.142, 0.105), 0.90, 0, noise=38, bump=0.12)
M_FABRIC = pbr("fabric", (0.50, 0.45, 0.36), 0.94, 0, noise=280, bump=0.22)
M_RATTAN = pbr("rattan", (0.300, 0.200, 0.115), 0.84, 0, noise=170, bump=0.32)
M_PLAID = pbr("plaid", (0.245, 0.225, 0.190), 0.96, 0, noise=190, bump=0.18)
M_BLACK = pbr("black", (0.020, 0.020, 0.022), 0.36, 0.70)
M_BRASS = pbr("brass", (0.58, 0.40, 0.15), 0.26, 0.92)
M_STEEL = pbr("steel", (0.52, 0.52, 0.54), 0.22, 0.90)
M_WAX = pbr("wax", (0.84, 0.78, 0.63), 0.60, 0, noise=320, bump=0.06)
M_CERAMIC = pbr("ceramic", (0.78, 0.74, 0.66), 0.22)
M_LEAF = pbr("leaf", (0.048, 0.095, 0.042), 0.74, 0, noise=210, bump=0.26)
M_LEAF2 = pbr("leaf2", (0.080, 0.135, 0.055), 0.70, 0, noise=190, bump=0.24)
M_BRICK = pbr("brick", (0.215, 0.125, 0.090), 0.94, 0, noise=55, bump=0.22)
M_LOG = pbr("log", (0.145, 0.090, 0.052), 0.90, 0, wave=7, bump=0.32)


def emit(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs["Emission"], out.inputs["Surface"])
    return m


M_FLAME = emit("flame", (1.0, 0.60, 0.22), 20)
M_RING = emit("ringlight", (1.0, 0.90, 0.74), 8)
M_BULB = emit("bulb", (1.0, 0.85, 0.60), 6)

# 玻璃
M_GLASS = bpy.data.materials.new("glass")
M_GLASS.use_nodes = True
gb = M_GLASS.node_tree.nodes["Principled BSDF"]
gb.inputs["Base Color"].default_value = (0.88, 0.92, 0.94, 1)
gb.inputs["Roughness"].default_value = 0.05
gb.inputs["Transmission Weight"].default_value = 0.95
gb.inputs["IOR"].default_value = 1.45


# ============================== 建体 ==============================
def box(w, d, h, x, y, z, mat, rot=(0, 0, 0), bevel=0.0, name="box"):
    """宽 w(X) / 深 d(Y) / 高 h(Z)，位置 (x,y,z) 是中心"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel > 0:
        bpy.ops.object.modifier_add(type='BEVEL')
        bv = o.modifiers[-1]
        bv.width = bevel
        bv.segments = 3
        bpy.ops.object.modifier_apply(modifier=bv.name)
    o.data.materials.append(mat)
    return o


def soft(w, d, h, x, y, z, mat, bevel=0.05, subdiv=2, wrinkle=0.0, rot=(0, 0, 0), name="soft"):
    o = box(w, d, h, x, y, z, mat, rot, bevel, name)
    if wrinkle > 0:
        s1 = o.modifiers.new("p", 'SUBSURF')
        s1.levels = 2
        bpy.ops.object.modifier_apply(modifier=s1.name)
        t = bpy.data.textures.new("w" + name, 'CLOUDS')
        t.noise_scale = 0.16
        di = o.modifiers.new("d", 'DISPLACE')
        di.texture = t
        di.strength = wrinkle
        di.mid_level = 0.5
        bpy.ops.object.modifier_apply(modifier=di.name)
    if subdiv > 0:
        s2 = o.modifiers.new("s", 'SUBSURF')
        s2.levels = subdiv
        bpy.ops.object.modifier_apply(modifier=s2.name)
    bpy.ops.object.shade_smooth()
    return o


def cyl(r1, r2, h, x, y, z, mat, rot=(0, 0, 0), verts=24, name="cyl"):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
                                    depth=h, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


def sph(r, x, y, z, mat, scale=(1, 1, 1), name="sph"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=r,
                                         location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


# ============================== 建筑 ==============================
# 地板（顶面在 z=0）
box(W, D, 0.12, 0, D / 2, -0.06, M_FLOOR, name="floor")
# 天花板
box(W, D, 0.12, 0, D / 2, H + 0.06, M_WALL, name="ceiling")
# 左墙（X0）
box(0.14, D, H, X0 - 0.07, D / 2, H / 2, M_WALL, name="wall_left")
# 右墙（X1）
box(0.14, D, H, X1 + 0.07, D / 2, H / 2, M_WALL, name="wall_right")

# ---- 窗墙（Y=0）：三段窗间柱 + 上下墙带，中间开三个窗洞 ----
ARCH_X = [-2.15, 0.0, 2.15]
HALF_W = 0.80
PIERS = [(X0, ARCH_X[0] - HALF_W), (ARCH_X[0] + HALF_W, ARCH_X[1] - HALF_W),
         (ARCH_X[1] + HALF_W, ARCH_X[2] - HALF_W), (ARCH_X[2] + HALF_W, X1)]
for ax0, ax1 in PIERS:
    if ax1 - ax0 > 0.01:
        box(ax1 - ax0, 0.16, H, (ax0 + ax1) / 2, 0, H / 2, M_WALL, name="pier")
# 窗下墙带与窗上墙带
box(W, 0.16, 0.06, 0, 0, 0.03, M_WALL, name="sillband")
box(W, 0.16, H - WIN_TOP, 0, 0, (H + WIN_TOP) / 2, M_WALL, name="headband")

# ---- 拱窗：木框 + 玻璃 + 窗台 ----
FR = 0.075
RECT_H = 2.02
for ax in ARCH_X:
    # 左右竖框
    box(FR, 0.18, RECT_H, ax - HALF_W, 0.02, RECT_H / 2, M_WOOD_M, bevel=0.008, name="wf")
    box(FR, 0.18, RECT_H, ax + HALF_W, 0.02, RECT_H / 2, M_WOOD_M, bevel=0.008, name="wf")
    # 下框
    box(HALF_W * 2, 0.18, FR, ax, 0.02, 0.06, M_WOOD_M, bevel=0.008, name="wf")
    # 拱：用曲线做真正的半圆拱（0..π），不要整环 ——
    # 整环看起来像圆形窗，参考图是「矩形窗身 + 半圆拱顶」。
    arc_curve = bpy.data.curves.new("arch_%d" % int(ax * 10), 'CURVE')
    arc_curve.dimensions = '3D'
    arc_curve.bevel_depth = FR * 0.55
    arc_curve.bevel_resolution = 3
    arc_curve.resolution_u = 24
    spl = arc_curve.splines.new('POLY')
    N = 24
    spl.points.add(N - 1)
    for i in range(N):
        t = math.pi * i / (N - 1)
        spl.points[i].co = (HALF_W * math.cos(t), 0.0, HALF_W * math.sin(t), 1.0)
    arc_obj = bpy.data.objects.new("arch_%d" % int(ax * 10), arc_curve)
    bpy.context.collection.objects.link(arc_obj)
    arc_obj.location = (ax, 0.02, RECT_H)
    arc_obj.data.materials.append(M_WOOD_M)
    # 玻璃：矩形部分 + 拱顶半圆
    box(HALF_W * 2 - 0.05, 0.02, RECT_H - 0.02, ax, 0.10, RECT_H / 2, M_GLASS, name="glass")
    bpy.ops.mesh.primitive_circle_add(
        vertices=40, radius=HALF_W - 0.02, fill_type='NGON',
        location=(ax, 0.10, RECT_H))
    cap = bpy.context.object
    cap.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    cap.data.materials.append(M_GLASS)
    # 拱顶竖棂
    for k in (-0.34, 0.34):
        box(FR * 0.34, 0.13, RECT_H, ax + k * HALF_W, 0.02, RECT_H / 2,
            M_WOOD_M, name="mullion")
    # 窗台
    box(HALF_W * 2 + 0.22, 0.30, 0.075, ax, 0.06, 0.0, M_WOOD_M,
        bevel=0.012, name="winsill")

# ---- 木梁 ----
for by in (1.10, 3.30):
    box(W, 0.20, 0.22, 0, by, H - 0.11, M_WOOD_D, bevel=0.02, name="beam")
box(0.18, D, 0.20, X0 + 0.50, D / 2, H - 0.10, M_WOOD_D, bevel=0.02, name="beam2")

# ============================== 右墙：书架 + 吧台 ==============================
SHELF_X = X0 + 0.22
# 书架侧板与搁板
for sy in (0.48, 0.90, 1.32, 1.74, 2.16):
    box(0.30, 3.4, 0.042, SHELF_X, 1.70, sy, M_WOOD_M, bevel=0.006, name="board")
for by in (-0.05, 1.15, 2.35):
    box(0.32, 0.05, 2.14, SHELF_X, by, 1.32, M_WOOD_D, name="bside")

# 书
BOOK_COLORS = [(0.26, 0.085, 0.072), (0.085, 0.135, 0.185), (0.30, 0.22, 0.10),
               (0.10, 0.165, 0.10), (0.36, 0.27, 0.15), (0.19, 0.085, 0.17),
               (0.40, 0.33, 0.24)]
BOOK_MATS = [pbr("bk%d" % i, c, 0.86) for i, c in enumerate(BOOK_COLORS)]
for sy in (0.52, 0.98, 1.44, 1.90, 2.36):
    by = 0.10
    k = 0
    while by < 3.30:
        bw = 0.026 + (k % 4) * 0.009
        bh = 0.23 + ((k * 7) % 5) * 0.026
        box(0.20, bw, bh, SHELF_X, by, sy + bh / 2 + 0.021,
            BOOK_MATS[k % len(BOOK_MATS)], bevel=0.003, name="book")
        by += bw + 0.006
        k += 1
        if k % 12 == 0:
            by += 0.09

# 吧台柜体 + 台面
BAR_X = X0 + 0.72
box(0.54, 2.6, 0.90, BAR_X, 1.55, 0.45, M_WOOD_M, bevel=0.012, name="barcab")
box(0.64, 2.7, 0.07, BAR_X, 1.55, 0.94, M_WOOD_D, bevel=0.008, name="bartop")
for by in (0.55, 1.55, 2.55):
    box(0.58, 0.80, 0.032, BAR_X, by, 0.50, M_WOOD_D, bevel=0.006, name="bardoor")
    cyl(0.017, 0.017, 0.09, BAR_X + 0.33, by, 0.62, M_BRASS,
        rot=(0, math.radians(90), 0), verts=12, name="h")

# 咖啡机
box(0.36, 0.34, 0.36, BAR_X, 0.95, 1.20, M_BLACK, bevel=0.012, name="esp")
box(0.26, 0.10, 0.24, BAR_X, 0.95, 1.02, M_STEEL, bevel=0.008, name="esp2")
cyl(0.05, 0.05, 0.04, BAR_X + 0.06, 0.95, 1.40, M_STEEL, verts=16, name="esp3")

# 玻璃展示柜
box(0.44, 0.36, 0.42, BAR_X, 2.35, 1.21, M_GLASS, name="display")
box(0.46, 0.38, 0.02, BAR_X, 2.35, 1.00, M_WOOD_D, name="dshelf")
for i in range(6):
    box(0.05, 0.05, 0.05, BAR_X, 2.20 + (i % 3) * 0.11, 1.06 + (i // 3) * 0.02,
        pbr("cake%d" % i, (0.58, 0.42, 0.24), 0.70), bevel=0.005, name="cake")

# 菜单黑板（挂在书架与吧台之间上方）
box(0.04, 0.62, 0.46, SHELF_X + 0.18, 2.9, 2.62, M_BLACK, name="menu")
box(0.05, 0.68, 0.52, SHELF_X + 0.17, 2.9, 2.62, M_WOOD_M, name="menuframe")

# ============================== 家具 ==============================
def rattan_chair(x, y, rz):
    cr, sr = math.cos(rz), math.sin(rz)
    soft(0.60, 0.56, 0.16, x, y, 0.45, M_FABRIC, 0.07, 2, 0.010, (0, 0, rz), "seat")
    soft(0.58, 0.14, 0.50, x - sr * 0.24, y + cr * 0.24, 0.72, M_FABRIC,
         0.07, 2, 0.008, (math.radians(8), 0, rz), "back")
    for s in (-1, 1):
        soft(0.09, 0.54, 0.28, x + s * 0.27 * cr, y + s * 0.27 * sr, 0.57,
             M_RATTAN, 0.035, 2, 0.004, (0, 0, rz), "arm")
    for lx, ly in ((-0.23, -0.21), (0.23, -0.21), (-0.23, 0.21), (0.23, 0.21)):
        cyl(0.021, 0.017, 0.42, x + lx * cr - ly * sr, y + lx * sr + ly * cr,
            0.21, M_WOOD_D, verts=10, name="leg")


def round_table(x, y, r=0.42, h=0.72):
    cyl(r, r, 0.045, x, y, h, M_WOOD_M, verts=32, name="top")
    cyl(r * 0.40, r * 0.32, h - 0.05, x, y, (h - 0.05) / 2, M_WOOD_D, verts=20, name="ped")
    cyl(r * 0.60, r * 0.60, 0.035, x, y, 0.017, M_WOOD_D, verts=24, name="foot")


def candle(x, y, z, h=0.16, r=0.032):
    cyl(r, r, h, x, y, z + h / 2, M_WAX, verts=16, name="candle")
    sph(0.015, x, y, z + h + 0.022, M_FLAME, (0.65, 0.65, 1.5), "flame")


# 左：圆桌 + 两把藤椅
round_table(1.90, 3.30)
rattan_chair(2.25, 3.50, math.radians(-38))
rattan_chair(1.15, 3.72, math.radians(20))
candle(1.92, 3.42, 0.745, 0.15)
candle(1.72, 3.68, 0.745, 0.11)
cyl(0.042, 0.036, 0.07, 2.02, 3.72, 0.78, M_CERAMIC, verts=16, name="cup")
cyl(0.072, 0.068, 0.008, 2.02, 3.72, 0.742, M_CERAMIC, verts=18, name="saucer")

# 中：第二张圆桌
round_table(0.30, 3.30, 0.44)
candle(0.20, 3.16, 0.745, 0.20)
candle(0.42, 3.42, 0.745, 0.14)
candle(0.28, 3.54, 0.745, 0.26)

# 前：矮圆茶几
cyl(0.62, 0.62, 0.10, 0.05, 4.45, 0.42, M_WOOD_M, verts=40, name="lowtop")
cyl(0.53, 0.56, 0.34, 0.05, 4.45, 0.18, M_WOOD_D, verts=32, name="lowbase")
for cx, cy, ch in ((-0.78, 5.60, 0.22), (-0.66, 5.84, 0.34),
                   (-0.50, 5.66, 0.18), (-0.34, 5.86, 0.28),
                   (-0.88, 5.90, 0.15)):
    candle(cx, cy, 0.475, ch)
cyl(0.062, 0.052, 0.09, 0.30, 4.26, 0.51,
    pbr("pot", (0.20, 0.145, 0.105), 0.84), verts=16, name="pot")
for i in range(6):
    a = i * 1.15
    sph(0.048, 0.30 + 0.042 * math.cos(a), 4.26 + 0.042 * math.sin(a),
        0.58 + (i % 2) * 0.040, M_LEAF if i % 2 else M_LEAF2,
        (1.3, 1.0, 0.55), "pleaf")

# 地毯
box(3.0, 2.2, 0.012, 0.15, 4.30, 0.008, M_PLAID, name="rug")

# 前景布艺坐垫
soft(0.88, 0.64, 0.20, -0.45, 5.05, 0.12, M_PLAID, 0.10, 2, 0.030,
     (0, 0, math.radians(9)), "pouf")
soft(0.72, 0.56, 0.17, 0.75, 5.10, 0.10, M_PLAID, 0.09, 2, 0.026,
     (0, 0, math.radians(-11)), "pouf2")

# 壁炉（右前角）
box(0.60, 0.90, 1.42, X0 + 0.38, 4.35, 0.71, M_BRICK, bevel=0.02, name="fp")
box(0.09, 0.56, 0.54, X0 + 0.65, 4.35, 0.42, M_FLAME, name="fire")
for i in range(7):
    cyl(0.046, 0.041, 0.28, X0 + 0.86 - (i % 3) * 0.08, 4.00 + (i // 3) * 0.10,
        0.05 + (i % 2) * 0.07, M_LOG,
        rot=(0, math.radians(90), math.radians(i * 19)), verts=8, name="log")

# 左墙搁板（参考图左侧有置物）
for sy in (1.45, 1.95):
    box(0.28, 2.0, 0.045, X1 - 0.18, 3.10, sy, M_WOOD_M, bevel=0.006, name="lboard")

# ============================== 环形吊灯 ==============================
RX, RY, RZ = 0.05, 3.35, 2.15
bpy.ops.mesh.primitive_torus_add(major_radius=0.54, minor_radius=0.030,
                                 major_segments=56, minor_segments=12,
                                 location=(RX, RY, RZ))
ring = bpy.context.object
ring.data.materials.append(M_RING)
for a in (0.4, 2.5, 4.6):
    cyl(0.005, 0.005, H - RZ, RX + 0.54 * math.cos(a), RY + 0.54 * math.sin(a),
        (H + RZ) / 2, M_BLACK, verts=6, name="wire")
# 垂挂绿植
for i in range(14):
    a = (i / 14) * math.tau
    vx, vy = 0.54 * math.cos(a), 0.54 * math.sin(a)
    for j in range(2 + (i % 4)):
        r = 0.015 + ((i + j) % 3) * 0.006
        sph(r, RX + vx + math.sin(i * 5.1 + j) * 0.05,
            RY + vy + math.cos(i * 4.3 + j) * 0.05,
            RZ - j * (0.075 + (i % 3) * 0.015),
            M_LEAF if (i + j) % 2 else M_LEAF2,
            (0.80, 0.50, 1.6), "vine")

# 两个玻璃罩吊灯
for lx, ly in ((3.05, 4.4), (-0.95, 2.8)):
    cyl(0.005, 0.005, 0.95, lx, ly, H - 0.48, M_BLACK, verts=6, name="cord")
    sph(0.12, lx, ly, H - 1.02, M_BULB, (1, 1, 1.15), "bulb")

# ============================== 窗外花园 ==============================
GARDEN = r"D:\work_future\fucking\work10000\.tmp\cafe-garden.jpg"
if os.path.exists(GARDEN):
    gm = bpy.data.materials.new("gardenbg")
    gm.use_nodes = True
    nt = gm.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(GARDEN)
    tex.extension = 'EXTEND'
    nt.links.new(tex.outputs["Color"], e.inputs["Color"])
    e.inputs["Strength"].default_value = 1.6
    nt.links.new(e.outputs["Emission"], out.inputs["Surface"])
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.80, H / 2 - 0.10))
    gp = bpy.context.object
    gp.scale = (W + 4, H + 2.2, 1)
    gp.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    gp.data.materials.append(gm)

# ============================== 灯光 ==============================
def area(size, power, loc, color, rot):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object
    l.data.shape = 'SQUARE'
    l.data.size = size
    l.data.energy = power
    l.data.color = color
    l.rotation_euler = rot
    return l


# 窗外冷光（主光）
area(7.0, 2600, (0, -1.2, 2.0), (0.74, 0.84, 0.88), (math.radians(74), 0, 0))
# 室内顶部暖光
area(4.4, 980, (0, 2.6, H - 0.18), (1.0, 0.80, 0.56), (math.radians(180), 0, 0))
# 环形灯补光
area(0.95, 130, (RX, RY, RZ - 0.05), (1.0, 0.86, 0.62), (math.radians(180), 0, 0))
# 壁炉
area(0.45, 120, (X0 + 0.72, 4.35, 0.52), (1.0, 0.50, 0.16), (0, math.radians(-90), 0))
# 蜡烛点光
for cx, cy, cz in ((-2.62, 4.42, 0.95), (0.14, 4.58, 1.05),
                   (-0.66, 5.84, 0.85), (-0.50, 5.66, 0.70)):
    bpy.ops.object.light_add(type='POINT', location=(cx, cy, cz))
    pl = bpy.context.object
    pl.data.energy = 10
    pl.data.color = (1.0, 0.60, 0.26)
    pl.data.shadow_soft_size = 0.03

# ============================== 世界 & 体积雾 ==============================
SC.world.use_nodes = True
wnt = SC.world.node_tree
wnt.nodes.clear()
wout = wnt.nodes.new("ShaderNodeOutputWorld")
wbg = wnt.nodes.new("ShaderNodeBackground")
wbg.inputs["Color"].default_value = (0.050, 0.060, 0.065, 1)
wbg.inputs["Strength"].default_value = 0.30
wnt.links.new(wbg.outputs["Background"], wout.inputs["Surface"])

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, D / 2, H / 2))
vol = bpy.context.object
vol.scale = (W - 0.4, D - 0.4, H - 0.14)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
vm = bpy.data.materials.new("vol")
vm.use_nodes = True
vnt = vm.node_tree
vnt.nodes.clear()
vout = vnt.nodes.new("ShaderNodeOutputMaterial")
sc = vnt.nodes.new("ShaderNodeVolumeScatter")
sc.inputs["Color"].default_value = (0.92, 0.88, 0.80, 1)
sc.inputs["Density"].default_value = 0.018
sc.inputs["Anisotropy"].default_value = 0.45
vnt.links.new(sc.outputs["Volume"], vout.inputs["Volume"])
vol.data.materials.append(vm)

# ============================== 相机 ==============================
bpy.ops.object.camera_add(location=(0.02, 5.38, 1.58))
cam = bpy.context.object
cam.data.lens = 21
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = 4.4
cam.data.dof.aperture_fstop = 4.0
target = Vector((0.05, 0.05, 1.38))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
SC.camera = cam

SC.render.filepath = r"D:\work_future\fucking\work10000\.tmp\cafe-blender.jpg"
SC.render.image_settings.file_format = 'JPEG'
SC.render.image_settings.quality = 92
bpy.ops.render.render(write_still=True)
print("CAFE_BLENDER_DONE")
