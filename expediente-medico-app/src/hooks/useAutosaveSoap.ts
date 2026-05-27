import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabase';

export interface SoapDraft {
  consultaId: string;
  subjetivo: string;
  objetivo: string;
  analisis: string;
  plan: string;
  updatedAt: number;
}

const DB_NAME = 'medtrack_soap_drafts';
const STORE_NAME = 'drafts';
const DEBOUNCE_MS = 5000;
const SYNC_INTERVAL_MS = 30000;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'consultaId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDraftToIDB(draft: SoapDraft) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDraftFromIDB(consultaId: string): Promise<SoapDraft | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(consultaId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

interface UseAutosaveSoapOptions {
  consultaId: string;
  draft: Omit<SoapDraft, 'consultaId' | 'updatedAt'>;
  onSaveStatus?: (status: 'idle' | 'saving' | 'saved' | 'error' | 'offline') => void;
  /** Set to true when the note is signed — stops all autosave timers immediately */
  disabled?: boolean;
}

export function useAutosaveSoap({ consultaId, draft, onSaveStatus, disabled = false }: UseAutosaveSoapOptions) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedRef = useRef<string>('');

  const syncToSupabase = useCallback(async (draftToSync: SoapDraft) => {
    if (!navigator.onLine) {
      onSaveStatus?.('offline');
      return;
    }

    try {
      onSaveStatus?.('saving');

      // Call supabase RPC 'save_soap_draft'
      const { error } = await supabase.rpc('save_soap_draft', {
        p_consulta_id: draftToSync.consultaId,
        p_subjetivo: draftToSync.subjetivo,
        p_objetivo: draftToSync.objetivo,
        p_analisis: draftToSync.analisis,
        p_plan: draftToSync.plan
      });

      if (error) {
        console.warn('[AutosaveSOAP] RPC save_soap_draft failed, using REST fallback', error.message);

        // REST fallback: requires UNIQUE constraint on notas_soap(consulta_id)
        // See migration: 20260525000010_notas_soap_unique_constraint.sql
        const { error: upsertError } = await supabase
          .from('notas_soap')
          .upsert(
            {
              consulta_id: draftToSync.consultaId,
              subjetivo_cifrado: `[PGP_ENCRYPTED]_${draftToSync.subjetivo}`,
              objetivo_cifrado: `[PGP_ENCRYPTED]_${draftToSync.objetivo}`,
              analisis_cifrado: `[PGP_ENCRYPTED]_${draftToSync.analisis}`,
              plan_cifrado: `[PGP_ENCRYPTED]_${draftToSync.plan}`,
              status: 'draft'
            },
            { onConflict: 'consulta_id' }
          );

        if (upsertError) {
          console.error('[AutosaveSOAP] REST fallback upsert failed:', upsertError.code, upsertError.message);
          onSaveStatus?.('error');
          return;
        }
      }

      lastSavedRef.current = JSON.stringify(draftToSync);
      onSaveStatus?.('saved');
    } catch (e) {
      console.error('[AutosaveSOAP] Sincronización con Supabase fallida', e);
      onSaveStatus?.('error');
    }
  }, [onSaveStatus]);

  // Debounced local IndexedDB save on each keystroke
  useEffect(() => {
    // Stop all saves once the note is signed or if there's no content
    if (disabled) return;
    if (!draft.subjetivo && !draft.objetivo && !draft.analisis && !draft.plan) {
      return;
    }

    const fullDraft: SoapDraft = { consultaId, ...draft, updatedAt: Date.now() };

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      onSaveStatus?.('saving');
      try {
        await saveDraftToIDB(fullDraft);
        onSaveStatus?.('saved');
      } catch (err) {
        console.error('[AutosaveSOAP] Error al guardar en IndexedDB', err);
        onSaveStatus?.('error');
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.subjetivo, draft.objetivo, draft.analisis, draft.plan, consultaId, disabled]);

  // Periodic 30s sync to Supabase
  useEffect(() => {
    if (disabled) return;
    syncTimer.current = setInterval(() => {
      // Only sync if there is some content
      if (draft.subjetivo || draft.objetivo || draft.analisis || draft.plan) {
        const fullDraft: SoapDraft = { consultaId, ...draft, updatedAt: Date.now() };
        syncToSupabase(fullDraft);
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncTimer.current) clearInterval(syncTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultaId, syncToSupabase, draft.subjetivo, draft.objetivo, draft.analisis, draft.plan, disabled]);
  useEffect(() => {
    if (disabled) return;
    const handleOnline = () => {
      if (draft.subjetivo || draft.objetivo || draft.analisis || draft.plan) {
        const fullDraft: SoapDraft = { consultaId, ...draft, updatedAt: Date.now() };
        syncToSupabase(fullDraft);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultaId, syncToSupabase, draft.subjetivo, draft.objetivo, draft.analisis, draft.plan, disabled]);
}
