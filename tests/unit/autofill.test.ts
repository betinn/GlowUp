import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createDoc, type EditDoc, type LayerId } from '../../src/core/doc';
import type { Engine } from '../../src/core/engine';
import type { FaceRegion } from '../../src/core/face/regions';
import { History } from '../../src/core/history/history';
import type { RetouchPreset } from '../../src/presets/recipes';
import { AUTO_ACTIONS, type AutoAction } from '../../src/tools/auto';
import { applyRecipe, switchable, toggleEffect } from '../../src/ui/actions';
import {
  applyToolFills,
  clearWork,
  dropToolLimit,
  forgetFreedTools,
  hasWork,
  limitTool,
  placeOf,
  prepareToolFills,
  setToolLimit,
  setToolMode,
  toolLimit,
} from '../../src/ui/facepick.svelte';
import AutoMode from '../../src/ui/panels/AutoMode.svelte';
import ModeSelector from '../../src/ui/panels/ModeSelector.svelte';
import { setEngine, ui } from '../../src/ui/state.svelte';

vi.stubGlobal('matchMedia', () => ({ matches: true }));
vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run));
vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));

/** What the detector finds on the photo of the test, and the regions it shows. */
const photo = vi.hoisted(() => ({
  faces: [{ box: { x: 0, y: 0, w: 1, h: 1 } }] as unknown[],
  regions: ['skin', 'cheeks', 'glow', 'sclera', 'undereye'] as string[],
  detectorFails: false,
}));

vi.mock('../../src/core/face/detector', () => ({
  loadDetector: () => (photo.detectorFails ? Promise.reject(new Error('offline')) : Promise.resolve()),
  FaceScan: class {
    finished = true;
    more = false;
    get list() {
      return photo.faces;
    }
    run = () => Promise.resolve();
  },
}));

vi.mock('../../src/core/face/regions', () => ({
  buildRegionMask: (_faces: unknown, region: string) => (photo.regions.includes(region) ? new Uint8Array([photo.regions.indexOf(region) + 1]) : null),
}));

vi.mock('../../src/tools/activate', () => ({
  ensureField: () => Promise.resolve(),
  ensureHeal: () => Promise.resolve(),
  ensureDocTools: () => Promise.resolve(),
  ensureLayerTool: (e: Engine, id: LayerId) => {
    e.doc.layers[id] ??= { enabled: true, painted: false, params: {} };
    return Promise.resolve({ brush: {} });
  },
}));

/** Just enough of the engine for the automatic mode, with the real history. */
function fakeEngine() {
  const history = new History();
  const doc: EditDoc = createDoc(4, 4);
  const filled: { id: LayerId; data: Uint8Array; label: string }[] = [];
  const e = {
    doc,
    history,
    source: { w: 4, h: 4 },
    masks: { w: 4, h: 4 },
    viewport: { w: 1, h: 1, top: 0, right: 0, bottom: 0, left: 0 },
    displaySize: { w: 4, h: 4 },
    view: { zoom: 1, x: 0, y: 0 },
    brushOff: false,
    holdStroke: null,
    pipeline: null,
    ctx: null,
    commit: vi.fn(),
    setTool: vi.fn(),
    setCropEditing: vi.fn(),
    setPaintLimit: vi.fn(),
    requestRender: vi.fn(),
    revealLimit: () => Promise.resolve(),
    stopReveal: vi.fn(),
    clearLayer: vi.fn(() => Promise.resolve()),
    healSpots: vi.fn(() => Promise.resolve(0)),
    applyPatch(label: string, patch: (d: EditDoc) => void) {
      const before = JSON.stringify(doc);
      patch(doc);
      const after = JSON.stringify(doc);
      history.push({
        label,
        bytes: 1,
        undo: () => void Object.assign(doc, JSON.parse(before)),
        redo: () => void Object.assign(doc, JSON.parse(after)),
      });
    },
    fillLayer: vi.fn((id: LayerId, data: Uint8Array, label: string) => {
      // As the engine: a tool that is not loaded has no mask to fill.
      const layer = doc.layers[id];
      if (!layer) return Promise.resolve();
      filled.push({ id, data, label });
      layer.painted = true;
      history.push({
        label,
        bytes: 1,
        undo: () => void (doc.layers[id]!.painted = false),
        redo: () => void (doc.layers[id]!.painted = true),
      });
      return Promise.resolve();
    }),
  };
  setEngine(e as unknown as Engine);
  return { e: e as unknown as Engine, spy: e, filled };
}

