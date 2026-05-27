---
title: "Product Requirements Document (PRD) - MedTrack"
status: "final"
created: "2026-05-20"
updated: "2026-05-26"
version: "1.2"
---

# **Product Requirements Document (PRD)**

**Producto:** MedTrack (Sistema Integrado de Captura y Expediente Clínico Digital)  
**Rol:** Technical Product Owner  
**Mercado Objetivo:** Profesionales de la salud en México (Práctica Privada)  
**Estado:** Listo para Diseño de UX y Arquitectura  

---

## **1. Visión del Producto**

Desarrollar una plataforma integral de gestión de expedientes clínicos que elimine el tiempo muerto en la recolección de datos iniciales. El sistema permitirá que los pacientes completen su información demográfica y clínica básica (Triage/Onboarding) a través de un flujo web seguro y sin fricción (enlaces JWT cifrados) antes de su primera consulta. El médico contará con un expediente estandarizado y listo para revisión en el primer contacto, operando bajo estricto cumplimiento de la normativa mexicana de protección de datos de salud y privacidad (NOM-004, NOM-024 y LFPDPPP).

---

## **2. Perfiles de Usuario (Personas)**

| Perfil | Descripción | Necesidades Principales |
| :---- | :---- | :---- |
| **Médico (Admin)** | Especialista titular de la práctica médica privada. | Visualizar historial completo antes de la cita, registrar notas SOAP rápido, cumplir con la normativa legal de salud sin fricción administrativa. |
| **Paciente** | Usuario final del Onboarding clínico pre-consulta. | Proceso intuitivo en dispositivo móvil, sin contraseñas, que garantice la absoluta privacidad de sus datos sensibles de salud. |
| **Asistente** | Personal administrativo de apoyo al médico. | Agendar citas, enviar recordatorios, acceso limitado a agenda y datos de contacto (sin visualización de PHI). |

---

## **3. Requerimientos Funcionales (Épicas y Casos de Uso)**

### **Épica 1: Motor de Agendamiento y Emisión de Tokens**

* **[FR-1.1] Registro de Cita:** El médico o asistente debe poder crear una cita en la agenda ingresando únicamente: Nombre completo del paciente, Teléfono móvil, Correo electrónico (opcional) y Fecha/Hora. El sistema creará la cita en estado `PENDING_ONBOARDING`.
* **[FR-1.2] Generación de Enlace JWT (Magical Link):** Al guardar la cita, el backend generará un JSON Web Token (JWT) firmado digitalmente con una clave secreta.
  * **Payload:** ID de la Cita y Fecha/Hora de expiración (TTL de 24 horas previo a la cita).
  * **Estructura de la URL:** `https://medtrack.mx/onboarding?token=JWT_STRING`
* **[FR-1.3] Distribución del Enlace:** El sistema expondrá una acción rápida en la interfaz para copiar la URL generada al portapapeles, permitiendo al médico o asistente enviarla manualmente a través de canales directos (WhatsApp personal, SMS o correo).

### **Épica 2: Portal de Onboarding del Paciente (Pre-Consulta)**

* **[FR-2.1] Soft-Gate de Autenticación:** Al acceder a la URL, el frontend validará criptográficamente el JWT. Para autorizar la visualización del formulario, solicitará al paciente dos datos de validación cruzada: **Fecha de Nacimiento** y **Número de Teléfono Móvil**.
  * **Control de Fuerza Bruta:** Límite máximo de 3 intentos de validación fallidos. Al superarse el límite, el token se bloquea temporalmente durante 15 minutos en el backend y se muestra un mensaje instando a contactar al consultorio del médico.
* **[FR-2.2] Validación de Estado del Token:** Antes de renderizar el onboarding, el servidor validará que:
  * El token no haya expirado (`exp` del JWT).
  * El estado de la cita en la base de datos sea estrictamente `PENDING_ONBOARDING`.
  * Si la cita ya está marcada como `COMPLETED_ONBOARDING`, redirigirá a una pantalla de confirmación estática que indica "Información recibida con éxito" sin re-exponer ningún dato clínico previamente capturado (previene replay attacks).
