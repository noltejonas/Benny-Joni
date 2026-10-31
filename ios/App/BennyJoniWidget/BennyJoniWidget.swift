import SwiftUI
import WidgetKit

// Homescreen-Widget „Deine Woche“: Fortschritt der Woche über alle laufenden
// Challenges, die nächsten offenen Übungen und (groß) die Challenges selbst.
//
// Daten: Schnappschuss aus der App (www/widget-model.js), über eine geteilte
// Keychain-Gruppe (WidgetStore). Das Widget greift nie selbst aufs Netz zu. Texte, die
// sich ohne App ändern („heute noch …“, „noch n Tage“), liegen für jeden
// Wochentag im Schnappschuss; die Timeline wechselt um Mitternacht auf den
// nächsten Tag. Gehört der Schnappschuss zu einer anderen Woche, steht dort
// „Neue Woche“. Antippen öffnet die App (projektterminator://widget/…).

// MARK: - Daten

struct WeekSnapshot: Decodable {
    struct Exercise: Decodable, Identifiable {
        let key: String
        let name: String
        let pct: Double
        let finished: Bool
        let emojis: String
        let lines: [String]
        let link: String
        var id: String { key }
    }

    struct Comp: Decodable, Identifiable {
        let id: String
        let name: String
        let emoji: String
        let score: String
        let status: String
        let progress: String
        let link: String
    }

    struct Palette: Decodable {
        let tile0: String?
        let tile1: String?
        let side0: String?
        let side1: String?
        let accent: String?
    }

    struct Colors: Decodable {
        let light: Palette?
        let dark: Palette?
    }

    struct Labels: Decodable {
        let app: String
        let newWeek: String
        let openApp: String
        let empty: String
        let exercises: String
        let challenges: String
    }

    struct Links: Decodable {
        let home: String
    }

    let v: Int
    let updatedAt: String?
    let weekStart: String
    let title: String
    let daysLeft: [String]
    let done: Int
    let total: Int
    let pct: Double
    let doneLabel: String
    let allDone: String
    let exercises: [Exercise]
    let comps: [Comp]
    let colors: Colors?
    let labels: Labels
    let links: Links

    // Wie die Fokus-Karte der App: Fortschritt in Prozent, „x von y erledigt“ daneben.
    var pctLabel: String { "\(Int((min(1, max(0, pct)) * 100).rounded()))%" }
    var allFinished: Bool { total > 0 && done == total }

    static func load() -> WeekSnapshot? {
        guard let data = WidgetStore.load() else { return nil }
        return try? JSONDecoder().decode(WeekSnapshot.self, from: data)
    }

    var updatedDate: Date? {
        guard let updatedAt else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: updatedAt) ?? ISO8601DateFormatter().date(from: updatedAt)
    }

    // 1 (Montag) … 7 (Sonntag) für `date` in der Woche ab weekStart, sonst nil.
    func dayIndex(on date: Date, calendar: Calendar = .current) -> Int? {
        let parts = weekStart.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let monday = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: monday), to: calendar.startOfDay(for: date)).day ?? -1
        return (0...6).contains(days) ? days + 1 : nil
    }
}

// MARK: - Timeline

struct WeekEntry: TimelineEntry {
    let date: Date
    let snapshot: WeekSnapshot?
    let day: Int?           // Wochentag im Schnappschuss; nil = andere Woche
    var isSample = false

    var isStale: Bool { snapshot != nil && day == nil }
}

struct WeekProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeekEntry {
        WeekEntry(date: Date(), snapshot: .sample, day: 3, isSample: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (WeekEntry) -> Void) {
        let entry = entry(for: Date())
        // Galerie ohne eigene Daten: Beispiel statt leerer Kachel
        if context.isPreview && entry.snapshot == nil {
            completion(placeholder(in: context))
        } else {
            completion(entry)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeekEntry>) -> Void) {
        let calendar = Calendar.current
        let now = Date()
        var entries = [entry(for: now)]
        // Ab Mitternacht gilt der Text des nächsten Tages (bis Sonntag, danach „Neue Woche“).
        var day = calendar.startOfDay(for: now)
        for _ in 0..<7 {
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
            entries.append(entry(for: day))
        }
        // Neue Daten kommen von der App (reloadTimelines); danach erneut fragen.
        completion(Timeline(entries: entries, policy: .atEnd))
    }

