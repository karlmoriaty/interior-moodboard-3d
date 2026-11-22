"""
第二批家具资产：单椅 / 边几 / 矮凳 / 书架 / 落地灯 / 绿植 / 书堆 / 壁炉 / 烛台
全部走细分曲面 + 倒角 + AO 烘焙，和第一批同一套管线。
"""
import bpy
import bmesh
import math
import random
import os

random.seed(3301)
OUT_DIR = r"D:\work_future\fucking\work10000\.tmp\furniture2"
os.makedirs(OUT_DIR, exist_ok=True)

M_VC = None


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for b in list(bpy.data.meshes):
        if b.users == 0:
            bpy.data.meshes.remove(b)


def ensure_mat():
    global M_VC
    if M_VC and M_VC.name in bpy.data.materials:
        return M_VC
    m = bpy.data.materials.new("vc")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "Col"
    nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.86
    M_VC = m
    return m


def vcol(o, rgb):
    me = o.data
    if not me.color_attributes:
        me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
    l = me.color_attributes["Col"]
    for i in range(len(l.data)):
        l.data[i].color = (*rgb, 1.0)


def soft(name, w, h, d, x, y, z, rgb, bevel=0.05, subdiv=2, wrinkle=0.0, rot=(0, 0, 0)):
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
        bv.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=bv.name)
    if wrinkle > 0:
        s1 = o.modifiers.new("pre", 'SUBSURF')
        s1.levels = 2
        bpy.ops.object.modifier_apply(modifier=s1.name)
        t = bpy.data.textures.new("wr_" + name, 'CLOUDS')
        t.noise_scale = 0.26
        di = o.modifiers.new("d", 'DISPLACE')
        di.texture = t
        di.strength = wrinkle
        di.mid_level = 0.5
        bpy.ops.object.modifier_apply(modifier=di.name)
    if subdiv > 0:
        s2 = o.modifiers.new("sm", 'SUBSURF')
        s2.levels = subdiv
        bpy.ops.object.modifier_apply(modifier=s2.name)
    bpy.ops.object.shade_smooth()
    vcol(o, rgb)
    o.data.materials.append(ensure_mat())
    return o


