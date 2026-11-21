"""
夜景公寓 · Blender 仿真场景

参考图要点：
- 转角落地窗，窗外是密集摩天楼群（几十栋，玻璃幕墙格子灯火）+ 中央蓝紫塔
- 楼宇间有雾和大气透视，远处变淡
- 室内几乎全黑：暖黄吊顶灯带沿折线走、蓝色 LED 沿窗框/踢脚线、
  壁炉橙光、一个白球落地灯
- 标志性细节：蓝色 LED 在地板上拉出的反光长条、凌乱白色被褥

坐标：X 右 / Y 深（Y=0 是主窗墙）/ Z 高。参数顺序 (宽, 深, 高, x, y, z)。
"""
import bpy
import math
import random
import numpy as np
from mathutils import Vector

random.seed(20261121)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(block):
        if b.users == 0:
            block.remove(b)

SC = bpy.context.scene
SC.render.engine = 'CYCLES'
SC.cycles.samples = 220
SC.cycles.use_denoising = True
SC.render.resolution_x = 1500
SC.render.resolution_y = 880

W, D, H = 8.4, 6.4, 3.15
X0, X1 = -W / 2, W / 2


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
            t.inputs["Distortion"].default_value = 8.0
        else:
            t = nt.nodes.new("ShaderNodeTexNoise")
            t.inputs["Scale"].default_value = noise
            t.inputs["Detail"].default_value = 6.0
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.012
        nt.links.new(t.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


M_FLOOR = pbr("floor", (0.048, 0.032, 0.022), 0.16, 0.04, wave=1.6, bump=0.12)
M_DARK = pbr("dark_panel", (0.022, 0.021, 0.024), 0.52, 0.10, noise=60, bump=0.16)
M_SLAT = pbr("wood_slat", (0.062, 0.040, 0.028), 0.48, 0.05, wave=3.2, bump=0.22)
M_CEIL = pbr("ceiling", (0.014, 0.013, 0.015), 0.90, 0.0, noise=40, bump=0.06)
M_BEDBASE = pbr("bedbase", (0.038, 0.030, 0.026), 0.58, 0.05, noise=90, bump=0.14)
M_SHEET = pbr("sheet", (0.760, 0.735, 0.690), 0.92, 0.0, noise=300, bump=0.24)
M_DUVET = pbr("duvet", (0.700, 0.672, 0.625), 0.94, 0.0, noise=250, bump=0.30)
M_BRICK = pbr("brick", (0.115, 0.062, 0.048), 0.92, 0.0, noise=70, bump=0.24)
M_BLACK = pbr("blackmat", (0.016, 0.016, 0.018), 0.44, 0.35)
M_RUG = pbr("rug", (0.085, 0.082, 0.080), 0.96, 0.0, noise=200, bump=0.20)
M_LEAF = pbr("leaf", (0.045, 0.090, 0.048), 0.76, 0.0, noise=210, bump=0.26)


def emit(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs["Emission"], o.inputs["Surface"])
    return m


M_LED_WARM = emit("led_warm", (1.0, 0.72, 0.34), 14)
M_LED_BLUE = emit("led_blue", (0.10, 0.52, 1.0), 5.5)
M_FIRE = emit("fire", (1.0, 0.40, 0.10), 14)
M_BULB = emit("bulb", (1.0, 0.88, 0.70), 9)

M_GLASS = bpy.data.materials.new("glass")
M_GLASS.use_nodes = True
gb = M_GLASS.node_tree.nodes["Principled BSDF"]
gb.inputs["Base Color"].default_value = (0.86, 0.90, 0.94, 1)
gb.inputs["Roughness"].default_value = 0.03
gb.inputs["Transmission Weight"].default_value = 0.97
gb.inputs["IOR"].default_value = 1.46


# ============================== 建体 ==============================
def box(w, d, h, x, y, z, mat, rot=(0, 0, 0), bevel=0.0, name="box"):
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


def soft(w, d, h, x, y, z, mat, bevel=0.05, subdiv=2, wrinkle=0.0,
         rot=(0, 0, 0), name="soft"):
    o = box(w, d, h, x, y, z, mat, rot, bevel, name)
    if wrinkle > 0:
        s1 = o.modifiers.new("p", 'SUBSURF')
        s1.levels = 2
        bpy.ops.object.modifier_apply(modifier=s1.name)
        t = bpy.data.textures.new("w" + name, 'CLOUDS')
        t.noise_scale = 0.20
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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=r,
                                         location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


# ============================== 城市楼群 ==============================
# 窗格贴图：程序化生成，不同亮度的窗格 + 少量整层通亮
def make_window_tex(name, w=64, h=128, lit=0.52):
    arr = np.zeros((h, w, 4), dtype=np.float32)
    arr[:, :, 3] = 1.0
    warm = [(1.00, 0.80, 0.52), (1.00, 0.90, 0.70), (0.95, 0.86, 0.66)]
    cool = [(0.62, 0.80, 1.00), (0.78, 0.90, 1.00)]
    for gy in range(0, h, 5):
        for gx in range(0, w, 4):
            if random.random() < lit:
                c = random.choice(warm) if random.random() < 0.72 else random.choice(cool)
                k = 0.55 + random.random() * 0.9
                arr[gy:gy + 3, gx:gx + 2, 0] = c[0] * k
                arr[gy:gy + 3, gx:gx + 2, 1] = c[1] * k
                arr[gy:gy + 3, gx:gx + 2, 2] = c[2] * k
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels = arr.ravel().tolist()
    return img


WIN_TEX = make_window_tex("windows", 64, 128, 0.52)
WIN_TEX2 = make_window_tex("windows2", 48, 96, 0.38)

m_city = bpy.data.materials.new("city")
m_city.use_nodes = True
nt = m_city.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
em = nt.nodes.new("ShaderNodeEmission")
tc = nt.nodes.new("ShaderNodeTexCoord")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = WIN_TEX
tex.extension = 'REPEAT'
mp = nt.nodes.new("ShaderNodeMapping")
mp.inputs["Scale"].default_value = (1, 1, 1)
nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
nt.links.new(tex.outputs["Color"], em.inputs["Color"])
em.inputs["Strength"].default_value = 0.85
nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

m_city2 = bpy.data.materials.new("city2")
m_city2.use_nodes = True
nt2 = m_city2.node_tree
nt2.nodes.clear()
out2 = nt2.nodes.new("ShaderNodeOutputMaterial")
em2 = nt2.nodes.new("ShaderNodeEmission")
tc2 = nt2.nodes.new("ShaderNodeTexCoord")
tex2 = nt2.nodes.new("ShaderNodeTexImage")
tex2.image = WIN_TEX2
tex2.extension = 'REPEAT'
mp2 = nt2.nodes.new("ShaderNodeMapping")
mp2.inputs["Scale"].default_value = (1.6, 1.4, 1)
nt2.links.new(tc2.outputs["Object"], mp2.inputs["Vector"])
nt2.links.new(mp2.outputs["Vector"], tex2.inputs["Vector"])
nt2.links.new(tex2.outputs["Color"], em2.inputs["Color"])
em2.inputs["Strength"].default_value = 0.60
nt2.links.new(em2.outputs["Emission"], out2.inputs["Surface"])

# 城市：用参考图裁出的真实照片（.tmp/crop-city.py 生成）。
# 程序化楼群试过三轮：楼太近被拉伸成竖条、放远又被体积雾糊平，
# 贴图 UV 在每栋楼只映射一次，怎么调都不像真实城市。
CITY_IMG = r"D:\work_future\fucking\work10000\.tmp\city-crop.jpg"
m_citybg = bpy.data.materials.new("citybg")
m_citybg.use_nodes = True
ntc = m_citybg.node_tree
ntc.nodes.clear()
oc = ntc.nodes.new("ShaderNodeOutputMaterial")
ec = ntc.nodes.new("ShaderNodeEmission")
tcx = ntc.nodes.new("ShaderNodeTexImage")
tcx.image = bpy.data.images.load(CITY_IMG)
ec.inputs["Strength"].default_value = 1.15
ntc.links.new(tcx.outputs["Color"], ec.inputs["Color"])
ntc.links.new(ec.outputs["Emission"], oc.inputs["Surface"])

# 背景板：贴在窗外 16 米，尺寸要覆盖整个窗户视野
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -16, 7.0))
bgp = bpy.context.object
bgp.name = "citybg"
bgp.scale = (44, 27.7, 1)
bgp.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bgp.data.materials.append(m_citybg)

