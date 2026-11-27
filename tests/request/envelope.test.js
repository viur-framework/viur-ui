import { describe, it, expect } from "vitest"
import { normalizeEnvelope, isEnvelopeV2, isViur4Envelope, v1SelectionFollow } from "../../src/request/envelope.js"

describe("isEnvelopeV2", () => {
  it("detects the JSON number version 2", () => {
    expect(isEnvelopeV2({ version: 2, datatype: "entity" })).toBe(true)
  })

  it("tolerates the string '2' defensively", () => {
    expect(isEnvelopeV2({ version: "2" })).toBe(true)
  })

  it("is false for v1 bodies, arrays, and primitives", () => {
    expect(isEnvelopeV2({ values: { key: "k" } })).toBe(false)
    expect(isEnvelopeV2({ version: 1 })).toBe(false)
    expect(isEnvelopeV2([1, 2, 3])).toBe(false)
    expect(isEnvelopeV2(null)).toBe(false)
    expect(isEnvelopeV2("str")).toBe(false)
  })
})

describe("isViur4Envelope", () => {
  const VIUR4 = { version: 2, action: "login", status: "init", step: null, step_status: null, steps: null }

  it("detects the envelope of viur-core 4, also after normalizing", () => {
    expect(isViur4Envelope(VIUR4)).toBe(true)
    expect(isViur4Envelope(normalizeEnvelope(VIUR4))).toBe(true)
  })

  it("is false for a v1 body of viur-core 3.9, raw or lifted to v2", () => {
    const v1 = { action: "select_authentication_provider", structure: {}, values: {} }
    expect(isViur4Envelope(v1)).toBe(false)
    expect(isViur4Envelope(normalizeEnvelope(v1))).toBe(false)
  })

  it("is false for a v2 body without steps and step_status", () => {
    expect(isViur4Envelope({ version: 2, action: "login", status: "init" })).toBe(false)
    expect(isViur4Envelope(null)).toBe(false)
  })
})

describe("normalizeEnvelope — passthrough", () => {
  it("returns arrays unchanged (e.g. skey batch)", () => {
    const arr = ["sk1", "sk2"]
    expect(normalizeEnvelope(arr)).toBe(arr)
  })

  it("returns primitives / null unchanged", () => {
    expect(normalizeEnvelope(null)).toBeNull()
    expect(normalizeEnvelope("okay")).toBe("okay")
  })

  it("leaves a non-ViUR object (e.g. getStructure map) untouched", () => {
    const struct = { viewSkel: { name: { type: "str" } } }
    expect(normalizeEnvelope(struct)).toEqual(struct)
    expect(normalizeEnvelope(struct).version).toBeUndefined()
  })

  it("passes a v2 entity envelope through, ensuring errors is an array", () => {
    const v2 = { version: 2, datatype: "entity", action: "view", status: "success", data: { key: "k" } }
    const out = normalizeEnvelope(v2)
    expect(out.version).toBe(2)
    expect(out.data).toEqual({ key: "k" })
    expect(out.errors).toEqual([])
  })

  it("rebuilds meta for a v2 list envelope that lacks it", () => {
    const v2 = { version: 2, datatype: "list", data: [{ key: "a" }], cursor: "c1", orders: ["name asc"] }
    const out = normalizeEnvelope(v2)
    expect(out.meta).toEqual({ cursor: "c1", orders: ["name asc"] })
  })
})

describe("normalizeEnvelope — v1 → v2 entity", () => {
  it("lifts values → data and keeps v1 fields alongside", () => {
    const v1 = { action: "view", values: { key: "k", name: "Test" }, structure: { name: { type: "str" } }, errors: [] }
    const out = normalizeEnvelope(v1)
    expect(out.version).toBe(2)
    expect(out.datatype).toBe("entity")
    expect(out.data).toEqual({ key: "k", name: "Test" })
    expect(out.structure).toEqual({ name: { type: "str" } })
    expect(out.values).toEqual({ key: "k", name: "Test" }) // original kept
  })

  it("maps editSuccess → action edit / status success", () => {
    const out = normalizeEnvelope({ action: "editSuccess", values: { key: "k" } })
    expect(out.action).toBe("edit")
    expect(out.status).toBe("success")
  })

  it("maps moveSuccess → action move / status success", () => {
    const out = normalizeEnvelope({ action: "moveSuccess", values: { key: "k" } })
    expect(out.action).toBe("move")
    expect(out.status).toBe("success")
  })

  it("maps addSuccess → action add / status success", () => {
    const out = normalizeEnvelope({ action: "addSuccess", values: { key: "k" } })
    expect(out.action).toBe("add")
    expect(out.status).toBe("success")
  })

  it("treats a non-success add/edit form as init when there are no errors", () => {
    const out = normalizeEnvelope({ action: "edit", values: {}, errors: [] })
    expect(out.action).toBe("edit")
    expect(out.status).toBe("init")
  })

  it("treats a form carrying errors as rejected", () => {
    const out = normalizeEnvelope({ action: "add", values: {}, errors: [{ fieldPath: "name" }] })
    expect(out.status).toBe("rejected")
    expect(out.errors).toHaveLength(1)
  })

  it("aliases next_url → follow when follow is absent", () => {
    const out = normalizeEnvelope({ action: "view", values: {}, next_url: "/next" })
    expect(out.follow).toBe("/next")
  })
})

