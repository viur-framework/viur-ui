import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import { createApp } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { resetState } from "../../src/request/request.js"

// The login of viur-core 4 with the real ViForm: the LoginLayout renders the
// choice of the login method from the answer of the action "login".
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))
vi.mock("vue-router", () => ({ useRouter: () => undefined }))

// Google Identity Services: the test signs in through the callback of the rendered button
let googleCallback = null
vi.mock("../../src/auth/google.js", () => ({
  renderGoogleButton: vi.fn(async (el, clientId, onCredential) => {
    googleCallback = onCredential
    el?.setAttribute("data-gsi", clientId)
  }),
}))

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

// envelopes as viur-core 4 sends them
const envelope = (extra) => ({
  version: 2,
  action: "login",
  status: "init",
  step: null,
  step_status: null,
  steps: null,
  follow: null,
  datatype: "entity",
  module: "user",
  structure: null,
  data: null,
  errors: [],
  ...extra,
})
const METHODS = {
  "/json/user/password/login": "Username & Password",
  "/json/user/google/login": "Google",
  "/json/user/passkey/login": "Passkey",
}
const choice = (values, extra = {}) =>
  envelope({
    step: "login",
    structure: { provider: { type: "select", visible: true, required: true, values, params: {} } },
    data: { provider: Object.keys(values)[0] },
    ...extra,
  })
const PASSWORD_FORM = envelope({
  step: "password/login",
  step_status: "init",
  steps: { "password/login": { label: "Password", url: "/json/user/password/login" } },
  follow: "/json/user/password/login",
  structure: {
    name: { type: "str.email", visible: true, params: {}, descr: "E-Mail" },
    password: { type: "password", visible: true, params: {}, descr: "Password" },
  },
  data: { name: null, password: null },
})
// as viur-core 4 answers GET /json/user/passkey/login
const PASSKEY_CHALLENGE = envelope({
  status: "continue",
  step: "passkey/login",
  steps: { "passkey/login": { label: "Passkey", url: "/json/user/passkey/login" } },
  follow: "/json/user/passkey/login",
  data: { state: "s1", options: { challenge: "AAEC", rpId: "localhost", userVerification: "required" } },
})
// an OAuth method answers its start without a form: on to the provider
const OAUTH_START = envelope({ status: "continue", step: "google/login", follow: "https://accounts.example/auth" })
const SUCCESS = envelope({ status: "success", step: "login_success" })
// as viur-core 4 answers GET /json/user/passkeys/add: the options of a new passkey, no structure
const PASSKEY_ADD_OPTIONS = envelope({
  action: "add",
  status: "continue",
  step: "passkeys/add",
  follow: "/json/user/passkeys/add",
  data: {
    state: "s-add",
    name: "",
    options: {
      challenge: "AAEC",
      rp: { id: "localhost", name: "Demo" },
      user: { id: "AQID", name: "alice", displayName: "alice" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      excludeCredentials: [{ type: "public-key", id: "BA" }],
    },
  },
})
// several second factors after the password: viur-core renders the choice right in the answer
const SECOND_FACTORS = {
  "/json/user/authenticator/start": "Authenticator App",
  "/json/user/passkey_2fa/start": "Passkey",
}
const SELECT_SECOND_FACTOR = envelope({
  status: "continue",
  step_status: "init",
  step: "select_secondfactor",
  follow: "/json/user/select_secondfactor",
  structure: { provider: { type: "select", visible: true, required: true, values: SECOND_FACTORS, params: {} } },
  data: { provider: null },
})
const OTP_FORM = envelope({
  status: "continue",
  step_status: "init",
  step: "authenticator/start",
  follow: "/json/user/authenticator/verify",
  structure: { otptoken: { type: "str", visible: true, params: {}, descr: "Code" } },
  data: { otptoken: null },
})
const REJECTED = (field) =>
  envelope({
    status: "rejected",
    step: "passkey/login",
    errors: [{ severity: 3, errorMessage: "Not verified", fieldPath: [field], invalidatedFields: null }],
  })

// register_verify and register_resend: both report the step register_verify
const REGISTER_STEPS = {
  "password/register": { label: "Account", url: "/json/user/password/register" },
  "password/register_verify": { label: "Verify e-mail", url: "/json/user/password/register_verify" },
}
const REGISTER_VERIFY_FORM = envelope({
  action: "register",
  step: "password/register_verify",
  steps: REGISTER_STEPS,
  structure: { verification_key: { type: "str", visible: true, params: {}, descr: "Code" } },
  data: { verification_key: "abc" },
})
const REGISTER_RESEND_FORM = envelope({
  action: "register",
  step: "password/register_verify",
  steps: REGISTER_STEPS,
  structure: { name: { type: "str.email", visible: true, params: {}, descr: "E-Mail" } },
  data: { name: null },
})

let login = null
let requests = []
let posts = []
// answers of POSTs by path (default: success)
let postAnswers = {}
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url, init = {}) => {
      const path = new URL(String(url), window.location.origin).pathname
      requests.push(path)
      if (path.endsWith("/skey")) return jsonResponse("skey-1")
      if (init.method === "POST") {
        const body = init.body instanceof FormData ? init.body : new URLSearchParams(String(init.body ?? ""))
        posts.push({ path, body: Object.fromEntries(body) })
        const answer = postAnswers[path] ?? SUCCESS
        // { httpStatus, body }: an error answer of viur-core
        return answer.httpStatus ? jsonResponse(answer.body, answer.httpStatus) : jsonResponse(answer)
      }
      if (path === "/json/user/login") return jsonResponse(login)
      if (path === "/json/user/password/login") return jsonResponse(PASSWORD_FORM)
      if (path === "/json/user/passkey/login") return jsonResponse(PASSKEY_CHALLENGE)
      if (path === "/json/user/google/login") return jsonResponse(OAUTH_START)
      if (path === "/json/user/authenticator/start") return jsonResponse(OTP_FORM)
      if (path === "/json/user/passkeys/add") return jsonResponse(PASSKEY_ADD_OPTIONS)
      if (path === "/json/user/password/register_verify") return jsonResponse(REGISTER_VERIFY_FORM)
      if (path === "/json/user/password/register_resend") return jsonResponse(REGISTER_RESEND_FORM)
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
  app.config.globalProperties.$t = (key) => key
  app.config.globalProperties.$te = () => false
  app.mount(el)
  return el
}