# 侧向也补一块（转角窗能看到左边）
bpy.ops.mesh.primitive_plane_add(size=1, location=(-22, -6, 7.0))
bgp2 = bpy.context.object
bgp2.name = "citybg2"
bgp2.scale = (30, 18.9, 1)
bgp2.rotation_euler = (math.radians(90), 0, math.radians(90))
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bgp2.data.materials.append(m_citybg)

# ============================== 房间 ==============================
# 地板（深色木，低粗糙度有反射）
box(W, D, 0.14, 0, D / 2, -0.07, M_FLOOR, name="floor")
# 天花板
box(W, D, 0.12, 0, D / 2, H + 0.06, M_CEIL, name="ceiling")
# 右墙（X1）与后墙（Y=D）
# 右墙改成长窗（参考图是转角窗）：只保留靠近后侧的实墙段
box(0.14, 2.2, H, X1 + 0.07, D - 1.1, H / 2, M_DARK, name="w_right")
for py in (0.45, 1.85, 3.25):
    box(0.18, 0.10, H - 0.30, X1, py, (H - 0.30) / 2, M_BLACK, name="rf")

box(W, 0.14, H, 0, D + 0.07, H / 2, M_SLAT, name="w_back")
# 左墙（X0）：转角窗，只在后段留实墙
box(0.14, 2.4, H, X0 - 0.07, D - 1.2, H / 2, M_SLAT, name="w_left")

