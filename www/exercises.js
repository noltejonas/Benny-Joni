// Projekt Terminator — Übungskatalog (ohne React)
//
// Die Standard-Übungen stehen in der Datenbank (categories mit competition_id
// null, gewertet für die Rangliste). Hier liegt alles, was die App zusätzlich
// über sie weiß: Gruppe, Schwierigkeit, Erklärung, Muskeln, Ausführungsregel
// in der App-Sprache, Synonyme und die Strichfigur.
//
// - meta(name):   Eintrag zum deutschen Namen aus der Datenbank (oder null)
// - match(text):  Katalog-Übung zu einem eingetippten Namen („Squats“ →
//                 Kniebeugen), damit niemand dieselbe Übung neu anlegt
// - groupOf(cat): Gruppe einer Kategorie für die Auswahl
// - pose(fig, t): Gelenkpunkte der Figur, t von 0 (Start) bis 1 (Ende)
//
// Neue Übungen: Zeile in LIST und Migration mit gleichem Namen (siehe
// supabase/migrations/20261117120000_exercise_catalog.sql).

(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;

  const GROUPS = [
    { id: 'basics', label: tr('Basics') },
    { id: 'push', label: tr('Drücken') },
    { id: 'pull', label: tr('Ziehen') },
    { id: 'legs', label: tr('Beine') },
    { id: 'core', label: tr('Core') },
    { id: 'full', label: tr('Ganzkörper') },
    { id: 'workout', label: tr('Workouts') },
    { id: 'other', label: tr('Weitere') },
  ];

  const LEVELS = [null, tr('Einsteiger'), tr('Fortgeschritten'), tr('Profi')];

  // name: Name in der Datenbank (deutsch, nie übersetzt zurückschreiben)
  // goal: Vorschlag Wiederholungen pro Person und Woche
  // basic: steht unter „Basics“ ganz vorn
  const LIST = [
    // ── Drücken ──
    {
      name: 'Liegestütze', emoji: '🏋', label: tr('Liegestütze'), group: 'push', level: 1, goal: 100, fig: 'pushup', basic: true, // i18n-ignore: DB-Name
      how: tr('Hände schulterbreit, der Körper bildet eine Linie von Kopf bis Ferse. Runter, bis die Brust fast den Boden berührt, dann ganz hochdrücken.'),
      muscles: tr('Brust, Schultern, Trizeps'),
      rule: tr('Brust fast am Boden, oben Arme ganz gestreckt.'),
      alias: ['liegestütz', 'liegestuetze', 'push-ups', 'push-up', 'pushups', 'pushup', 'push ups', 'push up'], // i18n-ignore: Synonyme
    },
    {
      name: 'Knie-Liegestütze', emoji: '🧎', label: tr('Knie-Liegestütze'), group: 'push', level: 1, goal: 80, fig: 'kneePushup', // i18n-ignore: DB-Name
      how: tr('Wie Liegestütze, nur bleiben die Knie am Boden. Der perfekte Einstieg, bis die vollen Liegestütze sitzen.'),
      muscles: tr('Brust, Schultern, Trizeps'),
      rule: tr('Knie am Boden, Brust fast am Boden, oben Arme ganz gestreckt.'),
      alias: ['knie liegestütze', 'knieliegestütze', 'knee push-ups', 'knee pushups', 'knee push ups'], // i18n-ignore: Synonyme
    },
    {
      name: 'Diamond Push-ups', emoji: '💎', label: tr('Diamond Push-ups'), group: 'push', level: 2, goal: 50, fig: 'diamond', // i18n-ignore: DB-Name
      how: tr('Daumen und Zeigefinger formen unter der Brust eine Raute, die Ellbogen bleiben eng am Körper. Geht richtig auf den Trizeps.'),
      muscles: tr('Trizeps, innere Brust'),
      rule: tr('Hände bilden unter der Brust eine Raute, Brust fast an den Händen.'),
      alias: ['diamond pushups', 'diamond push ups', 'diamant liegestütze', 'diamant-liegestütze'], // i18n-ignore: Synonyme
    },
    {
      name: 'Pike Push-ups', emoji: '🔺', label: tr('Pike Push-ups'), group: 'push', level: 2, goal: 40, fig: 'pike', // i18n-ignore: DB-Name
      how: tr('Hüfte hoch, sodass der Körper ein umgedrehtes V bildet. Den Kopf zwischen den Händen Richtung Boden senken. Die Vorstufe zum Handstand-Liegestütz.'),
      muscles: tr('Schultern, Trizeps'),
      rule: tr('Hüfte hoch wie ein umgedrehtes V, Kopf bis kurz vor den Boden.'),
      alias: ['pike pushups', 'pike push ups', 'pike push-up'],
    },
    {
      name: 'Decline Push-ups', emoji: '📐', label: tr('Decline Push-ups'), group: 'push', level: 2, goal: 50, fig: 'decline', // i18n-ignore: DB-Name
      how: tr('Die Füße liegen erhöht auf Bank, Stuhl oder Stufe. Je höher die Füße, desto mehr arbeiten Schultern und obere Brust.'),
      muscles: tr('Obere Brust, Schultern, Trizeps'),
      rule: tr('Füße erhöht, Brust fast am Boden, oben Arme ganz gestreckt.'),
      alias: ['decline pushups', 'decline push ups', 'decline push-up'],
    },
    {
      name: 'Archer Push-ups', emoji: '🏹', label: tr('Archer Push-ups'), group: 'push', level: 3, goal: 30, fig: 'archer', // i18n-ignore: DB-Name
      how: tr('Hände weit auseinander. Zu einer Seite absenken, der andere Arm bleibt gestreckt. Abwechselnd links und rechts, der halbe Weg zum einarmigen Liegestütz.'),
      muscles: tr('Brust, Schultern, Trizeps'),
      rule: tr('Ein Arm beugt, der andere bleibt gestreckt. Jede Seite zählt einzeln.'),
      alias: ['archer pushups', 'archer push ups', 'archer push-up'],
    },
    {
      name: 'Dips', emoji: '🔽', label: 'Dips', group: 'push', level: 2, goal: 50, fig: 'dips', basic: true, // i18n-ignore: DB-Name
      how: tr('Am Barren oder zwischen zwei stabilen Stühlen stützen. Absenken, bis die Oberarme parallel zum Boden sind, dann ganz hochdrücken.'),
      muscles: tr('Trizeps, Brust, Schultern'),
      rule: tr('Oberarme mindestens parallel zum Boden, oben ganz gestreckt.'),
      alias: ['dip', 'barrendips', 'barren dips', 'parallel bar dips'],
    },
    {
      name: 'Bankdips', emoji: '🪑', label: tr('Bankdips'), group: 'push', level: 1, goal: 60, fig: 'benchDips', // i18n-ignore: DB-Name
      how: tr('Hände hinter dir auf Bank oder Stuhl, Beine nach vorn. Die Ellbogen nach hinten beugen, bis die Oberarme parallel zum Boden sind.'),
      muscles: tr('Trizeps, Schultern'),
      rule: tr('Hände hinter dir auf der Bank, Oberarme bis parallel zum Boden.'),
      alias: ['bench dips', 'bankdip', 'trizeps dips', 'trizepsdips', 'stuhl dips', 'stuhldips'],
    },
    {
      name: 'HSPU', emoji: '🤸', label: tr('HSPU'), group: 'push', level: 3, goal: 20, fig: 'hspu', basic: true, // i18n-ignore: DB-Name
      how: tr('Handstand-Liegestütz, meist mit den Füßen an der Wand. Den Kopf kontrolliert bis zum Boden senken und wieder ganz hochdrücken.'),
      muscles: tr('Schultern, Trizeps, oberer Rücken'),
      rule: tr('Kopf berührt Boden oder Matte, oben ganz gestreckt.'),
      alias: ['handstand push-ups', 'handstand pushups', 'handstand push ups', 'handstand liegestütze', 'handstand-liegestütze', 'handstandliegestütze'], // i18n-ignore: Synonyme
    },
    // ── Ziehen ──
    {
      name: 'Klimmzüge', emoji: '🆙', label: tr('Klimmzüge'), group: 'pull', level: 2, goal: 30, fig: 'pullup', basic: true, // i18n-ignore: DB-Name
      how: tr('Obergriff, Hände etwas breiter als die Schultern. Aus dem toten Hang hochziehen, bis das Kinn über der Stange ist. Ohne Schwung.'),
      muscles: tr('Latissimus, Bizeps, oberer Rücken'),
      rule: tr('Aus dem toten Hang, Kinn über die Stange.'),
      alias: ['klimmzug', 'pull-ups', 'pull-up', 'pullups', 'pullup', 'pull ups', 'pull up'],
    },
    {
      name: 'Chin-ups', emoji: '🙌', label: tr('Chin-ups'), group: 'pull', level: 2, goal: 30, fig: 'chinup', // i18n-ignore: DB-Name
      how: tr('Wie Klimmzüge, nur im Untergriff: Die Handflächen zeigen zu dir. Der Bizeps hilft mehr mit, meist gehen ein paar mehr.'),
      muscles: tr('Bizeps, Latissimus'),
      rule: tr('Untergriff, aus dem toten Hang, Kinn über die Stange.'),
      alias: ['chinups', 'chin ups', 'chin-up', 'chinup', 'untergriff klimmzüge', 'klimmzüge untergriff'], // i18n-ignore: Synonyme
    },
    {
      name: 'Australian Pull-ups', emoji: '🦘', label: tr('Australian Pull-ups'), group: 'pull', level: 1, goal: 60, fig: 'australian', // i18n-ignore: DB-Name
      how: tr('Unter eine tiefe Stange oder einen stabilen Tisch legen, der Körper bleibt gerade, die Fersen am Boden. Brust zur Stange ziehen. Die Vorstufe zum Klimmzug.'),
      muscles: tr('Oberer Rücken, Bizeps'),
      rule: tr('Körper gerade unter der Stange, Brust bis an die Stange.'),
      alias: ['australian pullups', 'australian pull ups', 'inverted rows', 'inverted row', 'rudern am körper', 'körperrudern'], // i18n-ignore: Synonyme
    },
    {
      name: 'Archer Pull-ups', emoji: '🎯', label: tr('Archer Pull-ups'), group: 'pull', level: 3, goal: 15, fig: 'archerPull', // i18n-ignore: DB-Name
      how: tr('Breiter Griff. Zu einer Hand hochziehen, der andere Arm bleibt fast gestreckt auf der Stange. Abwechselnd links und rechts.'),
      muscles: tr('Latissimus, Bizeps, Unterarme'),
      rule: tr('Zu einer Hand ziehen, der andere Arm bleibt gestreckt. Jede Seite zählt einzeln.'),
      alias: ['archer pullups', 'archer pull ups', 'archer pull-up'],
    },
    {
      name: 'Muscle-ups', emoji: '🚀', label: tr('Muscle-ups'), group: 'pull', level: 3, goal: 10, fig: 'muscleup', // i18n-ignore: DB-Name
      how: tr('Ein explosiver Klimmzug, der über der Stange in einen Dip übergeht. Die Königsdisziplin an der Stange.'),
      muscles: tr('Latissimus, Brust, Trizeps'),
      rule: tr('Aus dem Hang über die Stange bis in den Stütz, oben Arme gestreckt.'),
      alias: ['muscle up', 'muscleups', 'muscleup', 'muscle ups', 'muscle-up'],
    },
    // ── Beine ──
    {
      name: 'Kniebeugen', emoji: '🦿', label: tr('Kniebeugen'), group: 'legs', level: 1, goal: 100, fig: 'squat', basic: true, // i18n-ignore: DB-Name
      how: tr('Füße schulterbreit, die Fersen bleiben am Boden. Hüfte nach hinten und unten, bis sie mindestens auf Kniehöhe ist. Rücken gerade, dann ganz aufrichten.'),
      muscles: tr('Oberschenkel, Po'),
      rule: tr('Hüfte mindestens auf Kniehöhe, oben ganz aufrichten.'),
      alias: ['kniebeuge', 'squats', 'squat', 'air squats', 'air squat', 'bodyweight squats'],
    },
    {
      name: 'Ausfallschritte', emoji: '🚶', label: tr('Ausfallschritte'), group: 'legs', level: 1, goal: 60, fig: 'lunge', // i18n-ignore: DB-Name
      how: tr('Großer Schritt nach vorn, beide Knie beugen etwa 90 Grad. Das hintere Knie geht fast bis zum Boden. Oberkörper aufrecht, die Beine abwechseln.'),
      muscles: tr('Oberschenkel, Po'),
      rule: tr('Hinteres Knie fast am Boden, Oberkörper aufrecht. Jedes Bein zählt einzeln.'),
      alias: ['ausfallschritt', 'lunges', 'lunge', 'walking lunges'],
    },
    {
      name: 'Bulgarian Split Squats', emoji: '🪜', label: tr('Bulgarian Split Squats'), group: 'legs', level: 2, goal: 40, fig: 'bulgarian', // i18n-ignore: DB-Name
      how: tr('Der hintere Fuß liegt auf Bank oder Stuhl. Mit dem vorderen Bein tief runter, bis der Oberschenkel parallel zum Boden ist.'),
      muscles: tr('Oberschenkel, Po'),
      rule: tr('Hinterer Fuß erhöht, vorderer Oberschenkel bis parallel. Jedes Bein zählt einzeln.'),
      alias: ['bulgarian split squat', 'bulgarian squats', 'split squats', 'split squat', 'bulgarische kniebeugen'],
    },
    {
      name: 'Pistol Squats', emoji: '🦩', label: tr('Pistol Squats'), group: 'legs', level: 3, goal: 20, fig: 'pistol', // i18n-ignore: DB-Name
      how: tr('Einbeinige Kniebeuge: Das freie Bein gestreckt nach vorn halten und auf einem Bein ganz runter und wieder hoch.'),
      muscles: tr('Oberschenkel, Po, Gleichgewicht'),
      rule: tr('Auf einem Bein ganz runter, das andere Bein bleibt in der Luft. Jedes Bein zählt einzeln.'),
      alias: ['pistol squat', 'pistols', 'pistol', 'einbeinige kniebeugen', 'einbeinige kniebeuge'],
    },
    {
      name: 'Sprungkniebeugen', emoji: '⏫', label: tr('Sprungkniebeugen'), group: 'legs', level: 2, goal: 50, fig: 'jumpSquat', // i18n-ignore: DB-Name
      how: tr('Tief in die Hocke und explosiv nach oben abspringen. Weich landen und direkt in die nächste Wiederholung.'),
      muscles: tr('Oberschenkel, Po, Waden'),
      rule: tr('Hüfte bis Kniehöhe, dann mit beiden Füßen vom Boden abspringen.'),
      alias: ['jump squats', 'jump squat', 'squat jumps', 'squat jump', 'sprung kniebeugen', 'hocksprünge'], // i18n-ignore: Synonyme
    },
    {
      name: 'Wadenheben', emoji: '🦶', label: tr('Wadenheben'), group: 'legs', level: 1, goal: 150, fig: 'calf', // i18n-ignore: DB-Name
      how: tr('Auf die Fußballen stellen, am besten auf eine Stufe. Ganz hoch auf die Zehenspitzen und langsam wieder ab, bis die Ferse unter der Stufe ist.'),
      muscles: tr('Waden'),
      rule: tr('Ganz hoch auf die Zehenspitzen, unten Fersen ganz ab.'),
      alias: ['calf raises', 'calf raise', 'wadenheber', 'zehenstand'],
    },
    {
      name: 'Glute Bridges', emoji: '🌉', label: tr('Glute Bridges'), group: 'legs', level: 1, goal: 100, fig: 'bridge', // i18n-ignore: DB-Name
      how: tr('Auf dem Rücken liegen, die Füße nah am Po aufstellen. Hüfte hochdrücken, bis Knie, Hüfte und Schultern eine Linie bilden, oben kurz den Po anspannen.'),
      muscles: tr('Po, hintere Oberschenkel'),
      rule: tr('Schultern am Boden, Hüfte hoch, bis Knie, Hüfte und Schultern eine Linie bilden.'),
      alias: ['glute bridge', 'beckenheben', 'hip bridge', 'hip bridges', 'hip thrusts', 'hip thrust'],
    },
    {
      name: 'Nordic Curls', emoji: '❄️', label: tr('Nordic Curls'), group: 'legs', level: 3, goal: 15, fig: 'nordic', // i18n-ignore: DB-Name
      how: tr('Kniend, die Füße unter Sofa oder Stange eingehakt. Mit geradem Körper so langsam wie möglich nach vorn sinken und mit den Händen abfangen.'),
      muscles: tr('Hintere Oberschenkel'),
      rule: tr('Körper bleibt von Knie bis Kopf gerade, langsam bis ganz nach unten.'),
      alias: ['nordic curl', 'nordic hamstring curls', 'nordic hamstring curl', 'nordics'],
    },
    {
      name: 'Leg Curls', emoji: '🧦', label: tr('Leg Curls'), group: 'legs', level: 2, goal: 60, fig: 'legCurl', // i18n-ignore: DB-Name
      how: tr('An der Beinbeuger-Maschine oder ohne Gerät: auf dem Rücken liegen, Fersen auf Handtuch, Socken oder Gymnastikball, Hüfte hoch. Die Fersen zum Po ziehen und langsam wieder strecken.'),
      muscles: tr('Po, hintere Oberschenkel'),
      rule: tr('Fersen bis nah an den Po ziehen, dann die Beine wieder ganz strecken.'),
      alias: ['leg curl', 'beinbeuger', 'beincurls', 'bein curls', 'hamstring curls', 'hamstring curl', 'slider leg curls', 'slider curls'],
    },
    // ── Core ──
    {
      name: 'Sit-ups', emoji: '🧘', label: tr('Sit-ups'), group: 'core', level: 1, goal: 100, fig: 'situp', basic: true, // i18n-ignore: DB-Name
      how: tr('Rücken am Boden, Knie gebeugt, Füße fest. Den Oberkörper ganz aufrichten, bis die Brust zu den Knien kommt, und kontrolliert zurück.'),
      muscles: tr('Bauch, Hüftbeuger'),
      rule: tr('Schultern ganz ab, Brust bis zu den Knien.'),
      alias: ['sit-up', 'situps', 'situp', 'sit ups', 'sit up'],
    },
    {
      name: 'Crunches', emoji: '🔥', label: tr('Crunches'), group: 'core', level: 1, goal: 100, fig: 'crunch', basic: true, // i18n-ignore: DB-Name
      how: tr('Rücken am Boden, Knie gebeugt. Nur die Schulterblätter einrollen und abheben, der untere Rücken bleibt liegen.'),
      muscles: tr('Gerader Bauchmuskel'),
      rule: tr('Schulterblätter vom Boden, Hände nicht am Kopf ziehen.'),
      alias: ['crunch', 'bauchpressen'],
    },
    {
      name: 'Leg Raises', emoji: '🦵', label: tr('Leg Raises'), group: 'core', level: 2, goal: 50, fig: 'legRaise', basic: true, // i18n-ignore: DB-Name
      how: tr('Auf dem Rücken liegen, die Hände neben dem Po. Die gestreckten Beine bis senkrecht anheben und langsam absenken, ohne sie abzulegen.'),
      muscles: tr('Unterer Bauch, Hüftbeuger'),
      rule: tr('Gestreckte Beine bis mindestens 90 Grad anheben.'),
      alias: ['leg raise', 'legraises', 'beinheben', 'beine heben'],
    },
    {
      name: 'Knee Raises', emoji: '🪝', label: tr('Knee Raises'), group: 'core', level: 1, goal: 60, fig: 'kneeRaise', // i18n-ignore: DB-Name
      how: tr('An der Stange hängen und die Knie kontrolliert bis über Hüfthöhe ziehen. Nicht schwingen.'),
      muscles: tr('Bauch, Hüftbeuger, Griffkraft'),
      rule: tr('Im Hang die Knie mindestens auf Hüfthöhe ziehen, ohne Schwung.'),
      alias: ['knee raise', 'hanging knee raises', 'hanging knee raise', 'knieheben', 'knie heben'],
    },
    {
      name: 'Toes-to-Bar', emoji: '👣', label: tr('Toes-to-Bar'), group: 'core', level: 3, goal: 20, fig: 't2b', // i18n-ignore: DB-Name
      how: tr('Im Hang die gestreckten Beine hochbringen, bis die Fußspitzen die Stange berühren. Braucht Bauch, Griff und Timing.'),
      muscles: tr('Bauch, Latissimus, Griffkraft'),
      rule: tr('Im Hang berühren beide Fußspitzen die Stange.'),
      alias: ['toes to bar', 't2b', 'ttb', 'toes-to-bars'],
    },
    {
      name: 'V-ups', emoji: '✌️', label: tr('V-ups'), group: 'core', level: 2, goal: 50, fig: 'vup', // i18n-ignore: DB-Name
      how: tr('Gestreckt auf dem Rücken liegen. Arme und Beine gleichzeitig heben, bis sich Hände und Füße treffen. Der Körper bildet ein V.'),
      muscles: tr('Ganzer Bauch'),
      rule: tr('Arme und gestreckte Beine heben, bis sich Hände und Füße treffen.'),
      alias: ['v up', 'v-up', 'vups', 'vup', 'klappmesser'],
    },
    {
      name: 'Russian Twists', emoji: '🌀', label: tr('Russian Twists'), group: 'core', level: 1, goal: 100, fig: 'twist', // i18n-ignore: DB-Name
      how: tr('Im Sitzen leicht zurücklehnen, die Füße in der Luft oder am Boden. Den Oberkörper drehen und abwechselnd links und rechts neben der Hüfte auftippen.'),
      muscles: tr('Seitliche Bauchmuskeln'),
      rule: tr('Hände tippen neben der Hüfte auf. Jede Seite zählt einzeln.'),
      alias: ['russian twist', 'russian twister'],
    },
    {
      name: 'Dragon Flags', emoji: '🐉', label: tr('Dragon Flags'), group: 'core', level: 3, goal: 15, fig: 'dragon', // i18n-ignore: DB-Name
      how: tr('Auf einer Bank liegen und hinter dem Kopf festhalten. Den Körper gerade wie ein Brett heben und langsam absenken, nur die Schultern liegen auf.'),
      muscles: tr('Ganzer Rumpf'),
      rule: tr('Nur die Schultern liegen auf, der Körper bleibt von Schulter bis Fuß gerade.'),
      alias: ['dragon flag', 'dragonflags'],
    },
    {
      name: 'Mountain Climbers', emoji: '⛰️', label: tr('Mountain Climbers'), group: 'core', level: 1, goal: 150, fig: 'climber', // i18n-ignore: DB-Name
      how: tr('In der Liegestütz-Position die Knie schnell abwechselnd Richtung Brust ziehen. Die Hüfte bleibt unten.'),
      muscles: tr('Bauch, Schultern, Ausdauer'),
      rule: tr('Liegestütz-Position, Knie bis unter die Brust. Jedes Bein zählt einzeln.'),
      alias: ['mountain climber', 'mountainclimbers', 'bergsteiger'],
    },
    // ── Ganzkörper ──
    {
      name: 'Burpees', emoji: '💪', label: tr('Burpees'), group: 'full', level: 2, goal: 50, fig: 'burpee', basic: true, // i18n-ignore: DB-Name
      how: tr('In die Hocke, Füße nach hinten in den Liegestütz, Brust zum Boden. Füße wieder ran und mit den Händen über dem Kopf hochspringen.'),
      muscles: tr('Ganzer Körper, Ausdauer'),
      rule: tr('Brust am Boden, oben Sprung mit den Händen über dem Kopf.'),
      alias: ['burpee'],
    },
    {
      name: 'Hampelmänner', emoji: '⭐', label: tr('Hampelmänner'), group: 'full', level: 1, goal: 200, fig: 'jack', // i18n-ignore: DB-Name
      how: tr('Aus dem Stand springen: Beine auseinander, Hände über dem Kopf zusammen, dann zurück. Der Klassiker zum Aufwärmen.'),
      muscles: tr('Ganzer Körper, Ausdauer'),
      rule: tr('Beine auseinander und Hände über dem Kopf, dann zurück in den Stand.'),
      alias: ['hampelmann', 'jumping jacks', 'jumping jack', 'hampelmaenner'],
    },
    // ── Workouts ──
    {
      name: 'Bring Sally Up', emoji: '🌸', label: tr('Bring Sally Up'), group: 'workout', level: 2, fig: 'sally', basic: true, // i18n-ignore: DB-Name
      how: tr('Liegestütz-Challenge zum Song: hoch und runter im Takt, unten wird gehalten. Wer zuerst absetzt oder durchhängt, ist raus.'),
      muscles: tr('Brust, Trizeps, Willenskraft'),
      rule: tr('Zeit bis zum ersten Absetzen, 3:24 ist das Maximum.'),
      alias: ['bring sally up', 'sally', 'bring sally'],
    },
    {
      name: '20-Min-AMRAP', emoji: '🦸', label: tr('20-Min-AMRAP'), group: 'workout', level: 3, fig: 'amrap', basic: true, // i18n-ignore: DB-Name
      how: tr('So viele Runden wie möglich in 20 Minuten: 5 Klimmzüge, 10 Liegestütze, 15 Kniebeugen. Gezählt werden volle Runden.'),
      muscles: tr('Ganzer Körper'),
      rule: tr('Volle Runden in 20 Minuten: 5 Klimmzüge, 10 Liegestütze, 15 Kniebeugen.'),
      alias: ['amrap', 'tom holland', '20 min amrap'],
      // Teilübungen pro Runde (DB-Namen). Die Datenbank legt pro Runde einen
      // Satz jeder Teilübung an (Tabelle workout_parts, Migrationen
      // 20261125120000_workout_parts.sql und 20261125200000_workout_parts_rounds.sql).
      parts: [['Klimmzüge', 5], ['Liegestütze', 10], ['Kniebeugen', 15]], // i18n-ignore: DB-Namen
    },
  ];

  const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Ohne Bindestriche und Leerzeichen: „Push-ups“ = „push ups“ = „pushups“
  const loose = (s) => norm(s).replace(/[\s-]+/g, '');

  const byName = {};
  const byLoose = {};
  for (const e of LIST) {
    byName[e.name] = e;
    for (const n of [e.name, e.label, ...(e.alias || [])]) {
      const k = loose(n);
      if (k && !byLoose[k]) byLoose[k] = e;
    }
  }

  function meta(name) {
    return byName[name] || null;
  }

  // Eintrag zu einer Kategorie: nur Standard-Übungen, über den Namen in der
  // Datenbank (localizeCategory legt ihn als base_name ab).
  function metaOf(cat) {
    if (!cat || cat.competition_id != null) return null;
    return meta(cat.base_name || cat.name);
  }

  // Katalog-Eintrag zu einem eingetippten Namen, sonst null. Pflicht-Workouts
  // (Sally, AMRAP) nie: Die haben keine Wiederholungen, eine eigene Übung
  // „Sally“ soll keine werden. Gleiche Synonyme sperrt die Datenbank
  // (exercise_aliases, guard_catalog_names).
  function match(text) {
    const k = loose(text);
    if (k.length < 3) return null;
    const e = byLoose[k];
    return e && e.group !== 'workout' ? e : null;
  }

  // Gruppe für die Auswahl: Katalog-Übung laut LIST, eigene Übungen 'own',
  // unbekannte Katalog-Einträge (z. B. Bibel lesen) 'other'.
  function groupOf(cat) {
    if (!cat) return 'other';
    if (cat.competition_id != null) return 'own';
    return metaOf(cat)?.group || 'other';
  }

  // Teilübungen eines Pflicht-Workouts für `rounds` Runden:
  // [{ name (DB), label (App-Sprache), per, reps }]. Andere Übungen: [].
  function partsOf(cat, rounds = 1) {
    const m = metaOf(cat);
    const n = Math.max(0, Math.floor(Number(rounds) || 0));
    return (m?.parts || []).map(([name, per]) => ({ name, label: meta(name)?.label || name, per, reps: per * n }));
  }

  // Pflicht-Workout, zu dem eine Teilübung gehört (für „Teil von: …“ im Feed).
  function workoutOfPart(cat) {
    const m = metaOf(cat);
    return m ? LIST.find(e => (e.parts || []).some(([name]) => name === m.name)) || null : null;
  }

  // Sortierung im Katalog: Reihenfolge von LIST, Unbekanntes danach.
  function orderOf(cat) {
    const m = metaOf(cat);
    const i = m ? LIST.indexOf(m) : -1;
    return i < 0 ? LIST.length : i;
  }

  // Suche über Namen (auch übersetzt) und Synonyme.
  function search(cats, text) {
    const q = loose(text);
    if (!q) return cats;
    return cats.filter(c => {
      const m = metaOf(c);
      const names = [c.name, m?.label, m?.name, ...(m?.alias || [])];
      return names.some(n => n && loose(n).includes(q));
    });
  }

  // ── Strichfigur ───────────────────────────────────────────────────────
  // Seitenansicht, Blick nach rechts, viewBox 0 0 100 100, Boden bei y 95.
  // Pose: hip (Hüfte), t (Winkel Hüfte → Schulter, Grad; 0 = rechts,
  // 90 = unten, -90 = oben), h/h2 (Hände), f/f2 (Füße), eb/kb (Beugerichtung
  // von Ellbogen und Knie, ±1), ha (Kopfrichtung, sonst entlang des Rumpfs).
  // h2/f2 sind die hinteren Gliedmaßen (blasser), fehlen sie, decken sie sich
  // mit den vorderen. front: Ansicht von vorn, beide Seiten gleich kräftig.
  const L = { torso: 24, neck: 9, head: 6, upper: 13, fore: 12, thigh: 17, shin: 17 };
  const FLOOR = 95;

  const stand = { hip: [50, 61], t: -90, h: [52, 62], f: [52, 95], f2: [48, 95], eb: -1, kb: -1 };
  const plankTop = { hip: [45, 80.5], t: -25.5, h: [67, 95], f: [13, 95.5], eb: 1, kb: 1 };
  const plankLow = { hip: [47, 89.5], t: -8, h: [67, 95], f: [13, 94.5], eb: 1, kb: 1 };
  const hang = { hip: [50, 59], t: -90, h: [50, 10], f: [48, 92], eb: 1, kb: -1 };
  const chinOver = { hip: [50, 41], t: -90, h: [50, 10], f: [46, 74], eb: 1, kb: -1 };
  const lying = { hip: [52, 89], t: 180, h: [50, 92], f: [70, 95], eb: 1, kb: -1, ha: 180 };

  const FIGS = {
    pushup: { a: plankTop, b: plankLow },
    sally: { a: plankTop, b: plankLow, hold: true },
    diamond: { a: plankTop, b: plankLow, marks: [['diamond', 67, 89]] },
    kneePushup: {
      a: { hip: [42, 82], t: -32, h: [65, 95], f: [18, 82], eb: 1, kb: -1 },
      b: { hip: [45, 89], t: -10, h: [65, 95], f: [20, 85], eb: 1, kb: -1 },
    },
    decline: {
      props: [['box', 4, 75, 24, 20]],
      a: { hip: [48, 72], t: -5, h: [72, 95], f: [13.5, 75.5], eb: 1, kb: 1 },
      b: { hip: [47.4, 81.4], t: 10.8, h: [72, 95], f: [13.5, 75], eb: 1, kb: 1 },
    },
    archer: {
      a: { ...plankTop, h2: [86, 95] },
      b: { ...plankLow, h2: [88, 95] },
    },
    pike: {
      a: { hip: [45, 62], t: 42, h: [81, 95], f: [37, 95], eb: -1, kb: 1 },
      b: { hip: [48, 63], t: 52, h: [81, 95], f: [37, 95], eb: -1, kb: 1 },
    },
    hspu: {
      props: [['wall', 68]],
      a: { hip: [57, 46], t: 90, h: [57, 95], f: [62, 12], eb: 1, kb: 1, ha: 90 },
      b: { hip: [59, 56], t: 92, h: [52, 95], f: [63, 22], eb: 1, kb: 1, ha: 90 },
    },
    dips: {
      props: [['pbar', 30, 74, 46]],
      a: { hip: [44, 45], t: -90, h: [44, 46], f: [34, 76], eb: 1, kb: -1 },
      b: { hip: [48.8, 57.6], t: -70, h: [44, 46], f: [36, 88], eb: 1, kb: -1 },
    },
    benchDips: {
      props: [['box', 6, 72, 26, 23]],
      a: { hip: [36, 70], t: -95, h: [30, 72], f: [66, 95], eb: -1, kb: -1 },
      b: { hip: [37, 85], t: -95, h: [30, 72], f: [64, 95], eb: -1, kb: -1 },
    },
    pullup: { props: [['bar', 10]], a: hang, b: chinOver },
    chinup: { props: [['bar', 10]], a: { ...hang, eb: -1 }, b: { ...chinOver, eb: -1 } },
    archerPull: {
      props: [['bar', 10]],
      a: { ...hang, h2: [64, 10] },
      b: { ...chinOver, hip: [46, 41], h: [44, 10], h2: [72, 10] },
    },
    australian: {
      props: [['lowbar', 54]],
      a: { hip: [46.7, 85.7], t: -16, h: [70, 54], f: [14, 95], eb: 1, kb: -1 },
      b: { hip: [42.6, 76.7], t: -32.6, h: [70, 54], f: [14, 95], eb: 1, kb: -1 },
    },
    muscleup: {
      props: [['bar', 40]],
      a: { hip: [50, 66], t: -90, h: [52, 40], f: [44, 94], eb: 1, kb: -1 },
      b: { hip: [50, 38], t: -90, h: [52, 40], f: [46, 71], eb: -1, kb: -1 },
    },
    squat: {
      a: { ...stand, h: [74, 37] },
      b: { hip: [38, 79], t: -62, h: [74, 56], f: [52, 95], f2: [48, 95], eb: -1, kb: -1 },
    },
    lunge: {
      a: { hip: [48, 61], t: -90, h: [54, 74], f: [56, 95], f2: [40, 95], eb: -1, kb: -1 },
      b: { hip: [46, 76], t: -90, h: [52, 86], f: [66, 95], f2: [24, 93], eb: -1, kb: -1, kb2: -1 },
    },
    bulgarian: {
      props: [['box', 4, 74, 24, 21]],
      a: { hip: [48, 63], t: -90, h: [52, 76], f: [58, 95], f2: [20, 74], eb: -1, kb: -1, kb2: -1 },
      b: { hip: [44, 77], t: -85, h: [48, 90], f: [62, 95], f2: [20, 74], eb: -1, kb: -1, kb2: -1 },
    },
    pistol: {
      a: { hip: [48, 61], t: -90, h: [72, 40], f: [50, 95], f2: [60, 90], eb: -1, kb: -1, kb2: -1 },
      b: { hip: [40, 84], t: -65, h: [78, 60], f: [50, 95], f2: [74, 80], eb: -1, kb: -1, kb2: -1 },
    },
    jumpSquat: {
      a: { hip: [38, 79], t: -62, h: [30, 80], f: [52, 95], f2: [48, 95], eb: 1, kb: -1 },
      b: { hip: [50, 48], t: -90, h: [53, 0], f: [51, 82], f2: [49, 82], eb: 1, kb: -1 },
    },
    calf: {
      props: [['box', 34, 89, 32, 6]],
      a: { hip: [50, 57], t: -90, h: [52, 58], f: [52, 91], f2: [48, 91], eb: -1, kb: 1 },
      b: { hip: [50, 50], t: -90, h: [52, 51], f: [52, 84], f2: [48, 84], eb: -1, kb: 1 },
    },
    bridge: {
      a: { hip: [50, 89], t: 180, h: [52, 92], f: [68, 95], eb: 1, kb: -1, ha: 180 },
      b: { hip: [50, 74], t: 151, h: [46, 92], f: [68, 95], eb: 1, kb: -1, ha: 180 },
    },
    nordic: {
      props: [['box', 8, 84, 12, 6]],
      a: { hip: [40, 78], t: -90, h: [44, 101], f: [20, 92], eb: -1, kb: 1 },
      b: { hip: [52, 86], t: -28, h: [86, 92], f: [20, 92], eb: -1, kb: 1 },
    },
    legCurl: {
      a: { hip: [48, 84], t: 172, h: [44, 93], f: [82, 94], eb: 1, kb: -1, ha: 180 },
      b: { hip: [50, 75], t: 151, h: [44, 93], f: [66, 95], eb: 1, kb: -1, ha: 180 },
    },
    situp: {
      a: { ...lying, h: [38, 84] },
      b: { hip: [52, 89], t: -62, h: [66, 74], f: [70, 95], eb: 1, kb: -1 },
    },
    crunch: {
      a: { ...lying, h: [38, 84] },
      b: { hip: [52, 89], t: 206, h: [40, 76], f: [70, 95], eb: 1, kb: -1 },
    },
    legRaise: {
      a: { hip: [48, 90], t: 180, h: [54, 93], f: [84, 92], eb: 1, kb: -1, ha: 180 },
      b: { hip: [48, 90], t: 180, h: [54, 93], f: [50, 56], eb: 1, kb: -1, ha: 180 },
    },
    kneeRaise: {
      props: [['bar', 10]],
      a: hang,
      b: { hip: [50, 59], t: -90, h: [50, 10], f: [58, 74], eb: 1, kb: -1 },
    },
    t2b: {
      props: [['bar', 10]],
      a: hang,
      b: { hip: [57, 52], t: -120, h: [50, 10], f: [64, 10], eb: 1, kb: -1 },
    },
    vup: {
      a: { hip: [50, 90], t: 180, h: [2, 90], f: [84, 92], eb: 1, kb: -1, ha: 180 },
      b: { hip: [50, 88], t: -122, h: [66, 56], f: [68, 58], eb: 1, kb: -1 },
    },
    twist: {
      a: { hip: [46, 88], t: -112, h: [30, 86], f: [76, 78], eb: 1, kb: -1 },
      b: { hip: [46, 88], t: -112, h: [64, 84], f: [76, 78], eb: 1, kb: -1 },
    },
    dragon: {
      props: [['bench', 6, 70, 64]],
      a: { hip: [30.2, 45.4], t: 110, h: [10, 70], f: [42, 13], eb: -1, kb: 1, ha: 180 },
      b: { hip: [45.2, 61.8], t: 165, h: [10, 70], f: [78, 53], eb: -1, kb: 1, ha: 180 },
    },
    climber: {
      a: { ...plankTop, f: [14, 95], f2: [54, 90], kb2: 1 },
      b: { ...plankTop, f: [54, 90], f2: [14, 95], kb2: 1 },
    },
    burpee: {
      a: plankTop,
      b: { hip: [50, 48], t: -90, h: [53, 0], h2: [47, 0], f: [51, 82], f2: [49, 82], eb: 1, kb: -1 },
    },
    jack: {
      a: { hip: [50, 61], t: -90, h: [44, 62], h2: [56, 62], f: [47, 95], f2: [53, 95], eb: 1, eb2: -1, kb: 1, kb2: -1, front: true },
      b: { hip: [50, 59], t: -90, h: [33, 14], h2: [67, 14], f: [35, 93], f2: [65, 93], eb: 1, eb2: -1, kb: 1, kb2: -1, front: true },
    },
    amrap: { props: [['bar', 10]], a: hang, b: chinOver },
  };

  const rad = (d) => (d * Math.PI) / 180;
  const add = (p, a, len) => [p[0] + Math.cos(rad(a)) * len, p[1] + Math.sin(rad(a)) * len];
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpP = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  // Winkel auf dem kürzeren Weg
  const lerpA = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;

  // Zweigelenk-IK: Ellbogen bzw. Knie zwischen root und target. bend ±1 wählt
  // die Seite. Liegt das Ziel zu weit weg, bleibt die Gliedmaße gestreckt.
  function limb(rootP, target, a, b, bend) {
    const dx = target[0] - rootP[0], dy = target[1] - rootP[1];
    const d = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.01, Math.hypot(dx, dy)));
    const base = Math.atan2(dy, dx);
    const cos = (a * a + d * d - b * b) / (2 * a * d);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cos)));
    const ang = base + (bend || 1) * alpha;
    const joint = [rootP[0] + Math.cos(ang) * a, rootP[1] + Math.sin(ang) * a];
    const toTarget = Math.atan2(target[1] - joint[1], target[0] - joint[0]);
    const end = [joint[0] + Math.cos(toTarget) * b, joint[1] + Math.sin(toTarget) * b];
    return [joint, end];
  }

  function solve(p) {
    const hip = p.hip;
    const sh = add(hip, p.t, L.torso);
    const head = add(sh, p.ha ?? p.t, L.neck);
    const [el, ha] = limb(sh, p.h, L.upper, L.fore, p.eb);
    const [el2, ha2] = limb(sh, p.h2 || p.h, L.upper, L.fore, p.eb2 ?? p.eb);
    const [kn, ft] = limb(hip, p.f, L.thigh, L.shin, p.kb);
    const [kn2, ft2] = limb(hip, p.f2 || p.f, L.thigh, L.shin, p.kb2 ?? p.kb);
    return { hip, sh, head, el, ha, el2, ha2, kn, ft, kn2, ft2, front: !!p.front };
  }

  function mix(a, b, k) {
    const out = { hip: lerpP(a.hip, b.hip, k), t: lerpA(a.t, b.t, k), h: lerpP(a.h, b.h, k), f: lerpP(a.f, b.f, k) };
    if (a.h2 || b.h2) out.h2 = lerpP(a.h2 || a.h, b.h2 || b.h, k);
    if (a.f2 || b.f2) out.f2 = lerpP(a.f2 || a.f, b.f2 || b.f, k);
    if (a.ha != null || b.ha != null) out.ha = lerpA(a.ha ?? a.t, b.ha ?? b.t, k);
    for (const key of ['eb', 'eb2', 'kb', 'kb2']) if (a[key] != null) out[key] = a[key];
    out.front = a.front;
    return out;
  }

  // Gelenkpunkte für Phase k (0 = Start, 1 = Ende).
  function pose(fig, k = 1) {
    const f = FIGS[fig];
    if (!f) return null;
    return solve(mix(f.a, f.b, Math.max(0, Math.min(1, k))));
  }

  // Bildausschnitt um alle Posen und Geräte (Seitenverhältnis ASPECT), damit
  // kleine Figuren die Karte füllen. [x, y, Breite, Höhe]
  const ASPECT = 1.5;
  const boxCache = {};
  function bounds(fig) {
    if (boxCache[fig]) return boxCache[fig];
    const f = FIGS[fig];
    if (!f) return [0, 0, 100];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = FLOOR;
    const take = (x, y, r = 3) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      const p = pose(fig, k);
      for (const key of ['hip', 'sh', 'el', 'ha', 'el2', 'ha2', 'kn', 'ft', 'kn2', 'ft2']) take(p[key][0], p[key][1]);
      take(p.head[0], p.head[1], L.head + 1);
    }
    for (const pr of f.props || []) {
      const [kind, a, b, c, d] = pr;
      if (kind === 'bar') { take(20, a); take(80, a); }
      else if (kind === 'lowbar') { take(56, a); take(86, a); }
      else if (kind === 'pbar') { take(a, c); take(b, c); }
      else if (kind === 'box') { take(a, b, 0); take(a + c, b + d, 0); }
      else if (kind === 'bench') { take(a, b, 0); take(a + c, b, 0); }
      else if (kind === 'wall') { take(a, 4); }
    }
    const pad = 5;
    let w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
    if (w < h * ASPECT) w = h * ASPECT; else h = w / ASPECT;
    const x = (x0 + x1) / 2 - w / 2;
    const y = y1 + pad - h;
    return (boxCache[fig] = [x, y, w, h].map(v => Math.round(v * 10) / 10));
  }

  function figure(fig) {
    const f = FIGS[fig];
    return f ? { props: f.props || [], marks: f.marks || [], hold: !!f.hold, box: bounds(fig) } : null;
  }

  const api = { GROUPS, LEVELS, LIST, FLOOR, ASPECT, meta, metaOf, match, groupOf, orderOf, partsOf, workoutOfPart, search, pose, figure, figs: Object.keys(FIGS), _loose: loose };
  root.PTExercises = api;
  if (typeof window !== 'undefined') window.PTExercises = api;
})();
