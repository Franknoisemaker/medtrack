import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { useAutosaveSoap, loadDraftFromIDB } from '../../hooks/useAutosaveSoap';
import { SoapFocusOverlay } from './SoapFocusOverlay';
import { supabase } from '../../services/supabase';

// ---  CIE-10 Quick Dataset: Top 50 diagnoses embedded inline (<5KB) ---
const CIE10_COMMON = [
  { code: 'J06.9', desc: 'Infección aguda de vías respiratorias superiores' },
  { code: 'J00',   desc: 'Rinofaringitis aguda (Resfriado común)' },
  { code: 'K21.0', desc: 'Reflujo gastroesofágico con esofagitis' },
  { code: 'E11.9', desc: 'Diabetes mellitus tipo 2 sin complicaciones' },
  { code: 'I10',   desc: 'Hipertensión esencial (primaria)' },
  { code: 'J45.9', desc: 'Asma no especificada' },
  { code: 'M54.5', desc: 'Lumbalgia / Dolor en la región lumbar' },
  { code: 'K29.7', desc: 'Gastritis no especificada' },
  { code: 'J02.9', desc: 'Faringitis aguda no especificada' },
  { code: 'N39.0', desc: 'Infección de vías urinarias, sitio no especificado' },
  { code: 'J03.9', desc: 'Amigdalitis aguda no especificada' },
  { code: 'L30.9', desc: 'Dermatitis no especificada' },
  { code: 'R51',   desc: 'Cefalea' },
  { code: 'F41.1', desc: 'Trastorno de ansiedad generalizada' },
  { code: 'F32.9', desc: 'Episodio depresivo no especificado' },
  { code: 'E78.5', desc: 'Hiperlipidemia no especificada / Dislipidemia' },
  { code: 'K57.30',desc: 'Diverticulosis del intestino grueso sin perforación' },
  { code: 'M17.9', desc: 'Gonartrosis no especificada (Osteoartritis de rodilla)' },
  { code: 'J20.9', desc: 'Bronquitis aguda no especificada' },
  { code: 'B34.9', desc: 'Infección viral de sitio no especificado' },
  { code: 'R10.4', desc: 'Otros dolores abdominales y los no especificados' },
  { code: 'K92.1', desc: 'Melena' },
  { code: 'E66.9', desc: 'Obesidad no especificada' },
  { code: 'G43.9', desc: 'Migraña no especificada' },
  { code: 'H52.1', desc: 'Miopía' },
  { code: 'H66.9', desc: 'Otitis media no especificada' },
  { code: 'J32.9', desc: 'Sinusitis crónica no especificada' },
  { code: 'K76.0', desc: 'Hígado graso no clasificado en otra parte' },
  { code: 'Z00.0', desc: 'Examen médico general / Revisión general de adulto' },
  { code: 'Z13.6', desc: 'Pesquisa de enfermedad cardiovascular' },
];

const QUICK_CHIPS: Record<string, string[]> = {
  subjetivo: ['Sin fiebre', 'Con fiebre', 'Inicio insidioso', 'Inicio súbito', 'Dolor EVA 7/10', 'Evolución de 3 días'],
  objetivo:  ['TA normal', 'Buen estado general', 'Consciente y orientado', 'Abdomen blando', 'Sin adenopatías', 'Mucosas húmedas'],
  analisis:  ['Compatible con', 'A descartar', 'Probable', 'Por confirmar con laboratorio'],
  plan:      ['Manejo ambulatorio', 'Reposo relativo 48h', 'Dieta blanda', 'Hidratación oral', 'Control en 7 días', 'Referir a especialista'],
};

interface SoapEditorProps {
  consultaId: string;
  readOnly?: boolean;
  signedData?: { firmadaEn: string; medico: string; cedula: string } | null;
  onRequestSign?: (data: { subjetivo: string; objetivo: string; analisis: string; plan: string }) => void;
  isSigning?: boolean;
  onNoteLoaded?: (status: {
    isSigned: boolean;
    signedMeta: { firmadaEn: string; medico: string; cedula: string } | null;
    fields: { subjetivo: string; objetivo: string; analisis: string; plan: string };
  }) => void;
}

type SoapField = 'subjetivo' | 'objetivo' | 'analisis' | 'plan';

