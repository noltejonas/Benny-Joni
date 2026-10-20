// Projekt Terminator — Onboarding-Modell (ohne React)
//
// Entscheidet aus echten Daten (Profil, Mitgliedschaften, Wochenziele, Sätze),
// was eine neue Person als Nächstes sieht. Die Screens in onboarding.jsx und
// onboarding-intro.jsx lesen nur hieraus; Tests: tests/onboarding.test.cjs.

(function () {
  // Alphabet von gen_invite_code (ohne 0/O/1/I). Getippte Codes prüft der
  // Server; hier zählt nur die Form, damit kein gültiger Code abgelehnt wird.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SCHEME = 'projektterminator';

  // ── Codes und Links ─────────────────────────────────────────────────
  function cleanCode(raw) {
    const c = String(raw || '').toUpperCase();
    return /^[A-Z0-9]{6}$/.test(c) ? c : null;
  }

  // Einladungslinks: projektterminator://join/ABC123, …://join?code=ABC123,
  // im Browser ?join=ABC123 bzw. #join=ABC123.
  function parseInviteUrl(url) {
    const s = String(url || '');
    if (!s) return null;
    const scheme = s.match(new RegExp(`${SCHEME}://join(?:/([A-Za-z0-9]+)|\\?(?:[^#]*&)?code=([A-Za-z0-9]+))`, 'i'));
    if (scheme) return cleanCode(scheme[1] || scheme[2]);
    const web = s.match(/[?&#]join=([A-Za-z0-9]+)/i);
    if (web) return cleanCode(web[1]);
    return null;
  }

  // Code aus Eingabe, eingefügter Nachricht oder Link. Freitext nur über Link
  // oder „Code:“ — Wörter wie „BATTLE“ sehen sonst wie ein Code aus.
  function normalizeCode(input) {
    if (input == null) return null;
    const raw = String(input).trim();
    if (!raw) return null;
    const fromLink = parseInviteUrl(raw);
    if (fromLink) return fromLink;
    const compact = raw.replace(/[\s-]/g, '');
    if (compact.length === 6) return cleanCode(compact);
    const labelled = raw.match(/code\s*[:=]?\s*([A-Za-z0-9]{6})(?![A-Za-z0-9])/i);
    return labelled ? cleanCode(labelled[1]) : null;
  }

  function inviteLink(code) {
    return `${SCHEME}://join/${String(code || '').toUpperCase()}`;
  }

  function inviteText(competition) {
    const code = String(competition.invite_code || '').toUpperCase();
    return `Komm in meine Challenge „${competition.name}“ bei Projekt Terminator 💪\n`
      + `Code: ${code}\n`
      + `Direkt öffnen: ${inviteLink(code)}`;
  }

  window.PTOnboarding = {
    ALPHABET, SCHEME,
    normalizeCode, parseInviteUrl, inviteLink, inviteText,
  };
})();
