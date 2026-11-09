import { describe, expect, it, vi } from 'vitest';
import { createDoc, type EditDoc, type LayerId } from '../../src/core/doc';
import { lutById } from '../../src/presets/luts';
import { appliedLook, applyPresetToDoc, LOOKS } from '../../src/presets/recipes';
import { lookMessage } from '../../src/ui/looks';
import { pathById, PATHS } from '../../src/ui/paths';

vi.stubGlobal('matchMedia', () => ({ matches: true }));

const wearing = (index: number): EditDoc => {
  const doc = createDoc(100, 100);
  const look = LOOKS[index];
  for (const id of Object.keys(look.tools) as LayerId[]) doc.layers[id] = { enabled: true, painted: false, params: {} };
  applyPresetToDoc(doc, look);
  return doc;
};

describe('the paths', () => {
  it('offers Glow na Hora, Do Meu Jeito and Filtros, each with its own id', () => {
    expect(PATHS.map((p) => p.label)).toEqual(['Glow na Hora', 'Do Meu Jeito', 'Filtros']);
    expect(new Set(PATHS.map((p) => p.id)).size).toBe(PATHS.length);
  });

  it('only a path with its own menu leaves the tools out', () => {
    expect(pathById('glow')?.menu).toBeTypeOf('function');
    expect(pathById('manual')?.menu).toBeUndefined();
    expect(pathById('other')).toBeUndefined();
    expect(pathById(null)).toBeUndefined();
  });
});

describe('the looks', () => {
  it('each one names a filter that exists', () => {
    for (const look of LOOKS) {
      expect(look.filter.id).not.toBeNull();
      expect(lutById(look.filter.id!)).toBeDefined();
    }
  });

  it('none paints a color of its own on the lips, since they go on any face', () => {
    for (const look of LOOKS) expect(look.tools.lips).toBeUndefined();
  });

  it('a document in one look reads as that look alone', () => {
    LOOKS.forEach((look, i) => expect(appliedLook(wearing(i))?.id).toBe(look.id));
  });

  it('a plain document wears no look', () => {
    expect(appliedLook(createDoc(100, 100))).toBeUndefined();
  });

  it('a look changed by hand no longer counts, in the settings or in a tool', () => {
    const adjusted = wearing(0);
    adjusted.adjust.contrast += 1;
    expect(appliedLook(adjusted)).toBeUndefined();

    const filtered = wearing(0);
    filtered.filter = { ...filtered.filter, intensity: 0.1 };
    expect(appliedLook(filtered)).toBeUndefined();

    const tool = wearing(0);
    tool.layers.smooth!.params.strength = 1;
    expect(appliedLook(tool)).toBeUndefined();
  });

  it('a tool lost to the undo means the look is gone', () => {
    const doc = wearing(0);
    delete doc.layers.smooth;
    expect(appliedLook(doc)).toBeUndefined();
  });
});

describe('what the person reads after a look', () => {
  const look = LOOKS[0];
  const all = Object.keys(look.tools);
  const ok = { filled: all, missed: [], failed: false, stopped: false };

  it('says nothing when it all landed', () => {
    expect(lookMessage(look, ok)).toBeNull();
  });

  it('says when another search took its place', () => {
    expect(lookMessage(look, { ...ok, filled: [], stopped: true })).toMatch(/não entrou/);
  });

  it('says the detector failed, and how to try again', () => {
    expect(lookMessage(look, { filled: [], missed: all, failed: true, stopped: false })).toMatch(/detector não carregou.*toque nele de novo/);
  });

  it('says no face was found when no tool of the look landed', () => {
    expect(lookMessage(look, { filled: [], missed: all, failed: false, stopped: false })).toMatch(/Não achei rosto/);
  });

  it('names what stayed out when the rest landed', () => {
    expect(lookMessage(look, { filled: ['smooth'], missed: ['whiten'], failed: false, stopped: false })).toBe('Look Natural na foto. Só ficou de fora: dentes.');
  });

  it('does not blame the face for a mask that already held work', () => {
    expect(lookMessage(look, { filled: [], missed: ['whiten'], failed: false, stopped: false })).toMatch(/Só ficou de fora: dentes/);
  });
});
