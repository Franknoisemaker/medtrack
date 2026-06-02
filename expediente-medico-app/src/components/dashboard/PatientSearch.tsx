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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Reset page when query changes
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Fetch data with debounce
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchPatients();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query, page]);

  const searchPatients = async () => {
    setIsLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const doctorId = session?.user?.id;
      
      if (!doctorId) {
        console.error('No valid doctor session found.');
        return;
      }

      const pageSize = 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let supabaseQuery = supabase
        .from('pacientes')
        .select(`
          id, nombre, telefono, email, fecha_nacimiento,
          consultas!inner ( medico_id )
        `)
        .eq('consultas.medico_id', doctorId)
        .order('nombre', { ascending: true })
        .range(from, to);

      if (query.trim().length > 0) {
        supabaseQuery = supabaseQuery.ilike('nombre', `%${query.trim()}%`);
      }

      const { data: patientsData, error: patientsError } = await supabaseQuery;

      if (patientsError) throw patientsError;

      setHasMore((patientsData || []).length === pageSize);

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
      </div>

      {/* Results Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {isLoading ? (
          <div className="card-glass" style={{ padding: '2rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--color-primary)', opacity: 0.7 }}>
              Cargando pacientes...
            </span>
          </div>
        ) : results.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {results.map((p) => {
              const age = calculateAge(p.fecha_nacimiento);
              return (
                <div
                  key={p.id}
                  className="card-glass"
                  style={{
                    padding: '1rem 1.5rem',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--color-border)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
                      <h4 style={{
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        color: 'var(--color-primary)',
                        margin: 0,
                      }}>
                        {p.nombre}
                      </h4>
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
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.7 }}>
                      <span>📞 {p.telefono}</span>
                      {p.email && <span>📧 {p.email}</span>}
                      <span>• Última Consulta: {p.lastConsultaDate ? new Date(p.lastConsultaDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Ninguna'}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenRecord(p)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: 'var(--color-surface-glass)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-secondary)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface-glass)'}
                  >
                    Ver / Editar
                  </button>
                </div>
              );
            })}

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: page === 1 ? 'transparent' : 'var(--color-surface-glass)',
                  color: 'var(--color-primary)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.8 }}>
                Página {page}
              </span>
              <button
                disabled={!hasMore}
                onClick={() => setPage(p => p + 1)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: !hasMore ? 'transparent' : 'var(--color-surface-glass)',
                  color: 'var(--color-primary)',
                  cursor: !hasMore ? 'not-allowed' : 'pointer',
                  opacity: !hasMore ? 0.5 : 1,
                }}
              >
                Siguiente →
              </button>
            </div>
          </div>
        ) : (
          <div className="card-glass" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px' }}>
            <span style={{ fontSize: '1.5rem' }}>📭</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', margin: '0.5rem 0 0 0' }}>
              No se encontraron pacientes
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.6, margin: '0.25rem 0 0 0' }}>
              Intenta con otro término de búsqueda.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
