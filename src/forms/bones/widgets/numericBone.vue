<template>
  <wa-input
    ref="numericBone"
    class="bone-widget bone-widget-numeric bone-widget-numeric-default"
    :class="[`bone-widget-numeric-${name}`]"
    type="number"
    :disabled="boneState.readonly"
    :value="value"
    :min="state.minAmount"
    :max="state.maxAmount"
    :step="state.precision"
    :required="
      boneState.bonestructure.required && !boneState.bonestructure.multiple && !boneState.bonestructure.languages
    "
    :placeholder="state.placeholder"
    :data-user-invalid="boneState.errorMessages.length === 0 ? undefined : true"
    @change="changeEvent"
    @input="changeEvent"
  ></wa-input>
  <ul class="bone-widget-info">
    <li v-if="state.minAmount !== -9223372036854776000 && state.minAmount">
      {{ $t("bones.numeric.min", { val: state.minAmount }) }}
    </li>
    <li v-if="state.maxAmount !== 9223372036854776000 && state.maxAmount">
      {{ $t("bones.numeric.max", { val: state.maxAmount }) }}
    </li>
    <li v-if="state.precision">{{ $t("bones.numeric.precision", { val: boneState.bonestructure["precision"] }) }}</li>
  </ul>
</template>

<script setup>
import { reactive, onMounted, computed, inject, ref, watchEffect } from "vue"
import { useTimeoutFn } from "@vueuse/core"
/**
 * Numeric input field for integers and decimal values.
 *
 * Renders a `<wa-input type="number">` and optionally shows hints about
 * the minimum/maximum value and precision. Supports multiple languages
 * (`languages`) and multiple values (`multiple`). The step (`step`) is
 * calculated from `boneState.bonestructure.precision`.
 *
 * @displayName NumericBone
 *
 * @cssClass bone-widget - Base class of all bone widgets
 * @cssClass bone-widget-numeric - Identifies the bone type
 * @cssClass bone-widget-numeric-default - Default variant
 * @cssClass bone-widget-numeric-{name} - Dynamically set to the bone name, e.g. `bone-widget-numeric-amount`
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
   * @arg {string} value - Current input value (as a string)
   * @arg {string|undefined} lang - Language key
   * @arg {number|undefined} index - Index in the multiple array
   * @arg {boolean} [valid] - Validation status; missing on the init event
   */
  "change",
])

const boneState = inject("boneState")
const state = reactive({
  minAmount: computed(() => {
    return boneState.bonestructure["minAmount"]
  }),
  maxAmount: computed(() => {
    return boneState.bonestructure["maxAmount"]
  }),
  precision: computed(() => {
    if (boneState.bonestructure["precision"] > 0) {
      return parseFloat(`0.${"0".repeat(boneState.bonestructure["precision"] - 1)}1`)
    }
    return undefined
  }),
  placeholder: computed(() => {
    if (boneState.label !== "placeholder") return undefined
    let name = boneState?.bonestructure?.descr
    if (boneState.bonestructure.required) {
      name += "*"
    }
    return name
  }),
})

const numericBone = ref(null)

function changeEvent(event) {
  let valid = numericBone.value.reportValidity()
  emit("change", props.name, event.target.value, props.lang, props.index, valid)
}

watchEffect(() => {
  if (props.autofocus) {
    if (numericBone.value && numericBone.value !== null && numericBone.value !== null) {
      const { start } = useTimeoutFn(() => {
        numericBone.value.focus()
      }, 600)

      start()
    }
  }
})

onMounted(() => {
  emit("change", props.name, props.value == null ? "" : "" + props.value, props.lang, props.index) //init
})
</script>
