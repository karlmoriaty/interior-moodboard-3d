"""
夜景公寓 3D 模型台资产 —— 为网页重新构建，带 AO 烘焙。

关键区别：night-scene.py 是为 Cycles 渲染照片建的，材质极暗、物体极多、
导出到网页只剩空壳。这个脚本专门建「能在模型台上看清的 3D 场景」：
- 每个结构用明确的明度（墙深灰、地板木色、床米白、灯带亮黄）
- 合并成一件后烘 AO 到顶点色（墙角/床下自然变暗，有立体感）
- 只用必要几何，控制面数

输出 nightScene.glb → build-night-assets.mjs 打包。
"""
import bpy
import math
import os

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


# 明度明确的材质（模型台尺度要看得清）
M_FLOOR = mat("floor", (0.20, 0.13, 0.08), 0.5)       # 木地板
M_WALL = mat("wall", (0.12, 0.12, 0.14), 0.9)          # 深灰墙
M_FRAME = mat("frame", (0.06, 0.06, 0.07), 0.4, 0.5)   # 黑钢窗框
M_BED = mat("bed", (0.82, 0.79, 0.72), 0.95)           # 米白床品
M_BEDBASE = mat("bedbase", (0.10, 0.08, 0.07), 0.6)
M_WOOD = mat("wood", (0.16, 0.10, 0.06), 0.6)
M_BRICK = mat("brick", (0.28, 0.14, 0.09), 0.9)
M_SHELF = mat("shelf", (0.09, 0.08, 0.08), 0.7)
M_PLANT = mat("plant", (0.10, 0.20, 0.09), 0.85)
M_LEDW = mat("ledw", (1.0, 0.80, 0.50), 0.4, emis=(1.0, 0.80, 0.50), power=3.0)
M_LEDB = mat("ledb", (0.25, 0.65, 1.0), 0.4, emis=(0.25, 0.65, 1.0), power=2.5)
M_FIRE = mat("fire", (1.0, 0.45, 0.15), 0.5, emis=(1.0, 0.45, 0.15), power=3.0)


def box(w, d, h, x, y, z, m, name):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(m)
    return o


def cyl(r, h, x, y, z, m, name, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)
    return o


# 房间：8 宽 × 6 深 × 3 高，剖开朝 +Z（模型台相机从 +Z 看进来）
W, D, H = 8.0, 6.0, 3.0
box(W, D, 0.12, 0, 0, -0.06, M_FLOOR, "floor")
# 后墙（窗墙，Z=-3）：只在窗间留柱
for px in (-3.6, -2.6, -0.9, 0.9, 2.6, 3.6):
    box(0.14, 0.14, H, px, -3.0, H/2, M_FRAME, "mf")
box(W, 0.14, 0.14, 0, -3.0, 2.9, M_FRAME, "mftop")
box(W, 0.14, 0.14, 0, -3.0, 0.07, M_FRAME, "mfbot")
# 侧墙（剖面的两侧）
box(0.14, D, H, -3.93, 0, H/2, M_WALL, "wallL")
box(0.14, D, H, 3.93, 0, H/2, M_WALL, "wallR")
# 后墙实体部分（窗两侧）
box(0.4, 0.14, H, -3.7, -3.0, H/2, M_WALL, "wpierL")
box(0.4, 0.14, H, 3.7, -3.0, H/2, M_WALL, "wpierR")
box(W, 0.14, 0.30, 0, -3.0, 0.15, M_WALL, "wsill")
box(W, 0.14, 0.20, 0, -3.0, 2.9, M_WALL, "whead")

# 床（房间中后部，靠窗）
box(2.3, 1.9, 0.32, 0.3, -1.55, 0.16, M_BEDBASE, "bedframe")
box(2.2, 1.8, 0.22, 0.3, -1.55, 0.43, M_BED, "mattress")
box(2.1, 1.1, 0.16, 0.3, -1.75, 0.60, M_BED, "duvet")
box(0.75, 0.42, 0.14, -0.25, -0.78, 0.60, M_BED, "pillow1")
box(0.75, 0.42, 0.14, 0.85, -0.78, 0.60, M_BED, "pillow2")