function fakeAction(over: Partial<AutoAction> = {}) {
  let work = false;
  return {
    words: { finding: 'Procurando o rosto', missing: 'Sem rosto aqui.', place: 'no rosto', hint: 'Sozinho.' },
    apply: vi.fn(() => {
      work = true;
      return Promise.resolve();
    }),
    hasWork: vi.fn(() => work),
    clear: vi.fn(() => {
      work = false;
      return Promise.resolve();
    }),
    ...over,
  } satisfies AutoAction;
}

/** Waits for what `limitTool` leaves running: the show and the fill. */
const settled = () => new Promise((done) => setTimeout(done, 30));

/** Tools open in Manual: the tool opens, the person picks Automático, and the test waits for it. */
async function openAuto(e: Engine, tool: string, region: FaceRegion | null): Promise<void> {
  await limitTool(e, tool, region);
  setToolMode(e, 'auto');
  await settled();
}

beforeEach(() => {
  dropToolLimit();
  forgetFreedTools();
  AUTO_ACTIONS.clear();
  ui.tool = null;
  photo.faces = [{ box: { x: 0, y: 0, w: 1, h: 1 } }];
  photo.regions = ['skin', 'cheeks', 'glow', 'sclera', 'undereye'];
  photo.detectorFails = false;
});

describe('a tool as it opens', () => {
  it('opens in Manual with the brush free, and looks for nothing', async () => {
    const { e, filled } = fakeEngine();
    const action = fakeAction({ faces: 'required' });
    AUTO_ACTIONS.set('liquify', action);
    await limitTool(e, 'liquify', null);
    await settled();
    expect(action.apply).not.toHaveBeenCalled();
    expect(toolLimit).toMatchObject({ tool: 'liquify', state: 'off', mode: 'manual' });
    await limitTool(e, 'smooth', 'skin');
    await settled();
    expect(toolLimit).toMatchObject({ tool: 'smooth', state: 'off', mode: 'manual' });
    expect(e.setPaintLimit).not.toHaveBeenCalled();
    expect(filled).toEqual([]);
  });

  it('keeps the brush on the region once the switch is on, and remembers it on this photo', async () => {
    const { e } = fakeEngine();
    await limitTool(e, 'smooth', 'skin');
    setToolLimit(e, true);
    await settled();
    expect(toolLimit).toMatchObject({ state: 'on', mode: 'manual' });
    await limitTool(e, 'undereye', 'undereye');
    await settled();
    expect(toolLimit.state).toBe('off');
    await limitTool(e, 'smooth', 'skin');
    await settled();
    expect(toolLimit.state).toBe('on');
  });
});

