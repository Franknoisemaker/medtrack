---
title: "Product Requirements Document (PRD) - MedTrack"
status: "final"
created: "2026-05-20"
updated: "2026-06-11"
version: "1.5"
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

### **Épica 0: Registro, Autenticación y Cifrado del Personal de Salud**

* **[FR-0.1] Portal de Acceso Seguro (Login/Registro):** El médico debe poder registrarse ingresando Nombre completo, Cédula Profesional (Dato Protegido), Correo electrónico y Contraseña. El inicio de sesión validará estas credenciales contra Supabase Auth.
* **[FR-0.2] Cifrado de Cédula Profesional en Registro:** El sistema protegerá la Cédula Profesional del médico en reposo. Al registrarse, el trigger de base de datos (`handle_new_medico`) interceptará la creación de la cuenta y encriptará de forma simétrica la cédula profesional en la columna `cedula_cifrada` de la tabla `medicos` utilizando una llave staff (`staff_encryption_key`) del vault.
* **[FR-0.3] Descifrado al Vuelo y Aislamiento por Registro:** El perfil decrypted del médico (incluyendo su Cédula Profesional descifrada) solo se recuperará bajo demanda mediante la RPC `get_decrypted_medico` firmada con `SECURITY DEFINER`. Dicha RPC validará que el médico autenticado (`auth.uid()`) coincida estrictamente con el ID solicitado, previniendo escalamiento de privilegios.
* **[FR-0.4] Protección de Contraseñas en Cliente (Memory Wipe):** Para evitar la exposición involuntaria de contraseñas mediante la inspección de elementos o herramientas de depuración del navegador, el formulario de autenticación limpiará inmediatamente la variable de estado (`setPassword('')`) al momento de enviar el formulario.
* **[FR-0.5] Recuperación de Contraseña:** El portal seguro permitirá a los médicos solicitar un enlace de restablecimiento de contraseña vía correo electrónico en caso de olvido.

### **Épica 1: Motor de Agendamiento y Emisión de Tokens**

* **[FR-1.1] Registro de Cita:** El médico o asistente debe poder crear una cita en la agenda ingresando únicamente: Nombre completo del paciente, Teléfono móvil, Correo electrónico (opcional) y Fecha/Hora. El sistema creará la cita en estado `PENDING_ONBOARDING`.
* **[FR-1.2] Generación de Enlace JWT (Magical Link):** Al guardar la cita, el backend generará un JSON Web Token (JWT) firmado digitalmente con una clave secreta.
  * **Payload:** ID de la Cita y Fecha/Hora de expiración (TTL de 24 horas previo a la cita).
  * **Estructura de la URL:** `https://medtrack.mx/onboarding?token=JWT_STRING`
* **[FR-1.3] Distribución del Enlace:** El sistema expondrá una acción rápida en la interfaz para copiar la URL generada al portapapeles, permitiendo al médico o asistente enviarla manualmente a través de canales directos (WhatsApp personal, SMS o correo).
* **[FR-1.4] Buscador de Pacientes y Autocompletado:** El formulario de agendamiento de citas contará con un buscador predictivo que consultará la tabla `pacientes` en tiempo real (o un conjunto de datos simulados en local) al escribir más de dos caracteres. Si el paciente ya está registrado, el médico o asistente podrá seleccionarlo de la lista, autocompletando automáticamente los campos de nombre, teléfono y correo, y asociando la cita directamente a su ID de paciente existente.
* **[FR-1.5] Esquema de Consultas de Control o Seguimiento (Bypass de Onboarding):** Si el paciente seleccionado en el buscador es un paciente recurrente con expediente clínico pre-existente, la interfaz activará dinámicamente un control ("Cita de Seguimiento Activa"). Al habilitarse, se omitirá por completo el proceso de onboarding por enlace móvil y el soft-gate de autenticación. La cita se registrará directamente en estado `ACTIVE`, quedando lista en el dashboard del médico para iniciar la consulta SOAP de control de forma inmediata.
* **[FR-1.6] Agendamiento de Citas Recurrentes:** El formulario de agendamiento permitirá programar múltiples consultas en bloque bajo un esquema recurrente. El usuario especificará la frecuencia (días, semanas o meses), el intervalo y el total de ocurrencias (de 2 a 12 citas). El sistema creará la secuencia de citas en una sola transacción asíncrona, mostrando una bitácora detallada con accesos rápidos calendarizados en la pantalla de éxito.

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
* **[FR-2.6] Consentimiento de Comunicaciones (Doble Checkbox de Privacidad):** En la primera pantalla del portal de onboarding clínico, se implementará un esquema de consentimiento en dos niveles mediante controles interactivos separados:
  * *Aceptación del Aviso de Privacidad (Obligatorio):* Requerido bajo la normativa NOM-024 / LFPDPPP para iniciar la captura de datos.
  * *Envío de Recordatorios y Notificaciones (Opcional):* Checkbox voluntario que permite al paciente autorizar o declinar el envío de recordatorios de citas y avisos médicos vía WhatsApp o correo electrónico.