const methodButtons = (root) => [...root.querySelectorAll(".viur-login-methods wa-button")]

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  await resetState()
  requests = []
  posts = []
  postAnswers = {}
  googleCallback = null
  stubFetch()
})

afterEach(() => {
  window.history.replaceState(null, "", "/")
  app?.unmount()
  el?.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("LoginScreen viur-core 4: choice of the login method", () => {
  it("opens the password form right away and offers the other methods below it", async () => {
    login = choice(METHODS)
    const root = mountScreen()

    await vi.waitFor(() => expect(root.querySelector(".viur-login-password")).not.toBeNull())
    expect(requests).toContain("/json/user/password/login")
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(2))
    expect(methodButtons(root).map((b) => b.textContent.trim())).toEqual(["Google", "Passkey"])
    // its own submit instead of the form's action bar; the others are listed, no "other method"
    expect(root.querySelector(".viur-login-password__submit")).not.toBeNull()
    expect(root.querySelector(".viform-actions")).toBeNull()
    expect(root.querySelector(".viur-login__methods")).toBeNull()
    expect(root.querySelector(".viur-login__lost")).not.toBeNull()
  })

  it("signs in with the password form, by its button and by Enter", async () => {
    login = choice(METHODS)
    const onSuccess = vi.fn()
    const root = mountScreen({ onSuccess })
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password__submit")).not.toBeNull())

    root.querySelector(".viur-login-password__submit").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    const post = posts.find((p) => p.path === "/json/user/password/login")
    expect(Object.keys(post.body)).toEqual(expect.arrayContaining(["name", "password"]))
  })

  it("submits the password form on Enter", async () => {
    login = choice(METHODS)
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password wa-input")).not.toBeNull())

    root
      .querySelector(".viur-login-password wa-input")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    await vi.waitFor(() => expect(posts.map((p) => p.path)).toContain("/json/user/password/login"))
  })

  it("loads another method from the password form and goes back to it", async () => {
    login = choice(METHODS)
    const root = mountScreen()
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(2))

    root.querySelector('[data-provider="passkey"]').dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector("[data-passkey-start]")).not.toBeNull())
    expect(root.querySelector(".viur-login-password")).toBeNull()
    expect(root.querySelector(".viur-login__methods")).not.toBeNull()

    root.querySelector(".viur-login__methods").dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password")).not.toBeNull())
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(2))
  })

  it("runs a method without a form of its own on the backend's page", async () => {
    login = choice(METHODS)
    const assign = vi.fn()
    vi.spyOn(window.location, "assign").mockImplementation(assign)
    const root = mountScreen()
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(2))

    root.querySelector('[data-provider="google"]').dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1))
    const target = new URL(assign.mock.calls[0][0], "http://backend")
    expect(target.pathname).toBe("/user/login")
    expect(target.searchParams.get("provider")).toBe("/user/google/login")
  })

  it("follows the server to the only method", async () => {
    login = choice(
      { "/json/user/password/login": "Username & Password" },
      { status: "continue", follow: "/json/user/password/login" }
    )
    const root = mountScreen()

    await vi.waitFor(() => expect(requests).toContain("/json/user/password/login"))
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password")).not.toBeNull())
    expect(methodButtons(root)).toHaveLength(0)
    // nothing else to choose
    expect(root.querySelector(".viur-login__methods")).toBeNull()
  })
})

