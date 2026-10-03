import { redact } from '@/security/redact';

/**
 * Structured M-SOURCE events (Phase 23). Fixed fields only: never credentials, headers,
 * document contents or a VIN; free text passes the project redaction.
 */
export interface MSourceEvent {
  runId: string;
  /** Opaque vehicle reference (local id), never plate or VIN. */
  vehicleRef?: string;
  stage: string;
  adapter?: string;
  sourceId?: string;
  status: string;
  durationMs?: number;
  failureCode?: string;
  detail?: string;
}

export type MSourceLogger = (e: MSourceEvent) => void;

export function safeEvent(e: MSourceEvent): MSourceEvent {
  return e.detail ? { ...e, detail: redact(e.detail).slice(0, 200) } : e;
}
