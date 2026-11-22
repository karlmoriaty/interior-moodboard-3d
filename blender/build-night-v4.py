"""
夜景公寓 v4 —— 精细建模版。

v3 的问题（用户：既不真实也不美观）：
  1. 床是几个白盒子叠起来，没有床架结构、没有褶皱、没有床裙
  2. 被子/枕头都是圆角方块，读不出「布」的感觉
  3. 墙面空、地面只有一条地毯、没有生活痕迹
  4. 3D 楼群剪影从窗口透出来，几个绿方块悬在中景

v4 的做法：全部手工建模（Poly Haven 只有 522 个模型、没有现代床，
且其 PBR 贴图材质与本项目「顶点色 + 单材质」管线不兼容）。

结构：
  床：床架（横档 + 四腿）→ 床垫（双层）→ 床单（垂边）→ 被子（褶皱 + 翻折）
      → 双枕（饱满形，中间微凹）→ 抱枕 ×2 → 床尾毯（横铺）
  软包床头板（三块分割 + 缝线）
  床头柜 ×2（抽屉 + 铜把手）+ 台灯 ×2（金属杆 + 布罩）
  通顶衣柜（四门 + 玻璃格 + 铜把手 + 内部挂杆）
  书桌 + 椅 + 笔记本 + 书堆 + 笔筒
  地毯（厚边 + 织纹）、木地板（长条缝）
  挂画 ×3、壁灯、窗帘、大叶绿植、搭在椅背的衣服、拖鞋
"""
import bpy
import bmesh
import math
import os
import random

OUT = r"D:\work_future\fucking\work10000\.tmp\nightscene\nightScene.glb"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
random.seed(11)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for bl in (bpy.data.meshes, bpy.data.materials):
    for b in list(bl):
        if b.users == 0:
            bl.remove(b)

MAT = None


def ensure_mat():
    global MAT
    if MAT is None:
        MAT = bpy.data.materials.new("nightMat")
        MAT.use_nodes = True
    return MAT


def vcol(obj, rgb):
    me = obj.data
    if not me.color_attributes:
        me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
    layer = me.color_attributes["Col"]
    me.color_attributes.active_color_name = "Col"
    for i in range(len(layer.data)):
        layer.data[i].color = (rgb[0], rgb[1], rgb[2], 1.0)
    me.materials.append(ensure_mat())


def finish(obj, name, smooth=True):
    obj.name = name
    if not obj.data.materials:
        obj.data.materials.append(ensure_mat())
    bpy.context.view_layer.objects.active = obj
    if smooth:
        bpy.ops.object.shade_smooth()
    return obj


