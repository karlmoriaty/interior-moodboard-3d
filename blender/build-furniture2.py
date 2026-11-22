"""
家具资产 v2：走写实路线。
核心三件事（对比实验证明有效）：
  1. 倒角 Bevel —— 把直角变成圆角，细分之前必做，否则细分会把硬边放大
  2. 细分曲面 Subsurf —— 让轮廓圆润，接近软包家具的形态
  3. 布料位移 Displace —— 沿法线加噪声，做出被褥/靠垫的褶皱起伏
另外：所有圆柱类（腿、杆）shade_smooth；小物件也要圆润。

导出仍走 GLB → 紧凑二进制，但这次面数会大很多。
"""
import bpy
import bmesh
import math
import random
import os

random.seed(22011)
OUT_DIR = r"D:\work_future\fucking\work10000\.tmp\furniture"
os.makedirs(OUT_DIR, exist_ok=True)


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for b in list(bpy.data.meshes):
        if b.users == 0:
            bpy.data.meshes.remove(b)


# 顶点色材质（保持和项目一致：一个材质走天下）
M_VC = None


def ensure_vc_material():
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
    b.inputs["Metallic"].default_value = 0.0
    M_VC = m
    return m


C_FABRIC = (0.74, 0.71, 0.65)
C_FABRIC_D = (0.56, 0.54, 0.49)
C_CREAM = (0.88, 0.84, 0.75)
C_WOOD = (0.31, 0.20, 0.12)
C_WOOD_D = (0.16, 0.10, 0.06)
C_METAL = (0.11, 0.11, 0.12)
C_BLACK = (0.05, 0.05, 0.055)
C_PLAID_A = (0.42, 0.20, 0.14)
C_PLAID_B = (0.62, 0.46, 0.30)
C_BOOK_A = (0.36, 0.26, 0.20)
C_BOOK_B = (0.52, 0.40, 0.26)


def vcol(ob, rgb):
    me = ob.data
    if not me.color_attributes:
        me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
    layer = me.color_attributes["Col"]
    for i in range(len(layer.data)):
        layer.data[i].color = (*rgb, 1.0)


def soft(name, w, h, d, x, y, z, rgb, bevel=0.05, subdiv=2, wrinkle=0.0,
         rot=(0, 0, 0), seg=4):
    """软包件：倒角 → 细分 → 位移 → 平滑着色"""
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
        bv.segments = seg
        bv.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=bv.name)

    if wrinkle > 0:
        sub = o.modifiers.new("pre", 'SUBSURF')
        sub.levels = 2
        bpy.ops.object.modifier_apply(modifier=sub.name)
        tex = bpy.data.textures.new("wr_" + name, 'CLOUDS')
        tex.noise_scale = 0.26
        tex.noise_depth = 2
        dis = o.modifiers.new("disp", 'DISPLACE')
        dis.texture = tex
        dis.strength = wrinkle
        dis.mid_level = 0.5
        bpy.ops.object.modifier_apply(modifier=dis.name)

    if subdiv > 0:
        s2 = o.modifiers.new("smooth", 'SUBSURF')
        s2.levels = subdiv
        s2.render_levels = subdiv
        bpy.ops.object.modifier_apply(modifier=s2.name)

    bpy.ops.object.shade_smooth()
    vcol(o, rgb)
    o.data.materials.append(ensure_vc_material())
    return o


def hard(name, w, h, d, x, y, z, rgb, bevel=0.012, subdiv=1, rot=(0, 0, 0)):
    """硬表面：只加小倒角 + 一级细分，保留棱角但去掉锋利感"""
    return soft(name, w, h, d, x, y, z, rgb, bevel, subdiv, 0.0, rot)


