import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import { createApp, defineComponent, h } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { resetState } from "../../src/request/request.js"

// The classic chain (provider choice on GET /user/login) with a server that
// answers the submitted steps in envelope v2 (viur-core 4). ViForm is stubbed:
// `sendData(url)` records the target and returns the answer for it.
const sent = []
const answers = {}
vi.mock("../../src/forms/ViForm.vue", () => ({
  default: defineComponent({
    name: "ViForm",
    setup(_, { expose }) {
      expose({
        sendData: async (url) => {
          sent.push(url)
          return { data: { value: answers[url] } }
        },
      })
      return () => h("div", { class: "viform-stub" })
    },
  }),
}))
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))
vi.mock("vue-router", () => ({ useRouter: () => undefined }))

const { default: LoginScreen } = await import("../../src/user/LoginScreen.vue")

const PASSWORD_URL = "/json/user/auth_userpassword/login"
const OTP_URL = "/json/user/f2_authenticatorotp/authenticator_otp"

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

let loggedIn = false
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith("/user/login")) {
        return jsonResponse({
          action: "select_authentication_provider",
          structure: { provider: { type: "select", values: { [PASSWORD_URL]: "Password" } } },
          values: {},
        })
      }
      if (path === PASSWORD_URL) {
        return jsonResponse({ action: "edit", structure: { name: {}, password: {} }, values: {} })
      }
      if (path.endsWith("/user/view/self") && loggedIn) {
        return jsonResponse({ version: 2, action: "view", status: "success", data: { name: "user" } })
      }
      return jsonResponse({}, 401)
    })
  )
}

let app = null
let el = null
const onSuccess = vi.fn()

function mountScreen(props = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  el = document.createElement("div")
  document.body.appendChild(el)
  app = createApp(LoginScreen, { googleClientId: false, onSuccess, ...props })
  app.use(pinia)
  app.mount(el)
  return el
}

const submit = (root) => root.querySelector('wa-button[variant="brand"]').dispatchEvent(new Event("click"))

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  await resetState()
  sent.length = 0
  loggedIn = false
  onSuccess.mockClear()
})

afterEach(() => {
  app?.unmount()
  el?.remove()
  vi.unstubAllGlobals()
})

describe("LoginScreen classic chain with envelope v2 answers", () => {
  it("sends the second factor to `follow` and finishes on status success", async () => {
    // password accepted: the code form comes along with its target in `follow`
    answers[PASSWORD_URL] = {
      version: 2,
      action: "edit",
      status: "init",
      follow: OTP_URL,
      structure: { otptoken: {} },
      data: {},
      errors: [],
    }
    answers[OTP_URL] = { version: 2, action: "login", status: "success", data: null, errors: [] }
    stubFetch()
    const root = mountScreen()

    await vi.waitFor(() => expect(root.querySelector(".viform-stub")).not.toBeNull())
    submit(root)
    await vi.waitFor(() => expect(root.textContent).toContain("login.otp"))

    loggedIn = true
    submit(root)
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())

    expect(sent).toEqual([PASSWORD_URL, OTP_URL])
  })
})

describe("LoginScreen lost password", () => {
  it("offers the recovery next to the password login by default", async () => {
    stubFetch()
    const root = mountScreen()
    await vi.waitFor(() => expect(root.querySelector(".viform-stub")).not.toBeNull())
    expect(root.querySelector(".viur-login__lost")).not.toBeNull()
  })

  it("hides the recovery with lostPassword false", async () => {
    stubFetch()
    const root = mountScreen({ lostPassword: false })
    await vi.waitFor(() => expect(root.querySelector(".viform-stub")).not.toBeNull())
    expect(root.querySelector(".viur-login__lost")).toBeNull()
  })
})
