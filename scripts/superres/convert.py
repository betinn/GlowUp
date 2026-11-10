"""
Converts Real-ESRGAN RealESRGAN_x4plus (BSD-3-Clause, Xintao Wang) to ONNX for the browser.

The network is written out here (RRDBNet, 23 blocks, 64 features, 32 growth), so the conversion needs only
PyTorch and ONNX, not basicsr. Input: float32 RGB in [0, 1], shape [1, 3, H, W], any H and W. Output: float32
RGB, shape [1, 3, 4H, 4W], not clamped.

Steps (Windows, from the root of the repository; nothing here is committed but the result):

    python -m venv .tmp/sr/venv
    .tmp/sr/venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
    .tmp/sr/venv/Scripts/python -m pip install onnx onnxruntime onnxconverter-common numpy pillow
    curl -L -o .tmp/sr/dl/RealESRGAN_x4plus.pth \
      https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
    # sha256 4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1
    .tmp/sr/venv/Scripts/python -I scripts/superres/convert.py .tmp/sr/dl/RealESRGAN_x4plus.pth .tmp/sr/out

It writes `realesrgan_x4plus.fp32.onnx` and `realesrgan_x4plus.fp16.onnx` (fp16 weights and math, float32 in and
out). `scripts/superres/compare.py` measures one against the other on photos; the one that ships is copied to
`src/core/superres/realesrgan_x4plus.onnx`.
"""

import os
import sys

import torch
import torch.nn as nn
import torch.nn.functional as F


class ResidualDenseBlock(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(nf, gc)
        self.rdb2 = ResidualDenseBlock(nf, gc)
        self.rdb3 = ResidualDenseBlock(nf, gc)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32):
        super().__init__()
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def main():
    weights, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    net = RRDBNet()
    # The weights come from the internet: tensors only, never pickled code.
    state = torch.load(weights, map_location="cpu", weights_only=True)
    state = state.get("params_ema", state.get("params", state))
    net.load_state_dict(state, strict=True)
    net.eval()

    fp32 = os.path.join(out_dir, "realesrgan_x4plus.fp32.onnx")
    dummy = torch.rand(1, 3, 64, 64)
    torch.onnx.export(
        net,
        dummy,
        fp32,
        input_names=["image"],
        output_names=["upscaled"],
        dynamic_axes={"image": {2: "h", 3: "w"}, "upscaled": {2: "h4", 3: "w4"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )

    import onnx
    from onnxconverter_common import float16

    model = onnx.load(fp32)
    half = float16.convert_float_to_float16(model, keep_io_types=True)
    onnx.save(half, os.path.join(out_dir, "realesrgan_x4plus.fp16.onnx"))

    import numpy as np
    import onnxruntime as ort

    with torch.no_grad():
        want = net(dummy).numpy()
    for name in ("fp32", "fp16"):
        path = os.path.join(out_dir, f"realesrgan_x4plus.{name}.onnx")
        got = ort.InferenceSession(path, providers=["CPUExecutionProvider"]).run(None, {"image": dummy.numpy()})[0]
        print(name, os.path.getsize(path), "bytes, max diff to torch", float(np.abs(got - want).max()))


if __name__ == "__main__":
    main()