def rod(name, r1, r2, h, x, y, z, rgb, seg=14, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=h,
                                    location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    vcol(o, rgb)
    o.data.materials.append(ensure_vc_material())
    return o


def sphere(name, r, x, y, z, rgb, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2,
                                         radius=r, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    bpy.ops.object.shade_smooth()
    vcol(o, rgb)
    o.data.materials.append(ensure_vc_material())
    return o


def export(name, target_tris=20000):
    bpy.ops.object.select_all(action='SELECT')
    objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    for ob in objs:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    active = bpy.context.object
    active.name = name
    active.location = (0, 0, 0)
    # ---- 烘焙 AO 到顶点色 ----
    # Cycles 有全局光照，缝隙自然变暗；Three.js 没有 SSAO（vendor 里没有后处理库）。
    # 在 Blender 里把 AO 烘进顶点色，颜色乘上去，等于免费得到暗部。
    # 必须在 Decimate 之前烘：压面之后顶点太稀，AO 会糊。
    me = active.data
    ao_layer = me.color_attributes.new(name="AO", type='BYTE_COLOR', domain='CORNER')
    me.color_attributes.active_color_name = "AO"
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    sc.render.bake.target = 'VERTEX_COLORS'
    sc.render.bake.use_pass_direct = False
    sc.render.bake.use_pass_indirect = False
    bpy.ops.object.select_all(action='DESELECT')
    active.select_set(True)
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.bake(type='AO', margin=2)
    col_layer = me.color_attributes["Col"]
    ncol = len(col_layer.data)
    for i in range(ncol):
        c = col_layer.data[i].color
        a = ao_layer.data[i].color[0]
        k = 0.55 + 0.45 * a
        col_layer.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    me.color_attributes.remove(ao_layer)
    me.color_attributes.active_color_name = "Col"
    print("AO baken:", name, ncol)

    # 细分会把面数推到几十万，单文件根本放不下。
    # Decimate 按目标三角数收：保留圆润轮廓，砍掉过密的网格密度。
    tris = sum(len(p.vertices) - 2 for p in active.data.polygons)
    if tris > target_tris:
        dm = active.modifiers.new('dec', 'DECIMATE')
        dm.ratio = target_tris / tris
        bpy.ops.object.modifier_apply(modifier=dm.name)
    # UV：bumpMap 需要
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
    me = active.data
    print("ASSET", name, os.path.getsize(out), "verts", len(me.vertices),
          "tris", sum(len(p.vertices) - 2 for p in me.polygons))


# ============ 床 ============
clear()
# 床架
hard("frame", 2.02, 0.22, 1.52, 0, 0, 0.30, C_WOOD_D, 0.02, 1)
# 床头软包：厚、圆润
soft("headboard", 2.00, 0.78, 0.20, 0, 0, 0.70, C_FABRIC_D, 0.10, 2, 0.006)
# 三条竖向软包分缝（用细窄的凹条表现）
for sx in (-0.62, 0, 0.62):
    soft("seam", 0.045, 0.70, 0.045, sx, 0, 0.70, C_FABRIC, 0.02, 1, 0.0)
# 床垫
soft("mattress", 1.94, 0.26, 1.46, 0, 0, 0.54, C_FABRIC_D, 0.09, 2, 0.008)
# 被褥：大褶皱
soft("duvet", 1.90, 0.20, 1.02, 0, 0.24, 0.78, C_CREAM, 0.12, 2, 0.028)
# 被子翻边
soft("fold", 1.88, 0.10, 0.22, 0, -0.26, 0.84, C_CREAM, 0.06, 2, 0.02)
# 两个枕头：蓬松
for px in (-0.48, 0.48):
    soft("pillow", 0.70, 0.24, 0.44, px, -0.44, 0.86, C_CREAM, 0.11, 2, 0.03)
# 格纹毯：几条带褶皱的布条压在被尾
for i in range(7):
    y = 0.60 - i * 0.085
    col = C_PLAID_A if i % 2 else C_PLAID_B
    soft("plaid%d" % i, 1.86, 0.022, 0.075, 0, y, 0.885, col, 0.008, 1, 0.004)
# 四条木腿
for lx in (-0.92, 0.92):
    for ly in (-0.64, 0.64):
        rod("leg", 0.038, 0.030, 0.30, lx, ly, 0.15, C_WOOD_D, 10)
export("bed", 22000)

# ============ 沙发 ============
clear()
soft("base", 2.35, 0.26, 0.95, 0, 0, 0.24, C_FABRIC_D, 0.09, 2, 0.006)
soft("back", 2.35, 0.58, 0.22, 0, 0, 0.62, C_FABRIC_D, 0.10, 2, 0.008)
for sx in (-1, 1):
    soft("arm", 0.20, 0.46, 0.95, sx * 1.08, 0, 0.52, C_FABRIC_D, 0.10, 2, 0.006)
for sx in (-0.55, 0.55):
    soft("seat", 1.04, 0.22, 0.84, sx, 0.05, 0.44, C_FABRIC, 0.10, 2, 0.014)
for px, rz in ((-0.62, 0.1), (0.58, -0.08)):
    soft("pillow", 0.38, 0.34, 0.18, px, -0.28, 0.72, C_CREAM, 0.09, 2, 0.028,
         rot=(0.2, 0, rz))
# 搭毯：一条垂下来的布
# 搭毯原来 z=0.74 而座面顶 0.55 —— 悬空 16.5 cm，看着像一块飘着的板。
# 降到 0.575，贴着座面顶搭下来。
soft("throw", 0.44, 0.05, 0.62, -0.96, 0.10, 0.575, (0.50, 0.44, 0.38), 0.02, 2, 0.016)
for lx in (-1.0, 1.0):
    for ly in (-0.35, 0.35):
        rod("leg", 0.028, 0.022, 0.16, lx, ly, 0.08, C_WOOD_D, 10)
export("sofa", 22000)

# ============ 茶几 ============
clear()
hard("top", 1.42, 0.10, 0.82, 0, 0, 0.45, C_WOOD, 0.012, 1)
hard("shelf", 1.26, 0.045, 0.70, 0, 0, 0.17, C_WOOD_D, 0.008, 1)
for lx in (-0.62, 0.62):
    for ly in (-0.33, 0.33):
        rod("leg", 0.020, 0.016, 0.42, lx, ly, 0.21, C_METAL, 10)
# 台面摆件：书（两本叠放，圆角）
hard("book1", 0.30, 0.045, 0.22, -0.34, 0.06, 0.52, C_BOOK_A, 0.006, 1)
hard("book2", 0.27, 0.038, 0.20, -0.33, 0.05, 0.565, C_BOOK_B, 0.005, 1,
     rot=(0, 0, 0.09))
# 杯子：杯身 + 杯口
rod("cup", 0.046, 0.040, 0.085, 0.30, -0.08, 0.545, C_CREAM, 18)
rod("cupIn", 0.040, 0.038, 0.02, 0.30, -0.08, 0.585, (0.55, 0.50, 0.44), 18)
# 蜡烛
rod("candle", 0.032, 0.032, 0.17, 0.12, 0.20, 0.585, (0.93, 0.89, 0.80), 14)
export("coffeeTable", 5000)

# ============ 钢琴 ============
clear()
hard("body", 1.50, 0.30, 0.98, -0.12, 0, 0.76, C_BLACK, 0.03, 1)
hard("tail", 0.50, 0.28, 0.72, 0.78, -0.08, 0.75, C_BLACK, 0.03, 1)
# 琴盖：hard 的签名是 (w, h, d) —— 琴体是宽 1.50 / 高 0.30 / 深 0.98，
# 所以盖板深度本来就该是 1.00。之前看着「悬空」是缺支撑杆，
# 不是尺寸问题。改成小角度掀开 + 加一根支杆（真实三角钢琴就是这么撑的）。
lid = hard("lid", 1.52, 0.045, 1.00, -0.12, 0, 1.02, C_BLACK, 0.012, 1,
           rot=(math.radians(-12), 0, 0))
rod("prop", 0.011, 0.009, 0.30, 0.50, -0.26, 1.02, C_BLACK, 8)
# 键盘：白键条 + 黑键
hard("keys", 0.78, 0.075, 0.26, -0.86, 0.03, 0.80, C_CREAM, 0.008, 1)
for k in range(12):
    if k % 7 in (2, 6):
        continue
    hard("bk%d" % k, 0.026, 0.036, 0.15, -1.19 + k * 0.062, 0.0, 0.85, C_BLACK, 0.003, 1)
# 谱架
hard("stand", 0.66, 0.42, 0.022, -0.88, -0.19, 1.10, C_BLACK, 0.006, 1,
     rot=(math.radians(-18), 0, 0))
# 三条腿：必须落在琴体投影内（琴体 y ±0.15、尾部 y -0.22~0.06）。
# 原来 y=0.26~0.46 全在琴体前方的空气里 —— 看着像只有两条腿撑着。
for lx, ly in ((-1.00, 0.02), (-0.08, 0.02), (0.78, -0.08)):
    rod("leg", 0.042, 0.032, 0.72, lx, ly, 0.36, C_BLACK, 12)
# 琴凳
soft("bench", 0.46, 0.10, 0.32, -1.05, 0.76, 0.47, C_BLACK, 0.03, 2, 0.004)
for bx in (-1.18, -0.92):
    for by in (0.64, 0.88):
        rod("bl", 0.020, 0.016, 0.44, bx, by, 0.24, C_BLACK, 8)
export("piano", 9000)

print("ALL_DONE")

# ============ 转角沙发（L 形）= ============
clear()
SW, SD, AW = 2.62, 2.02, 0.95
# 长边（沿 x）
soft("baseL", SW, 0.26, AW, 0, 0, 0.24, C_FABRIC_D, 0.09, 2, 0.006)
soft("backL", SW, 0.58, 0.22, 0, -SD / 2 + 0.11, 0.62, C_FABRIC_D, 0.10, 2, 0.008)
# 短边（沿 z，靠左）
soft("baseS", AW, 0.26, SD - AW, -SW / 2 + AW / 2, AW / 2, 0.24, C_FABRIC_D, 0.09, 2, 0.006)
soft("backS", 0.22, 0.58, SD - AW, -SW / 2 + 0.11, AW / 2, 0.62, C_FABRIC_D, 0.10, 2, 0.008)
# 外侧扶手
soft("armR", 0.20, 0.46, AW, SW / 2 - 0.10, 0, 0.52, C_FABRIC_D, 0.10, 2, 0.006)
soft("armF", AW, 0.46, 0.20, -SW / 2 + AW / 2, SD / 2 - 0.10, 0.52, C_FABRIC_D, 0.10, 2, 0.006)
# 坐垫：长边两块 + 短边一块
for sx in (-0.55, 0.62):
    soft("seatL", 1.12, 0.22, AW - 0.24, sx, -0.02, 0.44, C_FABRIC, 0.10, 2, 0.014)
soft("seatS", AW - 0.24, 0.22, 0.86, -SW / 2 + AW / 2 + 0.05, AW / 2 + 0.12, 0.44,
     C_FABRIC, 0.10, 2, 0.014)
# 靠枕
for px, pz, rz in ((-0.92, -SD / 2 + 0.32, 0.1), (0.5, -SD / 2 + 0.32, -0.08)):
    soft("pillow", 0.40, 0.36, 0.20, px, pz, 0.72, C_CREAM, 0.09, 2, 0.028,
         rot=(0.2, 0, rz))
# 搭毯
soft("throw", 0.46, 0.06, 0.66, -SW / 2 + AW / 2, 0.62, 0.74, (0.50, 0.44, 0.38),
     0.02, 2, 0.018)
# 腿
for lx, lz in ((-SW/2+0.14, -SD/2+0.14), (SW/2-0.14, -SD/2+0.14),
               (-SW/2+0.14, SD/2-0.14), (-0.3, -SD/2+0.14)):
    rod("leg", 0.028, 0.022, 0.16, lx, lz, 0.08, C_WOOD_D, 10)
export("cornerSofa", 30000)
