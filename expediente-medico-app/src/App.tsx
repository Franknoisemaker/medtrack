import { useState, useEffect, useCallback } from 'react';
import { supabase } from './services/supabase';
import { NewAppointmentForm } from './components/dashboard/NewAppointmentForm';
import type { Appointment } from './components/dashboard/NewAppointmentForm';
import { SoftGateForm } from './components/onboarding/SoftGateForm';
import { QrScanner } from './components/dashboard/QrScanner';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { KanbanBoard } from './components/dashboard/KanbanBoard';
import { PatientRecord } from './components/dashboard/PatientRecord';
import { AuthGateway } from './components/auth/AuthGateway';
import { PatientSearch } from './components/dashboard/PatientSearch';
import { NewAppointmentModal } from './components/dashboard/NewAppointmentModal';
import { logEvent } from './services/telemetry';

function App() {
  const [theme, setTheme] = useState<'zen' | 'glass' | 'tactical'>('zen');

  // Doctor session and profile states
  const [session, setSession] = useState<any>(null);
  const [medico, setMedico] = useState<{ id: string; nombre: string; cedula: string; email: string } | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Active view tab: 'agenda' | 'pacientes'
  const [activeTab, setActiveTab] = useState<'agenda' | 'pacientes'>('agenda');

  // Selected Date for Agenda
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const local = new Date();
    const year = local.getFullYear();
    const month = String(local.getMonth() + 1).padStart(2, '0');
    const day = String(local.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // Toggle modal for new interactive appointments
  const [showNewAppModal, setShowNewAppModal] = useState(false);

  // Patient Onboarding URL Token
  const [token, setToken] = useState<string | null>(null);
  const [patientSession, setPatientSession] = useState<{ sessionToken: string; consultaId: string; patient?: any } | null>(null);

  // Receptionist QR Soft-Pass URL Token
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [assistedSession, setAssistedSession] = useState<{ sessionToken: string; consultaId: string } | null>(null);

  // Selected patient for the clinical record workspace
  const [selectedPatient, setSelectedPatient] = useState<Appointment | null>(null);

  // Dynamic appointments from Supabase
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  // 1. Check active session on mount
  useEffect(() => {
    // Safety fallback timeout to ensure loading screen always clears within 3 seconds
    const safetyTimeout = setTimeout(() => {
      setIsLoadingAuth(false);
    }, 3000);

    const initAuth = async () => {
      try {
        const sessionRes = await supabase.auth.getSession();
        const activeSession = sessionRes?.data?.session || null;
        setSession(activeSession);
        if (activeSession?.user) {
          await fetchMedicoProfile(activeSession.user.id, activeSession);
        }
      } catch (err) {
        console.error('Auth initialization failed:', err);
      } finally {
        clearTimeout(safetyTimeout);
        setIsLoadingAuth(false);
      }
    };

    initAuth();

    // Listen for auth state changes with version-agnostic safe access
    const authListener = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) {
        await fetchMedicoProfile(currentSession.user.id, currentSession);
      } else {
        setMedico(null);
      }
    });

    const subscription = authListener?.data?.subscription || authListener?.subscription || authListener;

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const qrTokenParam = urlParams.get('qr_token');

    if (tokenParam) {
      setToken(tokenParam);
      setTheme('zen');
    } else if (qrTokenParam) {
      setQrToken(qrTokenParam);
      setTheme('zen');
    }

    return () => {
      clearTimeout(safetyTimeout);
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Fetch doctor decrypted metadata (Cédula Profesional) via secure RPC
  const fetchMedicoProfile = async (userId: string, activeSession: any) => {
    try {
      // Race the RPC call against an 8.0 second timeout to prevent local dev network hangs
      const rpcPromise = supabase.rpc('get_decrypted_medico', { p_medico_id: userId });
      const timeoutPromise = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('RPC network timeout')), 8000)
      );

      const res = await Promise.race([rpcPromise, timeoutPromise]);
      const data = res?.data || null;
      const error = res?.error || null;

      if (error) throw error;

      if (data && data.length > 0) {
        setMedico(data[0]);
      } else {
        // Fallback dynamically from session metadata in case of db resets with persistent Auth sessions
        const userMetaName = activeSession?.user?.user_metadata?.nombre;
        const userMetaCedula = activeSession?.user?.user_metadata?.cedula;
        const userMetaEmail = activeSession?.user?.email;
        setMedico({
          id: userId,
          nombre: userMetaName || 'Dr. Médico',
          cedula: userMetaCedula || 'PENDIENTE',
          email: userMetaEmail || '',
        });
      }
    } catch (err) {
      console.warn('Sandbox Diagnóstico: RPC get_decrypted_medico superó el tiempo de respuesta local o devolvió error. Iniciando perfil de contingencia Nom-024...', err);
      // Fail-safe default
      const userMetaName = activeSession?.user?.user_metadata?.nombre;
      const userMetaCedula = activeSession?.user?.user_metadata?.cedula;
      const userMetaEmail = activeSession?.user?.email;
      setMedico({
        id: userId,
        nombre: userMetaName || 'Dr. Médico',
        cedula: userMetaCedula || 'PENDIENTE',
        email: userMetaEmail || '',
      });
    }
  };

  // Fetch consultations for the selected date and doctor from Supabase
  const loadAppointments = useCallback(async () => {
    if (!medico?.id) return;
    setIsLoadingAppointments(true);
    try {
      // Calendar boundary ranges converted from user's local timezone to UTC
      const startOfDay = new Date(`${selectedDate}T00:00:00`).toISOString();
      const endOfDay = new Date(`${selectedDate}T23:59:59`).toISOString();

      // Race the Supabase request against a 2.5 second network timeout
      const dbPromise = supabase
        .from('consultas')
        .select(`
          id,
          fecha_hora,
          status,
          pacientes (
            id,
            nombre,
            telefono,
            email
          )
        `)
        .eq('medico_id', medico.id)
        .gte('fecha_hora', startOfDay)
        .lte('fecha_hora', endOfDay)
        .order('fecha_hora', { ascending: true });

      const timeoutPromise = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Appointments load network timeout')), 10000)
      );

      const res = await Promise.race([dbPromise, timeoutPromise]);
      const data = res?.data || null;
      const error = res?.error || null;

      if (error) throw error;

      const formatted: Appointment[] = (data || []).map((c: any) => ({
        id: c.id,
        nombre: c.pacientes?.nombre || 'Paciente Desconocido',
        telefono: c.pacientes?.telefono || '',
        email: c.pacientes?.email || '',
        fecha_hora: c.fecha_hora,
        status: c.status,
        paciente_id: c.pacientes?.id,
      }));

      setAppointments(formatted);
    } catch (err) {
      console.error('Error loading appointments (falling back to empty list):', err);
      setAppointments([]);
    } finally {
      setIsLoadingAppointments(false);
    }
  }, [selectedDate, medico?.id]);

  // Load appointments whenever date or doctor session changes
  useEffect(() => {
    if (session && medico) {
      loadAppointments();
    }
  }, [session, medico, selectedDate, loadAppointments]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMedico(null);
  };

  const handlePatientVerified = (sessionToken: string, consultaId: string, patient?: any) => {
    setPatientSession({ sessionToken, consultaId, patient });
    logEvent('patient_verified_onboarding', { consulta_id: consultaId });
  };

  const handleAssistedVerified = (sessionToken: string, consultaId: string) => {
    setAssistedSession({ sessionToken, consultaId });
    logEvent('assisted_reception_verified_qr', { consulta_id: consultaId });
  };

  // Adjust selected date by days
  const shiftDate = (days: number) => {
    const currentDate = new Date(selectedDate + 'T00:00:00');
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  // --- LOADING PLACEHOLDER ---
  if (isLoadingAuth) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f8fafc',
      }}>
        <span>Iniciando Entorno MedTrack...</span>
      </div>
    );
  }

  // --- RECEPTIONIST ASSISTED SCAN WORKSPACE ---
  if (qrToken) {
    if (assistedSession) {
      return (
        <OnboardingWizard
          sessionToken={assistedSession.sessionToken}
          consultaId={assistedSession.consultaId}
          onComplete={() => setAssistedSession(null)}
        />
      );
    }
    return (
      <div className="theme-zen" style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '2rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <QrScanner qrToken={qrToken} onSuccess={handleAssistedVerified} />
      </div>
    );
  }

  // --- PATIENT ONBOARDING WORKSPACE ---
  if (token) {
    if (patientSession) {
      return (
        <OnboardingWizard
          sessionToken={patientSession.sessionToken}
          consultaId={patientSession.consultaId}
          patient={patientSession.patient}
          onComplete={() => setPatientSession(null)}
        />
      );
    }
    return <SoftGateForm token={token} onVerified={handlePatientVerified} />;
  }

  // --- DOCTOR AUTHENTICATION SHIELD ---
  if (!session) {
    return <AuthGateway onAuthSuccess={(s) => setSession(s)} />;
  }

  // --- TRANSITIONAL SECURE PROFILE DECRYPTION ---
  if (!medico) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <span style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>🔐</span>
        <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>Descifrando perfil médico seguro...</span>
        <span style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '0.5rem' }}>Verificando credenciales NOM-024 y NOM-004</span>
      </div>
    );
  }

  // --- PHYSICIAN DASHBOARD WORKSPACE ---
  return (
    <div className={`theme-${theme}`} style={{ minHeight: '100vh', transition: 'background var(--transition-normal)' }}>
      <div className="app-container" style={{ padding: '2rem 1rem', maxWidth: '1280px', margin: '0 auto' }}>

        {/* Header */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2.5rem',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div>
            <h1 style={{
              fontSize: '2.25rem',
              color: 'var(--color-primary)',
              fontWeight: 700,
              letterSpacing: '-0.05em',
              marginBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              MedTrack{' '}
              <span style={{ color: 'var(--color-secondary)', fontSize: '1rem', fontWeight: 500, verticalAlign: 'middle', border: '1px solid var(--color-secondary)', padding: '2px 8px', borderRadius: '12px' }}>
                Dashboard
              </span>
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.7 }}>
              Expediente Clínico &amp; Control Sanitario (NOM-004, NOM-024)
            </p>
          </div>

          {/* User Profile and Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Active Doctor Card */}
            <div className="card-glass" style={{ padding: '0.5rem 1rem', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--color-border)', fontSize: '0.82rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🩺</span>
              <div>
                <div style={{ fontWeight: 700 }}>{medico.nombre}</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.6 }}>Cédula: <strong>{medico.cedula}</strong> 🔐</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--color-border)', padding: '4px', borderRadius: '24px' }}>
              <button
                onClick={() => { setActiveTab('agenda'); setSelectedPatient(null); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: activeTab === 'agenda' && !selectedPatient ? 'var(--color-surface-glass)' : 'transparent',
                  color: 'var(--color-primary)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                📅 Agenda
              </button>
              <button
                onClick={() => { setActiveTab('pacientes'); setSelectedPatient(null); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: activeTab === 'pacientes' && !selectedPatient ? 'var(--color-surface-glass)' : 'transparent',
                  color: 'var(--color-primary)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🔍 Pacientes
              </button>
            </div>

            {/* Theme Selector */}
            <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--color-border)', padding: '4px', borderRadius: '24px' }}>
              {(['zen', 'glass', 'tactical'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: theme === t ? 'var(--color-surface-glass)' : 'transparent',
                    color: 'var(--color-primary)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'zen' ? '🍃' : t === 'glass' ? '💎' : '⚙️'}
                </button>
              ))}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            >
              Cerrar Sesión 🚪
            </button>
          </div>
        </header>

        {/* Dynamic Navigation Calendar (only visible in Agenda mode) */}
        {activeTab === 'agenda' && !selectedPatient && (
          <div className="card-glass" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.5rem',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => shiftDate(-1)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ◀ Anterior
              </button>
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Hoy 📅
              </button>
              <button
                onClick={() => shiftDate(1)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Siguiente ▶
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>Fecha de consulta:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* Main Workspace router */}
        {selectedPatient ? (
          <PatientRecord
            appointment={selectedPatient}
            onBack={() => {
              setSelectedPatient(null);
              if (activeTab === 'agenda') {
                loadAppointments();
              }
            }}
          />
        ) : activeTab === 'agenda' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '2rem', alignItems: 'start' }}>
              <NewAppointmentForm 
                onAppointmentCreated={(createdApp) => { 
                  if (createdApp && createdApp.fecha_hora) {
                    const appointmentDate = createdApp.fecha_hora.split('T')[0];
                    if (selectedDate === appointmentDate) {
                      loadAppointments();
                    } else {
                      setSelectedDate(appointmentDate);
                    }
                  } else {
                    loadAppointments();
                  }
                }} 
              />
            <div>
              {isLoadingAppointments ? (
                <div className="card-glass" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-primary)', opacity: 0.7 }}>
                    Cargando agenda de citas...
                  </span>
                </div>
              ) : appointments.length > 0 ? (
                <KanbanBoard
                  appointments={appointments}
                  onSelectPatient={setSelectedPatient}
                />
              ) : (
                <div className="card-glass" style={{
                  padding: '4rem 2rem',
                  textAlign: 'center',
                  borderRadius: '12px',
                  border: '1px dashed var(--color-border)',
                }}>
                  <span style={{ fontSize: '2.5rem' }}>📭</span>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '1rem 0 0.5rem 0' }}>
                    Sin consultas programadas para este día
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.6, marginBottom: '1.5rem', maxWidth: '380px', marginInline: 'auto' }}>
                    No hay registros de citas clínicas programadas. Puedes agregar pacientes rápidamente usando el formulario lateral o crear una cita de prueba interactiva.
                  </p>
                  <button
                    onClick={() => setShowNewAppModal(true)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      background: 'linear-gradient(90deg, #0ea5e9, #6366f1)',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                    }}
                  >
                    ➕ Crear Cita de Prueba para este día
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <PatientSearch onSelectPatientRecord={setSelectedPatient} />
        )}

        {/* Dynamic Calendar modal */}
        {showNewAppModal && (
          <NewAppointmentModal
            selectedDate={selectedDate}
            onClose={() => setShowNewAppModal(false)}
            onSuccess={loadAppointments}
          />
        )}

        {/* Footer */}
        <footer style={{ marginTop: '3rem', textAlign: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.5 }}>
            Seguridad Clínica Activa: Cumplimiento NOM-004-SSA3-2012 e Inmutabilidad NOM-024-SSA3-2012.
            Aislamiento criptográfico del personal de salud activo.
          </p>
        </footer>

      </div>
    </div>
  );
}

export default App;
