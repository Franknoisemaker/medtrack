import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import type { Appointment } from './NewAppointmentForm';

interface PatientSearchProps {
  onSelectPatientRecord: (appointment: Appointment) => void;
}

interface PatientResult {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  fecha_nacimiento: string;
  lastConsultaId: string | null;
  lastConsultaDate: string | null;
}

export function PatientSearch({ onSelectPatientRecord }: PatientSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (query.trim().length >= 2) {
        searchPatients();
      } else if (query.trim().length === 0) {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const searchPatients = async () => {
    setIsLoading(true);
    try {
      const { data: patientsData, error: patientsError } = await supabase
        .from('pacientes')
        .select('id, nombre, telefono, email, fecha_nacimiento')
        .ilike('nombre', `%${query.trim()}%`)
        .limit(15);

      if (patientsError) throw patientsError;

      const formatted: PatientResult[] = await Promise.all(
        (patientsData || []).map(async (p) => {
          // Prioritize fetching the most recent past/present consultation (lte now)
          let { data: lastApp } = await supabase
            .from('consultas')
            .select('id, fecha_hora')
            .eq('paciente_id', p.id)
            .lte('fecha_hora', new Date().toISOString())
            .order('fecha_hora', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Fallback to the nearest upcoming future consultation if no past ones exist
          if (!lastApp) {
            const { data: upcomingApp } = await supabase
              .from('consultas')
              .select('id, fecha_hora')
              .eq('paciente_id', p.id)
              .gt('fecha_hora', new Date().toISOString())
              .order('fecha_hora', { ascending: true })
              .limit(1)
              .maybeSingle();
            
            lastApp = upcomingApp;
          }

          return {
            id: p.id,
            nombre: p.nombre,
            telefono: p.telefono,
            email: p.email || '',
            fecha_nacimiento: p.fecha_nacimiento,
            lastConsultaId: lastApp?.id || null,
            lastConsultaDate: lastApp?.fecha_hora || null,
          };
        })
      );

      setResults(formatted);
    } catch (err) {
      console.error('Error searching patients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAge = (birthdateStr: string): number => {
    if (!birthdateStr || birthdateStr === '1970-01-01') return 0;
    const today = new Date();
    const birthDate = new Date(birthdateStr);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleOpenRecord = (p: PatientResult) => {
    // We package the patient and their last consultation ID as an Appointment object
    // to seamlessly reuse PatientRecord.tsx in full read-only mode.
    const mockApp: Appointment = {
      id: p.lastConsultaId || '00000000-0000-0000-0000-000000000000', // fallback if no consultations yet
      paciente_id: p.id,
      nombre: p.nombre,
      telefono: p.telefono,
      email: p.email,
      fecha_hora: p.lastConsultaDate || new Date().toISOString(),
      status: 'COMPLETED', // forces read-only
    };
    onSelectPatientRecord(mockApp);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Search Input Card */}
      <div className="card-glass" style={{ padding: '2rem', borderRadius: '12px' }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--color-primary)',
          marginBottom: '1rem',
          letterSpacing: '-0.02em',
        }}>
          Directorio Clínico de Pacientes
        </h3>
        
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Buscar por nombre completo o CURP..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.85rem 1rem 0.85rem 2.5rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-primary)',
              fontSize: '0.95rem',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '1.1rem',
            opacity: 0.5,
          }}>
            🔍
          </span>
        </div>
        
        {query.trim().length > 0 && query.trim().length < 2 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.6, marginTop: '0.5rem' }}>
            Escribe al menos 2 letras para buscar...
          </p>
        )}
      </div>

      {/* Results Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {isLoading ? (
          <div className="card-glass" style={{ padding: '2rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--color-primary)', opacity: 0.7 }}>
              Buscando coincidencias clínicas...
            </span>
          </div>
        ) : results.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {results.map((p) => {
              const age = calculateAge(p.fecha_nacimiento);
              return (
                <div
                  key={p.id}
                  className="card-glass"
                  style={{
                    padding: '1.5rem',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1px solid var(--color-border)',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleOpenRecord(p)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'var(--color-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                  }}
                >
                  <div>
                    <h4 style={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: 'var(--color-primary)',
                      margin: '0 0 0.5rem 0',
                    }}>
                      {p.nombre}
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: 'var(--color-secondary)',
                        fontWeight: 600,
                      }}>
                        {age > 0 ? `${age} años` : 'Falta Onboarding'}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'rgba(0, 0, 0, 0.05)',
                        color: 'var(--color-primary)',
                        opacity: 0.7,
                      }}>
                        📞 {p.telefono}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: '0.75rem',
                    marginTop: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.6 }}>
                      Última Consulta: {p.lastConsultaDate ? new Date(p.lastConsultaDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Ninguna'}
                    </span>
                    <span style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--color-secondary)',
                    }}>
                      Ver Expediente →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : query.trim().length >= 2 ? (
          <div className="card-glass" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px' }}>
            <span style={{ fontSize: '1.5rem' }}>📭</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', margin: '0.5rem 0 0 0' }}>
              No se encontraron pacientes
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.6, margin: '0.25rem 0 0 0' }}>
              Verifica el nombre completo o CURP e intenta de nuevo.
            </p>
          </div>
        ) : (
          <div className="card-glass" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px', opacity: 0.8 }}>
            <span style={{ fontSize: '1.5rem', opacity: 0.6 }}>🔎</span>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-primary)', opacity: 0.7, margin: '0.5rem 0 0 0' }}>
              Utiliza la barra superior para buscar pacientes y auditar expedientes históricos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
