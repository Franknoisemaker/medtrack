import { useState, useEffect } from 'react';

export interface ClinicalFile {
  id: string;
  titulo: string;
  categoria: string;
  scan_status: string;
  uploaded_at: string;
}

interface ClinicalFilesListProps {
  consultaId: string;
  files: ClinicalFile[];
}

export function ClinicalFilesList({ consultaId, files }: ClinicalFilesListProps) {
  const getIcon = (categoria: string) => {
    switch (categoria) {
      case 'Laboratorio': return '🩸';
      case 'Radiografía': return '🩻';
      case 'Receta': return '💊';
      default: return '📎';
    }
  };

  const handleDownload = async (archivoId: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/get-file?archivo_id=${archivoId}&medico_id=a6b12a8a-e55d-4f11-8ac1-f11181283c44`, {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || 'Error al obtener el enlace de descarga.');
      }

      const { url } = await resp.json();
      
      // Abrimos el enlace de descarga firmado directamente de Cloudflare R2
      window.open(url, '_blank', 'noopener,noreferrer');
      
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Error al descargar el archivo.'}`);
    }
  };

  if (!files || files.length === 0) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.45, fontSize: '0.85rem' }}>
        No hay estudios ni archivos adjuntos.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {files.map((file) => (
        <div
          key={file.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            background: 'var(--color-surface-glass)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-base)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '1.5rem' }}>{getIcon(file.categoria)}</div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                {file.titulo}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.6, marginTop: '2px' }}>
                {file.categoria} • {new Date(file.uploaded_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            </div>
          </div>
          
          <button
            onClick={() => handleDownload(file.id)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Descargar Seguro</span>
            <span>🔒</span>
          </button>
        </div>
      ))}
    </div>
  );
}
