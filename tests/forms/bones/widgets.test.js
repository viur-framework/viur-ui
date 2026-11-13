import { describe, it, expect, vi } from "vitest"
import { createApp } from "vue"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))
// The nested form needs a whole ViForm; the stub records what the widget hands over.
const nested = vi.hoisted(() => ({ props: null, emit: null }))
vi.mock("../../../src/forms/bones/BoneNestedWrapper.vue", async () => {
  const { defineComponent } = await import("vue")
  return {
    default: defineComponent({
      props: ["value", "name", "index", "lang", "bone", "disabled"],
      emits: ["change"],
      setup(props, { emit }) {
        nested.props = props
        nested.emit = emit
        return () => null
      },
    }),
  }
})
vi.mock("../../../src/forms/bones/relationalSource.js", () => ({ useRelationalSource: () => async () => [] }))

// Date-only values must not move across midnight in a zone east of UTC.
process.env.TZ = "Europe/Berlin"

const { default: DateBone } = await import("../../../src/forms/bones/widgets/dateBone.vue")

/**
 * Mounts a bone widget with a minimal boneState.
 * @returns {{ el: HTMLElement, changes: Array<Array> }} root element and the arguments of every `change`
 */
function mountWidget(component, props, bonestructure = {}) {
  const changes = []
  const app = createApp(component, { name: "field", ...props, onChange: (...args) => changes.push(args) })
  app.config.globalProperties.$t = (key) => key
  app.provide("boneState", {
    readonly: false,
    multiple: false,
    errorMessages: [],
    bonestructure,
    params: bonestructure.params ?? {},
  })
  const el = document.createElement("div")
  app.mount(el)
  return { el, changes }
}

describe("dateBone", () => {
  it("keeps the calendar day of a date-only value", () => {
    const { changes } = mountWidget(DateBone, { value: "2026-03-28T00:00:00+01:00" }, { date: true, time: false })
    expect(changes[0][1]).toBe("2026-03-28")
  })

  it.each([
    ["2026-03-28T10:15:00-05:00", "2026-03-28T10:15:00"],
    ["2026-03-28T10:15:00Z", "2026-03-28T10:15:00"],
    ["2026-03-28T10:15:00+01:00", "2026-03-28T10:15:00"],
  ])("strips the zone of datetime %s", (value, expected) => {
    const { changes } = mountWidget(DateBone, { value }, { date: true, time: true })
    expect(changes[0][1]).toBe(expected)
  })

  it.each([
    ["2026-03-28T10:15:00-05:00", "10:15:00"],
    ["2026-03-28T10:15:00Z", "10:15:00"],
  ])("strips the zone of time %s", (value, expected) => {
    const { changes } = mountWidget(DateBone, { value }, { date: false, time: true })
    expect(changes[0][1]).toBe(expected)
  })
})

const { default: NumericBone } = await import("../../../src/forms/bones/widgets/numericBone.vue")
const { default: KeyBone } = await import("../../../src/forms/bones/widgets/keyBone.vue")

describe("numericBone", () => {
  it("reports an empty value as an empty string, not as 'null'", () => {
    const { changes } = mountWidget(NumericBone, { value: null }, {})
    expect(changes[0][1]).toBe("")
  })

  it("keeps a number", () => {
    const { changes } = mountWidget(NumericBone, { value: 0 }, {})
    expect(changes[0][1]).toBe("0")
  })
})

describe("server errors", () => {
  it.each([
    ["numericBone", NumericBone],
    ["keyBone", KeyBone],
  ])("%s marks itself invalid", (_, component) => {
    const changes = []
    const app = createApp(component, { name: "field", value: "1", onChange: (...args) => changes.push(args) })
    app.config.globalProperties.$t = (key) => key
    app.provide("boneState", { readonly: false, errorMessages: ["Invalid"], bonestructure: {}, params: {} })
    const el = document.createElement("div")
    app.mount(el)
    expect(el.querySelector("[data-user-invalid]")).not.toBeNull()
  })
})

