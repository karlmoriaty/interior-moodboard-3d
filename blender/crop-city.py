"""从参考图裁出窗外城市区域，作为 Blender 场景的背景贴图。
参考图 1111×667，窗外区域约 x 330–1110、y 55–485（左上原点）。
Blender 图像像素是左下原点，需要翻转 y。
"""
import bpy
import numpy as np

SRC = r"D:\ProgramData\WorkBuddyData\.workbuddy\clipboard-images\clipboard-2026-11-20T05-27-49-730Z-647ff4b4.jpg"
DST = r"D:\work_future\fucking\work10000\.tmp\city-crop.jpg"

img = bpy.data.images.load(SRC)
W, H = img.size
print("src size", W, H)

px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)

# 裁切范围（左上原点 → 转成左下原点）
x0, x1 = 470, 1075
y0_top, y1_top = 72, 452
yb0 = H - y1_top
yb1 = H - y0_top

crop = px[yb0:yb1, x0:x1, :]
ch, cw = crop.shape[0], crop.shape[1]
print("crop size", cw, ch)

out = bpy.data.images.new("crop", width=cw, height=ch, alpha=False)
out.pixels = crop.ravel().tolist()
out.filepath_raw = DST
out.file_format = 'JPEG'
out.save()
print("CITY_CROP_DONE", DST)
