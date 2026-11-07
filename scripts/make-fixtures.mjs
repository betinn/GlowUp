#!/usr/bin/env node
/**
 * Generates the synthetic test images used by the visual checks. No real people, no downloads.
 *  - tests/fixtures/portrait.png: procedural portrait with pores, blemishes, dark circles,
 *    red-eye pupils and yellowish teeth, so every retouch tool has something to act on.
 *  - tests/fixtures/gradient.png: ramps and patches to spot banding, clipping and color shifts.
 *  - tests/fixtures/group.png: two procedural portraits side by side, for choosing a face.
 * Plain Node, with a small PNG writer. Deterministic: same bytes on every run.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = 'tests/fixtures';

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function writePng(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

/* Math helpers */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(xi, yi), hash(xi + 1, yi), u), mix(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}

function fbm(x, y, oct = 4) {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise(x, y) * a;
    n += a;
    x = x * 2.03 + 11.7;
    y = y * 2.03 + 3.1;
    a *= 0.5;
  }
  return s / n;
}

/* Portrait: coordinates are centered, y grows downward, face height near 1. */
const blemishSpots = [];

function portrait(W, H) {
  const rgb = new Uint8Array(W * H * 3);
  const SKIN = [0.86, 0.66, 0.54];
  const SHADOW = [0.56, 0.36, 0.3];
  const blemishes = [];
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 3) * Math.PI * 2;
    const r = Math.sqrt(hash(i, 7));
    blemishes.push({
      x: Math.cos(a) * r * 0.27,
      y: 0.08 + Math.sin(a) * r * 0.3,
      r: 0.0045 + hash(i, 11) * 0.0075,
      red: 0.5 + hash(i, 13) * 0.5,
    });
  }
  blemishSpots.push(...blemishes);
  const eyes = [
    { x: -0.155, y: -0.06 },
    { x: 0.155, y: -0.06 },
  ];

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px - W / 2) / H;
      const y = (py - H * 0.5) / H;

      // Backdrop: soft gray-blue with a gentle falloff.
      let c = mix3([0.3, 0.33, 0.37], [0.16, 0.17, 0.2], smooth(0.1, 0.8, Math.hypot(x + 0.15, y + 0.2)));

      // Shoulders.
      const shoulder = 0.54 - 0.36 * Math.exp(-((x / 0.34) ** 2));
      if (y > shoulder) {
        const cloth = 0.25 + 0.05 * fbm(px / 18, py / 18);
        c = mix3([cloth * 0.7, cloth * 0.75, cloth * 0.95], [0.08, 0.09, 0.14], smooth(0, 0.45, Math.abs(x)));
      }

      // Neck.
      const neckW = 0.12 + smooth(0.3, 0.5, y) * 0.1;
      if (Math.abs(x) < neckW && y > 0.22 && y < shoulder + 0.05) {
        const d = Math.abs(x) / neckW;
        c = mix3(SKIN, SHADOW, smooth(0.5, 1, d) * 0.8 + smooth(0.36, 0.26, y) * 0.5);
      }

      // Hair behind the head.
      const hx = x / 0.345;
      const hy = (y + 0.03) / 0.44;
      const hairBack = hx * hx + hy * hy;
      const flow = fbm(x * 40 + y * 6, y * 5, 3);
      if (hairBack < 1 + 0.12 * (flow - 0.5) && y < 0.34) {
        const strand = 0.5 + 0.5 * Math.sin((x * 130 + flow * 14) * 1.3);
        const base = 0.09 + 0.1 * strand + 0.1 * smooth(-0.3, -0.42, y);
        c = [base * 1.25, base * 0.88, base * 0.62];
      }

      // Face.
      const fx = x / 0.285;
      const fy = (y - 0.02) / (y > 0.02 ? 0.385 : 0.355);
      const face = fx * fx + fy * fy;
      if (face < 1) {
        const edge = smooth(0.55, 1, face);
        // Soft light from the upper left.
        const light = clamp(0.92 + (-x * 0.5 - y * 0.25) - edge * 0.42);
        let skin = mix3(SHADOW, SKIN, clamp(light * 1.05));

        // Warm cheeks, blotchy tone, pores.
        const cheek = Math.exp(-(((Math.abs(x) - 0.16) / 0.1) ** 2 + ((y - 0.1) / 0.09) ** 2));
        skin = mix3(skin, [0.86, 0.52, 0.45], cheek * 0.22);
        const blotch = fbm(px / 95, py / 95) - 0.5;
        skin = [skin[0] + blotch * 0.06, skin[1] + blotch * 0.08, skin[2] + blotch * 0.05];
        const pores = (fbm(px / 2.3, py / 2.3, 2) - 0.5) * 0.09 + (hash(px, py) - 0.5) * 0.022;
        skin = [skin[0] + pores, skin[1] + pores * 0.92, skin[2] + pores * 0.9];

        // Nose shading.
        const nose = Math.exp(-(((x + 0.012) / 0.03) ** 2 + ((y - 0.08) / 0.11) ** 2));
        skin = mix3(skin, [skin[0] * 1.08, skin[1] * 1.08, skin[2] * 1.07], nose * 0.8);
        const sideNose = Math.exp(-(((Math.abs(x) - 0.05) / 0.016) ** 2 + ((y - 0.11) / 0.07) ** 2));
        skin = mix3(skin, SHADOW, sideNose * 0.3);
        const nostril = Math.exp(-(((Math.abs(x) - 0.026) / 0.012) ** 2 + ((y - 0.172) / 0.007) ** 2));
        skin = mix3(skin, [0.25, 0.14, 0.12], nostril * 0.75);

        // Dark circles: darker and purple-blue under the eyes.
        for (const e of eyes) {
          const under = Math.exp(-(((x - e.x) / 0.07) ** 2 + ((y - e.y - 0.05) / 0.024) ** 2));
          skin = mix3(skin, [skin[0] * 0.72, skin[1] * 0.6, skin[2] * 0.72], under * 0.85);
        }
        c = skin;

        // Blemishes.
        for (const b of blemishes) {
          const d = Math.hypot(x - b.x, y - b.y) / b.r;
          if (d < 2.2) {
            const k = Math.exp(-d * d * 1.3);
            c = mix3(c, [c[0] * 0.86, c[1] * mix(0.76, 0.56, b.red), c[2] * mix(0.76, 0.55, b.red)], k);
          }
        }
      }

      // Hair fringe over the forehead.
      const fringe = -0.3 + 0.07 * Math.sin(x * 9 + 1) + 0.03 * (fbm(x * 22, 3, 3) - 0.5);
      if (y < fringe && hairBack < 1.02) {
        const strand = 0.5 + 0.5 * Math.sin(x * 170 + y * 34 + flow * 10);
        const base = 0.08 + 0.12 * strand;
        c = [base * 1.25, base * 0.88, base * 0.62];
      }

      // Eyes.
      for (const e of eyes) {
        const ex = (x - e.x) / 0.066;
        const ey = (y - e.y) / 0.029;
        const lid = ex * ex + ey * ey * (1 + 0.5 * ex * ex);
        if (lid < 1) {
          const d = Math.hypot(x - e.x, y - e.y);
          let eye = mix3([0.9, 0.87, 0.84], [0.78, 0.66, 0.62], smooth(0.5, 1, Math.abs(ex)));
          // Iris with radial fibers.
          const ir = 0.0255;
          if (d < ir) {
            const ang = Math.atan2(y - e.y, x - e.x);
            const fib = 0.5 + 0.5 * Math.sin(ang * 38 + fbm(ang * 6, d * 90, 2) * 7);
            const t = d / ir;
            eye = mix3([0.42, 0.28, 0.16], [0.2, 0.12, 0.07], t * 0.9);
            eye = [eye[0] + fib * 0.1, eye[1] + fib * 0.07, eye[2] + fib * 0.04];
            eye = mix3(eye, [0.08, 0.05, 0.04], smooth(0.84, 1, t));
          }
          // Red-eye pupil on one side.
          if (d < 0.0105) {
            eye = e.x < 0 ? [0.75, 0.13, 0.1] : [0.05, 0.04, 0.04];
          }
          // Catchlight.
          const cl = Math.hypot(x - e.x + 0.008, y - e.y + 0.009);
          if (cl < 0.0042) eye = [0.97, 0.97, 0.96];
          // Upper lid shadow.
          eye = mix3(eye, [eye[0] * 0.55, eye[1] * 0.5, eye[2] * 0.5], smooth(0.2, -0.9, ey) * 0.7);
          c = eye;
        } else if (lid < 1.22 && y < e.y) {
          c = [0.13, 0.09, 0.08];
        }

        // Eyebrows from short strokes.
        const bx = (x - e.x) / 0.092;
        const by = (y - e.y + 0.078 + 0.02 * bx * bx - 0.008 * (e.x < 0 ? bx : -bx)) / 0.0125;
        if (bx * bx + by * by < 1) {
          const hairy = 0.5 + 0.5 * Math.sin(x * 620 + y * 240);
          const k = 0.45 + 0.5 * hairy;
          c = mix3(c, [0.17, 0.11, 0.08], k);
        }
      }

      // Mouth: lips around a smile with teeth.
      const mx = x / 0.098;
      const my = (y - 0.25) / 0.042;
      const curve = 0.32 * mx * mx;
      const upper = my + 0.1 + curve * 1.0;
      const inMouth = Math.abs(mx) < 1 && Math.abs(my - curve * -0.9) < (1 - mx * mx) * 1.25;
      if (inMouth) {
        const open = Math.abs(upper) < (1 - mx * mx) * 0.5;
        if (open) {
          const tooth = Math.abs(((mx * 4.2 + 100.5) % 1) - 0.5);
          const gap = smooth(0.46, 0.5, tooth);
          let t = mix3([0.9, 0.82, 0.6], [0.72, 0.62, 0.42], smooth(0.2, 1, Math.abs(mx)));
          t = mix3(t, [0.42, 0.3, 0.2], gap * 0.7);
          c = t;
        } else {
          const shade = 0.75 + 0.25 * smooth(1, -0.3, my);
          const shine = Math.exp(-(((mx + 0.2) / 0.5) ** 2 + ((my - 0.72) / 0.14) ** 2)) * 0.22;
          c = [0.67 * shade + shine, 0.31 * shade + shine, 0.31 * shade + shine];
        }
      }

      // Small sensor noise for all pixels.
      const n = (hash(px + 7, py + 13) - 0.5) * 0.012;
      const i = (py * W + px) * 3;
      rgb[i] = clamp(c[0] + n) * 255;
      rgb[i + 1] = clamp(c[1] + n) * 255;
      rgb[i + 2] = clamp(c[2] + n) * 255;
    }
  }
  return rgb;
}

