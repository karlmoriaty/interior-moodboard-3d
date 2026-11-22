"""把每种家具单独渲染成小图，拼成一张联系表（contact sheet），
用于肉眼排查物理问题：腿脱节、悬空、比例不对。

用正交相机 + 简单布光，每件单独一个场景，渲染到独立文件后再拼。
"""
import bpy
import os
import glob

SRC_DIRS = [
    r"D:\work_future\fucking\work10000\.tmp\furniture",
    r"D:\work_future\fucking\work10000\.tmp\furniture2",
]
OUT = r"D:\work_future\fucking\work10000\.tmp\furniture-audit"
os.makedirs(OUT, exist_ok=True)

# 收集：同名以 furniture2 优先
files = {}
for d in SRC_DIRS:
    for f in glob.glob(os.path.join(d, "*.glb")):
        files[os.path.basename(f)[:-4]] = f
names = sorted(files)
print("AUDIT_ITEMS", " ".join(names))


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for bl in (bpy.data.meshes, bpy.data.materials):
        for b in list(bl):
            if b.users == 0:
                bl.remove(b)


for nm in names:
    reset()
    bpy.ops.import_scene.gltf(filepath=files[nm])
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not objs:
        print("SKIP", nm)
        continue

    # 统一世界坐标
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 算包围盒
    xs, ys, zs = [], [], []
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    minz, maxz = min(zs), max(zs)
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    size = max(maxx - minx, maxy - miny, maxz - minz)

    # 地面
    bpy.ops.mesh.primitive_plane_add(size=size * 6, location=(cx, cy, minz - 0.001))
    fl = bpy.context.object
    m = bpy.data.materials.new("fl")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42, 0.40, 0.38, 1)
    fl.data.materials.append(m)

    # 正交相机：斜 35°，看到正面和侧面
    dist = size * 2.6
    bpy.ops.object.camera_add(location=(cx + dist * 0.62, cy - dist * 0.72, minz + size * 0.92))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size * 1.55
    # 用 TRACK_TO 约束指向物体中心，比自己算欧拉角可靠
    bpy.ops.object.empty_add(location=(cx, cy, (minz + maxz) / 2))
    tgt = bpy.context.object
    con = cam.constraints.new('TRACK_TO')
    con.target = tgt
    con.track_axis = 'TRACK_NEGATIVE_Z'
    con.up_axis = 'UP_Y'
    bpy.context.scene.camera = cam

    # 光
    bpy.ops.object.light_add(type='AREA', location=(cx - dist, cy - dist, minz + size * 2.2))
    k = bpy.context.object
    k.data.energy = 260 * max(1, size)
    k.data.size = size * 2
    bpy.ops.object.light_add(type='AREA', location=(cx + dist, cy - dist * 0.4, minz + size * 1.2))
    k2 = bpy.context.object
    k2.data.energy = 90 * max(1, size)
    k2.data.size = size * 2

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 28
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 420
    sc.render.resolution_y = 420
    sc.render.film_transparent = False
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.78, 0.80, 1)
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.85
    sc.render.filepath = os.path.join(OUT, nm + ".png")
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print("SHOT", nm, "bbox", round(maxx - minx, 2), round(maxy - miny, 2), round(maxz - minz, 2))

print("AUDIT_DONE")
