import { describe, it, expect, beforeEach, vi } from "vitest"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import { setActivePinia, createPinia } from "pinia"
import { useUserStore } from "../../src/user/store.js"
import { resetState } from "../../src/request/request.js"
import { useConfigStore } from "../../src/request/configStore.js"

// The store imports resetState via the request index - wrap it in a spy that still runs the real one.
const { resetStateSpy } = vi.hoisted(() => ({ resetStateSpy: vi.fn() }))
vi.mock("../../src/request/index.js", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resetState: (...args) => {
      resetStateSpy(...args)
      return actual.resetState(...args)
    },
  }
})

// The user store owns the SESSION + Google sign-in. The multi-step login FLOW
// itself is driven by <ViForm multistep> (its engine is covered by
// tests/forms/formFlow.test.js). These tests hit the REAL request layer
// (createControllerFetch + normalizeEnvelope + skey batching) via a mocked
// global fetch, using v2-envelope responses.

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

const USER = {
  key: "u1",
  name: "ada@example.com",
  firstname: "Ada",
  lastname: "Lovelace",
  access: ["root", "user-view"],
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  setActivePinia(createPinia())
  await resetState()
  vi.restoreAllMocks()
  resetStateSpy.mockClear()
})

describe("session", () => {
  it("fetchSelf populates the user and derives access getters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ version: 2, action: "view", status: "success", data: USER, errors: [] }))
    )
    const store = useUserStore()
    await store.fetchSelf()

    expect(store.isLoggedIn).toBe(true)
    expect(store.state.user.name).toBe("ada@example.com")
    expect(store.isRoot).toBe(true)
    expect(store.isAdmin).toBe(true)
    expect(store.hasAccess("user-view")).toBe(true)
    expect(store.hasAccess("anything")).toBe(true) // root ⇒ all rights
    expect(store.shortName).toBe("A. Lovelace")
  })

  it("fetchSelf treats 401 as anonymous", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)))
    const store = useUserStore()
    await store.fetchSelf()

    expect(store.state.status).toBe("anonymous")
    expect(store.isLoggedIn).toBe(false)
    expect(store.access).toEqual([])
  })

  it("still consumes a classic v1 self response (values → data)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ action: "view", values: USER, structure: {}, errors: [] }))
    )
    const store = useUserStore()
    await store.fetchSelf()

    expect(store.isLoggedIn).toBe(true)
    expect(store.state.user.name).toBe("ada@example.com")
  })

  it("non-root user only has explicitly granted rights", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ version: 2, status: "success", data: { ...USER, access: ["user-view"] }, errors: [] })
        )
    )
    const store = useUserStore()
    await store.fetchSelf()

    expect(store.isRoot).toBe(false)
    expect(store.isAdmin).toBe(false)
    expect(store.hasAccess("user-view")).toBe(true)
    expect(store.hasAccess("user-edit")).toBe(false)
  })
})

describe("google sign-in", () => {
  it("posts the id-token and loads the session on success", async () => {
    let loggedIn = false
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, opts) => {
        const method = (opts?.method || "GET").toUpperCase()
        if (url.includes("/skey")) return jsonResponse(["sk1"])
        if (url.includes("/user/view/self"))
          return loggedIn
            ? jsonResponse({ version: 2, status: "success", data: USER, errors: [] })
            : jsonResponse({}, 401)
        if (url.includes("/auth_googleaccount/login") && method === "POST") {
          loggedIn = true
          return jsonResponse({ version: 2, action: "login", status: "success", data: {}, errors: [] })
        }
        return jsonResponse({}, 404)
      })
    )
    const store = useUserStore()
    const body = await store.loginWithGoogle("id-token")

    expect(body.status).toBe("success")
    expect(store.isLoggedIn).toBe(true)
    expect(store.state.user.name).toBe("ada@example.com")
  })

  it("posts the token to the configured endpoint (viur-core 4: google/one_tap)", async () => {
    let loggedIn = false
    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      const method = (opts?.method || "GET").toUpperCase()
      if (url.includes("/skey")) return jsonResponse(["sk1"])
      if (url.includes("/user/view/self"))
        return loggedIn
          ? jsonResponse({ version: 2, status: "success", data: USER, errors: [] })
          : jsonResponse({}, 401)
      if (url.includes("/json/user/google/one_tap") && method === "POST") {
        loggedIn = true
        return jsonResponse({ version: 2, action: "login_success", status: "success", data: {}, errors: [] })
      }
      return jsonResponse({}, 404)
    })
    vi.stubGlobal("fetch", fetchMock)
    const store = useUserStore()
    store.configure({ googleLoginEndpoint: "google/one_tap" })

    const body = await store.loginWithGoogle("id-token")

    expect(body.status).toBe("success")
    expect(store.isLoggedIn).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/auth_googleaccount/"))).toBe(false)
  })

  it("returns a follow for a second-factor handoff without logging in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, opts) => {
        const method = (opts?.method || "GET").toUpperCase()
        if (url.includes("/skey")) return jsonResponse(["sk1"])
        if (url.includes("/auth_googleaccount/login") && method === "POST")
          return jsonResponse({
            version: 2,
            action: "login",
            status: "continue",
            follow: "/json/v2/user/auth_otp",
            errors: [],
          })
        return jsonResponse({}, 404)
      })
    )
    const store = useUserStore()
    const body = await store.loginWithGoogle("id-token")

    expect(body.status).toBe("continue")
    expect(body.follow).toBe("/json/v2/user/auth_otp")
    expect(store.isLoggedIn).toBe(false)
  })

  it("returns null on a transport error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk1"])
        return jsonResponse({}, 500)
      })
    )
    const store = useUserStore()
    const body = await store.loginWithGoogle("id-token")

    expect(body).toBeNull()
    expect(store.isLoggedIn).toBe(false)
  })
})