const { default: PasswordBone } = await import("../../../src/forms/bones/widgets/passwordBone.vue")

/** Sets `value` like typing, pasting or autofill do: only an `input` event, no `keyup`. */
function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event("input"))
}

describe("passwordBone", () => {
  it("accepts a password when the structure has no tests and no threshold", () => {
    const { el, changes } = mountWidget(PasswordBone, { value: null }, {})
    type(el.querySelector("wa-input"), "secret")
    expect(changes.at(-1).slice(1)).toEqual(["secret", undefined, undefined, true])
  })

  it("names the field and asks for the current password at a login", () => {
    const { el } = mountWidget(PasswordBone, { value: null }, {})
    const input = el.querySelector("wa-input")
    expect(input.getAttribute("name")).toBe("field")
    expect(input.getAttribute("autocomplete")).toBe("current-password")
  })

  it("asks for a new password when the structure has tests", () => {
    const { el } = mountWidget(PasswordBone, { value: null }, { tests: [[".{3,}", "too short", true]] })
    const inputs = [...el.querySelectorAll("wa-input")]
    expect(inputs.map((input) => input.getAttribute("autocomplete"))).toEqual(["new-password", "new-password"])
  })

  it("is valid on the keystroke that makes both fields equal", () => {
    const { el, changes } = mountWidget(
      PasswordBone,
      { value: null },
      { tests: [[".{3,}", "too short", true]], test_threshold: 0 }
    )
    const [first, second] = el.querySelectorAll("wa-input")
    type(first, "abc")
    type(second, "abc")
    expect(changes.at(-1)[4]).toBe(true)
  })
})

const { default: SelectBone } = await import("../../../src/forms/bones/widgets/selectBone.vue")
const { default: SelectBoneChoose } = await import("../../../src/forms/bones/widgets/selectBoneChoose.vue")

describe("selectBone", () => {
  const values = [
    [0, "zero"],
    [1, "one"],
    ["2", "two"],
  ]

  it.each([
    ["selectBone", SelectBone],
    ["selectBoneChoose", SelectBoneChoose],
  ])("%s keeps numeric keys of a list value", (_, component) => {
    const { changes } = mountWidget(component, { value: [1, "2", "gone"] }, { values, multiple: true })
    expect(changes[0][1]).toEqual(["1", "2"])
  })

  it("keeps the key 0 of a single value", () => {
    const { changes } = mountWidget(SelectBone, { value: 0 }, { values })
    expect(changes[0][1]).toBe("0")
  })

  it("checks the boxes of numeric keys", () => {
    const { el } = mountWidget(SelectBoneChoose, { value: [1] }, { values, multiple: true })
    expect([...el.querySelectorAll("wa-checkbox")].map((box) => box.getAttribute("checked"))).toEqual([
      "false",
      "true",
      "false",
    ])
  })
})

const { default: PhoneBone } = await import("../../../src/forms/bones/widgets/phoneBone.vue")

describe("phoneBone", () => {
  it("mounts with a number it can't parse", () => {
    const { el } = mountWidget(PhoneBone, { value: "089 1234567" }, {})
    expect(el.querySelector("wa-input")).not.toBeNull()
  })

  it("locks the country select when readonly", () => {
    const changes = []
    const app = createApp(PhoneBone, { name: "phone", value: "+49 89 1234567", onChange: (...a) => changes.push(a) })
    app.provide("boneState", { readonly: true, errorMessages: [], bonestructure: {}, params: {} })
    const el = document.createElement("div")
    app.mount(el)
    expect(el.querySelector("wa-select").getAttribute("disabled")).not.toBeNull()
  })

  it("reports a shortened number", () => {
    const { el, changes } = mountWidget(PhoneBone, { value: "+49 89 1234567" }, {})
    const input = el.querySelector("wa-input")
    input.value = "089"
    input.dispatchEvent(new Event("change"))
    // formatted for the selected country (DE)
    expect(changes.at(-1)[1]).toBe("+49 089")
  })

  it("reports an empty number when only the dial code is left", () => {
    const { el, changes } = mountWidget(PhoneBone, { value: "+49 89 1234567" }, {})
    const input = el.querySelector("wa-input")
    input.value = "+49"
    input.dispatchEvent(new Event("change"))
    expect(changes.at(-1)[1]).toBe("")
  })
})

