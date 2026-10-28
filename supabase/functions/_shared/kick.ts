// Manueller, freiwilliger Trainingsanstupser. Keine freien Nachrichten:
// Die Function wählt einen freundlichen Spruch in der Empfängersprache.
export type KickLang = 'de' | 'en' | 'fi' | 'sv';
export type KickReason = 'not_allowed' | 'disabled' | 'quiet_hours' | 'no_device' | 'already_sent_today' | 'daily_limit';
export interface KickDelivery {
  request_id: string;
  sender_id: string;
  competition_id: string;
  sender_name: string;
  competition_name: string;
  language?: string | null;
  tokens: string[];
}
export interface KickSkip { reason: KickReason }
export interface KickDeps {
  ready(): boolean;
  authenticate(token: string): Promise<string | null>;
  reserve(sender: string, competition: string, recipient: string): Promise<{ request_id: string } | KickSkip>;
  loadDelivery(request: string, sender: string): Promise<KickDelivery | KickSkip>;
  send(tokens: string[], payload: Record<string, unknown>): Promise<{ sent: number }>;
  finish(request: string, state: 'sent' | 'failed' | 'cancelled'): Promise<void>;
}

const TEXT = {
  de: {
    someone: 'Dein Trainingspartner', title: (name: string) => `🦵 Arschkick von ${name}`,
    phrases: ['Dein Sofa schafft das kurz ohne dich. Zeit für einen Satz! 💪', 'Die Hanteln vermissen dich. Ein Satz sagt mehr als tausend Ausreden! 😄', 'Kurze Durchsage vom Sofa: Du bist für einen Satz freigestellt. Los geht’s! 🔥'],
  },
  en: {
    someone: 'Your training partner', title: (name: string) => `🦵 A kick from ${name}`,
    phrases: ['Your sofa can manage without you for a minute. Time for a set! 💪', 'The weights miss you. One set beats a thousand excuses! 😄', 'A message from your sofa: you’re free to go and train. Let’s do this! 🔥'],
  },
  fi: {
    someone: 'Treenikaverisi', title: (name: string) => `🦵 Treenipotku: ${name}`,
    phrases: ['Sohva pärjää hetken ilman sinua. Yhden sarjan aika! 💪', 'Painoilla on ikävä sinua. Yksi sarja voittaa tuhat tekosyytä! 😄', 'Viesti sohvalta: saat mennä treenaamaan. Nyt menoksi! 🔥'],
  },
  sv: {
    someone: 'Din träningskompis', title: (name: string) => `🦵 En spark från ${name}`,
    phrases: ['Soffan klarar sig utan dig en stund. Dags för ett set! 💪', 'Vikterna saknar dig. Ett set slår tusen ursäkter! 😄', 'Ett meddelande från soffan: du får gå och träna. Nu kör vi! 🔥'],
  },
};

export function kickAlert(input: Pick<KickDelivery, 'request_id' | 'sender_name' | 'competition_name' | 'language'>) {
  const lang = Object.hasOwn(TEXT, input.language ?? '') ? input.language as KickLang : 'de';
  const t = TEXT[lang];
  const clean = (s: string, limit: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
  const sender = clean(input.sender_name, 30) || t.someone;
  const competition = clean(input.competition_name, 40);
  // Stabil pro Anfrage: Wiederholte Verarbeitung würde denselben Spruch wählen.
  const n = [...input.request_id].reduce((a, c) => a + c.charCodeAt(0), 0) % t.phrases.length;
  return { title: t.title(sender), body: t.phrases[n] + (competition ? ` · ${competition}` : '') };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: CORS });
const skip = (reason: KickReason) => reply(reason === 'not_allowed' ? 403 : 200, { sent: false, reason });

export function createKickHandler(deps: KickDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return reply(401, { error: 'not_authenticated' });
    let body;
    try { body = await req.json(); } catch { return reply(400, { error: 'invalid_request' }); }
    if (!body || typeof body !== 'object' || typeof body.competition_id !== 'string' || typeof body.recipient_id !== 'string'
      || !UUID.test(body.competition_id) || !UUID.test(body.recipient_id)) {
      return reply(400, { error: 'invalid_request' });
    }
    let requestId: string | null = null;
    try {
      // Sender nie aus dem Body übernehmen; der Auth-Server prüft sein Token.
      const sender = await deps.authenticate(token);
      if (!sender) return reply(401, { error: 'not_authenticated' });
      if (sender === body.recipient_id) return skip('not_allowed');
      if (!deps.ready()) return reply(503, { error: 'unavailable' });
      const reserved = await deps.reserve(sender, body.competition_id, body.recipient_id);
      if ('reason' in reserved) return skip(reserved.reason);
      requestId = reserved.request_id;
      const context = await deps.loadDelivery(requestId, sender);
      if ('reason' in context) {
        await deps.finish(requestId, 'cancelled');
        return skip(context.reason);
      }
      if (!context.tokens.length) {
        await deps.finish(requestId, 'cancelled');
        return skip('no_device');
      }
      const result = await deps.send(context.tokens, {
        aps: { alert: kickAlert(context), sound: 'default' },
        kind: 'teammate_kick', competition_id: context.competition_id, sender_id: context.sender_id,
      });
      // Ein APNs-Timeout kann bereits zugestellt sein: den Tagesplatz bei
      // unklarem Ergebnis nicht freigeben, um doppelte Kicks zu verhindern.
      // Die Reservierung schützt schon gegen Wiederholung. Ein Fehler beim
      // Protokollieren darf einen bestätigten APNs-Versand nicht als fehlgeschlagen
      // anzeigen und die Person dadurch zum erneuten Tippen verleiten.
      try { await deps.finish(requestId, result.sent > 0 ? 'sent' : 'failed'); } catch { /* Reservierung bleibt */ }
      return result.sent > 0 ? reply(200, { sent: true }) : reply(502, { sent: false, reason: 'delivery_failed' });
    } catch {
      if (requestId) {
        try { await deps.finish(requestId, 'failed'); } catch { /* Tagesplatz bleibt reserviert */ }
      }
      return reply(503, { error: 'unavailable' });
    }
  };
}
