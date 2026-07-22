/**
 * ICS / iCalendar generator — RFC 5545 compliant
 * Generates downloadable .ics files for calendar integration.
 *
 * Handles:
 *  - Single events
 *  - Multiple events (recurrent appointments)
 *  - Proper CRLF line endings
 *  - ICS line folding (max 75 octets per line)
 *  - Special character escaping
 */

export interface ICSEvent {
  /** Unique identifier for this event (e.g., appointment id + "@medtrack.mx") */
  uid: string;
  /** Calendar event title */
  summary: string;
  /** Optional plain-text description */
  description?: string;
  /** Start datetime (UTC) */
  dtstart: Date;
  /** End datetime (UTC) */
  dtend: Date;
  /** Optional location string */
  location?: string;
  /** Optional organizer metadata */
  organizer?: {
    name: string;
    email?: string;
  };
}

/**
 * Format a JS Date as an iCal UTC timestamp: YYYYMMDDTHHmmssZ
 */
export function formatDateICS(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape special characters per RFC 5545 §3.3.11
 */
function escapeICSValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Fold long ICS lines per RFC 5545 §3.1
 * Lines must not exceed 75 octets; continuation lines begin with a space.
 */
function foldLine(line: string): string {
  const MAX_OCTETS = 75;
  if (line.length <= MAX_OCTETS) return line;

  const result: string[] = [];
  let current = '';
  for (const char of line) {
    if ((current + char).length > MAX_OCTETS) {
      result.push(current);
      current = ' ' + char;
    } else {
      current += char;
    }
  }
  if (current) result.push(current);
  return result.join('\r\n');
}

/**
 * Build a full VCALENDAR string from one or more events.
 */
export function generateICSContent(events: ICSEvent[]): string {
  const now = formatDateICS(new Date());

  const vEvents = events.map((ev) => {
    const lines: string[] = [
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatDateICS(ev.dtstart)}`,
      `DTEND:${formatDateICS(ev.dtend)}`,
      `SUMMARY:${escapeICSValue(ev.summary)}`,
    ];

    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeICSValue(ev.description)}`);
    }
    if (ev.location) {
      lines.push(`LOCATION:${escapeICSValue(ev.location)}`);
    }
    if (ev.organizer?.email) {
      lines.push(`ORGANIZER;CN="${escapeICSValue(ev.organizer.name)}":mailto:${ev.organizer.email}`);
    } else if (ev.organizer?.name) {
      lines.push(`ORGANIZER;CN="${escapeICSValue(ev.organizer.name)}":mailto:noreply@medtrack.mx`);
    }

    // Soft alarms: 1-day and 1-hour before
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Recordatorio: ${escapeICSValue(ev.summary)} (mañana)`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Recordatorio: ${escapeICSValue(ev.summary)} (en 1 hora)`,
      'END:VALARM',
    );

    lines.push('END:VEVENT');
    return lines.map(foldLine).join('\r\n');
  });

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MedTrack//Expediente Clínico Digital//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vEvents,
    'END:VCALENDAR',
  ].join('\r\n');

  return calendar;
}

/**
 * Trigger a browser download of an .ics file from the given events.
 */
export function downloadICS(events: ICSEvent[], filename: string): void {
  const content = generateICSContent(events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Convenience: build a single ICSEvent for a medical appointment and download it.
 */
export function downloadAppointmentICS(params: {
  uid: string;
  patientName: string;
  appointmentType?: string;
  dtstart: Date;
  durationMinutes?: number;
  doctorName?: string;
  location?: string;
}): void {
  const {
    uid,
    patientName,
    appointmentType = 'Consulta General',
    dtstart,
    durationMinutes = 60,
    doctorName,
    location,
  } = params;

  const dtend = new Date(dtstart.getTime() + durationMinutes * 60 * 1000);

  const event: ICSEvent = {
    uid: `${uid}@medtrack.mx`,
    summary: `${appointmentType} — ${patientName}`,
    description: `Consulta médica para ${patientName}.\nTipo: ${appointmentType}`,
    dtstart,
    dtend,
    location: location || 'Consultorio Médico',
    organizer: doctorName ? { name: doctorName } : undefined,
  };

  const safeFilename = `cita-${patientName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.ics`;
  downloadICS([event], safeFilename);
}