const { default: RelationalBoneSelect } = await import("../../../src/forms/bones/widgets/relationalBoneSelect.vue")

describe("relationalBoneSelect", () => {
  const bone = { using: { note: { type: "str" } } }

  function mountSelect(value) {
    const changes = []
    const app = createApp(RelationalBoneSelect, {
      name: "rel",
      value,
      lang: "de",
      bone,
      onChange: (...a) => changes.push(a),
    })
    app.provide("boneState", { readonly: false, errorMessages: [], bonestructure: bone, params: {} })
    app.provide("formatString", () => "")
    app.mount(document.createElement("div"))
    return changes
  }

  it("hands the extra fields and the language to the nested form", () => {
    mountSelect({ dest: { key: "a" }, rel: { note: "x" } })
    expect(nested.props.value).toEqual({ note: "x" })
    expect(nested.props.lang).toBe("de")
  })

  it("sends extra fields only with a target", () => {
    const changes = mountSelect(null)
    nested.emit("change", { name: "rel", value: { note: "x" }, lang: "de", index: undefined })
    expect(changes).toHaveLength(1) // only the init
  })
})

const { default: StringBone } = await import("../../../src/forms/bones/widgets/stringBone.vue")

describe("stringBone pattern", () => {
  // as viur-core sends AddressRelSkel.zip_code: ZIP_CODE_PATTERNS, keyed by country
  const params = { pattern: { de: "^\\d{5}$", at: "^\\d{4}$", ae: "" }, "pattern-error": "Invalid ZIP code" }

  function mountZip(country) {
    const app = createApp(StringBone, { name: "zip_code", value: "" })
    app.provide("boneState", { readonly: false, errorMessages: [], bonestructure: {}, params, defaultLanguage: "de" })
    app.provide("formState", { skel: { country } })
    const el = document.createElement("div")
    app.mount(el)
    return el.querySelector("wa-input")
  }

  it("uses the pattern of the address' country", () => {
    expect(mountZip("at").getAttribute("pattern")).toBe("^\\d{4}$")
  })

  it("checks nothing without a country or with an empty pattern", () => {
    expect(mountZip(null).getAttribute("pattern")).toBeNull()
    expect(mountZip("ae").getAttribute("pattern")).toBeNull()
  })

  it("reports the error message viur-core sends as pattern-error", () => {
    const input = mountZip("de")
    let message = null
    input.reportValidity = () => false
    input.validity = { patternMismatch: true }
    input.setCustomValidity = (text) => (message = text)
    input.value = "123"
    input.dispatchEvent(new Event("change"))
    expect(message).toBe("Invalid ZIP code")
  })
})

const { default: EmailBone } = await import("../../../src/forms/bones/widgets/emailBone.vue")

describe("input without keyup", () => {
  // Pasting with the mouse, autofill or Playwright's fill() fire no keyup. A value only
  // in the wa-input is lost when a nested form re-renders before the field fires change.
  it.each([
    ["numericBone", NumericBone, "42"],
    ["stringBone", StringBone, "text"],
    ["emailBone", EmailBone, "a@b.de"],
  ])("%s reports the value", (_, component, value) => {
    const { el, changes } = mountWidget(component, { value: "" }, {})
    const input = el.querySelector("wa-input")
    input.reportValidity = () => true
    input.validity = {}
    input.setCustomValidity = () => {}
    type(input, value)
    expect(changes.at(-1)[1]).toBe(value)
  })
})