# ---- 窗墙：主窗在 Y=0，侧窗在 X=X0 ----
# 主窗竖框
for px in (-3.55, -1.85, -0.15, 1.55, 3.25):
    box(0.10, 0.18, H - 0.30, px, 0, (H - 0.30) / 2, M_BLACK, name="mf")
box(W - 0.4, 0.18, 0.10, 0, 0, H - 0.30, M_BLACK, name="mftop")
box(W - 0.4, 0.18, 0.10, 0, 0, 0.05, M_BLACK, name="mfbot")
# 主窗玻璃
# v12.4.4：不建玻璃。Cycles 里 transmission 玻璃会把窗外折射糊掉，
# 参考图的玻璃几乎不可见，只留窗框即可。

# 侧窗（左墙前段）
for py in (0.55, 2.05, 3.55):
    box(0.18, 0.10, H - 0.30, X0, py, (H - 0.30) / 2, M_BLACK, name="sf")


# ---- 吊顶折线 + 暖黄灯带 ----
# 一圈下沉吊顶（回字形），灯带藏在边缘
box(5.2, 0.10, 0.22, -0.6, 3.2, H - 0.11, M_CEIL, name="soffit1")
box(0.10, 3.2, 0.22, -3.2, 3.2, H - 0.11, M_CEIL, name="soffit2")
M_LEDW = M_LED_WARM
# 灯带：沿吊顶边缘
box(5.2, 0.05, 0.045, -0.6, 3.14, H - 0.20, M_LEDW, name="led1")
box(0.05, 3.2, 0.045, -3.14, 3.2, H - 0.20, M_LEDW, name="led2")
box(5.2, 0.05, 0.045, -0.6, 1.55, H - 0.20, M_LEDW, name="led3")
# 另一道斜向灯带（参考图左上角有折线）
box(2.6, 0.05, 0.045, 2.4, 3.9, H - 0.20, M_LEDW, name="led4")
box(0.05, 1.6, 0.045, 3.66, 4.6, H - 0.20, M_LEDW, name="led5")

# ---- 蓝色 LED：沿窗台与踢脚，地板上要有反光条 ----
box(W - 0.5, 0.045, 0.035, 0, -0.02, 0.055, M_LED_BLUE, name="bblue1")
box(0.045, 0.035, 0.035, X0 + 0.14, 1.9, 0.055, M_LED_BLUE, name="bblue2")
box(W - 0.5, 0.045, 0.03, 0, 0.16, 0.62, M_LED_BLUE, name="bblue3")

