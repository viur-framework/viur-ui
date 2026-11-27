<template>
  <!-- Login methods as buttons; Google as One Tap when a client id is known.
       Choosing is up to useLoginMethods (provide "viurLogin"). -->
  <div class="viur-login-methods">
    <template
      v-for="(method, index) in methods"
      :key="method.url"
    >
      <LoginGoogle
        v-if="method.name === 'google' && login?.googleClientId"
        :client-id="login.googleClientId"
        :url="oneTapUrl(method.url)"
        :submit="login.submit"
      />
      <wa-button
        v-else
        :variant="primaryFirst && index === 0 ? 'brand' : 'neutral'"
        :appearance="primaryFirst && index === 0 ? 'accent' : 'outlined'"
        :loading="login?.choosing === method.url"
        :disabled="!!login?.choosing"
        :data-provider="method.name"
        @click="choose ? choose(method.url) : login?.choose(method.url)"
      >
        {{ method.label }}
      </wa-button>
    </template>
  </div>
</template>

<script setup>
import { inject } from "vue"
import LoginGoogle from "./LoginGoogle.vue"
import { oneTapUrl } from "./loginMethods.js"

defineProps({
  /** `[{ url, label, name }]` as loginMethods() returns them */
  methods: { type: Array, required: true },
  /** the first method as the main button (the choice; not below a form) */
  primaryFirst: { type: Boolean, default: false },
  /** what a button does with its url; default: start the login method */
  choose: { type: Function, default: null },
})

// { choose(url), choosing, googleClientId, submit({ url, data }) } of useLoginMethods
const login = inject("viurLogin", null)
</script>

<style scoped>
.viur-login-methods {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s, 0.75rem);
}
</style>
