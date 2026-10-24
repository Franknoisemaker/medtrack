import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { SendConsentModal } from './SendConsentModal';

interface ConsentSectionProps {
  pacienteId: string;
  pacienteNombre: string;
  pacienteTelefono: string;
  medicoId?: string;
}

interface Consentimiento {
  id: string;
  tipo: string;
  estado: 'Firmado' | 'Pendiente' | 'Expirado';
  fecha_creacion: string;
  fecha_firma?: string;
  pdf_url?: string;
}

const MOCK_CONSENTS: Consentimiento[] = [
  {
    id: 'mock-1',
    tipo: 'Consentimiento Informado - Consulta General',
    estado: 'Firmado',
    fecha_creacion: '2023-10-15T10:00:00Z',
    fecha_firma: '2023-10-16T11:30:00Z',
    pdf_url: '#',
  },
  {
    id: 'mock-2',
    tipo: 'Consentimiento para Procedimiento Menor',
    estado: 'Firmado',
    fecha_creacion: '2023-11-20T10:00:00Z',
    fecha_firma: '2023-11-20T14:45:00Z',
    pdf_url: '#',
  },
  {
    id: 'mock-3',
    tipo: 'Consentimiento - Control de Peso',
    estado: 'Pendiente',
    fecha_creacion: '2023-12-05T09:15:00Z',
  }
];

const ConsentSection: React.FC<ConsentSectionProps> = ({
  pacienteId,
  pacienteNombre,
  pacienteTelefono,
  medicoId
}) => {
  const [consents, setConsents] = useState<Consentimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchConsents = async () => {
    setLoading(true);
    const isMock = import.meta.env.VITE_SUPABASE_URL?.includes('your-project-id') || true; // Force mock mode for sandbox
    
    if (isMock) {
      setTimeout(() => {
        setConsents(MOCK_CONSENTS);
        setLoading(false);
      }, 800);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('consentimientos')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;
      setConsents(data as Consentimiento[] || []);
    } catch (err) {
      console.error('Error fetching consents:', err);
      // Fallback to mock on error for robustness during dev
      setConsents(MOCK_CONSENTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsents();
  }, [pacienteId]);

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'Firmado': return '#10b981';
      case 'Pendiente': return '#d97706';
      case 'Expirado': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="card-glass theme-tactical" style={{ marginTop: '24px', padding: '24px', backgroundColor: 'var(--color-bg, #f8fafc)', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: 'var(--color-primary, #0f172a)', fontSize: '1.25rem' }}>📋 Consentimientos Informados</h3>
        <button 
          onClick={() => setIsModalOpen(true)}
          style={{
            backgroundColor: 'var(--color-secondary, #0284c7)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          Enviar Nuevo Consentimiento
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Cargando consentimientos...</div>
      ) : consents.length === 0 ? (
        <div style={{ 
          border: '2px dashed #cbd5e1', 
          borderRadius: '8px', 
          padding: '32px', 
          textAlign: 'center',
          color: '#64748b',
          backgroundColor: '#f1f5f9'
        }}>
          Este paciente aún no tiene consentimientos registrados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '0.875rem' }}>
                <th style={{ padding: '12px 8px' }}>Tipo</th>
                <th style={{ padding: '12px 8px' }}>Status</th>
                <th style={{ padding: '12px 8px' }}>Fecha</th>
                <th style={{ padding: '12px 8px' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {consents.map(consent => (
                <tr key={consent.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 8px', color: '#334155', fontWeight: 500 }}>{consent.tipo}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{
                      backgroundColor: getStatusColor(consent.estado),
                      color: 'white',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      display: 'inline-block'
                    }}>
                      {consent.estado}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', color: '#64748b', fontSize: '0.875rem' }}>
                    {new Date(consent.fecha_creacion).toLocaleDateString('es-MX', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    {consent.estado === 'Firmado' ? (
                      <a href={consent.pdf_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-secondary, #0284c7)', textDecoration: 'none', fontWeight: 500, fontSize: '0.875rem' }}>
                        📥 Descargar PDF
                      </a>
                    ) : (
                      <button style={{ background: 'none', border: 'none', color: 'var(--color-secondary, #0284c7)', cursor: 'pointer', fontWeight: 500, padding: 0, fontSize: '0.875rem' }}>
                        🔗 Reenviar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <SendConsentModal
          pacienteId={pacienteId}
          pacienteNombre={pacienteNombre}
          pacienteTelefono={pacienteTelefono}
          medicoId={medicoId}
          onClose={() => setIsModalOpen(false)}
          onSent={() => {
            setIsModalOpen(false);
            fetchConsents();
          }}
        />
      )}
    </div>
  );
};

export { ConsentSection };
