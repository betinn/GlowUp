/**
 * Fits a 3D table to pairs of colors, and reads it back. Each output color is a blend of the eight nodes around
 * its input, so the fit is a sparse least squares problem. A photo shows only part of the cube, so what the
 * table does between and beyond its colors comes from a penalty on the change of the slope of the difference
 * from no filter: away from the data the table keeps going the way it was going. It is solved by conjugate
 * gradients, and repeated with less trust in the samples the table cannot follow, so a local effect in the
 * photo pulls the table less and stands out in the residual, where the report can find it.
 */

/** Weight of the smoothness against the samples, which together weigh as much as one sample per node. */
const SMOOTH = 0.02;
/** Keeps the system invertible in corners of the cube no sample reached. */
const RIDGE = 1e-5;
const MAX_STEPS = 400;
const TOLERANCE = 1e-5;
const ROUNDS = 3;
/** Residuals up to this size, on the 0..1 scale, count in full. */
const TRUST = 0.02;

/** Blends the eight nodes around a color. Writes the three outputs to `out`. */
export function lookup(lut, r, g, b, out) {
  const { size, nodes } = lut;
  const last = size - 1;
  const x = Math.min(1, Math.max(0, r)) * last;
  const y = Math.min(1, Math.max(0, g)) * last;
  const z = Math.min(1, Math.max(0, b)) * last;
  const ix = Math.min(Math.floor(x), last - 1);
  const iy = Math.min(Math.floor(y), last - 1);
  const iz = Math.min(Math.floor(z), last - 1);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const base = (iz * size + iy) * size + ix;
  const sxy = size * size;
  out[0] = out[1] = out[2] = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1;
    const dy = (c >> 1) & 1;
    const dz = (c >> 2) & 1;
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    if (w === 0) continue;
    const n = (base + dx + dy * size + dz * sxy) * 3;
    out[0] += w * nodes[n];
    out[1] += w * nodes[n + 1];
    out[2] += w * nodes[n + 2];
  }
  return out;
}

/** The filter that does nothing. */
export function identityLut(size) {
  const nodes = new Float32Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        nodes[i++] = r / (size - 1);
        nodes[i++] = g / (size - 1);
        nodes[i++] = b / (size - 1);
      }
    }
  }
  return { size, nodes };
}

/** The base64 text a filter file holds: 16-bit little-endian RGB, R varying fastest. */
export function encodeLut({ nodes }) {
  const bytes = Buffer.alloc(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) bytes.writeUInt16LE(Math.round(Math.min(1, Math.max(0, nodes[i])) * 65535), i * 2);
  return bytes.toString('base64');
}

/** What the normal equations of a size need, whatever the samples: which node sits next to which. */
function neighborTable(size) {
  const count = size ** 3;
  const table = new Int32Array(count * 27);
  for (let b = 0, n = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++, n++) {
        for (let s = 0; s < 27; s++) {
          const dr = (s % 3) - 1;
          const dg = (Math.floor(s / 3) % 3) - 1;
          const db = Math.floor(s / 9) - 1;
          const inside = r + dr >= 0 && r + dr < size && g + dg >= 0 && g + dg < size && b + db >= 0 && b + db < size;
          table[n * 27 + s] = inside ? n + dr + dg * size + db * size * size : -1;
        }
      }
    }
  }
  return table;
}

/** Adds the penalty on second differences along each axis to `out`. */
function addSmooth(p, out, size, k) {
  const strides = [1, size, size * size];
  for (let axis = 0; axis < 3; axis++) {
    const s = strides[axis];
    for (let b = 0, n = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++, n++) {
          const at = [r, g, b][axis];
          if (at === 0 || at === size - 1) continue;
          const d = k * (p[n - s] - 2 * p[n] + p[n + s]);
          out[n - s] += d;
          out[n] -= 2 * d;
          out[n + s] += d;
        }
      }
    }
  }
}

function smoothDiagonal(size, k) {
  const diag = new Float64Array(size ** 3);
  const strides = [1, size, size * size];
  for (let axis = 0; axis < 3; axis++) {
    const s = strides[axis];
    for (let b = 0, n = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++, n++) {
          const at = [r, g, b][axis];
          if (at === 0 || at === size - 1) continue;
          diag[n - s] += k;
          diag[n] += 4 * k;
          diag[n + s] += k;
        }
      }
    }
  }
  return diag;
}

function conjugateGradients(apply, inverseDiag, rhs, x) {
  const n = rhs.length;
  const q = new Float64Array(n);
  apply(x, q);
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  let rz = 0;
  let norm = 0;
  for (let i = 0; i < n; i++) {
    r[i] = rhs[i] - q[i];
    z[i] = r[i] * inverseDiag[i];
    p[i] = z[i];
    rz += r[i] * z[i];
    norm += rhs[i] * rhs[i];
  }
  const stop = TOLERANCE * TOLERANCE * Math.max(norm, 1e-20);
  for (let step = 0; step < MAX_STEPS; step++) {
    let rr = 0;
    for (let i = 0; i < n; i++) rr += r[i] * r[i];
    if (rr <= stop) break;
    q.fill(0);
    apply(p, q);
    let pq = 0;
    for (let i = 0; i < n; i++) pq += p[i] * q[i];
    if (pq <= 0) break;
    const alpha = rz / pq;
    let next = 0;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * q[i];
      z[i] = r[i] * inverseDiag[i];
      next += r[i] * z[i];
    }
    const beta = next / rz;
    rz = next;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
}