* **[FR-2.7] Purgado de Memoria RAM "Anti-Shoulder Surfing" y Bloqueo de Historial:** Para mitigar fugas accidentales de información médica sensible en dispositivos móviles (hombros mirones o pérdida del teléfono), una vez enviado el formulario de onboarding de forma exitosa, el frontend eliminará de forma inmediata toda la información de la memoria RAM del cliente (`setState(null)`). Adicionalmente, el sistema reemplazará la URL de la sesión en el historial del navegador (`history.replaceState()`) para inhabilitar el botón de retroceso ("Atrás") del navegador, mostrando una pantalla estática de éxito e instando al usuario a cerrar la pestaña.

### **Épica 3: Dashboard Médico y Expediente Clínico Central**

* **[FR-3.1] Kanban y Estado de Expedientes:** El Workspace del médico mostrará los pacientes del día en una agenda tipo Kanban o tabla, con indicadores de estado visuales claros: `Expediente Listo` (onboarding completado en verde) y `Pendiente de Registro` (en gris).
* **[FR-3.2] Sidebar Sticky de Triage:** Al seleccionar un paciente con onboarding completado, el lateral izquierdo del dashboard mantendrá fijo un panel de alto contraste con los datos clínicos vitales capturados (Alergias en rojo destacado, Medicamentos en amarillo y Motivo de consulta).
* **[FR-3.3] Editor de Notas SOAP:** Área central para registro de la consulta médica dividida en cuatro campos estructurados obligatorios en texto plano:
  * **S (Subjetivo):** Síntomas y narración del paciente.
  * **O (Objetivo):** Hallazgos físicos, signos vitales, exploración.
  * **A (Análisis):** Juicio clínico y diagnósticos.
  * **P (Plan):** Tratamiento, medicamentos recetados y estudios ordenados.
  * **Autoguardado Silencioso y Resiliencia Offline (IndexedDB + RPC):** El sistema implementará un flujo de autoguardado en dos niveles para prevenir pérdida de datos:
    * *Guardado Local (IndexedDB):* Los cambios en los campos SOAP se guardarán localmente en `IndexedDB` en el navegador del médico bajo un esquema debaneado de 5 segundos.
    * *Sincronización Cloud (RPC):* Cada 30 segundos, el borrador local se sincronizará de forma asíncrona con Supabase invocando la RPC `save_soap_draft`, la cual cifra de forma simétrica (PGP) los campos del borrador antes de guardarlos.
    * *Detección de Estado de Red:* La interfaz mostrará estados claros de guardado (`"Sin conexión — borrador local"`, `"Guardando borrador..."`, `"Borrador guardado"`). Si el navegador pierde conexión, el sistema almacenará únicamente en IndexedDB y re-sincronizará automáticamente con Supabase tan pronto como se recupere la conexión a internet.
    * *Contingencia REST:* En caso de fallas en la RPC o ausencia de llaves del vault en entornos de desarrollo local, el sistema aplicará un fallback de contingencia insertando directamente mediante REST y utilizando un prefijo de cifrado local simulado (`[PGP_ENCRYPTED]_`).
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
* **[FR-3.8] Atajos y Quick Chips Clínicos en Editor SOAP:** Cada sección del editor SOAP (S, O, A, P) contará con un listado dinámico de "Quick Chips" (atajos de texto clínico rápido frecuentemente utilizados, ej. 'TA normal', 'Sin fiebre', 'Manejo ambulatorio'). Al hacer clic en un chip, el texto correspondiente se insertará automáticamente al final del campo activo del editor, seguido de un punto y un espacio, mejorando la velocidad de captura del médico. El sistema registrará de forma defensiva e inmutable cada inserción bajo el evento `SOAP_CHIP_INSERTED` en el Audit Trail.
* **[FR-3.9] Notas Aclaratorias con Firma HMAC Criptográfica:** Conforme a la NOM-004-SSA3-2012, las notas SOAP firmadas son de solo lectura y bloqueadas en base de datos. Sin embargo, para realizar precisiones clínicas posteriores, el sistema implementará un módulo de "Notas Aclaratorias" (longitud mínima de 10 caracteres) indexadas a la nota principal. Al guardar una aclaración, el sistema calculará un sello de firma digital inmutable mediante un algoritmo criptográfico `HMAC-SHA256` utilizando una clave secreta clínica (`CLINICAL_SECRET_KEY`) y la guardará en la tabla `soap_aclaraciones`.
* **[FR-3.10] Descifrado de Triage Seguro en Capa de DB y Registro en Audit Trail:** La visualización de la información clínica del paciente (Alergias, Medicamentos, Padecimientos y Motivo de Consulta) desde el Sidebar Sticky de Triage operará de forma cifrada de extremo a extremo. El descifrado se realizará exclusivamente en el motor de base de datos a través de una función RPC segura (`get_decrypted_triage`), la cual descifra las columnas mediante `pgp_sym_decrypt` utilizando llaves resguardadas en Supabase Vault. Como efecto colateral atómico y obligatorio, la ejecución de la RPC insertará en la misma transacción un registro del evento `CLINICAL_RECORD_VIEW` en la tabla de auditoría, capturando el ID del médico consultante, la dirección IP del cliente y el User-Agent.
* **[FR-3.11] Directorio Clínico de Pacientes (Buscador General):** El dashboard del médico incluirá una pestaña de "Pacientes" que funcionará como un directorio clínico unificado. Este módulo listará alfabéticamente todos los pacientes atendidos por el médico, con búsqueda predictiva debaneada (300ms de retraso), paginación de 20 elementos por página, cálculo en tiempo real de la edad (a partir de la fecha de nacimiento), indicador de última consulta realizada y un botón de acceso directo "Ver / Editar" para abrir su expediente clínico histórico.
* **[FR-3.12] Módulo de Ingesta de Notas SOAP Históricas:** Con el fin de permitir la migración o el registro de consultas pasadas del paciente (necesario para poblar las curvas históricas de evolución clínica), el expediente clínico del paciente incluirá un control ("Agregar Nota Histórica"). Este control abrirá un modal seguro que permitirá al médico seleccionar una fecha y hora pasada, capturar la somatometría (calculando el IMC en tiempo real) y completar los cuatro campos estructurados de la nota SOAP. Al guardar, el sistema creará una consulta en estado `COMPLETED` con el timestamp histórico y llamará a la Edge Function `sign-note` para cifrar y firmar criptográficamente la nota de forma retroactiva, integrándola de forma segura en la línea de tiempo del paciente.
* **[FR-3.13] Línea de Tiempo de Consultas con Carga Asíncrona (Timeline):** El expediente de cada paciente incluirá una sección visual de "Línea de Tiempo de Consultas" dividida en dos pestañas interactivas: "Programadas" (citas en estado de Onboarding o Activas) y "Históricas" (citas Concluidas o Canceladas). El sistema mostrará badges de estado específicos (verde, azul, naranja, rojo) y un contenedor con borde destacado para la "Consulta Actual". Al hacer clic en cualquier consulta histórica concluida, se abrirá un panel desplegable de tipo acordeón que cargará asíncronamente y descifrará en tiempo real las notas SOAP asociadas a dicha fecha, permitiendo al médico revisar consultas pasadas en una sola pantalla unificada sin perder el contexto actual.

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
  * `SOAP_CHIP_INSERTED`: Inserción de atajo clínico pre-formateado en notas SOAP (consulta_id, campo, chip, timestamp).

