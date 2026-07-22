import { describe, it, expect } from 'vitest';
import { formatDateICS, generateICSContent, downloadICS } from './icsGenerator';
import type { ICSEvent } from './icsGenerator';

// ─── formatDateICS ────────────────────────────────────────────────────────────

describe('formatDateICS', () => {
  it('formats a UTC date as YYYYMMDDTHHmmssZ', () => {
    const date = new Date('2026-08-15T10:30:00.000Z');
    expect(formatDateICS(date)).toBe('20260815T103000Z');
  });

  it('strips milliseconds', () => {
    const date = new Date('2026-01-01T00:00:00.999Z');
    expect(formatDateICS(date)).toBe('20260101T000000Z');
  });
});

// ─── generateICSContent ───────────────────────────────────────────────────────

describe('generateICSContent', () => {
  const baseEvent: ICSEvent = {
    uid: 'test-123@medtrack.mx',
    summary: 'Consulta General — Elena Ruiz',
    dtstart: new Date('2026-08-15T10:00:00.000Z'),
    dtend: new Date('2026-08-15T11:00:00.000Z'),
  };

  it('produces a valid VCALENDAR wrapper', () => {
    const output = generateICSContent([baseEvent]);
    expect(output).toContain('BEGIN:VCALENDAR');
    expect(output).toContain('END:VCALENDAR');
    expect(output).toContain('VERSION:2.0');
    expect(output).toContain('PRODID:-//MedTrack//Expediente Clínico Digital//ES');
  });

  it('wraps the event in VEVENT boundaries', () => {
    const output = generateICSContent([baseEvent]);
    expect(output).toContain('BEGIN:VEVENT');
    expect(output).toContain('END:VEVENT');
  });

  it('includes required fields', () => {
    const output = generateICSContent([baseEvent]);
    expect(output).toContain('UID:test-123@medtrack.mx');
    expect(output).toContain('DTSTART:20260815T100000Z');
    expect(output).toContain('DTEND:20260815T110000Z');
    expect(output).toContain('SUMMARY:Consulta General — Elena Ruiz');
  });

  it('includes optional description when provided', () => {
    const ev = { ...baseEvent, description: 'Consulta de control de peso' };
    const output = generateICSContent([ev]);
    expect(output).toContain('DESCRIPTION:Consulta de control de peso');
  });

  it('escapes commas and semicolons in values', () => {
    const ev = { ...baseEvent, summary: 'Control; Peso, IMC' };
    const output = generateICSContent([ev]);
    expect(output).toContain('SUMMARY:Control\\; Peso\\, IMC');
  });

  it('escapes newlines in description', () => {
    const ev = { ...baseEvent, description: 'Línea 1\nLínea 2' };
    const output = generateICSContent([ev]);
    expect(output).toContain('DESCRIPTION:Línea 1\\nLínea 2');
  });

  it('includes VALARMs for reminders', () => {
    const output = generateICSContent([baseEvent]);
    expect(output).toContain('BEGIN:VALARM');
    expect(output).toContain('TRIGGER:-PT24H');
    expect(output).toContain('TRIGGER:-PT1H');
  });

  it('generates multiple VEVENT blocks for recurrent appointments', () => {
    const events = [
      { ...baseEvent, uid: 'ev1@medtrack.mx', dtstart: new Date('2026-08-15T10:00:00Z'), dtend: new Date('2026-08-15T11:00:00Z') },
      { ...baseEvent, uid: 'ev2@medtrack.mx', dtstart: new Date('2026-08-22T10:00:00Z'), dtend: new Date('2026-08-22T11:00:00Z') },
    ];
    const output = generateICSContent(events);
    const count = (output.match(/BEGIN:VEVENT/g) || []).length;
    expect(count).toBe(2);
  });

  it('uses CRLF line endings per RFC 5545', () => {
    const output = generateICSContent([baseEvent]);
    expect(output).toContain('\r\n');
  });
});

// ─── downloadICS (smoke test) ────────────────────────────────────────────────

describe('downloadICS', () => {
  it('does not throw for a valid event', () => {
    const event: ICSEvent = {
      uid: 'smoke-test@medtrack.mx',
      summary: 'Smoke Test',
      dtstart: new Date('2026-08-15T10:00:00.000Z'),
      dtend: new Date('2026-08-15T11:00:00.000Z'),
    };
    // jsdom doesn't have URL.createObjectURL — mock it
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => {};

    expect(() => downloadICS([event], 'test.ics')).not.toThrow();

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });
});
