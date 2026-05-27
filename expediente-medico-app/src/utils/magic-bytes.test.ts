import { describe, it, expect } from 'vitest';
import { getFileTypeFromMagicBytes } from '../../supabase/functions/scan-virus/magic-bytes';

describe('Magic Bytes Validator (Anti-Disguise)', () => {
  it('identifies a valid PDF buffer', () => {
    // Mock PDF header: %PDF-1.4
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    // Pad to 132 bytes to pass minimum length check
    const padded = new Uint8Array(132);
    padded.set(buffer);
    
    expect(getFileTypeFromMagicBytes(padded)).toBe('PDF');
  });

  it('identifies a valid JPEG buffer', () => {
    // Mock JPEG header: FF D8 FF
    const buffer = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const padded = new Uint8Array(132);
    padded.set(buffer);
    
    expect(getFileTypeFromMagicBytes(padded)).toBe('JPEG');
  });

  it('identifies a valid PNG buffer', () => {
    // Mock PNG header
    const buffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const padded = new Uint8Array(132);
    padded.set(buffer);
    
    expect(getFileTypeFromMagicBytes(padded)).toBe('PNG');
  });

  it('identifies a valid DICOM buffer', () => {
    const padded = new Uint8Array(140);
    // DICOM signature is "DICM" at offset 128
    padded[128] = 0x44; // D
    padded[129] = 0x49; // I
    padded[130] = 0x43; // C
    padded[131] = 0x4D; // M
    
    expect(getFileTypeFromMagicBytes(padded)).toBe('DICOM');
  });

  it('rejects an invalid file masquerading as PDF (e.g. text file)', () => {
    // "Hello World"
    const buffer = new TextEncoder().encode("Hello World. This is a malicious script.");
    const padded = new Uint8Array(132);
    padded.set(buffer);
    
    expect(getFileTypeFromMagicBytes(padded)).toBeNull();
  });

  it('rejects buffers smaller than 132 bytes', () => {
    // Minimum size required to check DICOM offset is 132 bytes
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    expect(getFileTypeFromMagicBytes(buffer)).toBeNull();
  });
});