* **[FR-2.3] Formulario de Captura Estructurado (Write-Only):** Formulario lineal optimizado para móviles (Mobile-First) con los siguientes campos y validaciones:
  * **Consentimiento Obligatorio:** Checkbox explícito de aceptación del Aviso de Privacidad (NOM-024 / LFPDPPP). Es obligatorio para iniciar la captura de datos.
  * **Datos Personales:** Nombre completo (Read-Only proveniente de la cita), Fecha de Nacimiento (obligatorio), Sexo (Select: Masculino / Femenino / Otro - obligatorio).
  * **Datos de Contacto:** Teléfono (Read-Only), Correo Electrónico (opcional), Contacto de Emergencia (Nombre y Teléfono - obligatorio).
  * **Antecedentes Clínicos:**
    * **Alergias:** Chip-selector interactivo con autocompletado, opción obligatoria "Ninguna", y opción de agregar chips dinámicos personalizados removibles (`[ + Otro ]`).
    * **Medicamentos en Uso:** Chip-selector con autocompletado, opción obligatoria "Ninguno", y opción de agregar chips dinámicos personalizados removibles (`[ + Otro ]`).
    * **Padecimientos Crónicos:** Chip-selector dinámico (opcional).
    * **Motivo de Consulta:** Área de texto libre (mínimo 10 caracteres - obligatorio).
* **[FR-2.4] Envío Seguro:** Al enviar el formulario, los datos se guardarán cifrados en el backend, el estado de la cita cambiará a `COMPLETED_ONBOARDING` en la base de datos y se renderizará una pantalla estática de éxito, inhabilitando los botones de retroceso del navegador.
* **[FR-2.5] Mecanismo QR Soft-Pass para Recepción (Onboarding Asistido):** Si el paciente agota sus 3 intentos de validación segura del Soft-Gate en su dispositivo móvil o experimenta algún inconveniente de acceso, el frontend presentará una opción para generar un "Pase QR" de recepción de corta duración (TTL de 10 minutos). Este QR contendrá un token opaco y cifrado sin información de salud protegida (PHI). Al presentarse en recepción, la asistente podrá escanear el QR con la cámara de su navegador para verificar la cita física, marcando la cita como asistida y habilitando el cuestionario de onboarding en la tableta o terminal del consultorio de manera segura (Write-Only y sin re-exposición de datos previos).

### **Épica 3: Dashboard Médico y Expediente Clínico Central**

* **[FR-3.1] Kanban y Estado de Expedientes:** El Workspace del médico mostrará los pacientes del día en una agenda tipo Kanban o tabla, con indicadores de estado visuales claros: `Expediente Listo` (onboarding completado en verde) y `Pendiente de Registro` (en gris).
* **[FR-3.2] Sidebar Sticky de Triage:** Al seleccionar un paciente con onboarding completado, el lateral izquierdo del dashboard mantendrá fijo un panel de alto contraste con los datos clínicos vitales capturados (Alergias en rojo destacado, Medicamentos en amarillo y Motivo de consulta).
* **[FR-3.3] Editor de Notas SOAP:** Área central para registro de la consulta médica dividida en cuatro campos estructurados obligatorios en texto plano:
  * **S (Subjetivo):** Síntomas y narración del paciente.
  * **O (Objetivo):** Hallazgos físicos, signos vitales, exploración.
  * **A (Análisis):** Juicio clínico y diagnósticos.
  * **P (Plan):** Tratamiento, medicamentos recetados y estudios ordenados.
  * **Autoguardado Silencioso:** Mecanismo de guardado local asíncrono cada 30 segundos en segundo plano para prevenir pérdida de datos por cortes de sesión.
* **[FR-3.4] Integración de Catálogo CIE-10:** El campo de "Análisis (A)" contará con un buscador predictivo que consultará localmente la base de datos del Catálogo Internacional de Enfermedades (CIE-10) en su versión vigente para México, permitiendo indexar códigos diagnósticos exactos (ej. `E11.9` para Diabetes Mellitus tipo 2 sin complicaciones) a la nota clínica.
* **[FR-3.5] Captura de Somatometría y Signos Vitales:** El editor de la consulta médica debe de proveer campos numéricos estructurados obligatorios para registrar en cada visita:
  * Peso (kg) con precisión de un decimal (ej. 72.5 kg).
  * Talla / Altura (cm) en formato entero (ej. 175 cm).
  * Presión Arterial (mmHg) dividida en Sistólica (entero) y Diastólica (entero) (ej. 120/80 mmHg).
