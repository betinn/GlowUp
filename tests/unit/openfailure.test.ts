import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProject, InvalidProjectError } from '../../src/core/project';
import { reportOpenFailure } from '../../src/ui/open';
import { ui } from '../../src/ui/state.svelte';

vi.mock('../../src/core/project', async (original) => ({
  ...(await original<typeof import('../../src/core/project')>()),
  deleteProject: vi.fn(() => Promise.resolve()),
}));

const deleting = vi.mocked(deleteProject);

describe('a project that does not open', () => {
  beforeEach(() => {
    deleting.mockClear();
    ui.toast = null;
  });

  it('is deleted when the project itself is invalid, and the person is told', async () => {
    await reportOpenFailure(new InvalidProjectError('version'), 'p-1');
    expect(deleting).toHaveBeenCalledWith('p-1');
    expect(ui.toast).toMatch(/danificado.*Tirei ele da lista/);
  });

  it.each([
    ['a failed read of the store', new DOMException('read', 'UnknownError')],
    ['a chunk that did not load', new TypeError('Failed to fetch dynamically imported module')],
    ['a photo that did not decode', new DOMException('decode', 'InvalidStateError')],
    ['a photo too large for this device', new Error('image-too-large')],
    ['something nobody expected', 'surprise'],
  ])('stays after %s, and the person is told', async (_name, err) => {
    await reportOpenFailure(err, 'p-1');
    expect(deleting).not.toHaveBeenCalled();
    expect(ui.toast).toMatch(/continua salvo/);
  });

  it('says less when the delete itself fails, without throwing', async () => {
    deleting.mockRejectedValueOnce(new DOMException('write', 'UnknownError'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    await reportOpenFailure(new InvalidProjectError('version'), 'p-1');
    expect(ui.toast).toMatch(/danificado/);
    expect(ui.toast).not.toMatch(/Tirei/);
  });

  it('never deletes for a photo opened from a file', async () => {
    await reportOpenFailure(new InvalidProjectError('version'), undefined);
    await reportOpenFailure(new Error('image-too-large'), undefined);
    expect(deleting).not.toHaveBeenCalled();
    expect(ui.toast).toMatch(/grande demais/);
  });
});
