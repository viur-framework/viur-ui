// The choice of the login method of viur-core 4: GET /user/login answers the
// action "login" at its step "login" with a select bone `provider`, whose values
// are the urls where the methods start ("/json/user/password/login") and their
// labels. With a single method the server chooses it right away: the answer
// then is `continue` and its `follow` is that url.

/** True if the form shows the choice of the login method. */
export function isMethodChoice(formState) {
  return (
    formState?.actionname === "login" &&
    formState?.step === "login" &&
    formState?.status !== "continue" &&
    !!formState?.structure?.["provider"]
  )
}

/** True if the server chose the only login method: the form continues at `follow`. */
export function isChosenMethod(formState) {
  return (
    formState?.actionname === "login" &&
    formState?.step === "login" &&
    formState?.status === "continue" &&
    !!formState?.postUrl
  )
}

/**
 * The methods of the choice in their order: `{ url, label, name }`, `name` is
 * the module of the method ("…/user/password/login" → "password").
 */
export function loginMethods(formState) {
  const values = formState?.structure?.["provider"]?.["values"] ?? {}
  const entries = Array.isArray(values) ? values : Object.entries(values)
  return entries.map(([url, label]) => ({
    url: String(url),
    label: String(label ?? url),
    name: methodName(url),
  }))
}

/** The module of a login method from the url where it starts. */
export function methodName(url) {
  return String(url).match(/\/([^/]+)\/[^/]+$/)?.[1] ?? String(url)
}

/**
 * The page of the backend that runs a login method in the browser (an OAuth
 * redirect, the WebAuthn ceremony of a passkey): the `login` of the user module
 * with the HTML renderer, which forwards to the chosen method, and the page to
 * come back to after the login.
 *
 * @param {string} url where the method starts, e.g. "/json/user/google/login"
 * @param {string} follow path of this app to come back to
 * @param {string} [base] origin of the backend (VITE_API_URL), empty for this origin
 */
export function methodPageUrl(url, follow, base = "") {
  // "/json/user/google/login" → renderer "json", module path "/user", method "/user/google/login"
  const segments = String(url).split("/").filter(Boolean)
  const method = `/${segments.slice(1).join("/")}`
  const modulePath = `/${segments.slice(1, -2).join("/")}`
  const query = new URLSearchParams({ provider: method, follow })
  return `${base}${modulePath}/login?${query}`
}

/**
 * True if *values* (the `data` of the step) are the options of a passkey
 * assertion: viur-core answers the login with a passkey and the passkey as
 * second factor with `{ state, options }` and no structure.
 */
export function isPasskeyChallenge(values) {
  return typeof values?.["state"] === "string" && !!values?.["options"]?.["challenge"]
}

/** True if the form shows the login with user name and password. */
export function isPasswordStep(formState) {
  return (
    /\/password\/login$/.test(formState?.postUrl ?? "") && formState?.structure?.["password"]?.["type"] === "password"
  )
}

/** Where a login method takes the token of Google Identity Services ("…/google/login" → "…/google/one_tap"). */
export function oneTapUrl(url) {
  return String(url).replace(/\/[^/]+$/, "/one_tap")
}

/**
 * True if the form shows the choice of the second factor: after the primary
 * authentication, viur-core offers several factors as the select bone
 * `provider` of the step "select_secondfactor", whose values are the urls
 * where the factors start.
 */
export function isSecondFactorChoice(formState) {
  return formState?.step === "select_secondfactor" && !!formState?.structure?.["provider"]
}

/** The bone of viur-core's second factors that takes the one-time code. */
export const OTP_BONE = "otptoken"

/**
 * True if the form asks for a one-time code: the authenticator app, TOTP or a
 * recovery code, at the login or while setting the app up.
 */
export function isOtpStep(formState) {
  return !!formState?.structure?.[OTP_BONE]
}
