// --------------------------------------------------------------------------- //
// Google Identity Services (GSI) helper                                        //
// --------------------------------------------------------------------------- //
//
// Thin wrapper around Google's Identity SDK for the "Sign in with Google"
// provider (`auth_googleaccount`). Loads the SDK on demand, initializes it with
// the project's OAuth client id, and hands the returned ID token to a callback
// (the user store's loginWithGoogle). Only used when the login screen is given a
// googleClientId AND the server advertises the Google provider.

const GSI_SRC = "https://accounts.google.com/gsi/client"

let _loadPromise = null
let _initializedFor = null
// the callback of the last initGoogle: GSI keeps the one of its initialize()
let _onCredential = null

/** Load the GSI client script once; resolves with window.google. */
export function loadGoogleSdk() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (_loadPromise) return _loadPromise

  _loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.dataset.viurGsi = "1"
    script.addEventListener("load", () => resolve(window.google))
    script.addEventListener("error", () => {
      _loadPromise = null
      reject(new Error("Failed to load the Google Identity SDK"))
    })
    document.head.appendChild(script)
  })
  return _loadPromise
}

/** Initialize GSI for a client id (idempotent per client id). `onCredential`
 *  receives the ID token string on a successful sign-in. Rejection (SDK load
 *  failure) propagates to the caller, which handles it. */
export async function initGoogle(clientId, onCredential) {
  const google = await loadGoogleSdk()
  _onCredential = onCredential
  if (_initializedFor !== clientId) {
    google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "popup",
      cancel_on_tap_outside: false,
      callback: (response) => {
        if (response?.credential) _onCredential?.(response.credential)
      },
    })
    _initializedFor = clientId
  }
  return google
}

/** Render the official Google button into `el`. */
export async function renderGoogleButton(
  el,
  clientId,
  onCredential,
  { theme = "outline", size = "large", width = undefined } = {}
) {
  const google = await initGoogle(clientId, onCredential)
  // width in pixels, at most 400 (GSI)
  if (el) google.accounts.id.renderButton(el, { theme, size, ...(width ? { width: Math.min(width, 400) } : {}) })
}

/** Trigger the One-Tap / popup prompt. */
export async function promptGoogle(clientId, onCredential) {
  const google = await initGoogle(clientId, onCredential)
  google.accounts.id.prompt()
}

/** Disable auto-select on logout so the next login asks again. */
export function revokeGoogle() {
  try {
    window.google?.accounts?.id?.disableAutoSelect?.()
  } catch {
    /* SDK not loaded — nothing to revoke */
  }
}
