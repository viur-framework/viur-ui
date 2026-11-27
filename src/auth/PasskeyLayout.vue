<template>
  <!-- A ViForm step with the options of a passkey (e.g. passkeys/add, which
       has no structure of its own): the ceremony in the browser; every other
       step as the form renders it by default. -->
  <LoginPasskey v-if="isPasskey" />
  <LayoutCategory
    v-else
    v-slot="slotProps"
  >
    <slot v-bind="slotProps"></slot>
  </LayoutCategory>
</template>

<script setup>
import { computed, inject } from "vue"
import LayoutCategory from "../forms/layouts/LayoutCategory.vue"
import LoginPasskey from "./LoginPasskey.vue"
import { isPasskeyChallenge } from "./loginMethods.js"

const formState = inject("formState")
const isPasskey = computed(() => isPasskeyChallenge(formState.skel))
</script>
