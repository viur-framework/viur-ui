<template>
  <div class="viur-login">
    <!-- background image, tinted in the brand color (as in Admin4) -->
    <div
      v-if="state.background"
      class="viur-login__background"
      aria-hidden="true"
    >
      <img
        :src="state.background"
        alt=""
      />
    </div>

    <div class="viur-login__card">
      <slot name="header">
        <img
          v-if="state.logo"
          class="viur-login__logo"
          :src="state.logo"
          alt=""
        />
        <h1 class="viur-login__title">{{ title }}</h1>
      </slot>

      <!-- checking for an existing session / completing a classic login -->
      <div
        v-if="checking || (state.view === 'done' && !store.isLoggedIn)"
        class="viur-login__loading"
      >
        <wa-spinner></wa-spinner>
        <span>{{ t("login.waiting") }}</span>
      </div>

      <template v-else-if="!store.isLoggedIn">
        <!-- GET /user/login failed (server down, 5xx, no access): say so instead
             of falling back to an empty multistep form -->
        <template v-if="state.loadError">
          <wa-callout variant="danger">{{ t("login.unavailable") }}</wa-callout>
          <wa-button
            class="viur-login__retry"
            variant="brand"
            @click="retryStart"
          >
            {{ t("login.retry") }}
          </wa-button>
        </template>

        <!-- viur-core 3.9 answers classic (v1): /user/login offers the
             providers and every further step is a form of its own whose url
             the server hands out. Walked here like vi-vue-utils: provider
             choice, password (+ "lost password"), second factor choice / OTP. -->
        <template v-else-if="state.classic">
          <wa-button
            v-if="state.view !== 'start'"
            appearance="plain"
            size="small"
            class="viur-login__back"
            @click="showStart"
          >
            {{ t("login.back") }}
          </wa-button>

          <wa-callout
            v-if="state.error"
            variant="danger"
          >
            {{ t(state.error) }}
          </wa-callout>

          <template v-if="state.view === 'secondfactor'">
            <template
              v-for="(factor, index) in state.secondFactors"
              :key="factor.target"
            >
              <div
                v-if="index > 0"
                class="viur-login__sep"
              >
                {{ t("login.or") }}
              </div>
              <wa-button @click="openStep(factor.target, 'otp')">{{ factor.label }}</wa-button>
            </template>
          </template>

          <template v-else-if="state.step">
            <!-- Enter submits; on keyup, so the bones have taken their value -->
            <div @keyup.enter="submitClassic">
              <ViForm
                ref="viform"
                :key="state.stepKey"
                module="user"
                :structure="state.step.structure"
                :skel="state.step.skel"
                :secure="true"
                :use-categories="false"
                :use-message-store="false"
                label="placeholder"
              />
            </div>
            <wa-button
              variant="brand"
              :loading="state.loading"
              @click="submitClassic"
            >
              {{ t(CLASSIC_VIEWS[state.view].submit) }}
            </wa-button>
            <wa-button
              v-if="state.view === 'start' && state.recoverUrl && lostPassword"
              appearance="plain"
              size="small"
              class="viur-login__lost"
              @click="openStep(state.recoverUrl, 'recover')"
            >
              {{ t("login.lost_password") }}
            </wa-button>
          </template>

          <!-- providers without a form of their own -->
          <template v-if="state.view === 'start'">
            <template
              v-for="(provider, index) in state.otherProviders"
              :key="provider.target"
            >
              <div
                v-if="index > 0 || state.step"
                class="viur-login__sep"
              >
                {{ t("login.or") }}
              </div>
              <wa-button @click="chooseProvider(provider.target)">{{ provider.label }}</wa-button>
            </template>
          </template>
        </template>

        <!-- Otherwise the login flow is driven generically by the multistep
             form: it GET-renders /user/login and walks the v2 status/follow
             chain (chooser → userpassword → 2FA → success). viur-core 4
             also runs the password recovery there, as the action
             "password/recover" (recover → recover_code → recover_password).
             For viur-core 4 the LoginLayout renders the choice of the login
             method as buttons, from the answer of the action "login". -->
        <template v-else>
          <p
            v-if="state.notice"
            class="viur-login__notice"
          >
            {{ t(state.notice) }}
          </p>
          <ViForm
            :key="state.flow ? flowAction : 'login'"
            ref="viform"
            module="user"
            :action="flowAction"
            :layout="state.viur4 && !state.flow ? LoginLayout : undefined"
            :secure="true"
            multistep
            show-error
            :renderer="renderer ?? undefined"
            :version="version ?? undefined"
            :show-steps="showSteps"
            :submit-label="t(state.flow ? FLOWS[state.flow].submit : 'login.login')"
            @success="state.flow ? onFlowSuccess() : onFormSuccess()"
            @failed="onFailed"
          >
            <!-- Pass the form's own slots through so an app can supply its own
                 chrome (e.g. its own action bar). Only forwarded when the consumer provides the
                 slot, otherwise ViForm keeps its default. The choice of the
                 login method has no action bar: its buttons choose (an empty
                 slot would fall back to ViForm's bar, so it renders a stand-in). -->
            <template
              v-if="$slots.actions || hideActions"
              #actions="actionProps"
            >
              <span
                v-if="hideActions"
                class="viur-login__no-actions"
              ></span>
              <slot
                v-else
                name="actions"
                v-bind="actionProps"
              />
            </template>
          </ViForm>
          <wa-button
            v-if="otherMethods"
            appearance="plain"
            size="small"
            class="viur-login__back viur-login__methods"
            @click="showMethods"
          >
            {{ t("login.other_method") }}
          </wa-button>
          <!-- viur-core 4: the password recovery and the self-registration -->
          <template v-if="state.viur4">
            <wa-button
              v-if="canResendCode"
              appearance="plain"
              size="small"
              class="viur-login__resend"
              @click="resendCode"
            >
              {{ t("login.register_resend") }}
            </wa-button>
            <wa-button
              v-if="state.flow"
              appearance="plain"
              size="small"
              class="viur-login__back"
              @click="endFlow"
            >
              {{ t("login.back") }}
            </wa-button>
          </template>
        </template>

        <!-- core 3.9: Google is the one provider that isn't a form step
             (Identity SDK token), so it lives beside the form. Only hidden in
             the later classic steps, so the rendered button survives "back".
             viur-core 4: the LoginLayout shows it among the methods. -->
        <template v-if="effectiveGoogleClientId && !state.viur4">
          <div
            v-show="state.view === 'start' && !state.flow && atLoginStart"
            class="viur-login__sep"
          >
            {{ t("login.or") }}
          </div>
          <div
            v-show="state.view === 'start' && !state.flow && atLoginStart"
            ref="googleBtn"
            class="viur-login__google"
          ></div>
          <p
            v-if="googleError"
            v-show="state.view === 'start' && !state.flow && atLoginStart"
            class="viur-login__error"
          >
            {{ googleError }}
          </p>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from "vue"
import { useI18n } from "vue-i18n"
import ViForm from "../forms/ViForm.vue"
import { useRouter } from "vue-router"
import { useUserStore } from "../user/store.js"
import { useConfigStore } from "../request/configStore.js"
import { normalizeStructure } from "../request/skel.js"
import { resetState } from "../request/request.js"
import { isViur4Envelope } from "../request/envelope.js"
import { renderGoogleButton } from "./google.js"
import LoginLayout from "./LoginLayout.vue"
import { useLoginMethods } from "./useLoginMethods.js"

/** Image setting → url, as the old admin resolved them: absolute urls stay,
 *  "/…" is a path on the backend, anything else an asset of the app. */
function assetUrl(value) {
  if (!value || typeof value !== "string") return null
  if (/^(https?:|data:|blob:|\/\/)/.test(value)) return value
  if (value.startsWith("/")) return `${import.meta.env.VITE_API_URL ?? ""}${value}`
  return `${import.meta.env.BASE_URL ?? "/"}${value}`
}

// viur-core 4: the password recovery and the self-registration, actions below
// the `user` module. The link in their mails enters at the step that takes the
// code (`codeAction`, the code as `param`).
const FLOWS = {
  recover: {
    action: "password/recover",
    codeAction: "password/recover_code",
    param: "recovery_key",
    prop: "recoveryKey",
    submit: "login.recovery_start",
    done: "login.recovery_done",
  },
  register: {
    action: "password/register",
    codeAction: "password/register_verify",
    param: "verification_key",
    prop: "verificationKey",
    submit: "login.register",
    done: "login.register_done",
  },
}
// sends a new code of the registration; it belongs to the step register_verify
const REGISTER_RESEND_ACTION = "password/register_resend"
const REGISTER_VERIFY_STEP = "password/register_verify"
// where the token of the Google SDK goes, below `user`: viur-core 3.9 and 4
const GOOGLE_LOGIN_ENDPOINT_3 = "auth_googleaccount/login"
const GOOGLE_LOGIN_ENDPOINT_4 = "google/one_tap"

// classic chain (viur-core 3.9): submit label and failure message per view
const CLASSIC_VIEWS = {
  start: { submit: "login.login", error: "login.login_error" },
  provider: { submit: "login.login", error: "login.login_error" },
  otp: { submit: "login.otp", error: "login.otp_error" },
  recover: { submit: "login.recovery_start", error: "login.recovery_error" },
}

const props = defineProps({
  title: { type: String, default: "Login" },
  // Endpoint below the `user` module that starts the flow. Envelope v2 drives
  // the whole chain from "login" (chooser → provider → 2FA). viur-core 3.9
  // (classic v1) answers "login" with the provider choice; the screen then
  // walks that chain itself, step by step, like vi-vue-utils.
  action: { type: String, default: "login" },
  // override the request renderer (default: VITE_DEFAULT_RENDERER || "json")
  renderer: { type: String, default: null },
  // optionally pin the protocol version (default null → unversioned, server
  // aliases to the newest wire format / envelope v2)
  version: { type: [String, Number, null], default: null },
  // OAuth client id for "Sign in with Google". Omit to take the one the server
  // advertises via /vi/config ("admin.user.google.clientID"); pass `false` to
  // never show the Google button.
  googleClientId: { type: [String, Boolean], default: null },
  // Background image and logo of the app, used when the configuration sets
  // none ("admin.login.background" / "admin.login.logo" are empty). Like
  // those: absolute urls stay, "/…" is a path on the backend, anything else
  // an asset of the app (below its base url).
  backgroundImage: { type: String, default: null },
  logo: { type: String, default: null },
  // render the multistep progress bar
  showSteps: { type: Boolean, default: false },
  // offer "lost password?" next to the password login
  lostPassword: { type: Boolean, default: true },
  // viur-core 4: code of the password recovery from its mail. Omit to take
  // `?recovery_key=` of the page url (removed from it once read); set it when
  // the app keeps the query elsewhere (e.g. in the hash of a hash router).
  recoveryKey: { type: String, default: null },
  // viur-core 4: offer the self-registration. Omit to follow the server
  // ("admin.user.registration" of /json/config); `false` never offers it.
  register: { type: Boolean, default: null },
  // viur-core 4: code of the registration from its mail, like `recoveryKey`
  // (`?verification_key=` of the page url).
  verificationKey: { type: String, default: null },
  // check for an existing session on mount (and skip login if authenticated)
  autoStart: { type: Boolean, default: true },
  // Where to go once the session stands (also when `autoStart` finds an
  // existing one). Routed through vue-router when the app has one, otherwise a
  // plain location change. Omit to stay put and handle it in `@success`.
  redirect: { type: String, default: null },
})
const emit = defineEmits(["success", "error"])

const store = useUserStore()
const configStore = useConfigStore()
const { t } = useI18n()
// Optional: without an installed router this is undefined — navigation then
// happens via location.
const router = useRouter()

const state = reactive({
  classic: false, // viur-core 3.9: /user/login answered with the provider choice
  loadError: false, // /user/login could not be loaded at all
  viur4: false, // viur-core 4: /user/login answered with its envelope (steps, step_status)
  flow: null, // viur-core 4: the multistep form runs "recover" or "register" instead of the login
  flowCode: null, // viur-core 4: code from the mail of the flow, it starts at the step that takes it
  resend: false, // viur-core 4: the registration sends a new code (register_resend)
  notice: null, // i18n key of a message above the multistep form
  view: "start", // "start" | "provider" | "otp" | "recover" | "secondfactor" | "done"
  providers: [], // [{ name, target, label }] offered by /user/login
  secondFactors: [], // [{ name, target, label }] offered after the password
  step: null, // { structure, skel } of the form shown
  stepKey: 0, // remounts the form per step
  url: null, // where the shown step submits to
  loading: false,
  error: null, // i18n key of the failure message
  passwordProvider: computed(() => state.providers.find((provider) => provider.name === "userpassword") ?? null),
  // the recovery lives next to the password login (…/auth_userpassword/pwrecover)
  recoverUrl: computed(() => state.passwordProvider?.target.replace(/\/login$/, "/pwrecover") ?? null),
  otherProviders: computed(() =>
    state.providers.filter((provider) => !["userpassword", "googleaccount"].includes(provider.name))
  ),
  // the configuration wins; empty there → the app's default
  background: computed(() => assetUrl(configStore.get("login.background")) ?? assetUrl(props.backgroundImage)),
  logo: computed(() => assetUrl(configStore.get("login.logo")) ?? assetUrl(props.logo)),
})

// explicit prop wins; `false` disables; otherwise the server config decides
const effectiveGoogleClientId = computed(() => {
  if (props.googleClientId === false) return null
  // core 3.9: only when /user/login offers the Google provider at all
  if (state.classic && !state.providers.some((provider) => provider.name === "googleaccount")) return null
  return props.googleClientId || configStore.googleClientId
})

const viform = ref(null)
const googleBtn = ref(null)
const checking = ref(true)
const googleError = ref("")

// after a login: admin/root unlock the module part of /vi/config, so refresh
// it for them (skipped for everyone else). Config is optional for the login
// itself, so a failure is swallowed.
function loadAdminConfig() {
  return configStore.fetchConfig({ user: store.state.user }).catch(() => null)
}

async function onFormSuccess() {
  try {
    // the login resets the server session: skeys fetched before it are void
    await resetState().catch(() => null)
    await store.fetchSelf()
    await loadAdminConfig()
  } finally {
    emit("success", store.state.user)
  }
  await goRedirect().catch(() => null)
}

function onFailed(error) {
  emit("error", error)
}

// ── choice of the login method (viur-core 4) ──────────────────────────────────

const {
  formState,
  hideActions,
  otherMethods,
  showMethods: loadMethods,
} = useLoginMethods(viform, {
  enabled: () => state.viur4 && !state.flow,
  // the LoginLayout shows Google One Tap in place of the Google redirect
  googleClientId: () => effectiveGoogleClientId.value,
  // the password recovery and the self-registration, below the submit of the password form
  passwordLinks: () =>
    [
      props.lostPassword && {
        name: "lost-password",
        label: t("login.lost_password"),
        class: "viur-login__lost",
        click: () => startFlow("recover"),
      },
      registration.value && {
        name: "register",
        label: t("login.no_account"),
        class: "viur-login__register",
        click: () => startFlow("register"),
      },
    ].filter(Boolean),
  onError: (error) => emit("error", error),
})

/** core 3.9: before a second factor, where the Google button beside the form belongs. */
const atLoginStart = computed(() => {
  if (!state.viur4) return true
  const form = formState.value
  if (!form?.step || form.step === "login") return true
  const keys = Object.keys(form.steps ?? {})
  return keys.length === 0 || keys[0] === form.step
})

/** Back to the choice of the login method. */
function showMethods() {
  state.notice = null
  return loadMethods()
}

// ── password recovery and registration (viur-core 4) ──────────────────────────

/** The action of the form: the login, or the step a flow starts at. */
const flowAction = computed(() => {
  const flow = FLOWS[state.flow]
  if (!flow) return props.action
  if (state.flow === "register" && state.resend) return REGISTER_RESEND_ACTION
  return state.flowCode ? `${flow.codeAction}?${flow.param}=${encodeURIComponent(state.flowCode)}` : flow.action
})

/** The server allows the self-registration, unless the app says otherwise. */
const registration = computed(() => state.viur4 && (props.register ?? configStore.registrationEnabled))

/** The form asks for the code of the registration: a new one can be sent. */
const canResendCode = computed(
  () =>
    state.flow === "register" &&
    formState.value?.step === REGISTER_VERIFY_STEP &&
    !!formState.value?.structure?.["verification_key"]
)

/** The code from the mail of a flow: its prop, else its parameter of the page
 *  url, which is removed from it so a reload or a shared link doesn't carry it. */
function takeFlowCode(flow) {
  if (props[flow.prop]) return props[flow.prop]
  const url = new URL(window.location.href)
  const code = url.searchParams.get(flow.param)
  if (!code) return null
  url.searchParams.delete(flow.param)
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  return code
}

/** Run a flow in the form instead of the login, at its first step or at the
 *  step that takes the code from its mail. */
function startFlow(name, code = null) {
  state.notice = null
  state.flowCode = code
  state.resend = false
  state.flow = name
}

/** Back to the login. */
function endFlow() {
  state.notice = null
  state.flowCode = null
  state.resend = false
  state.flow = null
}

/** Send a new code of the registration; the form continues at its step. */
function resendCode() {
  if (state.resend) return viform.value?.loadStep().catch((error) => emit("error", error))
  state.flowCode = null
  state.resend = true
}

/** The flow is done (password set, account registered): back to the login. */
function onFlowSuccess() {
  const done = FLOWS[state.flow].done
  endFlow()
  state.notice = done
}

/**
 * Redirect after login if `redirect` is set. Runs AFTER the success emit so
 * the caller can still take the user into its own state (access rights,
 * persona visibility) before the target renders.
 */
async function goRedirect() {
  if (!props.redirect) return
  if (router) {
    await router.replace(props.redirect).catch(() => null)
    return
  }
  window.location.assign(props.redirect)
}

// ── classic chain (viur-core 3.9) ──────────────────────────────────────────────

/**
 * Options of a v1 choice (provider / second factor): the key is the url of the
 * provider's first step, the value its label. `name` is the provider part of
 * that url ("…/auth_userpassword/login" → "userpassword").
 */
function selectOptions(body) {
  const values = normalizeStructure(body?.["structure"] ?? {})?.["provider"]?.["values"] ?? {}
  const options = Array.isArray(values) ? values : Object.entries(values)
  return options.map(([target, label]) => ({
    name: String(target).match(/\/(?:auth|f2)_([^/]+)\/[^/]+$/)?.[1] ?? String(target),
    target: String(target),
    label,
  }))
}

/** Show a step's form. It submits to its target - `follow` in envelope v2,
 *  `params.action_url` in v1 (normalizeEnvelope lifts it into `follow`) - or
 *  back to the url it was rendered from. */
function showStep(body, url, view) {
  state.step = { structure: body?.["structure"] ?? {}, skel: body?.["data"] ?? {} }
  state.url = body?.["follow"] || body?.["params"]?.["action_url"] || url
  state.view = view
  state.stepKey++
}

async function openStep(url, view) {
  state.error = null
  state.loading = true
  try {
    showStep(await store.loadLoginStep(url), url, view)
  } catch (error) {
    state.error = CLASSIC_VIEWS[view]?.error ?? null
    emit("error", error)
  } finally {
    state.loading = false
  }
}

/** The beginning: the password form (when offered), the other providers as
 *  buttons, Google beside them. */
async function showStart() {
  state.error = null
  state.step = null
  state.view = "start"
  if (state.passwordProvider) return openStep(state.passwordProvider.target, "start")
}

/** Anything but the classic provider choice (an envelope v2, no answer at all)
 *  stays with the multistep form. */
async function startClassic() {
  let body = null
  try {
    body = await store.loadLoginStep(props.action)
  } catch (error) {
    // no answer at all is not "the server speaks v2" - the multistep form
    // would fail the same way and show nothing but its action bar
    state.loadError = true
    emit("error", error)
    return
  }
  state.loadError = false
  state.viur4 = isViur4Envelope(body)
  // viur-core 4 takes the token of the Google SDK at user/google/one_tap
  if (state.viur4 && store.state.googleLoginEndpoint === GOOGLE_LOGIN_ENDPOINT_3) {
    store.configure({ googleLoginEndpoint: GOOGLE_LOGIN_ENDPOINT_4 })
  }
  if (!String(body?.["action"] ?? "").startsWith("select_authentication_provider")) return
  state.classic = true
  state.providers = selectOptions(body)
  return showStart()
}

/** Load the start of the login again after it failed. */
async function retryStart() {
  checking.value = true
  try {
    await startClassic()
  } finally {
    checking.value = false
  }
  if (!state.loadError) await mountGoogleButton().catch(() => null)
}

/** A provider without a widget of its own: the server confirms the choice and
 *  names its first step. */
async function chooseProvider(target) {
  state.error = null
  let body = null
  try {
    body = await store.selectAuthenticationProvider(target)
  } catch (error) {
    state.error = CLASSIC_VIEWS.provider.error
    emit("error", error)
    return
  }
  const url = body?.["next_url"] || target
  // an external identity provider takes over the page
  if (/^https?:\/\//.test(url)) {
    window.location.assign(url)
    return
  }
  return openStep(url, "provider")
}

/** Submit the shown step. ViForm sends it and takes over the field errors; the
 *  answer decides where the chain continues. */
async function submitClassic() {
  if (state.loading || !viform.value) return
  state.error = null
  state.loading = true
  try {
    const result = await viform.value.sendData(state.url)
    await onClassicAnswer(result?.data?.value)
  } catch (error) {
    // a string is ViForm's client-side check — the browser points at the field
    if (typeof error !== "string") {
      state.error = CLASSIC_VIEWS[state.view]?.error ?? null
      emit("error", error)
    }
  } finally {
    state.loading = false
  }
}

async function onClassicAnswer(body) {
  const action = body?.["action"]
  // new password is set — continue with the login
  if (action === "pwrecover_success") return showStart()
  // v1 says login_success, envelope v2 says status success
  if (action === "login_success" || body?.["status"] === "success") return finishClassic()
  if (action === "select_secondfactor_provider") {
    state.secondFactors = selectOptions(body)
    state.view = "secondfactor"
  } else if (body?.["status"] === "rejected") {
    // the form shows the field errors
    state.error = CLASSIC_VIEWS[state.view]?.error ?? null
  } else if (body?.["structure"]) {
    // the next form came along: the second factor (its target is an f2_
    // provider) or the next recovery step
    const secondFactor = body?.["params"]?.["action_url"] || /\/f2_[^/]+\//.test(body?.["follow"] ?? "")
    showStep(body, state.url, secondFactor ? "otp" : state.view)
  }
}

async function finishClassic() {
  state.view = "done"
  try {
    await onFormSuccess()
  } finally {
    // no session after all: back to the beginning instead of a dead end
    if (!store.isLoggedIn) {
      showStart()
      mountGoogleButton()
    }
  }
}

async function onGoogleToken(token) {
  googleError.value = ""
  // loginWithGoogle resolves null on a transport error and never rejects
  const body = await store.loginWithGoogle(token).catch(() => null)
  if (!body) {
    googleError.value = t("login.google_error")
    emit("error", "google")
    return
  }
  if (body.status === "success" || body.action === "login_success") {
    await resetState().catch(() => null)
    await configStore.fetchConfig({ user: store.state.user }).catch(() => null)
    emit("success", store.state.user)
    await goRedirect().catch(() => null)
    return
  }
  // Google login needs a second factor → continue in the form flow. The
  // classic chain hands that step over in the answer itself.
  if (state.classic) return onClassicAnswer(body)
  // loadStep manages its own loading/error state, so it need not be awaited.
  if (body.follow && viform.value?.loadStep) {
    viform.value.loadStep(body.follow)
  }
}

async function mountGoogleButton() {
  if (checking.value || store.isLoggedIn || !effectiveGoogleClientId.value || state.viur4) return
  try {
    await nextTick()
    await renderGoogleButton(googleBtn.value, effectiveGoogleClientId.value, onGoogleToken)
  } catch {
    /* SDK failed to load — the form login still works */
  }
}

onMounted(async () => {
  store.configure({ renderer: props.renderer ?? undefined })
  try {
    // public settings (google client id, languages) BEFORE anything renders;
    // without config the form login still works
    if (!configStore.isLoaded) await configStore.fetchConfig().catch(() => null)
    store.configure({ googleClientId: effectiveGoogleClientId.value })
    if (props.autoStart) {
      await store.fetchSelf()
      if (store.isLoggedIn) {
        await loadAdminConfig()
        emit("success", store.state.user)
        await goRedirect()
        return
      }
    }
    await startClassic()
    // viur-core 4: the link in the mail of a flow continues it
    if (state.viur4) {
      for (const [name, flow] of Object.entries(FLOWS)) {
        const code = takeFlowCode(flow)
        if (code) {
          startFlow(name, code)
          break
        }
      }
    }
    await mountGoogleButton()
  } finally {
    checking.value = false
    // button lives behind v-else-if; (re)mount it now that `checking` is false
    if (!store.isLoggedIn) mountGoogleButton()
  }
})
</script>

<style scoped>
.viur-login {
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  padding: var(--wa-space-l, 1.5rem);
}

/* the whole viewport behind the card, also inside a padded / scrolling layout */
.viur-login__background {
  position: fixed;
  inset: 0;
  z-index: -1;
}

.viur-login__background img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.viur-login__background::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.7;
  background: linear-gradient(to top left, var(--wa-color-brand-30), var(--wa-color-brand-50));
}

