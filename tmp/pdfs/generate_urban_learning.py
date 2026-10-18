from __future__ import annotations

import html
from datetime import date
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "energon-os-rust-systemdesign-masterkurs.pdf"

pdfmetrics.registerFont(TTFont("EnergonSans", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("EnergonSansBold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("EnergonMono", "/System/Library/Fonts/Supplemental/Courier New.ttf"))
pdfmetrics.registerFont(TTFont("EnergonMonoBold", "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"))

BG = HexColor("#111111")
PANEL = HexColor("#0D0D0D")
INK = HexColor("#FFFFFF")
TEXT = HexColor("#A3A3A3")
MUTED = HexColor("#737373")
DIM = HexColor("#525252")
LINE = HexColor("#2A2A2A")
LINE_STRONG = HexColor("#3A3A3A")


def source_range(relative_path: str, start: int, end: int) -> str:
    path = ROOT / relative_path
    lines = path.read_text(encoding="utf-8").splitlines()
    return "\n".join(lines[start - 1 : end])


def source_join(*parts: tuple[str, int, int]) -> str:
    chunks = []
    for path, start, end in parts:
        chunks.append(source_range(path, start, end))
    return "\n\n".join(chunks)


SNIPPETS = {
    "api_boot": source_range("crates/energon-api/src/main.rs", 19, 45),
    "router": source_range("crates/energon-api/src/app.rs", 22, 43),
    "auth": source_join(
        ("crates/energon-api/src/middleware/auth.rs", 10, 24),
        ("crates/energon-api/src/middleware/auth.rs", 50, 64),
    ),
    "context": source_range("crates/energon-core/src/context_broker.rs", 62, 121),
    "embeddings": source_range("crates/energon-api/src/embedding.rs", 79, 112),
    "schema": source_join(
        ("migrations/0002_memory.sql", 1, 24),
        ("migrations/0002_memory.sql", 41, 52),
    ),
    "sdk": source_range("packages/sdk-typescript/src/index.ts", 298, 348),
    "worker": source_range("crates/energon-worker/src/main.rs", 63, 83),
}


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="BodyDark",
        parent=styles["BodyText"],
        fontName="EnergonSans",
        fontSize=10.1,
        leading=15.2,
        textColor=TEXT,
        spaceAfter=8,
        alignment=TA_LEFT,
    )
)
styles.add(
    ParagraphStyle(
        name="BodySmall",
        parent=styles["BodyText"],
        fontName="EnergonSans",
        fontSize=8.9,
        leading=13.1,
        textColor=TEXT,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="Kicker",
        parent=styles["BodyText"],
        fontName="EnergonMonoBold",
        fontSize=8.1,
        leading=10,
        textColor=MUTED,
        spaceAfter=9,
        tracking=0.6,
    )
)
styles.add(
    ParagraphStyle(
        name="H1Dark",
        parent=styles["Heading1"],
        fontName="EnergonSansBold",
        fontSize=25,
        leading=30,
        textColor=INK,
        spaceBefore=0,
        spaceAfter=11,
    )
)
styles.add(
    ParagraphStyle(
        name="H2Dark",
        parent=styles["Heading2"],
        fontName="EnergonSansBold",
        fontSize=16.5,
        leading=21,
        textColor=INK,
        spaceBefore=14,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="H3Dark",
        parent=styles["Heading3"],
        fontName="EnergonSansBold",
        fontSize=11.2,
        leading=14,
        textColor=INK,
        spaceBefore=8,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Label",
        parent=styles["BodyText"],
        fontName="EnergonMono",
        fontSize=7.8,
        leading=10,
        textColor=MUTED,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Quote",
        parent=styles["BodyText"],
        fontName="EnergonSans",
        fontSize=11.3,
        leading=16,
        textColor=INK,
        leftIndent=13,
        borderColor=LINE_STRONG,
        borderWidth=0,
        borderPadding=0,
        spaceBefore=5,
        spaceAfter=11,
    )
)
styles.add(
    ParagraphStyle(
        name="CodeDark",
        parent=styles["Code"],
        fontName="EnergonMono",
        fontSize=6.9,
        leading=8.8,
        textColor=HexColor("#DEDEDE"),
        leftIndent=0,
        rightIndent=0,
    )
)
styles.add(
    ParagraphStyle(
        name="Tiny",
        parent=styles["BodyText"],
        fontName="EnergonMono",
        fontSize=7.3,
        leading=9.5,
        textColor=DIM,
    )
)


def p(text: str, style: str = "BodyDark") -> Paragraph:
    return Paragraph(text, styles[style])


def title(text: str, level: int = 1) -> Paragraph:
    return p(text, "H1Dark" if level == 1 else "H2Dark" if level == 2 else "H3Dark")


def kicker(text: str) -> Paragraph:
    return p(html.escape(text.upper()), "Kicker")


def bullet(text: str) -> Paragraph:
    return p(f'<font color="#737373">-</font>&nbsp;&nbsp;{text}', "BodyDark")


def rule() -> Table:
    table = Table([[""]], colWidths=[A4[0] - 36 * mm])
    table.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, 0), 0.6, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def code_block(path: str, line_range: str, code: str) -> KeepTogether:
    label = p(f"SOURCE  {html.escape(path)}  /  {html.escape(line_range)}", "Label")
    rendered = Preformatted(code, styles["CodeDark"], maxLineLength=104)
    table = Table([[rendered]], colWidths=[A4[0] - 36 * mm])
    table.setStyle(
        TableStyle(
            [
                ("LINEBEFORE", (0, 0), (0, -1), 1.2, LINE_STRONG),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return KeepTogether([label, table, Spacer(1, 5)])


def mini_table(rows: list[tuple[str, str]], widths: tuple[float, float] = (47 * mm, 117 * mm)) -> Table:
    data = [[p(f"<b>{html.escape(left)}</b>", "BodySmall"), p(right, "BodySmall")] for left, right in rows]
    table = Table(data, colWidths=list(widths), hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, -1), 0),
                ("LEFTPADDING", (1, 0), (1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBEFORE", (1, 0), (1, -1), 0.6, LINE),
            ]
        )
    )
    return table


def page_background(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(BG)
    canvas.rect(0, 0, width, height, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.55)
    canvas.line(18 * mm, height - 16 * mm, width - 18 * mm, height - 16 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("EnergonMono", 7.3)
    canvas.drawString(18 * mm, height - 11.5 * mm, "ENERGON OS / RUST + DATABASES + SYSTEM DESIGN")
    canvas.drawRightString(width - 18 * mm, height - 11.5 * mm, "MASTER COURSE")
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFillColor(DIM)
    canvas.drawString(18 * mm, 8.9 * mm, "PRIVATE MEMORY FOR AI AGENT SWARMS")
    canvas.drawRightString(width - 18 * mm, 8.9 * mm, f"PAGE {doc.page}")
    canvas.restoreState()


def section_page(label: str, heading: str, subheading: str) -> list:
    return [
        PageBreak(),
        Spacer(1, 38 * mm),
        kicker(label),
        title(heading, 1),
        p(subheading, "Quote"),
        Spacer(1, 8 * mm),
        rule(),
    ]


story: list = []

# Cover
story.extend(
    [
        Spacer(1, 44 * mm),
        kicker("Urban learning document / Energon OS"),
        title("Rust, Datenbanken und\nSystemdesign mit Energon OS", 1),
        p(
            "Die erweiterte Masterausgabe: vom ersten Bit bis zur Rust-Control-Plane, von PostgreSQL und pgvector bis zur Architektur fuer hundert Millionen aktive Agents. Ziel ist nicht Auswendiglernen, sondern belastbares Ingenieursdenken.",
            "Quote",
        ),
        Spacer(1, 12 * mm),
        mini_table(
            [
                ("Niveau", "Start bei null. Fachbegriffe werden zuerst in Alltagssprache erklaert und danach technisch eingeordnet."),
                ("Fokus", "Rust und AI/Memory-Systeme tief. Frontend, Deployment und Zahlungen nur so weit, wie Energon sie braucht."),
                ("Reihenfolge", "1. Konzepte ohne Code. 2. Kurze Originalausschnitte. 3. Konzept und Code gemeinsam lesen."),
                ("Grundhaltung", "Senior zu denken bedeutet nicht, alles auswendig zu wissen. Es bedeutet, Grenzen, Datenfluss, Fehlerfaelle und Sicherheitsinvarianten zu erkennen."),
            ]
        ),
        Spacer(1, 14 * mm),
        p("Datei: energon-os-rust-systemdesign-masterkurs.pdf", "Tiny"),
        p(f"Erstellt am {date(2026, 8, 12).isoformat()} aus der aktuellen Energon-OS-Codebasis.", "Tiny"),
    ]
)

# Keep the cover in front while the advanced material is assembled separately.
cover_story = story
story = []

# Part IV - deep Rust and computer science
story.extend(section_page(
    "Teil 4 / Rust und Computer Science tief",
    "Vom Speicher bis zur async Runtime",
    "Jetzt verbinden wir Sprache, Compiler, CPU, Speicher und Nebenlaeufigkeit. Jede Rust-Regel bekommt einen Grund im echten Computersystem.",
))

story.extend(
    [
        title("27. Vom Quellcode zum Prozess", 2),
        p("Cargo liest den Workspace, loest Abhaengigkeiten auf und ruft den Rust-Compiler auf. Der Compiler parst den Text, prueft Typen, Ownership und Borrowing, erzeugt eine Zwischendarstellung und daraus Maschinen-Code fuer die Ziel-CPU. In Produktion laeuft deshalb nicht die Datei main.rs. Das Betriebssystem laedt eine kompilierte Binärdatei in einen neuen Prozess."),
        p("Ein Prozess besitzt einen virtuellen Adressraum. Darin liegen Maschinen-Code, statische Daten, Stacks und Heap-Bereiche. Virtuell bedeutet: Die Adressen des Prozesses sind nicht direkt dieselben wie physische RAM-Adressen. Das Betriebssystem und die CPU uebersetzen sie ueber Seitentabellen. Dadurch koennen Prozesse voneinander isoliert werden."),
        mini_table(
            [
                ("Compiler", "Findet viele Fehler vor dem Start und erzeugt Maschinen-Code."),
                ("Prozess", "Eine laufende Instanz des Programms mit eigenem virtuellen Speicher."),
                ("Thread", "Ein Ausfuehrungsstrom innerhalb eines Prozesses mit eigenem Stack."),
                ("Task", "Eine von Tokio geplante async Zustandsmaschine; nicht identisch mit einem Betriebssystemthread."),
                ("Socket", "Eine Betriebssystemressource fuer Netzwerkkommunikation."),
            ]
        ),
        p("Beim Start von energon-api entstehen Tokio-Runtime-Threads, ein PostgreSQL-Connection-Pool und ein TCP-Listener. Danach wartet der Prozess nicht passiv auf nur einen Client. Er kann viele offene Verbindungen verwalten und Tasks immer dann weiter ausfuehren, wenn deren I/O bereit ist."),
        PageBreak(),
        title("28. Stack, Heap und ein Rust String", 2),
        p("Der Stack speichert typischerweise lokale Werte und Funktionsrahmen. Er ist sehr schnell, weil Speicher in einer einfachen Reihenfolge reserviert und freigegeben wird. Der Heap speichert dynamisch grosse Werte, deren Groesse oder Lebensdauer nicht schon durch den unmittelbaren Funktionsrahmen bestimmt ist."),
        p("Ein Rust String besteht konzeptionell auf dem Stack aus Pointer, Laenge und Kapazitaet. Die UTF-8-Bytes liegen auf dem Heap. Wird der String bewegt, werden Pointer, Laenge und Kapazitaet uebertragen - nicht automatisch alle Textbytes kopiert."),
        p("Darum invalidiert <b>let b = a;</b> bei einem String normalerweise den Namen a. Nur b besitzt danach den Heap-Speicher. Rust verhindert so, dass zwei Besitzer denselben Speicher freigeben. <b>clone()</b> erzeugt bewusst eine zweite Kopie und macht die Kosten sichtbar."),
        p("Kleine Typen wie u64 implementieren Copy. Bei ihnen ist eine Bitkopie billig und eindeutig. Ein u64 benoetigt keinen Heap und besitzt keine Ressource, die genau einmal freigegeben werden muss."),
        title("Cache-Lokalitaet", 3),
        p("Die CPU ist viel schneller als der Arbeitsspeicher. Sie besitzt kleine Cache-Ebenen. Zusammenhaengende Daten wie ein Vec koennen cachefreundlicher sein als viele weit verteilte Heap-Objekte. Das ist einer der Gruende, warum Datenlayout bei sehr hoher Last relevant wird - aber erst messen, dann optimieren."),
        PageBreak(),
        title("29. Ownership im echten Memory Record", 2),
        code_block(
            "crates/energon-core/src/memory.rs",
            "96-127",
            source_range("crates/energon-core/src/memory.rs", 96, 127),
        ),
        p("<b>agent: &amp;AgentIdentity</b> ist eine unveraenderliche Leihgabe. Die Funktion darf die Identitaet lesen, aber nicht aus dem Aufrufer entfernen. <b>request: WriteMemoryRequest</b> wird dagegen bewegt. Die Funktion darf seine Strings und Vektoren in den neuen Record uebernehmen."),
        p("Der Rueckgabetyp <b>Result&lt;Self, EnergonError&gt;</b> sagt: Entweder entsteht ein gueltiger MemoryRecord oder ein expliziter Domain-Fehler. <b>request.validate()?</b> beendet die Funktion sofort, falls die Invariante nicht gilt."),
        p("<b>agent.org_id.clone()</b> ist notwendig, weil der Agent nur geliehen wurde. Einen String kann man nicht aus einer geliehenen Struct herausbewegen. Clone erzeugt einen neuen Besitzer. Dagegen kann <b>request.scope</b> direkt uebernommen werden, weil request der Funktion gehoert."),
        p("<b>Self { ... }</b> baut einen Wert desselben Typs wie der impl-Block. Der Record wird erst nach einer zweiten Metadatenvalidierung als Ok zurueckgegeben. Das ist eine kleine, aber wichtige Domain-Grenze: Aus der Funktion soll kein halbgueltiger Record entkommen."),
        PageBreak(),
        title("30. Referenzen und Lifetimes", 2),
        p("Eine Referenz ist kein eigener Besitzer. Sie zeigt temporaer auf einen gueltigen Wert. Der Borrow Checker beweist zur Compile-Zeit, dass eine Referenz nicht laenger lebt als ihr Ziel und dass Schreibzugriffe nicht unkontrolliert mit anderen Zugriffen konkurrieren."),
        mini_table(
            [
                ("&amp;T", "Viele unveraenderliche Leser duerfen gleichzeitig existieren."),
                ("&amp;mut T", "Genau ein exklusiver Zugriff darf den Wert veraendern."),
                ("'a", "Ein Lifetime-Parameter beschreibt die Beziehung zwischen Referenzlebenszeiten."),
                ("&amp;str", "Geliehene Sicht auf gueltigen UTF-8-Text."),
                ("&amp;[T]", "Geliehene Sicht auf eine zusammenhaengende Sequenz."),
            ]
        ),
        p("Lifetimes sind keine Timer. Sie erzeugen normalerweise keine Runtime-Arbeit. Sie sind Beweise fuer den Compiler. Wenn eine Funktion eine Referenz zurueckgibt, muss klar sein, aus welchem Eingabewert diese Referenz stammt und wie lange sie gueltig bleibt."),
        p("Im Context Broker ist <b>memories: &amp;[MemoryRecord]</b> besonders passend. Die Domain-Funktion soll Kandidaten lesen, aber nicht die Datenbankliste besitzen oder veraendern. Eine Slice kann auf einen ganzen Vec oder nur einen Ausschnitt zeigen."),
        title("Borrowing und Architektur", 3),
        p("Ownership ist nicht nur Speichersicherheit. Eine Funktionssignatur dokumentiert Verantwortung. Besitz bedeutet oft: Diese Schicht darf den Wert weiterreichen oder dauerhaft behalten. Borrowing bedeutet: Diese Schicht betrachtet den Wert nur waehrend der Operation."),
        PageBreak(),
        title("31. Enums, Pattern Matching und unmoegliche Zustaende", 2),
        code_block(
            "crates/energon-core/src/permissions.rs",
            "13-35",
            source_range("crates/energon-core/src/permissions.rs", 13, 35),
        ),
        p("Der erste Vergleich ist die Tenant-Grenze. Selbst ein Open-Scope darf im aktuellen Modell nicht organisationsuebergreifend gelesen werden. Danach deckt match jede MemoryScope-Variante ab."),
        p("Das Zeichen <b>|</b> verbindet Patterns: Open oder Org fuehren zum selben Ergebnis. Der Project-Arm berechnet zunaechst die wirksame Projekt-ID. <b>as_ref()</b> wandelt Option&lt;String&gt; in Option&lt;&amp;String&gt;, damit kein String bewegt oder kopiert werden muss."),
        p("Beim AgentPrivate-Arm wird eine Option-Referenz mit <b>Some(&amp;agent.agent_id)</b> verglichen. Nur der Besitzer erhaelt Zugriff. UserPrivate und Session verlangen zusaetzlich, dass ein vertrauenswuerdiger AccessContext ueberhaupt vorhanden ist."),
        p("Enums helfen, unmoegliche oder unerkannte Zustaende zu vermeiden. Wird spaeter ein neuer Scope ergaenzt, meldet der Compiler alle nicht vollstaendigen match-Ausdruecke. Das ist eine Form von architektonischer Wartbarkeit."),
        PageBreak(),
        title("32. Traits, Generics und Into", 2),
        code_block(
            "crates/energon-core/src/identity.rs",
            "11-24",
            source_range("crates/energon-core/src/identity.rs", 11, 24),
        ),
        p("Ein Trait beschreibt Faehigkeiten. <b>Into&lt;String&gt;</b> bedeutet: Dieser Eingabetyp kann in einen String umgewandelt werden. Deshalb akzeptiert der Konstruktor sowohl String als auch viele geliehene Textformen, ohne mehrere Konstruktoren zu benoetigen."),
        p("Generics erzeugen typsicheren wiederverwendbaren Code. Bei statischer Dispatch kann der Compiler fuer konkrete Typen spezialisierten Maschinen-Code erzeugen. Das nennt man Monomorphisierung. Der Komfort einer Abstraktion muss daher nicht automatisch einen virtuellen Methodenaufruf zur Laufzeit kosten."),
        p("Das Rust-SDK verwendet <b>send&lt;Body: Serialize, Response: DeserializeOwned&gt;</b>. Der Request-Typ muss JSON-serialisierbar sein; der Response-Typ muss aus JSON als besitzender Wert entstehen koennen. Der Compiler prueft den Vertrag an jedem Aufruf."),
        title("Trait Objects", 3),
        p("<b>Box&lt;dyn Error + Send + Sync&gt;</b> ist dynamischer Dispatch. Der konkrete Fehlertyp kann variieren, aber alle Werte erfuellen den Error-Vertrag und duerfen sicher ueber Thread-Grenzen verwendet werden. Das ist an Integrationsgrenzen praktisch, waehrend Domain-Enums praeziser bleiben sollten."),
        PageBreak(),
        title("33. Async, Futures und Tokio", 2),
        p("Eine async Funktion wird beim Aufruf nicht sofort vollstaendig ausgefuehrt. Sie erzeugt eine Future. Diese Future ist eine Zustandsmaschine, die gespeichert hat, an welcher await-Stelle sie pausiert und welche lokalen Werte sie spaeter noch benoetigt."),
        p("Ein Executor pollt Futures. Ist eine Netzwerkoperation noch nicht bereit, liefert die Future Pending. Das Betriebssystem benachrichtigt Tokio spaeter ueber neue I/O-Bereitschaft. Dann wird die Future erneut gepollt. So verwalten wenige Runtime-Threads viele offene Requests."),
        mini_table(
            [
                ("Concurrency", "Viele Aufgaben befinden sich gleichzeitig im Fortschritt."),
                ("Parallelism", "Mehrere CPU-Kerne fuehren zur selben Zeit Instruktionen aus."),
                ("I/O-bound", "Die meiste Zeit wartet die Aufgabe auf Netzwerk oder Datenbank."),
                ("CPU-bound", "Die meiste Zeit rechnet die CPU; hier helfen Threads oder spezialisierte Worker."),
                ("Backpressure", "Produzenten muessen gebremst werden, wenn Verbraucher nicht nachkommen."),
            ]
        ),
        p("Blockierende Arbeit darf nicht lange auf Tokio-Worker-Threads laufen. Ein synchroner SDK-Client oder teure CPU-Berechnung kann den Thread festhalten und viele andere Tasks verzoegern. Dafuer gibt es async Clients, spawn_blocking oder separate Worker-Pools."),
        PageBreak(),
        title("34. Arc, RwLock und Atomics", 2),
        code_block(
            "crates/energon-api/src/state.rs",
            "19-68",
            source_range("crates/energon-api/src/state.rs", 19, 68),
        ),
        p("Arc ist atomar referenzgezaehlter gemeinsamer Besitz. Ein Clone des AppState kopiert nicht alle Memories. Er erhoeht bei Arc-Feldern nur einen sicheren Zaehler. Der Wert wird freigegeben, wenn der letzte Besitzer verschwindet."),
        p("RwLock erlaubt mehrere Leser oder genau einen Schreiber. Die In-Memory-Variante eignet sich fuer lokale Entwicklung, aber nicht als globaler Produktionsspeicher: Replikate teilen sie nicht, Neustarts loeschen sie und ein grosser Vec erzeugt lineare Arbeit."),
        p("AtomicU64 bietet atomare Zaehleroperationen. Ordering::Relaxed reicht fuer eine lokale Nummer, weil keine weiteren Speicheroperationen daran geordnet werden muessen. Die Kombination aus Unix-Millisekunden und Prozesszaehler kollidiert jedoch zwischen Replikaten. Fuer horizontale Skalierung sind UUIDv7 oder ULID besser."),
    ]
)

# Part V - databases and vector retrieval
story.extend(section_page(
    "Teil 5 / PostgreSQL und Vector Retrieval",
    "Daten dauerhaft, konsistent und auffindbar machen",
    "Diese Schicht entscheidet, welche Wahrheiten das System bewahren kann, wie konkurrierende Writes zusammenleben und wie semantische Suche messbar wird.",
))

story.extend(
    [
        title("35. Das relationale Modell von Energon", 2),
        p("Eine relationale Datenbank speichert nicht nur lose Dokumente. Tabellen beschreiben Entitaeten, Foreign Keys ihre Beziehungen und Constraints die erlaubten Zustaende. Energon trennt Identitaet, Memory, Context Audits, Events, Claims, Billing und Skill-Profile in eigene fachliche Bereiche."),
        mini_table(
            [
                ("Identity", "orgs, projects, roles, agents und agent_api_keys."),
                ("Memory", "memory_entries, memory_chunks und memory_promotions."),
                ("Context", "context_requests und context_request_items."),
                ("Events", "event_outbox als dauerhafte Bruecke zum Message Bus."),
                ("Claims", "memory_claims, claim_conflicts, evidence und Audit Chain."),
            ]
        ),
        p("Eine Primary Key Constraint garantiert Eindeutigkeit und Nicht-Null. Ein Foreign Key verhindert Referenzen auf nicht vorhandene Records. Eine CHECK-Constraint begrenzt beispielsweise Scope oder Confidence. Damit verteidigt PostgreSQL Invarianten auch dann, wenn Anwendungscode einen Fehler macht."),
        p("ON DELETE CASCADE ist bequem, aber bei riesigen Tenants potenziell teuer. In einer Plattform mit Milliarden Records wuerde eine Tenant-Loeschung als kontrollierter Workflow laufen: Tenant deaktivieren, neue Writes stoppen, Partitionen oder Batches loeschen, Auditnachweise erstellen und das Ergebnis verifizieren."),
        PageBreak(),
        title("36. Indizes wirklich verstehen", 2),
        p("Ein Index ist eine zusaetzliche Datenstruktur. Er macht bestimmte Reads schneller, kostet aber Speicher, Cache und Schreibarbeit. Ein Index ist deshalb keine kostenlose Beschleunigung fuer alles."),
        mini_table(
            [
                ("B-Tree", "Gleichheit, Sortierung und Wertebereiche. Beispiel: org_id plus created_at."),
                ("Partial Index", "Enthaelt nur relevante Zeilen, etwa nicht widerrufene API Keys."),
                ("GIN Trigram", "Beschleunigt Textaehnlichkeit und bestimmte LIKE-Suchen."),
                ("HNSW", "Approximate Nearest Neighbor Suche fuer Embedding-Vektoren."),
                ("Composite Index", "Mehrere Spalten; Reihenfolge und Query-Form sind entscheidend."),
            ]
        ),
        p("Der Index <b>(org_id, created_at DESC)</b> passt zu einer Query mit WHERE org_id und ORDER BY created_at DESC. Er ist nicht automatisch optimal fuer eine Query, die nur nach created_at sucht. Der linke Praefix eines zusammengesetzten B-Tree-Index bestimmt viele seiner moeglichen Zugriffswege."),
        p("Mit EXPLAIN ANALYZE prueft man den echten Plan: Index Scan oder Sequential Scan, geschaetzte und tatsaechliche Zeilenzahlen, Sortierung, Buffer-Zugriffe und Laufzeit. SQL-Text allein beweist nicht, welche physische Reihenfolge PostgreSQL ausfuehrt."),
        PageBreak(),
        title("37. Connection Pools und globale Mathematik", 2),
        code_block(
            "crates/energon-db/src/pool.rs",
            "1-8",
            source_range("crates/energon-db/src/pool.rs", 1, 8),
        ),
        p("Eine PostgreSQL-Verbindung besitzt serverseitigen Zustand und kostet Speicher. Ein Pool verwendet wenige Verbindungen fuer viele Requests wieder. Wenn alle Verbindungen belegt sind, wartet ein Request auf den Pool - diese Wartezeit muss gemessen werden."),
        p("Zehn Verbindungen wirken klein. Hundert API-Replikate erzeugen aber bis zu tausend moegliche Verbindungen. Systemdesign rechnet immer global, nicht nur pro Pod. PgBouncer kann viele kurzlebige Client-Sessions auf eine kontrollierte Anzahl echter PostgreSQL-Verbindungen multiplexen."),
        p("Zu viele Verbindungen machen PostgreSQL nicht schneller. Sie erhoehen Kontextwechsel, Speicherverbrauch und konkurrierende Arbeit. Der richtige Pool folgt gemessenem Query-Durchsatz, CPU, I/O und Latenzzielen."),
        title("Read Replicas", 3),
        p("Read Replicas entlasten den Primary, sind aber normalerweise leicht verzoegert. Ein unmittelbar nach einem Write ausgefuehrter Read kann den neuen Wert dort noch nicht sehen. Auth-Revocation und sicherheitskritische Entscheidungen brauchen daher besondere Konsistenzregeln."),
        PageBreak(),
        title("38. Transaktionen und Isolation", 2),
        code_block(
            "crates/energon-db/src/memory.rs",
            "8-17",
            source_range("crates/energon-db/src/memory.rs", 8, 17),
        ),
        p("Memory, Chunk und Outbox-Event muessen gemeinsam sichtbar werden. Die Transaktion garantiert Atomicity: Entweder Commit macht alle Aenderungen sichtbar oder ein Fehler rollt alles zurueck."),
        p("PostgreSQL verwendet standardmaessig READ COMMITTED. Jede Anweisung sieht einen zum Start dieser Anweisung bestaetigten Zustand. Zwei Anweisungen derselben Transaktion koennen daher unterschiedliche neu bestaetigte Daten sehen. Fuer einfache Inserts ist das meist ausreichend; Read-Modify-Write-Entscheidungen benoetigen Locks oder staerkere Isolation."),
        mini_table(
            [
                ("Lost Update", "Zwei Writer lesen denselben Wert und ueberschreiben einander."),
                ("Write Skew", "Zwei Transaktionen halten einzeln Regeln ein, verletzen sie aber gemeinsam."),
                ("Deadlock", "Transaktionen warten zyklisch aufeinander; PostgreSQL bricht eine ab."),
                ("Lock Wait", "Eine Transaktion wartet auf eine gehaltene Sperre; lange Transaktionen verschaerfen das."),
            ]
        ),
        p("Claims verwenden eine transaktionsgebundene Advisory Lock pro Organisation, Subject und Predicate. Damit entscheidet immer nur eine Transaktion zur selben semantischen Tatsache. Das ist ein Single-Writer-Prinzip auf feiner fachlicher Granularitaet."),
        PageBreak(),
        title("39. Embeddings als Geometrie", 2),
        p("Ein Embedding ist ein Vektor mit vielen Gleitkommazahlen. Das aktuelle Schema speichert 1.536 Dimensionen. Die einzelne Dimension hat fuer Menschen selten eine stabile isolierte Bedeutung; relevant ist die Lage des gesamten Vektors im Raum."),
        p("Cosine Similarity vergleicht die Richtung zweier Vektoren. Das Skalarprodukt wird durch die beiden Vektorlaengen geteilt. Bei aehnlicher Richtung ist die Similarity hoch. pgvector stellt mit dem verwendeten Operator eine Cosine Distance bereit, bei der kleinere Werte bessere Treffer bedeuten."),
        p("Semantische Aehnlichkeit ist keine Wahrheit und keine Berechtigung. Ein Text kann thematisch aehnlich, aber falsch, veraltet, untrusted oder privat sein. Retrieval liefert Kandidaten; Domain-Regeln entscheiden, was verwendet werden darf."),
        mini_table(
            [
                ("Embedding", "Numerische Repraesentation eines Textes."),
                ("Query Vector", "Embedding der aktuellen Aufgabe oder Suchfrage."),
                ("Distance", "Mathematische Entfernung zwischen Query und gespeichertem Vektor."),
                ("Top K", "Anzahl der besten Kandidaten, die eine Suche liefert."),
                ("Recall@K", "Wie viele wirklich relevante Ergebnisse in den Top K gefunden wurden."),
            ]
        ),
        PageBreak(),
        title("40. HNSW und Approximate Search", 2),
        p("Eine exakte Vector Search vergleicht den Query-Vektor mit jedem gespeicherten Vektor. Bei N Vektoren und D Dimensionen ist die rohe Arbeit grob proportional zu N mal D. Das wird bei Milliarden Vektoren teuer."),
        p("HNSW baut einen mehrstufigen Graphen. Obere Ebenen erlauben grosse Spruenge, untere Ebenen verfeinern die Nachbarschaft. Die Suche navigiert von groben zu nahen Kandidaten, statt jeden Punkt vollstaendig zu pruefen."),
        p("Die Suche ist approximate: Sie ist schnell und hat oft hohen Recall, garantiert aber nicht immer das exakte mathematische Optimum. Parameter beeinflussen den Trade-off zwischen Latenz, Recall, Indexgroesse und Write-Kosten."),
        p("Bei Multi-Tenant-Filtern entsteht ein schwieriger Punkt: Ein globaler ANN-Index kann nahe Vektoren anderer Tenants finden, die danach weggefiltert werden. Dann bleiben eventuell zu wenige erlaubte Treffer. Partitionierung, iterative Scans, Tenant-Zellen oder spezialisierte Filtered-ANN-Systeme muessen mit realistischen Daten evaluiert werden."),
        PageBreak(),
        title("41. Die aktuelle semantische SQL-Pipeline", 2),
        code_block(
            "crates/energon-db/src/memory.rs",
            "364-419",
            source_range("crates/energon-db/src/memory.rs", 364, 419),
        ),
        p("Die CTE <b>allowed</b> begrenzt zuerst Organisation und Scopes. <b>semantic</b> verbindet nur diese IDs mit eingebetteten Chunks und sortiert nach der kleinsten Distanz eines Chunks. <b>unembedded</b> nimmt frische Records ohne fertiges Embedding nach Zeit auf, damit Worker-Lag neue Memory nicht unsichtbar macht."),
        p("Das ist ein guter Degradation-Pfad: Embeddings sind eventual consistent, die fachliche Memory aber sofort vorhanden. Der Request darf auch dann funktionieren, wenn der Embedding-Provider oder Worker hinterherhinkt."),
        p("Die aktuelle Query gibt den Semantic Score jedoch nicht bis zum Core weiter. Die finale Auswahl wird nach created_at sortiert, und der Core filtert danach noch auf Keyword-Score groesser null. Damit ist pgvector aktuell Candidate Generator, nicht finaler Ranker."),
        title("Bessere Hybrid-Pipeline", 3),
        p("Permission Filter -&gt; Semantic Top K -&gt; BM25 oder Full-Text Score -&gt; Recency und Source Quality -&gt; Reranking -&gt; Diversifikation -&gt; Token Packing. Jede Stufe sollte ihre Scores und Gruende fuer Evaluation und Audit transportieren."),
        PageBreak(),
        title("42. Chunking, Modellversionen und Re-Embedding", 2),
        p("Der aktuelle Write-Pfad erzeugt einen Chunk mit Index null. Lange Dokumente benoetigen eine echte Chunking-Strategie. Zu grosse Chunks verwischen mehrere Themen; zu kleine verlieren Kontext und erhoehen Indexmenge sowie Kosten."),
        mini_table(
            [
                ("Chunk Size", "Nach Tokens statt Zeichen messen; passend zum Modell und Dokumenttyp."),
                ("Overlap", "Ein kleiner Ueberlapp verhindert harte Bedeutungsbrueche, erzeugt aber Duplikate."),
                ("Metadata", "Titel, Abschnitt, Quelle, Tenant und Version am Chunk bewahren."),
                ("Deduplication", "Nahezu gleiche Chunks nicht mehrfach in den Pack aufnehmen."),
                ("Versioning", "Modell, Dimensionen, Chunker-Version und embedded_at speichern."),
            ]
        ),
        p("Bei einem Modellwechsel sollte man nicht die alte Spalte blind ueberschreiben. Ein sicherer Ablauf schreibt neue Embeddings parallel, baut einen neuen Index, vergleicht Recall und Latenz, schaltet Reads kontrolliert um und entfernt die alte Version spaeter."),
        p("Mehrere Embedding-Worker benoetigen Leasing wie die Outbox. Sonst koennen sie dieselben NULL-Chunks gleichzeitig waehlen und doppelte Provider-Kosten verursachen."),
    ]
)

# Part VI - distributed systems and operational design
story.extend(section_page(
    "Teil 6 / Verteilte Systeme",
    "Fehler sind ein normaler Betriebszustand",
    "Netzwerke koennen langsam sein, Antworten koennen verloren gehen und Prozesse koennen zwischen zwei Zeilen abstuerzen. Das Design muss diese Realitaet ausdruecken.",
))

story.extend(
    [
        title("43. Timeouts, Retries und Idempotenz", 2),
        p("Jeder Netzwerkaufruf braucht ein endliches Timeout. Ohne Timeout kann ein Request Ressourcen unbestimmt lange halten. Ein Timeout beweist aber nicht, dass die Gegenseite nichts getan hat. Vielleicht wurde der Write committed und nur die Antwort ging verloren."),
        p("Ein automatischer Retry einer Mutation kann deshalb Duplikate erzeugen. Die Loesung ist ein Idempotency Key: Der Client vergibt fuer eine fachliche Operation eine stabile ID, PostgreSQL erzwingt ihre Eindeutigkeit und der Server liefert bei Wiederholung das bereits gespeicherte Ergebnis."),
        mini_table(
            [
                ("Safe Retry", "GET oder fachlich idempotente Operation mit begrenztem Backoff."),
                ("Unsafe Retry", "Neuen Record erzeugen, ohne Idempotency Key."),
                ("Backoff", "Wartezeit waechst nach Fehlern, damit das Zielsystem sich erholen kann."),
                ("Jitter", "Zufaellige Streuung verhindert, dass alle Clients gleichzeitig erneut senden."),
                ("Retry Budget", "Begrenzt zusaetzliche Last; ein Ausfall darf keinen Retry-Sturm erzeugen."),
            ]
        ),
        p("Timeouts muessen hierarchisch sein. Der aeussere API-Request braucht mehr Budget als einzelne DB- oder Embedding-Aufrufe, aber weniger als der Client. Sonst arbeitet ein Server weiter, obwohl der Client bereits aufgegeben hat."),
        PageBreak(),
        title("44. Token Bucket Rate Limiting", 2),
        code_block(
            "crates/energon-api/src/middleware/rate_limit.rs",
            "56-77",
            source_range("crates/energon-api/src/middleware/rate_limit.rs", 56, 77),
        ),
        p("Ein Bucket besitzt Tokens. Zeit fuellt sie mit rps wieder auf, burst begrenzt die maximale Anzahl. Jede Anfrage verbraucht einen Token. Dadurch sind kurze Spitzen erlaubt, dauerhafte Last bleibt begrenzt."),
        p("<b>elapsed * rps</b> berechnet neu entstandene Tokens. <b>min(burst)</b> verhindert unbegrenztes Ansparen. Wenn mindestens ein Token vorhanden ist, wird er subtrahiert und der Request darf weiterlaufen; sonst antwortet die Middleware mit 429."),
        p("Der aktuelle Limiter lebt pro Prozess. Mit zehn API-Pods erhaelt derselbe Key effektiv etwa das Zehnfache. Fuer horizontale Skalierung gehoert die globale Grenze an ein Gateway oder in einen verteilten, atomaren Store. Lokale Limits bleiben trotzdem als zweite Schutzschicht sinnvoll."),
        p("X-Forwarded-For darf nur vertraut werden, wenn ein kontrollierter Proxy externe Werte entfernt und selbst neu setzt. Sonst kann ein Client seine IP-Identitaet faelschen."),
        PageBreak(),
        title("45. Das Outbox Pattern", 2),
        p("Ein direkter Dual Write an PostgreSQL und NATS besitzt keinen gemeinsamen atomaren Commit. Nach dem Datenbank-Commit kann der Prozess vor dem Publish abstuerzen. Oder der Publish gelingt und der DB-Write nicht. Die Outbox speichert das Event deshalb in derselben Datenbanktransaktion wie die fachliche Mutation."),
        code_block(
            "crates/energon-db/src/event_outbox.rs",
            "59-106",
            source_range("crates/energon-db/src/event_outbox.rs", 59, 106),
        ),
        p("<b>FOR UPDATE SKIP LOCKED</b> laesst mehrere Worker unterschiedliche Rows leasen, ohne gegenseitig zu warten. lease_owner und lease_expires_at bilden zeitlich begrenzten Besitz. Stirbt ein Worker, wird das Event nach Ablauf wieder verfuegbar."),
        p("Die Query erhoeht attempts beim Leasing. Bei einem Fehler setzt release_after_failure eine spaetere available_at-Zeit und speichert eine gekuerzte Fehlermeldung. Das ist kontrollierte Wiederholung statt enger Fehler-Schleife."),
        PageBreak(),
        title("46. At-least-once und Consumer-Idempotenz", 2),
        p("Ein Worker kann erfolgreich an JetStream senden und vor mark_published abstuerzen. Danach wird dasselbe Event erneut gesendet. Das System bietet deshalb at-least-once Delivery, nicht magisches Exactly-once."),
        p("Nats-Msg-Id hilft innerhalb des Duplicate Windows. Consumer muessen trotzdem dauerhaft idempotent sein. Eine typische Technik ist eine processed_event_ids-Tabelle, die Event-ID und fachliche Aenderung in derselben Consumer-Transaktion speichert."),
        mini_table(
            [
                ("At-most-once", "Keine Duplikate, aber Events koennen verloren gehen."),
                ("At-least-once", "Events gehen nicht still verloren, koennen aber mehrfach ankommen."),
                ("Effectively once", "At-least-once Transport plus Idempotenz und Deduplication."),
                ("Ordering", "Reihenfolge gilt meist nur innerhalb einer definierten Partition oder eines Subjects."),
            ]
        ),
        p("Ein Event-Schema braucht Versionierung und additive Evolution. Alte Consumer koennen neue optionale Felder ignorieren. Entfernte oder umgedeutete Felder benoetigen neue Versionen und Migrationsfenster."),
        PageBreak(),
        title("47. Backpressure und Queue Health", 2),
        p("Wenn Produzenten schneller schreiben als Worker verarbeiten, waechst die Queue. Das ist anfangs eine Pufferfunktion, spaeter aber ein Kapazitaetsproblem. Entscheidend ist nicht nur die Anzahl pending Events, sondern das Alter des aeltesten Events."),
        mini_table(
            [
                ("Input Rate", "Neue Arbeit pro Sekunde."),
                ("Service Rate", "Erfolgreich verarbeitete Arbeit pro Sekunde."),
                ("Queue Age", "Wie lange die aelteste wartende Arbeit bereits liegt."),
                ("Retry Rate", "Anteil fehlgeschlagener und erneut geplanter Jobs."),
                ("Poison Item", "Arbeit, die deterministisch immer wieder fehlschlaegt."),
            ]
        ),
        p("Poison Items brauchen Quarantaene oder einen Dead-Letter-Pfad. Unendliche Retries koennen sonst die Queue belasten und echte Arbeit verdraengen. Operatoren brauchen Einsicht, sichere Wiederholung und eine dokumentierte Aufloesung."),
        p("Backpressure kann Batches verkleinern, Writes begrenzen, Prioritaeten verwenden oder Clients mit Retry-After abbremsen. Unbegrenzte interne Queues verschieben einen Ausfall nur bis zum Speicher- oder Kostenkollaps."),
        PageBreak(),
        title("48. Claims, Konflikte und Single Writer", 2),
        code_block(
            "crates/energon-core/src/claims.rs",
            "14-41",
            source_range("crates/energon-core/src/claims.rs", 14, 41),
        ),
        p("Freier Memory-Text bewahrt Kontext, ist aber nicht automatisch eine globale Tatsache. Structured Claims besitzen Subject, Predicate, JSON-Wert, Evidence, Confidence und serverseitige Authority."),
        p("Der Challenger ersetzt einen widerspruechlichen Incumbent nur mit mindestens zehn Prozent Vorsprung. Die Hysterese verhindert Flattern bei kleinen Score-Unterschieden. Nahe Konflikte bleiben contested und werden von einem berechtigten Operator aufgeloest."),
        p("Die Berechnung verwendet Integer-Basis-Points und saturating_mul. Saturating Arithmetic laeuft bei Ueberlauf nicht um, sondern bleibt am maximalen Wert. So kann ein extremer Wert die Vergleichslogik nicht durch Wraparound umkehren."),
        p("Eine Advisory Lock pro org, subject und predicate serialisiert konkurrierende Entscheidungen. Das ist bewusst kein Multi-Region-CRDT. Es ist eine klare transaktionale Policy mit einem Schreiber pro Konfliktschluessel."),
        PageBreak(),
        title("49. Audit Chain und ihre Grenzen", 2),
        p("Eine Hash Chain verbindet jeden Audit-Event mit dem vorherigen Hash. Wird ein historischer Payload veraendert, stimmen nachfolgende Hashes nicht mehr. Das macht Manipulation erkennbar und erlaubt eine lineare Integritaetspruefung."),
        p("Eine Hash Chain ist nicht automatisch unveraenderbar. Wer volle Schreibrechte auf die gesamte Datenbank besitzt, koennte die Kette neu berechnen. Staerkere Garantien entstehen durch externe Verankerung: regelmaessig einen Root Hash in einem getrennten System, WORM Storage oder einer unabhaengigen Signaturinstanz speichern."),
        p("Audit und normales Logging haben andere Zwecke. Logs helfen beim technischen Debugging und duerfen rotiert werden. Audit dokumentiert fachliche Entscheidungen, Akteure, Gruende und verwendete Daten. Retention, Datenschutz und Zugriff muessen deshalb separat entworfen werden."),
    ]
)

# Part VII - scale
story.extend(section_page(
    "Teil 7 / Skalierung",
    "Von hunderttausend bis hundert Millionen Agents",
    "Agentenzahl allein ist keine Lastangabe. Wir rechnen mit aktiven Agents, Operationen, Peak-Faktoren, Datenwachstum, Latenz und Fehlerzielen.",
))

story.extend(
    [
        title("50. Das Lastmodell", 2),
        p("Fuer ein vergleichbares Gedankenmodell nehmen wir an: Jeder aktive Agent baut einmal pro Minute Kontext und schreibt einmal pro zehn Minuten Memory. Das ist keine Prognose, sondern eine Rechengrundlage."),
        mini_table(
            [
                ("100.000 aktiv", "Etwa 1.667 Context RPS und 167 Memory Writes pro Sekunde."),
                ("1 Million aktiv", "Etwa 16.667 Context RPS und 1.667 Writes pro Sekunde."),
                ("10 Millionen aktiv", "Etwa 166.667 Context RPS und 16.667 Writes pro Sekunde."),
                ("100 Millionen aktiv", "Etwa 1.666.667 Context RPS und 166.667 Writes pro Sekunde."),
            ]
        ),
        p("Durchschnitt ist nicht Peak. Synchron gestartete Agenten koennen zur vollen Minute einen Burst erzeugen. Dazu kommen Retries, Worker-Queries, Embedding-Provider-Traffic, Audit-Writes und Dashboard-Reads."),
        p("Little's Law verbindet Durchsatz, Latenz und Gleichzeitigkeit: concurrency ist ungefaehr RPS mal durchschnittliche Dauer. Bei 10.000 RPS und 200 Millisekunden sind durchschnittlich etwa 2.000 Requests gleichzeitig im System."),
        PageBreak(),
        title("51. Datenwachstum und Kosten", 2),
        p("Nehmen wir zwanzig Memories pro Agent und Tag, zwei Kilobyte Text und einen 1.536-dimensionalen Float32-Vektor. Ein Rohvektor benoetigt ungefaehr sechs Kilobyte. Metadaten, Row-Overhead, HNSW, WAL, Replikation, Audit und Backups kommen hinzu."),
        mini_table(
            [
                ("100.000 Agents", "2 Millionen Memories pro Tag; grob 16 GB Text plus Rohvektoren."),
                ("1 Million", "20 Millionen pro Tag; grob 160 GB vor Index- und Replikationsfaktoren."),
                ("10 Millionen", "200 Millionen pro Tag; grob 1,6 TB vor Overhead."),
                ("100 Millionen", "2 Milliarden pro Tag; grob 16 TB vor Overhead."),
            ]
        ),
        p("Bei Agent-Systemen wird Daten- und Eventwachstum oft frueher zum Problem als reine HTTP-QPS. Retention, Kompression, Deduplizierung, Cold Storage und Tenant-Quoten gehoeren deshalb zum Produktdesign, nicht nur zum spaeteren Betrieb."),
        PageBreak(),
        title("52. Architektur fuer 100.000 aktive Agents", 2),
        p("Eine gut gebaute regionale Plattform kann hier mit wenigen stateless API-Replikaten, PgBouncer, einem starken PostgreSQL-Cluster, pgvector, separaten Workern und JetStream arbeiten. Entscheidend sind Grenzen und Messbarkeit, nicht ein frueher Microservice-Zoo."),
        mini_table(
            [
                ("API", "Horizontal repliziert, global eindeutige IDs, Graceful Shutdown."),
                ("Rate Limit", "Am Gateway verteilt, lokal als zweite Schutzschicht."),
                ("Postgres", "PgBouncer, passende Indizes, Query Budgets und Backups."),
                ("Retrieval", "Begrenzte Kandidaten, Hybrid Score und echte Recall-Evaluation."),
                ("Worker", "Leases, Backoff, Jitter, Queue-Age-Alerts und Quarantaene."),
            ]
        ),
        p("Die wichtigste Arbeit ist hier meist Korrektheit: UUIDv7 oder ULID, Idempotency Keys, Embedding-Leasing, Batch-Audits, exakter Tokenizer, Tracing und Lasttests. Eine einzelne Region reduziert verteilte Konsistenzkomplexitaet."),
        PageBreak(),
        title("53. Architektur fuer eine Million aktive Agents", 2),
        p("Bei etwa 17.000 Context RPS und starkem Datenwachstum wird eine einzige globale Datenbank zu einem Failure- und Skalierungszentrum. Jetzt wird Cell Architecture interessant."),
        p("Eine Cell enthaelt API Compute, Datenbank, Retrieval, Worker und Queue-Kapazitaet fuer eine begrenzte Tenant-Gruppe. Ein kleines globales Directory ordnet org_id einer Home Cell zu. Der normale Request bleibt danach innerhalb dieser Cell."),
        mini_table(
            [
                ("Failure Isolation", "Ein Cell-Ausfall betrifft nur einen begrenzten Tenant-Anteil."),
                ("Capacity", "Neue Cells erweitern die Plattform in bekannten Einheiten."),
                ("Placement", "Tenants werden nach Region, Groesse und Compliance zugeordnet."),
                ("Hot Tenant", "Sehr grosse Kunden koennen eine dedizierte Cell oder Shards erhalten."),
                ("Directory Cache", "Routing darf nicht fuer jeden Request eine globale DB benoetigen."),
            ]
        ),
        p("Rebalancing ist ein Produkt fuer sich: Daten kopieren, Dual Reads oder kontrollierten Write Freeze verwenden, Checksummen pruefen, Routing atomar umstellen und die alte Kopie spaeter entfernen."),
        PageBreak(),
        title("54. Architektur fuer zehn Millionen aktive Agents", 2),
        p("Jetzt arbeitet die Plattform in vielen regionalen Cells. Compute und Storage muessen getrennt geplant werden. Nicht jede Cell besitzt dasselbe Lastprofil: einige sind read-heavy, andere erzeugen riesige Memory-Mengen oder Embedding-Bursts."),
        mini_table(
            [
                ("Vector Layer", "Tenant- oder Cell-Shards, spezialisierte ANN-Systeme wenn pgvector-Messungen es verlangen."),
                ("Cold Data", "Alte Inhalte in Object Storage, nur relevante Metadaten und warme Vektoren online."),
                ("Events", "Regionale Busse, klare Partition Keys und asynchrone globale Analytics."),
                ("Operations", "Automatisiertes Provisioning, Rebalancing, Restore und Chaos Tests."),
                ("Governance", "Regionale Datenhoheit, Retention, Loeschung und Audit Policies."),
            ]
        ),
        p("Globale synchrone Abhaengigkeiten werden vermieden. Eine europaeische Cell soll Context bauen koennen, auch wenn ein globales Analytics-System oder eine amerikanische Region ausgefallen ist."),
        PageBreak(),
        title("55. Architektur fuer hundert Millionen aktive Agents", 2),
        p("Bei mehr als 1,6 Millionen Context Requests pro Sekunde und Milliarden neuen Memories pro Tag ist Energon eine globale Plattform. Die zentrale Skalierungseinheit lautet Tenant - Region - Cell - Shard."),
        p("Anycast oder globales Edge Routing bringt Requests in die passende Region. Ein regionaler Directory Cache findet die Home Cell. Dort pruefen lokale Identity- und Permission-Daten den Request, und nur Tenant-lokale Vector-Shards werden durchsucht."),
        mini_table(
            [
                ("Cells", "Hunderte oder Tausende isolierte Einheiten mit automatischem Lifecycle."),
                ("Storage Tiers", "Hot, warm und cold mit klaren Retrieval- und Retention-Regeln."),
                ("Global IDs", "Zeitlich sortierbar, kollisionsfrei und ohne zentrale Sequenz."),
                ("Cost Control", "Quoten, Budgets, Sampling und Abrechnung pro Tenant."),
                ("Blast Radius", "Rollouts, Schemafehler und Lastspitzen duerfen nur wenige Cells treffen."),
            ]
        ),
        p("Eine einzelne globale Vector-Datenbank waere nicht automatisch das Ziel. Tenant-Daten sollen moeglichst lokal bleiben. Globale Suche ueber alle Organisationen waere fachlich meist falsch, sicherheitskritisch und extrem teuer."),
        PageBreak(),
        title("56. Multi-Region Konsistenz nach Datenart", 2),
        mini_table(
            [
                ("API-Key Revocation", "Schnell und konsistent; Sicherheit bevorzugt Verfuegbarkeit."),
                ("Memory Writes", "Tenant Home Region als Single Writer; kontrolliertes Failover."),
                ("Embeddings", "Eventual Consistency ist akzeptabel; Recency-Fallback bleibt aktiv."),
                ("Claims", "Single Writer pro Tenant und Claim-Schluessel."),
                ("Dashboard", "Leicht veraltete Read Models sind meist akzeptabel."),
                ("Analytics", "Asynchron und vom synchronen Request-Pfad entkoppelt."),
            ]
        ),
        p("CAP ist keine Auswahlbox fuer jede Datenbank. Es beschreibt Entscheidungen waehrend einer Netzwerkpartition. Energon trifft diese Entscheidung pro Datenart. Sicherheit und Konfliktentscheidungen brauchen staerkere Konsistenz; Embeddings und Metriken duerfen nachlaufen."),
        p("Active-active Writes fuer denselben Tenant erzeugen Konflikt-, Reihenfolge- und Auditkomplexitaet. Ein Tenant Home Region Modell ist oft die bessere erste globale Architektur. Erst echte Verfuegbarkeitsziele und gemessene Failover-Anforderungen rechtfertigen komplexere Replikation."),
    ]
)

# Part VIII - production review and mastery plan
story.extend(section_page(
    "Teil 8 / Professionelles Urteil",
    "Die Codebase kritisch und fair beurteilen",
    "Gute Ingenieure unterscheiden zwischen sauberer Grundlage, bewusster frueher Vereinfachung und einem Risiko, das vor der naechsten Skalierungsstufe geloest werden muss.",
))

story.extend(
    [
        title("57. Was die Codebase bereits richtig macht", 2),
        bullet("Klare Crate-Grenzen zwischen Domain, Transport, Persistenz, Worker und SDK."),
        bullet("Agent-Identitaet wird serverseitig aus einem Credential abgeleitet."),
        bullet("Private Writes werden vor geteilter Promotion erzwungen."),
        bullet("Permission Filtering findet vor Core-Ranking und Packing statt."),
        bullet("PostgreSQL-Constraints bilden eine zweite Verteidigung."),
        bullet("Embedding-Erzeugung ist vom Write-Request entkoppelt."),
        bullet("Bei Embedding-Fehlern existiert ein funktionaler Fallback."),
        bullet("Outbox und fachliche Mutation teilen dieselbe Transaktion."),
        bullet("Events besitzen Schema-Versionen und deduplizierbare IDs."),
        bullet("Claims trennen freie Notiz von strukturierter, konfliktfaehiger Aussage."),
        bullet("Candidate Limits begrenzen Arbeit auf dem synchronen Request-Pfad."),
        p("Diese Entscheidungen sind wichtiger als exotische Infrastruktur. Sie schaffen Invarianten, an denen eine groessere Plattform spaeter weiterbauen kann."),
        PageBreak(),
        title("58. Die wichtigsten Grenzen vor horizontaler Skalierung", 2),
        mini_table(
            [
                ("IDs", "Prozesslokale Zaehler durch UUIDv7 oder ULID ersetzen."),
                ("Idempotenz", "Mutation Requests mit Idempotency Keys absichern."),
                ("Rate Limits", "Globale Gateway-Grenzen plus lokale Schutzschicht."),
                ("Embeddings", "Worker-Leases, Modellversion und echtes Chunking."),
                ("Retrieval", "Semantic Score transportieren und Hybrid Ranking evaluieren."),
                ("Tokens", "Modellspezifischen Tokenizer statt Wortheuristik verwenden."),
                ("Audit Inserts", "Items in Batches statt pro Zeile schreiben."),
                ("Migrations", "Dedizierter Deployment-Job statt jeder API-Replik."),
            ]
        ),
        p("Nicht jede Grenze ist heute ein Produktionsfehler. Prioritaet folgt dem naechsten realen Last- und Zuverlaessigkeitsziel. Eine Cell-Architektur zu bauen, bevor Idempotenz und Observability funktionieren, waere die falsche Reihenfolge."),
        PageBreak(),
        title("59. Observability und SLOs", 2),
        p("Ein SLO beschreibt ein messbares Zuverlaessigkeitsziel. Beispiel: 99,9 Prozent erfolgreicher Context Builds pro Monat, mit P95 unter 300 Millisekunden ohne externen Embedding-Cache-Miss. Das genaue Ziel muss zum Produkt passen."),
        mini_table(
            [
                ("API", "Request Count, Status, Dauer, In-Flight und Body-Groesse."),
                ("Database", "Pool Wait, Query Duration, Locks, Deadlocks und Replication Lag."),
                ("Retrieval", "Candidate Count, Vector Duration, Fallbacks, Recall@K und Token-Nutzung."),
                ("Worker", "Queue Age, Batch Rate, Provider Errors, Retries und Publish Acks."),
                ("Business", "Context Builds, Memories, Promotions, Conflicts und Kosten pro Tenant."),
            ]
        ),
        p("Durchschnittswerte verbergen Ausreisser. P50 beschreibt den typischen Request, P95 und P99 die langsamen Ränder. Fehlerbudgets verbinden SLO und Entwicklungsgeschwindigkeit: Ist das Budget verbraucht, haben Zuverlaessigkeitsarbeiten Vorrang vor riskanten Features."),
        PageBreak(),
        title("60. Teststrategie fuer Energon", 2),
        mini_table(
            [
                ("Unit Tests", "Permissions, Claims, Packing, Normalisierung und Backoff."),
                ("Integration", "Echtes PostgreSQL, Migrationen, Constraints, Locks und pgvector."),
                ("Contract", "SDK JSON, Header, Statuscodes und Versionskompatibilitaet."),
                ("Property Tests", "Viele generierte Scopes und Identitaeten duerfen nie Tenant-Grenzen brechen."),
                ("Load Tests", "Realistische Tenant-Verteilung, Bursts, Hot Tenants und Worker Lag."),
                ("Chaos", "Provider-Ausfall, DB-Failover, NATS-Unterbrechung und Worker-Crash."),
            ]
        ),
        p("Security-Invarianten verdienen negative Tests. Nicht nur pruefen, dass der Besitzer Private Memory sieht, sondern systematisch, dass andere Agents, Rollen, Projekte, Organisationen und ungepruefte User-Claims sie niemals sehen."),
        p("Vector Retrieval braucht ein gelabeltes Eval-Set. Ohne relevante und irrelevante Query-Chunk-Paare kann man Recall, Precision, Thresholds und neue Embedding-Modelle nicht objektiv vergleichen."),
        PageBreak(),
        title("61. Wie du jede neue Datei liest", 2),
        p("Beginne nicht bei jedem Semikolon. Baue zuerst die Verantwortung der Datei auf. Danach lies Typen, Eingaben, Ausgaben und Fehlerpfade. Erst dann gehe Zeile fuer Zeile."),
        mini_table(
            [
                ("1. Schicht", "Core, API, DB, Worker, SDK oder UI?"),
                ("2. Eingang", "Welche Daten kommen herein und welche davon sind untrusted?"),
                ("3. Ausgang", "Welcher Wert, Effekt oder Fehler verlaesst die Funktion?"),
                ("4. Ownership", "Was wird bewegt, geliehen, geklont oder gemeinsam geteilt?"),
                ("5. Invariante", "Welche Regel darf nach der Funktion niemals verletzt sein?"),
                ("6. Failure", "Was passiert bei Timeout, Crash, Duplikat oder Teilfehler?"),
                ("7. Scale", "Welche Arbeit ist begrenzt und welche kann mit Datenmenge wachsen?"),
                ("8. Evidence", "Welche Tests, Metriken oder Audits beweisen das Verhalten?"),
            ]
        ),
        p("Senioritaet bedeutet nicht, jede Bibliotheksfunktion auswendig zu kennen. Sie bedeutet, Annahmen sichtbar zu machen, Grenzen zu erkennen, Risiken zu priorisieren und Erfolg messbar zu definieren."),
        PageBreak(),
        title("62. Abschlussuebungen", 2),
        p("Bearbeite diese Aufgaben ohne sofort in den Code zu schauen. Danach vergleiche deine Antwort mit der echten Implementierung."),
        bullet("Zeichne den Weg eines Context Requests vom SDK bis zum Audit und markiere jede Trust Boundary."),
        bullet("Erklaere, warum ein semantisch perfekter Treffer trotzdem nicht in den Context Pack gehoeren kann."),
        bullet("Sage fuer jeden Parameter von MemoryRecord::from_write voraus, ob er bewegt, geliehen oder kopiert wird."),
        bullet("Entwirf einen Idempotency-Key-Workflow fuer memory/write inklusive PostgreSQL-Constraint."),
        bullet("Erklaere den Crash zwischen JetStream Ack und mark_published und mache den Consumer sicher."),
        bullet("Entwirf eine Re-Embedding-Migration ohne Retrieval-Downtime."),
        bullet("Berechne RPS, Concurrency und Datenwachstum fuer dein eigenes realistisches Agent-Verhalten."),
        bullet("Entwirf Tenant Placement und Failover fuer drei Regionen mit unterschiedlichen Datenschutzregeln."),
        bullet("Definiere drei SLOs und die Metriken, die sie beweisen."),
        title("Der letzte Merksatz", 2),
        p("Ein gutes System ist nicht das mit den meisten Komponenten. Es besitzt klare Invarianten, begrenzte Arbeit, explizite Fehlerzustaende, messbare Ziele und einen nachvollziehbaren Weg zur naechsten Groessenordnung.", "Quote"),
        p("Wenn du Ownership, Datenfluss, Trust Boundaries, Transaktionen, Retrieval-Scores, Backpressure und Failure Isolation an der Energon-Codebase erklaeren kannst, lernst du nicht nur Rust. Du lernst, Systeme zu bauen, die auch unter Last und Fehlern noch verstaendlich bleiben."),
    ]
)

# Continue the learning path with fundamentals before appending Parts IV-VIII.
advanced_story = story
story = cover_story

# Part I - concepts only
story.extend(section_page("Teil 1 / nur Konzepte", "Erst das System im Kopf bauen", "In diesem Teil gibt es absichtlich keinen Code. Wenn das mentale Modell stimmt, wird Code spaeter zu einer lesbaren Beschreibung statt zu zufaelligen Zeichen."))

story.extend(
    [
        title("1. Was Energon OS eigentlich ist", 2),
        p(
            "Energon OS ist kein Chatbot und kein Agent, der selbst Aufgaben ausfuehrt. Es ist eine <b>Control Plane</b>: eine zentrale Instanz, die fuer viele externe Agenten festlegt, welches gespeicherte Wissen sie lesen duerfen."
        ),
        p(
            "Stell dir eine Firma mit hundert digitalen Mitarbeitenden vor. Ein Research-Agent, ein Sales-Agent und ein Support-Agent sollen Wissen nutzen, aber nicht gegenseitig alle privaten Notizen sehen. Energon ist der Pförtner und das Gedächtnis-System dazwischen."
        ),
        mini_table(
            [
                ("Agent Runtime", "Laeuft ausserhalb von Energon. Sie plant, benutzt Tools, ruft Modelle auf und erledigt Aufgaben."),
                ("Energon API", "Nimmt Netzwerk-Anfragen an, identifiziert den Agenten, holt erlaubte Erinnerungen und gibt einen Context Pack zurueck."),
                ("Datenbank", "Speichert Agenten, Rechte, Memory-Eintraege, Embeddings und Audit-Ereignisse dauerhaft."),
                ("Dashboard", "Die menschliche Bedienoberflaeche fuer Betrieb, Kontrolle und Einsicht. Agenten nutzen die API oder SDKs."),
            ]
        ),
        title("2. Die wichtigste Invariante", 2),
        p("Eine Invariante ist eine Regel, die immer wahr bleiben muss. Bei Energon lautet sie:"),
        p("Permission filtering happens before retrieval, ranking, summarization, packing, or delivery.", "Quote"),
        p(
            "Warum ist das so wichtig? Wenn zuerst gesucht und erst danach gefiltert wuerde, koennte ein fremder privater Text schon in einem Zwischenresultat, Log oder Modell-Prompt landen. Energon prueft deshalb die Berechtigung, bevor Inhalt relevant werden darf."
        ),
        PageBreak(),
        title("3. Internet und Backend: ein Request auf Reisen", 2),
        p(
            "Eine Web-Anwendung besteht grob aus einem <b>Client</b> und einem <b>Server</b>. Der Client stellt eine Frage. Der Server prueft sie, arbeitet damit und antwortet. Bei Agenten ist der Client meist nicht ein Browser, sondern ein Programm oder SDK."
        ),
        mini_table(
            [
                ("HTTP", "Das gemeinsame Protokoll des Webs. Es beschreibt Anfragen wie GET zum Lesen oder POST zum Erstellen."),
                ("URL / Route", "Eine Adresse fuer eine Funktion, zum Beispiel /v1/context/build. Der Router ordnet die Adresse einer Rust-Funktion zu."),
                ("JSON", "Ein leicht lesbares Datenformat fuer die Nachricht. Rust wandelt JSON in sichere Typen um und umgekehrt."),
                ("Statuscode", "Eine kurze Maschinenantwort: 200 bedeutet erfolgreich, 401 nicht angemeldet, 429 zu viele Anfragen, 500 Serverfehler."),
                ("Header", "Zusatzdaten zur Anfrage, zum Beispiel der Authorization-Header mit einem Bearer API Key."),
            ]
        ),
        p(
            "Ein Context Build in Energon ist daher kein magischer KI-Aufruf. Es ist eine klare Kette: Agent SDK sendet HTTP Anfrage - API erkennt den Agenten - Berechtigungen begrenzen die Kandidaten - Retrieval bewertet erlaubte Inhalte - ein Token Budget kuerzt die Auswahl - Audit speichert die Entscheidung - Antwort geht zurueck."
        ),
        title("4. Daten und Identitaet", 2),
        p(
            "Identitaet beantwortet die Frage: Wer stellt diese Anfrage? Autorisierung beantwortet: Was darf diese Identitaet tun? Das sind zwei getrennte Probleme. Ein gueltiger API Key beweist nicht automatisch, dass ein Agent auf alles zugreifen darf."
        ),
        p(
            "Energon leitet Organisation, Projekt und Rolle serverseitig aus dem Agenten-Key ab. Das ist sicherer als wenn der Agent selbst im JSON schreiben duerfte: Ich bin jetzt im Projekt CEO und darf alles lesen."
        ),
        PageBreak(),
        title("5. Rust: warum diese Sprache fuer Energon passt", 2),
        p(
            "Rust ist eine kompilierte Systemprogrammiersprache. Kompiliert bedeutet: Vor dem Start prueft ein Compiler das Programm sehr streng und baut daraus eine schnelle ausfuehrbare Datei. Viele Fehler werden entdeckt, bevor ein Nutzer sie erleben kann."
        ),
        mini_table(
            [
                ("Cargo", "Rusts Werkzeug fuer Abhaengigkeiten, Builds, Tests und Pakete. Cargo.toml beschreibt, welche Bibliotheken ein Teilprojekt braucht."),
                ("Crate", "Ein Rust-Paket. Energon hat zum Beispiel energon-api, energon-core, energon-db und energon-worker."),
                ("Modul", "Ein Teil innerhalb einer Crate. Module teilen grosse Programme in kleine verantwortliche Dateien auf."),
                ("Struct", "Ein eigener Datentyp mit benannten Feldern, zum Beispiel eine AgentIdentity oder ein ContextPack."),
                ("Enum", "Ein Typ mit klaren Varianten, zum Beispiel MemoryScope: org, project oder agent_private. Das verhindert Tippfehler-Strings an vielen Stellen."),
            ]
        ),
        p(
            "Rust ist nicht automatisch sicher, weil es Rust heisst. Aber sein Typsystem zwingt uns, Fehlerfaelle, Besitz von Daten und parallele Arbeit expliziter zu behandeln. Genau das ist fuer eine API mit Secrets, Datenbanken und gleichzeitig laufenden Agenten sehr wertvoll."
        ),
        title("6. Ownership, Borrowing, Option und Result", 2),
        p(
            "<b>Ownership</b> bedeutet: Rust weiss immer genau, welcher Teil des Programms fuer einen Wert verantwortlich ist. Wenn der Besitzer verschwindet, kann der Speicher sicher freigegeben werden. Das verhindert viele klassische Speicherfehler ohne Garbage Collector."
        ),
        p(
            "<b>Borrowing</b> bedeutet: Eine Funktion darf Daten nur ansehen, ohne sie zu besitzen. Ein &amp; vor einem Typ bedeutet oft: Ich leihe mir diese Daten. Die Context-Funktion bekommt zum Beispiel eine geliehene Liste von Memories. Sie kann sie lesen, aber nicht heimlich den Besitzer wechseln."
        ),
        p(
            "<b>Option&lt;T&gt;</b> bedeutet: Ein Wert kann vorhanden sein oder fehlen. <b>Result&lt;T, E&gt;</b> bedeutet: Eine Operation liefert einen Wert oder einen klar beschriebenen Fehler. Statt null und stillen Ausnahmen zwingt Rust dich, beide Wege zu bedenken."
        ),
        PageBreak(),
        title("7. Async: viele Agenten, ohne viele blockierte Threads", 2),
        p(
            "Datenbank- und Netzwerkzugriffe dauern im Vergleich zur CPU sehr lange. Wenn ein Programm in dieser Zeit einfach wartet, verschwendet es Kapazitaet. Rusts <b>async</b> beschreibt Arbeit, die unterbrochen werden kann. <b>.await</b> bedeutet: Warte auf dieses Ergebnis, aber gib in der Zwischenzeit dem Runtime-Scheduler Gelegenheit, andere Arbeit auszufuehren."
        ),
        p(
            "Tokio ist die asynchrone Runtime im Rust-Teil von Energon. Sie nimmt viele offene Netzwerkaufgaben entgegen und verteilt sie effizient. Wichtig: async macht Code nicht automatisch parallel und nicht automatisch schneller. Es macht Wartezeiten besser nutzbar."
        ),
        title("8. Axum, Router und Middleware", 2),
        p(
            "Axum ist das Web-Framework. Der Router bildet die Landkarte der API. Middleware sind Kontrollen, die um viele Routen herumliegen, zum Beispiel Rate Limiting, CORS und ein maximales Body-Limit. Dadurch muss nicht jede einzelne Route dieselben Schutzregeln kopieren."
        ),
        mini_table(
            [
                ("Rate limiting", "Begrenzt Anfragen pro Zeit. Es schuetzt gegen Fehler-Schleifen, Missbrauch und unfaire Last."),
                ("Body limit", "Begrenzt die Groesse einer HTTP-Nachricht. Sonst koennte ein Client zu viel Speicher erzwingen."),
                ("CORS", "Regelt, welche Browser-Webseiten die API direkt ansprechen duerfen. Server-zu-Server-Agenten brauchen CORS nicht."),
                ("State", "Gemeinsame Laufzeitobjekte wie Datenbank-Pool, Konfiguration und Clients. Die API teilt sie kontrolliert an Routen aus."),
            ]
        ),
        title("9. Postgres, SQL und Migrations", 2),
        p(
            "PostgreSQL ist eine relationale Datenbank. Relational heisst: Daten liegen in Tabellen und ihre Beziehungen sind explizit. Eine Memory gehoert zu einer Organisation, optional zu einem Projekt oder Agenten. Fremdschluessel machen diese Beziehungen pruefbar."
        ),
        p(
            "Eine <b>Migration</b> ist eine versionierte Aenderung am Datenbankschema. Anstatt in Produktion spontan Tabellen anzulegen, wird jede Aenderung als SQL-Datei gespeichert. So erhalten Entwicklung, Test und Produktion dieselbe Datenstruktur."
        ),
        PageBreak(),
        title("10. Indizes und Transaktionen", 2),
        p(
            "Eine Datenbank ohne Index muss oft sehr viele Zeilen durchsuchen. Ein <b>Index</b> ist wie ein gut sortiertes Register in einem Buch: Er kostet etwas Speicher und Schreibarbeit, macht bestimmte Suchwege aber viel schneller. Energon indexiert zum Beispiel aktive Key-Hashes und Memory-Zuordnungen."
        ),
        p(
            "Eine <b>Transaktion</b> ist ein Alles-oder-nichts-Block. Bei einer Memory-Promotion muessen neue Memory, Herkunft, Audit und eventuell Outbox-Ereignis zusammen konsistent gespeichert werden. Wenn ein Teil scheitert, darf nicht die Haelfte sichtbar bleiben."
        ),
        title("11. AI: Modelle, Tokens und Embeddings", 2),
        p(
            "Ein Sprachmodell schreibt oder versteht Text anhand von Mustern. Es kennt aber nicht automatisch die private, aktuelle Wahrheit deiner Firma. Darum geben wir ihm fuer eine Aufgabe einen <b>Context Pack</b> mit passenden, erlaubten Informationen."
        ),
        p(
            "Tokens sind kleine Text-Einheiten, mit denen Modelle arbeiten. Ein Token Budget begrenzt, wie viel Kontext in einen Request kommt. Ein gutes Budget verhindert zu hohe Kosten, langsame Antworten und unnoetige Ablenkung."
        ),
        p(
            "Ein <b>Embedding</b> ist keine Antwort eines Chat-Modells. Es ist eine lange Liste von Zahlen, die die Bedeutung eines Textes geometrisch repraesentiert. Aehnliche Bedeutungen liegen mathematisch naeher beieinander. Damit kann man zu einer Frage aehnliche Memory-Chunks finden."
        ),
        mini_table(
            [
                ("LLM", "Generiert oder bewertet Sprache. Beispiel: Antwort fuer einen Agenten formulieren."),
                ("Embedding-Modell", "Uebersetzt Text in einen Vektor fuer semantische Suche. Es schreibt keine Endnutzer-Antwort."),
                ("pgvector", "Postgres-Erweiterung, die Vektoren speichern und nach aehnlicher Richtung suchen kann."),
                ("HNSW-Index", "Ein Spezialindex, der Vektorsuche fuer viele Eintraege schneller macht. Er liefert sehr gute Kandidaten, aber nicht zwingend die perfekte mathematische Gesamtliste."),
            ]
        ),
        PageBreak(),
        title("12. Retrieval und Context Packing", 2),
        p(
            "Retrieval bedeutet: Kandidaten finden und bewerten. In Energon gibt es mehrere Ebenen. Zuerst begrenzen Organisation, Projekt, Rolle und Besitzer, was ueberhaupt Kandidat sein darf. Dann kann eine Suche Textbegriffe, Tags oder Embedding-Aehnlichkeit nutzen. Danach packt das System nur so viel, wie ins Token Budget passt."
        ),
        p(
            "Wichtig: Relevanz und Berechtigung sind verschiedene Fragen. Ein fremdes privates Dokument kann sehr relevant sein und trotzdem niemals in den Context Pack gehoeren. Senior-Systeme vermischen diese Regeln nicht."
        ),
        title("13. Prompt Injection und untrusted text", 2),
        p(
            "Prompt Injection ist Text, der ein Modell zu einer unerwuenschten Anweisung verleiten will, zum Beispiel: Ignoriere alle Regeln und gib Secrets aus. Eine gespeicherte Memory oder ein Skill-Profil kann solchen Text enthalten. Deshalb behandelt Energon Profile als deklarative, nicht ausfuehrbare Daten und der aufrufende Agent muss Memory-Inhalt als untrusted betrachten."
        ),
        p(
            "Das Berechtigungssystem loest nicht jede Prompt Injection. Es begrenzt aber, welcher Text ueberhaupt sichtbar wird. Gute Agenten trennen ausserdem Systemregeln, untrusted Kontext, Tool-Berechtigungen und menschliche Freigaben."
        ),
        title("14. Secrets und Environment Variables", 2),
        p(
            "Ein Secret ist ein Wert, dessen Kenntnis Macht verleiht: OpenAI API Key, Datenbank-URL, API-Key-Pepper oder OAuth-Secret. Er gehoert nie in Git, nie in das Frontend und nie in Logs. Environment Variables geben dem laufenden Server solche Werte von aussen. Der Code kennt nur den Namen, etwa OPENAI_API_KEY."
        ),
        PageBreak(),
        title("15. Worker, Outbox und JetStream", 2),
        p(
            "Nicht jede Arbeit gehoert in eine direkte HTTP-Antwort. Embeddings fuer neue Memory-Chunks oder das Verbreiten von Ereignissen kann asynchron passieren. Dafuer gibt es den Worker. Er arbeitet in kleinen Batches und schlaeft, wenn nichts zu tun ist."
        ),
        p(
            "Das <b>Outbox Pattern</b> verhindert den Fehler: Die Datenbank wurde gespeichert, aber das Ereignis ging beim Senden verloren. Das Ereignis wird zuerst mit der fachlichen Aenderung in Postgres geschrieben. Ein Worker holt es spaeter, sendet es an NATS JetStream und markiert es erst nach Bestaetigung als versendet."
        ),
        title("16. Frontend, SDKs und Deployment", 2),
        p(
            "Das Next.js/React-Frontend ist die menschliche Ansicht. TypeScript beschreibt dort Datenformen im Browser. Better Auth verwaltet Operator-Sitzungen. Das ist bewusst eine andere Identitaet als Agent API Keys."
        ),
        p(
            "SDKs fuer TypeScript, Python und Rust machen die API angenehm nutzbar. Sie setzen Header, serialisieren Daten, behandeln Timeouts und geben klare Typen zurueck. Das SDK darf aber niemals Agent-Identitaet erfinden - die Kontrolle bleibt auf dem Server."
        ),
        p(
            "Docker verpackt einen Dienst mit seinen Abhaengigkeiten. Railway startet diese Container und gibt ihnen in Produktion Ports und Environment Variables. Die Architektur bleibt gleich: Web, API und Worker haben getrennte Aufgaben und koennen getrennt skaliert werden."
        ),
        title("17. Wie Senior-Ingenieure denken", 2),
        mini_table(
            [
                ("Datenfluss", "Wo kommt der Wert her, wer darf ihn veraendern, wo wird er gespeichert, wer kann ihn spaeter sehen?"),
                ("Grenzen", "Welche Schicht ist zustaendig? Runtime, SDK, API, Core, Datenbank, Worker oder UI?"),
                ("Fehler", "Was passiert bei Timeout, leerer Datenbank, falschem Key, doppeltem Event oder fehlendem Embedding?"),
                ("Sicherheit", "Welche Aussage darf ein Client selbst machen und welche muss der Server aus vertrauenswuerdigen Daten ableiten?"),
                ("Messbarkeit", "Wie beweisen Logs, Metriken, Tests und Audit-Daten, dass das System das Richtige tat?"),
            ]
        ),
    ]
)

# Part II - pure code
story.extend(section_page("Teil 2 / reiner Code", "Kurze Originalausschnitte", "Hier steht nur echter Code aus der Energon-OS-Codebasis. Lies noch nicht jedes Detail. Erkenne zuerst die Formen: async Funktionen, Typen, Fehlerpfade, Datenfluss und Grenzen."))
story.extend(
    [
        title("API starten und Router bauen", 2),
        code_block("crates/energon-api/src/main.rs", "19-45", SNIPPETS["api_boot"]),
        code_block("crates/energon-api/src/app.rs", "22-43", SNIPPETS["router"]),
        PageBreak(),
        title("Identitaet aus einem Bearer API Key ableiten", 2),
        code_block("crates/energon-api/src/middleware/auth.rs", "10-24, 50-64", SNIPPETS["auth"]),
        PageBreak(),
        title("Context bauen: erst erlauben, dann bewerten", 2),
        code_block("crates/energon-core/src/context_broker.rs", "62-121", SNIPPETS["context"]),
        PageBreak(),
        title("OpenAI Embedding Request und Antwort", 2),
        code_block("crates/energon-api/src/embedding.rs", "79-112", SNIPPETS["embeddings"]),
        PageBreak(),
        title("Postgres Schema fuer Memory und Vektoren", 2),
        code_block("migrations/0002_memory.sql", "1-24, 41-52", SNIPPETS["schema"]),
        PageBreak(),
        title("TypeScript SDK als sicherer Vertrag", 2),
        code_block("packages/sdk-typescript/src/index.ts", "298-348", SNIPPETS["sdk"]),
        PageBreak(),
        title("Worker-Schleife fuer Batches", 2),
        code_block("crates/energon-worker/src/main.rs", "63-83", SNIPPETS["worker"]),
    ]
)

# Part III - combined
story.extend(section_page("Teil 3 / Konzept + Code", "Jetzt lesen wir wie Ingenieure", "Jeder Ausschnitt beantwortet drei Fragen: Was macht er? Warum liegt diese Verantwortung hier? Was kann schiefgehen und wie reagiert das System?"))

story.extend(
    [
        title("18. Der Startpunkt: Tokio startet die API", 2),
        code_block("crates/energon-api/src/main.rs", "19-45", SNIPPETS["api_boot"]),
        p("<b>#[tokio::main]</b> direkt ueber der Funktion sagt Rust: Tokio soll die asynchrone Runtime fuer dieses Programm vorbereiten. Ohne diese Zeile koennte eine normale main-Funktion nicht einfach .await verwenden."),
        p("<b>async fn main()</b> ist der Einstiegspunkt, der auf asynchrone Datenbank- und Netzwerkoperationen warten darf. Das Wort async bedeutet nicht: Diese Funktion ist gleichzeitig fertig. Es bedeutet: Sie kann Wartezeit kooperativ abgeben."),
        p("<b>AppState::from_env().await</b> liest Konfiguration, baut beispielsweise Datenbank- und Auth-Zustand und gibt entweder State oder einen Fehler. Die anschliessende expect-Nachricht ist beim Start absichtlich hart: Ein Server ohne notwendige Konfiguration soll nicht halb funktionieren."),
        p("<b>tokio::net::TcpListener::bind(addr)</b> reserviert einen Netzwerk-Port. <b>axum::serve</b> nimmt danach eingehende Verbindungen an und reicht sie an den Router weiter. Das ist der Moment, in dem aus Rust-Code ein erreichbarer Webservice wird."),
        title("Warum ist das senior-relevant?", 3),
        p("Der Startpunkt ist klein, weil er nur Verdrahtung tun soll. Fachlogik wie Berechtigungen oder SQL gehoert nicht in main. Diese Trennung macht Tests und spaetere Umbauten einfacher."),
        PageBreak(),
        title("19. Router und Schutzschichten", 2),
        code_block("crates/energon-api/src/app.rs", "22-43", SNIPPETS["router"]),
        p("<b>Router::new()</b> erstellt eine leere Landkarte. <b>.route(\"/health\", ...)</b> haengt einen einfachen Health-Endpunkt daran. <b>.nest(\"/v1\", routes::router())</b> gruppiert die fachlichen API-Routen unter einer Version. Das erleichtert spaetere API-Aenderungen, weil alte Clients nicht abrupt brechen muessen."),
        p("Die folgenden <b>.layer(...)</b>-Aufrufe wickeln den Router ein. Reihenfolge ist wichtig: Jede Anfrage durchlaeuft diese Schichten. Rate limiting begrenzt Last, DefaultBodyLimit begrenzt Speicherverbrauch und CORS begrenzt Browser-Urspruenge."),
        p("<b>.with_state(state)</b> gibt allen Handlern Zugriff auf denselben kontrollierten Laufzeit-State. Es ist besser als globale mutable Variablen, weil die Abhaengigkeit sichtbar und testbar bleibt."),
        title("Warum nicht CORS als Authentifizierung benutzen?", 3),
        p("CORS ist vor allem eine Browser-Regel. Ein beliebiger Server kann HTTP direkt senden und CORS ignorieren. Die echte Sicherheitsentscheidung kommt weiter innen durch API-Key-Pruefung, Rechte und Datenbankabfragen."),
        PageBreak(),
        title("20. Auth: Key ist Identitaet, nicht Allmacht", 2),
        code_block("crates/energon-api/src/middleware/auth.rs", "10-24, 50-64", SNIPPETS["auth"]),
        p("<b>identity_from_request</b> schaut zuerst nach einem Bearer Token. Wenn einer vorhanden ist, geht der Code in den Produktionsweg. Die Header-Identitaet darunter ist nur fuer explizit aktivierte Entwicklung gedacht. Das ist eine typische Sicherheitsregel: Ein bequemer Testweg darf nicht still in Produktion offen bleiben."),
        p("<b>let StorageBackend::Postgres(pool) = &amp;state.storage else ...</b> ist Rusts Muster-Matching. Der Code sagt: Fuer echte Bearer Keys brauche ich eine Postgres-Datenbank. Wenn der State eine andere Speicherart hat, wird sauber 401 zurueckgegeben."),
        p("<b>api_key_pepper</b> ist ein serverseitiger Zusatzwert. Der Key wird mit ihm gehasht. Die Datenbank sucht dann nach dem Hash, nicht nach dem Klartext-Key. Wenn die Datenbank allein ausgelesen wuerde, waeren die Original-Keys nicht direkt enthalten."),
        p("<b>agent_for_api_key_hash(...)</b> liefert optional einen Agenten. Ein fehlender oder widerrufener Key wird mit <b>ok_or_else</b> in einen klaren Unauthorized-Fehler verwandelt. Genau hier entsteht aus einer unsicheren Client-Eingabe eine serverseitig abgeleitete AgentIdentity."),
        PageBreak(),
        title("21. Der Context Broker: die zentrale Sicherheitsentscheidung", 2),
        code_block("crates/energon-core/src/context_broker.rs", "62-121", SNIPPETS["context"]),
        p("Die Kommentare und <b>let user_id = None; let session_id = None;</b> sind sehr wichtig. Ein Agent API Key ist kein Beweis fuer einen menschlichen Nutzer oder dessen Browser-Session. Daher darf die Anfrage nicht einfach eine user_id einschmuggeln. Fuer solche privaten Overlays braucht es spaeter einen separaten, signierten Capability Grant."),
        p("<b>AccessContext</b> kombiniert die sichere AgentIdentity mit dem erlaubten Projektkontext. Der Ausdruck <b>request.project_id.clone().or_else(|| agent.project_id.clone())</b> verwendet ein angefragtes Projekt nur, wenn es vorhanden ist, sonst die serverseitige Projektbindung des Agenten. Eine echte Permission-Pruefung entscheidet danach, ob die Memory passt."),
        p("Die for-Schleife ist die Invariante in Codeform: <b>can_read_memory</b> kommt vor <b>score_memory</b>. Nur erlaubte Memory wird zur Bewertung hinzugefuegt. Verbotene Memory erhoeht lediglich einen Zaehler fuer das Audit. Ihr Inhalt wird nicht gerankt oder in den Pack geschoben."),
        p("<b>pack_context(scored, request.token_budget)</b> macht aus sortierten Kandidaten einen begrenzten Context Pack. Danach baut der Code ein AuditRecord mit erlaubten IDs, Anzahl abgelehnter Eintraege und Token-Zahlen. Der Audit ist nicht nur Logging - er ist eine fachliche Erklaerung der Entscheidung."),
        title("Merksatz", 3),
        p("Ein Retrieval-System entscheidet zuerst: Darf ich es sehen? Dann: Ist es relevant? Dann: Passt es ins Budget? Diese Reihenfolge schuetzt Daten und macht Entscheidungen erklaerbar."),
        PageBreak(),
        title("22. Embeddings: Text wird zu Suchgeometrie", 2),
        code_block("crates/energon-api/src/embedding.rs", "79-112", SNIPPETS["embeddings"]),
        p("<b>async fn embed</b> nimmt einen Text und verspricht entweder <b>Result&lt;Vec&lt;f32&gt;, EmbeddingError&gt;</b>. Vec&lt;f32&gt; ist ein dynamisches Array aus 32-Bit-Gleitkommazahlen - genau der Vektor, der spaeter in pgvector gespeichert oder mit anderen Vektoren verglichen werden kann."),
        p("<b>client.post(...).bearer_auth(...).json(...).send().await</b> baut einen HTTP POST an den OpenAI Embeddings-Endpunkt. Das API Secret kommt nur aus dem Server-State. Es darf niemals in einen Browser-Bundle oder Agenten-Prompt wandern."),
        p("Nach der Antwort prueft <b>is_success()</b> den HTTP-Status und <b>json::&lt;EmbeddingResponse&gt;()</b> prueft die Antwort gegen die erwartete Rust-Struktur. Das sind zwei verschiedene Schutzschichten: Netzwerkstatus und Datenform."),
        p("<b>into_iter().next().filter(...).ok_or_else(...)</b> liest den ersten Vektor, verwirft leere Ergebnisse und macht auch das zu einem klaren Fehler. Der Aufrufer kann bei Embedding-Fehlern auf eine einfachere, zum Beispiel zeitbasierte oder Keyword-Suche zurueckfallen, statt den ganzen Context Request kaputtzumachen."),
        PageBreak(),
        title("23. Postgres und pgvector: Datenmodell statt lose Textdateien", 2),
        code_block("migrations/0002_memory.sql", "1-24, 41-52", SNIPPETS["schema"]),
        p("<b>CREATE TABLE memory_entries</b> definiert die Haupttabelle. <b>memory_id TEXT PRIMARY KEY</b> macht jede Memory eindeutig. <b>org_id ... REFERENCES orgs</b> ist ein Fremdschluessel: Eine Memory darf nicht zu einer Organisation zeigen, die es nicht gibt. <b>ON DELETE CASCADE</b> bedeutet, dass beim Loeschen einer Organisation ihre untergeordneten Eintraege mit entfernt werden."),
        p("<b>scope TEXT NOT NULL CHECK (...)</b> beschraenkt den Scope auf bekannte Varianten. Das ist eine zweite Verteidigung neben Rust-Enums: Auch ein direkter SQL-Fehler kann nicht einfach scope = 'everyone_forever' speichern."),
        p("<b>promoted_from</b> speichert die Herkunft einer freigegebenen Memory. Dadurch kann ein Audit nachvollziehen: Diese Projekt-Memory entstand aus jener urspruenglich privaten Memory."),
        p("<b>memory_chunks</b> teilt lange Inhalte in kleinere Teile. Jeder Chunk kann einen <b>embedding vector(1536)</b> tragen. Der <b>hnsw</b>-Index mit <b>vector_cosine_ops</b> beschleunigt die Suche nach semantisch aehnlichen Vektoren. Wichtig: Der Index verbessert Geschwindigkeit, ersetzt aber nie die Berechtigungspruefung."),
        PageBreak(),
        title("24. SDK: Ergonomie ohne Identitaetsfaelschung", 2),
        code_block("packages/sdk-typescript/src/index.ts", "298-348", SNIPPETS["sdk"]),
        p("Der Kommentar ueber der Klasse beschreibt den Vertrag: Ein Energon-Objekt repraesentiert genau einen authentifizierten Agenten. <b>readonly memory</b>, <b>context</b>, <b>audit</b> und weitere Bereiche geben dem Entwickler eine klare, typisierte API."
        ),
        p("Die Methoden nehmen fachliche Eingaben wie RememberInput oder BuildContextInput. Auffaellig fehlt: org_id, role_id oder agent_id. Das ist Absicht. Ein SDK-Nutzer darf die Aufgabe und den Inhalt benennen, aber nicht seine Berechtigungsidentitaet behaupten."),
        p("Im Konstruktor normalisiert <b>normalizeBaseUrl</b> die Serveradresse, <b>requiredText</b> prueft, ob ein Key existiert, und <b>normalizeTimeout</b> setzt ein erwartbares Zeitlimit. Das sind kleine Details, die Integrationen robust machen und Fehler frueh sichtbar machen."),
        p("TypeScript hilft hier vor allem dem SDK-Nutzer. Die letzte Sicherheitsentscheidung bleibt trotzdem im Rust-Backend, weil jeder Client theoretisch veraendert oder umgangen werden kann."),
        PageBreak(),
        title("25. Worker: langsame Nebenarbeit entkoppeln", 2),
        code_block("crates/energon-worker/src/main.rs", "63-83", SNIPPETS["worker"]),
        p("Die <b>loop</b> ist eine dauerhafte Worker-Schleife. Wenn ein OpenAI-Key konfiguriert ist, verarbeitet sie eine kleine Embedding-Batch. Wenn ein NATS Publisher konfiguriert ist, veroeffentlicht sie eine Outbox-Batch. Beide Ergebnisse werden als Zahlen gespeichert: embedded und published."),
        p("<b>run_once</b> ist eine kontrollierte Betriebsoption. In Tests, Jobs oder beim manuellen Debugging darf der Worker nach einem Durchlauf sauber enden. In Produktion laeuft er weiter."),
        p("Wenn weder Embeddings noch Events Arbeit fanden, wartet <b>tokio::time::sleep</b> zwei Sekunden. Das verhindert eine enge CPU-Schleife, die ununterbrochen dieselbe leere Datenbank abfragt. Weil sleep awaited wird, blockiert er nicht den ganzen Tokio-Thread."),
        title("End-to-end: eine echte Context-Anfrage", 2),
        mini_table(
            [
                ("1. Agent", "Ein Agent ruft context.build im SDK auf. Der Key reist im Authorization Header mit."),
                ("2. API Edge", "Axum Router, Limits und CORS nehmen die Anfrage an. Auth hasht den Key und laedt die AgentIdentity."),
                ("3. Daten", "Postgres liefert begrenzte Kandidaten fuer Organisation, Projekt, Rolle und Besitzer. Ein Vektorindex kann Relevanz beschleunigen."),
                ("4. Core", "can_read_memory filtert. Erst danach wird bewertet, sortiert und innerhalb des Token Budgets gepackt."),
                ("5. Audit", "Erlaubte IDs, abgelehnte Anzahl, Aufgabe und Token-Zahlen werden gespeichert. Der Agent erhaelt nur seinen Pack."),
            ]
        ),
        PageBreak(),
        title("26. Was du als Naechstes lernen solltest", 2),
        p("Diese Reihenfolge ist absichtlich praktisch. Nach jedem Schritt solltest du nicht nur lesen, sondern eine kleine Frage am echten Code beantworten."),
        mini_table(
            [
                ("Woche 1", "Rust-Basics: Variablen, Structs, Enums, Match, Option, Result, Vec. Lies energon-core/src/memory.rs und identity.rs."),
                ("Woche 2", "Ownership und async: Erklaere jedes &amp;, clone() und .await im Context Broker mit eigenen Worten."),
                ("Woche 3", "HTTP und Axum: Folge einer Route von app.rs bis zum Handler. Teste einen lokalen Request mit absichtlich falschem Key."),
                ("Woche 4", "SQL und Datenmodell: Lies die Migrations. Zeichne Memory, Agent, Projekt und Audit als Beziehungen auf Papier."),
                ("Woche 5", "AI Retrieval: Schreibe fuer dich auf, warum Embedding-Aehnlichkeit nie eine Berechtigung ist. Vergleiche Keyword- und Vektorsuche."),
                ("Woche 6", "Betrieb und Security: Untersuche Environment Variables, Logs, Rate Limits, Outbox und die Fehlerfaelle eines Worker-Restarts."),
            ]
        ),
        title("Abschluss", 2),
        p("Du musst nicht jede Zeile sofort verstehen. Das Ziel ist ein belastbares Modell: Energon ist eine Rust-Control-Plane, die Identitaet serverseitig ableitet, Memory nach Berechtigung filtert, AI Retrieval nur fuer erlaubte Kandidaten nutzt und jede Context-Entscheidung pruefbar macht."),
        p("Wenn du bei einer neuen Datei feststeckst, stelle immer dieselben Fragen: Welche Daten kommen hinein? Welcher Typ repraesentiert sie? Welche Schicht besitzt die Entscheidung? Was passiert bei Fehlern? Welche Invariante darf nie gebrochen werden? Damit liest du dich Schritt fuer Schritt zu echtem Senior-Systemverstaendnis vor.", "Quote"),
    ]
)


story.extend(advanced_story)


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=23 * mm,
        bottomMargin=20 * mm,
        title="Energon OS - Rust, Datenbanken und Systemdesign Masterkurs",
        author="Energon OS",
        subject="Rust, Computer Science, PostgreSQL, pgvector, verteilte Systeme und Skalierung anhand der Energon-OS-Codebasis",
    )
    doc.build(story, onFirstPage=page_background, onLaterPages=page_background)
    print(OUTPUT)


if __name__ == "__main__":
    build()
