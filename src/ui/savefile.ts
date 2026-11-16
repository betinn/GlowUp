/**
 * Where an exported file goes. Where the browser can open its own save dialog (File System Access), the person
 * chooses the folder before the export starts, while the tap that asked for it still counts as theirs. Elsewhere
 * the file comes down as a download, and the browser puts it where its settings say.
 */

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface Writable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface FileTarget {
  kind: 'file';
  name: string;
  createWritable(): Promise<Writable>;
}

export interface FolderTarget {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, options: { create: boolean }): Promise<FileTarget>;
}

type Pickers = {
  showSaveFilePicker?: (options: { suggestedName: string; types: PickerType[]; id?: string; startIn?: string }) => Promise<FileTarget>;
  showDirectoryPicker?: (options: { id?: string; mode: 'readwrite'; startIn?: string }) => Promise<FolderTarget>;
};

const pickers = (): Pickers => (typeof window === 'undefined' ? {} : (window as unknown as Pickers));

/** The browser opens a dialog to choose where one file goes. */
export const canPickFile = () => typeof pickers().showSaveFilePicker === 'function';

/** The browser opens a dialog to choose a folder for several files. */
export const canPickFolder = () => typeof pickers().showDirectoryPicker === 'function';

/** The person closed the dialog: nothing to save, and nothing went wrong. */
export class Cancelled extends Error {}

/** For `.catch`: a closed dialog becomes `undefined`, so the caller stops there; anything else still throws. */
export function unlessCancelled(err: unknown): undefined {
  if (err instanceof Cancelled) return undefined;
  throw err;
}

const DESCRIPTIONS: Record<string, string> = { 'image/jpeg': 'Imagem JPG', 'image/png': 'Imagem PNG', 'image/webp': 'Imagem WebP', 'application/zip': 'Arquivo ZIP' };

function cancelled(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Asks where the file goes. `null` when this browser has no dialog for it, so the caller downloads instead.
 * Throws `Cancelled` when the person closes the dialog. Call it before any long wait, from the tap itself.
 */
export async function pickFile(name: string, type: string): Promise<FileTarget | null> {
  const show = pickers().showSaveFilePicker;
  if (!show) return null;
  const ext = name.slice(name.lastIndexOf('.'));
  try {
    return await show({ suggestedName: name, types: [{ description: DESCRIPTIONS[type] ?? type, accept: { [type]: [ext] } }], id: 'glowup-export', startIn: 'pictures' });
  } catch (err) {
    if (cancelled(err)) throw new Cancelled();
    // A dialog that would not open (blocked, or no gesture) is no reason to lose the file: it downloads instead.
    console.warn(err);
    return null;
  }
}

/** Asks for a folder, as `pickFile` does for one file. */
export async function pickFolder(): Promise<FolderTarget | null> {
  const show = pickers().showDirectoryPicker;
  if (!show) return null;
  try {
    return await show({ id: 'glowup-export', mode: 'readwrite', startIn: 'pictures' });
  } catch (err) {
    if (cancelled(err)) throw new Cancelled();
    console.warn(err);
    return null;
  }
}

async function write(target: FileTarget, file: Blob): Promise<void> {
  const out = await target.createWritable();
  await out.write(file);
  await out.close();
}

/** Writes the file where the person chose. False when it could not, so the caller downloads it instead. */
export async function writeFile(target: FileTarget, file: Blob): Promise<boolean> {
  try {
    await write(target, file);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/** Writes each file into the folder, by its own name. False when one could not be written. */
export async function writeFiles(folder: FolderTarget, files: readonly File[]): Promise<boolean> {
  try {
    for (const file of files) await write(await folder.getFileHandle(file.name, { create: true }), file);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/**
 * Downloads the file. The link is in the page while it is clicked, which Firefox needs, and its address lives
 * long enough for a slow phone to start reading it.
 */
export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
