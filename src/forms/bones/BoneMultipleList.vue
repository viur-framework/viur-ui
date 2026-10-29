<template>
  <template v-if="entries?.length">
    <vue-draggable
      v-model="localEntries"
      :animation="150"
      handle=".bone-drag-button"
      class="wa-stack wa-gap-xs bone-multiple-list"
    >
      <div
        v-for="(val, index) in entries"
        :key="val?._key ? val._key : index + '_' + entries.length"
        class="bone-multiple-wrapper"
      >
        <bone-multiple-wrapper
          :readonly="!readonly"
          :index="index"
          :lang="lang"
          :name="name"
        >
          <component
            :is="is"
            :value="resolveValue(val, index)"
            :index="index"
            :lang="lang"
            :name="name"
            :bone="bonestructure"
            @change="updateValue"
          />
        </bone-multiple-wrapper>
      </div>
    </vue-draggable>
  </template>
  <div
    v-else
    class="bone-multiple-placeholder"
    :class="{ 'is-readonly': readonly }"
  >
    <slot name="empty">
      <wa-input
        readonly
        size="medium"
        :placeholder="$t('bone.no_entries')"
      />
    </slot>
  </div>
  <component
    :is="actionbar"
    v-if="!readonly && actionbar"
    :value="entries"
    :name="name"
    :lang="lang"
    @change="updateValue"
  />
</template>

<script setup>
import { computed, inject } from "vue"
import { VueDraggable } from "vue-draggable-plus"
import BoneMultipleWrapper from "./BoneMultipleWrapper.vue"

const props = defineProps({
  is: { type: Object, required: true },
  name: { type: String, required: true },
  lang: { type: String, default: null },
  entries: { type: Array, default: null },
  bonestructure: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  actionbar: { type: Object, default: null },
})

const updateValue = inject("updateValue")

const localEntries = computed({
  get: () => props.entries ?? [],
  set: (newVal) => updateValue(props.name, newVal, props.lang),
})

function resolveValue(val, index) {
  const defaultvalue = props.bonestructure?.defaultvalue
  if (!val && defaultvalue) {
    return props.lang ? defaultvalue[props.lang]?.[index] : defaultvalue?.[index]
  }
  return val
}
</script>
<style scoped>
.bone-multiple-list {
  background-color: var(--wa-color-surface-lowered);
  padding: var(--wa-space-xs);
  border-radius: var(--wa-border-radius-m);
  border: 1px solid var(--wa-color-surface-border);
}
</style>
