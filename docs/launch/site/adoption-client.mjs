// Gleiche öffentliche Projekt-Konfiguration wie in www/app.jsx.
// Nur der anon-Key gehört hierher. Sessions und Berichtsdaten bleiben im Speicher.
const SUPABASE_URL = 'https://jczyyupxxqrdgbeifcwe.supabase.co';
const PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjenl5dXB4eHFyZGdiZWlmY3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDYyMjgsImV4cCI6MjA5NDA4MjIyOH0.2Bz6R3N3p3evHXB7j5cKamq2egHrE1zYfgLcV2R8awg';

const failure = code => Object.assign(new Error(code), { code });

export function createReportClient({ fetchImpl = globalThis.fetch, now = Date.now,
  url = SUPABASE_URL, key = PUBLIC_ANON_KEY } = {}) {
  let session = null;
  let generation = 0;
  let refreshing = null;

  async function request(path, options) {
    try {
      return await fetchImpl(`${url}${path}`, {
        ...options, cache: 'no-store', redirect: 'error', credentials: 'omit',
      });
    } catch {
      throw failure('UNAVAILABLE');
    }
  }

  async function auth(grant, body) {
    const response = await request(`/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw failure(grant === 'password' && [400, 401].includes(response.status)
        ? 'INVALID_CREDENTIALS' : grant === 'refresh_token' && response.status < 500 && response.status !== 429
        ? 'NOT_AUTHENTICATED' : 'UNAVAILABLE');
    }
    let value;
    try { value = await response.json(); } catch { throw failure('UNAVAILABLE'); }
    if (!value?.access_token || !value.refresh_token || !(Number(value.expires_in) > 0)) {
      throw failure('UNAVAILABLE');
    }
    return { accessToken: value.access_token, refreshToken: value.refresh_token,
      expiresAt: now() + Number(value.expires_in) * 1000 };
  }

  async function refresh(version) {
    if (!session || generation !== version) throw failure('NOT_AUTHENTICATED');
    if (!refreshing) {
      const token = session.refreshToken;
      const promise = auth('refresh_token', { refresh_token: token }).then(value => {
        if (generation !== version) throw failure('NOT_AUTHENTICATED');
        session = value;
      }).catch(error => {
        if (error.code === 'NOT_AUTHENTICATED' && generation === version) session = null;
        throw error;
      }).finally(() => {
        if (refreshing === promise) refreshing = null;
      });
      refreshing = promise;
    }
    await refreshing;
  }

  return {
    hasSession: () => session !== null,

    async signIn(email, password) {
      const version = ++generation;
      session = null;
      refreshing = null;
      const value = await auth('password', { email: String(email).trim(), password });
      if (generation !== version) throw failure('NOT_AUTHENTICATED');
      session = value;
    },

    async loadReport() {
      const version = generation;
      if (!session) throw failure('NOT_AUTHENTICATED');
      if (session.expiresAt <= now() + 60_000) await refresh(version);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!session || generation !== version) throw failure('NOT_AUTHENTICATED');
        const response = await request('/rest/v1/rpc/adoption_report', {
          method: 'POST', body: '{}', headers: {
            apikey: key, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json',
          },
        });
        if (generation !== version) throw failure('NOT_AUTHENTICATED');
        if (response.status === 401 && attempt === 0) { await refresh(version); continue; }
        if (response.status === 401) { session = null; throw failure('NOT_AUTHENTICATED'); }
        if (response.status === 403) throw failure('FORBIDDEN');
        if (!response.ok) throw failure('UNAVAILABLE');
        let report;
        try { report = await response.json(); } catch { throw failure('UNAVAILABLE'); }
        if (generation !== version) throw failure('NOT_AUTHENTICATED');
        if (!report?.totals || !Array.isArray(report.users) || !Array.isArray(report.challenges)
            || !Array.isArray(report.weeks) || !Number.isFinite(Date.parse(report.generated_at))) {
          throw failure('UNAVAILABLE');
        }
        return report;
      }
      throw failure('NOT_AUTHENTICATED');
    },

    async signOut() {
      const token = session?.accessToken;
      ++generation;
      session = null;
      refreshing = null;
      if (token) {
        // Nur diese Sitzung abmelden, keine anderen App-Anmeldungen widerrufen.
        try {
          await request('/auth/v1/logout?scope=local', {
            method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}` },
          });
        } catch { /* Lokale Daten sind auch ohne Netz bereits entfernt. */ }
      }
    },
  };
}
