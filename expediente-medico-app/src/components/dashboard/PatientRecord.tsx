import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { HistoricalNoteModal } from './HistoricalNoteModal';
import { CalendarButton } from './CalendarButton';

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
  const [isSigned, setIsSigned] = useState(appointment.status === 'COMPLETED');
  const [signedMeta, setSignedMeta] = useState<{ firmadaEn: string; medico: string; cedula: string } | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showHistoricalNoteModal, setShowHistoricalNoteModal] = useState(false);
  const [timelineTab, setTimelineTab] = useState<'future' | 'history'>('future');
  const [tipoConsulta, setTipoConsulta] = useState<'General' | 'Control de Peso'>('General');
  const [hoveredTab, setHoveredTab] = useState<'General' | 'Control de Peso' | null>(null);

  useEffect(() => {
    async function loadConsultationType() {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
        const isMock = supabaseUrl.includes('your-project-id');
        if (isMock) {
          if (appointment.nombre.includes('Elena') || appointment.nombre.includes('Carlos')) {
            setTipoConsulta('Control de Peso');
          } else {
            setTipoConsulta('General');
          }
        } else {
          const { data, error } = await supabase
            .from('consultas')
            .select('tipo_consulta')
            .eq('id', appointment.id)
            .maybeSingle();
          if (data && !error && data.tipo_consulta) {
            setTipoConsulta(data.tipo_consulta as 'General' | 'Control de Peso');
          }
        }
      } catch {
        // Silently fallback to 'General' if tipo_consulta column does not exist yet
        setTipoConsulta('General');
      }
    }
    loadConsultationType();
  }, [appointment.id]);

  const handleTipoConsultaChange = async (newType: 'General' | 'Control de Peso') => {
    setTipoConsulta(newType);
    if (appointment.status === 'COMPLETED' || isSigned) {
      return;
    }
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');
      if (!isMock) {
        const { error } = await supabase
          .from('consultas')
          .update({ tipo_consulta: newType })
          .eq('id', appointment.id);
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error updating consultation type:', err);
    }
  };

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
        let { data, error } = await supabase
          .from('consultas')
          .select(`
            id,
            fecha_hora,
            paciente_somatometria (
              peso_kg,
              talla_cm,
              imc,
              presion_sistolica,
              presion_diastolica,
              musculo_pct,
              grasa_pct,
              cintura_cm,
              cadera_cm,
              busto_cm,
              brazo_cm,
              dosis_ml
            )
          `)
          .eq('paciente_id', appointment.paciente_id)
          .eq('status', 'COMPLETED')
          .order('fecha_hora', { ascending: true });

        // Fallback: if extended somatometrics columns do not exist in DB schema yet
        if (error) {
          console.warn('[PatientRecord] fetchHistory extended query failed, retrying with core columns fallback:', error);
          const fallbackRes = await supabase
            .from('consultas')
            .select(`
              id,
              fecha_hora,
              paciente_somatometria (
                peso_kg,
                talla_cm,
                imc,
                presion_sistolica,
                presion_diastolica
              )
            `)
            .eq('paciente_id', appointment.paciente_id)
            .eq('status', 'COMPLETED')
            .order('fecha_hora', { ascending: true });

          data = fallbackRes.data;
          if (fallbackRes.error) throw fallbackRes.error;
        }

        const historicalPoints = data
          ?.filter((c: any) => c.paciente_somatometria && (Array.isArray(c.paciente_somatometria) ? c.paciente_somatometria.length > 0 : c.paciente_somatometria))
          .map((c: any) => {
            const ps = Array.isArray(c.paciente_somatometria) ? c.paciente_somatometria[0] : c.paciente_somatometria;
            return {
              fecha: (c.fecha_hora || '').substring(0, 10),
              peso: ps.peso_kg != null ? Number(ps.peso_kg) : null,
              talla: ps.talla_cm != null ? Number(ps.talla_cm) : null,
              imc: ps.imc != null ? Number(ps.imc) : null,
              pa_sistolica: ps.presion_sistolica != null ? Number(ps.presion_sistolica) : null,
              pa_diastolica: ps.presion_diastolica != null ? Number(ps.presion_diastolica) : null,
              musculo_pct: ps.musculo_pct != null ? Number(ps.musculo_pct) : null,
              grasa_pct: ps.grasa_pct != null ? Number(ps.grasa_pct) : null,
              cintura_cm: ps.cintura_cm != null ? Number(ps.cintura_cm) : null,
              cadera_cm: ps.cadera_cm != null ? Number(ps.cadera_cm) : null,
              busto_cm: ps.busto_cm != null ? Number(ps.busto_cm) : null,
              brazo_cm: ps.brazo_cm != null ? Number(ps.brazo_cm) : null,
              dosis_ml: ps.dosis_ml != null ? Number(ps.dosis_ml) : null,
            };
          }) || [];

        const SEEDED_PATIENT_IDS = [
          'b2b12a8a-e55d-4f11-8ac1-f11181283c45',
          'c3b12a8a-e55d-4f11-8ac1-f11181283c46',
          'd4b12a8a-e55d-4f11-8ac1-f11181283c47'
        ];
        const isSeededPatient = SEEDED_PATIENT_IDS.includes(appointment.paciente_id);

        if (historicalPoints.length === 0 && isSeededPatient) {
          setHistoryData(MOCK_HISTORY);
        } else {
          setHistoryData(historicalPoints);
        }
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

  // Reset isSigned and signedMeta when the active appointment changes
  useEffect(() => {
    setIsSigned(appointment.status === 'COMPLETED');
    setSignedMeta(null);
  }, [appointment.id, appointment.status]);

  // Load current consultation somatometrics if they exist in the database
  useEffect(() => {
    async function loadCurrentSomatometrics() {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
        const isMock = supabaseUrl.includes('your-project-id');

        if (isMock) {
          if (appointment.status === 'COMPLETED') {
            somatometrics.setValue('pesoKg', '70.0');
            somatometrics.setValue('tallaCm', '170.0');
            somatometrics.setValue('paSistolica', '120');
            somatometrics.setValue('paDiastolica', '80');
          } else {
            somatometrics.setValue('pesoKg', '');
            somatometrics.setValue('tallaCm', '');
            somatometrics.setValue('paSistolica', '');
            somatometrics.setValue('paDiastolica', '');
          }
        } else {
          // Clear inputs first
          somatometrics.setValue('pesoKg', '');
          somatometrics.setValue('tallaCm', '');
          somatometrics.setValue('paSistolica', '');
          somatometrics.setValue('paDiastolica', '');

          const { data, error } = await supabase
            .from('paciente_somatometria')
            .select('*')
            .eq('consulta_id', appointment.id)
            .maybeSingle();

          if (data && !error) {
            if (data.peso_kg) somatometrics.setValue('pesoKg', String(data.peso_kg));
            if (data.talla_cm) somatometrics.setValue('tallaCm', String(data.talla_cm));
            if (data.presion_sistolica) somatometrics.setValue('paSistolica', String(data.presion_sistolica));
            if (data.presion_diastolica) somatometrics.setValue('paDiastolica', String(data.presion_diastolica));
            if (data.musculo_pct) somatometrics.setValue('musculoPct', String(data.musculo_pct));
            if (data.grasa_pct) somatometrics.setValue('grasaPct', String(data.grasa_pct));
            if (data.cintura_cm) somatometrics.setValue('cinturaCm', String(data.cintura_cm));
            if (data.cadera_cm) somatometrics.setValue('caderaCm', String(data.cadera_cm));
            if (data.busto_cm) somatometrics.setValue('bustoCm', String(data.busto_cm));
            if (data.brazo_cm) somatometrics.setValue('brazoCm', String(data.brazo_cm));
            if (data.dosis_ml) somatometrics.setValue('dosisMl', String(data.dosis_ml));

            const hasWeightControlData = 
              data.musculo_pct != null || 
              data.grasa_pct != null || 
              data.cintura_cm != null || 
              data.cadera_cm != null || 
              data.busto_cm != null || 
              data.brazo_cm != null || 
              data.dosis_ml != null;

            if (hasWeightControlData) {
              setTipoConsulta('Control de Peso');
            }
          }
        }
      } catch (err) {
        console.error('Error loading current somatometrics:', err);
      }
    }
    loadCurrentSomatometrics();
  }, [appointment.id, appointment.status]);

  // Build live chart data: historical baseline + current visit entry if somatometrics are entered and consultation is NOT completed
  const livePayload = somatometrics.toPayload();
  const currentPoint = (appointment.status !== 'COMPLETED' && (livePayload.peso_kg || livePayload.pa_sistolica || livePayload.grasa_pct || livePayload.dosis_ml)) ? {
    fecha: new Date().toISOString().split('T')[0],
    peso: livePayload.peso_kg || null,
    imc: livePayload.imc || null,
    pa_sistolica: livePayload.pa_sistolica || null,
    pa_diastolica: livePayload.pa_diastolica || null,
    musculo_pct: livePayload.musculo_pct || null,
    grasa_pct: livePayload.grasa_pct || null,
    cintura_cm: livePayload.cintura_cm || null,
    cadera_cm: livePayload.cadera_cm || null,
    busto_cm: livePayload.busto_cm || null,
    brazo_cm: livePayload.brazo_cm || null,
    dosis_ml: livePayload.dosis_ml || null,
  } : null;
  const chartData = currentPoint ? [...historyData, currentPoint] : historyData;
  
  // Real files list state
  const [files, setFiles] = useState<ClinicalFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const fetchFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id') || !import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (isMock) {
        // High-fidelity sandbox mock files list for Elena
        const MOCK_FILES = [
          { id: 'uuid-1', titulo: 'Radiografía de Tórax AP', categoria: 'Radiografía', scan_status: 'CLEAN' as const, uploaded_at: '2026-05-24T10:00:00Z' },
          { id: 'uuid-2', titulo: 'Química Sanguínea 6 Elementos', categoria: 'Laboratorio', scan_status: 'CLEAN' as const, uploaded_at: '2026-05-20T08:30:00Z' },
        ];
        setFiles(MOCK_FILES);
        return;
      }

      // REAL DATABASE QUERY: Strictly query by unique patient ID
      // This guarantees absolute clinical patient safety and prevents any homonym or shared-phone mixing.
      if (!appointment.paciente_id) {
        setFiles([]);
        return;
      }

      // 1. Get all consultation IDs for this specific patient
      const { data: consultations, error: consultsError } = await supabase
        .from('consultas')
        .select('id')
        .eq('paciente_id', appointment.paciente_id);

      if (consultsError) throw consultsError;

      const consultationIds = (consultations || []).map(c => c.id);

      if (consultationIds.length === 0) {
        setFiles([]);
        return;
      }

      // 2. Query clinical files for these consultations
      const { data, error } = await supabase
        .from('archivos_clinicos')
        .select('id, titulo, categoria, scan_status, uploaded_at')
        .in('consulta_id', consultationIds)
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
  }, [appointment.paciente_id]);

  const [triage, setTriage] = useState<{
    alergias?: string | null;
    medicamentos?: string | null;
    padecimientos_cifrado?: string | null;
    motivo_consulta_cifrado?: string | null;
  } | null>(null);
  const [isLoadingTriage, setIsLoadingTriage] = useState(false);
  const [patientAppointments, setPatientAppointments] = useState<any[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [expandedAppointmentId, setExpandedAppointmentId] = useState<string | null>(null);
  const [loadedSoapNotes, setLoadedSoapNotes] = useState<Record<string, {
    subjetivo: string;
    objetivo: string;
    analisis: string;
    plan: string;
    isSigned: boolean;
    loading: boolean;
  }>>({});

  const handleToggleAccordion = useCallback(async (consultaId: string) => {
    if (expandedAppointmentId === consultaId) {
      setExpandedAppointmentId(null);
      return;
    }

    setExpandedAppointmentId(consultaId);

    if (loadedSoapNotes[consultaId]) return; // Ya cargada

    setLoadedSoapNotes(prev => ({
      ...prev,
      [consultaId]: { subjetivo: '', objetivo: '', analisis: '', plan: '', isSigned: false, loading: true }
    }));

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      if (isMock) {
        await new Promise(r => setTimeout(r, 400));
        setLoadedSoapNotes(prev => ({
          ...prev,
          [consultaId]: {
            subjetivo: 'Paciente masculino que acude por control periódico. Refiere sentirse estable sin sintomatología aguda.',
            objetivo: 'Signos vitales estables. FC: 72 lpm, FR: 16 rpm, Temp: 36.5 °C. Abdomen blando, depresible.',
            analisis: 'E11.9 - Diabetes mellitus tipo 2 sin complicaciones, bajo control terapéutico.',
            plan: 'Continuar con tratamiento actual de Metformina. Próxima cita de control en 4 semanas.',
            isSigned: true,
            loading: false
          }
        }));
      } else {
        const { data: remoteNotes, error } = await supabase
          .rpc('get_decrypted_soap_note', { p_consulta_id: consultaId });

        if (error) {
          console.error('[PatientRecord] get_decrypted_soap_note error:', error);
        }

        const data = remoteNotes?.[0];

        if (data && !error) {
          setLoadedSoapNotes(prev => ({
            ...prev,
            [consultaId]: {
              subjetivo: data.subjetivo || '',
              objetivo: data.objetivo || '',
              analisis: data.analisis || '',
              plan: data.plan || '',
              isSigned: data.nota_status === 'signed',
              loading: false
            }
          }));
        } else {
          setLoadedSoapNotes(prev => ({
            ...prev,
            [consultaId]: {
              subjetivo: 'No se encontraron notas SOAP registradas para esta consulta.',
              objetivo: '',
              analisis: '',
              plan: '',
              isSigned: false,
              loading: false
            }
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching historical SOAP note:', err);
      setLoadedSoapNotes(prev => ({
        ...prev,
        [consultaId]: {
          subjetivo: 'Error al cargar los datos de la nota SOAP.',
          objetivo: '',
          analisis: '',
          plan: '',
          isSigned: false,
          loading: false
        }
      }));
    }
  }, [expandedAppointmentId, loadedSoapNotes]);

  const fetchPatientAppointments = useCallback(async () => {
    if (!appointment.paciente_id) return;
    setIsLoadingAppointments(true);
    try {
      let { data, error } = await supabase
        .from('consultas')
        .select(`
          id,
          fecha_hora,
          status,
          tipo_consulta,
          motivo_consulta_cifrado,
          paciente_somatometria (
            peso_kg,
            talla_cm,
            imc,
            presion_sistolica,
            presion_diastolica,
            musculo_pct,
            grasa_pct,
            cintura_cm,
            cadera_cm,
            busto_cm,
            brazo_cm,
            dosis_ml
          )
        `)
        .eq('paciente_id', appointment.paciente_id)
        .order('fecha_hora', { ascending: false });

      // Fallback: if tipo_consulta or new somatometrics columns do not exist in DB schema yet
      if (error) {
        console.warn('[PatientRecord] fetchPatientAppointments extended query failed, retrying with core columns fallback:', error);
        const fallbackRes = await supabase
          .from('consultas')
          .select(`
            id,
            fecha_hora,
            status,
            motivo_consulta_cifrado,
            paciente_somatometria (
              peso_kg,
              talla_cm,
              imc,
              presion_sistolica,
              presion_diastolica
            )
          `)
          .eq('paciente_id', appointment.paciente_id)
          .order('fecha_hora', { ascending: false });

        data = fallbackRes.data;
        if (fallbackRes.error) throw fallbackRes.error;
      }

      setPatientAppointments(data || []);
    } catch (err) {
      console.error('Error fetching patient appointments:', err);
    } finally {
      setIsLoadingAppointments(false);
    }
  }, [appointment.paciente_id]);

  // Auto-switch timeline tab to 'history' if current consultation is COMPLETED or if patient has no future pending appointments
  useEffect(() => {
    if (appointment.status === 'COMPLETED') {
      setTimelineTab('history');
    } else if (patientAppointments.length > 0) {
      const hasFuture = patientAppointments.some(a => a.status === 'PENDING_ONBOARDING' || a.status === 'ACTIVE');
      if (!hasFuture) {
        setTimelineTab('history');
      }
    }
  }, [patientAppointments, appointment.status]);

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
    // Validate somatometry before signing
    const payload = somatometrics.toPayload();
    const pressureMissing = !payload.pa_sistolica || !payload.pa_diastolica;

    if (pressureMissing) {
      alert(
        '⚠️ Presión Arterial requerida\n\n' +
        'La presión arterial (Sistólica y Diastólica) es obligatoria y debe ser registrada antes de firmar.'
      );
      return;
    }

    const basicSomaMissing = !payload.peso_kg || !payload.talla_cm;
    if (basicSomaMissing) {
      const confirmar = window.confirm(
        '⚠️ Somatometría incompleta\n\n' +
        'Los campos de Peso y/o Talla están vacíos.\n\n' +
        'Si firmas sin estos datos, NO quedarán registrados en el expediente y no podrán recuperarse.\n\n' +
        '¿Deseas continuar y firmar sin somatometría?'
      );
      if (!confirmar) return;
    }

    setIsSigning(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      let doctorName = 'Dr. Médico';
      let doctorCedula = 'PENDIENTE';
      let activeDoctorId = '';
      let sessionToken = '';

      if (isMock) {
        // High-fidelity mock signing delay
        await new Promise(r => setTimeout(r, 1500));
        doctorName = 'Ana García Torres';
        doctorCedula = '12345678';
      } else {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          throw new Error('Sesión de médico no válida o expirada. Por favor, inicia sesión.');
        }
        sessionToken = session.access_token;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        activeDoctorId = session.user.id;
        doctorName = session.user.user_metadata?.nombre || 'Dr. Médico';
        doctorCedula = session.user.user_metadata?.cedula || 'PENDIENTE';

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
            medico_id: activeDoctorId,
            cedula: doctorCedula,
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
        medico: doctorName,
        cedula: doctorCedula,
      });
      setIsSigned(true);

      // Refresh historical data and timeline appointments immediately upon signing
      fetchHistory();
      fetchPatientAppointments();
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

  const filteredAppointments = useMemo(() => {
    return patientAppointments
      .filter(a => {
        const isFuture = a.status === 'PENDING_ONBOARDING' || a.status === 'ACTIVE';
        return timelineTab === 'future' ? isFuture : !isFuture;
      })
      .sort((a, b) => {
        const timeA = new Date(a.fecha_hora).getTime();
        const timeB = new Date(b.fecha_hora).getTime();
        return timelineTab === 'future' ? timeA - timeB : timeB - timeA;
      });
  }, [patientAppointments, timelineTab]);

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
          {/* Consulta Type Selector & Somatometrics */}
          <div className="card-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>Tipo de Consulta:</span>
              <div style={{
                display: 'inline-flex',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '3px',
                position: 'relative',
                opacity: 1,
                pointerEvents: 'auto'
              }}>
                <button
                  type="button"
                  onClick={() => handleTipoConsultaChange('General')}
                  onMouseEnter={() => setHoveredTab('General')}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: tipoConsulta === 'General' 
                      ? 'var(--color-secondary)' 
                      : (hoveredTab === 'General' ? 'rgba(255, 255, 255, 0.08)' : 'transparent'),
                    color: tipoConsulta === 'General' ? '#ffffff' : 'var(--color-primary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: tipoConsulta === 'General' ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                >
                  🩺 Consulta General
                </button>
                <button
                  type="button"
                  onClick={() => handleTipoConsultaChange('Control de Peso')}
                  onMouseEnter={() => setHoveredTab('Control de Peso')}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: tipoConsulta === 'Control de Peso' 
                      ? 'var(--color-secondary)' 
                      : (hoveredTab === 'Control de Peso' ? 'rgba(255, 255, 255, 0.08)' : 'transparent'),
                    color: tipoConsulta === 'Control de Peso' ? '#ffffff' : 'var(--color-primary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: tipoConsulta === 'Control de Peso' ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                >
                  ⚖️ Control de Peso
                </button>
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
            <SomatometricsForm 
              externalHook={somatometrics} 
              readOnly={appointment.status === 'COMPLETED' || isSigned} 
              tipoConsulta={tipoConsulta}
            />
          </div>

          {/* SOAP Editor */}
          <div className="card-glass" style={{ padding: '1.5rem' }}>
            <SoapEditor
              consultaId={appointment.id}
              readOnly={appointment.status === 'COMPLETED' || isSigned}
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
                <button
                  onClick={() => setShowHistoricalNoteModal(true)}
                  style={{
                    marginLeft: '12px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px dashed var(--color-border)',
                    color: 'var(--color-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: 0.8
                  }}
                >
                  📝 Agregar Histórica
                </button>
              </h3>
              {/* Pestañas Interactivas */}
              <div style={{ display: 'flex', background: 'var(--color-bg)', padding: '3px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
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
                {filteredAppointments.length === 0 ? (
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
                  filteredAppointments.map((appItem, idx) => {
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
                    const isHistorical = appItem.status === 'COMPLETED' || appItem.status === 'CANCELLED';
                    const isExpanded = expandedAppointmentId === appItem.id;

                    return (
                      <div
                        key={appItem.id}
                        onClick={() => {
                          if (isHistorical) {
                            handleToggleAccordion(appItem.id);
                          }
                        }}
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
                          transform: isCurrent ? 'scale(1.01)' : 'scale(1)',
                          cursor: isHistorical ? 'pointer' : 'default',
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {appItem.tipo_consulta && (
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                background: appItem.tipo_consulta === 'Control de Peso' ? 'rgba(20, 184, 166, 0.08)' : 'rgba(148, 163, 184, 0.1)',
                                color: appItem.tipo_consulta === 'Control de Peso' ? '#0f766e' : 'var(--color-primary)',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}>
                                {appItem.tipo_consulta}
                              </span>
                            )}
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
                            {/* ── Agregar al Calendario ── */}
                            <CalendarButton
                              compact
                              stopPropagation
                              patientName={appItem.nombre}
                              appointmentType={appItem.tipo_consulta || 'Consulta General'}
                              dtstart={new Date(appItem.fecha_hora)}
                              durationMinutes={60}
                            />
                            {isHistorical && (
                              <span style={{
                                fontSize: '0.7rem',
                                opacity: 0.6,
                                transition: 'transform 0.2s',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                display: 'inline-block'
                              }}>
                                ▼
                              </span>
                            )}
                          </div>
                        </div>

                        {appItem.motivo_consulta_cifrado && (
                          <div style={{ fontSize: '0.76rem', color: 'var(--color-primary)', opacity: 0.7, borderTop: '1px dashed var(--color-border)', paddingTop: '6px', marginTop: '2px' }}>
                            <strong style={{ fontWeight: 600 }}>Motivo: </strong>
                            {appItem.motivo_consulta_cifrado.startsWith('[PGP_ENCRYPTED]_') 
                              ? appItem.motivo_consulta_cifrado.substring(16)
                              : 'Cifrado en base de datos 🛡️'}
                          </div>
                        )}

                        {isHistorical && isExpanded && (
                          <div 
                            onClick={(e) => e.stopPropagation()} 
                            style={{
                              marginTop: '10px',
                              borderTop: '1px solid var(--color-border)',
                              paddingTop: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px',
                            }}
                          >
                            {/* Somatometría y Signos Vitales */}
                            {(() => {
                              const soma = Array.isArray(appItem.paciente_somatometria) 
                                ? appItem.paciente_somatometria[0] 
                                : appItem.paciente_somatometria;
                              
                              if (!soma) return null;

                              const hasAntropometria = soma.grasa_pct != null || 
                                                       soma.musculo_pct != null || 
                                                       soma.cintura_cm != null || 
                                                       soma.cadera_cm != null || 
                                                       soma.busto_cm != null || 
                                                       soma.brazo_cm != null;
                              const hasTratamiento = soma.dosis_ml != null;

                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
                                    ⚖️ Somatometría y Signos Vitales
                                  </span>
                                  
                                  {/* Fila 1: Básicos */}
                                  <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(4, 1fr)', 
                                    gap: '8px', 
                                    background: 'rgba(59, 130, 246, 0.03)', 
                                    padding: '8px 10px', 
                                    borderRadius: '6px', 
                                    border: '1px solid rgba(59, 130, 246, 0.08)' 
                                  }}>
                                    {/* Peso */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>Peso</span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.peso_kg ? `${Number(soma.peso_kg).toFixed(1)} kg` : '--'}</span>
                                    </div>
                                    {/* Talla */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>Estatura</span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.talla_cm ? `${soma.talla_cm} cm` : '--'}</span>
                                    </div>
                                    {/* IMC */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>IMC</span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.imc ? Number(soma.imc).toFixed(1) : '--'}</span>
                                    </div>
                                    {/* Presión */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>Presión</span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.presion_sistolica && soma.presion_diastolica ? `${soma.presion_sistolica}/${soma.presion_diastolica}` : '--'}</span>
                                    </div>
                                  </div>

                                  {/* Fila 2: Antropometría y Composición Corporal (Opcional) */}
                                  {hasAntropometria && (
                                    <div style={{ 
                                      display: 'grid', 
                                      gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', 
                                      gap: '8px', 
                                      background: 'rgba(255, 255, 255, 0.01)', 
                                      padding: '8px 10px', 
                                      borderRadius: '6px', 
                                      border: '1px solid var(--color-border)'
                                    }}>
                                      {soma.grasa_pct != null && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>% Grasa</span>
                                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.grasa_pct}%</span>
                                        </div>
                                      )}
                                      {soma.musculo_pct != null && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>% Músculo</span>
                                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.musculo_pct}%</span>
                                        </div>
                                      )}
                                      {soma.cintura_cm != null && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>Cintura</span>
                                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.cintura_cm} cm</span>
                                        </div>
                                      )}
                                      {soma.cadera_cm != null && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>Cadera</span>
                                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.cadera_cm} cm</span>
                                        </div>
                                      )}
                                      {soma.busto_cm != null && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>Busto</span>
                                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.busto_cm} cm</span>
                                        </div>
                                      )}
                                      {soma.brazo_cm != null && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.5, textTransform: 'uppercase' }}>Brazo</span>
                                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{soma.brazo_cm} cm</span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Fila 3: Intervención / Tratamiento (Opcional) */}
                                  {hasTratamiento && (
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px', 
                                      background: 'rgba(20, 184, 166, 0.08)', 
                                      padding: '6px 10px', 
                                      borderRadius: '6px', 
                                      border: '1px solid rgba(20, 184, 166, 0.2)'
                                    }}>
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase' }}>Dosis Aplicada:</span>
                                      <strong style={{ fontSize: '0.8rem', color: '#0f766e' }}>{soma.dosis_ml} ml</strong>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {loadedSoapNotes[appItem.id]?.loading ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.6 }}>
                                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span> Cargando nota SOAP...
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
                                    📝 Nota SOAP
                                  </span>
                                  {loadedSoapNotes[appItem.id]?.isSigned ? (
                                    <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 800, background: 'rgba(16, 185, 129, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                                      🔐 Firmada
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, background: 'rgba(148, 163, 184, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                                      📝 Borrador
                                    </span>
                                  )}
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.015)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.03)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.6 }}>
                                      S — Subjetivo
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                      {loadedSoapNotes[appItem.id]?.subjetivo || 'Sin registro.'}
                                    </span>
                                  </div>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid rgba(0,0,0,0.02)', paddingTop: '6px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.6 }}>
                                      O — Objetivo
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                      {loadedSoapNotes[appItem.id]?.objetivo || 'Sin registro.'}
                                    </span>
                                  </div>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid rgba(0,0,0,0.02)', paddingTop: '6px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.6 }}>
                                      A — Análisis
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                      {loadedSoapNotes[appItem.id]?.analisis || 'Sin registro.'}
                                    </span>
                                  </div>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid rgba(0,0,0,0.02)', paddingTop: '6px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', opacity: 0.6 }}>
                                      P — Plan
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                      {loadedSoapNotes[appItem.id]?.plan || 'Sin registro.'}
                                    </span>
                                  </div>
                                </div>
                              </>
                            )}
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
          background: 'rgba(15, 23, 42, 0.85)',
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

      {showHistoricalNoteModal && appointment.paciente_id && (
        <HistoricalNoteModal
          pacienteId={appointment.paciente_id}
          onClose={() => setShowHistoricalNoteModal(false)}
          onSuccess={() => {
            fetchPatientAppointments();
            fetchHistory();
          }}
        />
      )}
    </div>
  );
}
