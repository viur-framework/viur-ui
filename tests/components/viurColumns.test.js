import { describe, it, expect } from "vitest"
import { boneFamily, boneText, columnsFromStructure } from "../../src/components/DataTable/viurColumns.ts"
import * as viurColumns from "../../src/components/DataTable/viurColumns.ts"
import * as dataTableColumns from "../../src/components/DataTable/columns.ts"

// A ViUR list ships its `structure`; the DataTable's columns are built from it.
// The core is translating the BONE VALUE into text: multilingual
// bones are an object per language, `multiple` a list, relational bones
// carry `{dest, rel}`.

const str = { descr: "Name", type: "str", indexed: true }
const num = { descr: "Menge", type: "numeric", precision: 2, indexed: true }
const bool = { descr: "Aktiv", type: "bool" }
const select = { descr: "Status", type: "select", values: { open: "Offen", done: "Erledigt" } }
const rel = { descr: "Kunde", type: "relational.relationalbone" }
const multi = { descr: "Tags", type: "str", multiple: true }
const lang = { descr: "Titel", type: "str", languages: ["de", "en"] }

describe("boneFamily", () => {
  it("nimmt den ersten Teil des Typs", () => {
    expect(boneFamily("str.email")).toBe("str")
    expect(boneFamily("relational.tree.leaf.file.file")).toBe("relational")
    expect(boneFamily(undefined)).toBe("")
  })
})

describe("boneText", () => {
  it("bool wird beschriftet", () => {
    expect(boneText(true, bool)).toBe("Ja")
    expect(boneText(false, bool)).toBe("Nein")
    expect(boneText(true, bool, { boolTexts: ["yes", "no"] })).toBe("yes")
    expect(boneText(true, bool, { locale: "en-US" })).toBe("Yes")
    expect(boneText(false, bool, { primaryLanguage: "en" })).toBe("No")
  })

  it("select zeigt die Beschriftung, nicht den Schlüssel", () => {
    expect(boneText("done", select)).toBe("Erledigt")
    // Unknown value stays visible instead of disappearing.
    expect(boneText("weg", select)).toBe("weg")
  })

  it("select akzeptiert auch die Paar-Schreibweise", () => {
    const pairs = { type: "select", values: [["a", "Alpha"]] }
    expect(boneText("a", pairs)).toBe("Alpha")
  })

  it("numeric folgt der Nachkommastelle", () => {
    expect(boneText(3, num, { locale: "en-US" })).toBe("3.00")
    expect(boneText("abc", num)).toBe("abc")
  })

  it("date wird nach den Flags des Bones formatiert", () => {
    const nurDatum = { type: "date", date: true, time: false }
    expect(boneText("2026-08-26T10:30:00", nurDatum, { locale: "de-DE" })).toBe("26.08.2026")
    const nurZeit = { type: "date", date: false, time: true }
    expect(boneText("2026-08-26T10:30:00", nurZeit, { locale: "de-DE" })).toBe("10:30")
    // Unparsable input stays as it came.
    expect(boneText("bald", { type: "date" })).toBe("bald")
  })

  it("relationale Bones zeigen den Namen des Ziels", () => {
    expect(boneText({ dest: { key: "k1", name: "Firma" }, rel: null }, rel)).toBe("Firma")
    // without a name, the key remains
    expect(boneText({ dest: { key: "k1" } }, rel)).toBe("k1")
  })

  it("relationale Bones folgen ihrem Formatstring", () => {
    // ViUR ships a `format` with relational bones ("$(dest.name)").
    const bone = { type: "relational.relationalbone", format: "$(dest.name) ($(dest.kdnr))" }
    const wert = { dest: { name: "Firma", kdnr: 42 }, rel: null }
    expect(boneText(wert, bone)).toBe("Firma (42)")
  })

  it("Textbones verlieren ihr HTML", () => {
    const bone = { type: "text" }
    expect(boneText("<p>Hallo <b>Welt</b></p>", bone)).toBe("Hallo Welt")
  })

  it("shows strings escaped by viur-core as typed", () => {
    expect(boneText("Muster &#40;FFZ&#41; &lt;b&gt;", str)).toBe("Muster (FFZ) <b>")
    expect(boneText(0, {})).toBe("0")
    expect(boneText(false, {})).toBe("false")
  })

  it("multiple wird zusammengefügt", () => {
    expect(boneText(["a", "b"], multi)).toBe("a, b")
    expect(boneText(null, multi)).toBe("")
  })

  it("mehrsprachige Bones nehmen die gewünschte Sprache", () => {
    const wert = { de: "Titel", en: "Title" }
    expect(boneText(wert, lang, { language: "en" })).toBe("Title")
    // if unspecified, the bone's first language
    expect(boneText(wert, lang)).toBe("Titel")
    // unknown/empty requested language → first filled one, marked with a
    // flag (otherwise the cell would silently show the wrong language)
    expect(boneText(wert, lang, { language: "fr" })).toBe("🇩🇪 Titel")
  })

  it("leere Werte bleiben leer", () => {
    expect(boneText(null, str)).toBe("")
    expect(boneText(undefined, str)).toBe("")
    expect(boneText("", str)).toBe("")
  })
})

