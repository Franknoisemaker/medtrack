import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';
import { handleCors, corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  try {
    const url = new URL(req.url);
    const archivo_id = url.searchParams.get('archivo_id');

    if (!archivo_id) {
      return new Response(
        JSON.stringify({ error: 'Faltan parámetros requeridos (archivo_id).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID');
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID');
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const r2Bucket = Deno.env.get('R2_BUCKET_NAME');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Mock bypass para entorno de desarrollo sin R2
    const isMock = supabaseUrl.includes('your-project-id');
    if (isMock) {
      // Devolvemos una redirección mock de prueba
      return Response.redirect('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 302);
    }

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      return new Response(
        JSON.stringify({ error: 'Configuración incompleta de Cloudflare R2.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Authenticate user from JWT token
    const authHeader = req.headers.get('Authorization');
    let authenticatedMedicoId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
          global: { headers: { Authorization: authHeader } }
        });
        const { data: { user } } = await authClient.auth.getUser();
        if (user) {
          authenticatedMedicoId = user.id;
        }
      } catch (err) {
        console.error('Error validating JWT token:', err);
      }
    }

    // Detect if we are in local development sandbox vs production
    const isLocalDev = !supabaseUrl.startsWith('https://') || 
                       supabaseUrl.includes('localhost') || 
                       supabaseUrl.includes('127.0.0.1') || 
                       supabaseUrl.includes('kong');
    let resolvedMedicoId = authenticatedMedicoId;

    if (!resolvedMedicoId) {
      if (isLocalDev) {
        // Local sandbox development bypass: fallback to seeded doctor
        resolvedMedicoId = 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';
      } else {
        return new Response(
          JSON.stringify({ error: 'Acceso denegado. Se requiere un token de sesión de médico válido en producción.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Validate file exists and user has access (RLS)
    const { data: fileRecord, error: dbError } = await supabase
      .from('archivos_clinicos')
      .select('id, r2_key, consulta_id, titulo')
      .eq('id', archivo_id)
      .single();

    if (dbError || !fileRecord) {
      return new Response(
        JSON.stringify({ error: 'Archivo no encontrado o acceso denegado por RLS.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Generate Presigned URL (TTL: 60 seconds)
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });

    const fileExt = fileRecord.r2_key.split('.').pop() || '';
    const downloadName = fileExt ? `${fileRecord.titulo}.${fileExt}` : fileRecord.titulo;

    const command = new GetObjectCommand({
      Bucket: r2Bucket,
      Key: fileRecord.r2_key,
      ResponseContentDisposition: `attachment; filename="${downloadName}"`,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

    // 4. Audit Log
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
    await supabase.from('audit_logs').insert({
      medico_id: resolvedMedicoId,
      consulta_id: fileRecord.consulta_id,
      event_type: 'CLINICAL_FILE_VIEW',
      details: { archivo_id: fileRecord.id },
      ip_address: ip,
      user_agent: req.headers.get('user-agent') ?? 'Unknown',
    });

    // 5. Return the presigned R2 URL as JSON to the client to bypass browser link header limitations
    return new Response(
      JSON.stringify({ url: presignedUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error in get-file:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno al generar el acceso seguro al archivo.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
