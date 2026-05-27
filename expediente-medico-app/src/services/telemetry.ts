// Telemetry and Logging Service with proactive Anti-PHI sanitization
// Complies to LFPDPPP legal standards to prevent accidental patient data leaks

const PHI_BLACKLIST = [
  'nombre',
  'telefono',
  'email',
  'alergias',
  'medicamentos',
  'padecimientos',
  'subjetivo',
  'objetivo',
  'analisis',
  'plan',
  'peso_kg',
  'talla_cm',
  'imc',
  'peso_ideal',
  'firma',
  'cedula',
  'motivo_consulta',
];

/**
 * Recursively scans and censors any key containing blacklisted PHI terms.
 */
export function sanitizePayload(payload: any): any {
  if (payload === null || payload === undefined) {
    return payload;
  }

  // Handle arrays
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item));
  }

  // Handle objects
  if (typeof payload === 'object') {
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(payload)) {
      const lowerKey = key.toLowerCase();
      // Check if key is suspicious or matches any blacklisted word
      const isPhi = PHI_BLACKLIST.some((term) => lowerKey.includes(term));
      
      if (isPhi) {
        sanitized[key] = '[REDACTED_PHI]';
        console.warn(`[Anti-PHI Sentinel] Sanitized clinical property: "${key}"`);
      } else {
        sanitized[key] = sanitizePayload(payload[key]);
      }
    }
    return sanitized;
  }

  return payload;
}

/**
 * Log a structured telemetry event safely censored from PHI leaks.
 */
export function logEvent(event: string, payload: Record<string, any>): Record<string, any> {
  const sanitized = sanitizePayload(payload);
  
  // Simulated external service sending (e.g. Sentry/Mixpanel)
  console.info(`[Telemetry Event] ${event}`, sanitized);
  
  return sanitized;
}

/**
 * Log an error safely sanitizing any clinical context before sending to monitoring tools.
 */
export function logError(error: Error, context?: Record<string, any>): { errorName: string; errorMessage: string; context: any } {
  const sanitizedContext = context ? sanitizePayload(context) : {};
  
  console.error(`[Telemetry Error] ${error.name}: ${error.message}`, {
    stack: error.stack,
    context: sanitizedContext,
  });
  
  return {
    errorName: error.name,
    errorMessage: error.message,
    context: sanitizedContext,
  };
}
