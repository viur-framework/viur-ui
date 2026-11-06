export default class Utils {
  static objectEmpty(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object
  }

  static getDescr(bone, value) {
    try {
      return bone["values"].filter((option) => option[0] === value)[0][1]
    } catch (e) {
      return "-"
    }
  }

  static stripHtml(html) {
    // DOMParser builds an inert document: no scripts or event handlers run (unlike innerHTML)
    return new DOMParser().parseFromString(String(html ?? ""), "text/html").body.textContent || ""
  }

  static unescape(value) {
    if (!value) value = ""
    return String(value)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/&#61;/g, "=")
      .replace(/&#039;/g, "'")
      .replace(/&#040;/g, "(")
      .replace(/&#041;/g, ")")
      .replace(/&#061;/g, "=")
  }

  static formatString(formatstr, boneValue, fallback = "-") {
    function getpathListFromFormatstring(formatstr) {
      let output = []
      let formatList = []
      let regstr = /\$\((.*?)\)/g

      while (formatList) {
        formatList = regstr.exec(formatstr)
        if (!formatList) {
          formatList = false
          continue
        }

        output.push(formatList[1])
      }

      return output
    }

    function readValue(pathstr, avalue) {
      let path = pathstr.split(".")
      let restPath = pathstr.split(".")
      let aval = avalue
      for (let entry of path) {
        restPath.shift()
        if (aval && aval !== "-" && Object.keys(aval).includes(entry)) {
          if (Array.isArray(aval[entry])) {
            let resVal = []
            for (let val of aval[entry]) {
              resVal.push(readValue(restPath.join("."), val))
            }
            aval = resVal.join(", ")
          } else {
            aval = readValue(restPath.join("."), aval[entry])
          }

          if (typeof aval === "object" && !Array.isArray(aval) && aval !== null) {
            aval = Object.entries(aval)
              .map((x) => x[1])
              .join(", ")
          }
        } else if (!aval || (typeof aval[entry] === "object" && !aval[entry])) {
          aval = "-"
        }
      }
      return aval
    }

    let pathlist = getpathListFromFormatstring(formatstr)

    let finalStrList = []

    if (!Array.isArray(boneValue)) {
      boneValue = [boneValue]
    }

    for (let avalue of boneValue) {
      let finalstr = formatstr
      for (let pathstr of pathlist) {
        let aval = readValue(pathstr, avalue)
        // Numbers and booleans belong in the text too: previously
        // EVERY non-string was replaced by the fallback, so `$(dest.kdnr)` with 42
        // disappeared. Empty values, objects and the placeholder "-" remain the
        // fallback.
        if (aval === null || aval === undefined || aval === "-" || typeof aval === "object") {
          aval = fallback
        } else {
          aval = String(aval)
        }
        aval = Utils.unescape(aval)
        finalstr = finalstr.replace("$(" + pathstr + ")", aval)
      }
      finalStrList.push(finalstr)
    }
    return finalStrList.join(", ")
  }

  // ── ViUR values as text ───────────────────────────────────────────────
  //
  // ONE place that turns every bone value into a string — for
  // tables, detail views, export. Because a bone value is rarely a
  // scalar: multilingual bones are one object per language, `multiple` a
  // list, relational bones carry `{dest, rel}` and their own
  // format string, `text` contains HTML.

  /** Type family of a bone: "str.email" → "str". */
  static boneFamily(type) {
    return String(type ?? "").split(".")[0]
  }

  /** select value → label. Accepts object AND pair notation. */
  static optionLabel(bone, value) {
    const values = bone?.["values"]
    if (Array.isArray(values)) {
      const hit = values.find((entry) => String(entry?.[0]) === String(value))
      return hit ? String(hit[1]) : String(value)
    }
    if (values && typeof values === "object") {
      const hit = values[String(value)]
      return hit === undefined ? String(value) : String(hit)
    }
    return String(value)
  }

  /** A SINGLE value (without languages/multiple — boneToString handles that). */
  static singleValueToString(value, bone = {}, options = {}) {
    if (value === null || value === undefined || value === "") return ""
    switch (Utils.boneFamily(bone["type"])) {
      case "bool": {
        const [yes, no] = options.boolTexts ?? ["Ja", "Nein"]
        return value ? yes : no
      }
      case "select":
        return Utils.optionLabel(bone, value)
      case "numeric": {
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) return String(value)
        const digits = typeof bone["precision"] === "number" ? bone["precision"] : undefined
        return new Intl.NumberFormat(options.locale, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(numeric)
      }
      case "date": {
        const parsed = new Date(String(value))
        if (Number.isNaN(parsed.getTime())) return String(value)
        // ViUR sets the flags `date`/`time` (both on by default).
        const wantsDate = bone["date"] !== false
        const wantsTime = bone["time"] !== false
        const format = {}
        if (wantsDate || !wantsTime) Object.assign(format, { year: "numeric", month: "2-digit", day: "2-digit" })
        if (wantsTime) Object.assign(format, { hour: "2-digit", minute: "2-digit" })
        return new Intl.DateTimeFormat(options.locale, format).format(parsed)
      }
      case "relational":
      case "record": {
        // Relational bones bring their own format string ("$(dest.name)").
        const formatstr = bone["format"] ?? bone["params"]?.["format"] ?? "$(dest.name)"
        const text = Utils.formatString(formatstr, value, "")
        if (text && text !== "-") return Utils.stripHtml(String(text))
        // Without a format, the key is better than nothing.
        return String(value?.["dest"]?.["key"] ?? value?.["key"] ?? "")
      }
      case "text":
        // Text bones contain HTML — that's disruptive in a cell.
        return Utils.stripHtml(String(value))
      case "raw":
        return typeof value === "object" ? JSON.stringify(value) : String(value)
      default:
        // viur-core stores strings HTML-escaped ("&#40;" for "("); the cell shows text
        return typeof value === "object" ? JSON.stringify(value) : Utils.unescape(String(value))
    }
  }

  /** A value WITHOUT language dimension (multiple lists included) as text. */
  static monolingualToString(value, bone = {}, options = {}) {
    if (bone["multiple"]) {
      const list = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
      return list.map((entry) => Utils.singleValueToString(entry, bone, options)).join(options.separator ?? ", ")
    }
    return Utils.singleValueToString(value, bone, options)
  }

  /**
   * Flag of a language — maintenance-free via the browser's CLDR data:
   * language code → most likely region (`Intl.Locale.maximize`, de→DE,
   * en→US, ja→JP) → regional indicator emoji. `null` if no region
   * can be determined.
   */
  static languageFlag(code) {
    try {
      const region = new Intl.Locale(String(code)).maximize().region
      if (!region || !/^[A-Z]{2}$/.test(region)) return null
      return String.fromCodePoint(...[...region].map((char) => 0x1f1a5 + char.charCodeAt(0)))
    } catch {
      return null
    }
  }

  /** Prefix that assigns a value to its language: flag, otherwise code. */
  static languageTag(code) {
    return Utils.languageFlag(code) ?? `${code}:`
  }

  /**
   * Bone value of an entry as text.
   *
   * Multilingual bones (`bone.languages`) are controlled by `options.language`:
   * - `"*"` — ALL filled languages, each with a flag prefix (`🇩🇪 value`),
   *   joined with `languageSeparator` (default `", "`).
   *   `options.primaryLanguage` comes first, the others follow in the
   *   bone's order.
   * - language code — the value of that language. If it's empty, the display falls back
   *   to the first filled language and marks that with its flag —
   *   an empty cell would otherwise hide that the entry does have content
   *   in another language.
   * - not set — the bone's first language, without prefix (stable
   *   behavior for format strings and other existing users).
   *
   * @param {*} value value from the skel
   * @param {object} bone bone description from the `structure`
   * @param {{ language?: string, primaryLanguage?: string, locale?: string, boolTexts?: [string, string], separator?: string, languageSeparator?: string }} [options]
   */
  static boneToString(value, bone = {}, options = {}) {
    const languages = bone["languages"]
    if (Array.isArray(languages) && languages.length && value && typeof value === "object") {
      const isEmpty = (entry) =>
        entry === null || entry === undefined || entry === "" || (Array.isArray(entry) && entry.length === 0)
      if (options.language === "*") {
        const primary = options.primaryLanguage
        const ordered =
          primary && languages.includes(primary)
            ? [primary, ...languages.filter((lang) => lang !== primary)]
            : languages
        return ordered
          .filter((lang) => !isEmpty(value[lang]))
          .map((lang) => `${Utils.languageTag(lang)} ${Utils.monolingualToString(value[lang], bone, options)}`)
          .join(options.languageSeparator ?? ", ")
      }
      let lang = options.language && languages.includes(options.language) ? options.language : languages[0]
      if (options.language && isEmpty(value[lang])) {
        lang = languages.find((other) => !isEmpty(value[other])) ?? lang
      }
      const text = Utils.monolingualToString(value[lang], bone, options)
      // Prefix only if a SPECIFIC language was requested and a different one came.
      return options.language && options.language !== lang && !isEmpty(value[lang])
        ? `${Utils.languageTag(lang)} ${text}`
        : text
    }
    return Utils.monolingualToString(value, bone, options)
  }
}

function normalizeBonePathSegment(segment) {
  return String(segment)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildBoneDomId(pathSegments, suffix = null) {
  const normalizedSegments = pathSegments
    .filter((segment) => segment !== null && segment !== undefined && segment !== "")
    .map(normalizeBonePathSegment)
    .filter(Boolean)

  if (suffix) {
    normalizedSegments.push(normalizeBonePathSegment(suffix))
  }

  return ["vi-bone", ...normalizedSegments].join("--")
}
