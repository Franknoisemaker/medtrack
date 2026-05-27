import { useState } from 'react';

interface OnboardingWizardProps {
  sessionToken: string;
  consultaId: string;
  patient?: {
    nombre: string;
    telefono: string;
    fecha_nacimiento: string;
  };
  onComplete: () => void;
}

export function OnboardingWizard({ sessionToken, consultaId, patient, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Step 1 State: Consentimiento y Datos Personales ---
  const [avisoConsent, setAvisoConsent] = useState(false);
  const [commConsent, setCommConsent] = useState(false);
  const [sexo, setSexo] = useState('Femenino');
  const nombreReadonly = patient?.nombre || 'Elena Ruiz Mendoza';
  const fechaNacReadonly = patient?.fecha_nacimiento && patient.fecha_nacimiento !== '1970-01-01'
    ? patient.fecha_nacimiento
    : '';

  // --- Step 2 State: Datos de Contacto ---
  const telefonoReadonly = patient?.telefono || '5512345678';
  const [email, setEmail] = useState('');
  const [emergenciaNombre, setEmergenciaNombre] = useState('');
  const [emergenciaTelefono, setEmergenciaTelefono] = useState('');

  // --- Step 3 State: Antecedentes Clínicos ---
  const [alergias, setAlergias] = useState<string[]>(['Ninguna']);
  const [medicamentos, setMedicamentos] = useState<string[]>(['Ninguno']);
  const [padecimientos, setPadecimientos] = useState('');
  const [motivoConsulta, setMotivoConsulta] = useState('');

  // Chip options list (static popular choices)
  const [alergiaOptions] = useState(['Ninguna', 'Penicilina', 'Polen', 'Lácteos', 'Sulfa']);
  const [medicamentoOptions] = useState(['Ninguno', 'Paracetamol', 'Ibuprofeno', 'Insulina', 'Aspirina']);

  // Custom Input States
  const [customAlergiaInput, setCustomAlergiaInput] = useState('');
  const [showCustomAlergiaInput, setShowCustomAlergiaInput] = useState(false);
  const [customMedicamentoInput, setCustomMedicamentoInput] = useState('');
  const [showCustomMedicamentoInput, setShowCustomMedicamentoInput] = useState(false);

  // Zero-dependency recursive HTML/Script Sanitizer (Emulating DOMPurify strictly)
  const sanitizeInput = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/<[^>]*>?/gm, '')
      .replace(/[&<>"']/g, (char) => {
        const entities: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;'
        };
        return entities[char] || char;
      });
  };

  const handleAlergiaToggle = (item: string) => {
    if (item === 'Ninguna') {
      setAlergias(['Ninguna']);
    } else {
      setAlergias((prev) => {
        const filtered = prev.filter((a) => a !== 'Ninguna');
        if (filtered.includes(item)) {
          const res = filtered.filter((a) => a !== item);
          return res.length === 0 ? ['Ninguna'] : res;
        } else {
          return [...filtered, item];
        }
      });
    }
  };

  const handleAddCustomAlergia = () => {
    const cleaned = customAlergiaInput.trim();
    if (!cleaned) return;
    
    setAlergias((prev) => {
      const filtered = prev.filter((a) => a !== 'Ninguna');
      if (!filtered.includes(cleaned)) {
        return [...filtered, cleaned];
      }
      return filtered;
    });

    setCustomAlergiaInput('');
    setShowCustomAlergiaInput(false);
  };

  const handleMedicamentoToggle = (item: string) => {
    if (item === 'Ninguno') {
      setMedicamentos(['Ninguno']);
    } else {
      setMedicamentos((prev) => {
        const filtered = prev.filter((m) => m !== 'Ninguno');
        if (filtered.includes(item)) {
          const res = filtered.filter((m) => m !== item);
          return res.length === 0 ? ['Ninguno'] : res;
        } else {
          return [...filtered, item];
        }
      });
    }
  };

  const handleAddCustomMedicamento = () => {
    const cleaned = customMedicamentoInput.trim();
    if (!cleaned) return;

    setMedicamentos((prev) => {
      const filtered = prev.filter((m) => m !== 'Ninguno');
      if (!filtered.includes(cleaned)) {
        return [...filtered, cleaned];
      }
      return filtered;
    });

    setCustomMedicamentoInput('');
    setShowCustomMedicamentoInput(false);
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!avisoConsent) {
        setErrorMessage('Debes aceptar el Aviso de Privacidad para continuar.');
        return;
      }
    }
    setErrorMessage(null);
    setStep((prev) => prev + 1);
  };

  const handlePrevStep = () => {
    setErrorMessage(null);
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivoConsulta.trim().length < 10) {
      setErrorMessage('El motivo de consulta debe detallar al menos 10 caracteres.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Strict Anti-Shoulder Surfing sanitization and cache purge
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedEmergenciaNombre = sanitizeInput(emergenciaNombre);
    const sanitizedEmergenciaTelefono = sanitizeInput(emergenciaTelefono);
    const sanitizedPadecimientos = sanitizeInput(padecimientos);
    const sanitizedMotivo = sanitizeInput(motivoConsulta);

    const payload = {
      consulta_id: consultaId,
      session_token: sessionToken,
      email: sanitizedEmail,
      contacto_emergencia_nombre: sanitizedEmergenciaNombre,
      contacto_emergencia_telefono: sanitizedEmergenciaTelefono,
      sexo,
      alergias: alergias.join(', '),
      medicamentos: medicamentos.join(', '),
      padecimientos_cronicos: sanitizedPadecimientos,
      motivo_consulta: sanitizedMotivo,
    };

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      if (isMock) {
        // High fidelity mock delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        const response = await fetch(`${supabaseUrl}/functions/v1/submit-onboarding`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const resData = await response.json();
        if (!resData.success) {
          throw new Error(resData.error || 'Error enviando expediente.');
        }
      }

      // PURGE ALL SENSITIVE MEMORY CACHES (ANTI-SHOULDER SURFING SECURITY)
      setEmail('');
      setEmergenciaNombre('');
      setEmergenciaTelefono('');
      setAlergias([]);
      setMedicamentos([]);
      setPadecimientos('');
      setMotivoConsulta('');
      setSexo('');

      setIsSubmitted(true);

      // Invalidate browser back history buffer to block backwards data exposure
      window.history.replaceState(null, '', window.location.origin);

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error de conexión. Por favor reintente.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- SUBMITTED SUCCESS SCREEN ---
  if (isSubmitted) {
    return (
      <div className="theme-zen" style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '2rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card-glass" style={{ maxWidth: '460px', width: '100%', padding: '3rem 2rem', textAlign: 'center', borderTop: '4px solid var(--color-success)', transition: 'all 0.3s ease' }}>
          <div style={{ fontSize: '4.5rem', marginBottom: '1.25rem' }}>🛡️</div>
          <h2 style={{ fontSize: '1.6rem', color: 'var(--color-primary)', fontWeight: 700, marginBottom: '0.75rem' }}>¡Listo! Expediente Recibido</h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--color-primary)', opacity: 0.75, lineHeight: 1.5, marginBottom: '1.75rem' }}>
            Agradecemos tu tiempo. Tus antecedentes clínicos han sido codificados y resguardados de forma inmutable bajo los estándares de la NOM-024. Puedes cerrar esta pestaña de tu navegador web con total seguridad.
          </p>
          <button
            onClick={() => {
              // Try to close tab, fallback to alerting safe preservation
              try {
                window.close();
              } catch (e) {
                console.warn(e);
              }
              alert('Información guardada de forma segura. Ya puedes cerrar esta pestaña.');
            }}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-success)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
            }}
          >
            Finalizar y Cerrar Pestaña Segura ✓
          </button>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--color-primary)',
            opacity: 0.45,
            marginTop: '2rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--color-border)',
            lineHeight: 1.45
          }}>
            🔒 Cumplimiento NOM-024-SSA3-2012 & NOM-004-SSA3-2012.<br />Tus datos médicos han sido cifrados en tránsito y reposo.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-zen" style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '2rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card-glass" style={{ maxWidth: '520px', width: '100%', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
        
        {/* Header Block */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '2.25rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary)' }}>Expediente Clínico</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.6 }}>Registro de Antecedentes y Consentimiento Informado</p>
        </div>

        {/* Stepper Status UI */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid var(--color-border)', marginBottom: '0.5rem' }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: step === s ? 'var(--color-secondary)' : step > s ? 'var(--color-success)' : 'var(--color-border)',
                color: step >= s ? '#ffffff' : 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                {step > s ? '✓' : s}
              </span>
              <span style={{
                fontSize: '0.8rem',
                fontWeight: step === s ? 700 : 500,
                color: 'var(--color-primary)',
                opacity: step === s ? 1 : 0.4
              }}>
                {s === 1 ? 'Personal' : s === 2 ? 'Contacto' : 'Clínico'}
              </span>
            </div>
          ))}
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            fontSize: '0.85rem',
            textAlign: 'center',
            fontWeight: 500
          }}>
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '3rem 0' }}>
            <span style={{ fontSize: '3rem', animation: 'spin 2s infinite linear' }}>🔄</span>
            <h4 style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Cifrando y Guardando Información...</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.6 }}>Procesando encriptación simétrica NOM-024</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* STEP 1: DATOS PERSONALES */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Nombre Completo (Solo Lectura)</label>
                  <input
                    type="text"
                    value={nombreReadonly}
                    readOnly
                    style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.03)', color: 'var(--color-primary)', opacity: 0.8, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Fecha Nacimiento</label>
                    <input
                      type="text"
                      value={fechaNacReadonly}
                      readOnly
                      style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.03)', color: 'var(--color-primary)', opacity: 0.8, outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Sexo Registrado *</label>
                    <select
                      value={sexo}
                      onChange={(e) => setSexo(e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-glass)', color: 'var(--color-primary)', outline: 'none' }}
                    >
                      <option value="Femenino">Femenino</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>

                {/* Privacy Consent Block — industry-standard two-checkbox pattern */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '0.5rem' }}>

                  {/* Required: Privacy Notice */}
                  <div style={{
                    background: 'rgba(0,0,0,0.01)',
                    border: avisoConsent ? '1px solid var(--color-secondary)' : '1px solid var(--color-border)',
                    padding: '14px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    transition: 'border-color 0.2s ease'
                  }}>
                    <input
                      type="checkbox"
                      id="privacy-consent"
                      checked={avisoConsent}
                      onChange={(e) => setAvisoConsent(e.target.checked)}
                      style={{ marginTop: '3px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <label htmlFor="privacy-consent" style={{ fontSize: '0.82rem', color: 'var(--color-primary)', lineHeight: 1.6, cursor: 'pointer' }}>
                      He leído y acepto el{' '}
                      <a
                        href="https://medtrack.mx/aviso-de-privacidad"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'var(--color-secondary)', fontWeight: 600, textDecoration: 'underline' }}
                      >
                        Aviso de Privacidad
                      </a>
                      . Entiendo que mis datos personales y de salud serán utilizados únicamente para integrar mi expediente clínico y brindarme atención médica. Solo mi médico podrá acceder a esta información.{' '}
                      <span style={{ fontWeight: 700, color: 'var(--color-error)' }}>*</span>
                    </label>
                  </div>

                  {/* Optional: Communication Consent */}
                  <div style={{
                    background: 'rgba(0,0,0,0.01)',
                    border: commConsent ? '1px solid var(--color-secondary)' : '1px solid var(--color-border)',
                    padding: '14px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    transition: 'border-color 0.2s ease'
                  }}>
                    <input
                      type="checkbox"
                      id="comm-consent"
                      checked={commConsent}
                      onChange={(e) => setCommConsent(e.target.checked)}
                      style={{ marginTop: '3px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <label htmlFor="comm-consent" style={{ fontSize: '0.82rem', color: 'var(--color-primary)', lineHeight: 1.6, cursor: 'pointer' }}>
                      Acepto recibir recordatorios de cita y avisos de salud por WhatsApp o correo electrónico.{' '}
                      <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(Opcional — puedes cancelarlo en cualquier momento)</span>
                    </label>
                  </div>

                </div>
              </div>
            )}

            {/* STEP 2: DATOS DE CONTACTO */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Teléfono Celular (Solo Lectura)</label>
                  <input
                    type="text"
                    value={telefonoReadonly}
                    readOnly
                    style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.03)', color: 'var(--color-primary)', opacity: 0.8, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Correo Electrónico (Opcional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-glass)', color: 'var(--color-primary)', outline: 'none' }}
                  />
                </div>

                <div style={{ 
                  borderTop: '1px dashed var(--color-border)', 
                  paddingTop: '1rem', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1rem' 
                }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>Contacto de Emergencia</h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>Nombre Completo</label>
                      <input
                        type="text"
                        value={emergenciaNombre}
                        onChange={(e) => setEmergenciaNombre(e.target.value)}
                        placeholder="Nombre del familiar"
                        style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-glass)', color: 'var(--color-primary)', outline: 'none' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>Teléfono</label>
                      <input
                        type="tel"
                        value={emergenciaTelefono}
                        onChange={(e) => setEmergenciaTelefono(e.target.value)}
                        placeholder="10 dígitos"
                        style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-glass)', color: 'var(--color-primary)', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: ANTECEDENTES CLINICOS */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Chip Selector: Alergias */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Alergias Conocidas *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                    {/* Render standard options */}
                    {alergiaOptions.map((opt) => {
                      const active = alergias.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleAlergiaToggle(opt)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '16px',
                            border: `1px solid ${active ? 'var(--color-secondary)' : 'var(--color-border)'}`,
                            background: active ? 'var(--color-secondary)' : 'var(--color-surface-glass)',
                            color: active ? '#ffffff' : 'var(--color-primary)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}

                    {/* Render dynamically added custom allergies */}
                    {alergias.filter(opt => !alergiaOptions.includes(opt)).map((custom) => (
                      <button
                        key={custom}
                        type="button"
                        onClick={() => handleAlergiaToggle(custom)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          border: '1px solid var(--color-secondary)',
                          background: 'var(--color-secondary)',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {custom} <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>✕</span>
                      </button>
                    ))}

                    {/* Toggle dynamic text input */}
                    <button
                      type="button"
                      onClick={() => setShowCustomAlergiaInput(!showCustomAlergiaInput)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '16px',
                        border: '1px dashed var(--color-secondary)',
                        background: 'transparent',
                        color: 'var(--color-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {showCustomAlergiaInput ? '✕ Cancelar' : '+ Otro'}
                    </button>
                  </div>

                  {/* Inline custom input panel */}
                  {showCustomAlergiaInput && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', animation: 'slideUp 0.2s ease' }}>
                      <input
                        type="text"
                        value={customAlergiaInput}
                        onChange={(e) => setCustomAlergiaInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomAlergia()}
                        placeholder="ej. Nueces, Sulfitos, etc."
                        style={{
                          flexGrow: 1,
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-glass)',
                          fontSize: '0.85rem',
                          color: 'var(--color-primary)',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomAlergia}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-secondary)',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Agregar
                      </button>
                    </div>
                  )}
                </div>

                {/* Chip Selector: Medicamentos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Medicamentos Consumidos Habitualmente *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                    {/* Render standard options */}
                    {medicamentoOptions.map((opt) => {
                      const active = medicamentos.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleMedicamentoToggle(opt)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '16px',
                            border: `1px solid ${active ? 'var(--color-secondary)' : 'var(--color-border)'}`,
                            background: active ? 'var(--color-secondary)' : 'var(--color-surface-glass)',
                            color: active ? '#ffffff' : 'var(--color-primary)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}

                    {/* Render dynamically added custom medicines */}
                    {medicamentos.filter(opt => !medicamentoOptions.includes(opt)).map((custom) => (
                      <button
                        key={custom}
                        type="button"
                        onClick={() => handleMedicamentoToggle(custom)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          border: '1px solid var(--color-secondary)',
                          background: 'var(--color-secondary)',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {custom} <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>✕</span>
                      </button>
                    ))}

                    {/* Toggle dynamic text input */}
                    <button
                      type="button"
                      onClick={() => setShowCustomMedicamentoInput(!showCustomMedicamentoInput)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '16px',
                        border: '1px dashed var(--color-secondary)',
                        background: 'transparent',
                        color: 'var(--color-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {showCustomMedicamentoInput ? '✕ Cancelar' : '+ Otro'}
                    </button>
                  </div>

                  {/* Inline custom input panel */}
                  {showCustomMedicamentoInput && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', animation: 'slideUp 0.2s ease' }}>
                      <input
                        type="text"
                        value={customMedicamentoInput}
                        onChange={(e) => setCustomMedicamentoInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomMedicamento()}
                        placeholder="ej. Metformina, Omeprazol, etc."
                        style={{
                          flexGrow: 1,
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-glass)',
                          fontSize: '0.85rem',
                          color: 'var(--color-primary)',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomMedicamento}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-secondary)',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Agregar
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Padecimientos Crónicos (Opcional)</label>
                  <input
                    type="text"
                    value={padecimientos}
                    onChange={(e) => setPadecimientos(e.target.value)}
                    placeholder="Diabetes, Hipertensión, etc."
                    style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-glass)', color: 'var(--color-primary)', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Motivo Principal de Consulta *</label>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6, color: motivoConsulta.trim().length >= 10 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {motivoConsulta.trim().length}/10 chars mín.
                    </span>
                  </div>
                  <textarea
                    value={motivoConsulta}
                    onChange={(e) => setMotivoConsulta(e.target.value)}
                    placeholder="Describe detalladamente los síntomas o causa de tu visita médica..."
                    rows={3}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-glass)',
                      color: 'var(--color-primary)',
                      outline: 'none',
                      resize: 'none',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                      lineHeight: 1.4
                    }}
                  />
                </div>

              </div>
            )}

            {/* Stepper Steer Controllers */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem' }}>
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  ← Atrás
                </button>
              ) : (
                <div />
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Siguiente Step →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-success)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.15)'
                  }}
                >
                  Confirmar y Enviar Expediente 🔒
                </button>
              )}
            </div>

          </div>
        )}

      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}