describe("columnsFromStructure", () => {
  it("erzeugt je sichtbarem Bone eine Spalte", () => {
    const columns = columnsFromStructure({ name: str, menge: num })
    expect(columns.map((c) => [c.field, c.label])).toEqual([
      ["name", "Name"],
      ["menge", "Menge"],
    ])
  })

  it("Zahlen rechts, alles andere links", () => {
    const columns = columnsFromStructure({ name: str, menge: num })
    expect(columns[0].align).toBe("start")
    expect(columns[1].align).toBe("end")
  })

  it("sortierbar nur, wonach der Server ordnen kann", () => {
    const columns = columnsFromStructure({
      name: str, // indexed
      aktiv: bool, // not indexed
      tags: { ...multi, indexed: true }, // multiple
      titel: { ...lang, indexed: true }, // multilingual
    })
    expect(Object.fromEntries(columns.map((c) => [c.field, c.sortable]))).toEqual({
      name: true,
      aktiv: false,
      tags: false,
      titel: false,
    })
  })

  it("überspringt verborgene und geheime Bones", () => {
    const columns = columnsFromStructure({
      name: str,
      intern: { ...str, visible: false },
      passwort: { descr: "Passwort", type: "password" },
      zugang: { descr: "Token", type: "credential" },
    })
    expect(columns.map((c) => c.field)).toEqual(["name"])
  })

  it("nimmt Auswahl und Reihenfolge der Bones entgegen", () => {
    const columns = columnsFromStructure({ name: str, menge: num, aktiv: bool }, { bones: ["menge", "name"] })
    expect(columns.map((c) => c.field)).toEqual(["menge", "name"])
  })

  it("exclude und overrides greifen", () => {
    const columns = columnsFromStructure(
      { name: str, menge: num },
      { exclude: ["menge"], overrides: { name: { label: "Eigen", width: 300 } } }
    )
    expect(columns).toHaveLength(1)
    expect(columns[0].label).toBe("Eigen")
    expect(columns[0].width).toBe(300)
  })

  it("der formatter der Spalte übersetzt den Bone-Wert", () => {
    const [spalte] = columnsFromStructure({ status: select })
    expect(spalte.formatter("open")).toBe("Offen")
  })

  it("ohne Struktur keine Spalten", () => {
    expect(columnsFromStructure(null)).toEqual([])
    expect(columnsFromStructure({})).toEqual([])
  })
})