---

## **5. Arquitectura de Seguridad (PHI y PII)**

* **[SEC-1] Cifrado en Tránsito:** Uso forzoso de TLS 1.3 (fallback mínimo TLS 1.2) en todos los endpoints públicos y privados. Redirección HTTP estricta a HTTPS (HSTS configurado).
* **[SEC-2] Cifrado en Reposo:** Cifrado nativo de base de datos de bloque completo con AES-256. Adicionalmente, las notas SOAP, diagnósticos y padecimientos del paciente contarán con cifrado a nivel de columna (Column-Level Encryption) utilizando claves administradas de forma segura (KMS).
* **[SEC-3] Sanitización XSS:** Sanitización estricta de todos los campos de texto libre antes de su guardado y renderizado mediante bibliotecas de backend (ej. DOMPurify o sanitizadores recursivos nativos). Queda prohibida la inyección directa de HTML sin sanitizar (`dangerouslySetInnerHTML` u homólogos).
* **[SEC-4] Control de Acceso por Roles (RBAC):**
  * `Médico (Admin)`: Lectura/Escritura completa en expedientes y configuración de la agenda.
  * `Asistente`: Lectura/Escritura en agenda; prohibida la lectura de campos clínicos (Alergias, SOAP, diagnósticos CIE-10, archivos clínicos adjuntos).
* **[SEC-5] Telemetría y Analíticas de Uso Coherentes con Privacidad (Analytics):** Para comprender el comportamiento del usuario y la conversión del producto sin comprometer la confidencialidad de la información médica (bajo cumplimiento de LFPDPPP y NOM-024):
  * **Exclusión Absoluta de PHI/PII:** Queda estrictamente prohibido transmitir o almacenar cualquier dato de salud protegido (PHI) o información de identificación personal (PII) de pacientes (tales como nombres, teléfonos, correos, fechas de nacimiento, notas SOAP, diagnósticos, alergias o padecimientos) en la plataforma de analíticas.
  * **Enmascaramiento y Anonimización:** Se implementará una herramienta de analíticas (ej. Plausible Analytics o PostHog en modalidad auto-hospedada dentro de la infraestructura HIPAA/SOC2 del proyecto, o bien un SaaS comercial restrictivo) configurada para enmascarar direcciones IP de forma irreversible, excluir parámetros de consulta en las URLs (eliminando los tokens JWT del Soft-Gate) y desactivar rastreadores de sesión (session replays) en pantallas de captura de datos clínicos.
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
