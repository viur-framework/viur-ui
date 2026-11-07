import type { CellBadge, DataTableColumn, Row } from "./types.ts"
import { compareValues, firstValueOf } from "./columns.ts"
// @ts-expect-error – JS module without types
import Utils from "../../forms/bones/utils.js"

// --------------------------------------------------------------------------- //
// ViUR structure → DataTable columns                                          //
// --------------------------------------------------------------------------- //
//
// Besides the records, a ViUR list delivers its `structure`: per bone an
// object with `descr` (label), `type` ("str", "str.email", "numeric",
// "select", "relational.…"), `multiple`, `languages`, `indexed`, `visible` and
// type-specific extras (`values` for select, `precision` for numeric,
// `format` for relational bones).
//
// This turns them into columns: label, alignment, sortability and
// a `formatter`. The value → text conversion is done by `Utils.boneToString`
// (src/forms/bones/utils.js) — the ONE place for it, which the forms and the
// bones' format strings use as well.

/** A bone of the structure, as delivered by the renderer. */
export interface BoneDescription {
  descr?: string
  type?: string
  multiple?: boolean
  languages?: string[] | null
  /** Only indexed bones can be sorted server-side. */
  indexed?: boolean
  visible?: boolean
  readonly?: boolean
  /** select: value → label. */
  values?: Record<string, string> | [string, string][]
  /** numeric: decimal places. */
  precision?: number
  /** date: what the bone actually holds. */
  date?: boolean
  time?: boolean
  params?: Record<string, unknown> | null
  [key: string]: unknown
}

export type BoneStructure = Record<string, BoneDescription>

export interface ColumnsFromStructureOptions<R extends Row = Row> {
  /**
   * Language of multilingual bones: a code shows that language (empty →
   * first filled one, marked with its flag), `"*"` shows ALL filled
   * languages with a flag prefix; if unset, the bone's first language.
   */
  language?: string | null
  /** Comes first in `"*"` mode — usually the UI language. */
  primaryLanguage?: string | null
  /** Locale for numbers and dates. */
  locale?: string
  /** Only these bones, in this order (default: all visible ones). */
  bones?: string[]
  /** Never show these bones (in addition to the ones hidden anyway). */
  exclude?: string[]
  /** Labels for `bool` values (default: Ja/Nein, Yes/No for a non-German `primaryLanguage`/`locale`/`<html lang>`). */
  boolTexts?: [string, string]
  /** Extends/overrides the generated column per bone. */
  overrides?: Record<string, Partial<DataTableColumn<R>>>
  /**
   * The COMPLETE dataset is in the client (everything loaded): sorting,
   * searching and column filters then run locally on all columns — without
   * the server. Without the flag both stay off, because on a PARTIALLY loaded
   * slice local sorting/filtering would be a lie; there the server sorts
   * (indexed bones only, via the table events).
   */
  local?: boolean
}

/** Bones that have no place in a list. */
const HIDDEN_TYPES = ["password", "credential"]

// --------------------------------------------------------------------------- //
// Badges for plain select and bool bones                                       //
// --------------------------------------------------------------------------- //
//
// Plain choice values ("select" without subtype — country & co. stay text) and
// bool values are rendered as colored badges: POSITIVE values green,
// NEGATIVE red, all other options get rainbow-graded hues
// (evenly across the color wheel, stable per option order). Whether a value
// is positive/negative is decided by the keyword list below — both option
// KEYS and LABELS are checked, regardless of upper/lower
// case ("Ja", "ja", "yes", "Aktiv", "visible", …).

/** Positive values → green. Extensible (e.g. `POSITIVE_KEYWORDS.add("live")`). */
export const POSITIVE_KEYWORDS = new Set([
  "yes",
  "ja",
  "true",
  "1",
  "active",
  "aktiv",
  "enabled",
  "aktiviert",
  "visible",
  "sichtbar",
  "on",
  "an",
  "ok",
  "public",
  "öffentlich",
  "released",
  "freigegeben",
  "erlaubt",
  "allowed",
  "online",
])

