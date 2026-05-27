const supabaseUrl = 'http://127.0.0.1:54321';
const anonKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

async function run() {
  try {
    // 1. Get latest patients
    console.log('Fetching patients...');
    const patientsRes = await fetch(`${supabaseUrl}/rest/v1/pacientes?select=*&order=creado_at.desc&limit=5`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const patients = await patientsRes.json();
    console.log('Latest Patients:', JSON.stringify(patients, null, 2));

    // 2. Get latest consultations
    console.log('\nFetching consultations...');
    const consultationsRes = await fetch(`${supabaseUrl}/rest/v1/consultas?select=*&order=creado_at.desc&limit=5`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const consultations = await consultationsRes.json();
    console.log('Latest Consultations:', JSON.stringify(consultations, null, 2));

    // 3. Get latest audit logs
    console.log('\nFetching audit logs...');
    const auditRes = await fetch(`${supabaseUrl}/rest/v1/audit_logs?select=*&order=creado_at.desc&limit=5`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const auditLogs = await auditRes.json();
    console.log('Latest Audit Logs:', JSON.stringify(auditLogs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  }
}

run();
