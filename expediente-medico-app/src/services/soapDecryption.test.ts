import { describe, it, expect } from 'vitest';
import { isUndecryptedPayload, hasUndecryptedField } from './soapDecryption';

const ARMORED = '-----BEGIN PGP MESSAGE-----\n\nww0EBwMC...\n-----END PGP MESSAGE-----';

describe('soapDecryption', () => {
  it('detects armored PGP ciphertext, including leading whitespace', () => {
    expect(isUndecryptedPayload(ARMORED)).toBe(true);
    expect(isUndecryptedPayload(`\n  ${ARMORED}`)).toBe(true);
  });

  it('treats decrypted clinical text, empty and null values as readable', () => {
    expect(isUndecryptedPayload('Dolor abdominal de 3 días')).toBe(false);
    expect(isUndecryptedPayload('Paciente refiere "-----BEGIN PGP MESSAGE-----" en un correo')).toBe(false);
    expect(isUndecryptedPayload('')).toBe(false);
    expect(isUndecryptedPayload(null)).toBe(false);
  });

  it('flags a note when any of the four SOAP fields is still encrypted', () => {
    expect(hasUndecryptedField({ subjetivo: 'S', objetivo: 'O', analisis: 'A', plan: 'P' })).toBe(false);
    expect(hasUndecryptedField({ subjetivo: 'S', objetivo: 'O', analisis: 'A', plan: ARMORED })).toBe(true);
  });
});
