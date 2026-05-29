import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { StickyTriage } from './StickyTriage';
import { SomatometricsForm } from './SomatometricsForm';
import { SoapEditor } from './SoapEditor';
import { EvolutionCharts } from './EvolutionCharts';
import { FileUploadZone } from './FileUploadZone';
import { ClinicalFilesList } from './ClinicalFilesList';
import type { ClinicalFile } from './ClinicalFilesList';
import { useSomatometrics } from '../../hooks/useSomatometrics';
import { NewAppointmentForm } from './NewAppointmentForm';
import type { Appointment } from './NewAppointmentForm';

interface PatientRecordProps {
  appointment: Appointment;
  onBack: () => void;
}

// Baseline historical data — in production: fetched from paciente_somatometria via RPC
const MOCK_HISTORY = [
  { fecha: '2026-02-10', peso: 78.0, imc: 24.1, pa_sistolica: 120, pa_diastolica: 80 },
  { fecha: '2026-03-15', peso: 79.5, imc: 24.6, pa_sistolica: 122, pa_diastolica: 82 },
  { fecha: '2026-04-20', peso: 80.2, imc: 24.8, pa_sistolica: 128, pa_diastolica: 84 },
];

const MOCK_FILES: ClinicalFile[] = [
  { id: 'uuid-1', titulo: 'Radiografía de Tórax AP', categoria: 'Radiografía', scan_status: 'CLEAN', uploaded_at: '2026-05-24T10:00:00Z' },
  { id: 'uuid-2', titulo: 'Química Sanguínea 6 Elementos', categoria: 'Laboratorio', scan_status: 'CLEAN', uploaded_at: '2026-05-20T08:30:00Z' },
];

