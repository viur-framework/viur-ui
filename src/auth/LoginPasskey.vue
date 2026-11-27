<template>
  <!-- The options of a passkey from the server: signing in with one (login,
       second factor) or creating one (passkeys/add, with its name). The browser
       asks for the passkey, the response goes to the step's `follow`. -->
  <div class="viur-login-passkey">
    <wa-callout
      v-for="message in messages"
      :key="message"
      variant="danger"
      size="small"
    >
      {{ message }}
    </wa-callout>
    <wa-input
      v-if="creating"
      v-model="name"
      class="viur-login-passkey__name"
      name="name"
      :label="t('login.passkey_name')"
      :placeholder="t('login.passkey_name_hint')"
      autocomplete="off"
      @keydown.enter.prevent="start"
    ></wa-input>
    <wa-button
      variant="brand"
      :loading="busy || formState.loading"
      :disabled="!supported"
      data-passkey-start
      @click="start"
    >
      {{ t(creating ? "login.passkey_add" : "login.passkey_start") }}
    </wa-button>
  </div>
</template>

<script setup>
import { computed, inject, ref } from "vue"
import { useI18n } from "vue-i18n"
import { isPasskeyChallenge } from "./loginMethods.js"
import { createPasskey, getAssertion, isCreation, supportsPasskeys } from "./passkey.js"

const { t } = useI18n()
const formState = inject("formState")
// submit / loadStep of the ViForm
const formActions = inject("formActions", null)

const supported = supportsPasskeys()
const busy = ref(false)
const failure = ref(null)
// the server suggests a name for a new passkey (its `name`, empty by default)
const name = ref(formState.skel?.["name"] ?? "")

const creating = computed(() => isCreation(formState.skel?.["options"]))

// the server's errors of the last attempt, else what went wrong in the browser
const messages = computed(() => {
  if (!supported) return [t("login.passkey_unsupported")]
  const server = (formState.errors ?? []).map((error) => error?.["errorMessage"]).filter(Boolean)
  return failure.value ? [...server, failure.value] : server
})

async function start() {
  if (busy.value || !formActions) return
  busy.value = true
  failure.value = null
  const { state, options } = formState.skel
  let credential = null
  try {
    credential = creating.value ? await createPasskey(options) : await getAssertion(options)
  } catch {
    // cancelled, timed out, no passkey for this site or one that exists already
    failure.value = t("login.passkey_cancelled")
    busy.value = false
    return
  }
  const data = creating.value ? { state, credential, name: name.value } : { state, credential }
  try {
    await submit(data)
  } finally {
    busy.value = false
  }
}

/**
 * Posts the response of the browser instead of the bones of the step. A
 * rejection without new options (a login, a new passkey) loads the step again,
 * for new options, and keeps the server's errors.
 */
async function submit(data) {
  const url = formState.postUrl
  try {
    await formActions.submit({ url, data })
  } catch {
    // the form shows the failure
  }
  if (formState.status === "rejected" && !isPasskeyChallenge(formState.skel)) {
    const errors = formState.errors
    try {
      await formActions.loadStep(url)
    } catch {
      return
    }
    formState.errors = errors
  }
}
</script>

<style scoped>
.viur-login-passkey {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s, 0.75rem);
}
</style>
