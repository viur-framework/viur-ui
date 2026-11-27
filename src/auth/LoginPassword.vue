<template>
  <!-- The login with user name and password: the bones of the server, without
       categories, marked for password managers; its own submit (also on Enter)
       and the other login methods below. -->
  <div
    ref="root"
    class="viur-login-password"
    @keydown.enter="onEnter"
  >
    <wa-callout
      v-for="message in messages"
      :key="message"
      variant="danger"
      size="small"
    >
      {{ message }}
    </wa-callout>
    <div class="viur-login-password__bones">
      <template
        v-for="name in boneNames"
        :key="name"
      >
        <slot
          :bone-name="name"
          :widget="getBoneWidget(formState.structure[name]['type'])"
        ></slot>
      </template>
    </div>
    <wa-button
      variant="brand"
      class="viur-login-password__submit"
      :loading="formState.loading"
      @click="login?.submitForm()"
    >
      {{ t("login.login") }}
    </wa-button>
    <!-- the app's links of the password login, e.g. "lost password", the registration -->
    <div
      v-if="links.length"
      class="viur-login-password__links"
    >
      <wa-button
        v-for="link in links"
        :key="link.name"
        appearance="plain"
        size="small"
        :class="link.class"
        :data-link="link.name"
        @click="link.click()"
      >
        {{ link.label }}
      </wa-button>
    </div>
    <template v-if="others.length">
      <wa-divider></wa-divider>
      <LoginMethodList :methods="others" />
    </template>
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { getBoneWidget } from "../forms/bones/index.js"
import LoginMethodList from "./LoginMethodList.vue"

const { t } = useI18n()
const formState = inject("formState")
// { methods, submitForm(), … } of useLoginMethods
const login = inject("viurLogin", null)
const root = ref(null)

// the other methods of the choice, e.g. a passkey or Google
const others = computed(() => (login?.methods ?? []).filter((method) => !/\/password\/login$/.test(method.url)))

const links = computed(() => login?.passwordLinks ?? [])

// errors that belong to no field of the form (e.g. a rejected Google token)
const messages = computed(() =>
  (formState.errors ?? [])
    .filter((error) => !formState.structure?.[error?.["fieldPath"]?.[0]])
    .map((error) => error?.["errorMessage"])
    .filter(Boolean)
)

/** Enter in a field signs in, like the submit of a login form. */
function onEnter(event) {
  if (event.target.closest?.(".viur-login-methods")) return
  event.preventDefault()
  login?.submitForm()
}

// the visible bones in the order of the structure
const boneNames = computed(() =>
  Object.entries(formState.structure ?? {})
    .filter(([, bone]) => bone?.["visible"] !== false)
    .map(([name]) => name)
)

// autocomplete of the inputs of a bone, so that password managers fill them
const AUTOCOMPLETE = { name: "username", password: "current-password" }

function markInputs() {
  for (const [name, value] of Object.entries(AUTOCOMPLETE)) {
    for (const input of root.value?.querySelectorAll(`wa-input[name="${name}"]`) ?? []) {
      // a property of wa-input, like the binding of the password bone
      if (input.autocomplete !== value) input.autocomplete = value
    }
  }
}

// the widgets of the bones render later (loaded on demand) and wa-input may be
// defined later still, which drops a property set before: mark them as they appear
let observer = null
onMounted(() => {
  markInputs()
  observer = new MutationObserver(markInputs)
  observer.observe(root.value, { childList: true, subtree: true })
  customElements
    .whenDefined("wa-input")
    .then(markInputs)
    .catch(() => {})
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.viur-login-password {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s, 0.75rem);
}

.viur-login-password__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.viur-login-password__bones {
  display: flex;
  flex-direction: column;
}
</style>