/** Negative values → red. */
export const NEGATIVE_KEYWORDS = new Set([
  "no",
  "nein",
  "false",
  "0",
  "inactive",
  "inaktiv",
  "disabled",
  "deaktiviert",
  "hidden",
  "versteckt",
  "unsichtbar",
  "invisible",
  "off",
  "aus",
  "blocked",
  "gesperrt",
  "denied",
  "verboten",
  "private",
  "privat",
  "deleted",
  "gelöscht",
  "offline",
])

const POSITIVE_COLOR = "var(--wa-color-success-50, #16a34a)"
const NEGATIVE_COLOR = "var(--wa-color-danger-50, #dc2626)"

function keywordTone(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const word = String(candidate ?? "")
      .trim()
      .toLowerCase()
    if (!word) continue
    if (POSITIVE_KEYWORDS.has(word)) return POSITIVE_COLOR
    if (NEGATIVE_KEYWORDS.has(word)) return NEGATIVE_COLOR
  }
  return null
}

/** Normalize select `values`: [ [key, label], … ]. */
function selectOptions(bone: BoneDescription): [string, string][] {
  const values = bone.values
  if (Array.isArray(values)) return values.map(([key, label]) => [String(key), String(label)])
  if (values && typeof values === "object") return Object.entries(values).map(([key, label]) => [key, String(label)])
  return []
}

/**
 * Color mapping for the options of a plain select bone: keywords
 * decide green/red, the remaining options share the color wheel
 * (rainbow), in the order of their definition.
 */
export function selectToneMap(bone: BoneDescription): Map<string, { label: string; color: string }> {
  const options = selectOptions(bone)
  const map = new Map<string, { label: string; color: string }>()
  const neutrals: [string, string][] = []
  for (const [key, label] of options) {
    const tone = keywordTone(key, label)
    if (tone) map.set(key, { label, color: tone })
    else neutrals.push([key, label])
  }
  neutrals.forEach(([key, label], index) => {
    // Rainbow: evenly distributed hues, fixed saturation/lightness.
    const hue = Math.round((360 / Math.max(1, neutrals.length)) * index)
    map.set(key, { label, color: `oklch(0.62 0.16 ${hue})` })
  })
  return map
}

/**
 * Badge function for a bone — or null if the bone doesn't get any.
 * Only PLAIN selects (`type === "select"`, no select.country or similar) and bools.
 */
export function badgesForBone(
  bone: BoneDescription,
  options: ColumnsFromStructureOptions = {}
): ((value: unknown) => CellBadge[] | null) | null {
  if (bone.type === "bool") {
    const [yes, no] = Utils.boolTexts(options) as [string, string]
    return (value) => {
      if (value === null || value === undefined || value === "") return null
      const truthy = value === true || value === "true" || value === 1 || value === "1"
      return [{ label: truthy ? yes : no, color: truthy ? POSITIVE_COLOR : NEGATIVE_COLOR }]
    }
  }
  if (bone.type !== "select") return null
  const tones = selectToneMap(bone)
  return (value) => {
    if (value === null || value === undefined || value === "") return null
    const keys = Array.isArray(value) ? value : [value]
    const badges: CellBadge[] = []
    for (const key of keys) {
      const entry = tones.get(String(key))
      badges.push(entry ?? { label: String(key), color: keywordTone(key) ?? "var(--wa-color-neutral-60, #71717a)" })
    }
    return badges.length ? badges : null
  }
}

/** Type family of a bone: "str.email" → "str". */
export function boneFamily(type: string | undefined | null): string {
  return Utils.boneFamily(type) as string
}

/**
 * Bone value of a record as text — with languages, `multiple` and the
 * format string of relational bones. Thin wrapper around `Utils.boneToString`
 * so table code can stay with the DataTable types.
 */
export function boneText(value: unknown, bone: BoneDescription, options: ColumnsFromStructureOptions = {}): string {
  return Utils.boneToString(value, bone, options) as string
}

