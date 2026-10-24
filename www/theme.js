// Projekt Terminator — Farbpaletten und eigene Farben (Einstellungen → Farben)
//
// Eine Palette besteht pro Modus (hell/dunkel) aus wenigen Grundfarben; daraus
// entstehen alle Design-Tokens aus redesign.css (Flächen, Textstufen, Akzent,
// Verläufe, Seitenfarben). Die Tokens landen als Inline-Variablen auf <html>
// und überschreiben die Werte aus redesign.css. Bei der Standardpalette ohne
// eigene Farben bleibt <html> frei, dann gilt redesign.css unverändert.
//
// Gespeichert pro Gerät in localStorage (`pt:colors`):
//   { palette: 'violett' | … | 'custom', from: '<Basispalette>', custom: { dark?: {…}, light?: {…} } }
// Läuft vor React (index.html), damit beim Start nichts in der falschen Farbe blitzt.
(function () {
  const KEY = 'pt:colors';
  const DEFAULT = 'violett';

  // Namen stehen übersetzt in settings.jsx (ST_PALETTE_NAMES).
  // Grundfarben: bg, surface, text, accent (Ringe, Tabs, Links), grad0/grad1
  // (Buttons), tile0/tile1 (Fokus-Kachel), side0/side1 (ich / Gegner).
  const PALETTES = [
    { id: 'violett',
      dark: { bg: '#16151F', surface: '#211F2C', text: '#F1F0F7', accent: '#8B7CFF', grad0: '#6A4CF5', grad1: '#4338CA', tile0: '#6A4CF5', tile1: '#4338CA', side0: '#4FB3C2', side1: '#F0A866' },
      light: { bg: '#F4F3F8', surface: '#FFFFFF', text: '#1C1B2E', accent: '#4F46E5', grad0: '#6A4CF5', grad1: '#4338CA', tile0: '#6A4CF5', tile1: '#4338CA', side0: '#2B8A9A', side1: '#E8914A' } },
    { id: 'graphit',
      dark: { bg: '#000000', surface: '#1C1C1E', text: '#FFFFFF', accent: '#32D74B', grad0: '#32D74B', grad1: '#28B840', tile0: '#2C2C2E', tile1: '#1C1C1E', side0: '#0A84FF', side1: '#FF9F0A' },
      light: { bg: '#F2F2F7', surface: '#FFFFFF', text: '#000000', accent: '#248A3D', grad0: '#34C759', grad1: '#2DB24F', tile0: '#2C2C2E', tile1: '#1C1C1E', side0: '#007AFF', side1: '#E08600' } },
    { id: 'mitternacht',
      dark: { bg: '#0B0F14', surface: '#141A22', text: '#EEF2F6', accent: '#C6FF3D', grad0: '#C6FF3D', grad1: '#A6E22E', tile0: '#1C2430', tile1: '#121821', side0: '#38BDF8', side1: '#FB923C' },
      light: { bg: '#F3F5F2', surface: '#FFFFFF', text: '#0B0F14', accent: '#4D7C0F', grad0: '#C6FF3D', grad1: '#A6E22E', tile0: '#1C2430', tile1: '#0B0F14', side0: '#0284C7', side1: '#EA580C' } },
    { id: 'ozean',
      dark: { bg: '#031C22', surface: '#07303A', text: '#E6FBFF', accent: '#2DD4BF', grad0: '#14B8A6', grad1: '#0E7490', tile0: '#14B8A6', tile1: '#0E7490', side0: '#7DD3FC', side1: '#FDBA74' },
      light: { bg: '#EEF7F7', surface: '#FFFFFF', text: '#062A30', accent: '#0E7490', grad0: '#14B8A6', grad1: '#0E7490', tile0: '#14B8A6', tile1: '#0E7490', side0: '#0369A1', side1: '#EA580C' } },
    { id: 'sonnenuntergang',
      dark: { bg: '#150B14', surface: '#23121F', text: '#FFF1EC', accent: '#FF8A5B', grad0: '#FF7A45', grad1: '#E1306C', tile0: '#FF7A45', tile1: '#E1306C', side0: '#7DD3FC', side1: '#FFD166' },
      light: { bg: '#FFF6F1', surface: '#FFFFFF', text: '#2A1220', accent: '#D0285E', grad0: '#FF7A45', grad1: '#E1306C', tile0: '#FF7A45', tile1: '#E1306C', side0: '#0369A1', side1: '#C77700' } },
    { id: 'kreide',
      dark: { bg: '#121212', surface: '#1E1E1E', text: '#F5F3EE', accent: '#7A95FF', grad0: '#2F5BFF', grad1: '#1E3FD8', tile0: '#2E2E2E', tile1: '#1A1A1A', side0: '#38BDF8', side1: '#FB923C' },
      light: { bg: '#F5F3EE', surface: '#FFFFFF', text: '#141414', accent: '#2F5BFF', grad0: '#2F5BFF', grad1: '#1E3FD8', tile0: '#2A2A2A', tile1: '#141414', side0: '#0284C7', side1: '#EA580C' } },
    { id: 'ruhig',
      dark: { bg: '#121214', surface: '#1C1C20', text: '#F3F3F6', accent: '#A99DFF', grad0: '#6D5DF6', grad1: '#5145CD', tile0: '#6D5DF6', tile1: '#5145CD', side0: '#22D3EE', side1: '#FBBF24' },
      light: { bg: '#F6F6F8', surface: '#FFFFFF', text: '#17171C', accent: '#5145CD', grad0: '#6D5DF6', grad1: '#5145CD', tile0: '#6D5DF6', tile1: '#5145CD', side0: '#0891B2', side1: '#D97706' } },
  ];
  // Felder, die man unter „Eigene Farben“ einzeln wählen kann (Reihenfolge der Liste)
  const FIELDS = ['bg', 'surface', 'text', 'accent', 'grad0', 'grad1', 'tile0', 'side0', 'side1'];

  // ── Farbrechnung ─────────────────────────────────────────────────────
  const clean = (h) => {
    const s = String(h || '').trim().replace('#', '');
    const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return /^[0-9a-fA-F]{6}$/.test(full) ? full.toLowerCase() : null;
  };
  const rgb = (h) => { const n = parseInt(clean(h) || '000000', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
  const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
  const lum = (h) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [r, g, b] = rgb(h); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const isHex = (h) => !!clean(h);

  // Grundfarben → alle Tokens aus redesign.css
  function tokens(base, mode) {
    const dark = mode === 'dark';
    const { bg, surface, text, accent, grad0, grad1, tile0, side0, side1 } = base;
    const tile1 = base.tile1 || mix(tile0, '#000000', 0.3);
    const onGrad = lum(grad0) > 0.45 ? '#0B0B0D' : '#FFFFFF';
    // Text auf dem weißen Chip der Kachel: dunkle Kachel → fast schwarz, sonst die dunkle Verlaufsfarbe
    const focusInk = lum(tile1) < 0.04 ? '#141416' : mix(tile1, '#000000', 0.12);
    return {
      '--bg': bg,
      '--surface': surface,
      '--surface-2': mix(surface, text, dark ? 0.06 : 0.04),
      '--surface-3': mix(surface, text, dark ? 0.12 : 0.08),
      '--track': mix(surface, text, dark ? 0.12 : 0.08),
      '--line': mix(surface, text, dark ? 0.06 : 0.05),
      '--border': mix(surface, text, dark ? 0.12 : 0.08),
      '--text': text,
      '--text-2': mix(text, bg, 0.25),
      '--text-3': mix(text, bg, 0.4),
      '--text-4': mix(text, bg, 0.56),
      '--primary': accent,
      '--primary-ink': dark ? mix(accent, '#FFFFFF', 0.2) : mix(accent, '#000000', 0.08),
      '--primary-tint': rgba(accent, dark ? 0.16 : 0.12),
      '--on-primary': lum(accent) > 0.45 ? '#0B0B0D' : '#FFFFFF',
      '--grad': `linear-gradient(135deg, ${grad0} 0%, ${grad1} 100%)`,
      '--grad-shadow': dark ? '0 12px 32px rgba(0, 0, 0, 0.35)' : `0 12px 32px ${rgba(grad1, 0.28)}`,
      '--on-grad': onGrad,
      '--focus-grad': `linear-gradient(135deg, ${tile0} 0%, ${tile1} 100%)`,
      '--focus-ink': focusInk,
      '--glass': rgba(surface, 0.92),
      '--side0': side0,
      '--side1': side1,
      '--side0-ink': dark ? mix(side0, '#FFFFFF', 0.2) : mix(side0, '#000000', 0.22),
      '--side1-ink': dark ? mix(side1, '#FFFFFF', 0.2) : mix(side1, '#000000', 0.22),
      '--player-1': side0,
      '--player-2': side1,
    };
  }

  // ── Zustand ──────────────────────────────────────────────────────────
  const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
  function read() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object' && typeof s.palette === 'string') return s;
    } catch (e) {}
    return { palette: DEFAULT };
  }
  function write(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  // Grundfarben für einen Modus: Palette, bei „custom“ die eigenen Farben über der Basispalette
  function baseFor(state, mode) {
    const m = mode === 'dark' ? 'dark' : 'light';
    if (state?.palette !== 'custom') return { ...paletteById(state?.palette)[m] };
    const from = paletteById(state.from)[m];
    const own = state.custom?.[m] || {};
    const out = { ...from };
    for (const k of FIELDS) if (isHex(own[k])) out[k] = '#' + clean(own[k]);
    if (isHex(own.tile0)) out.tile1 = mix(out.tile0, '#000000', 0.3);
    return out;
  }
  const isDefault = (state) => !state || (state.palette === DEFAULT);

  let applied = [];
  function apply(state = read(), mode = document.documentElement.dataset.theme) {
    const root = document.documentElement;
    for (const k of applied) root.style.removeProperty(k);
    applied = [];
    if (isDefault(state)) return;
    const t = tokens(baseFor(state, mode), mode);
    for (const [k, v] of Object.entries(t)) { root.style.setProperty(k, v); applied.push(k); }
  }
  // Farbe für <meta name="theme-color">
  const bgFor = (state, mode) => baseFor(state, mode).bg;

  // Eine eigene Farbe setzen: aus der gerade gewählten Palette wird „custom“
  function setCustom(state, mode, field, value) {
    const m = mode === 'dark' ? 'dark' : 'light';
    const from = state.palette === 'custom' ? state.from : state.palette;
    const current = baseFor(state, m);
    const custom = { ...(state.palette === 'custom' ? state.custom : {}) };
    custom[m] = { ...current, ...(custom[m] || {}), [field]: value };
    return { palette: 'custom', from: from || DEFAULT, custom };
  }

  window.PTTheme = { KEY, DEFAULT, PALETTES, FIELDS, tokens, read, write, apply, baseFor, bgFor, setCustom, mix, lum };
  try { apply(); } catch (e) {}
})();