.viur-login__logo {
  align-self: center;
  max-width: 100%;
  height: 10rem;
  object-fit: contain;
}

/* small screens: less padding, so the fields keep their width in the card */
@media (max-width: 530px) {
  .viur-login {
    padding: 0;
  }

  .viur-login__card {
    padding: var(--wa-space-l, 1.5rem);
  }

  .viur-login__logo {
    height: 8.75rem;
  }
}

.viur-login__card {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-m, 1rem);
  width: 100%;
  max-width: 24rem;
  padding: var(--wa-space-xl, 2rem);
  border-radius: var(--wa-border-radius-l, 0.75rem);
  background: var(--wa-color-surface-default, #fff);
  box-shadow: var(--wa-shadow-m, 0 4px 16px rgb(0 0 0 / 12%));
}

.viur-login__title {
  margin: 0;
  text-align: center;
  font-size: 1.25rem;
}

.viur-login__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--wa-space-s, 0.5rem);
  padding: var(--wa-space-l, 1.5rem);
  font-size: 1.5rem;
}

.viur-login__sep {
  text-align: center;
  color: var(--wa-color-text-quiet, #6b7280);
  font-size: 0.85rem;
}

.viur-login__google {
  display: flex;
  justify-content: center;
}

.viur-login__back {
  align-self: flex-start;
}

.viur-login__lost {
  align-self: flex-end;
}

.viur-login__notice {
  margin: 0;
  color: var(--wa-color-success-on-quiet, #15803d);
  font-size: 0.85rem;
  text-align: center;
}

.viur-login__error {
  margin: 0;
  color: var(--wa-color-danger-fill-loud, #dc2626);
  font-size: 0.85rem;
  text-align: center;
}
</style>