describe('a tool with an automatic action of its own', () => {
  it('runs at once when it asks for no search, and leaves the brush off', async () => {
    const { e } = fakeEngine();
    const action = fakeAction();
    AUTO_ACTIONS.set('adjust', action);
    await openAuto(e, 'adjust', null);
    expect(action.apply).toHaveBeenCalledTimes(1);
    expect(toolLimit).toMatchObject({ tool: 'adjust', region: null, state: 'on', mode: 'auto' });
    expect(e.brushOff).toBe(true);
    expect(e.setPaintLimit).toHaveBeenCalledWith(null);
  });

  it('gets the faces when it asks for them', async () => {
    const { e } = fakeEngine();
    const action = fakeAction({ faces: 'required' });
    AUTO_ACTIONS.set('liquify', action);
    await openAuto(e, 'liquify', null);
    expect(action.apply).toHaveBeenCalledWith(e, { faces: photo.faces, source: e.source });
  });

  it('goes to manual without a face when it requires one', async () => {
    const { e } = fakeEngine();
    photo.faces = [];
    const action = fakeAction({ faces: 'required' });
    AUTO_ACTIONS.set('liquify', action);
    await openAuto(e, 'liquify', null);
    expect(action.apply).not.toHaveBeenCalled();
    expect(toolLimit).toMatchObject({ state: 'no-face', mode: 'manual' });
    expect(e.brushOff).toBe(false);
  });

  it('runs without a face when faces are optional', async () => {
    const { e } = fakeEngine();
    photo.faces = [];
    const action = fakeAction({ faces: 'optional' });
    AUTO_ACTIONS.set('blur', action);
    await openAuto(e, 'blur', null);
    expect(action.apply).toHaveBeenCalledWith(e, { faces: [], source: e.source });
    expect(toolLimit.state).toBe('on');
  });

  it('can also keep a region of the catalog', async () => {
    const { e } = fakeEngine();
    const action = fakeAction();
    AUTO_ACTIONS.set('liquify', action);
    await openAuto(e, 'liquify', 'skin');
    expect(action.apply).toHaveBeenCalledTimes(1);
    expect(e.setPaintLimit).toHaveBeenCalledWith(new Uint8Array([1]));
  });

  it('answers for its own work, and a second tap turns it off and back on', async () => {
    const { e } = fakeEngine();
    const action = fakeAction();
    AUTO_ACTIONS.set('adjust', action);
    expect(switchable('adjust')).toBe(true);
    expect(hasWork(e, 'adjust')).toBe(false);
    await openAuto(e, 'adjust', null);
    expect(hasWork(e, 'adjust')).toBe(true);
    expect(placeOf('adjust')).toBe('no rosto');

    await toggleEffect('adjust');
    expect(action.clear).toHaveBeenCalledTimes(1);
    expect(hasWork(e, 'adjust')).toBe(false);

    await toggleEffect('adjust');
    await settled();
    expect(action.apply).toHaveBeenCalledTimes(2);
  });

  it('keeps what is on the photo and opens in manual when the tool already holds work', async () => {
    const { e } = fakeEngine();
    const action = fakeAction({ hasWork: vi.fn(() => true) });
    AUTO_ACTIONS.set('adjust', action);
    await limitTool(e, 'adjust', null);
    await settled();
    expect(action.apply).not.toHaveBeenCalled();
    expect(toolLimit.mode).toBe('manual');
  });

  it('runs again when the person asks for Automático, and manual gives the control back', async () => {
    const { e } = fakeEngine();
    const action = fakeAction();
    AUTO_ACTIONS.set('adjust', action);
    await openAuto(e, 'adjust', null);
    setToolMode(e, 'manual');
    expect(e.brushOff).toBe(false);
    setToolMode(e, 'auto');
    await settled();
    expect(action.apply).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the action fails', async () => {
    const { e } = fakeEngine();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    AUTO_ACTIONS.set('adjust', fakeAction({ apply: () => Promise.reject(new Error('no')) }));
    await openAuto(e, 'adjust', null);
    expect(ui.toast).toMatch(/Não consegui aplicar/);
    error.mockRestore();
  });
});

