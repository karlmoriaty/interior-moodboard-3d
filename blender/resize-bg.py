"""把参考图处理成场景背景贴图：读入 → 缩放到目标宽度 → 存 JPEG。

ffmpeg 的精简版读不了这批 jpg（Invalid data），Blender 的 numpy 通路可用，
之前裁城市图就是这么做的。
"""
import bpy
import numpy as np
import sys

SRC = sys.argv[sys.argv.index('--') + 1]
DST = sys.argv[sys.argv.index('--') + 2]
TARGET_W = int(sys.argv[sys.argv.index('--') + 3])
QUALITY = int(sys.argv[sys.argv.index('--') + 4]) if len(sys.argv) > sys.argv.index('--') + 4 else 88

img = bpy.data.images.load(SRC)
W, H = img.size
print("SRC", W, H)

px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)

# 等比缩放到目标宽度（最近邻足够，背景贴图不追求锐利）
newW = TARGET_W
newH = int(round(H * TARGET_W / W))
yi = (np.arange(newH) * H / newH).astype(np.int32)
xi = (np.arange(newW) * W / newW).astype(np.int32)
out_px = px[yi][:, xi, :]

out = bpy.data.images.new("out", width=newW, height=newH, alpha=False)
out.pixels = out_px.ravel().tolist()
out.filepath_raw = DST
sc = bpy.context.scene
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = QUALITY
out.file_format = 'JPEG'
out.save()

print("DST", newW, newH, DST)
