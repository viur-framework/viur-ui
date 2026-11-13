<template>
  <wa-input
    ref="emailBone"
    class="bone-widget bone-widget-email bone-widget-email-default"
    :class="[`bone-widget-email-${name}`]"
    :name="name"
    :disabled="boneState.readonly"
    type="email"
    :value="value"
    :required="
      boneState.bonestructure.required && !boneState.bonestructure.multiple && !boneState.bonestructure.languages
    "
    :placeholder="state.placeholder"
    :data-user-invalid="boneState.errorMessages.length === 0 ? undefined : true"
    @change="changeEvent"
    @input="changeEvent"
  ></wa-input>
</template>

<script setup>
import { reactive, onMounted, inject, ref, watchEffect, computed } from "vue"
import { useTimeoutFn } from "@vueuse/core"
/**
 * Single-line email input field with native browser validation.
 *
 * Renders a `<wa-input type="email">` and uses the browser's native Constraint
 * Validation API for format checking. With
 * `boneState.label === "placeholder"`, the bone description is shown as a
 * placeholder instead of as a label above.
 *
 * @displayName EmailBone
 *
 * @cssClass bone-widget - Base class of all bone widgets
 * @cssClass bone-widget-email - Identifies the bone type
 * @cssClass bone-widget-email-default - Default variant
 * @cssClass bone-widget-email-{name} - Dynamically set to the bone name, e.g. `bone-widget-email-email`
 */
defineOptions({
  inheritAttrs: false,
})
const props = defineProps({
  /** Bone name – passed as the first argument in every `change` event. */
  name: String,
  /** Current bone value. */
  value: [Object, String, Number, Boolean, Array],
  /** Index in the multiple array; `undefined` for a single value. */
  index: Number,
  /** Language key for multilingual bones, e.g. `"de"`. */
  lang: String,
  /** Bone structure (currently not actively used). */
  bone: Object,
  /** Focuses the input element after 600 ms. */
  autofocus: Boolean,
})

const emit = defineEmits([
  /**
   * Fired on every value change and on mount (initialization).
   * @arg {string} name - Bone name
   * @arg {string} value - Current input value
   * @arg {string|undefined} lang - Language key
   * @arg {number|undefined} index - Index in the multiple array
   */
  "change",
])

const boneState = inject("boneState")
const state = reactive({
  placeholder: computed(() => {
    if (boneState.label !== "placeholder") return undefined
    let name = boneState?.bonestructure?.descr
    if (boneState.bonestructure.required) {
      name += "*"
    }
    return name
  }),
})

const emailBone = ref(null)

function changeEvent(event) {
  emit("change", props.name, event.target.value, props.lang, props.index)
}

watchEffect(() => {
  if (props.autofocus) {
    if (emailBone.value && emailBone.value !== null && emailBone.value !== null) {
      const { start } = useTimeoutFn(() => {
        emailBone.value.focus()
      }, 600)

      start()
    }
  }
})

onMounted(() => {
  emit("change", props.name, props.value, props.lang, props.index) //init
})
</script>
