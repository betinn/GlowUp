/**
 * A zip file with the files as they are, with no compression: photos are compressed already. Enough for one
 * download that holds every slide of a post, in order, and small enough to need no library.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** The date and time of a file, as the format keeps them: two seconds apart, from 1980 on. */
function dosTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** The parts of the file, in order: each file after a header of its own, then the list of them all. */
export function zip(entries: readonly ZipEntry[], date = new Date()): Uint8Array[] {
  const encoder = new TextEncoder();
  const { time, day } = dosTime(date);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    // Names are UTF-8.
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, entry.data);

    const listed = new DataView(new ArrayBuffer(46));
    listed.setUint32(0, 0x02014b50, true);
    listed.setUint16(4, 20, true);
    listed.setUint16(6, 20, true);
    listed.setUint16(8, 0x0800, true);
    listed.setUint16(10, 0, true);
    listed.setUint16(12, time, true);
    listed.setUint16(14, day, true);
    listed.setUint32(16, crc, true);
    listed.setUint32(20, size, true);
    listed.setUint32(24, size, true);
    listed.setUint16(28, name.length, true);
    listed.setUint32(42, offset, true);
    central.push(new Uint8Array(listed.buffer), name);
    offset += 30 + name.length + size;
  }
  const listSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, listSize, true);
  end.setUint32(16, offset, true);
  return [...parts, ...central, new Uint8Array(end.buffer)];
}
