import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

export interface Appointment {
  id: string;
  nombre: string;
  telefono: string;
  email?: string;
  fecha_hora: string;
  status: 'PENDING_ONBOARDING' | 'ACTIVE' | 'COMPLETED';
  paciente_id?: string;
}

interface NewAppointmentFormProps {
  onAppointmentCreated: (appointment: Appointment) => void;
  initialPaciente?: { id: string; nombre: string; telefono: string; email?: string };
  onClose?: () => void;
}

export function NewAppointmentForm({ onAppointmentCreated, initialPaciente, onClose }: NewAppointmentFormProps) {
  // Form fields
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [fechaHora, setFechaHora] = useState('');

  // Searchable Patient Dropdown states
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [omitirOnboarding, setOmitirOnboarding] = useState(false);

  // Recurrence states
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [recurrenciaFrecuencia, setRecurrenciaFrecuencia] = useState<'days' | 'weeks' | 'months'>('weeks');
  const [recurrenciaIntervalo, setRecurrenciaIntervalo] = useState<number>(1);
  const [recurrenciaOcurrencias, setRecurrenciaOcurrencias] = useState<number>(3);
  const [createdAppointments, setCreatedAppointments] = useState<any[]>([]);

  // Pre-populate if initialPaciente is provided (e.g. scheduling a follow-up directly)
  useEffect(() => {
    if (initialPaciente) {
      setNombre(initialPaciente.nombre);
      setTelefono(initialPaciente.telefono);
      setEmail(initialPaciente.email || '');
      setSelectedPacienteId(initialPaciente.id);
      setOmitirOnboarding(true); // Default to skip onboarding since the patient profile exists
    }
  }, [initialPaciente]);

  // High fidelity mock patients database for offline local dev sandbox
  const MOCK_PATIENTS = [
    { id: 'b2b12a8a-e55d-4f11-8ac1-f11181283c45', nombre: 'Elena Ruiz Mendoza', telefono: '5543210987', email: 'elena.ruiz@gmail.com' },
    { id: 'c3b12a8a-e55d-4f11-8ac1-f11181283c46', nombre: 'Carlos Slim Helú', telefono: '5555555555', email: 'carlos@slim.com' },
    { id: 'd4b12a8a-e55d-4f11-8ac1-f11181283c47', nombre: 'Ana Guevara Valenzuela', telefono: '5577665544', email: 'ana.guevara@conade.gob.mx' }
  ];

  // Status and feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [successData, setSuccessData] = useState<{ token: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Validate form inline
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!nombre.trim()) {
      newErrors.nombre = 'El nombre del paciente es requerido.';
    }

    // MX Phone Validation: 10 digits
    const cleanPhone = telefono.replace(/\s+/g, '').replace(/^[+-]/, '');
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (!telefono) {
      newErrors.telefono = 'El teléfono es requerido.';
    } else if (phoneDigits.length < 10) {
      newErrors.telefono = 'El teléfono debe tener al menos 10 dígitos (Formato MX).';
    }

    // Email (optional but must be valid if entered)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'El formato de correo electrónico no es válido.';
    }

    // Future date validation
    if (!fechaHora) {
      newErrors.fecha_hora = 'La fecha y hora de la cita son requeridas.';
    } else {
      const selectedDate = new Date(fechaHora);
      const now = new Date();
      if (selectedDate <= now) {
        newErrors.fecha_hora = 'La fecha de la cita debe estar en el futuro.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNombreChange = async (val: string) => {
    setNombre(val);
    setSelectedPacienteId(null); // Reset selection on new typing
    setOmitirOnboarding(false); // Reset onboarding skip
    
    const query = val.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      if (isMock) {
        // High fidelity mock filter
        const filtered = MOCK_PATIENTS.filter(p => 
          p.nombre.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(filtered);
        setShowDropdown(filtered.length > 0);
      } else {
        const session = (await supabase.auth.getSession()).data.session;
        const doctorId = session?.user?.id;
        
        if (!doctorId) return;

        // Real-time Supabase patient query restricted by doctor ownership
        const { data, error } = await supabase
          .from('pacientes')
          .select(`
            id, nombre, telefono, email,
            consultas!inner ( medico_id )
          `)
          .eq('consultas.medico_id', doctorId)
          .ilike('nombre', `%${query}%`)
          .limit(5);

        if (!error && data) {
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        } else {
          setSearchResults([]);
          setShowDropdown(false);
        }
      }
    } catch (err) {
      console.error('Error searching patients:', err);
      setSearchResults([]);
      setShowDropdown(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPaciente = (paciente: any) => {
    setNombre(paciente.nombre);
    setTelefono(paciente.telefono);
    setEmail(paciente.email || '');
    setSelectedPacienteId(paciente.id);
    setOmitirOnboarding(true); // Default to skip onboarding for returning patients
    setSearchResults([]);
    setShowDropdown(false);
  };

  const calculateRecurrentDates = (startDateStr: string, freq: 'days' | 'weeks' | 'months', interval: number, count: number): string[] => {
    const dates: string[] = [startDateStr];
    
    for (let i = 1; i < count; i++) {
      const date = new Date(startDateStr);
      if (freq === 'days') {
        date.setDate(date.getDate() + (i * interval));
      } else if (freq === 'weeks') {
        date.setDate(date.getDate() + (i * interval * 7));
      } else if (freq === 'months') {
        date.setMonth(date.getMonth() + (i * interval));
      }
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      dates.push(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
    return dates;
  };

  const getRecurrenceSummary = () => {
    if (!fechaHora) return '';
    try {
      const dates = calculateRecurrentDates(fechaHora, recurrenciaFrecuencia, recurrenciaIntervalo, recurrenciaOcurrencias);
      const formatted = dates.map(d => {
        const date = new Date(d);
        return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      });
      return `Se programarán ${dates.length} citas: ${formatted.join(', ')}.`;
    } catch (e) {
      return '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      // Determine date ranges to schedule
      const datesToSchedule = esRecurrente 
        ? calculateRecurrentDates(fechaHora, recurrenciaFrecuencia, recurrenciaIntervalo, recurrenciaOcurrencias)
        : [fechaHora];

      const listCreated: any[] = [];
      let lastResponseData: any = null;

      for (const currentFecha of datesToSchedule) {
        let responseData;
        if (isMock) {
          await new Promise((resolve) => setTimeout(resolve, 600)); // Smooth network simulation
          responseData = {
            success: true,
            data: {
              token: omitirOnboarding ? null : `mock_jwt_${crypto.randomUUID()}`,
              url: omitirOnboarding ? null : `https://medtrack.mx/onboarding?token=${crypto.randomUUID()}`,
              status: omitirOnboarding ? 'ACTIVE' : 'PENDING_ONBOARDING'
            },
          };
        } else {
          const session = (await supabase.auth.getSession()).data.session;
          const isMock = supabaseUrl.includes('your-project-id');

          if (!session && !isMock) {
            throw new Error('Sesión de médico no válida o expirada. Por favor, inicia sesión.');
          }

          const sessionToken = session?.access_token || (isMock ? 'mock-doctor-session-token' : '');

          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
          const response = await fetch(`${supabaseUrl}/functions/v1/create-appointment?apikey=${supabaseAnonKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionToken}`,
              'apikey': supabaseAnonKey,
            },
            body: JSON.stringify({
              nombre,
              telefono,
              email: email || undefined,
              fecha_hora: new Date(currentFecha).toISOString(),
              paciente_id: selectedPacienteId || undefined,
              omitir_onboarding: omitirOnboarding,
            }),
          });

          if (!response.ok) {
            throw new Error('Server returned an error');
          }

          responseData = await response.json();
        }

        if (responseData.success) {
          lastResponseData = responseData;
          listCreated.push({
            fecha_hora: currentFecha,
            status: responseData.data.status || (omitirOnboarding ? 'ACTIVE' : 'PENDING_ONBOARDING')
          });

          // Propagate this specific appointment to the doctor's Kanban board
          onAppointmentCreated({
            id: crypto.randomUUID(),
            nombre,
            telefono,
            email: email || undefined,
            fecha_hora: currentFecha,
            status: responseData.data.status || (omitirOnboarding ? 'ACTIVE' : 'PENDING_ONBOARDING'),
            paciente_id: selectedPacienteId || undefined,
          });
        } else {
          throw new Error(responseData.error || 'Request failed');
        }
      }

      setCreatedAppointments(listCreated);

      if (lastResponseData) {
        let dynamicUrl = lastResponseData.data.url ? lastResponseData.data.url.replace('https://medtrack.mx', window.location.origin) : null;
        if (dynamicUrl && dynamicUrl.includes('localhost') && dynamicUrl.startsWith('https://')) {
          dynamicUrl = dynamicUrl.replace('https://', 'http://');
        }
        setSuccessData({
          token: lastResponseData.data.token,
          url: dynamicUrl,
          status: lastResponseData.data.status || (omitirOnboarding ? 'ACTIVE' : 'PENDING_ONBOARDING')
        } as any);
      }
    } catch (err) {
      console.error(err);
      setErrors({ api: 'No se pudo crear la(s) cita(s). Intenta de nuevo.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!successData) return;
    navigator.clipboard.writeText(successData.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setNombre('');
    setTelefono('');
    setEmail('');
    setFechaHora('');
    setSelectedPacienteId(null);
    setSuccessData(null);
    setErrors({});
    setEsRecurrente(false);
    setRecurrenciaFrecuencia('weeks');
    setRecurrenciaIntervalo(1);
    setRecurrenciaOcurrencias(3);
    setCreatedAppointments([]);
  };

  // WhatsApp link message generator
  const getWhatsAppLink = () => {
    if (!successData) return '';
    const cleanPhone = telefono.replace(/\D/g, '');
    // Strip leading 52 if present (wa.me accepts standard format)
    const formattedPhone = cleanPhone.length === 10 ? `52${cleanPhone}` : cleanPhone;
    
    const message = `Hola *${nombre}*, para tu próxima consulta médica en MedTrack, por favor completa tu expediente clínico digital en el siguiente enlace seguro (válido por 24 horas): ${successData.url}`;
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  };

  if (isLoading) {
    return (
      <div className="card-glass" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'pulse 1.5s infinite ease-in-out' }}>
        <h3 style={{ height: '24px', width: '60%', background: 'var(--color-border)', borderRadius: '4px' }}></h3>
        <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ height: '36px', background: 'var(--color-border)', borderRadius: 'var(--radius-base)' }}></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ height: '36px', background: 'var(--color-border)', borderRadius: 'var(--radius-base)' }}></div>
            <div style={{ height: '36px', background: 'var(--color-border)', borderRadius: 'var(--radius-base)' }}></div>
          </div>
          <div style={{ height: '36px', background: 'var(--color-border)', borderRadius: 'var(--radius-base)' }}></div>
          <div style={{ height: '42px', background: 'var(--color-border)', borderRadius: 'var(--radius-base)', marginTop: '0.5rem' }}></div>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 0.9; }
            100% { opacity: 0.6; }
          }
        `}} />
      </div>
    );
  }

  if (successData) {
    const isSeguimiento = (successData as any).status === 'ACTIVE' || !successData.url;

    return (
      <div className="card-glass" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center', transition: 'all 0.3s ease' }}>
        <div style={{ fontSize: '3rem', margin: '0 auto' }}>
          {esRecurrente ? '🔁' : isSeguimiento ? '🏥' : '🎉'}
        </div>
        <h2 style={{ fontSize: '1.5rem', color: 'var(--color-success, #10b981)' }}>
          {esRecurrente 
            ? '¡Citas Recurrentes Programadas!' 
            : isSeguimiento 
              ? '¡Cita de Seguimiento Programada!' 
              : '¡Cita Agendada Exitosamente!'}
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-primary)', opacity: 0.8 }}>
          {esRecurrente
            ? `Se han creado con éxito ${createdAppointments.length} consultas recurrentes para ${nombre}.`
            : isSeguimiento 
              ? `La consulta de control para ${nombre} ha sido agendada e iniciada directamente en estado activo. Ya puedes abrir su expediente.`
              : 'Se ha creado un enlace mágico de expediente clínico digital de un solo uso. Expira en 24 horas.'}
        </p>

        {esRecurrente ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '180px',
            overflowY: 'auto',
            padding: '12px',
            background: 'var(--color-surface)',
            borderRadius: '8px',
            border: '1px solid var(--color-border)'
          }}>
            {createdAppointments.map((app, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--color-surface-glass)',
                borderRadius: '6px',
                fontSize: '0.85rem',
                borderLeft: `3px solid ${app.status === 'ACTIVE' ? '#10b981' : '#3b82f6'}`,
                borderTop: '1px solid var(--color-border)',
                borderRight: '1px solid var(--color-border)',
                borderBottom: '1px solid var(--color-border)',
                gap: '8px'
              }}>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>#{idx + 1}</span>
                <span style={{ color: 'var(--color-primary)', opacity: 0.8, fontSize: '0.78rem', flex: 1, textAlign: 'left', fontWeight: 500 }}>
                  {new Date(app.fecha_hora).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => {
                    onAppointmentCreated({
                      id: crypto.randomUUID(),
                      nombre,
                      telefono,
                      email: email || undefined,
                      fecha_hora: app.fecha_hora,
                      status: app.status
                    });
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-secondary)',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    opacity: 0.9,
                    transition: 'opacity 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseOut={(e) => (e.currentTarget.style.opacity = '0.9')}
                >
                  📅 Ver Día
                </button>
              </div>
            ))}
          </div>
        ) : !isSeguimiento && (
          <>
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '8px', border: '1px dashed var(--color-border)', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {successData.url}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={handleCopyLink}
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-base)',
                  background: copied ? 'var(--color-success, #10b981)' : 'var(--color-primary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.2s ease'
                }}
              >
                {copied ? '¡Copiado! 📋' : 'Copiar enlace 🔗'}
              </button>

              <a
                href={getWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-base)',
                  background: '#25D366',
                  color: '#ffffff',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  textDecoration: 'none',
                  transition: 'background 0.2s ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#20ba5a')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#25D366')}
              >
                Compartir por WhatsApp 💬
              </a>
            </div>
          </>
        )}

        <button
          onClick={handleReset}
          style={{
            padding: '10px',
            borderRadius: 'var(--radius-base)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-primary)',
            fontWeight: 500,
            fontSize: '0.9rem',
            marginTop: '0.5rem',
            transition: 'background 0.2s ease'
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {esRecurrente ? 'Agendar Otro Esquema Recurrente' : isSeguimiento ? 'Agendar Otra Consulta de Control' : 'Agendar Otra Cita'}
        </button>
      </div>
    );
  }

  return (
    <div className="card-glass" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          📅 {initialPaciente ? 'Agendar Seguimiento / Control' : 'Agendar Nueva Cita'}
        </h2>
        {onClose && (
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-primary)',
              opacity: 0.6,
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '4px 8px',
              borderRadius: '50%',
              transition: 'opacity 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '0.6')}
          >
            ✕
          </button>
        )}
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0 0 0.25rem 0' }} />

      {errors.api && (
        <div style={{
          padding: '10px',
          borderRadius: '4px',
          background: 'var(--color-error-bg, rgba(239, 68, 68, 0.1))',
          border: '1px solid var(--color-error, #ef4444)',
          color: 'var(--color-error, #ef4444)',
          fontSize: '0.85rem',
          textAlign: 'center'
        }}>
          ⚠️ {errors.api}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Nombre con Searchable Dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Nombre del Paciente *</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={nombre}
              onChange={(e) => handleNombreChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              onBlur={() => {
                setTimeout(() => setShowDropdown(false), 250);
              }}
              placeholder="ej. Elena Ruiz Mendoza"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-base)',
                border: `1px solid ${errors.nombre ? 'var(--color-error, #ef4444)' : 'var(--color-border)'}`,
                background: 'var(--color-surface-glass)',
                fontSize: '0.95rem',
                outline: 'none',
                paddingRight: '35px'
              }}
            />
            {selectedPacienteId && (
              <span 
                style={{ 
                  position: 'absolute', 
                  right: '12px', 
                  fontSize: '0.9rem', 
                  color: '#10b981',
                  cursor: 'default',
                  userSelect: 'none'
                }}
                title="Paciente existente autocompletado"
              >
                👤✓
              </span>
            )}
            {isSearching && (
              <span 
                style={{ 
                  position: 'absolute', 
                  right: '12px', 
                  fontSize: '0.8rem', 
                  color: 'var(--color-primary)', 
                  opacity: 0.5,
                  animation: 'spin 1.5s infinite linear' 
                }}
              >
                🔄
              </span>
            )}
          </div>
          {errors.nombre && <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '0.75rem' }}>{errors.nombre}</span>}

          {/* Sugerencias desplegables */}
          {showDropdown && searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              marginTop: '4px',
              background: '#1e293b',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {searchResults.map((paciente) => (
                <div
                  key={paciente.id}
                  onClick={() => handleSelectPaciente(paciente)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                    transition: 'background 0.2s ease',
                    textAlign: 'left'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>
                    {paciente.nombre}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    📞 {paciente.telefono} {paciente.email ? `| 📧 ${paciente.email}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Toggle para Omitir Onboarding (Disponible para Nuevos y Existentes) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderRadius: '8px',
          background: omitirOnboarding
            ? (selectedPacienteId ? 'rgba(16, 185, 129, 0.08)' : 'rgba(14, 165, 233, 0.08)')
            : 'rgba(71, 85, 105, 0.08)',
          border: `1px solid ${
            omitirOnboarding
              ? (selectedPacienteId ? 'rgba(16, 185, 129, 0.25)' : 'rgba(14, 165, 233, 0.25)')
              : 'rgba(71, 85, 105, 0.15)'
          }`,
          marginTop: '0.25rem',
          marginBottom: '0.75rem',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left', maxWidth: '80%' }}>
            <span style={{ 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              color: omitirOnboarding
                ? (selectedPacienteId ? '#10b981' : '#0ea5e9')
                : 'var(--color-primary)', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px' 
            }}>
              {selectedPacienteId ? '🔄 Cita de Seguimiento' : '📋 Consulta Directa'}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', opacity: 0.65, lineHeight: 1.3 }}>
              {selectedPacienteId 
                ? 'Se omitirá el formulario de onboarding móvil. La cita se creará lista para consulta inmediata.'
                : 'No se enviará link de registro al celular. La cita se creará activa y capturarás la ficha clínica en consultorio.'}
            </span>
          </div>
          <label className="switch" style={{
            position: 'relative',
            display: 'inline-block',
            width: '44px',
            height: '24px',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={omitirOnboarding}
              onChange={(e) => setOmitirOnboarding(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: omitirOnboarding 
                ? (selectedPacienteId ? '#10b981' : '#0ea5e9')
                : '#475569',
              transition: '0.3s',
              borderRadius: '24px'
            }}>
              <span style={{
                position: 'absolute',
                content: '""',
                height: '18px',
                width: '18px',
                left: '3px',
                bottom: '3px',
                backgroundColor: 'white',
                transition: '0.3s',
                borderRadius: '50%',
                transform: omitirOnboarding ? 'translateX(20px)' : 'translateX(0)'
              }} />
            </span>
          </label>
        </div>

        {/* Telefono */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Teléfono Celular *</label>
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="ej. 5512345678 (10 dígitos)"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-base)',
              border: `1px solid ${errors.telefono ? 'var(--color-error, #ef4444)' : 'var(--color-border)'}`,
              background: 'var(--color-surface-glass)',
              fontSize: '0.95rem',
              outline: 'none'
            }}
          />
          {errors.telefono && <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '0.75rem' }}>{errors.telefono}</span>}
        </div>

        {/* Email */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Correo Electrónico (Opcional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ej. paciente@correo.com"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-base)',
              border: `1px solid ${errors.email ? 'var(--color-error, #ef4444)' : 'var(--color-border)'}`,
              background: 'var(--color-surface-glass)',
              fontSize: '0.95rem',
              outline: 'none'
            }}
          />
          {errors.email && <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '0.75rem' }}>{errors.email}</span>}
        </div>

        {/* Fecha y Hora */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Fecha y Hora de la Cita *</label>
          <input
            type="datetime-local"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-base)',
              border: `1px solid ${errors.fecha_hora ? 'var(--color-error, #ef4444)' : 'var(--color-border)'}`,
              background: 'var(--color-surface-glass)',
              fontSize: '0.95rem',
              outline: 'none',
              color: 'var(--color-primary)'
            }}
          />
          {errors.fecha_hora && <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '0.75rem' }}>{errors.fecha_hora}</span>}
        </div>

        {/* Citas Recurrentes */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '12px 14px',
          borderRadius: '8px',
          background: esRecurrente ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
          border: `1px solid ${esRecurrente ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-border)'}`,
          transition: 'all 0.3s ease',
          textAlign: 'left'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }} onClick={() => setEsRecurrente(!esRecurrente)}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: esRecurrente ? 'var(--color-secondary)' : 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔁 ¿Programar Citas Recurrentes?
            </span>
            <label className="switch" style={{
              position: 'relative',
              display: 'inline-block',
              width: '40px',
              height: '20px',
              cursor: 'pointer',
              pointerEvents: 'none' // Handled by outer click
            }}>
              <input
                type="checkbox"
                checked={esRecurrente}
                readOnly
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: esRecurrente ? 'var(--color-secondary)' : '#475569',
                transition: '0.3s',
                borderRadius: '20px'
              }}>
                <span style={{
                  position: 'absolute',
                  content: '""',
                  height: '14px',
                  width: '14px',
                  left: '3px',
                  bottom: '3px',
                  backgroundColor: 'white',
                  transition: '0.3s',
                  borderRadius: '50%',
                  transform: esRecurrente ? 'translateX(20px)' : 'translateX(0)'
                }} />
              </span>
            </label>
          </div>

          {esRecurrente && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem',
              marginTop: '0.5rem',
              paddingTop: '0.5rem',
              borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
              animation: 'fadeIn 0.25s ease-out'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                {/* Intervalo y Frecuencia */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)', opacity: 0.7 }}>Repetir cada</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={recurrenciaIntervalo}
                      onChange={(e) => setRecurrenciaIntervalo(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        width: '55px',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-glass)',
                        color: 'var(--color-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                        textAlign: 'center'
                      }}
                    />
                    <select
                      value={recurrenciaFrecuencia}
                      onChange={(e) => setRecurrenciaFrecuencia(e.target.value as any)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface-glass)',
                        color: 'var(--color-primary)',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    >
                      <option value="days" style={{ color: 'var(--color-primary)', background: 'var(--color-surface)' }}>Día(s)</option>
                      <option value="weeks" style={{ color: 'var(--color-primary)', background: 'var(--color-surface)' }}>Semana(s)</option>
                      <option value="months" style={{ color: 'var(--color-primary)', background: 'var(--color-surface)' }}>Mes(es)</option>
                    </select>
                  </div>
                </div>

                {/* Total Ocurrencias */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)', opacity: 0.7 }}>Total de Consultas</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={recurrenciaOcurrencias || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setRecurrenciaOcurrencias(val ? parseInt(val) : '' as any);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-glass)',
                      color: 'var(--color-primary)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      textAlign: 'center'
                    }}
                  />
                </div>
              </div>

              {/* Vista predictiva dinámica de fechas */}
              {fechaHora && (
                <div style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: '0.75rem',
                  color: 'var(--color-secondary)',
                  fontWeight: 600,
                  lineHeight: 1.35
                }}>
                  ℹ️ {getRecurrenceSummary()}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          style={{
            marginTop: '0.75rem',
            padding: '12px',
            borderRadius: 'var(--radius-base)',
            background: 'var(--color-secondary)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.95rem',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.2s ease'
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          Guardar Cita 💾
        </button>
      </form>
    </div>
  );
}
