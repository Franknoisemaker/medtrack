/**
 * CalendarButton — Smart calendar integration with provider detection.
 *
 * Behavior:
 *  1. Reads the doctor's email from the active Supabase session.
 *  2. Detects the most likely calendar provider (Google / Outlook / unknown).
 *  3. On click, opens a popover with the detected provider highlighted.
 *  4. Google / Outlook options open in a new tab without downloading anything.
 *  5. The .ics download is always available as a universal fallback.
 *  6. For unknown providers, shows an informational hint.
 *
 * Two render modes:
 *  - compact=false (default): full-width button for the NewAppointmentForm success screen.
 *  - compact=true: small emoji badge for the PatientRecord timeline rows.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { downloadAppointmentICS } from '../../utils/icsGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarButtonProps {
  patientName: string;
  appointmentType?: string;
  dtstart: Date;
  durationMinutes?: number;
  /** compact=true renders the small 📅 badge used in the timeline rows */
  compact?: boolean;
  /** Stop click propagation to parent (useful inside accordion rows) */
  stopPropagation?: boolean;
}

type CalendarProvider = 'google' | 'outlook' | 'unknown';

// ─── URL Builders ─────────────────────────────────────────────────────────────

function fmtForGCal(d: Date): string {
  // YYYYMMDDTHHMMSSz — no dashes, no colons
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildGoogleCalendarUrl(title: string, dtstart: Date, dtend: Date, description: string): string {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${fmtForGCal(dtstart)}/${fmtForGCal(dtend)}`);
  url.searchParams.set('details', description);
  url.searchParams.set('location', 'Consultorio Médico');
  return url.toString();
}

function buildOutlookUrl(title: string, dtstart: Date, dtend: Date, description: string): string {
  const url = new URL('https://outlook.live.com/calendar/deeplink/compose');
  url.searchParams.set('subject', title);
  url.searchParams.set('startdt', dtstart.toISOString());
  url.searchParams.set('enddt', dtend.toISOString());
  url.searchParams.set('path', '/calendar/action/compose');
  url.searchParams.set('rru', 'addevent');
  url.searchParams.set('body', description);
  url.searchParams.set('location', 'Consultorio Médico');
  return url.toString();
}

// ─── Provider Detection ───────────────────────────────────────────────────────

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const OUTLOOK_DOMAINS = new Set([
  'outlook.com', 'outlook.es', 'outlook.com.mx',
  'hotmail.com', 'hotmail.es', 'hotmail.com.mx',
  'live.com', 'live.com.mx', 'msn.com',
]);

function detectCalendarProvider(email: string | null | undefined): CalendarProvider {
  if (!email) return 'unknown';
  const domain = (email.split('@')[1] ?? '').toLowerCase();
  if (GOOGLE_DOMAINS.has(domain)) return 'google';
  if (OUTLOOK_DOMAINS.has(domain)) return 'outlook';
  return 'unknown';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarButton({
  patientName,
  appointmentType = 'Consulta General',
  dtstart,
  durationMinutes = 60,
  compact = false,
  stopPropagation = false,
}: CalendarButtonProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [provider, setProvider] = useState<CalendarProvider>('unknown');
  const [icsDownloaded, setIcsDownloaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch doctor's email from session on mount ──────────────────────────────
  useEffect(() => {
    async function loadSession() {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
        const isMock = supabaseUrl.includes('your-project-id');
        if (isMock) {
          // Mock environment — default to unknown so all options show
          setProvider('unknown');
          return;
        }
        const { data } = await supabase.auth.getSession();
        const email = data.session?.user?.email;
        setProvider(detectCalendarProvider(email));
      } catch {
        setProvider('unknown');
      }
    }
    loadSession();
  }, []);

  // ── Close popover on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!showPopover) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showPopover]);

  // ── Derived event info ──────────────────────────────────────────────────────
  const dtend = new Date(dtstart.getTime() + durationMinutes * 60 * 1000);
  const title = `${appointmentType} — ${patientName}`;
  const description = `Consulta médica para ${patientName}.\nTipo: ${appointmentType}`;
  const googleUrl = buildGoogleCalendarUrl(title, dtstart, dtend, description);
  const outlookUrl = buildOutlookUrl(title, dtstart, dtend, description);

  const handleICSDownload = useCallback(() => {
    downloadAppointmentICS({
      uid: crypto.randomUUID(),
      patientName,
      appointmentType,
      dtstart,
      durationMinutes,
    });
    setIcsDownloaded(true);
    setTimeout(() => setIcsDownloaded(false), 3000);
    setShowPopover(false);
  }, [patientName, appointmentType, dtstart, durationMinutes]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    setShowPopover((v) => !v);
  };

  // ── Popover ─────────────────────────────────────────────────────────────────
  const popover = showPopover && (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 8px)',
        zIndex: 999,
        minWidth: '252px',
        background: 'var(--color-surface, #1e293b)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '10px',
        boxShadow: '0 16px 40px -8px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3)',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        animation: 'fadeInDown 0.15s ease',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        fontSize: '0.68rem',
        fontWeight: 700,
        color: 'var(--color-primary)',
        opacity: 0.5,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        paddingBottom: '4px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: '2px',
      }}>
        Agregar al Calendario
      </div>

      {/* Unknown provider hint */}
      {provider === 'unknown' && (
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--color-primary)',
          opacity: 0.55,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '6px',
          padding: '6px 8px',
          lineHeight: 1.4,
        }}>
          No detectamos tu proveedor de calendario. Elige tu opción o descarga el archivo .ics.
        </div>
      )}

      {/* Google Calendar */}
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setShowPopover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 10px',
          borderRadius: '7px',
          textDecoration: 'none',
          background: provider === 'google'
            ? 'rgba(66, 133, 244, 0.14)'
            : 'rgba(255,255,255,0.03)',
          border: provider === 'google'
            ? '1px solid rgba(66, 133, 244, 0.35)'
            : '1px solid transparent',
          transition: 'all 0.18s',
          cursor: 'pointer',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(66, 133, 244, 0.2)';
          e.currentTarget.style.border = '1px solid rgba(66, 133, 244, 0.45)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = provider === 'google'
            ? 'rgba(66, 133, 244, 0.14)'
            : 'rgba(255,255,255,0.03)';
          e.currentTarget.style.border = provider === 'google'
            ? '1px solid rgba(66, 133, 244, 0.35)'
            : '1px solid transparent';
        }}
      >
        {/* Google 'G' logo */}
        <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
          <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.4 33.1 30 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l6.3-6.3C34.3 5.3 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z"/>
          <path fill="#34A853" d="M6.3 14.7l7 5.1C15 16.1 19.1 13 24 13c3 0 5.7 1.1 7.8 2.9l6.3-6.3C34.3 5.3 29.4 3 24 3 15.9 3 8.9 7.9 6.3 14.7z"/>
          <path fill="#FBBC05" d="M24 45c5.3 0 10.1-1.8 13.8-4.8l-6.4-5.2C29.4 36.6 26.8 37.5 24 37.5c-5.8 0-10.8-3.9-12.5-9.2L4.5 33.7C8 40.5 15.4 45 24 45z"/>
          <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.9 2.6-2.8 4.7-5.3 6.1l6.4 5.2C41 36.1 44.5 30.5 44.5 24c0-1.3-.2-2.7-.5-4z"/>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
            Google Calendar
            {provider === 'google' && (
              <span style={{ marginLeft: '6px', fontSize: '0.62rem', color: '#4285F4', fontWeight: 800, background: 'rgba(66,133,244,0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                Detectado
              </span>
            )}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Abre en tu cuenta de Google</span>
        </div>
      </a>

      {/* Outlook */}
      <a
        href={outlookUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setShowPopover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 10px',
          borderRadius: '7px',
          textDecoration: 'none',
          background: provider === 'outlook'
            ? 'rgba(0, 120, 212, 0.14)'
            : 'rgba(255,255,255,0.03)',
          border: provider === 'outlook'
            ? '1px solid rgba(0, 120, 212, 0.35)'
            : '1px solid transparent',
          transition: 'all 0.18s',
          cursor: 'pointer',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(0, 120, 212, 0.2)';
          e.currentTarget.style.border = '1px solid rgba(0, 120, 212, 0.45)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = provider === 'outlook'
            ? 'rgba(0, 120, 212, 0.14)'
            : 'rgba(255,255,255,0.03)';
          e.currentTarget.style.border = provider === 'outlook'
            ? '1px solid rgba(0, 120, 212, 0.35)'
            : '1px solid transparent';
        }}
      >
        {/* Outlook logo */}
        <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
          <rect width="48" height="48" rx="6" fill="#0078D4"/>
          <path fill="white" d="M24 10C17.4 10 12 15.4 12 22s5.4 12 12 12 12-5.4 12-12-5.4-12-12-12zm0 20c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z"/>
          <path fill="white" d="M36 16h-4v4h-4v4h4v4h4v-4h4v-4h-4z"/>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
            Outlook / Teams
            {provider === 'outlook' && (
              <span style={{ marginLeft: '6px', fontSize: '0.62rem', color: '#0078D4', fontWeight: 800, background: 'rgba(0,120,212,0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                Detectado
              </span>
            )}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Abre en Outlook Web</span>
        </div>
      </a>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '2px 0' }} />

      {/* ICS download */}
      <button
        onClick={handleICSDownload}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 10px',
          borderRadius: '7px',
          background: icsDownloaded ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)',
          border: icsDownloaded ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.18s',
          width: '100%',
        }}
        onMouseOver={(e) => { if (!icsDownloaded) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
        onMouseOut={(e) => { if (!icsDownloaded) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      >
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icsDownloaded ? '✅' : '⬇️'}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: icsDownloaded ? '#10b981' : '#f8fafc' }}>
            {icsDownloaded ? 'Archivo descargado' : 'Descargar archivo .ics'}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
            {icsDownloaded
              ? 'Ábrelo para agregarlo a tu calendario'
              : 'Compatible con Apple Calendar, Outlook desktop y más'}
          </span>
        </div>
      </button>

      {/* Keyframe animation */}
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  // ── Compact badge (PatientRecord timeline) ───────────────────────────────────
  if (compact) {
    return (
      <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          title="Agregar al Calendario"
          onClick={handleTriggerClick}
          style={{
            padding: '3px 7px',
            borderRadius: '4px',
            background: showPopover ? 'rgba(99, 102, 241, 0.18)' : 'rgba(99, 102, 241, 0.08)',
            border: `1px solid ${showPopover ? 'rgba(99, 102, 241, 0.45)' : 'rgba(99, 102, 241, 0.2)'}`,
            color: '#818cf8',
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.18)';
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)';
          }}
          onMouseOut={(e) => {
            if (!showPopover) {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.2)';
            }
          }}
        >
          📅
        </button>
        {popover}
      </div>
    );
  }

  // ── Full button (NewAppointmentForm success screen) ──────────────────────────
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={handleTriggerClick}
        style={{
          padding: '11px',
          borderRadius: 'var(--radius-base)',
          background: showPopover ? 'rgba(99, 102, 241, 0.16)' : 'rgba(99, 102, 241, 0.1)',
          border: `1px solid ${showPopover ? 'rgba(99, 102, 241, 0.5)' : 'rgba(99, 102, 241, 0.35)'}`,
          color: '#818cf8',
          fontWeight: 600,
          fontSize: '0.88rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.2s ease',
          width: '100%',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(99, 102, 241, 0.18)';
        }}
        onMouseOut={(e) => {
          if (!showPopover) e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
        }}
      >
        📅 Agregar al Calendario
        <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{showPopover ? '▲' : '▼'}</span>
      </button>
      {popover}
    </div>
  );
}
