import { describe, it, expect, beforeEach, vi } from "vitest"
import { reactive, isProxy } from "vue"
import { useFormUtils } from "../../src/forms/utils.js"

// Drives the multi-step / list form flow (ViForm gaps 1–3) through the REAL
// request layer with a mocked global fetch, asserting how the envelope is
// mapped onto form state by applyResponseState / loadStep / sendData.

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: (k) => (k === "content-type" ? "application/json" : null) },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    clone() {
      return this
    },
  }
}

// Minimal stand-in for ViForm's reactive state (only the fields the form utils
// read/write).
function makeState() {
  return reactive({
    skel: {},
    structure: {},
    errors: [],
    actionparams: {},
    actionname: null,
    valids: {},
    loading: false,
    categories: [],
    values: {},
    readonly: false,
    categoryDefaultname: "Allgemein",
    failed: null,
    viformelement: null, // list/headless mode → sendData skips reportValidity
    step: null,
    stepStatus: null,
    steps: null,
    status: null,
    postUrl: null,
    datatype: null,
    list: null,
    cursor: null,
    orders: [],
  })
}

function makeProps(overrides = {}) {
  return {
    module: "user",
    action: "login",
    renderer: "json",
    version: null,
    secure: false,
    group: null,
    skeltype: null,
    skelkey: null,
    bones: [],
    collapsedCategories: [],
    values: null,
    sendReadOnly: false,
    structure: null,
    params: {},
    fetchUrl: null,
    multistep: true,
    internal: null,
    ...overrides,
  }
}

