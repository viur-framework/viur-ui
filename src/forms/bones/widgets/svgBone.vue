<template>
  <div
    v-safe-html="value"
    class="bone-widget bone-widget-raw bone-widget-raw-svg"
    :class="[`bone-widget-raw-${name}`]"
  ></div>
</template>

<script setup>
import { onMounted } from "vue"
import { vSafeHtml } from "../../../vite/safeHtml.js"
/**
 * Read-only display of an SVG image delivered by the server, e.g. the QR code of the
 * authenticator setup (`raw.svg`). The markup is sanitized with DOMPurify before it
 * is rendered.
 *
 * @displayName SvgBone
 *
 * @cssClass bone-widget - Base class of all bone widgets
 * @cssClass bone-widget-raw - Identifies the bone type
 * @cssClass bone-widget-raw-svg - SVG variant
 * @cssClass bone-widget-raw-{name} - Dynamically set to the bone name, e.g. `bone-widget-raw-qrcode`
 */
defineOptions({
  inheritAttrs: false,
})
const props = defineProps({
  /** Bone name – passed as the first argument in every `change` event. */
  name: String,
  /** SVG markup. */
  value: [Object, String, Number, Boolean, Array],
  /** Index in the multiple array; `undefined` for a single value. */
  index: Number,
  /** Language key for multilingual bones, e.g. `"de"`. */
  lang: String,
  /** Bone structure (currently not actively used). */
  bone: Object,
  /** Not focusable; accepted for a uniform widget interface. */
  autofocus: Boolean,
})

const emit = defineEmits([
  /**
   * Fired on mount (initialization); the image cannot be edited.
   * @arg {string} name - Bone name
   * @arg {string} value - SVG markup
   * @arg {string|undefined} lang - Language key
   * @arg {number|undefined} index - Index in the multiple array
   */
  "change",
])

onMounted(() => {
  emit("change", props.name, props.value, props.lang, props.index) //init
})
</script>

<style scoped>
.bone-widget-raw-svg :deep(svg) {
  display: block;
  width: min(14rem, 100%);
  height: auto;
}
</style>
