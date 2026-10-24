// SOAP notes are stored as armored PGP and decrypted server-side by get_decrypted_soap_note.
// When decryption fails, decrypt_phi_field returns the raw ciphertext instead of an error,
// so the UI must detect it: never display it, and never let autosave write it back
// (it would be encrypted a second time and the note would become unreadable).

const PGP_ARMOR_HEADER = '-----BEGIN PGP MESSAGE-----';

export const DECRYPTION_FAILED_MESSAGE =
  'No se pudo descifrar esta nota. Contacta a soporte; el contenido está intacto en el expediente.';

export function isUndecryptedPayload(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trimStart().startsWith(PGP_ARMOR_HEADER);
}

export function hasUndecryptedField(note: {
  subjetivo?: string | null;
  objetivo?: string | null;
  analisis?: string | null;
  plan?: string | null;
}): boolean {
  return [note.subjetivo, note.objetivo, note.analisis, note.plan].some(isUndecryptedPayload);
}