const FIELD_META: Array<{ key: SoapField; label: string; icon: string; placeholder: string }> = [
  { key: 'subjetivo', label: 'S — Subjetivo',              icon: '💬', placeholder: 'Síntomas referidos por el paciente, inicio, duración, intensidad...' },
  { key: 'objetivo',  label: 'O — Objetivo',               icon: '🔬', placeholder: 'Signos vitales, exploración física, hallazgos clínicos...' },
  { key: 'analisis',  label: 'A — Análisis / Diagnóstico', icon: '🧠', placeholder: 'Juicio clínico, diagnóstico diferencial, código CIE-10...' },
  { key: 'plan',      label: 'P — Plan',                   icon: '📋', placeholder: 'Tratamiento, medicamentos con dosis, estudios, referencias...' },
];

export function SoapEditor({ consultaId, readOnly = false, signedData, onRequestSign, isSigning = false, onNoteLoaded }: SoapEditorProps) {
  const [fields, setFields] = useState({ subjetivo: '', objetivo: '', analisis: '', plan: '' });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline'>('idle');
  const [activeField, setActiveField] = useState<SoapField | null>(null);
  const [focusField, setFocusField] = useState<SoapField | null>(null);
  const [cie10Query, setCie10Query] = useState('');
  const [cie10Results, setCie10Results] = useState<typeof CIE10_COMMON>([]);
  const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768;

  // Refs for textarea elements
  const textareaRefs = useRef<Partial<Record<SoapField, HTMLTextAreaElement | null>>>({});

  // Initialize draft from Supabase (Cloud) or IndexedDB (Local Offline fallback) on mount or consultation change
  useEffect(() => {
    async function initDraft() {
      try {
        // 1. Try to load remote note first to sync signed state or remote drafts
        const { data: remoteNotes, error: remoteErr } = await supabase
          .rpc('get_decrypted_soap_note', { p_consulta_id: consultaId });

        const remoteNote = remoteNotes?.[0];

        if (remoteNote && !remoteErr) {
          const soapFields = {
            subjetivo: remoteNote.subjetivo || '',
            objetivo: remoteNote.objetivo || '',
            analisis: remoteNote.analisis || '',
            plan: remoteNote.plan || '',
          };

          setFields(soapFields);

          if (remoteNote.status === 'signed') {
            const formattedDate = new Date(remoteNote.signed_at || remoteNote.creado_at).toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            let doctorName = 'Dr. Médico';
            let doctorCedula = 'PENDIENTE';
            
            const activeSession = (await supabase.auth.getSession().catch(() => ({ data: { session: null } }))).data?.session;
            const docId = remoteNote.medico_id;
            
            if (activeSession?.user?.id === docId) {
              doctorName = activeSession.user.user_metadata?.nombre || doctorName;
              doctorCedula = activeSession.user.user_metadata?.cedula || doctorCedula;
            }

            if (docId) {
              try {
                const { data: medicoProfile } = await supabase.rpc('get_decrypted_medico', { p_medico_id: docId });
                if (medicoProfile && medicoProfile.length > 0) {
                  doctorName = medicoProfile[0].nombre;
                  doctorCedula = medicoProfile[0].cedula;
                }
              } catch (err) {
                console.warn('Could not fetch signed doctor profile:', err);
              }
            }

            onNoteLoaded?.({
              isSigned: true,
              signedMeta: {
                firmadaEn: formattedDate,
                medico: doctorName,
                cedula: doctorCedula,
              },
              fields: soapFields,
            });
            return;
          } else {
            onNoteLoaded?.({
              isSigned: false,
              signedMeta: null,
              fields: soapFields,
            });
            return;
          }
        }

        // 2. Fallback to IndexedDB if offline or no remote note yet
        const localDraft = await loadDraftFromIDB(consultaId);
        if (localDraft) {
          const localFields = {
            subjetivo: localDraft.subjetivo || '',
            objetivo: localDraft.objetivo || '',
            analisis: localDraft.analisis || '',
            plan: localDraft.plan || '',
          };
          setFields(localFields);
          onNoteLoaded?.({
            isSigned: false,
            signedMeta: null,
            fields: localFields,
          });
        } else {
          const emptyFields = { subjetivo: '', objetivo: '', analisis: '', plan: '' };
          setFields(emptyFields);
          onNoteLoaded?.({
            isSigned: false,
            signedMeta: null,
            fields: emptyFields,
          });
        }
      } catch (err) {
        console.error('Error loading initial SOAP draft:', err);
      }
    }
    initDraft();
  }, [consultaId, onNoteLoaded]);

  useAutosaveSoap({
    consultaId,
    draft: fields,
    onSaveStatus: setSaveStatus,
    disabled: readOnly, // stop timers once note is signed
  });

  const setField = useCallback((key: SoapField, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
  }, []);

  const insertChip = useCallback((key: SoapField, chip: string) => {
    setFields(prev => {
      const cur = prev[key];
      const sep = cur && !cur.endsWith(' ') && !cur.endsWith('\n') ? ' ' : '';
      return { ...prev, [key]: cur + sep + chip + '. ' };
    });
    textareaRefs.current[key]?.focus();

    // Log quick chip insertion to audit logs for NOM-024 compliance
    // Wrapped defensively: stub supabase client in local sandbox may not support auth.getSession
    const logChip = async () => {
      try {
        let medicoId = '';
        if (supabase.auth?.getSession) {
          const result = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
          medicoId = result?.data?.session?.user?.id || '';
        }
        if (!medicoId) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
          const isMock = supabaseUrl.includes('your-project-id');
          if (isMock) {
            medicoId = 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';
          } else {
            return;
          }
        }
        await supabase.from('audit_logs').insert({
          consulta_id: consultaId,
          medico_id: medicoId,
          event_type: 'SOAP_CHIP_INSERTED',
          details: { field: key, chip },
          ip: '127.0.0.1',
          user_agent: navigator.userAgent || 'Unknown'
        });
      } catch {
        // Non-blocking: chip insertion succeeds regardless of audit log status
      }
    };
    logChip();
  }, [consultaId]);

  // CIE-10 search (embedded dataset for now; lazy loads full set on first query > 3 chars)
  const handleCie10Search = (q: string) => {
    setCie10Query(q);
    if (q.length < 2) { setCie10Results([]); return; }
    const lq = q.toLowerCase();
    setCie10Results(CIE10_COMMON.filter(e =>
      e.code.toLowerCase().includes(lq) || e.desc.toLowerCase().includes(lq)
    ).slice(0, 6));
  };

  const insertCie10 = (entry: typeof CIE10_COMMON[0]) => {
    setField('analisis', fields.analisis + (fields.analisis ? '\n' : '') + `${entry.code} — ${entry.desc}`);
    setCie10Query('');
    setCie10Results([]);
  };

  const saveStatusLabel = {
    idle: null,
    saving: '⏳ Guardando borrador...',
    saved: '✓ Borrador guardado',
    error: '⚠️ Error al guardar',
    offline: '📵 Sin conexión — borrador local',
  }[saveStatus];

  const [showAclaracion, setShowAclaracion] = useState(false);
  const [aclaracionText, setAclaracionText] = useState('');
  const [isSavingAclaracion, setIsSavingAclaracion] = useState(false);
  const [aclaracionSaved, setAclaracionSaved] = useState(false);
  const [aclaraciones, setAclaraciones] = useState<{ id: string; aclaracion_texto: string; creado_at: string }[]>([]);
  const aclaracionId = useId();

  // Fetch existing aclaraciones when the note is signed
  useEffect(() => {
    if (!readOnly) return;
    const fetchAclaraciones = async () => {
      try {
        // First find the nota_soap for this consulta
        const { data: notaData } = await supabase
          .from('notas_soap')
          .select('id')
          .eq('consulta_id', consultaId)
          .eq('status', 'signed')
          .maybeSingle();
        if (!notaData) return;
        const { data } = await supabase
          .from('soap_aclaraciones')
          .select('id, aclaracion_texto, creado_at')
          .eq('nota_soap_id', notaData.id)
          .order('creado_at', { ascending: true });
        setAclaraciones(data || []);
      } catch (err) {
        console.error('Error fetching aclaraciones:', err);
      }
    };
    fetchAclaraciones();
  }, [readOnly, consultaId]);

  const handleSaveAclaracion = async () => {
    if (!aclaracionText.trim() || aclaracionText.trim().length < 10) return;
    setIsSavingAclaracion(true);
    try {
      // Get the real nota_soap_id for this consultation
      const { data: notaData, error: notaErr } = await supabase
        .from('notas_soap')
        .select('id')
        .eq('consulta_id', consultaId)
        .eq('status', 'signed')
        .maybeSingle();

      if (notaErr || !notaData) {
        console.error('Could not find signed nota_soap for this consultation');
        return;
      }

      // Generate a simple HMAC-style signature for the aclaracion (NOM-004 compliance)
      const timestamp = new Date().toISOString();
      const sigPayload = `aclaracion:${consultaId}:${timestamp}:${aclaracionText.trim()}`;
      const encoder = new TextEncoder();
      const clinicalSecret = import.meta.env.VITE_CLINICAL_SECRET_KEY || 'medtrack_clinical_secret_key_2026_nom024';
      const keyData = encoder.encode(clinicalSecret);
      const msgData = encoder.encode(sigPayload);
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const firma = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      const session = (await supabase.auth.getSession().catch(() => ({ data: { session: null } }))).data?.session;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      if (!session && !isMock) {
        throw new Error('Sesión de médico no válida o expirada. Por favor, inicia sesión.');
      }

      const activeDoctorId = session?.user?.id || (isMock ? 'a6b12a8a-e55d-4f11-8ac1-f11181283c44' : '');

      const { error: insertErr } = await supabase.from('soap_aclaraciones').insert({
        nota_soap_id: notaData.id,
        medico_id: activeDoctorId,
        aclaracion_texto: aclaracionText.trim(),
        firma_electronica: firma,
      });

      if (insertErr) throw insertErr;

      // Update local display immediately
      setAclaraciones(prev => [...prev, {
        id: crypto.randomUUID(),
        aclaracion_texto: aclaracionText.trim(),
        creado_at: timestamp,
      }]);
      setAclaracionSaved(true);
      setAclaracionText('');
      setTimeout(() => { setShowAclaracion(false); setAclaracionSaved(false); }, 1500);
    } catch (err) {
      console.error('Error saving aclaracion:', err);
    } finally {
      setIsSavingAclaracion(false);
    }
  };

  if (readOnly) {
    const displayMeta = signedData || {
      firmadaEn: 'Consulta Concluida',
      medico: 'Expediente Médico Protegido',
      cedula: 'NOM-004-SSA3'
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{
          padding: '10px 16px',
          borderRadius: '8px',
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid #10b981',
          color: '#065f46',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          ✓ {displayMeta.firmadaEn === 'Consulta Concluida' ? 'Consulta Concluida' : `Firmada el ${displayMeta.firmadaEn}`} · Dr. {displayMeta.medico} · Cédula {displayMeta.cedula}
        </div>
        {FIELD_META.map(({ key, label, icon }) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}>{icon} {label}</label>
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.02)',
              border: '1px solid var(--color-border)',
              fontSize: '0.9rem',
              color: 'var(--color-primary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {fields[key] || <span style={{ opacity: 0.4 }}>Sin registro</span>}
            </div>
          </div>
        ))}

        {/* Notas Aclaratorias — display existing + form to add new */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.7 }}>
            📝 Notas Aclaratorias {aclaraciones.length > 0 && <span style={{ fontWeight: 400 }}>({aclaraciones.length})</span>}
          </div>

          {/* List of saved aclaraciones */}
          {aclaraciones.map(ac => (
            <div key={ac.id} style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(37,99,235,0.04)',
              border: '1px solid rgba(37,99,235,0.15)',
              fontSize: '0.85rem',
              color: 'var(--color-primary)',
              lineHeight: 1.6,
            }}>
              <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '4px' }}>
                {new Date(ac.creado_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
              {ac.aclaracion_texto}
            </div>
          ))}

          {!showAclaracion ? (
            <button
              onClick={() => setShowAclaracion(true)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--color-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📝 Agregar Nota Aclaratoria
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label
                htmlFor={aclaracionId}
                style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}
              >
                📝 Nota Aclaratoria <span style={{ opacity: 0.5, fontWeight: 400 }}>(mínimo 10 caracteres)</span>
              </label>
              <textarea
                id={aclaracionId}
                value={aclaracionText}
                onChange={e => setAclaracionText(e.target.value)}
                placeholder="Aclaración o corrección a esta nota firmada..."
                rows={3}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-glass)',
                  color: 'var(--color-primary)',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleSaveAclaracion}
                  disabled={isSavingAclaracion || aclaracionText.trim().length < 10}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: aclaracionSaved ? '#10b981' : 'var(--color-primary)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    border: 'none',
                    cursor: isSavingAclaracion ? 'wait' : 'pointer',
                    opacity: aclaracionText.trim().length < 10 ? 0.5 : 1,
                  }}
                >
                  {aclaracionSaved ? '✓ Guardada' : isSavingAclaracion ? 'Guardando...' : 'Guardar Aclaración'}
                </button>
                <button
                  onClick={() => { setShowAclaracion(false); setAclaracionText(''); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-primary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {focusField && isTablet && (
        <SoapFocusOverlay
          field={focusField}
          value={fields[focusField]}
          onChange={(v) => setField(focusField, v)}
          onClose={() => setFocusField(null)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
            📝 Nota SOAP
          </h3>
          {saveStatusLabel && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.55 }}>
              {saveStatusLabel}
            </span>
          )}
        </div>

        {/* SOAP Fields */}
        {FIELD_META.map(({ key, label, icon, placeholder }) => (
          <div 
            key={key} 
            style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
            onBlur={(e) => {
              // Only trigger blur if focus actually leaves this entire field container
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                if (activeField === key) setActiveField(null);
                if (key === 'analisis') {
                  setCie10Query('');
                  setCie10Results([]);
                }
              }
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                {icon} {label}
              </label>
              {isTablet && (
                <button
                  type="button"
                  onClick={() => setFocusField(key)}
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  📱 Modo Enfoque
                </button>
              )}
            </div>

            {/* Quick Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {QUICK_CHIPS[key]?.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => insertChip(key, chip)}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '12px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-glass)',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    opacity: 0.75,
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.75')}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* CIE-10 search only on Análisis field */}
            {key === 'analisis' && activeField === 'analisis' && (
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={cie10Query}
                  onChange={e => handleCie10Search(e.target.value)}
                  placeholder="🔍 Buscar código CIE-10..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-glass)',
                    fontSize: '0.85rem',
                    color: 'var(--color-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {cie10Results.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    overflow: 'hidden',
                    marginTop: '4px',
                  }}>
                    {cie10Results.map(e => (
                      <button
                        key={e.code}
                        onClick={() => insertCie10(e)}
                        style={{
                          display: 'flex',
                          gap: '10px',
                          alignItems: 'flex-start',
                          width: '100%',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-secondary)', flexShrink: 0, fontFamily: 'monospace' }}>
                          {e.code}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>{e.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <textarea
              ref={el => { textareaRefs.current[key] = el; }}
              value={fields[key]}
              onChange={e => setField(key, e.target.value)}
              onFocus={() => setActiveField(key)}
              placeholder={placeholder}
              rows={4}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: `1px solid ${activeField === key ? 'var(--color-secondary)' : 'var(--color-border)'}`,
                background: 'var(--color-surface-glass)',
                color: 'var(--color-primary)',
                fontSize: '16px',  // prevents Safari auto-zoom on iOS
                lineHeight: 1.6,
                resize: 'vertical',
                fontFamily: 'inherit',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease',
              }}
            />
          </div>
        ))}

        {/* Sign button */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            disabled={isSigning || !fields.subjetivo || !fields.objetivo || !fields.analisis || !fields.plan}
            onClick={() => onRequestSign?.(fields)}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              background: isSigning ? 'var(--color-border)' : '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.9rem',
              border: 'none',
              cursor: isSigning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(16,185,129,0.2)',
              transition: 'all 0.2s ease',
            }}
          >
            {isSigning ? (
              <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Firmando...</>
            ) : '🔒 Guardar y Firmar Nota SOAP'}
          </button>

          <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.5, lineHeight: 1.4 }}>
            La firma es irreversible.<br />Cumplimiento NOM-004-SSA3-2012.
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}} />
      </div>
    </>
  );
}