* **[FR-3.6] Motor de Análisis Clínico (Peso Ideal e IMC):**
  * **Cálculo de IMC:** El sistema computará en tiempo real el Índice de Masa Corporal aplicando la fórmula estándar: `IMC = Peso (kg) / (Talla (m))²`.
  * **Comparación y Desviación del IMC:** Se comparará el IMC obtenido contra el rango ideal saludable (18.5 - 24.9). El sistema mostrará la diferencia exacta en unidades de IMC con respecto a los límites de referencia (ej. si el IMC es 26.2, indicará `+1.3 unidades de IMC` sobre el límite superior normal).
  * **Cálculo de Peso Ideal y Delta:** Se definirá el Peso Ideal Clínico utilizando la altura del paciente y un IMC de referencia saludable de `22.0 kg/m²` (`Peso Ideal (kg) = (Talla (m))² * 22`). Se calculará la distancia exacta en kg entre el peso registrado y el ideal (ej. `+5.3 kg` o `-2.0 kg`), mostrándolo gráficamente al médico.
* **[FR-3.7] Gráficas de Evolución Temporal (Evolución Clínica):** El expediente debe incorporar una sección visual con gráficas vectoriales (SVG o Canvas) optimizadas para dispositivos táctiles, mostrando la evolución a lo largo del tiempo (eje X: Fecha de visita) de:
  * Histórico de Peso.
  * Histórico de Presión Arterial (curvas separadas de Sistólica y Diastólica).
  * Histórico de IMC.

### **Épica 4: Expediente de Archivos Clínicos Adjuntos (Secure Document Store)**

* **[FR-4.1] Panel de Subida de Documentos:** El Dashboard del médico debe incluir un área interactiva para arrastrar y soltar (Drag and Drop) o seleccionar archivos locales. Se admitirán formatos comunes: PDFs, imágenes (PNG, JPEG, DICOM) y archivos de texto.
  * **Validación de Tipo por Contenido (Magic Numbers):** El backend ignorará por completo la extensión declarada y la cabecera `Content-Type` enviada por el cliente. Validará de manera estricta los primeros bytes del archivo (Magic Bytes o Magic Numbers) en memoria para corroborar que el tipo MIME real coincide estrictamente con la lista blanca autorizada (ej. `%PDF-` para PDF, `\x89PNG` para PNG).
  * **Escaneo de Malware en Tiempo Real (Anti-Malware Sandbox):** Los archivos subidos se enviarán a un búfer temporal aislado y se someterán a un escaneo de firmas de malware y virus en tiempo real mediante un microservicio de análisis (ej. daemon de ClamAV o AWS Lambda con firmas de virus actualizadas y reglas YARA) antes de ser trasladados al almacenamiento permanente. Cualquier archivo sospechoso se destruirá de inmediato, registrando un evento de seguridad de alta prioridad.
  * **Restricción de Tamaño Estricta:** Límite máximo de **25 MB** por archivo. Este tamaño garantiza la compatibilidad con radiografías panorámicas de alta densidad, reportes multi-página escaneados de laboratorios y archivos comprimidos clínicos ligeros, mientras mantiene la estabilidad del escaneo anti-malware en memoria y previene abusos de almacenamiento.
* **[FR-4.2] Metadatos del Archivo:** Al subir el documento, el médico podrá ingresar un título descriptivo (ej. "Química Sanguínea 6 elementos") y seleccionar una categoría (Laboratorio, Imagenología, Recetas externas, Otros). El sistema guardará el timestamp de subida y el ID del médico que lo cargó.
* **[FR-4.3] Visualización y Descarga Segura:** Los archivos asociados al paciente se listarán de forma cronológica en una sección dedicada del expediente clínico. Al hacer clic en un archivo, el sistema abrirá un visualizador integrado en el navegador (en caso de PDFs o imágenes) o permitirá su descarga. El acceso físico al archivo se realizará estrictamente a través de tokens de corta duración generados dinámicamente.

---