def rod(name, r1, r2, h, x, y, z, rgb, seg=14, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=h,
                                    location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    vcol(o, rgb)
    o.data.materials.append(ensure_mat())
    return o


def ball(name, r, x, y, z, rgb, seg=18, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2,
                                         radius=r, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    vcol(o, rgb)
    o.data.materials.append(ensure_mat())
    return o


def export(name, target=12000):
    bpy.ops.object.select_all(action='SELECT')
    objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    for ob in objs:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    a = bpy.context.object
    a.name = name
    a.location = (0, 0, 0)

    me = a.data
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
    bpy.ops.object.bake(type='AO', margin=2)
    col = me.color_attributes["Col"]
    for i in range(len(col.data)):
        c = col.data[i].color
        k = 0.55 + 0.45 * ao.data[i].color[0]
        col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color_name = "Col"

    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > target:
        dm = a.modifiers.new('d', 'DECIMATE')
        dm.ratio = target / tris
        bpy.ops.object.modifier_apply(modifier=dm.name)
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
    print("ASSET2", name, os.path.getsize(out), len(me.vertices))


C_FAB = (0.72, 0.69, 0.62)
C_FAB_D = (0.55, 0.52, 0.46)
C_WOOD = (0.32, 0.21, 0.13)
C_WOOD_D = (0.17, 0.11, 0.07)
C_METAL = (0.12, 0.12, 0.13)
C_LEAF = (0.16, 0.28, 0.15)
C_LEAF_D = (0.10, 0.19, 0.10)
C_PAPER = (0.86, 0.82, 0.72)
C_WAX = (0.93, 0.89, 0.80)
C_DARK = (0.06, 0.06, 0.065)

# ---------- 单椅 ----------
clear()
soft("seat", 0.86, 0.20, 0.80, 0, 0.05, 0.44, C_FAB, 0.10, 2, 0.012)
soft("back", 0.82, 0.58, 0.20, 0, -0.32, 0.70, C_FAB_D, 0.10, 2, 0.010)
for sx in (-1, 1):
    soft("arm", 0.16, 0.34, 0.78, sx * 0.42, 0.02, 0.56, C_FAB_D, 0.08, 2, 0.006)
# 腿必须插进座面：座面 h=0.20 中心 z=0.44 → 底 0.34；
# 原来腿高 0.30 差 4 cm，整把椅子悬空。改成 0.375（插入座面 3.5 cm）。
for lx in (-0.36, 0.36):
    for ly in (-0.32, 0.32):
        rod("leg", 0.026, 0.020, 0.40, lx, ly, 0.20, C_WOOD_D, 10)
export("armchair", 16000)

# ---------- 边几 ----------
clear()
soft("top", 0.46, 0.05, 0.46, 0, 0, 0.50, C_WOOD, 0.012, 1, 0.0)
soft("shelf", 0.38, 0.035, 0.38, 0, 0, 0.22, C_WOOD_D, 0.008, 1, 0.0)
for lx in (-0.19, 0.19):
    for ly in (-0.19, 0.19):
        rod("leg", 0.017, 0.014, 0.50, lx, ly, 0.25, C_METAL, 10)
export("sideTable", 5000)

# ---------- 矮凳 ----------
clear()
soft("seat", 0.40, 0.14, 0.40, 0, 0, 0.34, C_FAB, 0.10, 2, 0.014)
for ang in (0, 90, 180, 270):
    r = math.radians(ang)
    rod("leg", 0.022, 0.018, 0.30, math.cos(r) * 0.13, math.sin(r) * 0.13, 0.15,
        C_WOOD_D, 8)
export("stool", 6000)

# ---------- 书架 ----------
clear()
soft("side_l", 0.05, 1.72, 0.32, -0.44, 0, 0.86, C_WOOD_D, 0.008, 1)
soft("side_r", 0.05, 1.72, 0.32, 0.44, 0, 0.86, C_WOOD_D, 0.008, 1)
soft("back", 0.88, 1.72, 0.03, 0, 0.15, 0.86, C_WOOD_D, 0.005, 1)
for sy in (0.10, 0.52, 0.94, 1.36, 1.70):
    soft("shelf", 0.88, 0.04, 0.30, 0, 0, sy, C_WOOD, 0.006, 1)
# 书：高低错落
for row, sy in enumerate((0.14, 0.56, 0.98)):
    n = 7 + row
    for k in range(n):
        bw = 0.045 + (k % 3) * 0.012
        bh = 0.20 + ((k * 7) % 5) * 0.028
        bx = -0.38 + k * 0.10
        col = [(0.42, 0.24, 0.18), (0.30, 0.34, 0.42), (0.55, 0.46, 0.30),
               (0.24, 0.30, 0.24), (0.60, 0.52, 0.40)][k % 5]
        soft("bk", bw, bh, 0.22, bx, 0.02, sy + bh / 2 + 0.02, col, 0.004, 1)
export("shelf", 14000)

# ---------- 落地灯 ----------
clear()
rod("base", 0.16, 0.14, 0.04, 0, 0, 0.02, C_METAL, 20)
rod("pole", 0.017, 0.015, 1.42, 0, 0, 0.73, C_METAL, 10)
# 纸质灯罩：圆台形
bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.20, radius2=0.15, depth=0.30,
                                location=(0, 0, 1.58))
sh = bpy.context.object
sh.name = "shade"
bpy.ops.object.shade_smooth()
vcol(sh, (0.92, 0.87, 0.76))
sh.data.materials.append(ensure_mat())
export("lamp", 6000)

# ---------- 绿植 ----------
clear()
rod("pot", 0.15, 0.12, 0.26, 0, 0, 0.13, (0.34, 0.26, 0.20), 20)
rod("soil", 0.135, 0.135, 0.02, 0, 0, 0.255, (0.16, 0.12, 0.09), 20)
# 叶片：压扁的球，向外张开，多层
for i in range(11):
    ang = i * 2.399
    tilt = 0.55 + (i % 4) * 0.22
    rr = 0.12 + (i % 3) * 0.10
    px = math.cos(ang) * rr
    py = math.sin(ang) * rr
    pz = 0.42 + (i % 5) * 0.16
    o = ball("leaf%d" % i, 0.13 + (i % 3) * 0.03, px, py, pz,
             C_LEAF if i % 2 else C_LEAF_D, 14, (1, 0.45, 1.5))
    o.rotation_euler = (tilt * 0.4, 0, ang)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
export("plant", 12000)

# ---------- 书堆 ----------
clear()
zs = 0.0
for i in range(5):
    w = 0.28 - i * 0.012
    d = 0.20 - i * 0.008
    h = 0.035 + (i % 2) * 0.012
    col = [(0.42, 0.24, 0.18), (0.30, 0.34, 0.42), (0.58, 0.48, 0.32),
           (0.26, 0.32, 0.26), (0.62, 0.54, 0.42)][i % 5]
    soft("book%d" % i, w, h, d, (i % 3 - 1) * 0.012, (i % 2) * 0.008, zs + h / 2,
         col, 0.004, 1, 0.0, rot=(0, 0, (i - 2) * 0.06))
    zs += h
export("bookStack", 5000)

# ---------- 悬挂壁炉 ----------
clear()
rod("rod", 0.016, 0.016, 1.28, 0, 0, 1.96, C_DARK, 8)
rod("cap", 0.20, 0.20, 0.03, 0, 0, 1.31, C_DARK, 20)
# 圆筒炉身：横放
bpy.ops.mesh.primitive_cylinder_add(vertices=26, radius=0.27, depth=0.62,
                                    location=(0, 0, 0.94), rotation=(0, math.radians(90), 0))
body = bpy.context.object
body.name = "body"
bpy.ops.object.shade_smooth()
vcol(body, (0.08, 0.08, 0.09))
body.data.materials.append(ensure_mat())
for sx in (-0.31, 0.31):
    rod("cap2", 0.27, 0.27, 0.02, sx, 0, 0.94, (0.10, 0.10, 0.11), 26,
        rot=(0, math.radians(90), 0))
# 炉膛里的柴
for i, (fx, fy) in enumerate(((-0.05, 0.0), (0.06, 0.05))):
    rod("log", 0.035, 0.030, 0.26, fx, fy, 0.82, (0.22, 0.14, 0.09), 10,
        rot=(0, 0, math.radians(90 + i * 8)))
export("fireplace", 14000)

# ---------- 烛光组 ----------
clear()
rod("tray", 0.25, 0.26, 0.02, 0, 0, 0.01, (0.55, 0.42, 0.18), 24)
for i, (cx, cy, h, r) in enumerate(((-0.11, 0.07, 0.52, 0.055),
                                    (0.03, -0.10, 0.36, 0.062),
                                    (0.12, 0.06, 0.72, 0.050),
                                    (-0.02, 0.13, 0.26, 0.066),
                                    (-0.15, -0.11, 0.42, 0.046))):
    rod("wax%d" % i, r, r, h, cx, cy, h / 2 + 0.02, C_WAX, 16)
    # 烛芯顶端的小凹
    rod("wtop%d" % i, r * 0.55, r * 0.55, 0.008, cx, cy, h + 0.024, (0.72, 0.62, 0.45), 12)
export("candleCluster", 9000)

print("ALL_DONE_2")
