import type { DefineComponent } from "vue"

/** Props of LoginScreen.vue (see defineProps there). */
export interface LoginScreenProps {
  /** Heading of the card; replaceable via the `header` slot. */
  title?: string
  /**
   * Endpoint below the `user` module that starts the flow. Envelope v2
   * runs the whole chain from "login". viur-core 3.9 (classic v1) answers
   * "login" with the provider choice; the LoginScreen then drives the chain
   * itself like vi-vue-utils (password, lost password, second factor).
   */
  action?: string
  /** Renderer for the requests; default: VITE_DEFAULT_RENDERER or "json". */
  renderer?: string | null
  /** Pin the protocol version; null → unversioned (server picks v2). */
  version?: string | number | null
  /**
   * OAuth client ID for "Sign in with Google". If omitted, the ID supplied by
   * the server via `/vi/config` ("admin.user.google.clientID") is used;
   * `false` always hides the button.
   */
  googleClientId?: string | false | null
  /**
   * Background image of the app, in case the configuration doesn't set one
   * ("admin.login.background" empty). As there: absolute URLs stay, "/…" is
   * a path on the backend, anything else an asset of the app (under BASE_URL).
   */
  backgroundImage?: string | null
  /** Logo above the login, in case "admin.login.logo" is empty (resolved as above). */
  logo?: string | null
  /** Show the progress bar of the multistep form. */
  showSteps?: boolean
  /** Offer "lost password?" next to the password login (default: true). */
  lostPassword?: boolean
  /** On mount, check for an existing session and skip the login. */
  autoStart?: boolean
  /**
   * Target after a successful login (also when `autoStart` finds an existing
   * session). Goes through vue-router if the application has one,
   * otherwise through `location`. If omitted, the view stays put and the
   * caller decides in `@success`.
   */
  redirect?: string
}

/** Events as `on*` props so that `@success` / `@error` are typed in the template. */
export interface LoginScreenEmitProps {
  /** Logged in — with the values of the UserSkel. */
  onSuccess?: (user: Record<string, any> | null) => void
  /** Login failed (form error, transport, "google"). */
  onError?: (error: unknown) => void
}

declare const LoginScreen: DefineComponent<LoginScreenProps & LoginScreenEmitProps, {}, any>
export default LoginScreen
