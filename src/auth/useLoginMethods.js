// The login of viur-core 4 in a ViForm with the LoginLayout: the layout renders
// the choice of the method, the passkey ceremony, the password form and Google
// One Tap; this composable acts for them (provide "viurLogin"), follows the
// server when it chose the only method and tells whether to offer "choose
// another method".
import { computed, provide, reactive, ref, watch } from "vue"
import { useConfigStore } from "../request/configStore.js"
import {
  isMethodChoice,
  isChosenMethod,
  isPasskeyChallenge,
  isPasswordStep,
  isSecondFactorChoice,
  loginMethods,
  methodPageUrl,
} from "./loginMethods.js"

/** Path of this page, to come back to after a login on the backend's page. */
function currentPath() {
  return window.location.pathname + window.location.search + window.location.hash
}

/**
 * @param {import("vue").Ref} viform ref of the ViForm that runs the action "login"
 * @param {object} [options]
 * @param {() => boolean} [options.enabled] false while the form runs something
 *   else (another action, a viur-core 3.9 backend); default: always
 * @param {(method: {url: string, label: string, name: string}) => boolean} [options.hidden]
 *   methods the choice leaves out
 * @param {(error: unknown) => void} [options.onError] a method failed to load
 * @param {string} [options.base] origin of the backend for the pages of methods
 *   without a form (default: VITE_API_URL, empty for this origin)
 * @param {() => string | null} [options.googleClientId] client id for Google
 *   One Tap in place of the Google redirect; default: "admin.user.google.clientID"
 *   of the configuration, `null` keeps the redirect
 * @param {() => Array<{name: string, label: string, click: () => void, class?: string}>} [options.passwordLinks]
 *   links of the app below the submit of the password form, e.g. "lost
 *   password" and the registration
 * @param {string | null} [options.directMethod] the method whose form the
 *   choice opens right away, with the other methods below it (default:
 *   "password"); null shows the choice as buttons only
 */
export function useLoginMethods(viform, options = {}) {
  const enabled = options.enabled ?? (() => true)
  const onError = options.onError ?? (() => {})
  const base = options.base ?? import.meta.env.VITE_API_URL ?? ""
  const configStore = useConfigStore()
  const googleClientId = options.googleClientId ?? (() => configStore.googleClientId)
  const directMethod = options.directMethod === undefined ? "password" : options.directMethod

  // state of the form (null until it is mounted)
  const formState = computed(() => viform.value?.state ?? null)
  // the form shows the choice of the login method
  const choosingMethod = computed(() => enabled() && isMethodChoice(formState.value))
  // the choices, the passkey and the password form have buttons of their own: no action bar there
  const hideActions = computed(
    () =>
      choosingMethod.value ||
      (enabled() &&
        (isPasskeyChallenge(formState.value?.skel) ||
          isPasswordStep(formState.value) ||
          isSecondFactorChoice(formState.value)))
  )
  // the form of user name and password: "lost password" and the registration belong there only
  const atPasswordLogin = computed(() => enabled() && isPasswordStep(formState.value))
  // the methods the last choice offered (none before one was shown)
  const methods = ref([])
  // a method was chosen out of several: offer to choose another one (the
  // password form lists the other methods itself)
  const otherMethods = computed(
    () =>
      enabled() &&
      methods.value.length > 1 &&
      !!formState.value?.step &&
      !choosingMethod.value &&
      !isPasswordStep(formState.value)
  )

  /** What the LoginLayout and its components act through. */
  const viurLogin = reactive({
    choosing: null, // url of the method that is loading
    choose: chooseMethod,
    hidden: (method) => !!options.hidden?.(method),
    googleClientId: computed(() => googleClientId() || null),
    // the methods of the last choice, for the password form to offer the others
    methods: computed(() => methods.value.filter((method) => !options.hidden?.(method))),
    submit,
    submitForm: () => viform.value?.submitStep(),
    // none while the form runs something else (a flow, a viur-core 3.9 backend)
    passwordLinks: computed(() => (enabled() ? (options.passwordLinks?.() ?? []) : [])),
  })
  provide("viurLogin", viurLogin)

  /**
   * Start a login method where the server would follow to: the form loads its
   * first step (a passkey: its challenge). A method without a form of its own
   * (an OAuth redirect) runs on the backend's page instead.
   */
  async function chooseMethod(url) {
    if (viurLogin.choosing || !viform.value) return
    viurLogin.choosing = url
    let body = null
    try {
      body = (await viform.value.loadStep(url))?.data?.value
    } catch (error) {
      // the form shows the failure
      viurLogin.choosing = null
      onError(error)
      return
    }
    if (!body?.["structure"] && !isPasskeyChallenge(body?.["data"])) {
      window.location.assign(methodPageUrl(url, currentPath(), base))
      return // stays "choosing" while the page leaves
    }
    viurLogin.choosing = null
  }

  /**
   * Post *data* instead of the bones of the step (a passkey assertion, a Google
   * token) to *url* (default: the step's `follow`); the form goes on as after
   * its own submit. A rejection that renders no step of its own (a passkey
   * login, a Google token) shows the step again, with the errors.
   */
  async function submit({ url = null, data = {} } = {}) {
    const form = viform.value
    if (!form) return null
    const from = isMethodChoice(form.state) ? null : form.state.postUrl
    const answer = await form.submitStep({ url, data }).catch(onError)
    const state = form.state
    // the passkey as second factor rejects with new options: that is a step already
    if (state.status === "rejected" && !isPasskeyChallenge(state.skel)) {
      const errors = state.errors
      await form.loadStep(from).catch(onError)
      state.errors = errors
    }
    return answer
  }

  /** Back to the choice of the login method. */
  function showMethods() {
    return viform.value?.loadStep().catch(onError)
  }

  // remember what the choice offered and open the direct method; follow the
  // server when it chose the only method itself (`continue` to it right away)
  watch(
    () => {
      const form = enabled() ? formState.value : null
      return form && [form.actionname, form.step, form.status, form.postUrl, form.structure]
    },
    () => {
      const form = formState.value
      if (!form || !enabled()) return
      if (isMethodChoice(form)) {
        methods.value = loginMethods(form)
        // the form of the direct method right away, the others below it
        const direct = methods.value.find((method) => method.name === directMethod)
        if (direct && !viurLogin.choosing) chooseMethod(direct.url)
      } else if (isChosenMethod(form) && !viurLogin.choosing) {
        methods.value = []
        chooseMethod(form.postUrl)
      }
    }
  )

  return { formState, hideActions, otherMethods, atPasswordLogin, chooseMethod, showMethods }
}
