import { describe, expect, it } from 'vitest';
import { createDoc } from '../../src/core/doc';
import { InvalidProjectError, pack, unpack, validProject } from '../../src/core/project';

const photo = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

function goodRecord() {
  return {
    id: 'p-1',
    name: 'foto',
    updated: 1,
    width: 40,
    height: 30,
    thumb: photo(),
    doc: createDoc(40, 30),
    masks: { smooth: photo() } as Record<string, unknown>,
    field: null as unknown,
  };
}

/** A record with one change made to it, by what it breaks. */
const BROKEN: [string, (r: ReturnType<typeof goodRecord>) => void][] = [
  ['another version of the document', (r) => ((r.doc as { version: number }).version = 2)],
  ['no document', (r) => ((r as { doc: unknown }).doc = undefined)],
  ['a size that is not one', (r) => (r.doc.width = 0)],
  ['no adjustments', (r) => ((r.doc as { adjust: unknown }).adjust = null)],
  ['an adjustment that is not a number', (r) => ((r.doc.adjust as unknown as Record<string, unknown>).exposure = 'x')],
  ['a filter with no intensity', (r) => ((r.doc.filter as { intensity: unknown }).intensity = undefined)],
  ['an unknown blur', (r) => ((r.doc.blur as { mode: string }).mode = 'zoom')],
  ['a crop with no size', (r) => ((r.doc.crop as { cw: unknown }).cw = null)],
  ['a tool with no settings', (r) => ((r.doc.layers as Record<string, unknown>).smooth = { enabled: true, painted: true })],
  ['a heal with no spots', (r) => ((r.doc.heals as unknown[]) = [{ id: 1, hardness: 1, du: 0, dv: 0 }])],
  ['heals that are no list', (r) => ((r.doc as { heals: unknown }).heals = {})],
  ['a heal from nobody knows where', (r) => ((r.doc.heals as unknown[]) = [{ id: 1, dabs: [{ u: 0.5, v: 0.5, r: 0.01 }], hardness: 1, du: 0, dv: 0, origin: 'magic' }])],
  ['no field flag', (r) => ((r.doc as { hasField: unknown }).hasField = undefined)],
  ['a mask that is no file', (r) => (r.masks.smooth = 'x')],
  ['a field that is no file', (r) => (r.field = 'x')],
  ['no picture', (r) => ((r as { thumb: unknown }).thumb = undefined)],
];

describe('saved project validation', () => {
  it('takes a project as autosave writes it', () => {
    const record = goodRecord();
    const original = photo();
    expect(validProject(record, original)).toEqual({ record, original });
  });

  it('takes a project with work in it', () => {
    const record = goodRecord();
    record.doc.layers.smooth = { enabled: true, painted: true, params: { strength: 50 } };
    // Spots of the automatic mode and of the brush keep where they came from. An older project has no origin.
    record.doc.heals = [
      { id: 1, dabs: [{ u: 0.5, v: 0.5, r: 0.01 }], hardness: 0.3, du: 0.1, dv: 0 },
      { id: 2, dabs: [{ u: 0.4, v: 0.5, r: 0.01 }], hardness: 0.3, du: 0.1, dv: 0, origin: 'auto' },
      { id: 3, dabs: [{ u: 0.6, v: 0.5, r: 0.01 }], hardness: 0.3, du: 0.1, dv: 0, origin: 'manual' },
    ];
    record.doc.filter = { id: 'mel', intensity: 0.5, masked: true, feather: 20, reach: 0.2 };
    record.doc.hasField = true;
    record.field = photo();
    expect(() => validProject(record, photo())).not.toThrow();
  });

  it.each(BROKEN)('refuses %s', (_name, breakIt) => {
    const record = goodRecord();
    breakIt(record);
    expect(() => validProject(record, photo())).toThrow(InvalidProjectError);
  });

  it('refuses a record or a photo that is not there', () => {
    expect(() => validProject(undefined, photo())).toThrow(InvalidProjectError);
    expect(() => validProject(goodRecord(), undefined)).toThrow(InvalidProjectError);
    expect(() => validProject(goodRecord(), new Blob([]))).toThrow(InvalidProjectError);
    expect(() => validProject(goodRecord(), 'x')).toThrow(InvalidProjectError);
  });
});

describe('packed data of a project', () => {
  const bytes = Uint8Array.from({ length: 2000 }, (_, i) => i % 251);

  it('comes back as it went in', async () => {
    expect(await unpack(await pack(bytes))).toEqual(bytes);
  });

  it('reads the form without compression, ready to be read as floats', async () => {
    const out = await unpack(new Blob([new Uint8Array([0]), bytes]));
    expect(out).toEqual(bytes);
    expect(out.byteOffset).toBe(0);
  });

  it('calls invalid what can never unpack', async () => {
    await expect(unpack(new Blob([]))).rejects.toBeInstanceOf(InvalidProjectError);
    await expect(unpack(new Blob([new Uint8Array([7, 1, 2])]))).rejects.toBeInstanceOf(InvalidProjectError);
    await expect(unpack(new Blob([new Uint8Array([1, 9, 9, 9, 9, 9])]))).rejects.toBeInstanceOf(InvalidProjectError);
  });

  it('does not call invalid a read that failed', async () => {
    const failing = { arrayBuffer: () => Promise.reject(new DOMException('read', 'NotReadableError')) } as unknown as Blob;
    const err: unknown = await unpack(failing).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect(err).not.toBeInstanceOf(InvalidProjectError);
  });
});
