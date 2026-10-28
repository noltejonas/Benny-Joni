import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { apnsConfigFrom, apnsConfigured, buildApnsJwt, sendToDevices } from '../_shared/apns.ts';
import { createKickHandler, type KickDelivery, type KickSkip } from '../_shared/kick.ts';

const config = apnsConfigFrom(k => Deno.env.get(k));
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Die Function prüft selbst per auth.getUser; keine Trust-Entscheidung nur anhand
// eines dekodierten JWT oder einer vom Client übergebenen sender_id.
Deno.serve(createKickHandler({
  ready: () => apnsConfigured(config),
  authenticate: async token => {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  reserve: async (sender, competition, recipient) => {
    const { data, error } = await admin.rpc('reserve_teammate_kick', {
      p_competition: competition, p_recipient: recipient, p_sender: sender,
    });
    if (error || !data) throw new Error('reservation_failed');
    return data as { request_id: string } | KickSkip;
  },
  loadDelivery: async (request, sender) => {
    const { data, error } = await admin.rpc('teammate_kick_delivery', { p_request: request, p_sender: sender });
    if (error || !data) throw new Error('delivery_lookup_failed');
    return data as KickDelivery | KickSkip;
  },
  send: async (tokens, payload) => {
    const jwt = await buildApnsJwt({ keyId: config.keyId, teamId: config.teamId, privateKeyPem: config.privateKeyPem });
    const result = await sendToDevices(config, jwt, tokens, payload);
    if (result.dead.length) {
      try { await admin.from('device_tokens').delete().in('token', result.dead); } catch { /* Versand-Ergebnis bleibt gültig */ }
    }
    return result;
  },
  finish: async (request, state) => {
    const { error } = await admin.from('teammate_kicks').update({
      state, sent_at: state === 'sent' ? new Date().toISOString() : null,
    }).eq('id', request).eq('state', 'reserved');
    if (error) throw new Error('status_update_failed');
  },
}));
