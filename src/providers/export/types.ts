/**
 * Document export port (T149): renders an HTML document to a file and hands it to the system share
 * sheet. The user chooses where it goes — AutoKeep uploads nothing.
 */
export interface DocumentExporter {
  shareHtml(html: string, title: string): Promise<boolean>;
}

/** Test double: records what would have been shared. */
export class MemoryExporter implements DocumentExporter {
  readonly shared: { html: string; title: string }[] = [];
  fail = false;
  async shareHtml(html: string, title: string) {
    if (this.fail) throw new Error('print failed');
    this.shared.push({ html, title });
    return true;
  }
}
