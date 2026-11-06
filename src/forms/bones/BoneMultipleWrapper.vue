<template>
  <div class="wa-flank wa-align-items-start wa-gap-xs bone-multiple-entry">
    <wa-button
      appearance="filled"
      :disabled="boneState.readonly"
      class="bone-drag-button"
    >
      <wa-icon name="grip-vertical"></wa-icon>
    </wa-button>
    <div class="wa-flank:end wa-gap-xs wa-align-items-start">
      <div class="value">
        <slot></slot>
      </div>
      <div class="wa-cluster wa-gap-xs">
        <!-- ALWAYS rendered: the row X is the required action "removeEntry"
             (actions/index.js) — without `boneactions`, BoneActions itself filters
             down to the required actions. -->
        <bone-actions
          :value="state.value"
          :name="name"
          :lang="lang"
          :index="index"
          :bone="boneState.bonestructure"
          @change="updateValue"
        ></bone-actions>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, inject, computed } from "vue"
import BoneActions from "./BoneActions.vue"

const props = defineProps({
  index: Number,
  name: String,
  lang: {
    default: null,
  },
})

const state = reactive({
  value: computed(() => {
    if (props.lang) {
      return boneState.bonevalue[props.lang][props.index]
    }
    return boneState.bonevalue[props.index]
  }),
})

const boneState = inject("boneState")
const updateValue = inject("updateValue")
</script>
<!--
<style scoped>
.value-line {
  display: flex;
  gap: var(--wa-space-xs);
  align-items: flex-start;
}

.value {
  flex: 1 1 100%;
  width: 1px;

  & :deep(wa-input) {
    &::part(base) {
      border-bottom-left-radius: var(--wa-border-radius-m);
      border-top-left-radius: var(--wa-border-radius-m);
    }
  }

  & :deep(.bone-wrapper) {
    & wa-input::part(base) {
      border-bottom-left-radius: 0;
      border-top-left-radius: 0;
    }
  }

  &:deep(wa-alert) {
    &::part(base) {
      margin-top: 0;
    }
  }
}

.delete-btn {
  transition: all ease 0.3s;
}

.drag-button {
  &::part(base) {
    aspect-ratio: 1;
  }
}
.row-wrapper {
  width: 100%;
  display: flex;
  flex-direction: row;
  gap: var(--wa-space-xs);
}
</style>
-->
