<template>
  <!-- Google One Tap: the button of Google Identity Services; its token goes
       to the `one_tap` of the Google login method. -->
  <div class="viur-login-google">
    <div
      ref="button"
      data-provider="google"
    ></div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue"
import { renderGoogleButton } from "./google.js"

const props = defineProps({
  /** OAuth client id of the Google login method */
  clientId: { type: String, required: true },
  /** where the token goes, e.g. "/json/user/google/one_tap" */
  url: { type: String, required: true },
  /** posts the token: `submit({ url, data })` of useLoginMethods */
  submit: { type: Function, required: true },
})
const emit = defineEmits(["error"])

const button = ref(null)

onMounted(() => {
  // as wide as the buttons of the other methods
  const width = button.value?.parentElement?.clientWidth || undefined
  renderGoogleButton(button.value, props.clientId, (token) => props.submit({ url: props.url, data: { token } }), {
    width,
  }).catch((error) => emit("error", error))
})
</script>

<style scoped>
.viur-login-google {
  display: flex;
  justify-content: center;
  min-height: 2.75rem;
}
</style>