def box(w, d, h, x, y, z, rgb, name="box", bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    if bevel > 0:
        bpy.ops.object.modifier_add(type='BEVEL')
        bv = o.modifiers[-1]
        bv.width = bevel
        bv.segments = 2
        bpy.ops.object.modifier_apply(modifier=bv.name)
    vcol(o, rgb)
    return finish(o, name)


def cyl(r, h, x, y, z, rgb, name="cyl", verts=24, rot=(0, 0, 0), r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r,
                                    radius2=r if r2 is None else r2,
                                    depth=h, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    vcol(o, rgb)
    return finish(o, name)


def cloth(w, d, h, x, y, z, rgb, name, cuts=4, level=1, wrinkle=0.0, bevel=0.03, rot=(0, 0, 0)):
    """布件：先细分再 subsurf，避免 8 顶点方块塌成椭球。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode='OBJECT')
    if wrinkle > 0:
        tex = bpy.data.textures.new(name + "_w", 'CLOUDS')
        tex.noise_scale = 0.28
        tex.noise_depth = 2
        bpy.ops.object.modifier_add(type='DISPLACE')
        o.modifiers[-1].texture = tex
        o.modifiers[-1].strength = wrinkle
        o.modifiers[-1].mid_level = 0.5
    if level > 0:
        bpy.ops.object.modifier_add(type='SUBSURF')
        o.modifiers[-1].levels = level
        o.modifiers[-1].render_levels = level
    if bevel > 0:
        bpy.ops.object.modifier_add(type='BEVEL')
        o.modifiers[-1].width = bevel
        o.modifiers[-1].segments = 2
    for m in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception:
            pass
    vcol(o, rgb)
    return finish(o, name)


# ---------- 色板 ----------
C_FLOOR = (0.150, 0.098, 0.068)
C_FLOOR_D = (0.105, 0.068, 0.047)
C_WALL = (0.088, 0.082, 0.084)
C_WOOD = (0.150, 0.100, 0.070)
C_WOOD_D = (0.078, 0.052, 0.038)
C_SHEET = (0.870, 0.856, 0.830)
C_SHEET_D = (0.760, 0.744, 0.718)
C_DUVET = (0.680, 0.668, 0.645)
C_DUVET_D = (0.585, 0.572, 0.552)
C_PILLOW = (0.900, 0.888, 0.862)
C_HEAD = (0.105, 0.088, 0.078)
C_RUG = (0.195, 0.188, 0.192)
C_METAL = (0.115, 0.115, 0.122)
C_BRASS = (0.460, 0.360, 0.150)
C_LAMP = (1.000, 0.930, 0.790)
C_PLANT = (0.085, 0.145, 0.100)
C_PLANT_D = (0.055, 0.098, 0.068)
C_CURTAIN = (0.300, 0.290, 0.278)
C_SHEER = (0.560, 0.556, 0.545)
C_ART = [(0.155, 0.195, 0.225), (0.280, 0.200, 0.140), (0.205, 0.215, 0.185)]
C_GLASS = (0.185, 0.205, 0.230)
C_CLOTH = (0.300, 0.245, 0.220)

W, D, H = 8.0, 6.0, 3.0

# ============================== 壳体 ==============================
box(W, D, 0.06, 0, D / 2, -0.03, C_FLOOR, "floor")
for i in range(16):
    box(0.010, D - 0.08, 0.008, -W / 2 + 0.25 + i * 0.5, D / 2, 0.002, C_FLOOR_D, "seam%d" % i)

# 窗墙（后墙）：整面落地窗
for sx in (-1, 1):
    box(0.55, 0.14, H, sx * (W / 2 - 0.275), 0.07, H / 2, C_WALL, "winJamb%d" % sx)
# 竖梃 6 根 + 横档 2 道
for i in range(6):
    box(0.055, 0.12, 2.80, -3.05 + i * 1.22, 0.06, 1.45, C_METAL, "mullion%d" % i)
for ti in range(3):
    box(2.3, 0.075, 0.035, -2.3 + ti * 2.3, 0.06, 2.86, C_METAL, "transomT%d" % ti)
box(W - 1.1, 0.075, 0.035, 0, 0.06, 0.10, C_METAL, "transomB")

# 左右墙
box(0.14, D, H, -W / 2 + 0.07, D / 2, H / 2, C_WALL, "wallL")
box(0.14, D, H, W / 2 - 0.07, D / 2, H / 2, C_WALL, "wallR")

# ============================== 床（靠左墙，X 正向）==============================
# 导出 rotation.y=π 会翻转 X，所以这里按「页面左侧」反向布置
BX0, BX1 = 1.72, 3.88       # 床宽方向（X）
BY0, BY1 = 1.42, 3.72       # 床长方向（Y）
BCX, BCY = (BX0 + BX1) / 2, (BY0 + BY1) / 2
BW, BD = BX1 - BX0, BY1 - BY0

# 软包床头板：贴右墙（导出后在页面左侧），三块分割
for i in range(3):
    hy = BY0 + 0.08 + (i + 0.5) * (BD - 0.16) / 3
    hw = (BD - 0.16) / 3 - 0.025
    cloth(0.12, hw, 0.98, BX1 - 0.06, hy, 0.62, C_HEAD, "head%d" % i, 3, 1, 0.006, 0.02)
box(0.05, BD + 0.06, 1.32, BX1 - 0.015, BCY, 0.66, C_WOOD_D, "headFrame", 0.008)

# 床架：横档 + 四腿
box(BW - 0.06, BD - 0.06, 0.20, BCX, BCY, 0.30, C_WOOD_D, "bedBase", 0.012)
box(BW - 0.02, BD - 0.02, 0.085, BCX, BCY, 0.385, C_WOOD, "bedRail", 0.010)
for lx in (BX0 + 0.10, BX1 - 0.10):
    for ly in (BY0 + 0.10, BY1 - 0.10):
        cyl(0.042, 0.24, lx, ly, 0.12, C_WOOD_D, "bedLeg", 12, r2=0.030)

# 床垫：双层（底垫 + 顶垫），顶垫圆角更大
cloth(BW - 0.10, BD - 0.10, 0.17, BCX, BCY, 0.49, C_SHEET_D, "mattressLow", 6, 1, 0.0, 0.045)
cloth(BW - 0.06, BD - 0.06, 0.15, BCX, BCY, 0.645, C_SHEET, "mattressTop", 8, 1, 0.004, 0.05)

# 床单：铺满 + 四边垂下
cloth(BW - 0.02, BD - 0.02, 0.030, BCX, BCY, 0.725, C_SHEET, "sheetTop", 10, 1, 0.005, 0.012)
for sy, sd in ((BY0, BD - 0.02), (BY1, BD - 0.02)):
    cloth(BW - 0.02, 0.020, 0.20, BCX, sy, 0.63, C_SHEET, "sheetHang%d" % int(sy * 10), 8, 1, 0.006, 0.006)

# 被子：盖住 3/5，褶皱明显，靠脚端翻折
cloth(BW - 0.04, BD * 0.58, 0.115, BCX + 0.06, BCY - 0.52, 0.795,
      C_DUVET, "duvet", 12, 1, 0.022, 0.045)
# 被子翻边（露出内侧浅色）
cloth(BW - 0.10, 0.20, 0.085, BCX + 0.06, BCY - 0.30, 0.828,
      C_DUVET_D, "duvetFold", 8, 1, 0.010, 0.03)
# 床尾毯：横铺一条，两端垂下
cloth(BW - 0.02, 0.42, 0.075, BCX, BY0 + 0.30, 0.812,
      (0.245, 0.215, 0.205), "throw", 10, 1, 0.014, 0.035)

# 枕头：饱满（细分后 subsurf，中间微凹靠两块拼）
for py in (BCY - 0.40, BCY + 0.40):
    cloth(0.50, 0.68, 0.215, BX1 - 0.40, py, 0.815, C_PILLOW,
          "pillow%d" % int(py * 10), 7, 1, 0.012, 0.075)
# 抱枕两个（斜靠）
cloth(0.36, 0.36, 0.135, BX1 - 0.50, BCY - 0.14, 0.865,
      (0.265, 0.235, 0.215), "cushionA", 6, 1, 0.010, 0.05, rot=(0, 0, 0.22))
cloth(0.32, 0.32, 0.120, BX1 - 0.46, BCY + 0.26, 0.858,
      (0.330, 0.300, 0.262), "cushionB", 6, 1, 0.010, 0.045, rot=(0, 0, -0.18))

# ============================== 床头柜 + 台灯 ==============================
for sy, nm in ((BY0 - 0.52, "nsL"), (BY1 + 0.52, "nsR")):
    box(0.48, 0.44, 0.46, BX1 - 0.30, sy, 0.25, C_WOOD, nm, 0.010)
    # 两层抽屉 + 缝 + 铜把手
    for di, dz in enumerate((0.32, 0.14)):
        box(0.44, 0.40, 0.185, BX1 - 0.30, sy, dz, C_WOOD, "%sDrawer%d" % (nm, di), 0.006)
        box(0.46, 0.012, 0.008, BX1 - 0.30, sy - 0.205, dz + 0.098, C_WOOD_D, "%sSeam%d" % (nm, di))
        cyl(0.014, 0.075, BX1 - 0.545, sy, dz, C_BRASS, "%sKnob%d" % (nm, di), 10, rot=(0, math.pi / 2, 0))
    # 台灯：底盘 + 杆 + 布罩（锥台）
    cyl(0.080, 0.018, BX1 - 0.30, sy, 0.492, C_METAL, nm + "base", 20)
    cyl(0.011, 0.26, BX1 - 0.30, sy, 0.625, C_METAL, nm + "pole", 12)
    cyl(0.118, 0.175, BX1 - 0.30, sy, 0.815, C_LAMP, nm + "shade", 20, r2=0.086)
    # 灯罩顶盖
    cyl(0.088, 0.012, BX1 - 0.30, sy, 0.905, C_METAL, nm + "cap", 16)

# 床头柜小物：书 + 杯子 + 眼镜
box(0.19, 0.135, 0.030, BX1 - 0.32, BY1 + 0.60, 0.48, (0.400, 0.230, 0.175), "bookNs", 0.003)
box(0.17, 0.120, 0.024, BX1 - 0.31, BY1 + 0.60, 0.508, (0.235, 0.270, 0.225), "bookNs2", 0.003)
cyl(0.030, 0.070, BX1 - 0.46, BY0 - 0.60, 0.492, (0.860, 0.845, 0.815), "cupNs", 14)

# ============================== 通顶衣柜（左墙）==============================
CX = -W / 2 + 0.34
box(0.60, 3.05, 2.52, CX, 2.55, 1.26, C_WOOD, "wardrobe", 0.012)
# 四扇门：木框 + 中间玻璃格
for i in range(4):
    dy = 1.24 + i * 0.72
    box(0.024, 0.66, 2.30, CX + 0.31, dy + 0.35, 1.20, C_WOOD_D, "wDoor%d" % i, 0.005)
    box(0.016, 0.54, 0.95, CX + 0.33, dy + 0.35, 1.72, C_GLASS, "wGlass%d" % i, 0.004)
    box(0.016, 0.54, 0.62, CX + 0.33, dy + 0.35, 0.62, C_WOOD, "wPanel%d" % i, 0.004)
    # 竖把手
    box(0.022, 0.016, 0.30, CX + 0.345, dy + 0.66, 1.32, C_BRASS, "wKnob%d" % i)
# 顶柜分缝 + 踢脚
box(0.60, 3.05, 0.022, CX, 2.55, 2.50, C_WOOD_D, "wTopSeam")
box(0.56, 3.05, 0.055, CX, 2.55, 0.028, C_WOOD_D, "wPlinth")

# ============================== 书桌区（窗边）==============================
DKX, DKY = -1.15, 0.78
box(1.50, 0.58, 0.045, DKX, DKY, 0.735, C_WOOD, "deskTop", 0.006)
for dx in (-0.68, 0.68):
    for dy in (-0.24, 0.24):
        box(0.040, 0.040, 0.71, DKX + dx, DKY + dy, 0.358, C_METAL, "deskLeg")
# 桌面物件
box(0.35, 0.25, 0.014, DKX + 0.12, DKY - 0.06, 0.766, (0.155, 0.155, 0.160), "laptop", 0.003)
box(0.35, 0.012, 0.215, DKX + 0.12, DKY - 0.185, 0.858, (0.140, 0.140, 0.146), "laptopLid", 0.003)
cyl(0.047, 0.008, DKX - 0.52, DKY + 0.10, 0.762, C_WOOD_D, "coaster", 16)
cyl(0.034, 0.082, DKX - 0.52, DKY + 0.10, 0.807, (0.870, 0.855, 0.825), "cupDesk", 16)
# 书堆 + 笔筒
box(0.23, 0.17, 0.028, DKX - 0.30, DKY + 0.18, 0.772, (0.395, 0.225, 0.170), "dBook1", 0.003)
box(0.21, 0.16, 0.025, DKX - 0.30, DKY + 0.18, 0.799, (0.225, 0.265, 0.220), "dBook2", 0.003)
cyl(0.042, 0.095, DKX + 0.42, DKY + 0.16, 0.803, (0.250, 0.230, 0.210), "cupHolder", 14)

# 椅子
CHX, CHY = DKX, DKY + 0.74
cloth(0.46, 0.46, 0.075, CHX, CHY, 0.44, C_WOOD_D, "chairSeat", 5, 1, 0.004, 0.025)
box(0.44, 0.055, 0.44, CHX, CHY + 0.20, 0.67, C_WOOD_D, "chairBack", 0.015)
for dx in (-0.18, 0.18):
    for dy in (-0.18, 0.18):
        cyl(0.019, 0.44, CHX + dx, CHY + dy, 0.22, C_METAL, "chairLeg", 10)
# 搭在椅背的衣服
cloth(0.30, 0.18, 0.36, CHX, CHY + 0.235, 0.60, C_CLOTH, "clothes", 5, 1, 0.018, 0.03,
      rot=(0.12, 0, 0))

# ============================== 窗帘 ==============================
for sx in (-1, 1):
    for i in range(8):
        off = (i - 3.5) * 0.082
        hgt = 2.66 - abs(i - 3.5) * 0.012
        box(0.075, 0.060, hgt, sx * 3.78 + off, 0.18, hgt / 2 + 0.03,
            C_CURTAIN, "curt%d_%d" % (sx, i), 0.010)
for i, sx in enumerate((-3.5, -2.9, 2.9, 3.5)):
    box(0.40, 0.012, 2.58, sx, 0.11, 1.31, C_SHEER, "sheer%d" % i, 0.003)

# ============================== 挂画 / 壁灯 ==============================
ART_Y = (-0.55, 0.55, 1.75)
for i, gy in enumerate(ART_Y):
    box(0.028, 0.56, 0.74, W / 2 - 0.045, gy, 1.62, C_WOOD_D, "artFrame%d" % i, 0.005)
    box(0.014, 0.47, 0.65, W / 2 - 0.062, gy, 1.62, C_ART[i], "artCanvas%d" % i)
# 壁灯（书房墙上）
cyl(0.055, 0.10, -W / 2 + 0.12, 4.55, 1.95, C_METAL, "wallLampArm", 14, rot=(0, math.pi / 2, 0))
cyl(0.085, 0.13, -W / 2 + 0.22, 4.55, 1.90, C_LAMP, "wallLampShade", 16, r2=0.062)

# ============================== 地毯 ==============================
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.45, 2.35, 0.014))
rug = bpy.context.object
rug.name = "rug"
rug.scale = (3.6, 2.7, 0.016)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.modifier_add(type='BEVEL')
rug.modifiers[-1].width = 0.045
rug.modifiers[-1].segments = 2
bpy.ops.object.modifier_apply(modifier=rug.modifiers[-1].name)
vcol(rug, C_RUG)
finish(rug, "rug")
for i in range(5):
    box(3.4, 0.010, 0.005, 0.45, 1.32 + i * 0.40, 0.024, (0.172, 0.165, 0.170), "rugLine%d" % i)

# ============================== 绿植（窗边）==============================
PX, PY = 3.30, 0.92
cyl(0.17, 0.36, PX, PY, 0.18, (0.245, 0.205, 0.175), "pot", 20, r2=0.215)
cyl(0.215, 0.028, PX, PY, 0.362, (0.085, 0.065, 0.052), "soil", 20)
for i in range(11):
    a = (i / 11) * math.pi * 2
    ln = 0.46 + (i % 3) * 0.16
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.085, radius2=0.006,
                                    depth=ln, location=(PX + math.cos(a) * 0.11,
                                                        PY + math.sin(a) * 0.11,
                                                        0.37 + ln / 2))
    lf = bpy.context.object
    lf.name = "leaf%d" % i
    lf.rotation_euler = (math.sin(a) * 0.38, -math.cos(a) * 0.38, 0)
    bpy.ops.object.transform_apply(rotation=True)
    vcol(lf, C_PLANT if i % 2 else C_PLANT_D)
    finish(lf, lf.name)

# ============================== 地面小物 ==============================
for i, sy in enumerate((2.45, 2.68)):
    cloth(0.105, 0.25, 0.045, 1.55, sy, 0.028, (0.290, 0.265, 0.248), "slipper%d" % i, 4, 1, 0.004, 0.018)
box(0.24, 0.17, 0.030, -0.25, 1.65, 0.032, (0.395, 0.225, 0.170), "gb1", 0.003)
box(0.22, 0.16, 0.026, -0.23, 1.67, 0.060, (0.235, 0.270, 0.225), "gb2", 0.003)

# ============================== 灯带（贴墙，不悬空）==============================

box(0.05, 2.95, 0.020, CX + 0.28, 2.55, 0.050, C_LAMP, "plinthLight")

# ============================== 窗外楼群（远处）==============================
# 不再建 3D 楼群：页面端 cityView 的城市实拍已经有楼，两套叠在一起会出现方块
for i in range(0):
    bw = random.uniform(0.55, 1.35)
    bh = random.uniform(2.0, 4.4)
    bx = random.uniform(-12, 12)
    by = random.uniform(-12.0, -26.0)
    box(bw, bw * 0.8, bh, bx, by, bh / 2 - 2.4,
        (0.062 + random.uniform(0, 0.022), 0.066, 0.080), "tower%d" % i)

# ============================== 合并 + AO + 导出 ==============================
# 打印「悬在 1.7 米以上、跨度超过 1.5 米」的横向构件，定位窗口上方那块可疑黑斜板
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        continue
    xs, ys, zs = [], [], []
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if not xs:
        continue
    ww, dd = max(xs) - min(xs), max(ys) - min(ys)
    zc = (max(zs) + min(zs)) / 2
    if ww > 2.0 or dd > 2.0:
        print("SUS %-16s w=%.2f d=%.2f zc=%.2f x0=%.2f y0=%.2f"
              % (o.name, ww, dd, zc, min(xs), min(ys)))


bpy.ops.object.select_all(action='SELECT')
objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
a = bpy.context.object
a.name = "nightScene"
me = a.data

if me.color_attributes:
    me.color_attributes.active_color_name = "Col"

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

col = me.color_attributes["Col"]
for i in range(len(col.data)):
    c = col.data[i].color
    k = 0.56 + 0.44 * ao.data[i].color[0]
    col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
me.color_attributes.remove(ao)
me.color_attributes.active_color_name = "Col"

one = me.materials[0] if me.materials else None
me.materials.clear()
if one:
    me.materials.append(one)
for poly in me.polygons:
    poly.material_index = 0

tris = sum(len(p.vertices) - 2 for p in me.polygons)
print("NIGHT_V4 tris", tris)
TARGET = 65000
if tris > TARGET:
    dm = a.modifiers.new('d', 'DECIMATE')
    dm.ratio = TARGET / tris
    bpy.ops.object.modifier_apply(modifier=dm.name)
    print("decimated to", TARGET)

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True,
                          export_yup=True, export_materials='EXPORT',
                          export_normals=False, export_texcoords=False,
                          export_vertex_color='ACTIVE', export_cameras=False,
                          export_lights=False)
print("NIGHT_V4_DONE", os.path.getsize(OUT))