function gradient(W, H) {
  const rgb = new Uint8Array(W * H * 3);
  const patches = [
    [0.86, 0.66, 0.54],
    [0.5, 0.34, 0.26],
    [0.3, 0.5, 0.8],
    [0.85, 0.2, 0.2],
    [0.2, 0.7, 0.3],
    [0.95, 0.85, 0.2],
    [0.5, 0.5, 0.5],
    [0.1, 0.1, 0.1],
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const v = y / (H - 1);
      let c;
      if (v < 0.25) c = [u, u, u];
      else if (v < 0.5) {
        const h = u * 6;
        const k = (n) => clamp(Math.abs(((h + n) % 6) - 3) - 1);
        c = [k(0), k(4), k(2)];
      } else if (v < 0.75) c = patches[Math.min(7, Math.floor(u * 8))];
      else c = [u * 0.25, u * 0.25, u * 0.28];
      const i = (y * W + x) * 3;
      rgb[i] = c[0] * 255;
      rgb[i + 1] = c[1] * 255;
      rgb[i + 2] = c[2] * 255;
    }
  }
  return rgb;
}

/** Copies of the portrait side by side. */
function group(pw, ph, count) {
  const one = portrait(pw, ph);
  const W = pw * count;
  const rgb = new Uint8Array(W * ph * 3);
  for (let y = 0; y < ph; y++) {
    for (let i = 0; i < count; i++) {
      rgb.set(one.subarray(y * pw * 3, (y + 1) * pw * 3), (y * W + i * pw) * 3);
    }
  }
  return rgb;
}

mkdirSync(OUT, { recursive: true });
const PW = 1500;
const PH = 1875;
writePng(`${OUT}/portrait.png`, PW, PH, portrait(PW, PH));
writePng(`${OUT}/gradient.png`, 1024, 768, gradient(1024, 768));
writeFileSync(`${OUT}/portrait.json`, `${JSON.stringify({ blemishes: blemishSpots }, null, 2)}
`);
writePng(`${OUT}/group.png`, 1200, 750, group(600, 750, 2));
console.log('fixtures ok');
