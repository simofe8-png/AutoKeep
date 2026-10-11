export type SaveOutcome = 'saved' | 'cancelled' | 'failed';

/** Where the user's backup file goes and comes from: always a place the user picks. */
export interface BackupFiles {
  /** A folder on the device can be chosen (Android Storage Access Framework). */
  canSaveToFolder: boolean;
  saveToFolder(text: string, fileName: string): Promise<SaveOutcome>;
  /** The system share sheet: Google Drive, Files, e-mail… as the user chooses. */
  share(text: string, fileName: string): Promise<SaveOutcome>;
  /** Lets the user pick a backup file; its text, or null when cancelled (throws if unreadable). */
  pick(): Promise<string | null>;
}

/** Test double: remembers what was saved and returns a prepared file on pick. */
export class MemoryBackupFiles implements BackupFiles {
  canSaveToFolder = true;
  readonly saved: { text: string; fileName: string; via: 'folder' | 'share' }[] = [];
  next: string | null = null;

  async saveToFolder(text: string, fileName: string): Promise<SaveOutcome> {
    this.saved.push({ text, fileName, via: 'folder' });
    return 'saved';
  }

  async share(text: string, fileName: string): Promise<SaveOutcome> {
    this.saved.push({ text, fileName, via: 'share' });
    return 'saved';
  }

  async pick(): Promise<string | null> {
    return this.next;
  }
}