describe("LoginScreen viur-core 4: registration code", () => {
  it("offers a new code at register_verify, but not on the form that sends it", async () => {
    login = choice(METHODS)
    window.history.replaceState(null, "", "/?verification_key=abc")
    const root = mountScreen()

    await vi.waitFor(() => expect(requests).toContain("/json/user/password/register_verify"))
    await vi.waitFor(() => expect(root.querySelector(".viur-login__resend")).not.toBeNull())
    expect(methodButtons(root)).toHaveLength(0)

    root.querySelector(".viur-login__resend").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(requests).toContain("/json/user/password/register_resend"))
    await vi.waitFor(() => expect(root.querySelector(".viur-login__resend")).toBeNull())

    // back to the login: the password form with the other methods again
    root.querySelector(".viur-login__back").dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(2))
  })
})

describe("LoginLayout with useLoginMethods in an app of its own", () => {
  // a ViForm of the app, like the login demo: the package exports the layout and the composable
  async function mountForm(options = {}) {
    const { h, ref } = await import("vue")
    const { LoginLayout, useLoginMethods } = await import("../../index.js")
    const { default: ViForm } = await import("../../src/forms/ViForm.vue")
    const pinia = createPinia()
    setActivePinia(pinia)
    el = document.createElement("div")
    document.body.appendChild(el)
    app = createApp({
      setup() {
        const form = ref(null)
        const { otherMethods, showMethods } = useLoginMethods(form, options)
        return () => [
          h(ViForm, { ref: form, module: "user", action: "login", layout: LoginLayout, multistep: true }),
          otherMethods.value ? h("button", { class: "other", onClick: showMethods }, "other") : null,
        ]
      },
    })
    app.use(pinia)
    app.config.globalProperties.$t = (key) => key
    app.config.globalProperties.$te = () => false
    app.mount(el)
    return el
  }

  it("chooses a method and goes back to the choice (no direct method)", async () => {
    login = choice(METHODS)
    const root = await mountForm({ directMethod: null })
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(3))
    expect(requests).not.toContain("/json/user/password/login")

    root.querySelector('[data-provider="passkey"]').dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector("[data-passkey-start]")).not.toBeNull())
    expect(requests).toContain("/json/user/passkey/login")

    root.querySelector(".other").dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(3))
  })
})