# ============================== 家具 ==============================
# 床：深色床架 + 凌乱白色被褥
BED_X, BED_Y = 0.30, 3.55
box(2.30, 1.95, 0.34, BED_X, BED_Y, 0.17, M_BEDBASE, bevel=0.03, name="bedframe")
box(2.34, 0.16, 0.42, BED_X, BED_Y + 0.95, 0.52, M_BEDBASE, bevel=0.02, name="footboard")
# 床垫
soft(2.18, 1.86, 0.26, BED_X, BED_Y, 0.47, M_SHEET, 0.10, 2, 0.010, name="mattress")
# 被褥：大褶皱堆叠（参考图被子凌乱）
soft(1.78, 1.02, 0.17, BED_X - 0.06, BED_Y - 0.30, 0.64, M_DUVET, 0.14, 2, 0.075,
     (0, 0, math.radians(4)), "duvet1")
soft(1.50, 0.64, 0.12, BED_X + 0.14, BED_Y + 0.26, 0.70, M_DUVET, 0.12, 2, 0.060,
     (0, math.radians(-6), math.radians(-9)), "duvet2")
soft(1.26, 0.40, 0.09, BED_X - 0.24, BED_Y + 0.52, 0.72, M_SHEET, 0.10, 2, 0.048,
     (0, math.radians(7), math.radians(6)), "duvet3")
# 枕头
for px, pz in ((-0.62, 0.80), (0.52, 0.86)):
    soft(0.72, 0.44, 0.22, BED_X + px, BED_Y + pz, 0.70, M_SHEET, 0.10, 2, 0.040,
         (math.radians(-12), 0, random.uniform(-0.15, 0.15)), "pillow")
# 床尾垂下的被子
soft(1.72, 0.36, 0.26, BED_X - 0.02, BED_Y + 0.88, 0.50, M_DUVET, 0.10, 2, 0.050,
     (math.radians(18), 0, 0), "drape")

# 地毯
box(3.6, 2.4, 0.014, BED_X, BED_Y + 0.55, 0.007, M_RUG, name="rug")

# 壁炉（左侧，参考图左下有火）
FX, FY = X0 + 0.55, 4.05
box(0.72, 1.10, 0.90, FX, FY, 0.45, M_BRICK, bevel=0.02, name="firebox")
box(0.06, 0.62, 0.52, FX + 0.38, FY, 0.38, M_FIRE, name="fireopen")
box(0.80, 1.24, 0.08, FX, FY, 0.94, M_DARK, bevel=0.01, name="firetop")

# 书架（左后，黑色 + 书 + 小摆件）
SH_X, SH_Y = X0 + 0.30, 5.55
box(0.36, 1.30, 2.10, SH_X, SH_Y, 1.05, M_BLACK, name="shelfbody")
for sz in (0.86, 1.26, 1.66, 2.00):
    box(0.30, 1.22, 0.03, SH_X, SH_Y, sz, M_DARK, name="shelfbd")
BOOK_MATS = [pbr("b%d" % i, c, 0.86) for i, c in enumerate([
    (0.20, 0.09, 0.08), (0.08, 0.11, 0.16), (0.24, 0.18, 0.09),
    (0.09, 0.14, 0.09), (0.28, 0.22, 0.14)])]
for sz in (0.86, 1.26, 1.66):
    by = SH_Y - 0.55
    k = 0
    while by < SH_Y + 0.55:
        bw = 0.026 + (k % 3) * 0.008
        bh = 0.18 + ((k * 5) % 4) * 0.02
        box(0.20, bw, bh, SH_X, by, sz + bh / 2 + 0.016,
            BOOK_MATS[k % len(BOOK_MATS)], bevel=0.002, name="bk")
        by += bw + 0.005
        k += 1

# 白球落地灯
cyl(0.13, 0.11, 0.035, -2.35, 4.95, 0.017, M_BLACK, verts=20, name="lampbase")
cyl(0.016, 0.014, 1.30, -2.35, 4.95, 0.66, M_BLACK, verts=10, name="lampole")
sph(0.20, -2.35, 4.95, 1.42, M_BULB, name="lampball")

# 窗边矮凳 + 小几
cyl(0.24, 0.24, 0.40, 2.55, 1.55, 0.20, M_BLACK, verts=16, name="stool")
cyl(0.30, 0.30, 0.035, 2.55, 1.55, 0.42, M_SLAT, verts=20, name="stooltop")

