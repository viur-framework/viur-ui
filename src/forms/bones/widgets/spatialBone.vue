<template>
  <div class="wa-stack wa-gap-xs">
    <wa-input
      v-model="state.valueLat"
      class="bone-widget bone-widget-spatial bone-widget-spatial-default"
      :class="([`bone-widget-spatial-${name}`], [`bone-widget-spatial-${name}-lat`])"
      index="lat"
      type="number"
      :name="name"
      :min="boneState.bonestructure.boundslat[0]"
      :max="boneState.bonestructure.boundslat[1]"
      :disabled="boneState.readonly"
      value-as-number
      step="0.000001"
      :placeholder="state.placeholder"
      :data-user-invalid="boneState.errorMessages.length === 0 ? undefined : true"
      @change="changeEvent"
    ></wa-input>

    <wa-input
      v-model="state.valueLng"
      class="bone-widget bone-widget-spatial bone-widget-spatial-default"
      :class="([`bone-widget-spatial-${name}`], [`bone-widget-spatial-${name}-long`])"
      index="lng"
      type="number"
      :name="name"
      :min="boneState.bonestructure.boundslng[0]"
      :max="boneState.bonestructure.boundslng[1]"
      :disabled="boneState.readonly"
      value-as-number
      step="0.000001"
      :placeholder="state.placeholder"
      :data-user-invalid="boneState.errorMessages.length === 0 ? undefined : true"
      @change="changeEvent"
    ></wa-input>
  </div>
</template>

<script setup>
import { reactive, onMounted, inject, computed, watch } from "vue"
/**
 * Coordinate input for geographic points (latitude / longitude).
 *
 * Renders two `<wa-input type="number">` fields for latitude and longitude.
 * The allowed value ranges are controlled via `boneState.bonestructure.boundslat`
 * and `boneState.bonestructure.boundslng`. Supports neither
 * multiple languages nor multiple values.
 *
 * @displayName SpatialBone
 *
 * @cssClass bone-widget - Base class of all bone widgets
 * @cssClass bone-widget-spatial - Identifies the bone type
 * @cssClass bone-widget-spatial-default - Default variant
 * @cssClass bone-widget-spatial-{name}-lat - Dynamically set for the latitude field
 * @cssClass bone-widget-spatial-{name}-long - Dynamically set for the longitude field
 */
defineOptions({
  inheritAttrs: false,
})
const props = defineProps({
  /** Bone name – passed as the first argument in every `change` event. */
  name: String,
  /** Current bone value as an array `[lat, lng]`. */
  value: [Object, String, Number, Boolean, Array],
  /** Index in the multiple array; `undefined` for a single value. */
  index: Number,
  /** Language key (SpatialBone does not support multilang). */
  lang: String,
  /** Bone structure (currently not actively used). */
  bone: Object,
  /** Focuses the first input element after mount. */
  autofocus: Boolean,
})

const emit = defineEmits([
  /**
   * Fired on every value change and on mount (initialization).
   * @arg {string} name - Bone name
   * @arg {[number, number]} value - Coordinates as `[lat, lng]`
   * @arg {string|undefined} lang - Language key
   * @arg {number|undefined} index - Index in the multiple array
   */
  "change",
])

const boneState = inject("boneState")
const state = reactive({
  valueLat: null,
  valueLng: null,
  placeholder: computed(() => {
    if (boneState.label !== "placeholder") return undefined
    let name = boneState?.bonestructure?.descr
    if (boneState.bonestructure.required) {
      name += "*"
    }
    return name
  }),
})

function changeEvent() {
  emit("change", props.name, [state.valueLat, state.valueLng], props.lang, props.index)
}

function readValue() {
  try {
    state.valueLat = props.value[0]
    state.valueLng = props.value[1]
  } catch (e) {}
}

// The value can change from outside, e.g. when the address widget geocodes.
watch(() => props.value, readValue)

onMounted(() => {
  readValue()
  emit("change", props.name, [state.valueLat, state.valueLng], props.lang, props.index) //init
})
</script>
