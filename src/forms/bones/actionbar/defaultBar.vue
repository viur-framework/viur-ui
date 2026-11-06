<template>
  <div class="actionbar">
    <wa-button
      v-if="boneState.multiple && !readonly"
      variant="danger"
      :title="$t('bone.delAll')"
      appearance="outlined"
      class="delete-btn"
      @click="handleRemove(lang)"
    >
      {{ $t("bone.delAll") }}
    </wa-button>

    <wa-button
      v-if="boneState.multiple && !readonly"
      variant="success"
      :title="$t('bone.add')"
      appearance="outlined"
      class="add-btn"
      @click="handleAdd(lang)"
    >
      <wa-icon
        slot="start"
        name="plus"
      ></wa-icon>
      {{ $t("bone.add") }}
      <template v-if="state.counter > 1">({{ state.counter }})</template>
    </wa-button>
  </div>
</template>

<script setup>
import { reactive, defineComponent, onMounted, inject } from "vue"

const props = defineProps({
  name: String,
  value: Object,
  index: Number,
  lang: String,
  readonly: Boolean,
  params: Object,
})

const emit = defineEmits(["change"])

const boneState = inject("boneState")
const state = reactive({
  counter: 0,
  debounce: null,
})
const addMultipleEntry = inject("addMultipleEntry")
const removeMultipleEntries = inject("removeMultipleEntries")

function handleAdd() {
  state.counter += 1
  let delay = 200
  if (state.counter > 1) {
    delay = 500
  }
  if (state.debounce) {
    clearTimeout(state.debounce)
  }
  state.debounce = setTimeout(() => {
    for (let i = state.counter; i--;) {
      addMultipleEntry(props.lang)
    }
    state.counter = 0
  }, delay)
}

function handleRemove() {
  let delay = 200
  if (state.debounce) {
    clearTimeout(state.debounce)
  }
  state.debounce = setTimeout(() => {
    removeMultipleEntries(props.lang)
  }, delay)
}

onMounted(() => {
  if (!props.value || props.value.length === 0) {
    emit("change", props.name, [], props.lang) //init
  }
})
</script>

<style scoped>
.actionbar {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
}

.add-btn {
  margin-left: auto;
}
</style>
