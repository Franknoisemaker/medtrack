-- Seeding local development database with standard compliant mock clinical records
-- Matches the UUIDs configured in our frontend to ensure seamless integration testing.

-- 1. Seed Doctor (Dr. Alejandro Guerrero)
INSERT INTO medicos (id, nombre, cedula_cifrada, email, creado_at)
VALUES (
    'a6b12a8a-e55d-4f11-8ac1-f11181283c44',
    'Dr. Alejandro Guerrero',
    '[PGP_ENCRYPTED]_12345678',
    'alejandro.doctor@medtrack.mx',
    timezone('utc'::text, now())
) ON CONFLICT (id) DO NOTHING;

-- 2. Seed Patient (Elena Ruiz Mendoza)
INSERT INTO pacientes (
    id, 
    nombre, 
    fecha_nacimiento, 
    telefono, 
    email, 
    contacto_emergencia_nombre, 
    contacto_emergencia_telefono, 
    alergias_cifrado, 
    medicamentos_cifrado, 
    padecimientos_cifrado, 
    creado_at
) VALUES (
    'b2b12a8a-e55d-4f11-8ac1-f11181283c45',
    'Elena Ruiz Mendoza',
    '1988-04-12',
    '5543210987',
    'elena.ruiz@gmail.com',
    'Juan Ruiz (Padre)',
    '5511223344',
    '[PGP_ENCRYPTED]_Penicilina, Sulfas',
    '[PGP_ENCRYPTED]_Metformina 850mg c/12h',
    '[PGP_ENCRYPTED]_Diabetes Tipo 2, Hipertension controlada',
    timezone('utc'::text, now())
) ON CONFLICT (id) DO NOTHING;

-- 3. Seed Consultation (Elena's active consultation matching Frontend UUID)
INSERT INTO consultas (
    id,
    medico_id,
    paciente_id,
    fecha_hora,
    status,
    motivo_consulta_cifrado,
    creado_at
) VALUES (
    'd3b07384-d113-4ec5-a55d-3d441113b2c2',
    'a6b12a8a-e55d-4f11-8ac1-f11181283c44',
    'b2b12a8a-e55d-4f11-8ac1-f11181283c45',
    timezone('utc'::text, now()),
    'ACTIVE',
    '[PGP_ENCRYPTED]_Control de glucemia mensual. Reporta niveles en ayuno de 140 mg/dL esta semana.',
    timezone('utc'::text, now())
) ON CONFLICT (id) DO NOTHING;
