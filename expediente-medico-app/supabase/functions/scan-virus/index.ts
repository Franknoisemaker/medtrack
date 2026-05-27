import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { getFileTypeFromMagicBytes } from './magic-bytes.ts';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  let fileBufferView: Uint8Array | null = null;

  try {
    const cloudmersiveKey = Deno.env.get('CLOUDMERSIVE_API_KEY');
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID');
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID');
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const r2Bucket = Deno.env.get('R2_BUCKET_NAME');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!cloudmersiveKey || !r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      return new Response(
        JSON.stringify({ error: 'Configuración incompleta: Faltan credenciales de Cloudmersive o Cloudflare R2.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const formData = await req.formData();
    
    const file = formData.get('file') as File | null;
    const titulo = formData.get('titulo') as string;
    const categoria = formData.get('categoria') as string;
    const consulta_id = formData.get('consulta_id') as string;
    const medico_id = formData.get('medico_id') as string;

    if (!file || !titulo || !categoria || !consulta_id || !medico_id) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos (file, titulo, categoria, consulta_id, medico_id).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: 'El archivo excede el límite de 25 MB.' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load file into memory
    const arrayBuffer = await file.arrayBuffer();
    fileBufferView = new Uint8Array(arrayBuffer);

    // 1. Magic Bytes Validation
    const fileType = getFileTypeFromMagicBytes(fileBufferView);
    if (!fileType) {
      return new Response(
        JSON.stringify({ error: 'Tipo de archivo no válido o malicioso. Solo se permiten PDF, PNG, JPEG y DICOM.' }),
        { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Cloudmersive Antivirus Scan
    const scanFormData = new FormData();
    scanFormData.append('inputFile', new Blob([arrayBuffer], { type: file.type }), 'clinical_study.bin');

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 15000);

    const scanResponse = await fetch('https://api.cloudmersive.com/virus/scan/file', {
      method: 'POST',
      headers: { 'Apikey': cloudmersiveKey },
      body: scanFormData,
      signal: abortController.signal,
    });
    clearTimeout(timeout);

    if (!scanResponse.ok) {
      throw new Error(`Cloudmersive API error: ${scanResponse.status}`);
    }

    const scanResult = await scanResponse.json();
    
    if (scanResult.CleanResult !== true) {
      return new Response(
        JSON.stringify({ success: false, status: 'INFECTED', details: scanResult.FoundViruses }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Upload to Cloudflare R2
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });

    const fileExt = file.name.split('.').pop() || 'bin';
    const r2Key = `${consulta_id}/${crypto.randomUUID()}.${fileExt}`;

    await s3.send(new PutObjectCommand({
      Bucket: r2Bucket,
      Key: r2Key,
      Body: fileBufferView,
      ContentType: file.type,
    }));

    // 4. Save metadata to Supabase DB
    const { data: fileRecord, error: dbError } = await supabase
      .from('archivos_clinicos')
      .insert({
        consulta_id,
        medico_id,
        titulo,
        categoria,
        r2_key: r2Key,
        scan_status: 'CLEAN',
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Error inserting DB record:', dbError);
      throw new Error('Error al guardar el registro en la base de datos.');
    }

    // 5. Audit Log
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
    await supabase.from('audit_logs').insert({
      medico_id,
      consulta_id,
      event_type: 'CLINICAL_FILE_UPLOAD',
      details: { archivo_id: fileRecord.id, categoria, type: fileType },
      ip_address: ip,
      user_agent: req.headers.get('user-agent') ?? 'Unknown',
    });

    return new Response(
      JSON.stringify({ success: true, status: 'CLEAN', file_id: fileRecord.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error in scan-virus:', err);
    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'El escaneo antivirus excedió el tiempo límite (15s).' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (fileBufferView) {
      fileBufferView.fill(0);
    }
  }
});