    private func entry(for date: Date) -> WeekEntry {
        let snapshot = WeekSnapshot.load()
        return WeekEntry(date: date, snapshot: snapshot, day: snapshot?.dayIndex(on: date))
    }
}

// MARK: - Farben (wie die Fokus-Karte der App, aus der gewählten Palette)

struct WidgetTheme {
    let tile0: Color
    let tile1: Color
    let side0: Color
    let side1: Color

    static func resolve(_ colors: WeekSnapshot.Colors?, scheme: ColorScheme) -> WidgetTheme {
        let dark = scheme == .dark
        let p = dark ? (colors?.dark ?? colors?.light) : (colors?.light ?? colors?.dark)
        return WidgetTheme(
            tile0: Color(hex: p?.tile0) ?? Color(red: 0x6A / 255, green: 0x4C / 255, blue: 0xF5 / 255),
            tile1: Color(hex: p?.tile1) ?? Color(red: 0x43 / 255, green: 0x38 / 255, blue: 0xCA / 255),
            side0: Color(hex: p?.side0) ?? (dark ? Color(red: 0x4F / 255, green: 0xB3 / 255, blue: 0xC2 / 255) : Color(red: 0x2B / 255, green: 0x8A / 255, blue: 0x9A / 255)),
            side1: Color(hex: p?.side1) ?? (dark ? Color(red: 0xF0 / 255, green: 0xA8 / 255, blue: 0x66 / 255) : Color(red: 0xE8 / 255, green: 0x91 / 255, blue: 0x4A / 255))
        )
    }

    var gradient: LinearGradient {
        LinearGradient(colors: [tile0, tile1], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

extension Color {
    init?(hex: String?) {
        guard var s = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let n = UInt32(s, radix: 16) else { return nil }
        self.init(red: Double((n >> 16) & 0xFF) / 255, green: Double((n >> 8) & 0xFF) / 255, blue: Double(n & 0xFF) / 255)
    }
}

// MARK: - Bausteine

private let done = Color(red: 0x34 / 255, green: 0xDB / 255, blue: 0x86 / 255)

struct ProgressRing: View {
    let pct: Double
    let label: String
    var size: CGFloat = 64
    var line: CGFloat = 7
    var finished = false

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.22), lineWidth: line)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, pct)))
                .stroke(finished ? done : Color.white, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if finished {
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.34, weight: .heavy))
                    .foregroundStyle(.white)
            } else {
                Text(label)
                    .font(.system(size: size * 0.26, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
    }
}

struct Bar: View {
    let pct: Double
    let finished: Bool
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.22))
                Capsule()
                    .fill(finished ? done : Color.white)
                    .frame(width: max(height, geo.size.width * min(1, max(0, pct))))
            }
        }
        .frame(height: height)
    }
}

struct ExerciseRow: View {
    let exercise: WeekSnapshot.Exercise
    let day: Int
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 3 : 4) {
            HStack(spacing: 6) {
                Text(exercise.name)
                    .font(.system(size: compact ? 14 : 15, weight: .bold, design: .rounded))
                    .lineLimit(1)
                Spacer(minLength: 4)
                if !exercise.emojis.isEmpty {
                    Text(exercise.emojis).font(.system(size: 11))
                }
            }
            Bar(pct: exercise.finished ? 1 : exercise.pct, finished: exercise.finished, height: compact ? 5 : 6)
            Text(line)
                .font(.system(size: compact ? 11 : 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
        }
        .foregroundStyle(.white)
    }

    private var line: String {
        let i = max(1, min(7, day)) - 1
        return exercise.lines.indices.contains(i) ? exercise.lines[i] : ""
    }
}

// MARK: - Größen