describe('the tools that keep working as before', () => {
  it('are switchable, and the rest are not', () => {
    expect(switchable('smooth')).toBe(true);
    expect(switchable('heal')).toBe(true);
    expect(switchable('adjust')).toBe(false);
    expect(switchable('liquify')).toBe(false);
  });

  it('take the effect off through their own kind', async () => {
    const { e, spy } = fakeEngine();
    await clearWork(e, 'heal');
    expect(spy.healSpots).toHaveBeenCalledWith([], 'Limpar');
    await clearWork(e, 'smooth');
    expect(spy.clearLayer).toHaveBeenCalledWith('smooth');
  });

  it('fill the mask of a mask tool with its own shape', async () => {
    const { e, spy, filled } = fakeEngine();
    e.doc.layers.blush = { enabled: true, painted: false, params: {} };
    await openAuto(e, 'blush', 'skin');
    expect(spy.setPaintLimit).toHaveBeenCalledWith(new Uint8Array([1]));
    expect(filled).toEqual([{ id: 'blush', data: new Uint8Array([2]), label: 'Automático' }]);
  });

  it('leave the brush free without the region', async () => {
    const { e, filled } = fakeEngine();
    photo.regions = [];
    e.doc.layers.smooth = { enabled: true, painted: false, params: {} };
    await openAuto(e, 'smooth', 'skin');
    expect(toolLimit).toMatchObject({ state: 'no-region', mode: 'manual' });
    expect(filled).toEqual([]);
  });
});

describe('filling tools from code', () => {
  it('finds without touching the photo, and says what is missing', async () => {
    const { e, filled } = fakeEngine();
    photo.regions = ['skin', 'glow'];
    const found = await prepareToolFills(e, ['smooth', 'highlight', 'whiten']);
    expect(filled).toEqual([]);
    expect([...found.fills.keys()]).toEqual(['smooth', 'highlight']);
    expect(found.missed).toEqual(['whiten']);
    expect(found).toMatchObject({ failed: false, stopped: false });
    expect(found.fills.get('highlight')).toEqual({ kind: 'mask', mask: new Uint8Array([2]) });
  });

  it('leaves out work in place, unless told to replace it', async () => {
    const { e } = fakeEngine();
    e.doc.layers.smooth = { enabled: true, painted: true, params: {} };
    expect((await prepareToolFills(e, ['smooth'])).fills.size).toBe(0);
    expect((await prepareToolFills(e, ['smooth'], { refill: true })).fills.size).toBe(1);
  });

  it('reports a detector that did not load', async () => {
    const { e } = fakeEngine();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    photo.detectorFails = true;
    const found = await prepareToolFills(e, ['smooth']);
    expect(found).toMatchObject({ failed: true, stopped: false, missed: ['smooth'] });
    error.mockRestore();
  });

  it('stops when another search takes over', async () => {
    const { e } = fakeEngine();
    const first = prepareToolFills(e, ['smooth']);
    const second = prepareToolFills(e, ['smooth']);
    expect((await first).stopped).toBe(true);
    expect((await second).stopped).toBe(false);
  });

  it('applies each tool, which then opens in Automático with what it has', async () => {
    const { e, filled } = fakeEngine();
    e.doc.layers.smooth = { enabled: true, painted: false, params: {} };
    await applyToolFills(e, (await prepareToolFills(e, ['smooth'])).fills, { fadeMs: 0 });
    expect(filled.map((f) => f.label)).toEqual(['Automático']);
    await limitTool(e, 'smooth', 'skin');
    await settled();
    expect(toolLimit.mode).toBe('auto');
    expect(filled).toHaveLength(1);
  });
});

