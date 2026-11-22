"""
夜景公寓 v3 —— 按真实卧室重做。

旧版的问题（用户：哪哪都不好）：
  1. 床摆在房间正中央，四周全是空地 —— 真实卧室的床一定顶着墙
  2. 没有衣柜、没有书桌、没有窗帘、没有挂画 —— 只有床、地毯、落地灯，
     像家具展厅，不像有人住
  3. 光只有一条顶灯带，床品和墙面没有层次
  4. 墙是木格栅 + 深色漆，但格栅只到一半高度，比例断裂

本版按真实主卧布置（房间 8 宽 × 6 深 × 3 高，Y=0 是窗墙）：
  床头顶左墙，床身沿 X 展开；两侧床头柜 + 台灯
  右墙通顶衣柜（推拉门 + 门缝 + 把手 + 顶柜）
  窗边书桌 + 椅 + 笔记本；窗两侧垂坠窗帘
  床头墙两幅挂画；窗边角落绿植；床尾矮凳
  地毯、抱枕、书堆、杯子、拖鞋等生活痕迹
"""
import bpy
import bmesh
import math
import os
import random

OUT = r"D:\work_future\fucking\work10000\.tmp\nightscene\nightScene.glb"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
random.seed(7)

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


def box(w, d, h, x, y, z, rgb, name="box", bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        bpy.ops.object.modifier_add(type='BEVEL')
        bv = o.modifiers[-1]
        bv.width = bevel
        bv.segments = 2
        bpy.ops.object.modifier_apply(modifier=bv.name)
    vcol(o, rgb)
    return finish(o, name)


def cyl(r, h, x, y, z, rgb, name="cyl", verts=20, rot=(0, 0, 0), r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r,
                                    radius2=r if r2 is None else r2,
                                    depth=h, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    vcol(o, rgb)
    return finish(o, name)


def soft(w, d, h, x, y, z, rgb, name="soft", bevel=0.06, sub=1, wrinkle=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.modifier_add(type='SUBSURF')
    o.modifiers[-1].levels = sub
    o.modifiers[-1].render_levels = sub
    if wrinkle > 0:
        bpy.ops.object.modifier_add(type='DISPLACE')
        tex = bpy.data.textures.new(name + "_t", 'CLOUDS')
        tex.noise_scale = 0.35
        o.modifiers[-1].texture = tex
        o.modifiers[-1].strength = wrinkle
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


# ---------- 色板（夜景：整体暗，靠材质层次和灯光区分） ----------
C_FLOOR = (0.165, 0.108, 0.074)      # 深胡桃木地板
C_WALL = (0.085, 0.078, 0.080)       # 深灰墙
C_CEIL = (0.040, 0.040, 0.044)
C_WOOD = (0.135, 0.090, 0.062)       # 家具木色
C_WOOD_D = (0.072, 0.048, 0.035)
C_SHEET = (0.845, 0.830, 0.800)      # 床单（暖白）
C_DUVET = (0.660, 0.645, 0.620)      # 被子
C_PILLOW = (0.880, 0.865, 0.835)
C_HEAD = (0.150, 0.115, 0.092)       # 床头板
C_RUG = (0.175, 0.165, 0.170)        # 地毯
C_METAL = (0.130, 0.130, 0.135)
C_BRASS = (0.420, 0.330, 0.140)
C_LAMP = (1.000, 0.940, 0.800)       # 灯罩（发光）
C_PLANT = (0.080, 0.135, 0.095)
C_CURTAIN = (0.330, 0.318, 0.305)    # 窗帘
C_SHEER = (0.620, 0.615, 0.605)      # 纱帘
C_ART1 = (0.180, 0.230, 0.260)
C_ART2 = (0.300, 0.215, 0.150)
C_BOOK = (0.420, 0.240, 0.180)
C_WHITE = (0.820, 0.810, 0.780)

W, D, H = 8.0, 6.0, 3.0

# ============================== 房间外壳 ==============================
# 地板：沿 X 铺长条木板（缝）
box(W, D, 0.04, 0, D / 2, -0.02, C_FLOOR, "floor")
for i in range(16):
    px = -W / 2 + 0.25 + i * 0.5
    box(0.012, D - 0.1, 0.006, px, D / 2, 0.003, (0.055, 0.036, 0.026), "seam%d" % i)

# 后墙（窗墙）：整面落地窗，两侧留 0.5 实墙
for sx in (-1, 1):
    box(0.5, 0.12, H, sx * (W / 2 - 0.25), 0.06, H / 2, C_WALL, "winSide%d" % sx)
# 窗框：6 扇
for i in range(6):
    px = -3.0 + i * 1.2
    box(0.06, 0.10, 2.85, px - 0.6, 0.05, 1.47, C_METAL, "mullion%d" % i)
box(W - 1.0, 0.10, 0.06, 0, 0.05, 2.90, C_METAL, "winTop")
box(W - 1.0, 0.10, 0.06, 0, 0.05, 0.04, C_METAL, "winBottom")

# 左墙 / 右墙 / 顶
box(0.12, D, H, -W / 2 + 0.06, D / 2, H / 2, C_WALL, "wallL")
box(0.12, D, H, W / 2 - 0.06, D / 2, H / 2, C_WALL, "wallR")
# 不建屋顶：模型台是俯视剖切展示，加了顶会把整个房间盖住

# ============================== 床（靠左墙）==============================
# 床头贴左墙，床身沿 X 展开：X -3.9 ~ -1.9，Y 1.6 ~ 3.6
BX0, BX1 = 1.86, 3.86
BY0, BY1 = 1.55, 3.55
BCX, BCY = (BX0 + BX1) / 2, (BY0 + BY1) / 2
BW, BD = BX1 - BX0, BY1 - BY0

# 床头板：贴左墙，略高出床垫
box(0.10, BD + 0.10, 1.15, BX1 - 0.05, BCY, 0.575, C_HEAD, "headboard", 0.03)
# 床架（布艺包边）
soft(BW, BD, 0.26, BCX, BCY, 0.24, C_WOOD_D, "bedFrame", 0.02, 1)
# 床腿
for lx in (BX0 + 0.12, BX1 - 0.12):
    for ly in (BY0 + 0.12, BY1 - 0.12):
        cyl(0.045, 0.14, lx, ly, 0.07, C_WOOD_D, "bedLeg", 10)
# 床垫
box(BW - 0.08, BD - 0.08, 0.24, BCX, BCY, 0.49, C_SHEET, "mattress", 0.045)
# 床单：铺在床垫上，四边垂下
box(BW - 0.02, BD - 0.02, 0.06, BCX, BCY, 0.60, C_SHEET, "sheet", 0.018)
# 被子：盖住靠外 2/3
soft(BW - 0.04, BD * 0.62, 0.14, BCX - 0.20, BCY - 0.55, 0.68, C_DUVET, "duvet", 0.05, 1, 0.018)
# 被子翻边
soft(BW - 0.06, 0.16, 0.10, BCX - 0.20, BCY + 0.10, 0.70, C_PILLOW, "fold", 0.035, 1, 0.008)
# 枕头两个（靠床头）
for py in (BCY - 0.42, BCY + 0.42):
    box(0.52, 0.72, 0.20, BX1 - 0.42, py, 0.70, C_PILLOW, "pillow", 0.07)
# 抱枕一个（装饰）
box(0.42, 0.30, 0.16, BX1 - 0.62, BCY + 0.10, 0.76, (0.230, 0.200, 0.185),
     "cushion", 0.05)

# ============================== 床头柜 + 台灯 ==============================
for sy, nm in ((BY0 - 0.42, "nsL"), (BY1 + 0.42, "nsR")):
    box(0.46, 0.42, 0.48, BX1 - 0.28, sy, 0.24, C_WOOD, nm, 0.012)
    # 抽屉缝
    box(0.44, 0.012, 0.010, BX1 - 0.28, sy - 0.21, 0.30, C_WOOD_D, nm + "seam")
    # 拉手
    box(0.012, 0.10, 0.018, BX1 - 0.52, sy, 0.30, C_BRASS, nm + "knob")
    # 台灯：底座 + 灯杆 + 灯罩
    cyl(0.075, 0.02, BX1 - 0.28, sy, 0.49, C_METAL, nm + "lampBase", 16)
    cyl(0.012, 0.22, BX1 - 0.28, sy, 0.60, C_METAL, nm + "lampPole", 10)
    cyl(0.115, 0.16, BX1 - 0.28, sy, 0.76, C_LAMP, nm + "lampShade", 18, r2=0.085)

# 床头柜上的小物：书 + 杯子
box(0.18, 0.13, 0.035, BX1 - 0.30, BY1 + 0.52, 0.50, C_BOOK, "bookNs", 0.004)
cyl(0.032, 0.075, BX1 - 0.46, BY0 - 0.50, 0.52, C_WHITE, "cup", 12)

# ============================== 右墙通顶衣柜 ==============================
CX = -W / 2 + 0.36
box(0.62, 3.0, 2.55, CX, 2.6, 1.275, C_WOOD, "wardrobe", 0.015)
# 四扇门（门缝）
for i in range(4):
    dy = 1.30 + i * 0.72
    box(0.02, 0.66, 2.35, CX + 0.32, dy + 0.36, 1.20, C_WOOD_D, "wdoor%d" % i, 0.006)
    # 把手
    box(0.020, 0.018, 0.28, CX + 0.34, dy + 0.66, 1.32, C_BRASS, "wknob%d" % i)
# 顶柜分缝
box(0.62, 3.0, 0.03, CX, 2.6, 2.44, C_WOOD_D, "wtop")

# ============================== 窗边书桌 + 椅 ==============================
DKX, DKY = 1.35, 0.72
box(1.45, 0.56, 0.05, DKX, DKY, 0.73, C_WOOD, "deskTop", 0.008)
for dx in (-0.66, 0.66):
    for dy in (-0.22, 0.22):
        box(0.045, 0.045, 0.71, DKX + dx, DKY + dy, 0.355, C_METAL, "deskLeg")
# 笔记本
box(0.34, 0.24, 0.015, DKX - 0.10, DKY - 0.04, 0.765, (0.140, 0.140, 0.145), "laptop", 0.004)
box(0.34, 0.012, 0.21, DKX - 0.10, DKY - 0.16, 0.855, (0.120, 0.120, 0.126), "laptopLid", 0.004)
# 杯垫 + 杯子
cyl(0.048, 0.008, DKX + 0.42, DKY + 0.10, 0.760, C_WOOD_D, "coaster", 14)
cyl(0.035, 0.085, DKX + 0.42, DKY + 0.10, 0.805, C_WHITE, "cupDesk", 14)

# 椅子
CHX, CHY = DKX, DKY + 0.72
box(0.44, 0.44, 0.06, CHX, CHY, 0.44, C_WOOD_D, "chairSeat", 0.02)
box(0.44, 0.06, 0.42, CHX, CHY + 0.19, 0.66, C_WOOD_D, "chairBack", 0.02)
for dx in (-0.18, 0.18):
    for dy in (-0.18, 0.18):
        cyl(0.020, 0.44, CHX + dx, CHY + dy, 0.22, C_METAL, "chairLeg", 8)

# ============================== 窗帘 ==============================
# 窗两侧各一幅，从顶垂到地，带纵向褶皱
for sx in (-1, 1):
    cxp = sx * 3.72
    for i in range(7):
        w = 0.10
        off = (i - 3) * 0.085
        hgt = 2.62 - abs(i - 3) * 0.015
        box(w, 0.055, hgt, cxp + off, 0.16, hgt / 2 + 0.02, C_CURTAIN,
            "curt%d_%d" % (sx, i), 0.012)
# 纱帘：窗中间一层，半透感靠亮度
# 纱帘只在两侧各两片，中间留空给城市景观
for i, sx in enumerate((-3.45, -2.85, 2.85, 3.45)):
    box(0.42, 0.012, 2.55, sx, 0.10, 1.30, C_SHEER, "sheer%d" % i, 0.004)

# ============================== 挂画（床头墙）==============================
for gy, gc in ((BCY - 0.60, C_ART1), (BCY + 0.62, C_ART2)):
    box(0.030, 0.52, 0.68, W / 2 - 0.045, gy, 1.52, C_WOOD_D, "frame", 0.005)
    box(0.016, 0.44, 0.60, W / 2 - 0.062, gy, 1.52, gc, "canvas")

# ============================== 地毯 ==============================
bpy.ops.mesh.primitive_cube_add(size=1, location=(-1.0, 2.3, 0.012))
rug = bpy.context.object
rug.name = "rug"
rug.scale = (3.4, 2.6, 0.012)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.modifier_add(type='BEVEL')
rug.modifiers[-1].width = 0.05
rug.modifiers[-1].segments = 2
bpy.ops.object.modifier_apply(modifier=rug.modifiers[-1].name)
vcol(rug, C_RUG)
finish(rug, "rug")
# 地毯织纹
for i in range(5):
    box(3.2, 0.010, 0.004, 1.0, 1.30 + i * 0.42, 0.021, (0.150, 0.142, 0.148), "rugLine%d" % i)

# ============================== 绿植（窗边角落）==============================
PX, PY = 3.35, 0.85
cyl(0.16, 0.34, PX, PY, 0.17, (0.230, 0.190, 0.160), "pot", 18, r2=0.20)
cyl(0.20, 0.03, PX, PY, 0.345, (0.090, 0.070, 0.055), "soil", 18)
for i in range(9):
    a = (i / 9) * math.pi * 2
    ln = 0.42 + (i % 3) * 0.13
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.075, radius2=0.008,
                                    depth=ln, location=(PX + math.cos(a) * 0.10,
                                                        PY + math.sin(a) * 0.10,
                                                        0.36 + ln / 2))
    lf = bpy.context.object
    lf.name = "leaf%d" % i
    lf.rotation_euler = (math.sin(a) * 0.34, -math.cos(a) * 0.34, 0)
    bpy.ops.object.transform_apply(rotation=True)
    vcol(lf, C_PLANT)
    finish(lf, lf.name)

# ============================== 床尾矮凳 ==============================
box(1.05, 0.40, 0.09, 2.35, 1.20, 0.38, (0.240, 0.215, 0.195), "bench", 0.03)
for dx in (-0.42, 0.42):
    cyl(0.018, 0.34, 2.35 + dx, 1.20, 0.17, C_METAL, "benchLeg", 8)

# ============================== 地面小物 ==============================
# 拖鞋一双
for i, sy in enumerate((2.55, 2.78)):
    box(0.11, 0.26, 0.05, 1.62, sy, 0.030, (0.310, 0.285, 0.265), "slipper%d" % i, 0.018)
# 书堆（地毯上）
box(0.22, 0.16, 0.030, 0.42, 1.70, 0.030, C_BOOK, "b1", 0.003)
box(0.20, 0.15, 0.026, 0.44, 1.72, 0.058, (0.240, 0.280, 0.230), "b2", 0.003)

# ============================== 灯光带（几何）==============================
# 天花板暗藏灯槽
# 灯槽贴窗墙上沿（原来放在 y=4.6 房间中部，没建天花板就是一根悬空白杆）
box(5.6, 0.05, 0.05, -0.4, 0.12, 2.86, C_LAMP, "coveLight")
# 衣柜底部踢脚灯
box(0.06, 2.9, 0.02, CX + 0.30, 2.6, 0.045, C_LAMP, "plinthLight")

# ============================== 窗外城市（简化楼群）==============================
# 页面端还会叠一层 cityView 贴图，这里只放近景几栋做视差
for i in range(9):
    bw = random.uniform(0.5, 1.3)
    bh = random.uniform(2.0, 4.6)
    bx = random.uniform(-11, 11)
    by = random.uniform(-10.0, -24.0)
    box(bw, bw * 0.8, bh, bx, by, bh / 2 - 2.2,
        (0.055 + random.uniform(0, 0.03), 0.060, 0.075), "tower%d" % i)

# ============================== 合并 + 烘 AO + 导出 ==============================
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
    k = 0.58 + 0.42 * ao.data[i].color[0]
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
print("NIGHT_V3 tris", tris)
TARGET = 24000
if tris > TARGET:
    dm = a.modifiers.new('d', 'DECIMATE')
    dm.ratio = TARGET / tris
    bpy.ops.object.modifier_apply(modifier=dm.name)

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True,
                          export_yup=True, export_materials='EXPORT',
                          export_normals=False, export_texcoords=False,
                          export_vertex_color='ACTIVE', export_cameras=False,
                          export_lights=False)
print("NIGHT_V3_DONE", os.path.getsize(OUT))