struct SmallView: View {
    let s: WeekSnapshot
    let day: Int

    var body: some View {
        let next = s.exercises.first { !$0.finished }
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.title).font(.system(size: 13, weight: .heavy, design: .rounded))
                    Text(daysLeft(s, day)).font(.system(size: 11, weight: .semibold)).opacity(0.85)
                }
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
            HStack {
                ProgressRing(pct: s.pct, label: s.pctLabel, size: 56, line: 6, finished: s.allFinished)
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
            if let next {
                Text(next.name)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(lineFor(next, day))
                    .font(.system(size: 12, weight: .semibold))
                    .opacity(0.85)
                    .lineLimit(1)
            } else {
                Text(s.allDone.isEmpty ? s.doneLabel : s.allDone)
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .lineLimit(2)
            }
        }
        .foregroundStyle(.white)
    }
}

struct MediumView: View {
    let s: WeekSnapshot
    let day: Int

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(s.title).font(.system(size: 13, weight: .heavy, design: .rounded))
                Text(daysLeft(s, day)).font(.system(size: 11, weight: .semibold)).opacity(0.85)
                Spacer(minLength: 0)
                ProgressRing(pct: s.pct, label: s.pctLabel, size: 62, line: 7, finished: s.allFinished)
                Spacer(minLength: 0)
                Text(s.allDone.isEmpty ? s.doneLabel : s.allDone)
                    .font(.system(size: 11, weight: .bold))
                    .opacity(0.9)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 96, alignment: .leading)

            VStack(alignment: .leading, spacing: 9) {
                if s.exercises.isEmpty {
                    Text(s.labels.empty).font(.system(size: 13, weight: .semibold)).opacity(0.9)
                } else {
                    ForEach(s.exercises.prefix(3)) { ex in
                        Link(destination: URL(string: ex.link) ?? homeURL(s)) {
                            ExerciseRow(exercise: ex, day: day, compact: true)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(.white)
    }
}

struct LargeView: View {
    let s: WeekSnapshot
    let day: Int

    var body: some View {
        // Platz reicht für zwei Challenges und drei Übungen; ohne Challenges fünf Übungen.
        let comps = Array(s.comps.prefix(2))
        let exercises = Array(s.exercises.prefix(comps.isEmpty ? 5 : 3))
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                ProgressRing(pct: s.pct, label: s.pctLabel, size: 42, line: 5, finished: s.allFinished)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text("\(s.title) · \(daysLeft(s, day))")
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .opacity(0.9)
                        Spacer(minLength: 4)
                        if let updated = s.updatedDate {
                            Text("widget.updated \(updated.formatted(date: .omitted, time: .shortened))")
                                .font(.system(size: 10, weight: .semibold))
                                .opacity(0.7)
                        }
                    }
                    Text(s.allDone.isEmpty ? s.doneLabel : s.allDone)
                        .font(.system(size: 17, weight: .heavy, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }

            if !comps.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    SectionTitle(text: s.labels.challenges)
                    ForEach(comps) { c in
                        Link(destination: URL(string: c.link) ?? homeURL(s)) {
                            HStack(spacing: 8) {
                                Text(c.emoji).font(.system(size: 17))
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(c.name).font(.system(size: 14, weight: .bold, design: .rounded)).lineLimit(1)
                                    Text(c.status).font(.system(size: 11, weight: .semibold)).opacity(0.85).lineLimit(1)
                                }
                                Spacer(minLength: 4)
                                if !c.score.isEmpty {
                                    Text(c.score)
                                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                                        .monospacedDigit()
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                SectionTitle(text: s.labels.exercises)
                if exercises.isEmpty {
                    Text(s.labels.empty).font(.system(size: 13, weight: .semibold)).opacity(0.9)
                } else {
                    ForEach(exercises) { ex in
                        Link(destination: URL(string: ex.link) ?? homeURL(s)) {
                            ExerciseRow(exercise: ex, day: day, compact: true)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .foregroundStyle(.white)
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .heavy))
            .tracking(0.6)
            .opacity(0.8)
    }
}

// Ohne Schnappschuss (noch nie geöffnet, abgemeldet) oder aus einer alten Woche.
struct MessageView: View {
    let title: Text
    let text: Text

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 22, weight: .bold))
            Spacer(minLength: 0)
            title.font(.system(size: 17, weight: .heavy, design: .rounded)).lineLimit(2)
            text.font(.system(size: 12, weight: .semibold)).opacity(0.85).lineLimit(3)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private func daysLeft(_ s: WeekSnapshot, _ day: Int) -> String {
    let i = max(1, min(7, day)) - 1
    return s.daysLeft.indices.contains(i) ? s.daysLeft[i] : ""
}

private func lineFor(_ e: WeekSnapshot.Exercise, _ day: Int) -> String {
    let i = max(1, min(7, day)) - 1
    return e.lines.indices.contains(i) ? e.lines[i] : ""
}

private func homeURL(_ s: WeekSnapshot?) -> URL {
    URL(string: s?.links.home ?? "projektterminator://widget/home") ?? URL(string: "projektterminator://widget/home")!
}

// MARK: - Widget

struct WeekWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: WeekEntry

    var body: some View {
        let theme = WidgetTheme.resolve(entry.snapshot?.colors, scheme: scheme)
        content
            .widgetURL(homeURL(entry.snapshot))
            .containerBackground(for: .widget) { theme.gradient }
    }

    @ViewBuilder
    private var content: some View {
        if let s = entry.snapshot, let day = entry.day {
            switch family {
            case .systemSmall: SmallView(s: s, day: day)
            case .systemLarge: LargeView(s: s, day: day)
            default: MediumView(s: s, day: day)
            }
        } else if let s = entry.snapshot {
            MessageView(title: Text(s.labels.newWeek), text: Text(s.labels.openApp))
        } else {
            MessageView(title: Text("widget.noData.title"), text: Text("widget.noData.text"))
        }
    }
}

struct WeekWidget: Widget {
    let kind = WidgetStore.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeekProvider()) { entry in
            WeekWidgetView(entry: entry)
        }
        .configurationDisplayName(Text("widget.name"))
        .description(Text("widget.description"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct BennyJoniWidgetBundle: WidgetBundle {
    var body: some Widget {
        WeekWidget()
    }
}

// MARK: - Beispiel (Galerie, Platzhalter)

extension WeekSnapshot {
    static var sample: WeekSnapshot {
        let b = Bundle.main
        let s = { (key: String) in NSLocalizedString(key, bundle: b, comment: "") }
        func ex(_ key: String, _ name: String, _ pct: Double, _ line: String, finished: Bool = false) -> Exercise {
            Exercise(key: key, name: name, pct: pct, finished: finished, emojis: "💪🔥",
                     lines: Array(repeating: line, count: 7), link: "projektterminator://widget/home")
        }
        return WeekSnapshot(
            v: 1, updatedAt: nil, weekStart: "", title: s("sample.title"),
            daysLeft: Array(repeating: s("sample.daysLeft"), count: 7),
            done: 1, total: 3, pct: 0.55, doneLabel: s("sample.done"), allDone: "",
            exercises: [
                ex("a", s("sample.ex1"), 0.45, s("sample.line1")),
                ex("b", s("sample.ex2"), 0.7, s("sample.line2")),
                ex("c", s("sample.ex3"), 1, s("sample.line3"), finished: true),
            ],
            comps: [
                Comp(id: "a", name: s("sample.comp1"), emoji: "💪", score: "2 : 1", status: s("sample.status1"), progress: "", link: "projektterminator://widget/home"),
                Comp(id: "b", name: s("sample.comp2"), emoji: "🔥", score: "", status: s("sample.status2"), progress: "", link: "projektterminator://widget/home"),
            ],
            colors: nil,
            labels: Labels(app: "Benny & Joni", newWeek: "", openApp: "", empty: "",
                           exercises: s("sample.exercises"), challenges: s("sample.challenges")),
            links: Links(home: "projektterminator://widget/home")
        )
    }
}
