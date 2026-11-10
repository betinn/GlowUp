"""
Measures the converted models on photos, locally. Nothing leaves the machine, and nothing it writes is committed.

    .tmp/sr/venv/Scripts/python -I scripts/superres/compare.py .tmp/sr/out <folder of photos> .tmp/sr/cmp

For each photo it prints:
- fp16 against fp32 on the whole photo: PSNR and the largest difference, in levels of 0 to 255;
- tiles against the whole photo, with the plan of `src/core/superres/tiles.ts` (same PAD and RAMP): PSNR and the
  largest difference near a seam, for fp32;
- the model against a plain bicubic resize, as the share of fine detail (high frequencies) each one has.
It also writes crops side by side (bicubic, fp32, fp16, tiled) into the output folder, for a look by eye.
"""

import glob
import math
import os
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

PAD = 8
RAMP = 16
OVERLAP = 2 * PAD + RAMP


def run(sess, rgb):
    x = rgb.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    y = sess.run(None, {"image": x})[0][0]
    return np.clip(np.rint(y * 255.0), 0, 255).astype(np.uint8).transpose(1, 2, 0)


def axis(length, tile):
    if length <= tile:
        return [0], length
    count = math.ceil((length - OVERLAP) / (tile - OVERLAP))
    return [round(i * (length - tile) / (count - 1)) for i in range(count)], tile


def smooth(t):
    c = np.clip(t, 0, 1)
    return c * c * (3 - 2 * c)


def weights(starts, size, i, scale):
    x = starts[i] + (np.arange(size * scale) + 0.5) / scale
    w = np.ones_like(x)
    if i > 0:
        a, b = starts[i] + PAD, starts[i - 1] + size - PAD
        w *= smooth((x - a) / (b - a))
    if i < len(starts) - 1:
        a, b = starts[i + 1] + PAD, starts[i] + size - PAD
        w *= 1 - smooth((x - a) / (b - a))
    return w


def tiled(sess, rgb, tile):
    h, w, _ = rgb.shape
    xs, tw = axis(w, tile)
    ys, th = axis(h, tile)
    out = np.zeros((h * 4, w * 4, 3), np.float64)
    for r, y in enumerate(ys):
        wy = weights(ys, th, r, 4)
        for c, x in enumerate(xs):
            wx = weights(xs, tw, c, 4)
            part = run(sess, rgb[y : y + th, x : x + tw]).astype(np.float64)
            out[y * 4 : (y + th) * 4, x * 4 : (x + tw) * 4] += part * wy[:, None, None] * wx[None, :, None]
    return np.clip(np.rint(out), 0, 255).astype(np.uint8), xs, ys


def psnr(a, b):
    mse = np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)
    return float("inf") if mse == 0 else 10 * math.log10(255.0**2 / mse)


def detail(img):
    """Share of the energy of the brightness above a quarter of the highest frequency."""
    g = img.astype(np.float64).mean(axis=2)
    f = np.abs(np.fft.fftshift(np.fft.fft2(g - g.mean()))) ** 2
    h, w = g.shape
    yy, xx = np.mgrid[-h // 2 : h - h // 2, -w // 2 : w - w // 2]
    rr = np.hypot(yy / (h / 2), xx / (w / 2))
    return float(f[rr > 0.25].sum() / f.sum())


def main():
    models, folder, out = sys.argv[1], sys.argv[2], sys.argv[3]
    tile = int(sys.argv[4]) if len(sys.argv) > 4 else 128
    os.makedirs(out, exist_ok=True)
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    s32 = ort.InferenceSession(os.path.join(models, "realesrgan_x4plus.fp32.onnx"), opts, providers=["CPUExecutionProvider"])
    s16 = ort.InferenceSession(os.path.join(models, "realesrgan_x4plus.fp16.onnx"), opts, providers=["CPUExecutionProvider"])
    for path in sorted(glob.glob(os.path.join(folder, "*"))):
        name = os.path.splitext(os.path.basename(path))[0]
        rgb = np.asarray(Image.open(path).convert("RGB"))
        h, w, _ = rgb.shape
        # The whole photo at once needs a lot of memory: big photos are measured on their middle.
        side = 384
        if max(h, w) > side:
            y0, x0 = max(0, (h - side) // 2), max(0, (w - side) // 2)
            rgb = rgb[y0 : y0 + side, x0 : x0 + side]
        a = run(s32, rgb)
        b = run(s16, rgb)
        t, xs, ys = tiled(s32, rgb, tile)
        bic = np.asarray(Image.fromarray(rgb).resize((rgb.shape[1] * 4, rgb.shape[0] * 4), Image.BICUBIC))
        diff = np.abs(a.astype(int) - b.astype(int))
        tdiff = np.abs(a.astype(int) - t.astype(int))
        print(
            f"{name}: {w}x{h} (measured {rgb.shape[1]}x{rgb.shape[0]}), "
            f"fp16 vs fp32 PSNR {psnr(a, b):.1f} dB max {diff.max()} mean {diff.mean():.3f}; "
            f"tiled({tile}, {len(xs)}x{len(ys)}) vs whole PSNR {psnr(a, t):.1f} dB max {tdiff.max()} mean {tdiff.mean():.3f}; "
            f"detail bicubic {detail(bic):.4f} model {detail(a):.4f}"
        )
        cy, cx = a.shape[0] // 2, a.shape[1] // 2
        crop = lambda im: im[cy - 192 : cy + 192, cx - 192 : cx + 192]
        sheet = np.concatenate([crop(bic), crop(a), crop(b), crop(t)], axis=1)
        Image.fromarray(sheet).save(os.path.join(out, f"{name}.png"))
        Image.fromarray(np.clip(tdiff * 40, 0, 255).astype(np.uint8)).save(os.path.join(out, f"{name}.seamdiff.png"))


if __name__ == "__main__":
    main()