describe("badgesForBone — Plaketten für reine selects und bools", () => {
  const { badgesForBone, selectToneMap, POSITIVE_KEYWORDS, NEGATIVE_KEYWORDS } = viurColumns

  const STATUS_BONE = {
    type: "select",
    values: {
      active: "Aktiv",
      draft: "Entwurf",
      review: "Prüfung",
      archived: "Archiv",
      hidden: "Versteckt",
    },
  }

  it("bool: true grün, false rot, leer keine Plakette", () => {
    const badge = badgesForBone({ type: "bool" }, { boolTexts: ["Ja", "Nein"] })
    expect(badge(true)).toEqual([{ label: "Ja", color: expect.stringContaining("success") }])
    expect(badge(false)).toEqual([{ label: "Nein", color: expect.stringContaining("danger") }])
    expect(badge(null)).toBeNull()
  })

  it("select: Schlüsselwörter (Schlüssel ODER Beschriftung, case-insensitiv) → grün/rot", () => {
    const badge = badgesForBone(STATUS_BONE)
    expect(badge("active")[0]).toMatchObject({ label: "Aktiv", color: expect.stringContaining("success") })
    expect(badge("hidden")[0]).toMatchObject({ label: "Versteckt", color: expect.stringContaining("danger") })
    // "Versteckt" matches via the LABEL (versteckt), "hidden" via the key
  })

  it("select: übrige Optionen bekommen regenbogen-verteilte, stabile Farbtöne", () => {
    const tones = selectToneMap(STATUS_BONE)
    const neutral = ["draft", "review", "archived"].map((key) => tones.get(key).color)
    expect(new Set(neutral).size).toBe(3) // all different
    for (const color of neutral) expect(color).toMatch(/^oklch\(/)
    // stable: same structure → same colors
    const again = selectToneMap(STATUS_BONE)
    expect(["draft", "review", "archived"].map((key) => again.get(key).color)).toEqual(neutral)
  })

  it("select multiple: eine Plakette je Wert; unbekannte Werte neutral", () => {
    const badge = badgesForBone(STATUS_BONE)
    const badges = badge(["active", "draft", "unknown-key"])
    expect(badges).toHaveLength(3)
    expect(badges[2]).toMatchObject({ label: "unknown-key", color: expect.stringContaining("neutral") })
  })

  it("nur REINE selects und bools — country, str & Co. bleiben Text", () => {
    expect(badgesForBone({ type: "select.country", values: { de: "Deutschland" } })).toBeNull()
    expect(badgesForBone({ type: "str" })).toBeNull()
    expect(badgesForBone({ type: "relational.tree.leaf.file" })).toBeNull()
  })

  it("Schlüsselwortlisten sind exportiert und erweiterbar", () => {
    expect(POSITIVE_KEYWORDS.has("sichtbar")).toBe(true)
    expect(NEGATIVE_KEYWORDS.has("gesperrt")).toBe(true)
    POSITIVE_KEYWORDS.add("live")
    const badge = badgesForBone({ type: "select", values: { live: "Live" } })
    expect(badge("live")[0].color).toContain("success")
    POSITIVE_KEYWORDS.delete("live")
  })

  it("columnsFromStructure hängt die badge-Funktion nur an passende Spalten", () => {
    const columns = viurColumns.columnsFromStructure({
      status: { descr: "Status", type: "select", values: { active: "Aktiv" } },
      ok: { descr: "OK", type: "bool" },
      land: { descr: "Land", type: "select.country", values: { de: "DE" } },
      name: { descr: "Name", type: "str" },
    })
    const byField = Object.fromEntries(columns.map((column) => [column.field, column]))
    expect(byField.status.badge).toBeTypeOf("function")
    expect(byField.ok.badge).toBeTypeOf("function")
    expect(byField.land.badge).toBeUndefined()
    expect(byField.name.badge).toBeUndefined()
  })
})

describe("columnsFromStructure — local: alles geladen → lokal sortieren/suchen/filtern", () => {
  const STRUCTURE = {
    name: { descr: "Name", type: "str", indexed: false },
    price: { descr: "Preis", type: "numeric", indexed: true },
    status: { descr: "Status", type: "select", values: { active: "Aktiv", draft: "Entwurf" } },
    tags: { descr: "Tags", type: "select", multiple: true, values: { a: "A", b: "B" } },
    ok: { descr: "OK", type: "bool" },
    created: { descr: "Erstellt", type: "date", date: true },
  }

  it("ohne local: nur indizierte Bones sortierbar, kein Suchen/Filtern", () => {
    const byField = Object.fromEntries(columnsFromStructure(STRUCTURE).map((c) => [c.field, c]))
    expect(byField.name.sortable).toBe(false)
    expect(byField.price.sortable).toBe(true)
    expect(byField.name.searchable).toBe(false)
    expect(byField.status.filterable).toBe(false)
  })

  it("mit local: alles sortierbar/durchsuchbar, Filtertypen je Bone", () => {
    const byField = Object.fromEntries(
      columnsFromStructure(STRUCTURE, { local: true, boolTexts: ["Ja", "Nein"] }).map((c) => [c.field, c])
    )
    for (const column of Object.values(byField)) {
      expect(column.sortable).toBe(true)
      expect(column.searchable).toBe(true)
      expect(column.filterable).toBe(true)
    }
    expect(byField.name.filterType).toBe("text")
    expect(byField.price.filterType).toBe("number-range")
    expect(byField.created.filterType).toBe("date-range")
    expect(byField.status.filterType).toBe("set")
    expect(byField.status.filterOptions).toEqual([
      { value: "active", label: "Aktiv" },
      { value: "draft", label: "Entwurf" },
    ])
    expect(byField.tags.filterType).toBe("includes-any")
    expect(byField.ok.filterType).toBe("set")
    expect(byField.ok.filterOptions).toEqual([
      { value: "true", label: "Ja" },
      { value: "false", label: "Nein" },
    ])
  })
})

describe("compareValues — Arrays/Objekte sortieren nach dem ersten Wert", () => {
  it("firstValueOf reduziert rekursiv auf das erste Atom", () => {
    const { firstValueOf } = dataTableColumns
    expect(firstValueOf([3, 1, 2])).toBe(3)
    expect(firstValueOf({ de: "Hallo", en: "Hello" })).toBe("Hallo")
    expect(firstValueOf([{ dest: { name: "Anna" } }])).toBe("Anna")
    expect(firstValueOf([])).toBeUndefined()
    expect(firstValueOf(null)).toBeNull()
    expect(firstValueOf("x")).toBe("x")
  })

  it("auto-Modus vergleicht zusammengesetzte Werte über ihr erstes Atom", () => {
    const { compareValues } = dataTableColumns
    expect(compareValues([2], [10], "auto")).toBeLessThan(0) // numeric, not "10" < "2"
    expect(compareValues({ de: "Apfel" }, { de: "Birne" }, "auto")).toBeLessThan(0)
    expect(compareValues([{ dest: { name: "Anna" } }], [{ dest: { name: "Ben" } }], "auto")).toBeLessThan(0)
    // Primitives unchanged
    expect(compareValues(2, 10, "auto")).toBeLessThan(0)
  })
})

describe("columnsFromStructure — mehrsprachige Spalten sortieren nach der angezeigten Sprache", () => {
  const STRUCTURE = { title: { descr: "Titel", type: "str", languages: ["de", "en"], indexed: true } }
  const colFor = (options) => columnsFromStructure(STRUCTURE, options)[0]

  it("gewünschte Sprache bestimmt die Sortierung", () => {
    const en = colFor({ language: "en" }).comparator
    expect(en({ de: "Zebra", en: "Apple" }, { de: "Apfel", en: "Zebra" })).toBeLessThan(0)
    const de = colFor({ language: "de" }).comparator
    expect(de({ de: "Zebra", en: "Apple" }, { de: "Apfel", en: "Zebra" })).toBeGreaterThan(0)
  })

  it('language "*" sortiert nach der primären (vorn angezeigten) Sprache', () => {
    const comparator = colFor({ language: "*", primaryLanguage: "en" }).comparator
    expect(comparator({ de: "Zebra", en: "Apple" }, { de: "Apfel", en: "Zebra" })).toBeLessThan(0)
  })

  it("leere gewünschte Sprache fällt wie die Anzeige auf die erste befüllte zurück", () => {
    const comparator = colFor({ language: "en" }).comparator
    // left lacks en → falls back to de ("Beta"); right en "Alpha" → Alpha < Beta
    expect(comparator({ de: "Beta", en: "" }, { de: "Zebra", en: "Alpha" })).toBeGreaterThan(0)
  })

  it("einsprachige Bones bekommen keinen Sprach-Comparator", () => {
    const column = columnsFromStructure({ name: { descr: "Name", type: "str" } })[0]
    expect(column.comparator).toBeUndefined()
  })
})