const STEP1 = {
  version: 2,
  action: "login",
  status: "init",
  step: "userpassword",
  step_status: "init",
  steps: {
    userpassword: { icon: "person", icon_library: "default", label: "Login", url: "/json/v2/user/auth_userpassword" },
    otp: { icon: "shield", icon_library: "default", label: "OTP", url: "/json/v2/user/auth_otp" },
  },
  follow: "/json/v2/user/auth_userpassword",
  datatype: "entity",
  module: "user",
  structure: { name: { type: "str", visible: true }, password: { type: "password", visible: true } },
  data: {},
  errors: [],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("multi-step form flow", () => {
  it("loadStep GET-renders the entry step and maps step/steps/status/follow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(STEP1)))

    const state = makeState()
    const { loadStep } = useFormUtils(makeProps(), state)
    await loadStep()

    expect(state.datatype).toBe("entity")
    expect(state.step).toBe("userpassword")
    expect(state.stepStatus).toBe("init")
    expect(Object.keys(state.steps)).toEqual(["userpassword", "otp"])
    expect(state.status).toBe("init")
    expect(state.postUrl).toBe("/json/v2/user/auth_userpassword")
    // structure was applied → form built
    expect(Object.keys(state.structure)).toEqual(["name", "password"])
    expect(state.loading).toBe(false)
  })

  it("loadStep issues a GET (no skey) to the props-derived entry url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(STEP1))
    vi.stubGlobal("fetch", fetchMock)

    const state = makeState()
    const { loadStep } = useFormUtils(makeProps(), state)
    await loadStep()

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain("http://api.test/json/user/login")
    expect((options?.method ?? "GET").toUpperCase()).toBe("GET")
    // no skey batch fetched for a GET render
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/skey"))).toBe(false)
  })

  it("sendData advances the flow and surfaces status: success", async () => {
    const success = {
      version: 2,
      action: "login",
      status: "success",
      step: "otp",
      step_status: "success",
      follow: "/dashboard",
      datatype: "entity",
      module: "user",
      structure: STEP1.structure,
      data: { key: "user-1" },
      errors: [],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(success)))

    const state = makeState()
    // pre-seed as if a step is loaded
    state.structure = { name: { type: "str", visible: true } }
    state.skel = { name: "joe" }
    state.postUrl = "/json/v2/user/auth_userpassword"

    const { sendData } = useFormUtils(makeProps(), state)
    const fetchResult = await sendData(state.postUrl)

    expect(state.status).toBe("success")
    expect(state.postUrl).toBe("/dashboard")
    expect(fetchResult.data.value.status).toBe("success")
  })

  // #28: novalidate sends even if the browser reports e.g. an empty required bone
  it.each([
    [false, 0],
    [true, 1],
  ])("sendData with novalidate=%s sends an invalid form %i time(s)", async (novalidate, calls) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ...STEP1, errors: [] })))
    const state = makeState()
    state.structure = { name: { type: "str", visible: true } }
    state.viformelement = { reportValidity: () => false }

    const { sendData } = useFormUtils(makeProps({ novalidate }), state)
    await sendData("/json/v2/user/edit").catch(() => {})

    expect(fetch).toHaveBeenCalledTimes(calls)
  })

  it("loadStep passes through query params carried on the step url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(STEP1))
    vi.stubGlobal("fetch", fetchMock)

    const state = makeState()
    const { loadStep } = useFormUtils(makeProps(), state)
    await loadStep("/json/v2/user/auth_otp?token=xyz&foo=bar")

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("/json/v2/user/auth_otp")
    expect(url).toContain("token=xyz")
    expect(url).toContain("foo=bar")
  })

  it("re-applies form errors from a rejected step (status: rejected)", async () => {
    const rejected = {
      version: 2,
      action: "login",
      status: "rejected",
      step: "userpassword",
      step_status: "rejected",
      follow: "/json/v2/user/auth_userpassword",
      datatype: "entity",
      module: "user",
      structure: STEP1.structure,
      data: {},
      errors: [{ severity: 2, fieldPath: "password", errorMessage: "wrong" }],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(rejected)))

    const state = makeState()
    state.structure = { name: { type: "str", visible: true } }
    state.skel = {}
    state.postUrl = "/json/v2/user/auth_userpassword"

    const { sendData } = useFormUtils(makeProps(), state)
    await sendData(state.postUrl)

    expect(state.status).toBe("rejected")
    expect(state.errors).toHaveLength(1)
    // fieldPath always reaches the bones as a path list — the bone compares
    // fieldPath[0] with its name. Servers that (like viur-core's
    // userpassword login) send a bare string are resolved during
    // normalization.
    expect(state.errors[0].fieldPath).toEqual(["password"])
  })

  it("splits a dotted fieldPath string into segments", async () => {
    const rejected = {
      version: 2,
      action: "edit",
      status: "rejected",
      datatype: "entity",
      module: "user",
      structure: STEP1.structure,
      data: {},
      errors: [{ severity: 2, fieldPath: "address.0.street", errorMessage: "wrong" }],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(rejected)))

    const state = makeState()
    state.structure = { name: { type: "str", visible: true } }
    state.skel = {}
    state.postUrl = "/json/v2/user/edit"

    const { sendData } = useFormUtils(makeProps(), state)
    await sendData(state.postUrl)

    expect(state.errors[0].fieldPath).toEqual(["address", "0", "street"])
  })

  it("resetForm stellt den Server-Stand ohne neuen Request wieder her", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          action: "edit",
          values: { name: "Atlas" },
          structure: { name: { type: "str", visible: true } },
          errors: [],
        })
      )
    )

    const state = makeState()
    const { fetchData, resetForm } = useFormUtils(makeProps({ module: "appconf", action: "edit" }), state)
    await fetchData()
    expect(state.skel["name"]).toBe("Atlas")

    // user input
    state.skel["name"] = "geändert"
    const requests = vi.mocked(fetch).mock.calls.length

    resetForm()

    expect(state.skel["name"]).toBe("Atlas")
    expect(state.errors).toEqual([])
    // without another request
    expect(vi.mocked(fetch).mock.calls.length).toBe(requests)
  })

  it("baut die URL eines Singletons ohne Key (edit ohne skelkey)", async () => {
    // A singleton has exactly one entry; /<module>/edit takes no key.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ action: "edit", values: {}, structure: { name: { type: "str" } }, errors: [] })
        )
    )

    const state = makeState()
    const { fetchData } = useFormUtils(makeProps({ module: "appconf", action: "edit", skelkey: null }), state)
    await fetchData()

    const url = String(vi.mocked(fetch).mock.calls[0][0])
    expect(url).toContain("/appconf/edit")
    expect(url).not.toContain("undefined")
  })

  it("leaves an existing fieldPath list untouched", async () => {
    const rejected = {
      version: 2,
      action: "edit",
      status: "rejected",
      datatype: "entity",
      module: "user",
      structure: STEP1.structure,
      data: {},
      errors: [{ severity: 2, fieldPath: ["password"], errorMessage: "wrong" }],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(rejected)))

    const state = makeState()
    state.structure = { name: { type: "str", visible: true } }
    state.skel = {}
    state.postUrl = "/json/v2/user/edit"

    const { sendData } = useFormUtils(makeProps(), state)
    await sendData(state.postUrl)

    expect(state.errors[0].fieldPath).toEqual(["password"])
  })
})

