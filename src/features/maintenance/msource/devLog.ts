/**
 * Development-build diagnostics for the owner-document pipeline (Metro log, tag "[upload]").
 * Counts, sizes, timings and failure codes only — never document text, names or owner data.
 * Silent in release builds and in tests.
 */
export const uploadLog: (step: string, detail: Record<string, unknown>) => void =
  __DEV__ && process.env.NODE_ENV !== 'test'
    ? (step, detail) =>
        // eslint-disable-next-line no-console -- development-only diagnostics (Metro log)
        console.info(`[upload] ${step}`, JSON.stringify(detail))
    : () => undefined;

/** Development-build diagnostics of a discovery run (tag "[discovery]"): vehicle CLASS key only. */
export const discoveryLog: (step: string, detail: Record<string, unknown>) => void =
  __DEV__ && process.env.NODE_ENV !== 'test'
    ? (step, detail) =>
        // eslint-disable-next-line no-console -- development-only diagnostics (Metro log)
        console.info(`[discovery] ${step}`, JSON.stringify(detail))
    : () => undefined;
