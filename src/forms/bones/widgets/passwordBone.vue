<template>
  <div class="wa-stack wa-gap-2xs">
    <wa-input
      ref="passwordBone"
      v-model="state.value1"
      class="bone-widget bone-widget-password bone-widget-password-default"
      :class="([`bone-widget-password-${name}`], { 'has-check': state.needsConfirm })"
      :disabled="boneState.readonly"
      type="password"
      :name="name"
      :autocomplete="state.needsConfirm ? 'new-password' : 'current-password'"
      with-clear
      password-toggle="true"
      :placeholder="state.placeholder"
      :data-user-invalid="boneState.errorMessages.length === 0 ? undefined : true"
      @change="changeEvent"
      @wa-clear="state.value1 = ''"
      @keyup="changeEvent"
    >
      <wa-icon
        v-if="state.needsConfirm"
        slot="end"
        :name="state.equal && state.value1.length ? 'check' : 'xmark'"
      ></wa-icon>
    </wa-input>
    <wa-input
      v-if="state.needsConfirm"
      v-model="state.value2"
      class="bone-widget bone-widget-boolean bone-widget-boolean-default bone-widget-boolean-repeat bone-widget-password-check"
      :class="[`bone-widget-boolean-${name}`]"
      type="password"
      autocomplete="new-password"
      with-clear
      password-toggle="true"
      :placeholder="state.placeholder"
      :data-user-invalid="boneState.errorMessages.length === 0 ? undefined : true"
      @change="changeEvent"
      @wa-clear="state.value2 = ''"
      @keyup="changeEvent"
    >
      <wa-icon
        slot="end"
        :name="state.equal && state.value1.length ? 'check' : 'xmark'"
      ></wa-icon>
    </wa-input>
  </div>
  <ul class="bone-widget-errors">
    <li
      v-for="(error, index) in state.passwordInfo"
      :key="index"
    >
      {{ error }}
    </li>
    <li
      v-for="(error, index) in state.requiredPasswordInfo"
      :key="index"
      class="bone-widget-required-info"
    >
      {{ error }}
    </li>
  </ul>
</template>

<script setup>
import { reactive, onMounted, computed, inject, watch, ref, watchEffect } from "vue"
import { useTimeoutFn } from "@vueuse/core"
import { useI18n } from "vue-i18n"
/**
 * Password input field with confirmation and strength validation.
 *
 * Renders `<wa-input type="password">` — with a confirmation field IF the bone
 * comes with password tests at all (`bonestructure.tests`). A login form
 * receives a raw password bone without tests from the server
 * (`PasswordBone(raw=True, tests=(), test_threshold=0)`); a confirmation would be
 * wrong there — you enter an existing password, you don't set one.
 * In readonly mode the confirmation is omitted as well. Password tests
 * are configured via `boneState.bonestructure.tests` (array of `[regex, message, required]`
 * tuples). `boneState.bonestructure.test_threshold` defines
 * how many optional tests may fail.
 *
 * @displayName PasswordBone
 *
 * @cssClass bone-widget - Base class of all bone widgets
 * @cssClass bone-widget-password - Identifies the bone type
 * @cssClass bone-widget-password-default - Default variant
 * @cssClass bone-widget-password-{name} - Dynamically set to the bone name
 * @cssClass has-check - Set when not readonly; removes border-bottom-right-radius for a seamless transition to the confirmation field
 */
defineOptions({
  inheritAttrs: false,
})
const props = defineProps({
  /** Bone name – passed as the first argument in every `change` event. */
  name: String,
  /** Current bone value (mirrored in `state.value1`). */
  value: [Object, String, Number, Boolean, Array],
  /** Index in the multiple array; `undefined` for a single value. */
  index: Number,
  /** Language key for multilingual bones, e.g. `"de"`. */
  lang: String,
  /** Bone structure (currently not actively used). */
  bone: Object,
  /** Focuses the first password field after 600 ms. */
  autofocus: Boolean,
})

const emit = defineEmits([
  /**
   * Fired on every value change and on mount (initialization).
   * @arg {string} name - Bone name
   * @arg {string} value - Current password value (only if both fields match and the tests passed)
   * @arg {string|undefined} lang - Language key
   * @arg {number|undefined} index - Index in the multiple array
   * @arg {boolean} valid - `true` if the password is valid (tests passed + fields equal)
   */
  "change",
])

const { t } = useI18n()

const boneState = inject("boneState")
const state = reactive({
  value1: "",
  value2: null,
  equal: false,
  // Confirmation only if the bone comes with tests (= a password is being
  // SET). On login, the server delivers a raw bone without tests.
  needsConfirm: computed(() => !boneState.readonly && (boneState?.bonestructure?.["tests"]?.length ?? 0) > 0),
  passwordInfo: [],
  requiredPasswordInfo: [],
  placeholder: computed(() => {
    if (boneState.label !== "placeholder") return undefined
    let name = boneState?.bonestructure?.descr
    if (boneState.bonestructure.required) {
      name += "*"
    }
    return name
  }),
})

const passwordBone = ref(null)

function changeEvent(event) {
  // before the tests: they report a mismatch, and the keystroke that makes both equal counts
  state.equal = !state.needsConfirm || state.value1 === state.value2
  testPassword(state.value1)

  if (
    state.requiredPasswordInfo.length === 0 &&
    state.passwordInfo.length <= (boneState.bonestructure["test_threshold"] ?? 0)
  ) {
    emit("change", props.name, state.value1, props.lang, props.index, true)
  } else {
    emit("change", props.name, state.value1, props.lang, props.index, false)
  }
}

onMounted(() => {
  emit("change", props.name, props.value, props.lang, props.index) //init
})

function testPassword(password) {
  state.passwordInfo = []
  state.requiredPasswordInfo = []
  for (const test of boneState.bonestructure["tests"] ?? []) {
    if (!new RegExp(test[0]).test(password)) {
      if (test[2]) {
        state.requiredPasswordInfo.push(test[1])
      } else {
        state.passwordInfo.push(test[1])
      }
    }
  }
  if (state.needsConfirm && !state.equal) {
    state.requiredPasswordInfo.push(t("bones.password.mismatch"))
  }
  if (!state.value1) {
    state.requiredPasswordInfo.push(t("bones.password.empty"))
  }
}

watchEffect(() => {
  if (props.autofocus) {
    if (passwordBone.value && passwordBone.value !== null && passwordBone.value !== null) {
      const { start } = useTimeoutFn(() => {
        passwordBone.value.focus()
      }, 600)

      start()
    }
  }
})

watch(
  () => props.value,
  (newVal, oldVal) => {
    state.value1 = newVal
  }
)
</script>

<style scoped>
.bone-widget-errors {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-gap: 2px 7px;
  margin-top: var(--wa-space-xs);
  font-size: 0.7em;
  font-weight: bold;
}

.bone-widget-required-info {
  color: var(--wa-color-danger-50);
}
</style>
