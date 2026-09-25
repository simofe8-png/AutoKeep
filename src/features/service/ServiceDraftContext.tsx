import { createContext, useContext, useState, type ReactNode } from 'react';

import type { ServiceDraft } from './draft';

interface ServiceDraftValue {
  draft: ServiceDraft | null;
  setDraft: (d: ServiceDraft | null) => void;
  update: (patch: Partial<ServiceDraft>) => void;
}

const Ctx = createContext<ServiceDraftValue | null>(null);

/** Holds the in-progress service draft across capture → review → confirm. */
export function ServiceDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  return (
    <Ctx.Provider
      value={{
        draft,
        setDraft,
        update: (patch) => setDraft((d) => (d ? { ...d, ...patch } : d)),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useServiceDraft(): ServiceDraftValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useServiceDraft must be used inside ServiceDraftProvider');
  return v;
}
