import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import { createApp, defineComponent, h } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { resetState } from "../../src/request/request.js"

// Only the start of the login is of interest here: which branch the screen
// renders after GET /user/login. The multistep form is stubbed: it shows the
// action it runs, and a click on it finishes that action.
// Its state is the one of the password form of viur-core 4, where "lost
// password" and the registration are offered.
vi.mock("../../src/forms/ViForm.vue", async () => {
  const { inject, reactive } = await import("vue")
  return {
    default: defineComponent({
      name: "ViForm",
      props: { action: { type: String, default: null } },
      emits: ["success"],
      setup(props, { emit, expose }) {
        const state = reactive({
          step: "password/login",
          postUrl: "/json/user/password/login",
          structure: { name: { type: "str.email" }, password: { type: "password" } },
          skel: {},
          errors: [],
        })
        expose({ state, loadStep: async () => null, submitStep: async () => null })
        // the links of the password form, as LoginPassword renders them below its submit
        const login = inject("viurLogin", null)
        return () => [
          h("div", { class: "viform-stub", "data-action": props.action, onClick: () => emit("success") }),
          ...(login?.passwordLinks ?? []).map((link) =>
            h("wa-button", { key: link.name, class: link.class, onClick: () => link.click() }, link.label)
          ),
        ]
      },
    }),
  }
})
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))
vi.mock("vue-router", () => ({ useRouter: () => undefined }))

const { default: LoginScreen } = await import("../../src/auth/LoginScreen.vue")

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

// a v2 answer without the classic provider choice: the multistep form takes over
const V2_LOGIN = { version: 2, action: "login", status: "init", structure: {}, data: {}, errors: [] }

// viur-core 4 always sends `steps` and `step_status` along
const VIUR4_LOGIN = { ...V2_LOGIN, step: null, step_status: null, steps: null, follow: null }

/** fetch stub: no session, no config; `/user/login` answers with `loginResponse()`. */
function stubFetch(loginResponse, configuration = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url) => {
      if (String(url).includes("/user/login")) return loginResponse()
      if (new URL(String(url)).pathname.endsWith("/config")) return jsonResponse({ configuration })
      return jsonResponse({}, 401)
    })
  )
}

let app = null
let el = null

function mountScreen(props = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  el = document.createElement("div")
  document.body.appendChild(el)
  app = createApp(LoginScreen, { googleClientId: false, ...props })
  app.use(pinia)
  app.mount(el)
  return el
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  await resetState()
})

afterEach(() => {
  window.history.replaceState(null, "", "/")
  app?.unmount()
  el?.remove()
  vi.unstubAllGlobals()
})

describe("LoginScreen start", () => {
  it("shows an error instead of an empty form when /user/login fails", async () => {
    stubFetch(() => jsonResponse({}, 403))
    const root = mountScreen()

    await vi.waitFor(() => expect(root.textContent).toContain("login.unavailable"))
    expect(root.querySelector(".viform-stub")).toBeNull()
  })

  it("loads the login again on retry", async () => {
    let fail = true
    stubFetch(() => (fail ? jsonResponse({}, 403) : jsonResponse(V2_LOGIN)))
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login__retry")).not.toBeNull())

    fail = false
    root.querySelector(".viur-login__retry").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector(".viform-stub")).not.toBeNull())
    expect(root.textContent).not.toContain("login.unavailable")
  })

  it("hands a v2 answer without provider choice to the multistep form", async () => {
    stubFetch(() => jsonResponse(V2_LOGIN))
    const root = mountScreen()

    await vi.waitFor(() => expect(root.querySelector(".viform-stub")).not.toBeNull())
    expect(root.textContent).not.toContain("login.unavailable")
  })
})