## **4. Requerimientos Normativos y de Cumplimiento (México)**

### **LFPDPPP (Protección de Datos Personales en Posesión de Particulares)**
* **[REQ-LFPDPPP-1] Registro de Consentimiento:** Toda recolección de datos sensibles de salud registrará de forma inmutable en el backend: Aceptación del Aviso de Privacidad (Booleano), Timestamp del servidor, Dirección IP del cliente, y User-Agent del navegador.

### **NOM-004-SSA3-2012 (Expediente Clínico)**
* **[REQ-NOM004-1] Retención de 5 años:** Todos los expedientes y notas SOAP deben conservarse por un período mínimo de 5 años. Las eliminaciones físicas en base de datos quedan prohibidas; el sistema utilizará banderas de "Soft Delete" (`deleted_at`) para archivar expedientes en desuso.
* **[REQ-NOM004-2] Inmutabilidad de Notas Guardadas:** Una vez que el médico da clic en "Guardar y Firmar Nota SOAP", el registro correspondiente en la base de datos se bloquea y se vuelve de solo lectura. Queda prohibida la modificación directa de una nota firmada.
* **[REQ-NOM004-3] Módulo de Notas Aclaratorias:** Las correcciones clínicas posteriores se realizarán mediante un registro hijo de "Nota Aclaratoria", indexada al registro SOAP padre, detallando la corrección, el timestamp y la firma del médico.

### **NOM-024-SSA3-2012 (Sistemas de Registro Electrónico para la Salud)**
* **[REQ-NOM024-1] Trazabilidad Inmutable (Audit Trail):** El sistema implementará un microservicio o tabla de auditoría inmutable dedicada a registrar de forma estricta los siguientes eventos:
  * `AUTH_GATE_FAIL`: Intento de validación fallido en el Soft-Gate (IP, timestamp, ID de cita).
  * `AUTH_GATE_SUCCESS`: Acceso exitoso al formulario por parte del paciente.
  * `ONBOARDING_SUBMIT`: Envío exitoso de datos del paciente.
  * `CLINICAL_RECORD_VIEW`: Médico visualiza un expediente clínico (ID del médico, ID del paciente, timestamp).
  * `SOAP_NOTE_CREATE`: Creación e inmutabilidad de nota SOAP.
  * `SOAP_NOTE_ACLARATORIA`: Anexado de nota aclaratoria.
  * `CLINICAL_FILE_UPLOAD`: Carga exitosa de un archivo clínico adjunto (ID del médico, ID del archivo, tamaño, hash).
  * `CLINICAL_FILE_VIEW`: Visualización/descarga de un archivo clínico adjunto (ID del médico, ID del archivo, timestamp).
  * `QR_SOFT_PASS_GENERATE`: Generación del pase QR tras bloqueo o a petición (consulta_id, token_opaco, timestamp).
  * `QR_SOFT_PASS_SCAN`: Escaneo y consumo exitoso del pase QR en recepción (consulta_id, timestamp, rol_asistente).

---

## **5. Arquitectura de Seguridad (PHI y PII)**

* **[SEC-1] Cifrado en Tránsito:** Uso forzoso de TLS 1.3 (fallback mínimo TLS 1.2) en todos los endpoints públicos y privados. Redirección HTTP estricta a HTTPS (HSTS configurado).
* **[SEC-2] Cifrado en Reposo:** Cifrado nativo de base de datos de bloque completo con AES-256. Adicionalmente, las notas SOAP, diagnósticos y padecimientos del paciente contarán con cifrado a nivel de columna (Column-Level Encryption) utilizando claves administradas de forma segura (KMS).
* **[SEC-3] Sanitización XSS:** Sanitización estricta de todos los campos de texto libre antes de su guardado y renderizado mediante bibliotecas de backend (ej. DOMPurify). Queda prohibida la inyección directa de HTML sin sanitizar (`dangerouslySetInnerHTML` u homólogos).
* **[SEC-4] Control de Acceso por Roles (RBAC):**
  * `Médico (Admin)`: Lectura/Escritura completa en expedientes y configuración de la agenda.
  * `Asistente`: Lectura/Escritura en agenda; prohibida la lectura de campos clínicos (Alergias, SOAP, diagnósticos CIE-10, archivos clínicos adjuntos).
