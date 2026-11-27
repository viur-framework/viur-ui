import { defineStore } from "pinia"
import { reactive, computed } from "vue"
import { createControllerFetch, resetState, useConfigStore } from "../request/index.js"

// --------------------------------------------------------------------------- //
// User / session store (ViUR core 3.9, envelope v2)                           //
// --------------------------------------------------------------------------- //
//
// The LOGIN FLOW itself is driven generically by the multistep form component
// — `<ViForm module="user" action="login" multistep>` — which walks the v2
// envelope's `status`/`step`/`follow` chain (chooser → userpassword → 2FA →
// success). This store owns what does NOT fit a generic form step:
//   • the SESSION: the current user + access gating (`fetchSelf`, `logout`)
//   • Google sign-in via the Identity SDK token (`loginWithGoogle`)
//   • the requests of the CLASSIC chain (viur-core 3.9, v1 JSON) that are not a
//     form submit (`loadLoginStep`, `selectAuthenticationProvider`)
// On a completed login the consumer calls `fetchSelf()` to load the user.

const DEFAULT_RENDERER = import.meta.env.VITE_DEFAULT_RENDERER || "json"

/** Split a ViUR url into the parts createControllerFetch needs. */
function specFromUrl(url) {
  const parsed = new URL(url, window.location.origin)
  const segments = parsed.pathname.split("/").filter(Boolean)
  return {
    renderer: segments[0],
    controller: segments.slice(1, -1),
    endpoint: segments.at(-1),
    query: parsed.search ? parsed.search.slice(1) : "",
  }
}

/** One request through the viur-ui request layer → normalized (v2) body.
 *  Rejection propagates to the caller. */
async function apiRequest(url, { method = "GET", data = {}, secure = false, messages = true } = {}) {
  const spec = specFromUrl(url)
  const request = createControllerFetch({ endpoint: spec.endpoint, method, secure })
  const result = request(spec.controller, "/", data, {
    renderer: spec.renderer,
    query: spec.query,
    immediate: false,
    messages,
  })
  try {
    await result.execute()
  } catch (error) {
    // the caller decides what a failure means (a 401 on view/self is "anonymous")
    throw error
  }
  return result.data.value
}

export const useUserStore = defineStore("viurUser", () => {
  const state = reactive({
    user: null, // UserSkel values, or null
    status: "unknown", // "unknown" | "loading" | "authenticated" | "anonymous"
    renderer: DEFAULT_RENDERER,
    googleClientId: null,
    // where loginWithGoogle posts the token, below `user`: viur-core 3.9 "auth_googleaccount/login",
    // viur-core 4 "google/one_tap"
    googleLoginEndpoint: "auth_googleaccount/login",
  })

  const userUrl = (endpoint) => `/${state.renderer}/user/${endpoint}`

  // ── getters ────────────────────────────────────────────────────────────────
  const isLoggedIn = computed(() => state.status === "authenticated" && !!state.user)
  const access = computed(() => (Array.isArray(state.user?.access) ? state.user.access : []))
  const isRoot = computed(() => access.value.includes("root"))
  const isAdmin = computed(() => isRoot.value || access.value.includes("admin"))
  function hasAccess(right) {
    return isRoot.value || access.value.includes(right)
  }
  const shortName = computed(() => {
    const u = state.user
    if (!u) return "-"
    if (u.firstname && u.lastname) return `${u.firstname[0]}. ${u.lastname}`
    return u.lastname || u.firstname || u.name || "-"
  })

  function configure({ renderer, googleClientId, googleLoginEndpoint } = {}) {
    if (renderer) state.renderer = renderer
    if (googleClientId !== undefined) state.googleClientId = googleClientId
    if (googleLoginEndpoint) state.googleLoginEndpoint = googleLoginEndpoint
  }

  // ── session ──────────────────────────────────────────────────────────────────
  async function fetchSelf() {
    state.status = "loading"
    try {
      // a 401 here is the normal "not logged in" answer — no feedback message
      const body = await apiRequest(userUrl("view/self"), { method: "GET", messages: false })
      state.user = body?.data ?? null
      state.status = state.user ? "authenticated" : "anonymous"
      return state.user
    } catch (error) {
      // 401 → not logged in (the expected "anonymous" signal)
      state.user = null
      state.status = "anonymous"
      return null
    }
  }

  async function logout() {
    let follow = null
    try {
      const body = await apiRequest(userUrl("logout"), { method: "POST", secure: true })
      follow = body?.follow ?? null
    } catch (error) {
      // clear the session locally regardless of a failed request
    }
    state.user = null
    state.status = "anonymous"
    // drop cached skeys + request cache - also after a failed request, they belong to the old session
    await resetState().catch(() => null)
    // modules and rights belong to the old session: the next login must load its own, and
    // whatever stays on screen needs the public config again (login screen, theme)
    const config = useConfigStore()
    config.reset()
    await config.fetchConfig().catch(() => null)
    if (typeof follow === "string" && /^https?:\/\//.test(follow)) {
      window.location.href = follow
    }
  }

  function reset() {
    state.user = null
    state.status = "unknown"
  }

  // ── classic login chain (viur-core 3.9) ─────────────────────────────────────
  // viur-core 3.9 answers in the classic v1 shape: `/user/login` offers the
  // providers, every further step is a form of its own whose url the server
  // hands out (provider / second factor targets, `params.action_url`). The
  // login screen reports failures itself, so these requests stay silent.

  /** GET-render a step: an endpoint below `user` ("login") or a server url. */
  async function loadLoginStep(target = "login") {
    const url = /^(\/|https?:\/\/)/.test(target) ? target : userUrl(target)
    return apiRequest(url, { method: "GET", messages: false })
  }

  /** Choose a primary provider without a widget of its own; the answer's
   *  `next_url` is its first step. */
  async function selectAuthenticationProvider(provider) {
    return apiRequest(userUrl("select_authentication_provider"), {
      method: "POST",
      secure: true,
      data: { provider },
      messages: false,
    })
  }

  // ── Google sign-in ────────────────────────────────────────────────────────────
  // POST the GSI id-token. Returns the normalized envelope so the caller can
  // complete (status success → the session was loaded via fetchSelf) or hand a
  // 2FA `follow` to the multistep ViForm to continue in the generic flow.
  // Returns null on a transport error.
  async function loginWithGoogle(token) {
    try {
      const body = await apiRequest(userUrl(state.googleLoginEndpoint), {
        method: "POST",
        secure: true,
        data: { token },
      })
      if (body?.status === "success" || body?.action === "login_success") {
        await fetchSelf()
      }
      return body
    } catch (error) {
      return null
    }
  }

  return {
    state,
    // getters
    isLoggedIn,
    access,
    isRoot,
    isAdmin,
    hasAccess,
    shortName,
    // config
    configure,
    // session
    fetchSelf,
    logout,
    reset,
    // classic login chain
    loadLoginStep,
    selectAuthenticationProvider,
    // google
    loginWithGoogle,
  }
})