describe('applying a recipe from code', () => {
  const RECIPE: RetouchPreset = {
    id: 'teste',
    name: 'Teste',
    note: '',
    adjust: { contrast: 12 },
    filter: { id: null, intensity: 1 },
    tools: { smooth: { strength: 70 }, undereye: { light: 50 }, whiten: { whiten: 40 } },
  };

  it('fills the masks of its tools as one undo step, and leaves out what the photo does not show', async () => {
    const { e, filled } = fakeEngine();
    const outcome = await applyRecipe(RECIPE, { fadeMs: 0 });
    expect(outcome).toEqual({ filled: ['smooth', 'undereye'], missed: ['whiten'], failed: false, stopped: false });
    expect(filled.map((f) => f.id)).toEqual(['smooth', 'undereye']);
    expect(e.doc.adjust.contrast).toBe(12);
    expect(e.doc.layers.smooth?.params.strength).toBe(70);
    expect(e.history.depth).toBe(1);
    expect(e.history.undoLabel).toBe('Look');

    await e.history.undo();
    expect(e.doc.adjust.contrast).toBe(0);
    expect(e.doc.layers.smooth?.painted).toBe(false);
    expect(e.history.canUndo).toBe(false);
    await e.history.redo();
    expect(e.doc.adjust.contrast).toBe(12);
    expect(e.doc.layers.smooth?.painted).toBe(true);
  });

  it('closes the open tool first', async () => {
    const { e, spy } = fakeEngine();
    await limitTool(e, 'smooth', 'skin');
    ui.tool = 'smooth';
    await applyRecipe(RECIPE, { fadeMs: 0 });
    expect(ui.tool).toBeNull();
    expect(toolLimit.tool).toBeNull();
    expect(spy.setTool).toHaveBeenCalledWith('none');
  });

  it('keeps a mask painted by hand', async () => {
    const { e, filled } = fakeEngine();
    e.doc.layers.smooth = { enabled: true, painted: true, params: {} };
    const outcome = await applyRecipe(RECIPE, { fadeMs: 0 });
    expect(outcome.filled).toEqual(['undereye']);
    expect(filled.map((f) => f.id)).toEqual(['undereye']);
  });

  it('applies the settings alone when the detector does not load', async () => {
    const { e, filled } = fakeEngine();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    photo.detectorFails = true;
    const outcome = await applyRecipe(RECIPE, { fadeMs: 0 });
    expect(outcome).toMatchObject({ filled: [], failed: true });
    expect(filled).toEqual([]);
    expect(e.doc.adjust.contrast).toBe(12);
    expect(e.history.depth).toBe(1);
    error.mockRestore();
  });

  it('applies nothing when another search took over', async () => {
    const { e } = fakeEngine();
    const running = applyRecipe(RECIPE, { fadeMs: 0 });
    await new Promise((done) => setTimeout(done));
    await limitTool(e, 'smooth', 'skin');
    expect((await running).stopped).toBe(true);
    expect(e.doc.adjust.contrast).toBe(0);
  });
});

describe('the selector, in any panel', () => {
  it('shows nothing while no tool is under the control', () => {
    fakeEngine();
    expect(render(ModeSelector).body).not.toContain('tool-mode');
    expect(render(AutoMode).body).not.toContain('data-limit');
  });

  it('needs no props and no region', async () => {
    const { e } = fakeEngine();
    AUTO_ACTIONS.set('adjust', fakeAction());
    await openAuto(e, 'adjust', null);
    for (const panel of [ModeSelector, AutoMode]) {
      const { body } = render(panel);
      expect(body).toContain('data-testid="tool-mode"');
      expect(body).toContain('data-mode="auto"');
      expect(body).toContain('Automático');
      expect(body).toContain('Manual');
    }
    expect(render(AutoMode).body).toContain('Aplicado no rosto');
  });

  it('offers the switch of the brush only to a tool with a region', async () => {
    const { e } = fakeEngine();
    AUTO_ACTIONS.set('adjust', fakeAction());
    await limitTool(e, 'adjust', null);
    await settled();
    setToolMode(e, 'manual');
    expect(render(AutoMode).body).not.toContain('limit-toggle');
    await limitTool(e, 'smooth', 'skin');
    await settled();
    setToolMode(e, 'manual');
    expect(render(AutoMode).body).toContain('limit-toggle');
  });

  it('says the words of the action when the search finds nothing', async () => {
    const { e } = fakeEngine();
    photo.faces = [];
    AUTO_ACTIONS.set('liquify', fakeAction({ faces: 'required' }));
    await openAuto(e, 'liquify', null);
    const { body } = render(AutoMode);
    expect(body).toContain('Sem rosto aqui.');
    expect(body).not.toContain('tool-mode');
    expect(body).not.toContain('O pincel está livre');
  });
});
