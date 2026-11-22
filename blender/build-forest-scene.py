"""
雾林卧室窗外：3D 雪夜松林 —— 替代一张平面贴图。

原来窗外是一张 1120×656 的 JPEG 贴在平面上：
  高度被锁在 2.86 米后宽度只有 4.88 米，而窗洞宽 7.76 米 ——
  两侧直接露出空白，而且平面在斜视时是一块卡片。

本文件建真实的三维空间（坐标约定同夜景场景）：
  Blender y < 0 是窗外，y = 0 是窗墙。
  页面端 rotation.y = π + position.z = -3 后，
  Blender y=-1 落在房间 z=-4（窗外 1 米）。

构成：
  雪地（细分平面 + 噪声起伏，近白偏蓝）
  近景 4 棵粗干雪松（树干明显、层叠针叶 + 顶部积雪）
  中景 14 棵松树（大小错落）
  远景 10 棵暗色剪影（压出纵深）
  地面雪堆 8 处
"""
import bpy
import bmesh
import math
import os
import random

OUT_DIR = r"D:\work_future\fucking\work10000\.tmp\forestscene"
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for bl in (bpy.data.meshes, bpy.data.materials):
    for b in list(bl):
        if b.users == 0:
            bl.remove(b)

random.seed(20261122)

MAT = None


def ensure_mat():
    global MAT
    if MAT is None:
        MAT = bpy.data.materials.new("forestMat")
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


C_SNOW = (0.760, 0.810, 0.880)       # 积雪（偏蓝）
C_SNOW_HI = (0.860, 0.900, 0.955)    # 迎光雪面
C_NEEDLE = (0.048, 0.078, 0.070)     # 针叶（深蓝绿）
C_NEEDLE_FAR = (0.038, 0.055, 0.062)  # 远处更暗
C_TRUNK = (0.042, 0.038, 0.036)      # 树干近黑
C_TRUNK_FAR = (0.030, 0.032, 0.040)

# ============================== 雪地 ==============================
# 细分平面 + 噪声起伏。范围要盖住整个窗洞视野（x ±8，y -0.4 ~ -18）
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -12.0, 0))
ground = bpy.context.object
ground.name = "snowGround"
ground.scale = (22.0, 26.0, 1)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.subdivide(number_cuts=44)
bpy.ops.object.mode_set(mode='OBJECT')

# 起伏：用位移修改器 + 噪声纹理
tex = bpy.data.textures.new("snowNoise", 'CLOUDS')
tex.noise_scale = 2.2
tex.noise_depth = 2
mod = ground.modifiers.new("d", 'DISPLACE')
mod.texture = tex
mod.strength = 0.22
mod.mid_level = 0.5
bpy.ops.object.modifier_apply(modifier=mod.name)

# 顶点色：远处雪面稍暗（模拟夜色渐深）
me = ground.data
me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
layer = me.color_attributes["Col"]
me.color_attributes.active_color_name = "Col"
for poly in me.polygons:
    # 用面中心 y 判断远近
    cy = sum(me.vertices[v].co.y for v in poly.vertices) / len(poly.vertices)
    t = min(1.0, max(0.0, (-cy - 0.5) / 14.0))
    r = C_SNOW_HI[0] * (1 - t) + C_SNOW[0] * 0.55 * t
    g = C_SNOW_HI[1] * (1 - t) + C_SNOW[1] * 0.58 * t
    b = C_SNOW_HI[2] * (1 - t) + C_SNOW[2] * 0.66 * t
    for li in poly.loop_indices:
        layer.data[li].color = (r, g, b, 1.0)
me.materials.append(ensure_mat())
finish(ground, "snowGround")


