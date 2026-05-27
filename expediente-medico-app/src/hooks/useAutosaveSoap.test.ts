import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutosaveSoap } from './useAutosaveSoap';
import { supabase } from '../services/supabase';

// Mock supabase client
vi.mock('../services/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: 'mock-soap-uuid', error: null }),
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

// Robust mock for IndexedDB
const mockPut = vi.fn().mockImplementation((draft) => {
  return {
    onsuccess: null,
    onerror: null,
  };
});

const mockStore = {
  put: mockPut,
};

const mockTransaction = {
  objectStore: () => mockStore,
  oncomplete: null,
  onerror: null,
};

const mockDB = {
  objectStoreNames: {
    contains: () => true,
  },
  transaction: () => {
    const tx = { ...mockTransaction };
    // Simulate transaction lifecycle completion asynchronously
    setTimeout(() => {
      if (tx.oncomplete) tx.oncomplete();
    }, 0);
    return tx;
  },
  close: vi.fn(),
};

const mockOpenRequest = {
  onupgradeneeded: null,
  onsuccess: null,
  onerror: null,
  result: mockDB,
};

// Inject mock indexedDB into global window context for test environment stability
const originalIndexedDB = global.indexedDB;
const indexedDBMock = {
  open: () => {
    const req = { ...mockOpenRequest };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  },
};

describe('useAutosaveSoap Hook', () => {
  const mockConsultaId = 'consulta-uuid-999';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    global.indexedDB = indexedDBMock as any;
    
    // Default online state
    Object.defineProperty(navigator, 'onLine', { writable: true, configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    global.indexedDB = originalIndexedDB;
  });

  it('triggers IndexedDB local draft save debounced by 5 seconds on field edits', async () => {
    const initialDraft = { subjetivo: 'Dolor de garganta', objetivo: '', analisis: '', plan: '' };
    
    const onSaveStatus = vi.fn();
    const { rerender } = renderHook(
      ({ draft }) => useAutosaveSoap({ consultaId: mockConsultaId, draft, onSaveStatus }),
      { initialProps: { draft: initialDraft } }
    );

    // Initial state is idle
    expect(onSaveStatus).not.toHaveBeenCalled();

    // Fast-forward timers by 5 seconds to trigger debounce save
    await vi.advanceTimersByTimeAsync(5000);
    // Allow macro-tasks (IndexedDB transaction setTimeouts) to flush
    await vi.advanceTimersByTimeAsync(100);

    // Should indicate saving/saved status
    expect(onSaveStatus).toHaveBeenCalledWith('saving');
    expect(onSaveStatus).toHaveBeenCalledWith('saved');
  });

  it('triggers periodic Supabase sync every 30 seconds', async () => {
    const activeDraft = { subjetivo: 'Dolor de garganta', objetivo: 'Amígdalas rojas', analisis: 'Faringitis', plan: 'Reposo' };
    
    renderHook(() => useAutosaveSoap({ consultaId: mockConsultaId, draft: activeDraft }));

    // Advance 30 seconds
    await vi.advanceTimersByTimeAsync(30000);

    // Should call Supabase RPC save_soap_draft
    expect(supabase.rpc).toHaveBeenCalledWith('save_soap_draft', expect.objectContaining({
      p_consulta_id: mockConsultaId,
      p_subjetivo: 'Dolor de garganta',
      p_objetivo: 'Amígdalas rojas',
      p_analisis: 'Faringitis',
      p_plan: 'Reposo',
    }));
  });

  it('immediately syncs local IndexedDB draft to Supabase upon online window reconnect event', async () => {
    const activeDraft = { subjetivo: 'Paciente estable', objetivo: 'SV normales', analisis: 'Sano', plan: 'Egreso' };
    
    renderHook(() => useAutosaveSoap({ consultaId: mockConsultaId, draft: activeDraft }));

    // Clear initial ticks
    vi.clearAllMocks();

    // Fire online window event
    window.dispatchEvent(new Event('online'));

    // Should immediately sync draft to Supabase
    expect(supabase.rpc).toHaveBeenCalledWith('save_soap_draft', expect.objectContaining({
      p_consulta_id: mockConsultaId,
      p_subjetivo: 'Paciente estable',
    }));
  });
});
