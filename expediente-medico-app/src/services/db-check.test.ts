import { describe, it, expect } from 'vitest';

describe('Database Diagnostics', () => {
  it('queries database directly', async () => {
    const supabaseUrl = 'http://127.0.0.1:54321';
    const anonKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

    try {
      console.log('--- DIAGNOSTIC START ---');
      const res = await fetch(`${supabaseUrl}/rest/v1/consultas?select=*&limit=1`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      const data = await res.json();
      console.log('Consultations query result:', data);

      const resPatients = await fetch(`${supabaseUrl}/rest/v1/pacientes?select=*&limit=1`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      const patientsData = await resPatients.json();
      console.log('Patients query result:', patientsData);

      console.log('--- DIAGNOSTIC END ---');
    } catch (err) {
      console.error('Diagnostic error:', err);
    }
    expect(true).toBe(true);
  });
});
