import { useState, useRef } from 'react';
import { logEvent } from '../../services/telemetry';
import { supabase } from '../../services/supabase';

interface FileUploadZoneProps {
  consultaId: string;
  onUploadSuccess: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export function FileUploadZone({ consultaId, onUploadSuccess }: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState('Laboratorio');
  const [status, setStatus] = useState<'IDLE' | 'SCANNING' | 'UPLOADING' | 'ERROR' | 'INFECTED'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      setStatus('ERROR');
      setErrorMessage(`El archivo "${selectedFile.name}" excede el límite de 25 MB.`);
      return;
    }
    setFile(selectedFile);
    setStatus('IDLE');
    setErrorMessage('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !titulo) return;

    setStatus('SCANNING');
    
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
      // MOCK BEHAVIOR: Since we don't have real cloud credentials configured locally yet,
      // we will simulate the network delay to demonstrate the UI states.
      // In production, this directly calls the edge function.
      const isMock = supabaseUrl.includes('your-project-id');

      if (isMock) {
        await new Promise(r => setTimeout(r, 2000));
        // Fake virus detection if the word 'virus' is in the filename
        if (file.name.toLowerCase().includes('virus')) {
          setStatus('INFECTED');
          setErrorMessage('El archivo fue bloqueado por el escáner antivirus (ZDR).');
          return;
        }
        
        setStatus('UPLOADING');
        await new Promise(r => setTimeout(r, 1000));
        
        logEvent('clinical_file_upload_mock', { consulta_id: consultaId, categoria });
        onUploadSuccess();
        reset();
        return;
      }

      // REAL IMPLEMENTATION
      const session = (await supabase.auth.getSession()).data.session;
      const activeDoctorId = session?.user?.id || 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const sessionToken = session?.access_token || supabaseAnonKey;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('titulo', titulo);
      formData.append('categoria', categoria);
      formData.append('consulta_id', consultaId);
      formData.append('medico_id', activeDoctorId);

      const resp = await fetch(`${supabaseUrl}/functions/v1/scan-virus?apikey=${supabaseAnonKey}`, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: formData,
      });

      const res = await resp.json();

      if (!resp.ok) {
        if (resp.status === 403 && res.status === 'INFECTED') {
          setStatus('INFECTED');
          setErrorMessage('El archivo fue bloqueado por el escáner antivirus (ZDR).');
          return;
        }
        throw new Error(res.error || 'Error al procesar el archivo.');
      }

      logEvent('clinical_file_upload_success', { consulta_id: consultaId, categoria });
      onUploadSuccess();
      reset();

    } catch (err: any) {
      setStatus('ERROR');
      setErrorMessage(err.message || 'Ocurrió un error inesperado al subir el archivo.');
    }
  };

  const reset = () => {
    setFile(null);
    setTitulo('');
    setCategoria('Laboratorio');
    setStatus('IDLE');
    setErrorMessage('');
  };

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface-glass)',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-primary)', margin: 0 }}>
        📂 Adjuntar Archivo Clínico
      </h3>

      {!file ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragActive ? 'var(--color-secondary)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-base)',
            padding: '2.5rem 1rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragActive ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
            transition: 'all 0.2s ease',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            onChange={handleChange}
            accept=".pdf,.png,.jpg,.jpeg,.dcm"
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)' }}>
            Arrastra tu archivo aquí o haz clic para seleccionar
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.6, marginTop: '0.5rem' }}>
            Soporta PDF, PNG, JPG, DICOM (Máx. 25 MB)
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-base)', border: '1px solid var(--color-border)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.5rem' }}>{file.name.endsWith('.pdf') ? '📕' : '🖼️'}</div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)', wordBreak: 'break-all' }}>{file.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.6 }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            </div>
            {status === 'IDLE' && (
              <button onClick={reset} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.5 }}>✕</button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>TÍTULO</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Radiografía de Tórax"
                disabled={status !== 'IDLE'}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>CATEGORÍA</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                disabled={status !== 'IDLE'}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
              >
                <option value="Laboratorio">🩸 Laboratorio</option>
                <option value="Radiografía">🩻 Radiografía</option>
                <option value="Receta">💊 Receta Externa</option>
                <option value="Otro">📎 Otro Estudio</option>
              </select>
            </div>
          </div>

          {status === 'IDLE' && (
            <button
              onClick={handleUpload}
              disabled={!titulo.trim()}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: titulo.trim() ? 'var(--color-secondary)' : '#cbd5e1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: titulo.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Escanear y Subir Seguro
            </button>
          )}

          {(status === 'SCANNING' || status === 'UPLOADING') && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-secondary)', fontWeight: 600, fontSize: '0.9rem' }}>
              <span className="spinner" style={{ display: 'inline-block', marginRight: '8px', animation: 'spin 1s linear infinite' }}>🛡️</span>
              {status === 'SCANNING' ? 'Escaneando con ZDR Antivirus...' : 'Cifrando y guardando en Cloudflare R2...'}
            </div>
          )}

        </div>
      )}

      {status === 'ERROR' && (
        <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500 }}>
          ⚠️ {errorMessage}
        </div>
      )}

      {status === 'INFECTED' && (
        <div style={{ padding: '0.75rem', background: '#7f1d1d', color: '#fca5a5', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
          🚨 AMENAZA DETECTADA: {errorMessage}<br/>
          <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>El archivo ha sido bloqueado y eliminado.</span>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
