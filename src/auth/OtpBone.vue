<template>
  <wa-otp-input
    ref="input"
    class="bone-widget bone-widget-otp"
    :class="[`bone-widget-otp-${name}`]"
    :name="name"
    :label="label"
    :length="config.length"
    :format="config.format"
    :type="config.type"
    :case="config.case"
    autocomplete="one-time-code"
    :required="!!boneState.bonestructure.required"
    :disabled="boneState.readonly"
    :value="value == null ? '' : String(value)"
    :data-user-invalid="boneState.errorMessages.length === 0 ? null : true"
    @input="changeEvent"
    @change="changeEvent"
    @wa-complete="completeEvent"
  ></wa-otp-input>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, ref, watchEffect } from "vue"

/**
 * One-time code of a second factor (`otptoken` of viur-core) as `<wa-otp-input>`,
 * one segment per character.
 *
 * A numeric bone (authenticator app, TOTP) takes as many digits as its `max`
 * has (999999 → 6); a string bone takes a recovery code, `XXXX-XXXX-XXXX-XXXX`.
 * A complete code submits the step of the form (provide "formActions" of ViForm).
 *
 * @displayName OtpBone
 *
 * @cssClass bone-widget - Base class of all bone widgets
 * @cssClass bone-widget-otp - Identifies the widget
 * @cssClass bone-widget-otp-{name} - Dynamically set to the bone name, e.g. `bone-widget-otp-otptoken`
 */
defineOptions({
  inheritAttrs: false,
})
const props = defineProps({
  /** Bone name – passed as the first argument in every `change` event. */
  name: String,
  /** Current bone value. */
  value: [String, Number],
  /** Index in the multiple array; `undefined` for a single value. */
  index: Number,
  /** Language key for multilingual bones. */
  lang: String,
  /** Bone structure (not used; the structure comes from boneState). */
  bone: Object,
  /** Focuses the first segment once the widget is shown. */
  autofocus: Boolean,
})

const emit = defineEmits([
  /**
   * Fired on every change of the code and on mount (initialization).
   * @arg {string} name - Bone name
   * @arg {string} value - The code entered so far
   * @arg {string|undefined} lang - Language key
   * @arg {number|undefined} index - Index in the multiple array
   * @arg {boolean} [valid] - Validation status; missing on the init event
   */
  "change",
])

const boneState = inject("boneState")
// submit / loadStep of the ViForm, when the widget sits in one
const formActions = inject("formActions", null)
const input = ref(null)

// recovery codes of viur-core: four groups of four letters and digits
const RECOVERY_FORMAT = "####-####-####-####"

const config = computed(() => {
  const bone = boneState.bonestructure ?? {}
  if (String(bone.type ?? "").startsWith("numeric")) {
    return { length: String(bone.max ?? 999999).length, format: undefined, type: "numeric", case: "preserve" }
  }
  return { length: undefined, format: RECOVERY_FORMAT, type: "alphanumeric", case: "upper" }
})

// with labels as placeholders, the bone shows none: the input carries it
const label = computed(() => (boneState.label === "placeholder" ? boneState.bonestructure?.descr : undefined))

function changeEvent(event) {
  const valid = input.value?.checkValidity?.() ?? true
  emit("change", props.name, event.target.value, props.lang, props.index, valid)
}

/** The code is complete: take it and submit the step (the form validates it first). */
function completeEvent(event) {
  event.preventDefault() // no native form submit; the ViForm sends the step
  emit("change", props.name, event.target.value, props.lang, props.index, true)
  nextTick(() => formActions?.submit())
}

watchEffect(() => {
  if (props.autofocus && input.value) setTimeout(() => input.value?.focus(), 600)
})

onMounted(() => {
  emit("change", props.name, props.value, props.lang, props.index) // init
})
</script>