/** Local column filter matching the bone type. */
function localFilterFor(bone: BoneDescription, options: ColumnsFromStructureOptions): Partial<DataTableColumn> {
  const family = boneFamily(bone.type)
  if (bone.type === "bool") {
    const [yes, no] = Utils.boolTexts(options) as [string, string]
    return {
      filterable: true,
      filterType: "set",
      filterOptions: [
        { value: "true", label: yes },
        { value: "false", label: no },
      ],
    }
  }
  if (family === "select") {
    const options = selectOptions(bone).map(([value, label]) => ({ value, label }))
    return { filterable: true, filterType: bone.multiple ? "includes-any" : "set", filterOptions: options }
  }
  if (family === "numeric") return { filterable: true, filterType: "number-range" }
  if (family === "date") return { filterable: true, filterType: "date-range" }
  return { filterable: true, filterType: "text" }
}

const isEmptyValue = (value: unknown): boolean => value === null || value === undefined || value === ""

/**
 * Sort value of a MULTILINGUAL bone: the same language the display puts
 * first — the requested one (or the primary one for `"*"`), and if that is
 * empty, the first filled one. This way the column sorts by the text the
 * cell actually shows, not blindly by the bone's first language.
 */
function languageSortValue(value: unknown, languages: string[], options: ColumnsFromStructureOptions): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const wanted = options.language === "*" ? (options.primaryLanguage ?? null) : (options.language ?? null)
  let lang = wanted && languages.includes(wanted) ? wanted : languages[0]
  if (isEmptyValue(record[lang])) {
    lang = languages.find((other) => !isEmptyValue(record[other])) ?? lang
  }
  return record[lang]
}

/** Numbers right, everything else left — as usual in tables. */
function alignOf(bone: BoneDescription): "start" | "end" {
  return boneFamily(bone.type) === "numeric" && !bone.multiple ? "end" : "start"
}

/**
 * Columns from a ViUR structure.
 *
 * A column only becomes sortable if the bone is `indexed` and neither
 * `multiple` nor multilingual — the server can't order by anything else.
 * Search and column filters stay off: for a list the server handles those,
 * the caller wires them up via the table's events.
 */
export function columnsFromStructure<R extends Row = Row>(
  structure: BoneStructure | null | undefined,
  options: ColumnsFromStructureOptions<R> = {}
): DataTableColumn<R>[] {
  const bones = structure ?? {}
  const exclude = new Set(options.exclude ?? [])
  const names = options.bones ?? Object.keys(bones)

  const columns: DataTableColumn<R>[] = []
  for (const name of names) {
    const bone = bones[name]
    if (!bone || exclude.has(name)) continue
    if (bone.visible === false) continue
    if (HIDDEN_TYPES.includes(boneFamily(bone.type))) continue

    // Server mode: only indexed bones are sortable; locally (everything
    // loaded) every column may be sorted, searched and filtered.
    const sortable = options.local === true || (bone.indexed === true && !bone.multiple && !bone.languages?.length)
    const column: DataTableColumn<R> = {
      field: name,
      label: bone.descr ?? name,
      align: alignOf(bone),
      sortable,
      searchable: options.local === true,
      filterable: false,
      formatter: (value) => boneText(value, bone, options as ColumnsFromStructureOptions),
      minWidth: 120,
      flex: 1,
    }
    // Multilingual: sort by the DISPLAYED language (see above).
    if (bone.languages?.length) {
      const languages = bone.languages
      column.comparator = (a, b) =>
        compareValues(
          firstValueOf(languageSortValue(a, languages, options as ColumnsFromStructureOptions)),
          firstValueOf(languageSortValue(b, languages, options as ColumnsFromStructureOptions)),
          "auto"
        )
    }

    // Plain selects and bools as colored badges (see badgesForBone).
    const badge = badgesForBone(bone, options as ColumnsFromStructureOptions)
    if (badge) column.badge = (value) => badge(value)
    if (options.local === true) Object.assign(column, localFilterFor(bone, options as ColumnsFromStructureOptions))
    columns.push({ ...column, ...(options.overrides?.[name] ?? {}) })
  }
  return columns
}
