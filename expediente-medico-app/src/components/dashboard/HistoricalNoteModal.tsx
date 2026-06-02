import { useState } from 'react';
import { supabase } from '../../services/supabase';

interface HistoricalNoteModalProps {
  pacienteId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function HistoricalNoteModal({ pacienteId, onClose, onSuccess }: HistoricalNoteModalProps) {
  const [fechaHora, setFechaHora] = useState(() => {
    const local = new Date();
    // Default to yesterday or current date minus some hours, formatted for input type datetime-local
    local.setDate(local.getDate() - 1);
    return local.toISOString().slice(0, 16);
  });
  
  const [subjetivo, setSubjetivo] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [analisis, setAnalisis] = useState('');
  const [plan, setPlan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjetivo.trim() || !objetivo.trim() || !analisis.trim() || !plan.trim() || !fechaHora) {
      alert('Todos los campos SOAP y la fecha son obligatorios.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Get current user session
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes.data.session;
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      let medicoId = '';
      let cedula = 'PENDIENTE';

      if (!session && !isMock) {
        throw new Error('No hay sesión activa.');
      }

      if (session) {
        medicoId = session.user.id;
        cedula = session.user.user_metadata?.cedula || 'PENDIENTE';
      } else if (isMock) {
        medicoId = 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';
        cedula = '12345678';
      }

      // 2. Insert consultation as COMPLETED
      const { data: newConsulta, error: consultaErr } = await supabase
        .from('consultas')
        .insert({
          medico_id: medicoId,
          paciente_id: pacienteId,
          fecha_hora: new Date(fechaHora).toISOString(),
          status: 'COMPLETED',
          motivo_consulta_cifrado: 'Nota Histórica'
        })
        .select('id')
        .single();

      if (consultaErr) throw consultaErr;

      // 3. Call sign-note Edge Function
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      
      if (!isMock) {
        const resp = await fetch(`${supabaseUrl}/functions/v1/sign-note?apikey=${supabaseAnonKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            consulta_id: newConsulta.id,
            soap_json: { subjetivo, objetivo, analisis, plan },
            somatometria_json: null, // Omitted for simplicity, could be added later
            medico_id: medicoId,
            cedula,
          }),
        });
        
        const res = await resp.json();
        if (!res.success) {
          throw new Error(res.error || 'Error al firmar nota histórica');
        }
      } else {
        // Mock success delay
        await new Promise(r => setTimeout(r, 1000));
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating historical note:', err);
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '1rem'
    }}>
      <div className="card-glass" style={{
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '2rem',
        borderRadius: '16px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--color-primary)' }}>
            📝 Agregar Nota Histórica
          </h2>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-primary)' }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.7, marginBottom: '1.5rem' }}>
          Ingresa los detalles de una consulta médica pasada. Esta nota se firmará criptográficamente con la fecha seleccionada y aparecerá en el historial clínico del paciente.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              Fecha y Hora de la Consulta Pasada
            </label>
            <input
              type="datetime-local"
              value={fechaHora}
              max={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setFechaHora(e.target.value)}
              required
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-glass)',
                color: 'var(--color-primary)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              S — Subjetivo
            </label>
            <textarea
              value={subjetivo}
              onChange={(e) => setSubjetivo(e.target.value)}
              placeholder="Síntomas referidos..."
              required
              rows={3}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-glass)',
                color: 'var(--color-primary)',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              O — Objetivo
            </label>
            <textarea
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Signos vitales, exploración física..."
              required
              rows={3}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-glass)',
                color: 'var(--color-primary)',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              A — Análisis / Diagnóstico
            </label>
            <textarea
              value={analisis}
              onChange={(e) => setAnalisis(e.target.value)}
              placeholder="Juicio clínico, diagnóstico..."
              required
              rows={2}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-glass)',
                color: 'var(--color-primary)',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              P — Plan
            </label>
            <textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Tratamiento, medicamentos..."
              required
              rows={3}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-glass)',
                color: 'var(--color-primary)',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-primary)',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                flex: 2,
                padding: '12px',
                borderRadius: '8px',
                background: isSubmitting ? 'var(--color-border)' : 'var(--color-secondary)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting ? (
                <><span style={{ animation: 'spin 1s linear infinite' }}>⏳</span> Guardando...</>
              ) : 'Guardar Nota Histórica'}
            </button>
          </div>
        </form>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}} />
      </div>
    </div>
  );
}