describe("LoginScreen viur-core 4: passkey and Google in the layout", () => {
  function stubPasskey(get) {
    vi.stubGlobal("PublicKeyCredential", function () {})
    Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true })
  }
  const assertion = {
    id: "cred-1",
    rawId: new Uint8Array([1, 2]).buffer,
    type: "public-key",
    getClientExtensionResults: () => ({}),
    response: {
      clientDataJSON: new Uint8Array([3]).buffer,
      authenticatorData: new Uint8Array([4]).buffer,
      signature: new Uint8Array([5]).buffer,
      userHandle: null,
    },
  }

  async function openPasskey(root) {
    await vi.waitFor(() => expect(methodButtons(root)).toHaveLength(2))
    root.querySelector('[data-provider="passkey"]').dispatchEvent(new Event("click"))
    await vi.waitFor(() => expect(root.querySelector("[data-passkey-start]")).not.toBeNull())
  }

  it("asks the browser for the passkey and posts its assertion", async () => {
    login = choice(METHODS)
    const get = vi.fn().mockResolvedValue(assertion)
    stubPasskey(get)
    const onSuccess = vi.fn()
    const root = mountScreen({ onSuccess })
    await openPasskey(root)
    expect(root.querySelector(".viform-actions")).toBeNull()

    root.querySelector("[data-passkey-start]").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(posts.some((post) => post.path === "/json/user/passkey/login")).toBe(true))
    const body = posts.find((post) => post.path === "/json/user/passkey/login").body
    expect(body.state).toBe("s1")
    expect(JSON.parse(body.credential)).toMatchObject({ id: "cred-1", rawId: "AQI", type: "public-key" })
    expect(body).not.toHaveProperty("provider")
    // the options of the server as ArrayBuffers
    expect(get.mock.calls[0][0].publicKey.challenge).toBeInstanceOf(ArrayBuffer)
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("shows a rejection and a new challenge", async () => {
    login = choice(METHODS)
    stubPasskey(vi.fn().mockResolvedValue(assertion))
    postAnswers["/json/user/passkey/login"] = REJECTED("credential")
    const root = mountScreen()
    await openPasskey(root)
    const loads = requests.filter((path) => path === "/json/user/passkey/login").length

    root.querySelector("[data-passkey-start]").dispatchEvent(new Event("click"))

    await vi.waitFor(() =>
      expect(root.querySelector(".viur-login-passkey wa-callout")?.textContent).toContain("Not verified")
    )
    expect(root.querySelector("[data-passkey-start]")).not.toBeNull()
    expect(requests.filter((path) => path === "/json/user/passkey/login").length).toBeGreaterThan(loads + 1)
  })

  it("stays on the passkey when the browser gets none", async () => {
    login = choice(METHODS)
    stubPasskey(vi.fn().mockRejectedValue(new DOMException("cancelled", "NotAllowedError")))
    const root = mountScreen()
    await openPasskey(root)

    root.querySelector("[data-passkey-start]").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector(".viur-login-passkey wa-callout")).not.toBeNull())
    expect(root.querySelector(".viur-login-passkey wa-callout").textContent).toContain("login.passkey_cancelled")
    expect(posts).toHaveLength(0)
  })

  it("shows Google One Tap among the methods and signs in with its token", async () => {
    login = choice(METHODS)
    const onSuccess = vi.fn()
    const root = mountScreen({ googleClientId: "client-1", onSuccess })

    await vi.waitFor(() => expect(root.querySelector('[data-gsi="client-1"]')).not.toBeNull())
    // below the password form: One Tap in place of the Google redirect
    expect(methodButtons(root).map((b) => b.dataset.provider)).toEqual(["passkey"])
    // no second Google button beside the form
    expect(root.querySelector(".viur-login__google")).toBeNull()

    await googleCallback("id-token")

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
    const post = posts.find((p) => p.path === "/json/user/google/one_tap")
    expect(post.body.token).toBe("id-token")
    expect(post.body).not.toHaveProperty("provider")
  })

  it("comes back to the password form with the message of a rejected token", async () => {
    login = choice(METHODS)
    postAnswers["/json/user/google/one_tap"] = REJECTED("token")
    const root = mountScreen({ googleClientId: "client-1" })
    await vi.waitFor(() => expect(root.querySelector('[data-gsi="client-1"]')).not.toBeNull())

    await googleCallback("bad-token")

    await vi.waitFor(() =>
      expect(root.querySelector(".viur-login-password wa-callout")?.textContent).toContain("Not verified")
    )
    expect(methodButtons(root)).toHaveLength(1)
  })
})

