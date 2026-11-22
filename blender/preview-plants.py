"""四种植物并排渲染预览，确认形态是否像真植物。"""
import bpy
import os

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

DIR = r"D:\work_future\fucking\work10000\.tmp\plants"
names = ["plantMonstera", "plantCactus", "plantSansevieria", "plantFiddle"]

for i, n in enumerate(names):
    path = os.path.join(DIR, n + ".glb")
    bpy.ops.import_scene.gltf(filepath=path)
    # 导入的物体放在 x 轴上排开
    for o in bpy.context.selected_objects:
        if o.type == 'MESH':
            o.location.x += (i - 1.5) * 0.95

# 地面
bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, 0))
floor = bpy.context.object
m = bpy.data.materials.new("f")
m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.30, 0.28, 0.26, 1)
floor.data.materials.append(m)

# 相机
bpy.ops.object.camera_add(location=(0.0, -6.2, 2.10), rotation=(1.30, 0, 0.0))
cam = bpy.context.object
cam.data.lens = 42
bpy.context.scene.camera = cam

# 光：主光 + 补光
bpy.ops.object.light_add(type='AREA', location=(-2.6, -2.4, 3.2))
key = bpy.context.object
key.data.energy = 320
key.data.size = 3.0
key.rotation_euler = (0.85, -0.35, -0.5)

bpy.ops.object.light_add(type='AREA', location=(2.8, -1.4, 2.0))
fill = bpy.context.object
fill.data.energy = 110
fill.data.size = 2.4

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 48
sc.cycles.use_denoising = True
sc.render.resolution_x = 1600
sc.render.resolution_y = 900
sc.render.filepath = r"D:\work_future\fucking\work10000\.tmp\plants-preview.jpg"
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 92
bpy.ops.render.render(write_still=True)
print("PREVIEW_DONE")