describe("LoginScreen password recovery (viur-core 4)", () => {
  const form = (root) => root.querySelector(".viform-stub")

  it("offers no recovery when /user/login is no viur-core 4 envelope", async () => {
    stubFetch(() => jsonResponse(V2_LOGIN))
    const root = mountScreen()

    await vi.waitFor(() => expect(form(root)).not.toBeNull())
    expect(root.querySelector(".viur-login__lost")).toBeNull()
  })

  it("runs password/recover in the multistep form and returns to the login", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login__lost")).not.toBeNull())
    expect(form(root).dataset.action).toBe("login")
    // detected from the answer that is loaded anyway: one request to /user/login
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("/user/login"))).toHaveLength(1)

    root.querySelector(".viur-login__lost").dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(form(root).dataset.action).toBe("password/recover"))
    expect(root.querySelector(".viur-login__back")).not.toBeNull()

    // the last step (recover_password) succeeded
    form(root).dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(form(root).dataset.action).toBe("login"))
    expect(root.textContent).toContain("login.recovery_done")
    expect(root.querySelector(".viur-login__lost")).not.toBeNull()
  })

  it("goes back to the login without finishing the recovery", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login__lost")).not.toBeNull())

    root.querySelector(".viur-login__lost").dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(root.querySelector(".viur-login__back")).not.toBeNull())
    root.querySelector(".viur-login__back").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(form(root).dataset.action).toBe("login"))
    expect(root.textContent).not.toContain("login.recovery_done")
  })

  it("continues the recovery at recover_code with the key from the mail link", async () => {
    window.history.replaceState(null, "", "/admin/?recovery_key=a%2Fb+c&lang=de#/login")
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen()

    await vi.waitFor(() => expect(form(root).dataset.action).toBe("password/recover_code?recovery_key=a%2Fb%20c"))
    // read once: gone from the url, the rest of it stays
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/admin/?lang=de#/login")

    form(root).dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(form(root).dataset.action).toBe("login"))
    expect(root.textContent).toContain("login.recovery_done")

    // a new recovery starts at the beginning again
    root.querySelector(".viur-login__lost").dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(form(root).dataset.action).toBe("password/recover"))
  })

  it("takes the key from the recoveryKey prop", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen({ recoveryKey: "k1" })

    await vi.waitFor(() => expect(form(root).dataset.action).toBe("password/recover_code?recovery_key=k1"))
  })

  it("leaves a recovery_key in the url alone without viur-core 4", async () => {
    window.history.replaceState(null, "", "/?recovery_key=k1")
    stubFetch(() => jsonResponse(V2_LOGIN))
    const root = mountScreen()

    await vi.waitFor(() => expect(form(root)).not.toBeNull())
    expect(form(root).dataset.action).toBe("login")
    expect(window.location.search).toBe("?recovery_key=k1")
  })

  it("hides the recovery with lostPassword false", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen({ lostPassword: false })

    await vi.waitFor(() => expect(form(root)).not.toBeNull())
    expect(root.querySelector(".viur-login__lost")).toBeNull()
  })
})

describe("LoginScreen registration (viur-core 4)", () => {
  const form = (root) => root.querySelector(".viform-stub")
  const REGISTRATION = { "admin.user.registration": true }

  it("offers no registration unless the server enables it", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen()

    await vi.waitFor(() => expect(root.querySelector(".viur-login__lost")).not.toBeNull())
    expect(root.querySelector(".viur-login__register")).toBeNull()
  })

  it("offers no registration without viur-core 4", async () => {
    stubFetch(() => jsonResponse(V2_LOGIN), REGISTRATION)
    const root = mountScreen()

    await vi.waitFor(() => expect(form(root)).not.toBeNull())
    expect(root.querySelector(".viur-login__register")).toBeNull()
  })

  it("runs password/register in the multistep form and returns to the login", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN), REGISTRATION)
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login__register")).not.toBeNull())

    root.querySelector(".viur-login__register").dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(form(root).dataset.action).toBe("password/register"))
    expect(root.querySelector(".viur-login__lost")).toBeNull()
    expect(root.querySelector(".viur-login__register")).toBeNull()

    // registered (and verified)
    form(root).dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(form(root).dataset.action).toBe("login"))
    expect(root.textContent).toContain("login.register_done")
    expect(root.querySelector(".viur-login__register")).not.toBeNull()
  })

  it("never offers the registration with register false", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN), REGISTRATION)
    const root = mountScreen({ register: false })

    await vi.waitFor(() => expect(root.querySelector(".viur-login__lost")).not.toBeNull())
    expect(root.querySelector(".viur-login__register")).toBeNull()
  })

  it("continues the registration at register_verify with the code from the mail link", async () => {
    window.history.replaceState(null, "", "/?verification_key=v%201&lang=de")
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen()

    await vi.waitFor(() => expect(form(root).dataset.action).toBe("password/register_verify?verification_key=v%201"))
    expect(window.location.search).toBe("?lang=de")

    form(root).dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(root.textContent).toContain("login.register_done"))
  })

  it("takes the code from the verificationKey prop", async () => {
    stubFetch(() => jsonResponse(VIUR4_LOGIN))
    const root = mountScreen({ verificationKey: "v2" })

    await vi.waitFor(() => expect(form(root).dataset.action).toBe("password/register_verify?verification_key=v2"))
  })
})
