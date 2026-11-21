"""
家具资产：双人床 v2 —— 按现实尺度重建。

上一版的问题：床头板 y=0 插在床正中央（不是床的一端），
三条软包竖缝也重叠在那里；被褥/枕头挤在中间，整张床结构不成立。

真实双人床尺寸（米）：
  床面 2.05 × 1.55，床垫厚 0.24，床面高 0.60，床头板顶 0.95
  床腿 0.16，床架 0.20，被子只盖 2/3，枕头靠床头一端
坐标：x 宽、y 深（-y 是床头）、z 高。
"""
import bpy
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

C_WOOD_D = (0.115, 0.072, 0.045)
C_WOOD_M = (0.170, 0.110, 0.068)
C_FABRIC_D = (0.145, 0.150, 0.165)
C_CREAM = (0.795, 0.775, 0.735)
C_SHEET = (0.740, 0.720, 0.690)
C_PLAID_A = (0.230, 0.215, 0.190)
C_PLAID_B = (0.330, 0.310, 0.275)


def mat(rgb, name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.86
    return m


def hard(name, w, d, h, x, y, z, rgb, bevel=0.01, seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bpy.ops.object.modifier_add(type='BEVEL')
        bv = o.modifiers[-1]
        bv.width = bevel
        bv.segments = seg
        bpy.ops.object.modifier_apply(modifier=bv.name)
    o.data.materials.append(mat(rgb, name))
    return o


def soft(name, w, d, h, x, y, z, rgb, bevel=0.05, subdiv=2, wrinkle=0.0):
    o = hard(name, w, d, h, x, y, z, rgb, bevel)
    if subdiv:
        sm = o.modifiers.new("s", 'SUBSURF')
        sm.levels = subdiv
        bpy.ops.object.modifier_apply(modifier=sm.name)
    if wrinkle > 0:
        tex = bpy.data.textures.new("wr_" + name, 'CLOUDS')
        tex.noise_scale = 0.20
        tex.noise_depth = 2
        dm = o.modifiers.new("d", 'DISPLACE')
        dm.texture = tex
        dm.strength = wrinkle
        dm.mid_level = 0.5
        bpy.ops.object.modifier_apply(modifier=dm.name)
    bpy.ops.object.shade_smooth()
    return o


def rod(name, r, h, x, y, z, rgb, verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h,
                                        location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat(rgb, name))
    return o


# ============================== 床 ==============================
# 关键尺寸：床面 2.05 × 1.55；床头在 -y 端
BW, BD = 2.05, 1.55
LEG_H = 0.16          # 腿高
FRAME_H = 0.20        # 床架厚
FRAME_TOP = LEG_H + FRAME_H          # 0.36
MAT_H = 0.24          # 床垫厚
MAT_TOP = FRAME_TOP + MAT_H          # 0.60

# 床腿 ×4（略微内收）
for lx in (-0.88, 0.88):
    for ly in (-0.62, 0.62):
        rod("leg", 0.040, LEG_H, lx, ly, LEG_H / 2, C_WOOD_D, 10)

# 床架：比床垫略大，四边包住
hard("frame", BW, BD, FRAME_H, 0, 0, LEG_H + FRAME_H / 2, C_WOOD_D, 0.012)

# 床垫：圆角，正好落在床架里
soft("mattress", BW - 0.06, BD - 0.06, MAT_H, 0, 0,
     FRAME_TOP + MAT_H / 2, C_SHEET, 0.10, 2)

# 床单：铺在床垫上，四边垂下来
soft("sheet_top", BW - 0.04, BD - 0.04, 0.035, 0, 0,
     MAT_TOP + 0.012, C_CREAM, 0.02, 1, 0.006)
for tag, (sw, sd, sx, sy) in {
    'L': (0.030, BD - 0.05, -(BW - 0.06) / 2, 0),
    'R': (0.030, BD - 0.05, (BW - 0.06) / 2, 0),
    'H': (BW - 0.05, 0.030, 0, -(BD - 0.06) / 2),
}.items():
    soft("sheet_drop" + tag, sw, sd, 0.22, sx, sy, MAT_TOP - 0.10, C_CREAM, 0.015, 1, 0.004)

# 被子：只盖床的 2/3（从中间到床尾），有褶皱
soft("duvet", BW - 0.10, BD * 0.62, 0.14, 0,
     BD * 0.17, MAT_TOP + 0.09, C_CREAM, 0.10, 2, 0.016)
# 被子垂到两侧（长短不一）
soft("duvet_dropR", 0.22, BD * 0.58, 0.24, (BW - 0.06) / 2, BD * 0.18,
     MAT_TOP - 0.06, C_CREAM, 0.07, 2, 0.012)
soft("duvet_dropL", 0.18, BD * 0.50, 0.20, -(BW - 0.06) / 2, BD * 0.20,
     MAT_TOP - 0.02, C_CREAM, 0.06, 2, 0.010)
# 被口翻边（靠床头那一侧卷起一条）
soft("duvet_fold", BW - 0.14, 0.16, 0.09, 0,
     -BD * 0.14, MAT_TOP + 0.155, C_SHEET, 0.05, 1, 0.008)

# 枕头：两只，靠床头一端，略斜
for i, px in enumerate((-0.46, 0.46)):
    soft("pillow%d" % i, 0.66, 0.40, 0.17, px, -BD * 0.34,
         MAT_TOP + 0.10, C_CREAM, 0.10, 2, 0.012)

# 床尾搭毯
soft("throw", BW - 0.12, 0.34, 0.055, 0, BD * 0.40,
     MAT_TOP + 0.135, C_PLAID_A, 0.03, 1, 0.006)
# 格纹条（三条细带，压在搭毯上）
for i in range(3):
    soft("plaid%d" % i, BW - 0.14, 0.028, 0.020, 0,
         BD * 0.40 + (i - 1) * 0.09, MAT_TOP + 0.168, C_PLAID_B, 0.008, 1, 0)

# 床头板：在 -y 端，比床略宽，上沿略后倾
hard("headboard", BW + 0.04, 0.09, 0.58, 0, -BD / 2 - 0.045,
     LEG_H + FRAME_H + 0.10, C_FABRIC_D, 0.035, 2)
# 床头板顶部软包收边
soft("headboard_cap", BW + 0.06, 0.11, 0.10, 0, -BD / 2 - 0.045,
     LEG_H + FRAME_H + 0.39, C_FABRIC_D, 0.045, 2, 0.004)


# ============================== 合并 + 烘 AO + 导出 ==============================
bpy.ops.object.select_all(action='SELECT')
objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
a = bpy.context.object
a.name = "bed"
a.location = (0, 0, 0)
me = a.data

col = me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
me.color_attributes.active_color_name = "Col"
for poly in me.polygons:
    m = me.materials[poly.material_index]
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

for i in range(len(col.data)):
    c = col.data[i].color
    k = 0.55 + 0.45 * ao.data[i].color[0]
    col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
me.color_attributes.remove(ao)
me.color_attributes.active_color_name = "Col"

tris = sum(len(p.vertices) - 2 for p in me.polygons)
print("BED_V2 tris", tris)
TARGET = 22000
if tris > TARGET:
    dm = a.modifiers.new('d', 'DECIMATE')
    dm.ratio = TARGET / tris
    bpy.ops.object.modifier_apply(modifier=dm.name)

# 统一材质：合成一个 primitive，顶点色已保留各件颜色。
# furniture 的打包脚本只读 primitives[0]，多材质会被截断。
one = me.materials[0] if me.materials else None
me.materials.clear()
if one:
    me.materials.append(one)
for poly in me.polygons:
    poly.material_index = 0

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

OUT = os.path.join(OUT_DIR, "bed.glb")
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True,
                          export_yup=True, export_materials='EXPORT',
                          export_normals=False, export_texcoords=True,
                          export_vertex_color='ACTIVE', export_cameras=False,
                          export_lights=False)
print("BED_V2_DONE", os.path.getsize(OUT))