// viur-core 3.9 answers the login chain in the classic v1 shape; the login
// screen walks it step by step through these requests.
const CHOOSER = {
  action: "select_authentication_provider",
  values: { provider: "/json/user/auth_userpassword/login" },
  structure: {
    provider: {
      type: "select",
      required: true,
      values: {
        "/json/user/auth_userpassword/login": "Username & Password",
        "/json/user/auth_googleaccount/login": "Google Account",
      },
    },
  },
  errors: [],
  next_url: null,
  params: {},
}

describe("classic login chain (viur-core 3.9)", () => {
  it("loadLoginStep GET-renders /user/login without an skey", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CHOOSER))
    vi.stubGlobal("fetch", fetchMock)
    const store = useUserStore()
    const body = await store.loadLoginStep()

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("http://api.test/json/user/login")
    expect((options?.method ?? "GET").toUpperCase()).toBe("GET")
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/skey"))).toBe(false)
    // the classic action survives the normalization — the screen detects the chain by it
    expect(body.action).toBe("select_authentication_provider")
    expect(Object.keys(body.structure.provider.values)).toHaveLength(2)
  })

  it("loadLoginStep takes a server url as it is (second factor start)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        action: "edit",
        values: { otptoken: null },
        structure: { otptoken: { type: "numeric", required: true } },
        errors: [],
        next_url: null,
        params: { action_name: "otp", action_url: "/json/user/f2_timebasedotp/otp" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const store = useUserStore()
    const body = await store.loadLoginStep("/json/user/f2_timebasedotp/start")

    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/json/user/f2_timebasedotp/start")
    expect(body.params.action_url).toBe("/json/user/f2_timebasedotp/otp")
    expect(body.data).toEqual({ otptoken: null })
  })

  it("loadLoginStep rejects on a transport error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    const store = useUserStore()

    await expect(store.loadLoginStep()).rejects.toBeTruthy()
  })

  it("selectAuthenticationProvider posts the choice with an skey", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk1"])
      return jsonResponse({
        ...CHOOSER,
        action: "select_authentication_provider_success",
        values: { provider: "/json/user/auth_sso/login" },
        next_url: "/json/user/auth_sso/login",
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const store = useUserStore()
    const body = await store.selectAuthenticationProvider("/json/user/auth_sso/login")

    const [url, options] = fetchMock.mock.calls.find(([u]) => !String(u).includes("/skey"))
    expect(url).toBe("http://api.test/json/user/select_authentication_provider")
    expect(options.method).toBe("POST")
    expect(options.body.get("provider")).toBe("/json/user/auth_sso/login")
    expect(options.body.get("skey")).toBe("sk1")
    expect(body.next_url).toBe("/json/user/auth_sso/login")
  })

  it("loginWithGoogle loads the session on a classic login_success", async () => {
    let loggedIn = false
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, opts) => {
        const method = (opts?.method || "GET").toUpperCase()
        if (url.includes("/skey")) return jsonResponse(["sk1"])
        if (url.includes("/user/view/self"))
          return loggedIn ? jsonResponse({ action: "view", values: USER, errors: [] }) : jsonResponse({}, 401)
        if (url.includes("/auth_googleaccount/login") && method === "POST") {
          loggedIn = true
          return jsonResponse({ action: "login_success", values: USER, structure: {}, errors: [], next_url: null })
        }
        return jsonResponse({}, 404)
      })
    )
    const store = useUserStore()
    const body = await store.loginWithGoogle("id-token")

    expect(body.action).toBe("login_success")
    expect(store.isLoggedIn).toBe(true)
  })
})

describe("logout", () => {
  it("clears the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk1"])
        if (url.includes("/user/logout"))
          return jsonResponse({ version: 2, action: "logout", status: "success", errors: [] })
        return jsonResponse({}, 404)
      })
    )
    const store = useUserStore()
    store.state.user = { ...USER }
    store.state.status = "authenticated"

    await store.logout()

    expect(store.state.user).toBeNull()
    expect(store.state.status).toBe("anonymous")
    expect(store.isLoggedIn).toBe(false)
    expect(resetStateSpy).toHaveBeenCalledOnce()
  })

  it("drops the admin config of the old session and reloads the public one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk1"])
        if (url.includes("/user/logout"))
          return jsonResponse({ version: 2, action: "logout", status: "success", errors: [] })
        if (url.endsWith("/config")) return jsonResponse({ configuration: { public: true } })
        return jsonResponse({}, 404)
      })
    )
    const config = useConfigStore()
    config.state.modules = { order: {} }
    config.state.status = "admin"
    config.state.access = ["root"]
    const store = useUserStore()
    store.state.user = { ...USER }

    await store.logout()

    expect(config.state.modules).toBeNull()
    expect(config.state.access).toEqual([])
    expect(config.state.status).toBe("public")
    expect(config.state.configuration).toEqual({ public: true })
  })

  it("drops skeys and request cache even when the logout request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk1"])
        if (url.includes("/user/logout")) return jsonResponse({}, 500)
        return jsonResponse({}, 404)
      })
    )
    const store = useUserStore()
    store.state.user = { ...USER }
    store.state.status = "authenticated"

    await store.logout()

    expect(store.state.user).toBeNull()
    expect(store.state.status).toBe("anonymous")
    expect(resetStateSpy).toHaveBeenCalledOnce()
  })
})