/**
 * Fits a table to `count` color pairs: `input` and `output` hold three values per pair. Returns the table and
 * how many samples each node saw, which says how much of the cube the photos covered.
 */
export function fitLut(input, output, { size = 17, smooth = SMOOTH, rounds = ROUNDS } = {}) {
  const count = input.length / 3;
  const nodeCount = size ** 3;
  const neighbors = neighborTable(size);
  const delta = [new Float64Array(nodeCount), new Float64Array(nodeCount), new Float64Array(nodeCount)];
  const trust = new Float32Array(count).fill(1);
  const seen = new Float32Array(nodeCount);
  const weights = new Float64Array(8);
  const corners = new Int32Array(8);
  const last = size - 1;

  const cornersOf = (s) => {
    const x = Math.min(1, Math.max(0, input[s * 3])) * last;
    const y = Math.min(1, Math.max(0, input[s * 3 + 1])) * last;
    const z = Math.min(1, Math.max(0, input[s * 3 + 2])) * last;
    const ix = Math.min(Math.floor(x), last - 1);
    const iy = Math.min(Math.floor(y), last - 1);
    const iz = Math.min(Math.floor(z), last - 1);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const base = (iz * size + iy) * size + ix;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1;
      const dy = (c >> 1) & 1;
      const dz = (c >> 2) & 1;
      weights[c] = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      corners[c] = base + dx + dy * size + dz * size * size;
    }
  };

  for (let round = 0; round < rounds; round++) {
    const normal = new Float64Array(nodeCount * 27);
    const rhs = [new Float64Array(nodeCount), new Float64Array(nodeCount), new Float64Array(nodeCount)];
    let total = 0;
    for (let s = 0; s < count; s++) total += trust[s];
    const scale = nodeCount / Math.max(total, 1);
    seen.fill(0);
    for (let s = 0; s < count; s++) {
      cornersOf(s);
      const t = trust[s] * scale;
      const target = [output[s * 3] - input[s * 3], output[s * 3 + 1] - input[s * 3 + 1], output[s * 3 + 2] - input[s * 3 + 2]];
      for (let i = 0; i < 8; i++) {
        const wi = weights[i];
        if (wi === 0) continue;
        const ni = corners[i];
        seen[ni] += wi;
        rhs[0][ni] += t * wi * target[0];
        rhs[1][ni] += t * wi * target[1];
        rhs[2][ni] += t * wi * target[2];
        for (let j = 0; j < 8; j++) {
          if (weights[j] === 0) continue;
          const diff = corners[j] - ni;
          // The slot of a neighbor from its offset along the three axes.
          const db = Math.round(diff / (size * size));
          const rest = diff - db * size * size;
          const dg = Math.round(rest / size);
          const dr = rest - dg * size;
          normal[ni * 27 + (dr + 1) + (dg + 1) * 3 + (db + 1) * 9] += t * wi * weights[j];
        }
      }
    }

    const diag = smoothDiagonal(size, smooth);
    const inverseDiag = new Float64Array(nodeCount);
    for (let n = 0; n < nodeCount; n++) inverseDiag[n] = 1 / (normal[n * 27 + 13] + diag[n] + RIDGE);
    const apply = (p, out) => {
      out.fill(0);
      for (let n = 0; n < nodeCount; n++) {
        let v = RIDGE * p[n];
        for (let k = 0; k < 27; k++) {
          const o = neighbors[n * 27 + k];
          if (o >= 0) v += normal[n * 27 + k] * p[o];
        }
        out[n] = v;
      }
      addSmooth(p, out, size, smooth);
    };
    for (let ch = 0; ch < 3; ch++) conjugateGradients(apply, inverseDiag, rhs[ch], delta[ch]);

    if (round < rounds - 1) {
      for (let s = 0; s < count; s++) {
        cornersOf(s);
        let error = 0;
        for (let ch = 0; ch < 3; ch++) {
          let d = 0;
          for (let i = 0; i < 8; i++) d += weights[i] * delta[ch][corners[i]];
          const e = input[s * 3 + ch] + d - output[s * 3 + ch];
          error += e * e;
        }
        error = Math.sqrt(error);
        trust[s] = error > TRUST ? TRUST / error : 1;
      }
    }
  }

  const { nodes } = identityLut(size);
  for (let n = 0; n < nodeCount; n++) {
    for (let ch = 0; ch < 3; ch++) nodes[n * 3 + ch] = Math.min(1, Math.max(0, nodes[n * 3 + ch] + delta[ch][n]));
  }
  return { size, nodes, seen };
}