* **[SEC-5] Telemetría y Analíticas de Uso Coherentes con Privacidad (Analytics):** Para comprender el comportamiento del usuario y la conversión del producto sin comprometer la confidencialidad de la información médica (bajo cumplimiento de LFPDPPP y NOM-024):
  * **Exclusión Absoluta de PHI/PII:** Queda estrictamente prohibido transmitir o almacenar cualquier dato de salud protegido (PHI) o información de identificación personal (PII) de pacientes (tales como nombres, teléfonos, correos, fechas de nacimiento, notas SOAP, diagnósticos, alergias o padecimientos) en la plataforma de analíticas.
  * **Enmascaramiento y Anonimización:** Se implementará una herramienta de analíticas (ej. Plausible Analytics o PostHog en modalidad auto-hospedada dentro de la infraestructura HIPAA/SOC2 del proyecto, o bien un SaaS comercial restrictivo) configurada para enmascarar direcciones IP de forma irreversible, excluir parámetros de consulta en las URLs (eliminando los tokens JWT del Soft-Gate) y desactivar rastreadores de sesión (session replays) en pantallas de captura de datos clínicos.
  * **Eventos Autorizados:** La analítica se limitará a telemetría agregada y sin estado: tasas de conversión agregadas del onboarding, eventos de clics genéricos en botones de navegación, y tiempos de renderizado.
* **[SEC-6] Aislamiento y Prevención de Ejecución de Archivos (Storage Sandbox):**
  * **UUID y Sanitización de Nombre:** El backend descartará el nombre de archivo original provisto por el usuario para almacenamiento físico. Se generará un UUID v4 único como nombre de archivo en disco/nube. Esto neutraliza por completo ataques de inyección de rutas (Directory Traversal) e intentos de ejecución directa. El nombre legible original se guardará únicamente como metadatos en la base de datos segura.
  * **Desactivación de Permisos de Ejecución:** El contenedor de almacenamiento (ej. bucket privado de AWS S3 / Cloudflare R2) estará configurado con políticas estrictas que prohíben la ejecución de scripts (sin capacidades de CGI, ejecución de código del lado del servidor o lectura pública).
  * **Cabeceras de Visualización Segura:** Al visualizar el archivo mediante la URL temporal firmada (Presigned URL con TTL de 15 minutos), el proxy de archivos inyectará forzosamente las cabeceras de seguridad:
    * `Content-Disposition: attachment; filename="archivo_seguro.pdf"` o `inline` limitado con sanitización estricta.
    * `X-Content-Type-Options: nosniff` (evita que el navegador del médico intente ejecutar código JavaScript oculto dentro de archivos de imagen o PDF falsos).
    * `Content-Security-Policy: default-src 'none'; frame-ancestors 'none';` (bloquea la ejecución de scripts si el archivo se renderiza en un iframe).

---

## **6. Experiencia de Usuario (UX) y Diseño de Interfaz (UI)**

### **Principios de Diseño y Paleta Visual**
* **Estética Médica Higiénica:** Minimizar la carga cognitiva reduciendo decoraciones innecesarias y líneas duras.
* **Paleta de Colores Curada:**
  * **Blues (Principal):** Tonos azul cobalto y marino para botones de acción y estado crítico (`#1e3a8a` / `#2563eb`).
  * **Grises (Superficies):** Fondos suaves y neutros para separación de zonas y tarjetas (`#f5f5f4` / `#e7e5e4`).
  * **Charcoal (Tipografía):** Texto en tonos carbón oscuro (`#1c1917`) para reducir el cansancio visual del médico en pantallas de alta densidad.
  * **Alertas:** Rojo suave (`#dc2626`) exclusivo para Alergias críticas de pacientes en el Sticky Triage.
* **Microinteracciones y Respuestas Fluidas:**
  * Implementación de *Skeleton Loaders* de grises suaves durante la carga de expedientes.
  * Notificaciones de confirmación no intrusivas en la interfaz (*Toasts*) con desvanecimiento automático tras 3 segundos.

---

## **7. Límites del Sistema (Non-Goals) — MVP**