# 壁炉（左前）
box(0.65, 0.9, 1.25, -3.2, 1.2, 0.63, M_BRICK, "firebox")
box(0.08, 0.5, 0.5, -2.84, 1.2, 0.42, M_FIRE, "fireglow")

# 书架（右墙）
box(0.35, 1.6, 2.0, 3.5, 1.4, 1.0, M_SHELF, "shelfbody")
for sz in (0.55, 1.0, 1.45, 1.9):
    box(0.30, 1.5, 0.04, 3.5, 1.4, sz, M_WOOD, "shelfbd%d" % int(sz*100))
# 几本书（书脊，用彩色小方块，只放少量）
for i in range(9):
    box(0.22, 0.05, 0.26, 3.5, 0.75 + i*0.07, 0.72 + (i%2)*0.02,
        mat("bk%d" % i, (0.35 if i%3==0 else 0.15, 0.10, 0.08 if i%2 else 0.20), 0.85),
        "book%d" % i)

# 落地灯（床边）
cyl(0.10, 0.03, 2.9, 4.9, 0.03, M_FRAME, "lampbase")
cyl(0.02, 0.02, 1.3, 4.9, 0.68, M_FRAME, "lampole")
cyl(0.18, 0.20, 2.9, 4.9, 1.40, M_BED, "lampball")
bpy.context.object.data.materials[0] = M_LEDW  # 灯罩发光

# 窗边矮凳
cyl(0.28, 0.42, 2.7, -2.1, 0.21, M_WOOD, "stool")
cyl(0.32, 0.05, 2.7, -2.1, 0.44, M_WOOD, "stooltop")

# 绿植（角落）
cyl(0.18, 0.30, 2.9, -3.3, 0.16, M_BRICK, "pot")
for i in range(5):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.22,
        location=(-3.3 + 0.1*math.cos(i*1.3), 2.9 + 0.1*math.sin(i*1.3), 0.5 + i*0.09))
    o = bpy.context.object
    o.name = "leaf%d" % i
    o.data.materials.append(M_PLANT)

# 灯带（顶部暖黄折线 + 窗台蓝线）
box(4.0, 0.05, 0.05, -1.0, 2.2, 2.75, M_LEDW, "ledw1")
box(0.05, 2.4, 0.05, 1.0, 1.0, 2.75, M_LEDW, "ledw2")
box(W-0.5, 0.05, 0.04, 0, -2.85, 0.10, M_LEDB, "ledb1")
box(W-0.5, 0.05, 0.04, 0, -2.85, 0.62, M_LEDB, "ledb2")

# ============== 合并 + AO 烘焙 ==============
bpy.ops.object.select_all(action='SELECT')
objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
a = bpy.context.object
a.name = "nightRoom"
a.location = (0, 0, 0)
me = a.data

# 材质索引会在 join 后保留，先把每个面的材质色写进顶点色 Col
col = me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
me.color_attributes.active_color_name = "Col"
for poly in me.polygons:
    m = a.data.materials[poly.material_index]
    if not m or not m.use_nodes:
        continue
    rgb = (0.5, 0.5, 0.5)
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            c = n.inputs["Base Color"].default_value
            rgb = (c[0], c[1], c[2])
            break
    for li in poly.loop_indices:
        col.data[li].color = (rgb[0], rgb[1], rgb[2], 1.0)

# 烘 AO 到顶点色（暗部压暗，产生立体感）
ao = me.color_attributes.new(name="AO", type='BYTE_COLOR', domain='CORNER')
me.color_attributes.active_color_name = "AO"
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 24
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
    col.data[i].color = (c[0]*k, c[1]*k, c[2]*k, 1.0)
me.color_attributes.remove(ao)
me.color_attributes.active_color_name = "Col"

tris = sum(len(p.vertices)-2 for p in me.polygons)
print("NIGHT_ASSET tris", tris, "loops", len(col.data))

OUT = r"D:\work_future\fucking\work10000\.tmp\nightscene\nightScene.glb"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
# transform 已烘进顶点，导出时不开 apply，避免再生成 TRS
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB',
    export_apply=False, export_yup=True, export_materials='EXPORT',
    export_normals=False, export_texcoords=False,
    export_vertex_color='ACTIVE', export_cameras=False, export_lights=False)
print("NIGHT_ASSET_DONE", os.path.getsize(OUT))