describe("LoginScreen viur-core 4: second factor and the links of the password", () => {
  it("offers the second factors as buttons and posts the choice", async () => {
    login = choice(METHODS)
    postAnswers["/json/user/password/login"] = SELECT_SECOND_FACTOR
    postAnswers["/json/user/select_secondfactor"] = envelope({
      status: "continue",
      step: "select_secondfactor",
      follow: "/json/user/authenticator/start",
    })
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password__submit")).not.toBeNull())

    root.querySelector(".viur-login-password__submit").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector(".viur-login-second-factor")).not.toBeNull())
    expect(methodButtons(root).map((b) => b.textContent.trim())).toEqual(["Authenticator App", "Passkey"])
    expect(root.querySelector(".viform-actions")).toBeNull()
    // not the password's links at the second factor
    expect(root.querySelector(".viur-login__lost")).toBeNull()
    expect(root.querySelector(".viur-login__register")).toBeNull()

    root.querySelector('[data-provider="authenticator"]').dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(requests).toContain("/json/user/authenticator/start"))
    const post = posts.find((p) => p.path === "/json/user/select_secondfactor")
    expect(post.body.provider).toBe("/json/user/authenticator/start")
    // only the choice, not the bones of the form
    expect(post.body).not.toHaveProperty("password")
    await vi.waitFor(() => expect(root.querySelector(".viur-login-second-factor")).toBeNull())
  })

  it("shows the password's links at the password form only", async () => {
    login = choice(METHODS)
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password")).not.toBeNull())
    await vi.waitFor(() => expect(root.querySelector(".viur-login__lost")).not.toBeNull())

    root.querySelector('[data-provider="passkey"]').dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector("[data-passkey-start]")).not.toBeNull())
    expect(root.querySelector(".viur-login__lost")).toBeNull()
  })
})

