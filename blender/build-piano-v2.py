"""
三角钢琴 v2 —— 按真实结构重建。

旧版的问题：
  1. 琴体是两个方盒子（body + tail）拼成 L 形，不是三角钢琴的梨形轮廓
  2. 琴盖是方板绕中心转 22°，和琴体之间只有一根细杆，看着就是「一块飘着的板」
  3. 腿是直筒圆柱，没有车木锥度和脚轮，也不在琴体四角
  4. 没有踏板架（lyre）和踏板 —— 三角钢琴的三大件之一
  5. 没有键挡、侧臂、键盖，键盘像是插在盒子里

本版结构（全部对照真实三角钢琴）：
  梨形 rim（侧板，bmesh 轮廓挤出 + 内壁）
  音板 + 铸铁板（钢板金色）
  琴盖：同轮廓薄板，绕直边铰链掀开 24°，配支杆
  键盘床 + 白键 36 + 黑键 25 + 键挡 + 侧臂 + 键盖
  谱架：倾斜板 + 两条支撑
  三条车木锥形腿（上粗下细）+ 金属脚轮
  踏板架：两根斜杆 + 踏板盒 + 三个踏板
  琴凳：软垫 + 四条锥形腿
"""
import bpy
import bmesh
import math
import os

OUT_DIR = r"D:\work_future\fucking\work10000\.tmp\furniture2"
os.makedirs(OUT_DIR, exist_ok=True)

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
        MAT = bpy.data.materials.new("pianoMat")
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


# ============================== 轮廓 ==============================
# 三角钢琴俯视：键盘端宽、尾部收窄；一侧直（bass side），一侧弯（treble side）
X_KEY = -1.02      # 键盘端
X_TAIL = 1.14      # 尾部
HALF_W = 0.74      # 键盘端半宽


def rim_outline(n=40, inset=0.0):
    """返回闭合轮廓点列 [(x, y), ...]，逆时针。
       inset>0 表示向内收缩（用于音板、内壁）。"""
    pts = []
    hw = HALF_W - inset
    # 直边（下侧 y<0）：略收
    for i in range(n):
        t = i / (n - 1)
        x = X_KEY + inset + t * (X_TAIL - X_KEY - inset * 2)
        y = -(hw * (1 - 0.08 * t ** 2.2))
        pts.append((x, y))
    # 尾部圆弧：从下侧收到上侧
    tail_x = X_TAIL - inset
    tail_hw = hw * 0.20
    for k in range(1, 9):
        a = -math.pi / 2 + (k / 9) * math.pi
        pts.append((tail_x + math.cos(a) * 0.19, math.sin(a) * tail_hw))
    # 弯边（上侧 y>0）：从尾部回到键盘端
    for i in range(n):
        t = 1 - i / (n - 1)
        x = X_KEY + inset + t * (X_TAIL - X_KEY - inset * 2)
        y = hw * (1 - 0.72 * t ** 1.7)
        pts.append((x, y))
    return pts


def poly_extrude(name, pts, z0, z1, rgb, wall=None):
    """把闭合轮廓挤出成体。wall 非空时只保留侧壁（做成空心侧板）。"""
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for (x, y) in pts]
    top = [bm.verts.new((x, y, z1)) for (x, y) in pts]
    n = len(pts)
    # 侧壁
    for i in range(n):
        j = (i + 1) % n
        try:
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        except ValueError:
            pass
    # 上下盖（空心侧板不加）
    if wall is None:
        try:
            bm.faces.new(list(reversed(bot)))
        except ValueError:
            pass
        try:
            bm.faces.new(top)
        except ValueError:
            pass
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    vcol(ob, rgb)
    return finish(ob, name)


def slab(name, pts, z, thick, rgb):
    """同轮廓的薄板（琴盖、音板用）"""
    return poly_extrude(name, pts, z, z + thick, rgb)