Para asegurar la velocidad de entrega del MVP de MedTrack, las siguientes características quedan **explícitamente excluidas** de esta versión:
* **[NON-GOAL-1] Facturación Electrónica (CFDI):** No habrá integración con proveedores de timbrado de facturas para la normativa fiscal de México.
* **[NON-GOAL-2] Pasarela de Pagos:** La plataforma no procesará cobros a pacientes, cargos de citas, ni suscripciones directamente en esta fase.
* **[NON-GOAL-3] Módulo de Telemedicina:** No se desarrollará infraestructura de videollamadas. Las consultas son presenciales.
* **[NON-GOAL-4] Gestión Multi-clínica:** El sistema está diseñado exclusivamente para un solo consultorio / médico independiente en esta fase de lanzamiento.

---

## **8. Índice de Suposiciones Técnicas (Assumptions)**

* **[ASSUMPTION-1] Distribución Manual:** Se asume que en el MVP el envío de la URL JWT al paciente se realizará de forma manual (copiar/pegar) por el médico o asistente desde su dispositivo (ej. usando WhatsApp Web), evitando inicialmente los costos y la complejidad técnica de integrar y pre-aprobar plantillas en la API oficial de WhatsApp Business.
* **[ASSUMPTION-2] Hosting Regulado:** Se asume que el backend y las bases de datos de MedTrack se hospedarán en servidores en la nube que cuenten con certificación de cumplimiento HIPAA / SOC2 (ej. AWS o Google Cloud), garantizando que las capacidades físicas y lógicas cumplen con la LFPDPPP y la NOM-024 de manera heredada.

---

## **9. Métricas de Éxito y Contra-métricas**

### **Métricas de Éxito**
* **Tasa de Completitud del Onboarding (Conversión):** Porcentaje de pacientes agendados que completan su formulario pre-consulta antes del primer contacto médico. **Meta: > 85%**.
* **Eficiencia Clínica del Primer Contacto:** Reducción del tiempo promedio que el médico dedica a capturar la información del paciente en el primer minuto de la consulta. **Meta: Reducción de ~10 minutos a < 2 minutos**.
* **Tiempo de Carga Móvil:** Tiempo de renderizado completo del portal de onboarding del paciente en conexiones móviles promedio. **Meta: < 1.5 segundos**.

### **Contra-métricas**
* **Rebote en el Soft-Gate:** Porcentaje de pacientes que abren la URL pero abandonan la pantalla de validación cruzada. **Meta: < 5%**.
* **Fricción Legal:** Porcentaje de abandonos justo en la pantalla de aceptación obligatoria del Aviso de Privacidad. **Meta: < 3%**.
* **Tasa de Bloqueo Técnico:** Número de pacientes legítimos que reportan bloqueo temporal por ingresar erróneamente su teléfono o fecha de nacimiento en el Soft-Gate. **Meta: < 1%**.

---

## **10. Glosario Técnico y Clínico**

* **ECE (Expediente Clínico Electrónico):** Sistema de información para registrar datos médicos estructurados.
* **NOM-004-SSA3-2012:** Norma Oficial Mexicana que establece los criterios obligatorios de integración, uso, propiedad y retención del expediente clínico.
* **NOM-024-SSA3-2012:** Norma Oficial Mexicana aplicable a los sistemas de registro electrónico de salud, regulando la trazabilidad, interoperabilidad y seguridad.
* **LFPDPPP:** Ley Federal de Protección de Datos Personales en Posesión de los Particulares (reguladora del Aviso de Privacidad y derechos ARCO).
* **PHI (Protected Health Information):** Información confidencial sobre la salud física, mental o tratamientos de un individuo.
* **PII (Personally Identifiable Information):** Cualquier dato que permita identificar de forma única a una persona (nombre, CURP, teléfono).
* **Soft-Gate:** Pantalla de validación de identidad ligera y segura sin requerir creación de contraseñas.
* **SOAP Note (Nota SOAP):** Estándar clínico de documentación médica estructurada: *Subjective* (Subjetivo), *Objective* (Objetivo), *Assessment* (Análisis), y *Plan* (Plan de tratamiento).
* **CIE-10:** Clasificación Estadística Internacional de Enfermedades y Problemas Relacionados con la Salud en su décima edición.
