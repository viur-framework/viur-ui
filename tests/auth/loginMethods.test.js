import { describe, it, expect, vi } from "vitest"
import { createApp, h, reactive } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { isMethodChoice, isChosenMethod, loginMethods, methodName, methodPageUrl } from "../../src/auth/loginMethods.js"

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key) => key }) }))

const { default: LoginLayout } = await import("../../src/auth/LoginLayout.vue")

// the choice as viur-core 4 answers GET /json/user/login (several methods)
const PROVIDER = {
  type: "select",
  visible: true,
  values: {
    "/json/user/password/login": "Username & Password",
    "/json/user/google/login": "Google",
    "/json/user/passkey/login": "Passkey",
  },
}
const choice = (extra = {}) => ({
  actionname: "login",
  step: "login",
  status: "init",
  postUrl: null,
  structure: { provider: PROVIDER },
  ...extra,
})

describe("loginMethods", () => {
  it("detects the choice of the login method", () => {
    expect(isMethodChoice(choice())).toBe(true)
    expect(isMethodChoice(choice({ status: "rejected" }))).toBe(true)
    expect(isMethodChoice(choice({ status: "continue", postUrl: "/json/user/password/login" }))).toBe(false)
    expect(isMethodChoice(choice({ step: "password/login" }))).toBe(false)
    expect(isMethodChoice(choice({ actionname: "recover" }))).toBe(false)
    expect(isMethodChoice(null)).toBe(false)
  })

  it("detects the only method the server chose itself", () => {
    expect(isChosenMethod(choice({ status: "continue", postUrl: "/json/user/password/login" }))).toBe(true)
    expect(isChosenMethod(choice())).toBe(false)
    expect(isChosenMethod(choice({ status: "continue" }))).toBe(false)
  })

  it("lists the methods in their order, also from normalized values", () => {
    const expected = [
      { url: "/json/user/password/login", label: "Username & Password", name: "password" },
      { url: "/json/user/google/login", label: "Google", name: "google" },
      { url: "/json/user/passkey/login", label: "Passkey", name: "passkey" },
    ]
    expect(loginMethods(choice())).toEqual(expected)
    const pairs = { structure: { provider: { values: Object.entries(PROVIDER.values) } } }
    expect(loginMethods(pairs)).toEqual(expected)
    expect(loginMethods({ structure: {} })).toEqual([])
  })

  it("names a method by its module", () => {
    expect(methodName("/json/user/passkey/login")).toBe("passkey")
    expect(methodName("/user/google/login")).toBe("google")
  })

  it("points at the backend's login page of a method, with the page to come back to", () => {
    const url = methodPageUrl("/json/user/google/login", "/admin/?x=1#/start", "https://api.example")
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe("https://api.example/user/login")
    expect(parsed.searchParams.get("provider")).toBe("/user/google/login")
    expect(parsed.searchParams.get("follow")).toBe("/admin/?x=1#/start")
    expect(methodPageUrl("/json/user/passkey/login", "/")).toBe(
      "/user/login?provider=%2Fuser%2Fpasskey%2Flogin&follow=%2F"
    )
  })
})

/** Renders the layout on `formState`; every bone of another step as <i>name</i>. */
function render(formState, login = null) {
  setActivePinia(createPinia())
  const app = createApp({ render: () => h(LoginLayout, null, { default: ({ boneName }) => h("i", boneName) }) })
  app.use(createPinia())
  app.provide("formState", reactive(formState))
  if (login) app.provide("viurLogin", login)
  const el = document.createElement("div")
  app.mount(el)
  return el
}

describe("LoginLayout", () => {
  it("renders a button per method and chooses the clicked one", () => {
    const chosen = []
    const el = render(choice(), reactive({ choosing: null, choose: (url) => chosen.push(url), hidden: () => false }))

    const buttons = [...el.querySelectorAll("wa-button")]
    expect(buttons.map((button) => button.textContent.trim())).toEqual(["Username & Password", "Google", "Passkey"])
    expect(buttons[0].getAttribute("variant")).toBe("brand")
    expect(el.querySelector("select, wa-select")).toBeNull()

    el.querySelector('[data-provider="passkey"]').dispatchEvent(new Event("click"))
    expect(chosen).toEqual(["/json/user/passkey/login"])
  })

  it("leaves out the methods the screen hides", () => {
    const el = render(choice(), reactive({ choosing: null, choose: () => {}, hidden: (m) => m.name === "google" }))
    expect([...el.querySelectorAll("wa-button")].map((b) => b.dataset.provider)).toEqual(["password", "passkey"])
  })

  it("renders every other step like the default layout", () => {
    const el = render({
      actionname: "login",
      step: "password/login",
      status: "init",
      structure: { name: { type: "str", visible: true }, password: { type: "password", visible: true } },
      categories: { default: { name: "default", visible: true, bones: [{ name: "name" }, { name: "password" }] } },
      useCategories: false,
    })
    expect(el.querySelector("wa-button")).toBeNull()
    expect([...el.querySelectorAll("i")].map((i) => i.textContent)).toEqual(["name", "password"])
  })
})

describe("passkey, password and Google One Tap", () => {
  it("recognizes the options of a passkey assertion by their data", async () => {
    const { isPasskeyChallenge } = await import("../../src/auth/loginMethods.js")
    expect(isPasskeyChallenge({ state: "s", options: { challenge: "AAEC" } })).toBe(true)
    expect(isPasskeyChallenge({ state: "s", options: {} })).toBe(false)
    expect(isPasskeyChallenge({ name: "a@b.c" })).toBe(false)
    expect(isPasskeyChallenge(null)).toBe(false)
  })

  it("recognizes the login with user name and password", async () => {
    const { isPasswordStep } = await import("../../src/auth/loginMethods.js")
    const structure = { name: { type: "str.email" }, password: { type: "password" } }
    expect(isPasswordStep({ postUrl: "/json/user/password/login", structure })).toBe(true)
    // the new password of the recovery is no login
    expect(isPasswordStep({ postUrl: "/json/user/password/recover_password", structure })).toBe(false)
  })

  it("derives where Google One Tap posts its token", async () => {
    const { oneTapUrl } = await import("../../src/auth/loginMethods.js")
    expect(oneTapUrl("/json/user/google/login")).toBe("/json/user/google/one_tap")
  })

  it("converts the options of the server and serializes the assertion like viur-core's page", async () => {
    const { requestOptions, serializeAssertion } = await import("../../src/auth/passkey.js")
    const options = requestOptions({ challenge: "AAEC", allowCredentials: [{ id: "AQ", type: "public-key" }] })
    expect([...new Uint8Array(options.challenge)]).toEqual([0, 1, 2])
    expect([...new Uint8Array(options.allowCredentials[0].id)]).toEqual([1])
    expect(requestOptions({ challenge: "AA" })).not.toHaveProperty("allowCredentials")

    const json = serializeAssertion({
      id: "cred",
      rawId: new Uint8Array([255, 254]).buffer,
      type: "public-key",
      authenticatorAttachment: "platform",
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: new Uint8Array([1]).buffer,
        authenticatorData: new Uint8Array([2]).buffer,
        signature: new Uint8Array([3]).buffer,
        userHandle: new Uint8Array([4]).buffer,
      },
    })
    expect(JSON.parse(json)).toEqual({
      id: "cred",
      rawId: "__4",
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { clientDataJSON: "AQ", authenticatorData: "Ag", signature: "Aw", userHandle: "BA" },
    })
  })
})