def cyl(name, r1, r2, h, x, y, z, rgb, seg=20, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=h,
                                    location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    vcol(o, rgb)
    return finish(o, name)


def box(name, w, h, d, x, y, z, rgb, bevel=0.006, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    if bevel > 0:
        bpy.ops.object.modifier_add(type='BEVEL')
        bv = o.modifiers[-1]
        bv.width = bevel
        bv.segments = 2
        bpy.ops.object.modifier_apply(modifier=bv.name)
    vcol(o, rgb)
    return finish(o, name)


C_BODY = (0.030, 0.030, 0.034)      # 黑漆琴体
C_BODY_HI = (0.055, 0.055, 0.060)   # 受光面
C_PLATE = (0.400, 0.300, 0.115)     # 铸铁板（金铜色）
C_SOUND = (0.180, 0.115, 0.058)     # 音板（云杉木）
C_IVORY = (0.855, 0.840, 0.790)     # 白键
C_EBONY = (0.022, 0.022, 0.025)     # 黑键
C_BRASS = (0.480, 0.370, 0.140)     # 脚轮/踏板
C_FELT = (0.240, 0.055, 0.050)      # 琴凳绒面

# ============================== 关键高度 ==============================
Z_FLOOR = 0.0
LEG_H = 0.56            # 琴体底面高度（腿长）
RIM_H = 0.30            # 侧板高
Z_BOT = LEG_H
Z_TOP = LEG_H + RIM_H   # 0.90 —— 琴体顶面

# ============================== 侧板（梨形）==============================
outer = rim_outline(38, 0.0)
inner = rim_outline(38, 0.028)
# 外壁
poly_extrude("rimOuter", outer, Z_BOT, Z_TOP, C_BODY, wall=True)
# 内壁（略内缩，反向法线靠 DoubleSide 渲染）
poly_extrude("rimInner", inner, Z_BOT + 0.02, Z_TOP - 0.012, C_BODY_HI, wall=True)
# 底板（封底）
poly_extrude("bottom", inner, Z_BOT, Z_BOT + 0.022, C_BODY)
# 音板
slab("soundboard", rim_outline(38, 0.045), Z_BOT + 0.03, 0.012, C_SOUND)
# 铸铁板
slab("plate", rim_outline(36, 0.070), Z_BOT + 0.115, 0.014, C_PLATE)

# 琴弦：沿直边到弯边的细条（简化成 12 根窄条，避免上万面）
for i in range(12):
    t = i / 11
    yy = -0.56 + t * 1.02
    box("str%02d" % i, 1.72 - abs(t - 0.5) * 0.35, 0.004, 0.010,
        -0.02, yy, Z_BOT + 0.142, (0.34, 0.30, 0.24), 0)

# ============================== 琴盖（掀开 24°，绕直边铰链）==============================
LID_ANGLE = math.radians(19)
lid_thick = 0.020


def build_lid():
    """琴盖：绕直边（y = -HALF_W）铰链掀起。
       先把平板建在铰链平面内，再绕 X 轴旋转。"""
    pts = rim_outline(38, -0.004)
    bm = bmesh.new()
    bot = [bm.verts.new((x, y + HALF_W, 0)) for (x, y) in pts]
    top = [bm.verts.new((x, y + HALF_W, lid_thick)) for (x, y) in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        try:
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        except ValueError:
            pass
    try:
        bm.faces.new(list(reversed(bot)))
    except ValueError:
        pass
    try:
        bm.faces.new(top)
    except ValueError:
        pass
    bm.normal_update()
    me = bpy.data.meshes.new("lid")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("lid", me)
    bpy.context.collection.objects.link(ob)
    ob.location = (0, -HALF_W, Z_TOP)
    ob.rotation_euler = (LID_ANGLE, 0, 0)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vcol(ob, C_BODY)
    return finish(ob, "lid")


build_lid()

# 支杆（从侧板内壁撑到琴盖）—— 真实三角钢琴用两根撑杆
for px, py in ((0.42, 0.30), (0.96, 0.05)):
    top_z = Z_TOP + math.sin(LID_ANGLE) * (HALF_W + py)
    h = top_z - Z_TOP + 0.02
    cyl("prop%02d" % int(px * 10), 0.008, 0.007, h, px, py,
        Z_TOP + h / 2 - 0.01, C_BRASS, 8)

# ============================== 键盘区 ==============================
KB_X = X_KEY - 0.10      # 键盘床伸出琴体
KB_W = 0.30
KB_H = 0.075
Z_KB = Z_TOP - 0.055

# 键盘床（前伸的托盘）
box("keybed", KB_W, KB_H, 1.42, KB_X + 0.06, 0, Z_KB, C_BODY, 0.008)
# 键挡（键盘前沿的细条）
box("keyslip", 0.026, 0.030, 1.40, KB_X - 0.088, 0, Z_KB + 0.058, C_BODY, 0.004)
# 侧臂（键盘两端）
for sy in (-1, 1):
    box("cheek%d" % sy, 0.26, 0.088, 0.075, KB_X + 0.06, sy * 0.665,
        Z_KB + 0.075, C_BODY, 0.010)
# 键盖（斜靠在键盘上方）
box("fallboard", 0.22, 0.020, 1.38, KB_X + 0.02, 0, Z_KB + 0.145, C_BODY, 0.008,
    rot=(0, math.radians(-16), 0))

# 白键 36 个
KEY_Z = Z_KB + 0.040
n_white = 36
kb_len = 1.32
for i in range(n_white):
    ky = -kb_len / 2 + (i + 0.5) * (kb_len / n_white)
    box("kw%02d" % i, 0.150, 0.014, kb_len / n_white - 0.0035,
        KB_X + 0.10, ky, KEY_Z, C_IVORY, 0.0015)
# 黑键 25 个（避开每组的 E-F、B-C）
black_after = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24,
               25, 26, 28, 29, 31, 32, 34]
for k, i in enumerate(black_after):
    if i >= n_white - 1:
        continue
    ky = -kb_len / 2 + (i + 1) * (kb_len / n_white)
    box("kb%02d" % k, 0.092, 0.020, 0.011, KB_X + 0.075, ky, KEY_Z + 0.019,
        C_EBONY, 0.0012)

# ============================== 谱架 ==============================
box("desk", 0.016, 0.28, 0.70, -0.06, 0, Z_TOP + 0.09, C_BODY, 0.004,
    rot=(0, math.radians(-18), 0))
for sy in (-0.26, 0.26):
    box("deskleg%d" % int(sy * 10), 0.012, 0.24, 0.010, 0.02, sy,
        Z_TOP + 0.09, C_BODY, 0.002, rot=(0, math.radians(20), 0))

# ============================== 三条车木腿 + 脚轮 ==============================
leg_pts = [(-0.92, 0.52), (-0.92, -0.52), (1.00, 0.02)]
for i, (lx, ly) in enumerate(leg_pts):
    # 柱身：上粗下细（车木锥度）
    cyl("leg%d" % i, 0.030, 0.048, LEG_H, lx, ly, LEG_H / 2, C_BODY, 16)
    # 束腰（装饰环）
    cyl("legring%d" % i, 0.046, 0.046, 0.028, lx, ly, LEG_H * 0.30, C_BODY, 16)
    # 金属脚轮
    cyl("caster%d" % i, 0.026, 0.026, 0.026, lx, ly, 0.014, C_BRASS, 12)
    cyl("cwheel%d" % i, 0.020, 0.020, 0.016, lx, ly, 0.024, C_BRASS, 12)

# ============================== 踏板架（lyre）+ 三个踏板 ==============================
LYRE_X = -0.72
# 两根斜杆
for sy in (-1, 1):
    cyl("lyrebar%d" % sy, 0.012, 0.012, 0.46, LYRE_X + 0.10, sy * 0.055,
        0.30, C_BODY, 8, rot=(0, math.radians(12), 0))
# 踏板盒
box("lyrebox", 0.14, 0.070, 0.22, LYRE_X + 0.14, 0, 0.085, C_BODY, 0.006)
# 三个踏板（铜色）
for i, py in enumerate((-0.062, 0.0, 0.062)):
    box("pedal%d" % i, 0.10, 0.016, 0.030, LYRE_X + 0.055, py, 0.098,
        C_BRASS, 0.003)

# ============================== 琴凳 ==============================
BX, BY = -1.30, 0.02
# 软垫
bpy.ops.mesh.primitive_cube_add(size=1, location=(BX, BY, 0.50))
seat = bpy.context.object
seat.name = "benchSeat"
seat.scale = (0.42, 0.34, 0.085)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.modifier_add(type='BEVEL')
bv = seat.modifiers[-1]
bv.width = 0.035
bv.segments = 3
bpy.ops.object.modifier_apply(modifier=bv.name)
vcol(seat, C_FELT)
finish(seat, "benchSeat")
# 凳框
box("benchFrame", 0.40, 0.055, 0.32, BX, BY, 0.448, C_BODY, 0.008)
# 四条锥形腿
for sx in (-1, 1):
    for sy in (-1, 1):
        cyl("bleg%d%d" % (sx, sy), 0.016, 0.024, 0.42,
            BX + sx * 0.165, BY + sy * 0.125, 0.21, C_BODY, 12)

# ============================== 合并 + 烘 AO + 导出 ==============================
bpy.ops.object.select_all(action='SELECT')
objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
a = bpy.context.object
a.name = "piano"
a.location = (0, 0, 0)
me = a.data

if me.color_attributes:
    me.color_attributes.active_color_name = "Col"

ao = me.color_attributes.new(name="AO", type='BYTE_COLOR', domain='CORNER')
me.color_attributes.active_color_name = "AO"
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 22
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
    k = 0.42 + 0.58 * ao.data[i].color[0]
    col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
me.color_attributes.remove(ao)
me.color_attributes.active_color_name = "Col"

# 统一材质（打包器只读 primitives[0]）
one = me.materials[0] if me.materials else None
me.materials.clear()
if one:
    me.materials.append(one)
for poly in me.polygons:
    poly.material_index = 0

tris = sum(len(p.vertices) - 2 for p in me.polygons)
print("PIANO_V2 tris", tris)
TARGET = 12000
if tris > TARGET:
    dm = a.modifiers.new('d', 'DECIMATE')
    dm.ratio = TARGET / tris
    bpy.ops.object.modifier_apply(modifier=dm.name)

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

OUT = os.path.join(OUT_DIR, "piano.glb")
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True,
                          export_yup=True, export_materials='EXPORT',
                          export_normals=False, export_texcoords=True,
                          export_vertex_color='ACTIVE', export_cameras=False,
                          export_lights=False)
print("PIANO_V2_DONE", os.path.getsize(OUT))
