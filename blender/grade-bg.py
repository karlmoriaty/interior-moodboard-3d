"""背景图预补偿：提亮 + 加饱和，抵消渲染管线的去饱和损失。

渲染端（ACES + 曝光 0.72 + 窗玻璃叠加）会把暖色高光推向灰白，
预览时原图会明显不如参考图通透。这里先在贴图上补偿回来。
"""
import bpy
import numpy as np
import sys

a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = a[0], a[1]
TARGET_W = int(a[2])
BRIGHT = float(a[3]) if len(a) > 3 else 1.0
SAT = float(a[4]) if len(a) > 4 else 1.0

img = bpy.data.images.load(SRC)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)

newW = TARGET_W
newH = int(round(H * TARGET_W / W))
yi = (np.arange(newH) * H / newH).astype(np.int32)
xi = (np.arange(newW) * W / newW).astype(np.int32)
out = px[yi][:, xi, :].copy()

rgb = out[:, :, :3]
# 亮度（Rec.709 权重）
lum = (rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722)[:, :, None]
# 饱和度：向亮度插值/外插
rgb = lum + (rgb - lum) * SAT
# 提亮（保护高光，避免死白）
rgb = np.clip(rgb * BRIGHT, 0.0, 1.0)
out[:, :, :3] = rgb

o = bpy.data.images.new("out", width=newW, height=newH, alpha=False)
o.pixels = out.ravel().tolist()
sc = bpy.context.scene
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 88
o.file_format = 'JPEG'
o.filepath_raw = DST
o.save()
print("DONE", newW, newH, "bright", BRIGHT, "sat", SAT)
