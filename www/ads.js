// Werbung über Google AdMob (@capacitor-community/admob, exakt gepinnt in
// package.json), nur in der iOS-App. Im Browser, ohne natives Plugin und mit
// ADS_ENABLED = false ist alles ein No-op: kein SDK-Start, keine Anfrage an Google.
//
// Ablauf (Einrichtung und Freischaltung: docs/launch/ADMOB.md):
// 1. checkConsent() fragt bei Google UMP den Einwilligungsstand ab, OHNE Formular.
//    Ist schon entschieden oder keine Einwilligung nötig, startet das SDK still.
//    CompetitionApp ruft das erst nach dem Onboarding auf (app.jsx, adsOk).
// 2. setBannerWanted(true) kommt nur aus Feed und Stats. Erst dann zeigt Google
//    bei Bedarf einmal pro Sitzung das Einwilligungsformular, danach startet das
//    SDK und das Banner. Nie in einer Onboarding-Ebene.
// Das Banner liegt nativ über der WebView, direkt über der Tab-Leiste. Solange
// ein Sheet oder Vollbild offen ist (OVERLAY_SELECTOR), ist es ausgeblendet,
// sonst läge es darüber. Seine Höhe steht als --pt-ad-h auf <html>; .app-main,
// .toast und der Demo-Knopf rücken damit nach oben. Ohne Anzeige ist sie 0.
//
// Das Plugin kommt direkt von der nativen Bridge (window.Capacitor.Plugins.AdMob,
// wie der Shim in index.html), ohne CDN. Enums daher als einfache Strings bzw.
// Zahlen, Werte wie in @capacitor-community/admob/dist/esm/**.enum.js.
(function () {
  // ── Konfiguration ──────────────────────────────────────────────────────────
  // Hauptschalter. false: kein SDK-Start, keine Einwilligungsabfrage, kein Banner.
  const ADS_ENABLED = true;

  // Echte IDs aus der AdMob-Konsole (docs/launch/ADMOB.md, „Auf echte IDs
  // umstellen“). Solange PROD.banner leer ist, läuft alles im Testmodus mit
  // Googles Test-IDs. PROD.appId muss gleich GADApplicationIdentifier in
  // ios/App/App/Info.plist sein; tests/ads-config.test.cjs prüft das.
  const PROD = {
    appId: '',    // ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
    banner: '',   // ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
    rewarded: '', // optional, noch ohne Aufrufer
  };
  // Googles öffentliche Test-IDs für iOS (developers.google.com/admob/ios/test-ads).
  const TEST = {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    banner: 'ca-app-pub-3940256099942544/2435281174',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  };
  // Testmodus: Testanzeigen, Einwilligungsdialog wie in der EU (Debug-Geografie).
  const TESTING = !PROD.banner;
  // Eigene Geräte (IDs aus dem Xcode-Log nach der ersten Anzeige). Sie bekommen
  // auch im Release nur Testanzeigen: eigene Klicks auf echte Anzeigen gelten
  // als ungültige Zugriffe und gefährden das AdMob-Konto.
  const TEST_DEVICES = [];
  // Passend zur Altersfreigabe im App Store: 4+ General, 9+ ParentalGuidance,
  // 13+ Teen (Apple 2.5.18).
  const MAX_AD_CONTENT_RATING = 'General';
  // Nur nicht-personalisierte Anzeigen (npa=1): Trainingsdaten können als
  // Gesundheitsdaten gelten, deshalb kein Profiling für Werbung. Kein ATT.
  const NON_PERSONALIZED = true;

  const IDS = TESTING ? TEST : PROD;
  // Abstand zwischen Banner und Tab-Leiste
  const GAP = 8;
  // Neuer Versuch nach „keine Anzeige“ (No-Fill), solange das Banner gewünscht ist.
  const RETRY_MS = 60000;
  // Alles, was über dem Inhalt liegt und vom nativen Banner verdeckt würde:
  // Sheets, Vollbild-Diagramm, Feier, Onboarding-Ebenen, jeder modale Dialog.
  const OVERLAY_SELECTOR = '.sheet, .chart-fs, .celebration-overlay, .ob-layer, .ob-cele, [aria-modal="true"]';
  // Plugin-Werte als Strings bzw. Zahlen (siehe oben).
  const EV = {
    sizeChanged: 'bannerAdSizeChanged',
    loaded: 'bannerAdLoaded',
    failedToLoad: 'bannerAdFailedToLoad',
    rewarded: 'onRewardedVideoAdReward',
    rewardDismissed: 'onRewardedVideoAdDismissed',
    rewardFailedToShow: 'onRewardedVideoAdFailedToShow',
  };
  const DEBUG_GEOGRAPHY_EEA = 1; // AdmobConsentDebugGeography.EEA

  const C = window.Capacitor;
  let isNative = false;
  try { isNative = !!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'ios'); } catch (e) {}
  const P = (ADS_ENABLED && isNative && C.Plugins && C.Plugins.AdMob) || null;

  let infoPromise = null;  // läuft bzw. erledigte Abfrage des Einwilligungsstands
  let lastInfo = null;     // letzte Antwort von requestConsentInfo/showConsentForm
  let formTried = false;   // Formular in dieser Sitzung schon gezeigt
  let consentBusy = false;
  let sdkPromise = null;
  let ready = false;       // SDK gestartet, Listener stehen
  let privacyRequired = false;

  let wanted = false;
  let blocked = false;
  let watching = false;
  let created = false;
  let nativeHidden = false;
  let bannerHeight = 0;
  let retryTimer = null;
  let queue = Promise.resolve();

  const warn = (...a) => { try { console.warn('AdMob', ...a); } catch (e) {} };
  const run = (fn) => { queue = queue.then(fn).catch((e) => warn(e)); return queue; };
  const emit = () => { try { window.dispatchEvent(new CustomEvent('pt:ads-change')); } catch (e) {} };
  const requestOpts = () => ({ isTesting: TESTING, npa: NON_PERSONALIZED });
  const desired = () => ready && wanted && !blocked;

  function setInset() {
    const h = ready && wanted && created && bannerHeight > 0 ? Math.round(bannerHeight + GAP) : 0;
    try { document.documentElement.style.setProperty('--pt-ad-h', `${h}px`); } catch (e) {}
  }

  // Das Plugin misst den Abstand ab der unteren Safe Area.
  function bannerMargin() {
    const bar = document.querySelector('.tabbar-inner') || document.querySelector('.tabbar');
    if (!bar) return 0;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const safeBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    return Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().top - safeBottom + GAP));
  }

  function applyInfo(info) {
    lastInfo = info || null;
    const next = info?.privacyOptionsRequirementStatus === 'REQUIRED';
    if (next !== privacyRequired) { privacyRequired = next; emit(); }
  }

  function requestInfo() {
    return P.requestConsentInfo(TESTING
      ? { debugGeography: DEBUG_GEOGRAPHY_EEA, testDeviceIdentifiers: TEST_DEVICES }
      : {}).then((info) => { applyInfo(info); return info; });
  }

  // Laut Google bei jedem Start abfragen. Zeigt kein Formular.
  function checkConsent() {
    if (!P) return Promise.resolve(false);
    watchOverlays();
    if (!infoPromise) {
      infoPromise = requestInfo()
        .then((info) => (info?.canRequestAds ? startSdk() : false))
        .catch((e) => { warn('Einwilligungsstand', e); infoPromise = null; return false; });
    }
    return infoPromise;
  }

  // Formular bei Bedarf (höchstens einmal pro Sitzung), danach SDK starten.
  async function ensureConsent() {
    if (ready) return true;
    if (await checkConsent()) return true;
    const info = lastInfo;
    // Inzwischen entschieden (z. B. über „Werbe-Einwilligung“ in den Einstellungen).
    if (info?.canRequestAds) return startSdk();
    if (!info || formTried || info.status !== 'REQUIRED' || !info.isConsentFormAvailable) return false;
    formTried = true;
    try {
      const after = await P.showConsentForm();
      applyInfo({ ...info, ...after });
      return after?.canRequestAds ? startSdk() : false;
    } catch (e) {
      warn('Einwilligungsformular', e);
      return false;
    }
  }

  function startSdk() {
    if (!sdkPromise) {
      sdkPromise = (async () => {
        await P.initialize({
          testingDevices: TEST_DEVICES,
          initializeForTesting: TEST_DEVICES.length > 0,
          maxAdContentRating: MAX_AD_CONTENT_RATING,
        });
        await listen();
        ready = true;
        watchOverlays();
        syncBanner();
        return true;
      })().catch((e) => { warn('Start', e); sdkPromise = null; return false; });
    }
    return sdkPromise;
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; if (desired() && !created) syncBanner(); }, RETRY_MS);
  }

  function syncBanner() {
    setInset();
    if (!P) return;
    if (!ready) {
      // Einwilligung erst, wenn ein Screen das Banner will und nichts darüber liegt.
      if (wanted && !blocked && !consentBusy) {
        consentBusy = true;
        ensureConsent().finally(() => { consentBusy = false; });
      }
      return;
    }
    const want = desired();
    if (!created) {
      if (!want) return;
      created = true;
      nativeHidden = false;
      run(() => P.showBanner({
        adId: IDS.banner,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: bannerMargin(),
        ...requestOpts(),
      }).catch((e) => { created = false; scheduleRetry(); throw e; }));
    } else if (want && nativeHidden) {
      nativeHidden = false;
      // Schlägt fehl, solange das Banner noch lädt; dann zeigt es sich beim Laden selbst.
      run(() => P.resumeBanner().catch(() => {}));
    } else if (!want && !nativeHidden) {
      nativeHidden = true;
      run(() => P.hideBanner());
    }
  }

  function watchOverlays() {
    if (watching || typeof MutationObserver === 'undefined' || !document.body) return;
    watching = true;
    let scheduled = false;
    const check = () => {
      scheduled = false;
      const now = !!document.querySelector(OVERLAY_SELECTOR);
      if (now !== blocked) { blocked = now; syncBanner(); }
    };
    blocked = !!document.querySelector(OVERLAY_SELECTOR);
    new MutationObserver(() => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(check); }
    }).observe(document.body, { childList: true, subtree: true });
    // Offline gestartet: sobald das Netz da ist, neu versuchen.
    window.addEventListener('online', () => { if (wanted && !ready) syncBanner(); });
  }

  async function listen() {
    await P.addListener(EV.sizeChanged, (size) => {
      if (size?.height > 0) bannerHeight = size.height;
      setInset();
    });
    // Ein frisch geladenes Banner ist sichtbar, auch wenn inzwischen kein
    // Screen es mehr will. Dann gleich wieder ausblenden.
    await P.addListener(EV.loaded, () => {
      if (!desired()) { nativeHidden = true; run(() => P.hideBanner()); }
    });
    // Keine Anzeige: Das Plugin entfernt die Ansicht, also keine Lücke lassen
    // und später neu laden.
    await P.addListener(EV.failedToLoad, (err) => {
      warn('Banner ohne Anzeige', err);
      created = false;
      nativeHidden = false;
      bannerHeight = 0;
      setInset();
      scheduleRetry();
    });
  }

  // Belohnungsvideo (noch ohne Aufrufer). Liefert true, wenn die Belohnung
  // verdient wurde. Das Plugin löst showRewardVideoAd nur bei einer Belohnung
  // auf; wer vorher schließt, landet nur im Dismissed-Event.
  async function showRewarded() {
    if (!P || !(await ensureConsent())) return false;
    try {
      await P.prepareRewardVideoAd({ adId: IDS.rewarded, ...requestOpts() });
    } catch (e) {
      warn('Belohnungsvideo nicht geladen', e);
      return false;
    }
    let rewarded = false;
    let finish;
    const result = new Promise((resolve) => { finish = resolve; });
    const handles = await Promise.all([
      P.addListener(EV.rewarded, () => { rewarded = true; }),
      P.addListener(EV.rewardDismissed, () => finish(rewarded)),
      P.addListener(EV.rewardFailedToShow, () => finish(false)),
    ]);
    P.showRewardVideoAd().then(() => { rewarded = true; }).catch(() => finish(false));
    const value = await result;
    handles.forEach((h) => h?.remove?.());
    return value;
  }

  // Einstellungen → „Werbe-Einwilligung“ (Pflicht, wenn Google sie verlangt).
  async function showPrivacyOptions() {
    if (!P) return;
    try {
      await P.showPrivacyOptionsForm();
      const info = await requestInfo();
      if (info?.canRequestAds && wanted) startSdk();
    } catch (e) { warn('Datenschutzoptionen', e); }
  }

  window.PTAds = {
    checkConsent,
    setBannerWanted(value) {
      if (wanted === !!value) return;
      wanted = !!value;
      if (P) watchOverlays();
      syncBanner();
    },
    showRewarded,
    privacyOptionsRequired: () => privacyRequired,
    showPrivacyOptions,
    // Nur lesen: für tests/ads-config.test.cjs und zum Nachsehen in der Konsole.
    config: Object.freeze({
      enabled: ADS_ENABLED, active: !!P, testing: TESTING,
      appId: IDS.appId, banner: IDS.banner, rewarded: IDS.rewarded,
      prod: Object.freeze({ ...PROD }), testDevices: TEST_DEVICES.slice(),
      maxAdContentRating: MAX_AD_CONTENT_RATING, nonPersonalized: NON_PERSONALIZED,
      overlaySelector: OVERLAY_SELECTOR,
    }),
  };
})();