describe("list envelope in the form", () => {
  it("exposes items/cursor/orders and builds no form for datatype: list", async () => {
    const listEnvelope = {
      version: 2,
      action: "list",
      status: "success",
      datatype: "list",
      module: "user",
      structure: null,
      data: [{ key: "a" }, { key: "b" }],
      meta: { cursor: "cur-1", orders: [{ field: "name", dir: "asc" }] },
      errors: [],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(listEnvelope)))

    const state = makeState()
    const { loadStep } = useFormUtils(makeProps(), state)
    await loadStep()

    expect(state.datatype).toBe("list")
    expect(state.list.map((e) => e.key)).toEqual(["a", "b"])
    expect(state.cursor).toBe("cur-1")
    expect(state.orders).toEqual([{ field: "name", dir: "asc" }])
    expect(state.structure).toEqual({}) // no form built from a null structure
  })
})

describe("Verhalten der Formularlogik", () => {
  const recordStructure = {
    title: { type: "str", languages: ["de", "en"], visible: true, params: {} },
    tags: { type: "str", multiple: true, visible: true, params: {} },
  }

  it("Unterformular mit reaktivem Wert (Record/using) baut sich auf", () => {
    // this is how BoneNestedWrapper passes the parent bone's value through
    const parentValue = reactive({ title: { de: "Hallo", en: "Hello" }, tags: ["a", "b"] })
    const state = makeState()
    const { reload, resetForm } = useFormUtils(
      makeProps({ multistep: false, skel: parentValue, structure: recordStructure }),
      state
    )

    reload()

    expect(Object.keys(state.categories).length).toBeGreaterThan(0)
    expect(state.loading).toBe(false)
    // the initial state is a real copy — no proxies, no shared value
    expect(isProxy(state.pristine.title)).toBe(false)
    expect(state.pristine.tags).not.toBe(parentValue.tags)

    state.skel.tags = ["geändert"]
    resetForm()
    expect(state.skel.tags).toEqual(["a", "b"])
  })

  it("die Antwort auf ein Absenden überschreibt der values-Prop nicht erneut", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          action: "edit",
          values: { name: "vom-benutzer" },
          structure: { name: { type: "str", visible: true, params: {} } },
          errors: [{ severity: 3, fieldPath: ["name"], errorMessage: "zu kurz" }],
        })
      )
    )
    const state = makeState()
    state.values = { name: "vorbelegt" } // the values prop
    state.structure = { name: { type: "str", visible: true, params: {} } }
    state.skel = { name: "vom-benutzer" }

    const { sendData } = useFormUtils(makeProps({ module: "appconf", action: "edit" }), state)
    await sendData()

    expect(state.skel.name).toBe("vom-benutzer")
  })

  it("beim Rendern eines Schritts belegt values weiterhin vor", async () => {
    const step = {
      action: "add",
      values: { name: "" },
      structure: { name: { type: "str", visible: true } },
      errors: [],
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(step)))
    const state = makeState()
    state.values = { name: "vorbelegt" }
    const { loadStep } = useFormUtils(makeProps(), state)
    await loadStep()

    expect(state.skel.name).toBe("vorbelegt")
  })

  it("visibleIf gilt nach dem Absenden sofort wieder (neue Struktur)", async () => {
    const structure = () => ({
      mode: { type: "str", visible: true, params: {} },
      detail: { type: "str", visible: true, params: { visibleIf: 'mode == "voll"' } },
    })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ action: "edit", values: { mode: "kurz", detail: "" }, structure: structure(), errors: [] })
        )
    )
    const state = makeState()
    state.structure = structure()
    state.skel = { mode: "kurz", detail: "" }

    const { sendData } = useFormUtils(makeProps({ module: "appconf", action: "edit" }), state)
    await sendData()

    // the server sends visible: true — the logic hides the bone
    expect(state.structure.detail.visible).toBe(false)
  })
})