export function PatientRecord({ appointment, onBack }: PatientRecordProps) {
  const somatometrics = useSomatometrics();
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signedMeta, setSignedMeta] = useState<{ firmadaEn: string; medico: string; cedula: string } | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [timelineTab, setTimelineTab] = useState<'future' | 'history'>('future');

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!appointment.paciente_id) {
      setHistoryData([]);
      return;
    }

    setIsLoadingHistory(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      if (isMock) {
        // Local dev sandbox mock history configuration
        const SEEDED_PATIENT_IDS = [
          'b2b12a8a-e55d-4f11-8ac1-f11181283c45',
          'c3b12a8a-e55d-4f11-8ac1-f11181283c46',
          'd4b12a8a-e55d-4f11-8ac1-f11181283c47'
        ];
        const isSeededPatient = SEEDED_PATIENT_IDS.includes(appointment.paciente_id);

        if (isSeededPatient) {
          setHistoryData(MOCK_HISTORY);
        } else {
          setHistoryData([]);
        }
      } else {
        // Real-time production database query joining consultas and paciente_somatometria
        const { data, error } = await supabase
          .from('consultas')
          .select(`
            id,
            fecha_hora,
            paciente_somatometria (
              peso_kg,
              imc,
              presion_sistolica,
              presion_diastolica
            )
          `)
          .eq('paciente_id', appointment.paciente_id)
          .neq('id', appointment.id)
          .eq('status', 'COMPLETED')
          .order('fecha_hora', { ascending: true });

        if (error) throw error;

        const historicalPoints = data
          ?.filter((c: any) => c.paciente_somatometria && (Array.isArray(c.paciente_somatometria) ? c.paciente_somatometria.length > 0 : c.paciente_somatometria))
          .map((c: any) => {
            const ps = Array.isArray(c.paciente_somatometria) ? c.paciente_somatometria[0] : c.paciente_somatometria;
            return {
              fecha: c.fecha_hora.split('T')[0],
              peso: Number(ps.peso_kg),
              imc: Number(ps.imc),
              pa_sistolica: Number(ps.presion_sistolica),
              pa_diastolica: Number(ps.presion_diastolica),
            };
          }) || [];

        setHistoryData(historicalPoints);
      }
    } catch (err) {
      console.error('Error fetching historical somatometrics:', err);
      setHistoryData([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [appointment.paciente_id, appointment.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Build live chart data: historical baseline + current visit entry if somatometrics are entered
  const livePayload = somatometrics.toPayload();
  const currentPoint = livePayload.peso_kg || livePayload.pa_sistolica ? {
    fecha: new Date().toISOString().split('T')[0],
    peso: livePayload.peso_kg || null,
    imc: livePayload.imc || null,
    pa_sistolica: livePayload.pa_sistolica || null,
    pa_diastolica: livePayload.pa_diastolica || null,
  } : null;
  const chartData = currentPoint ? [...historyData, currentPoint] : historyData;
  
  // Real files list state
  const [files, setFiles] = useState<ClinicalFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const fetchFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const { data, error } = await supabase
        .from('archivos_clinicos')
        .select('id, titulo, categoria, scan_status, uploaded_at')
        .eq('consulta_id', appointment.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (err) {
      console.error('Error fetching clinical files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [appointment.id]);

  const [triage, setTriage] = useState<{
    alergias?: string | null;
    medicamentos?: string | null;
    padecimientos_cifrado?: string | null;
    motivo_consulta_cifrado?: string | null;
  } | null>(null);
  const [isLoadingTriage, setIsLoadingTriage] = useState(false);
  const [patientAppointments, setPatientAppointments] = useState<any[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  const fetchPatientAppointments = useCallback(async () => {
    if (!appointment.paciente_id) return;
    setIsLoadingAppointments(true);
    try {
      const { data, error } = await supabase
        .from('consultas')
        .select(`
          id,
          fecha_hora,
          status,
          motivo_consulta_cifrado
        `)
        .eq('paciente_id', appointment.paciente_id)
        .order('fecha_hora', { ascending: false });

      if (error) throw error;
      setPatientAppointments(data || []);
    } catch (err) {
      console.error('Error fetching patient appointments:', err);
    } finally {
      setIsLoadingAppointments(false);
    }
  }, [appointment.paciente_id]);

  const fetchTriage = useCallback(async () => {
    setIsLoadingTriage(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      if (isMock) {
        await new Promise(r => setTimeout(r, 400));
        setTriage({
          alergias: 'Penicilina',
          medicamentos: 'Metformina 850mg',
          padecimientos_cifrado: 'Diabetes tipo 2, Hipertensión',
          motivo_consulta_cifrado: 'Control de glucemia mensual. Reporta niveles en ayuno de 140 mg/dL esta semana.',
        });
      } else {
        const { data, error } = await supabase.rpc('get_decrypted_triage', {
          p_consulta_id: appointment.id,
          p_ip: '127.0.0.1',
          p_user_agent: navigator.userAgent || 'Unknown Browser',
        });

        if (error) {
          // If RPC returns error because details are not inserted yet, fallback to a clean empty state
          console.warn('RPC get_decrypted_triage returned error (assume empty triage):', error);
          setTriage(null);
          return;
        }

        if (data && data.length > 0) {
          const result = data[0];
          setTriage({
            alergias: result.alergias,
            medicamentos: result.medicamentos,
            padecimientos_cifrado: result.padecimientos,
            motivo_consulta_cifrado: result.motivo_consulta,
          });
        } else {
          setTriage(null);
        }
      }
    } catch (err) {
      console.error('Error fetching decrypted triage:', err);
      setTriage(null);
    } finally {
      setIsLoadingTriage(false);
    }
  }, [appointment.id]);

  useEffect(() => {
    fetchTriage();
    fetchPatientAppointments();
  }, [fetchTriage, fetchPatientAppointments]);

  const handleSign = async (soapData: { subjetivo: string; objetivo: string; analisis: string; plan: string }) => {
    setIsSigning(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      if (isMock) {
        // High-fidelity mock signing delay
        await new Promise(r => setTimeout(r, 1500));
      } else {
        const session = (await supabase.auth.getSession()).data.session;
        const sessionToken = session?.access_token || 'mock-doctor-session-token';
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

        const resp = await fetch(`${supabaseUrl}/functions/v1/sign-note?apikey=${supabaseAnonKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            consulta_id: appointment.id,
            soap_json: soapData,
            somatometria_json: somatometrics.toPayload(),
            medico_id: 'demo-medico-id',
            cedula: '12345678',
          }),
        });
        const res = await resp.json();
        if (!res.success) {
          if (res.debug) console.error('[sign-note] DB error detail:', res.debug);
          throw new Error(res.error);
        }
      }

      setSignedMeta({
        firmadaEn: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        medico: 'Ana García Torres',
        cedula: '12345678',
      });
      setIsSigned(true);
    } catch (err) {
      console.error('Error signing note:', err);
      alert('Error al firmar la nota. Intenta nuevamente.');
    } finally {
      setIsSigning(false);
    }
  };

  const handleNoteLoaded = useCallback((status: {
    isSigned: boolean;
    signedMeta: { firmadaEn: string; medico: string; cedula: string } | null;
  }) => {
    setIsSigned(status.isSigned);
    setSignedMeta(status.signedMeta);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
        <button
          onClick={onBack}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--color-primary)',
            cursor: 'pointer',
          }}
        >
          ← Volver al Kanban
        </button>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.45 }}>/ Expediente</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>
          {appointment.nombre}
        </span>

        {/* Botón de Cita de Seguimiento */}
        <button
          onClick={() => setShowFollowUpModal(true)}
          style={{
            marginLeft: 'auto',
            padding: '8px 14px',
            borderRadius: '6px',
            background: 'var(--color-secondary)',
            color: '#ffffff',
            fontSize: '0.82rem',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          📅 Agendar Seguimiento
        </button>
      </div>

      {/* Main layout: Sticky Triage + Content */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left: Sticky Triage Sidebar */}
        <StickyTriage
          patientName={appointment.nombre}
          consultaId={appointment.id}
          triage={triage}
          isLoading={isLoadingTriage}
          onTriageSaved={fetchTriage}
        />

        {/* Right: Clinical workspace */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          {/* Somatometrics */}
          <div className="card-glass" style={{ padding: '1.5rem' }}>
            <SomatometricsForm externalHook={somatometrics} />
          </div>

          {/* SOAP Editor */}
          <div className="card-glass" style={{ padding: '1.5rem' }}>
            <SoapEditor
              consultaId={appointment.id}
              readOnly={isSigned}
              signedData={signedMeta}
              onRequestSign={handleSign}
              isSigning={isSigning}
              onNoteLoaded={handleNoteLoaded}
            />
          </div>

          {/* Evolution Charts — live data from current somatometrics hook */}
          <div className="card-glass" style={{ padding: '1.5rem' }}>
            <EvolutionCharts data={chartData} />
          </div>

          {/* Archivos Clínicos */}
          <div className="card-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
              🛡️ Estudios y Archivos Seguros
            </h3>
            
            <FileUploadZone 
              consultaId={appointment.id} 
              onUploadSuccess={() => {
                // Reload the real files list from the database
                fetchFiles();
              }} 
            />

            {isLoadingFiles ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.45, fontSize: '0.85rem' }}>
                Cargando archivos...
              </div>
            ) : (
              <ClinicalFilesList 
                consultaId={appointment.id} 
                files={files} 
              />
            )}
          </div>

          {/* Historial de Consultas de Control (Timeline de Citas Pasadas y Futuras) */}
          <div className="card-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                📆 Línea de Tiempo de Consultas
              </h3>
              {/* Pestañas Interactivas */}
              <div style={{ display: 'flex', background: 'var(--color-surface)', padding: '3px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setTimelineTab('future')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: timelineTab === 'future' ? 'var(--color-secondary)' : 'transparent',
                    color: timelineTab === 'future' ? '#ffffff' : 'var(--color-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  📅 Programadas ({patientAppointments.filter(a => a.status === 'PENDING_ONBOARDING' || a.status === 'ACTIVE').length})
                </button>
                <button
                  onClick={() => setTimelineTab('history')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: timelineTab === 'history' ? 'var(--color-secondary)' : 'transparent',
                    color: timelineTab === 'history' ? '#ffffff' : 'var(--color-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  📜 Históricas ({patientAppointments.filter(a => a.status === 'COMPLETED' || a.status === 'CANCELLED').length})
                </button>
              </div>
            </div>

            {isLoadingAppointments ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>
                Cargando historial de consultas...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {patientAppointments.filter(a => {
                  const isFuture = a.status === 'PENDING_ONBOARDING' || a.status === 'ACTIVE';
                  return timelineTab === 'future' ? isFuture : !isFuture;
                }).length === 0 ? (
                  <div style={{
                    padding: '2rem 1.5rem',
                    textAlign: 'center',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '8px',
                    background: 'var(--color-surface-glass)',
                    color: 'var(--color-primary)',
                    opacity: 0.55,
                    fontSize: '0.8rem'
                  }}>
                    {timelineTab === 'future' 
                      ? 'No hay consultas programadas a futuro para este paciente.' 
                      : 'Este paciente aún no cuenta con historial de consultas concluidas.'}
                  </div>
                ) : (
                  patientAppointments.filter(a => {
                    const isFuture = a.status === 'PENDING_ONBOARDING' || a.status === 'ACTIVE';
                    return timelineTab === 'future' ? isFuture : !isFuture;
                  }).map((appItem, idx) => {
                    const appDate = new Date(appItem.fecha_hora);
                    const formattedDate = appDate.toLocaleDateString('es-MX', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    // Badges of status color
                    let statusBg = 'rgba(59, 130, 246, 0.08)';
                    let statusColor = '#3b82f6';
                    let statusText = 'Activa';

                    if (appItem.status === 'PENDING_ONBOARDING') {
                      statusBg = 'rgba(245, 158, 11, 0.08)';
                      statusColor = '#d97706';
                      statusText = 'Onboarding';
                    } else if (appItem.status === 'COMPLETED') {
                      statusBg = 'rgba(16, 185, 129, 0.08)';
                      statusColor = '#10b981';
                      statusText = 'Concluida';
                    } else if (appItem.status === 'CANCELLED') {
                      statusBg = 'rgba(239, 68, 68, 0.08)';
                      statusColor = '#ef4444';
                      statusText = 'Cancelada';
                    }

                    const isCurrent = appItem.id === appointment.id;

                    return (
                      <div
                        key={appItem.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          padding: '12px 14px',
                          background: isCurrent ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-surface-glass)',
                          border: isCurrent ? '1.5px solid var(--color-secondary)' : '1px solid var(--color-border)',
                          borderRadius: '8px',
                          position: 'relative',
                          transition: 'all 0.2s',
                          transform: isCurrent ? 'scale(1.01)' : 'scale(1)'
                        }}
                      >
                        {isCurrent && (
                          <div style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '12px',
                            background: 'var(--color-secondary)',
                            color: '#ffffff',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            boxShadow: '0 2px 5px rgba(59, 130, 246, 0.3)'
                          }}>
                            Consulta Actual
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                            {formattedDate}
                          </span>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: statusBg,
                            color: statusColor,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {statusText}
                          </span>
                        </div>

                        {appItem.motivo_consulta_cifrado && (
                          <div style={{ fontSize: '0.76rem', color: 'var(--color-primary)', opacity: 0.7, borderTop: '1px dashed var(--color-border)', paddingTop: '6px', marginTop: '2px' }}>
                            <strong style={{ fontWeight: 600 }}>Motivo: </strong>
                            {appItem.motivo_consulta_cifrado.startsWith('[PGP_ENCRYPTED]_') 
                              ? appItem.motivo_consulta_cifrado.substring(16)
                              : 'Cifrado en base de datos 🛡️'}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal flotante de Cita de Seguimiento */}
      {showFollowUpModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            borderRadius: '12px',
          }}>
            <NewAppointmentForm
              initialPaciente={{
                id: appointment.paciente_id || '',
                nombre: appointment.nombre,
                telefono: appointment.telefono,
                email: appointment.email
              }}
              onAppointmentCreated={(newApp) => {
                // Keep it clean and nice
              }}
              onClose={() => setShowFollowUpModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
