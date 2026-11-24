// Supabase Edge Function: submit-sos/index.ts
// Validates authenticated user, prevents duplicate SOS submissions via idempotency_key,
// stores consent-based coordinates, and notifies authorized responders.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  }

  const body = await req.json();
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null;
  const adminClient = createClient(supabaseUrl, serviceKey);

  if (idempotencyKey) {
    const { data: existing } = await adminClient
      .from('incidents')
      .select('id, incident_number, status, priority')
      .eq('idempotency_key', idempotencyKey)
      .eq('reporter_id', authData.user.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ incident: existing, deduplicated: true }), { status: 200 });
    }
  }

  const refNum = `SOS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const { data: incident, error: insertErr } = await adminClient
    .from('incidents')
    .insert({
      incident_number: refNum,
      reporter_id: authData.user.id,
      is_sos: true,
      category: String(body.category || 'Physical safety threat').slice(0, 100),
      title: `SOS Emergency Alert: ${String(body.category || 'Emergency').slice(0, 100)}`,
      description: String(body.description || 'Immediate SOS triggered.').slice(0, 2000),
      priority: 'critical',
      status: 'Submitted',
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  if (insertErr) {
    return new Response(JSON.stringify({ error: 'Failed to create SOS alert' }), { status: 500 });
  }

  await adminClient.from('incident_locations').insert({
    incident_id: incident.id,
    latitude: body.consentGiven ? body.latitude : null,
    longitude: body.consentGiven ? body.longitude : null,
    location_description: String(body.locationDescription || '').slice(0, 300),
    consent_given: Boolean(body.consentGiven),
    consent_time: body.consentGiven ? new Date().toISOString() : null,
    captured_at: body.consentGiven && body.latitude ? new Date().toISOString() : null,
  });

  await adminClient.from('audit_logs').insert({
    actor_id: authData.user.id,
    action: 'SOS_SUBMITTED',
    resource_type: 'incident',
    resource_id: incident.id,
    metadata: { incident_number: refNum },
  });

  return new Response(JSON.stringify({ incident }), { status: 201 });
});
