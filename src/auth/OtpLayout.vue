<template>
  <!-- A step with a one-time code of a second factor (`otptoken`): the code as
       OtpBone (wa-otp-input), every other bone (e.g. secret and QR code of the
       setup of the authenticator app) as by default, in the order of the
       structure and without categories. -->
  <div class="viur-otp-form">
    <template
      v-for="name in boneNames"
      :key="name"
    >
      <slot
        :bone-name="name"
        :widget="name === OTP_BONE ? OtpBone : getBoneWidget(formState.structure[name]['type'])"
      ></slot>
    </template>
  </div>
</template>

<script setup>
import { computed, inject } from "vue"
import { getBoneWidget } from "../forms/bones/index.js"
import OtpBone from "./OtpBone.vue"
import { OTP_BONE } from "./loginMethods.js"

const formState = inject("formState")

// the visible bones in the order of the structure
const boneNames = computed(() =>
  Object.entries(formState.structure ?? {})
    .filter(([, bone]) => bone?.["visible"] !== false)
    .map(([name]) => name)
)
</script>

<style scoped>
.viur-otp-form {
  display: flex;
  flex-direction: column;
}
</style>
