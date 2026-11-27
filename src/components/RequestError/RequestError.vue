<template>
  <wa-callout
    v-if="error"
    class="request-error"
    variant="danger"
    role="alert"
  >
    <wa-icon
      slot="icon"
      name="triangle-exclamation"
    ></wa-icon>
    <strong
      v-if="heading"
      class="request-error__title"
    >
      {{ heading }}
    </strong>
    <div
      v-if="text"
      class="request-error__descr"
    >
      {{ text }}
    </div>
  </wa-callout>
</template>

<script setup>
import { computed } from "vue"

// Shows a failed request as viur-core reports it: status and title as the
// heading ("406 Not Acceptable"), the description below. Takes an HTTPError of
// the request layer; any other error shows its message only.
const props = defineProps({
  error: { type: [Object, String, null], default: null },
})

const heading = computed(() => {
  const status = props.error?.statusCode ?? null
  const title = props.error?.title || props.error?.statusText || ""
  return [status, title].filter(Boolean).join(" ")
})

const text = computed(() => {
  const error = props.error
  if (!error) return ""
  if (typeof error === "string") return error
  const descr = error.descr || error.message || ""
  // the message falls back to the status text: don't repeat the heading
  return descr && descr !== error.title && descr !== error.statusText ? descr : ""
})
</script>

<style scoped>
.request-error__descr {
  margin-block-start: var(--wa-space-2xs, 0.25rem);
}
</style>