describe("normalizeEnvelope — v1 → v2 list", () => {
  it("lifts skellist → data and cursor/orders → meta", () => {
    const v1 = { skellist: [{ key: "a" }, { key: "b" }], cursor: "cur", orders: ["date desc"] }
    const out = normalizeEnvelope(v1)
    expect(out.version).toBe(2)
    expect(out.datatype).toBe("list")
    expect(out.data).toEqual([{ key: "a" }, { key: "b" }])
    expect(out.meta).toEqual({ cursor: "cur", orders: ["date desc"] })
  })

  it("defaults cursor to null and orders to [] when missing", () => {
    const out = normalizeEnvelope({ skellist: [] })
    expect(out.meta).toEqual({ cursor: null, orders: [] })
  })
})

describe("normalizeEnvelope — idempotency", () => {
  it("is stable when applied twice to a v1 body", () => {
    const v1 = { action: "editSuccess", values: { key: "k" }, structure: {}, errors: [] }
    const once = normalizeEnvelope(v1)
    const twice = normalizeEnvelope(once)
    expect(twice).toEqual(once)
  })
})

// --------------------------------------------------------------------------- //
// Target of the next login step (v1)                                          //
// --------------------------------------------------------------------------- //
//
// v2 delivers `follow`. In v1 the location changes per stage:
//   provider choice / second factor choice → the chosen value
//   set by the server                      → next_url
//   rendered step with its own target      → params.action_url (OTP)

const providerChooser = (action, chosen) => ({
  action,
  values: { provider: chosen },
  structure: {
    provider: {
      type: "select",
      values: {
        "/vi/user/auth_userpassword/login": "Username & Password",
        "/vi/user/auth_googleaccount/login": "Google Account",
      },
    },
  },
  errors: [],
})

describe("v1SelectionFollow", () => {
  it("nimmt den gewählten Provider als Ziel (primäre Auswahl)", () => {
    const body = normalizeEnvelope(
      providerChooser("select_authentication_provider", "/vi/user/auth_userpassword/login")
    )
    expect(v1SelectionFollow(body)).toBe("/vi/user/auth_userpassword/login")
  })

  it("gilt genauso für die Auswahl des zweiten Faktors", () => {
    const body = normalizeEnvelope({
      action: "select_secondfactor_provider",
      values: { provider: "/vi/user/f2_timebasedotp/start" },
      structure: {
        provider: { type: "select", values: { "/vi/user/f2_timebasedotp/start": "Time based OTP" } },
      },
      errors: [],
    })
    expect(v1SelectionFollow(body)).toBe("/vi/user/f2_timebasedotp/start")
  })

  it("ignoriert Werte, die nicht zu den angebotenen Zielen gehören", () => {
    const body = normalizeEnvelope(providerChooser("select_authentication_provider", "/vi/user/fremd/login"))
    expect(v1SelectionFollow(body)).toBeNull()
  })

  it("ignoriert andere Schritte", () => {
    const body = normalizeEnvelope({
      action: "login",
      values: { name: "a@b.c", password: "" },
      structure: { name: { type: "str.email" } },
      errors: [],
    })
    expect(v1SelectionFollow(body)).toBeNull()
  })
})

describe("normalizeEnvelope — Ziel eines v1-Schritts", () => {
  it("übernimmt next_url als follow", () => {
    const out = normalizeEnvelope({
      action: "select_secondfactor_provider_success",
      values: {},
      structure: {},
      next_url: "/vi/user/f2_timebasedotp/start",
      errors: [],
    })
    expect(out.follow).toBe("/vi/user/f2_timebasedotp/start")
  })

  it("übernimmt params.action_url (OTP-Schritt kommt als edit)", () => {
    const out = normalizeEnvelope({
      action: "edit",
      values: { otptoken: "" },
      structure: { otptoken: { type: "str" } },
      params: { action_name: "TimeBasedOTP", action_url: "/vi/user/f2_timebasedotp/otp" },
      errors: [],
    })
    expect(out.follow).toBe("/vi/user/f2_timebasedotp/otp")
  })

  it("bevorzugt ein echtes follow vor den v1-Quellen", () => {
    const out = normalizeEnvelope({
      action: "edit",
      values: {},
      structure: {},
      follow: "/json/v2/user/auth_otp",
      next_url: "/vi/anders",
      params: { action_url: "/vi/noch_anders" },
      errors: [],
    })
    expect(out.follow).toBe("/json/v2/user/auth_otp")
  })
})
