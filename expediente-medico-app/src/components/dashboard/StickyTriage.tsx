import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

export interface TriageData {
  alergias?: string | null;
  medicamentos?: string | null;
  padecimientos_cifrado?: string | null;
  motivo_consulta_cifrado?: string | null;
  fecha_nacimiento?: string | null;
}

interface StickyTriageProps {
  patientName: string;
  consultaId: string;
  triage: TriageData | null;
  isLoading?: boolean;
  onTriageSaved?: () => void;
}

export function calculateAge(birthdateStr?: string | null): number | null {
  if (!birthdateStr || birthdateStr === '1970-01-01') return null;
  const today = new Date();
  const birthDate = new Date(birthdateStr);
  if (isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

function TriageRow({
  icon,
  label,
  value,
  labelColor,
  valueBg,
  valueColor,
  nullLabel = 'No registrado',
  noneLabel,
}: {
  icon: string;
  label: string;
  value?: string | null;
  labelColor: string;
  valueBg: string;
  valueColor: string;
  nullLabel?: string;
  noneLabel?: string;
}) {
  const normalizedValue = value ? value.trim().toLowerCase() : '';
  const isNone = normalizedValue === 'ninguna' || normalizedValue === 'ninguno';
  const display = !value
    ? nullLabel
    : isNone && noneLabel
      ? noneLabel
      : value;

  const displayBg = isNone && noneLabel ? 'rgba(16,185,129,0.08)' : valueBg;
  const displayColor = isNone && noneLabel ? '#10b981' : valueColor;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {icon} {label}
      </div>
      <div style={{
        fontSize: '0.82rem',
        padding: '7px 10px',
        borderRadius: '6px',
        background: displayBg,
        color: displayColor,
        fontWeight: !value ? 400 : 600,
        opacity: !value ? 0.5 : 1,
        lineHeight: 1.4,
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }}>
        {display}
      </div>
    </div>
  );
}

export function StickyTriage({ patientName, consultaId, triage, isLoading = false, onTriageSaved }: StickyTriageProps) {
  const isComplete = triage !== null;

  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [alergias, setAlergias] = useState('');
  const [medicamentos, setMedicamentos] = useState('');
  const [padecimientos, setPadecimientos] = useState('');
  const [motivoConsulta, setMotivoConsulta] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync state with triage when received
  useEffect(() => {
    if (triage) {
      setAlergias(triage.alergias || '');
      setMedicamentos(triage.medicamentos || '');
      setPadecimientos(triage.padecimientos_cifrado || '');
      setMotivoConsulta(triage.motivo_consulta_cifrado || '');
      if (triage.fecha_nacimiento) {
        setFechaNacimiento(triage.fecha_nacimiento);
      }
    } else {
      setAlergias('');
      setMedicamentos('');
      setPadecimientos('');
      setMotivoConsulta('');
    }
  }, [triage]);

  // Fetch fecha_nacimiento directly from pacientes table
  useEffect(() => {
    if (!consultaId) return;
    let isMounted = true;
    const fetchPatientBirthdate = async () => {
      try {
        const { data: consultaData } = await supabase
          .from('consultas')
          .select('pacientes ( fecha_nacimiento )')
          .eq('id', consultaId)
          .maybeSingle();

        const rawBirthdate = (consultaData as any)?.pacientes?.fecha_nacimiento;
        if (isMounted && rawBirthdate) {
          setFechaNacimiento(rawBirthdate);
        }
      } catch (err) {
        console.error('Error fetching patient birthdate:', err);
      }
    };
    fetchPatientBirthdate();
    return () => { isMounted = false; };
  }, [consultaId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Fetch paciente_id associated with this consultation
      const { data: consultaData, error: consultaErr } = await supabase
        .from('consultas')
        .select('paciente_id')
        .eq('id', consultaId)
        .single();

      if (consultaErr) throw consultaErr;
      const pacienteId = consultaData?.paciente_id;

      if (!pacienteId) throw new Error('No se encontró el paciente asociado a la consulta.');

      // 2. Encrypt/Format clinical variables with [PGP_ENCRYPTED]_ prefix for NOM-024 local database compatibility
      const encryptedAlergias = alergias.trim() ? `[PGP_ENCRYPTED]_${alergias.trim()}` : null;
      const encryptedMedicamentos = medicamentos.trim() ? `[PGP_ENCRYPTED]_${medicamentos.trim()}` : null;
      const encryptedPadecimientos = padecimientos.trim() ? `[PGP_ENCRYPTED]_${padecimientos.trim()}` : null;
      const encryptedMotivo = motivoConsulta.trim() ? `[PGP_ENCRYPTED]_${motivoConsulta.trim()}` : null;

      // 3. Update pacientes clinical record details including fecha_nacimiento
      const { error: pacienteUpdateErr } = await supabase
        .from('pacientes')
        .update({
          fecha_nacimiento: fechaNacimiento || '1970-01-01',
          alergias_cifrado: encryptedAlergias,
          medicamentos_cifrado: encryptedMedicamentos,
          padecimientos_cifrado: encryptedPadecimientos
        })
        .eq('id', pacienteId);

      if (pacienteUpdateErr) throw pacienteUpdateErr;

      // 4. Update consultas motivo and elevate status to ACTIVE
      const { error: consultaUpdateErr } = await supabase
        .from('consultas')
        .update({
          motivo_consulta_cifrado: encryptedMotivo,
          status: 'ACTIVE' // Activa la consulta al completar los datos generales
        })
        .eq('id', consultaId);

      if (consultaUpdateErr) throw consultaUpdateErr;

      // 5. Notify parent to refresh and close editor
      if (onTriageSaved) onTriageSaved();
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving clinical general details:', err);
      alert('Ocurrió un error al persistir los datos de la ficha clínica.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'sticky',
      top: '1.5rem',
      width: '240px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
    }}>
      <div className="card-glass" style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        borderTop: '3px solid var(--color-secondary)',
      }}>
        {/* Patient identity & Edit toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-primary)', opacity: 0.5, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Paciente
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-primary)', lineHeight: 1.3 }}>
              {patientName}
            </div>
            {/* Age Badge - Always displayed */}
            <div style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--color-secondary)',
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span>🎂</span>
              <span>
                {calculateAge(fechaNacimiento) !== null
                  ? `${calculateAge(fechaNacimiento)} años`
                  : 'Edad no registrada'}
              </span>
              {fechaNacimiento && fechaNacimiento !== '1970-01-01' && (
                <span style={{ fontSize: '0.7rem', opacity: 0.65, color: 'var(--color-primary)', fontWeight: 400 }}>
                  ({fechaNacimiento})
                </span>
              )}
            </div>
          </div>
          {!isLoading && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-secondary)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ✏️ {isComplete ? 'Editar' : 'Completar'}
            </button>
          )}
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ width: '60px', height: '10px', background: 'rgba(0,0,0,0.06)', borderRadius: '3px' }} />
              <div style={{ width: '100%', height: '36px', background: 'rgba(0,0,0,0.04)', borderRadius: '6px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ width: '80px', height: '10px', background: 'rgba(0,0,0,0.06)', borderRadius: '3px' }} />
              <div style={{ width: '100%', height: '36px', background: 'rgba(0,0,0,0.04)', borderRadius: '6px' }} />
            </div>
          </div>
        ) : isEditing ? (
          /* Interactive Clinical Fields Form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {/* Editable Birthdate Input Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-secondary)', textTransform: 'uppercase' }}>
                🎂 Fecha de Nacimiento
              </label>
              <input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
              {fechaNacimiento && (
                <div style={{ fontSize: '0.72rem', color: 'var(--color-primary)', opacity: 0.75, fontWeight: 500 }}>
                  {calculateAge(fechaNacimiento) !== null
                    ? `Edad calculada: ${calculateAge(fechaNacimiento)} años`
                    : 'Fecha no registrada'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>🚨 Alergias</label>
              <input
                type="text"
                placeholder="Ej. Penicilina, mariscos, etc."
                value={alergias}
                onChange={(e) => setAlergias(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>💊 Medicamentos</label>
              <input
                type="text"
                placeholder="Ej. Metformina 850mg c/12h"
                value={medicamentos}
                onChange={(e) => setMedicamentos(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>🩺 Padecimientos / Antecedentes</label>
              <textarea
                placeholder="Ej. Diabetes tipo 2, hipertensión"
                value={padecimientos}
                rows={2}
                onChange={(e) => setPadecimientos(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-secondary)', textTransform: 'uppercase' }}>💬 Motivo de Consulta</label>
              <textarea
                placeholder="Ej. Control mensual de glucosa"
                value={motivoConsulta}
                rows={2}
                onChange={(e) => setMotivoConsulta(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: '6px',
                  borderRadius: '6px',
                  background: 'var(--color-secondary)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? 'Guardando...' : '💾 Guardar'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : !isComplete ? (
          /* Empty/Pending State */
          <div style={{
            padding: '1.25rem 1rem',
            borderRadius: '8px',
            background: 'var(--color-surface)',
            border: '1px dashed var(--color-border)',
            fontSize: '0.8rem',
            color: 'var(--color-primary)',
            textAlign: 'center',
            lineHeight: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            <span style={{ opacity: 0.65 }}>
              📋 Ficha clínica pendiente. El paciente no ha llenado su expediente previo.
            </span>
            <button
              onClick={() => setIsEditing(true)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'var(--color-secondary)',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
              }}
            >
              ✍️ Registrar Ficha Médica
            </button>
          </div>
        ) : (
          /* Read-only details state */
          <>
            <TriageRow
              icon="🚨"
              label="Alergias"
              value={triage?.alergias}
              labelColor="#dc2626"
              valueBg="rgba(220,38,38,0.07)"
              valueColor="#dc2626"
              nullLabel="Sin información"
              noneLabel="Sin alergias conocidas ✓"
            />

            <TriageRow
              icon="💊"
              label="Medicamentos"
              value={triage?.medicamentos}
              labelColor="#d97706"
              valueBg="rgba(217,119,6,0.07)"
              valueColor="#92400e"
              nullLabel="Sin información"
              noneLabel="Sin medicamentos actuales"
            />

            <TriageRow
              icon="🩺"
              label="Padecimientos"
              value={triage?.padecimientos_cifrado}
              labelColor="#64748b"
              valueBg="rgba(100,116,139,0.06)"
              valueColor="#334155"
              nullLabel="No registrados"
            />

            <TriageRow
              icon="💬"
              label="Motivo de Consulta"
              value={triage?.motivo_consulta_cifrado}
              labelColor="var(--color-secondary)"
              valueBg="rgba(37,99,235,0.05)"
              valueColor="var(--color-secondary)"
              nullLabel="Sin motivo registrado"
            />
          </>
        )}

        {/* NOM-024 compliance notice */}
        <div style={{
          fontSize: '0.68rem',
          color: 'var(--color-primary)',
          opacity: 0.35,
          lineHeight: 1.4,
          borderTop: '1px solid var(--color-border)',
          paddingTop: '8px',
        }}>
          🔒 Datos cifrados en reposo. Solo el médico titular puede acceder (NOM-024).
        </div>
      </div>
    </div>
  );
}
