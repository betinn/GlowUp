import { describe, expect, it, vi } from 'vitest';
import { createDoc, type EditDoc, type LayerId } from '../../src/core/doc';
import { lutById } from '../../src/presets/luts';
import { isLookLight, lightById } from '../../src/core/light/lights';
import { appliedLook, applyPresetToDoc, LOOKS, readsScene } from '../../src/presets/recipes';
import { lookMessage } from '../../src/ui/looks';
import { GROUPS } from '../../src/tools/catalog';
import { pathById, pathOfGroup, PATHS } from '../../src/ui/paths';

vi.stubGlobal('matchMedia', () => ({ matches: true }));

const wearing = (index: number): EditDoc => {
  const doc = createDoc(100, 100);
  const look = LOOKS[index];
  for (const id of Object.keys(look.tools) as LayerId[]) doc.layers[id] = { enabled: true, painted: false, params: {} };
  applyPresetToDoc(doc, look);
  return doc;
};

describe('the paths', () => {
  it('offers Glow na Hora, Do Meu Jeito, Filtros, Foto and Brincar as tabs, each with its own id', () => {
    expect(PATHS.map((p) => p.label)).toEqual(['Glow na Hora', 'Do Meu Jeito', 'Filtros', 'Foto', 'Brincar']);
    expect(new Set(PATHS.map((p) => p.id)).size).toBe(PATHS.length);
  });

  it('a tab shows a menu of its own or the tools of its groups, never both', () => {
    expect(pathById('glow')?.menu).toBeTypeOf('function');
    expect(pathById('manual')?.menu).toBeUndefined();
    expect(pathById('fun')?.menu).toBeTypeOf('function');
    expect(pathById('other')).toBeUndefined();
    expect(pathById(null)).toBeUndefined();
    for (const path of PATHS) expect(!!path.menu).not.toBe(!!path.groups?.length);
  });

  it('every menu of tools is on one tab, and Filtros is a tab of its own', () => {
    const shown = PATHS.flatMap((p) => p.groups ?? []);
    expect(new Set(shown).size).toBe(shown.length);
    expect([...shown].sort()).toEqual(GROUPS.map((g) => g.id).filter((id) => id !== 'filters').sort());
    for (const group of shown) expect(pathOfGroup(group)?.groups).toContain(group);
    expect(pathOfGroup('filters')).toBeUndefined();
    // The names of the tabs are short enough to sit five across a narrow phone, on one line each.
    expect(PATHS.reduce((sum, path) => sum + path.label.length, 0)).toBeLessThanOrEqual(42);
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

  it('has the five looks of before and the five new ones, in this order', () => {
    expect(LOOKS.map((l) => l.name)).toEqual(['Natural', 'Glow', 'Editorial', 'Domingo', 'Retrato P&B', 'Retrato', 'Luz de Janela', 'Luz de Vela', 'Fim de Tarde', 'Olhar']);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
  });

  it('a look with a light names a light of the looks, which no menu shows', () => {
    const lit = LOOKS.filter(readsScene);
    expect(lit.map((l) => l.id)).toEqual(['retrato', 'luz-de-janela', 'luz-de-vela', 'fim-de-tarde']);
    for (const look of lit) {
      expect(lightById(look.light!.id)).toBeDefined();
      expect(isLookLight(look.light!.id)).toBe(true);
      expect(look.light!.intensity).toBeGreaterThan(0);
      expect(look.light!.intensity).toBeLessThanOrEqual(1);
    }
    // The looks of before read no scene: they download what they always did.
    for (const id of ['natural', 'glow', 'editorial', 'domingo', 'preto-e-branco', 'olhar']) expect(readsScene(LOOKS.find((l) => l.id === id)!)).toBe(false);
  });

  it('the light of a look goes on with it, and its strength is the person\'s to change', () => {
    const index = LOOKS.findIndex((l) => l.id === 'retrato');
    const doc = wearing(index);
    expect(doc.light).toEqual({ id: 'look-retrato', intensity: 1 });
    doc.light!.intensity = 0.4;
    expect(appliedLook(doc)?.id).toBe('retrato');
    // Without its light the look is not whole, so a tap puts it on again.
    delete doc.light;
    expect(appliedLook(doc)).toBeUndefined();
  });

  it('a look with no light takes the light of the look before away, and leaves a light of Luzes', () => {
    const doc = wearing(LOOKS.findIndex((l) => l.id === 'luz-de-vela'));
    expect(doc.light?.id).toBe('look-vela');
    for (const id of Object.keys(LOOKS[0].tools) as LayerId[]) doc.layers[id] ??= { enabled: true, painted: false, params: {} };
    applyPresetToDoc(doc, LOOKS[0]);
    expect(doc.light).toBeUndefined();

    doc.light = { id: 'neon', intensity: 0.7 };
    applyPresetToDoc(doc, LOOKS[0]);
    expect(doc.light).toEqual({ id: 'neon', intensity: 0.7 });
    expect(appliedLook(doc)?.id).toBe(LOOKS[0].id);
    // A look with a light of its own takes the place of the light of Luzes.
    applyPresetToDoc(doc, LOOKS.find((l) => l.id === 'retrato')!);
    expect(doc.light?.id).toBe('look-retrato');
  });

  it('on a photo with no scene to light, the look goes on without its light', () => {
    const doc = createDoc(100, 100);
    const look = LOOKS.find((l) => l.id === 'retrato')!;
    for (const id of Object.keys(look.tools) as LayerId[]) doc.layers[id] = { enabled: true, painted: false, params: {} };
    applyPresetToDoc(doc, look, false);
    expect(doc.light).toBeUndefined();
    expect(appliedLook(doc)).toBeUndefined();
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
  const ok = { filled: all, missed: [], failed: false, unlit: false, stopped: false };

  it('says nothing when it all landed', () => {
    expect(lookMessage(look, ok)).toBeNull();
  });

  it('says when another search took its place', () => {
    expect(lookMessage(look, { ...ok, filled: [], stopped: true })).toMatch(/não entrou/);
  });

  it('says the detector failed, and how to try again', () => {
    expect(lookMessage(look, { ...ok, filled: [], missed: all, failed: true })).toMatch(/detector não carregou.*toque nele de novo/);
  });

  it('says no face was found when no tool of the look landed', () => {
    expect(lookMessage(look, { ...ok, filled: [], missed: all })).toMatch(/Não achei rosto/);
  });

  it('names what stayed out when the rest landed', () => {
    expect(lookMessage(look, { ...ok, filled: ['smooth'], missed: ['whiten'] })).toBe('Look Natural na foto. Só ficou de fora: dentes.');
  });

  it('says the look went on without its light when the reader of depth did not load', () => {
    expect(lookMessage(look, { ...ok, unlit: true })).toMatch(/leitor de profundidade não carregou.*sem a luz.*toque nele de novo/);
  });

  it('does not blame the face for a mask that already held work', () => {
    expect(lookMessage(look, { ...ok, filled: [], missed: ['whiten'] })).toMatch(/Só ficou de fora: dentes/);
  });
});