# ============================== 松树 ==============================
def pine(name, x, y, height, base_r, layers=5, far=False):
    """一棵雪松：树干 + 每层 5~7 个错落枝锥 + 顶部积雪。

    旧版每层是「一个实心锥」，从远处看就是绿色三角形 —— 圣诞树贴纸。
    改成每层多个小枝锥（绕中心分布、各自倾斜），轮廓才有针叶的毛糙感。"""
    needle = C_NEEDLE_FAR if far else C_NEEDLE
    trunk_c = C_TRUNK_FAR if far else C_TRUNK

    # 树干（露出地面到第一层枝）
    trunk_h = height * 0.55
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=base_r * 0.10,
                                        depth=trunk_h,
                                        location=(x, y, trunk_h / 2 - 0.05))
    tr = bpy.context.object
    tr.name = name + "_trunk"
    vcol(tr, trunk_c)
    finish(tr, name + "_trunk")

    tilt_x = random.uniform(-0.05, 0.05)
    tilt_y = random.uniform(-0.05, 0.05)

    for L in range(layers):
        t = L / max(1, layers - 1)
        z = height * (0.18 + 0.72 * t)
        r = base_r * (1.0 - 0.80 * t)
        # 枝数随高度减少（越往上越细）
        nb = max(3, 7 - int(t * 3))
        bh = height * (0.16 + 0.06 * (1 - t))

        for b in range(nb):
            a = (b / nb) * math.pi * 2 + random.uniform(-0.25, 0.25) + L * 0.7
            # 枝锥从中心向外斜伸
            rr = r * random.uniform(0.42, 0.62)
            bx = x + math.cos(a) * rr
            by = y + math.sin(a) * rr
            br = r * random.uniform(0.30, 0.46)
            bpy.ops.mesh.primitive_cone_add(
                vertices=7, radius1=br, radius2=br * 0.10, depth=bh,
                location=(bx, by, z - bh * 0.10),
            )
            cn = bpy.context.object
            cn.name = "%s_n%d_%d" % (name, L, b)
            # 向外倾斜（枝条下垂）
            cn.rotation_euler = (
                tilt_x + math.sin(a) * 0.30 + random.uniform(-0.10, 0.10),
                tilt_y - math.cos(a) * 0.30 + random.uniform(-0.10, 0.10),
                a,
            )
            bpy.ops.object.transform_apply(rotation=True)
            shade = 0.62 + 0.55 * t
            vcol(cn, (needle[0] * shade, needle[1] * shade, needle[2] * shade))
            finish(cn, cn.name)

            # 枝上积雪：短白锥压在枝梢
            if not far and random.random() < 0.26 and t > 0.18:
                bpy.ops.mesh.primitive_cone_add(
                    vertices=6, radius1=br * 0.88, radius2=br * 0.10,
                    depth=bh * 0.40,
                    location=(bx + math.cos(a) * br * 0.15,
                              by + math.sin(a) * br * 0.15,
                              z + bh * 0.16),
                )
                sn = bpy.context.object
                sn.name = "%s_s%d_%d" % (name, L, b)
                sn.rotation_euler = cn.rotation_euler
                bpy.ops.object.transform_apply(rotation=True)
                vcol(sn, C_SNOW_HI if t > 0.55 else C_SNOW)
                finish(sn, sn.name)


# 近景不能太近：放 3~5 米外、高度压到 3 米上下，
# 否则一棵树就把整扇窗堵满，看不出森林的纵深。
for i, (px, py, h, r) in enumerate([
    (-4.2, -3.4, 3.4, 0.78),
    (-1.6, -4.6, 3.8, 0.86),
    (2.2, -3.2, 3.1, 0.72),
    (4.6, -5.0, 3.6, 0.82),
    (-6.8, -6.2, 3.2, 0.74),
    (7.2, -7.4, 3.0, 0.70),
]):
    pine("near%d" % i, px, py, h, r, 6)

# 中景：大小错落
for i in range(24):
    px = random.uniform(-9.0, 9.0)
    py = random.uniform(-6.0, -13.0)
    h = random.uniform(2.2, 3.6)
    pine("mid%d" % i, px, py, h, h * 0.22, 5)

# 远景：暗剪影，压出纵深
for i in range(16):
    px = random.uniform(-12.0, 12.0)
    py = random.uniform(-14.0, -22.0)
    h = random.uniform(2.0, 3.2)
    pine("far%d" % i, px, py, h, h * 0.20, 4, far=True)

# ============================== 地面雪堆 ==============================
for i in range(8):
    px = random.uniform(-4.5, 4.5)
    py = random.uniform(-1.2, -5.0)
    sr = random.uniform(0.35, 0.9)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=sr,
                                         location=(px, py, sr * 0.18))
    d = bpy.context.object
    d.name = "drift%d" % i
    d.scale = (1.0, 0.85, 0.34)
    bpy.ops.object.transform_apply(scale=True)
    vcol(d, C_SNOW)
    finish(d, d.name)

# ============================== 合并 + 导出 ==============================
bpy.ops.object.select_all(action='SELECT')
objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
a = bpy.context.object
a.name = "forestScene"
a.location = (0, 0, 0)
me = a.data

if me.color_attributes:
    me.color_attributes.active_color_name = "Col"

# AO：让树与雪地接触处有暗部，画面不飘
ao = me.color_attributes.new(name="AO", type='BYTE_COLOR', domain='CORNER')
me.color_attributes.active_color_name = "AO"
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 18
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
    k = 0.55 + 0.45 * ao.data[i].color[0]
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
print("FOREST_V2 tris", tris)
TARGET = 26000
if tris > TARGET:
    dm = a.modifiers.new('d', 'DECIMATE')
    dm.ratio = TARGET / tris
    bpy.ops.object.modifier_apply(modifier=dm.name)

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

OUT = os.path.join(OUT_DIR, "forestScene.glb")
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True,
                          export_yup=True, export_materials='EXPORT',
                          export_normals=False, export_texcoords=False,
                          export_vertex_color='ACTIVE', export_cameras=False,
                          export_lights=False)
print("FOREST_V2_DONE", os.path.getsize(OUT))