# 窗台植物
cyl(0.11, 0.09, 0.16, 3.55, 0.55, 0.10, pbr("pot", (0.10, 0.09, 0.08), 0.86),
    verts=16, name="pot")
for i in range(9):
    a = i * 1.4
    sph(0.075, 3.55 + 0.07 * math.cos(a), 0.55 + 0.07 * math.sin(a),
        0.22 + (i % 4) * 0.075, M_LEAF, (1.2, 0.8, 0.55), "pleaf")

# 右墙木格栅装饰
for i in range(14):
    box(0.06, 0.05, 1.9, -3.30 + i * 0.115, D - 0.14, 1.35, M_SLAT, name="slat")

# ============================== 灯光 ==============================
def area(size, power, loc, color, rot, name="a"):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object
    l.name = name
    l.data.size = size
    l.data.energy = power
    l.data.color = color
    l.rotation_euler = rot
    return l


# 暖黄灯带照明（沿吊顶，向下打）
area(4.6, 20, (-0.6, 3.16, H - 0.26), (1.0, 0.72, 0.36), (0, 0, 0), "led_a1")
area(2.8, 14, (2.4, 3.9, H - 0.26), (1.0, 0.72, 0.36), (0, 0, 0), "led_a2")
# 蓝色 LED 补光（沿窗，很弱）
area(6.0, 12, (0, 0.25, 0.20), (0.15, 0.50, 1.0), (math.radians(90), 0, 0), "blue_a")
# 壁炉暖光
area(0.5, 42, (FX + 0.45, FY, 0.42), (1.0, 0.40, 0.12),
     (0, math.radians(90), 0), "fire_a")
# 落地灯
bpy.ops.object.light_add(type='POINT', location=(-2.35, 4.95, 1.42))
pl = bpy.context.object
pl.data.energy = 13
pl.data.color = (1.0, 0.86, 0.66)
pl.data.shadow_soft_size = 0.16

# 城市冷光从窗灌进来（主光，但很弱，保持室内暗）
area(9.0, 90, (0, -1.6, 1.9), (0.42, 0.62, 1.0), (math.radians(72), 0, 0), "city_a")

# ============================== 世界 + 体积雾 ==============================
SC.world.use_nodes = True
wnt = SC.world.node_tree
wnt.nodes.clear()
wo = wnt.nodes.new("ShaderNodeOutputWorld")
wb = wnt.nodes.new("ShaderNodeBackground")
wb.inputs["Color"].default_value = (0.012, 0.016, 0.026, 1)
wb.inputs["Strength"].default_value = 0.55
wnt.links.new(wb.outputs["Background"], wo.inputs["Surface"])

# 室内薄雾（让灯带和蓝光有体积感）
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, D / 2, H / 2))
vol = bpy.context.object
vol.scale = (W - 0.5, D - 0.5, H - 0.2)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
vm = bpy.data.materials.new("vol")
vm.use_nodes = True
vnt = vm.node_tree
vnt.nodes.clear()
vo = vnt.nodes.new("ShaderNodeOutputMaterial")
sc = vnt.nodes.new("ShaderNodeVolumeScatter")
sc.inputs["Color"].default_value = (0.85, 0.90, 1.0, 1)
sc.inputs["Density"].default_value = 0.008
sc.inputs["Anisotropy"].default_value = 0.55
vnt.links.new(sc.outputs["Volume"], vo.inputs["Volume"])
vol.data.materials.append(vm)

# ============================== 相机 ==============================
bpy.ops.object.camera_add(location=(1.30, 5.90, 1.36))
cam = bpy.context.object
cam.data.lens = 20
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = 4.2
cam.data.dof.aperture_fstop = 5.6
target = Vector((-0.55, 0.0, 1.48))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
SC.camera = cam

SC.render.filepath = r"D:\work_future\fucking\work10000\.tmp\night-blender.jpg"
SC.render.image_settings.file_format = 'JPEG'
SC.render.image_settings.quality = 92
bpy.ops.render.render(write_still=True)
print("NIGHT_BLENDER_DONE")
