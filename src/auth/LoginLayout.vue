<template>
  <!-- The choice of the login method (viur-core 4: action "login", step
       "login"): a button per method instead of the select of the `provider`
       bone. With the password among them, useLoginMethods opens its form
       right away and the form offers the others. -->
  <div
    v-if="isChoice"
    class="viur-login-choice"
  >
    <wa-callout
      v-for="message in messages"
      :key="message"
      variant="danger"
      size="small"
    >
      {{ message }}
    </wa-callout>
    <LoginMethodList
      :methods="methods"
      primary-first
    />
  </div>

  <!-- several second factors after the primary authentication: a button per
       factor; the choice goes to the server, which follows to the factor -->
  <div
    v-else-if="isSecondFactor"
    class="viur-login-choice viur-login-second-factor"
  >
    <p class="viur-login-choice__hint">{{ t("login.second_factor") }}</p>
    <wa-callout
      v-for="message in messages"
      :key="message"
      variant="danger"
      size="small"
    >
      {{ message }}
    </wa-callout>
    <LoginMethodList
      :methods="secondFactors"
      :choose="chooseSecondFactor"
      primary-first
    />
  </div>

  <!-- signed in: the bones of an earlier step are still in the form -->
  <template v-else-if="formState.status === 'success'"></template>

  <!-- the passkey asks the browser (login and second factor) -->
  <LoginPasskey v-else-if="isPasskey" />

  <!-- a one-time code (authenticator app, TOTP, recovery code) -->
  <OtpLayout
    v-else-if="isOtp"
    v-slot="slotProps"
  >
    <slot v-bind="slotProps"></slot>
  </OtpLayout>

  <!-- user name and password, the other methods below -->
  <LoginPassword
    v-else-if="isPassword"
    v-slot="slotProps"
  >
    <slot v-bind="slotProps"></slot>
  </LoginPassword>

  <!-- every other step: as the form renders it by default -->
  <LayoutCategory
    v-else
    v-slot="slotProps"
  >
    <slot v-bind="slotProps"></slot>
  </LayoutCategory>
</template>

<script setup>
import { computed, inject } from "vue"
import { useI18n } from "vue-i18n"
import LayoutCategory from "../forms/layouts/LayoutCategory.vue"
import LoginMethodList from "./LoginMethodList.vue"
import LoginPasskey from "./LoginPasskey.vue"
import LoginPassword from "./LoginPassword.vue"
import OtpLayout from "./OtpLayout.vue"
import {
  isMethodChoice,
  isOtpStep,
  isPasskeyChallenge,
  isPasswordStep,
  isSecondFactorChoice,
  loginMethods,
} from "./loginMethods.js"

const { t } = useI18n()

const formState = inject("formState")
// { hidden(method), … } of useLoginMethods
const login = inject("viurLogin", null)

const isChoice = computed(() => isMethodChoice(formState))
const isSecondFactor = computed(() => isSecondFactorChoice(formState))
const isPasskey = computed(() => isPasskeyChallenge(formState.skel))
const isOtp = computed(() => isOtpStep(formState))
const isPassword = computed(() => isPasswordStep(formState))
const methods = computed(() => loginMethods(formState).filter((method) => !login?.hidden?.(method)))
// the second factors offered, in the order of the server (loginMethods reads the same bone)
const secondFactors = computed(() => loginMethods(formState))

/** The chosen second factor goes to "select_secondfactor"; its answer follows to the factor. */
function chooseSecondFactor(url) {
  return login?.submit({ data: { provider: url } })
}

// a rejected Google token comes back to the choice with its message
const messages = computed(() => (formState.errors ?? []).map((error) => error?.["errorMessage"]).filter(Boolean))
</script>

<style scoped>
.viur-login-choice__hint {
  margin: 0;
}

.viur-login-choice {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s, 0.75rem);
}
</style>
