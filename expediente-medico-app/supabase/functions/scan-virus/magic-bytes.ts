/**
 * Helper file to validate Magic Bytes (File Signatures).
 * Prevent disguise attacks by checking the actual file header instead of extension.
 */

// We only support safe clinical file types
export type AllowedFileType = 'PDF' | 'PNG' | 'JPEG' | 'DICOM';

export function getFileTypeFromMagicBytes(buffer: Uint8Array): AllowedFileType | null {
  if (buffer.length < 132) return null; // We need at least 132 bytes to check DICOM

  // PDF: %PDF- (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'PDF';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'PNG';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'JPEG';
  }

  // DICOM: 128-byte preamble followed by "DICM" (44 49 43 4D)
  if (buffer[128] === 0x44 && buffer[129] === 0x49 && buffer[130] === 0x43 && buffer[131] === 0x4D) {
    return 'DICOM';
  }

  return null;
}