describe("LoginScreen viur-core 4: no second factor set up", () => {
  it("keeps the password form and shows the server's reason", async () => {
    login = choice(METHODS)
    postAnswers["/json/user/password/login"] = {
      httpStatus: 406,
      body: {
        status: 406,
        title: "Not Acceptable",
        descr: "You cannot be signed in, as no second factor is set up for your account.",
      },
    }
    const onSuccess = vi.fn()
    const root = mountScreen({ onSuccess })
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password__submit")).not.toBeNull())

    root.querySelector(".viur-login-password__submit").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.textContent).toContain("no second factor is set up"))
    expect(root.querySelector(".viur-login-password")).not.toBeNull()
    expect(root.querySelector(".viur-login-password__submit")).not.toBeNull()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

describe("LoginScreen viur-core 4: one-time codes in their own layout", () => {
  const codeStep = (otptoken, follow) =>
    envelope({
      status: "continue",
      step_status: "init",
      step: "authenticator/start",
      follow,
      structure: { otptoken: { visible: true, required: true, params: {}, descr: "Code", ...otptoken } },
      data: { otptoken: null },
    })

  it("asks for the code of the app in a wa-otp-input and submits it once complete", async () => {
    login = choice(METHODS)
    postAnswers["/json/user/password/login"] = codeStep(
      { type: "numeric", max: 999999 },
      "/json/user/authenticator/otp"
    )
    const onSuccess = vi.fn()
    const root = mountScreen({ onSuccess })
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password__submit")).not.toBeNull())
    root.querySelector(".viur-login-password__submit").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector(".viur-otp-form wa-otp-input")).not.toBeNull())
    const input = root.querySelector(".viur-otp-form wa-otp-input")
    // not defined in jsdom: Vue sets attributes instead of properties
    expect(input.getAttribute("length")).toBe("6")
    expect(input.getAttribute("type")).toBe("numeric")
    expect(input.getAttribute("autocomplete")).toBe("one-time-code")

    input.value = "123456"
    input.dispatchEvent(new Event("wa-complete", { cancelable: true }))

    await vi.waitFor(() => expect(posts.map((p) => p.path)).toContain("/json/user/authenticator/otp"))
    expect(posts.find((p) => p.path === "/json/user/authenticator/otp").body.otptoken).toBe("123456")
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("takes a recovery code in its format", async () => {
    login = choice(METHODS)
    postAnswers["/json/user/password/login"] = codeStep({ type: "str" }, "/json/user/recovery/otp")
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viur-login-password__submit")).not.toBeNull())
    root.querySelector(".viur-login-password__submit").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(root.querySelector(".viur-otp-form wa-otp-input")).not.toBeNull())
    const input = root.querySelector(".viur-otp-form wa-otp-input")
    expect(input.getAttribute("format")).toBe("####-####-####-####")
    expect(input.getAttribute("type")).toBe("alphanumeric")
  })
})

describe("PasskeyLayout: adding a passkey in a ViForm", () => {
  async function mountAdd(onSuccess = () => {}) {
    const { h } = await import("vue")
    const { PasskeyLayout } = await import("../../index.js")
    const { default: ViForm } = await import("../../src/forms/ViForm.vue")
    const pinia = createPinia()
    setActivePinia(pinia)
    el = document.createElement("div")
    document.body.appendChild(el)
    app = createApp({
      setup: () => () =>
        h(ViForm, {
          module: "user",
          action: "passkeys/add",
          layout: PasskeyLayout,
          multistep: true,
          secure: true,
          onSuccess,
        }),
    })
    app.use(pinia)
    app.config.globalProperties.$t = (key) => key
    app.config.globalProperties.$te = () => false
    app.mount(el)
    return el
  }

  function stubCreate(create) {
    vi.stubGlobal("PublicKeyCredential", function () {})
    Object.defineProperty(navigator, "credentials", { value: { create }, configurable: true })
  }
  const attestation = {
    id: "cred-new",
    rawId: new Uint8Array([7]).buffer,
    type: "public-key",
    getClientExtensionResults: () => ({}),
    response: {
      clientDataJSON: new Uint8Array([1]).buffer,
      attestationObject: new Uint8Array([2]).buffer,
      getTransports: () => ["internal"],
    },
  }

  it("asks for a name, creates the passkey in the browser and posts it", async () => {
    const create = vi.fn().mockResolvedValue(attestation)
    stubCreate(create)
    const onSuccess = vi.fn()
    postAnswers["/json/user/passkeys/add"] = envelope({ action: "add", status: "success", step: "add_success" })
    const root = await mountAdd(onSuccess)

    await vi.waitFor(() => expect(root.querySelector(".viur-login-passkey__name")).not.toBeNull())
    expect(root.querySelector("[data-passkey-start]").textContent).toContain("login.passkey_add")
    const name = root.querySelector(".viur-login-passkey__name")
    name.value = "Laptop"
    name.dispatchEvent(new Event("input"))

    root.querySelector("[data-passkey-start]").dispatchEvent(new Event("click"))

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
    const publicKey = create.mock.calls[0][0].publicKey
    expect(publicKey.user.id).toBeInstanceOf(ArrayBuffer)
    expect(publicKey.excludeCredentials[0].id).toBeInstanceOf(ArrayBuffer)
    const body = posts.find((p) => p.path === "/json/user/passkeys/add").body
    expect(body.state).toBe("s-add")
    expect(body.name).toBe("Laptop")
    expect(JSON.parse(body.credential)).toMatchObject({
      id: "cred-new",
      rawId: "Bw",
      response: { attestationObject: "Ag", transports: ["internal"] },
    })
  })

  it("shows a rejection and loads new options", async () => {
    stubCreate(vi.fn().mockResolvedValue(attestation))
    postAnswers["/json/user/passkeys/add"] = REJECTED("credential")
    const root = await mountAdd()
    await vi.waitFor(() => expect(root.querySelector("[data-passkey-start]")).not.toBeNull())
    const loads = requests.filter((path) => path === "/json/user/passkeys/add").length

    root.querySelector("[data-passkey-start]").dispatchEvent(new Event("click"))

    await vi.waitFor(() =>
      expect(root.querySelector(".viur-login-passkey wa-callout")?.textContent).toContain("Not verified")
    )
    expect(requests.filter((path) => path === "/json/user/passkeys/add").length).toBeGreaterThan(loads + 1)
    expect(root.querySelector("[data-passkey-start]")).not.toBeNull()
  })
})
