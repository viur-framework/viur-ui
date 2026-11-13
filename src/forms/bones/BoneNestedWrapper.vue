<template>
  <wa-alert
    v-if="!state.globalRegistration"
    open
    variant="danger"
  >
    In Order to use this Bone register the bone component globally in your main file
  </wa-alert>
  <div
    v-else
    class="form"
  >
    <vi-form
      ref="skelRef"
      :internal="mainformState"
      :skel="value"
      :structure="bone['using']"
      :renderer="state.renderer"
      :use-categories="mainformState.useCategories && bone?.params?.['categoryDefaultname'] !== null"
      :category-defaultname="nestedCategory()"
      :collapsed-categories="
        state.isLastEntry ? [] : bone?.params?.['collapsedCategories'] ? bone?.params?.['collapsedCategories'] : []
      "
      :readonly="mainformState.readonly || boneState?.readonly || readonly"
      :boneactions="mainformState.boneactions"
      :actions="parentActionsConfig"
      @change="changeEvent"
    ></vi-form>
  </div>
</template>

<script setup>
import {
  reactive,
  defineComponent,
  onMounted,
  inject,
  computed,
  getCurrentInstance,
  ref,
  provide,
  unref,
  toRaw,
} from "vue"
import { getBoneWidget } from "./index.js"
import ViForm from "../ViForm.vue"

const emit = defineEmits(["change"])
const props = defineProps({
  name: String,
  value: null,
  index: Number,
  lang: String,
  readonly: Boolean,
  params: Object,
  bone: Object,
})
const skelRef = ref(null)
const boneState = inject("boneState")
const mainformState = inject("mainformState")
// Action configuration of the surrounding form (ViForm `actions`) — the
// subform would otherwise provide its own (empty) one.
const parentActionsConfig = inject("boneActionsConfig", null)
const parentBonePath = inject("bonePath", [])
const bonePath = computed(() => {
  const path = [...(unref(parentBonePath) ?? []), props.name]

  if (props.lang) {
    path.push(`lang-${props.lang}`)
  }

  if (props.index !== null && props.index !== undefined) {
    path.push(`idx-${props.index}`)
  }

  return path
})
provide("bonePath", bonePath)
const state = reactive({
  renderer: import.meta.env.VITE_DEFAULT_RENDERER || "json",
  globalRegistration: false,
  isLastEntry: computed(() => {
    if (!props.bone["multiple"]) return false

    let val = mainformState.skel[props.name]
    if (props.lang) {
      val = mainformState.skel[props.name][props.lang]
    }
    if (!val) {
      return false
    }
    return val.length - 1 === props.index
  }),
})

function changeEvent(val) {
  val["value"] = skelRef.value.state.skel // send whole form
  val["name"] = props.name
  val["index"] = props.index
  val["lang"] = props.lang
  emit("change", val)
}

onMounted(() => {
  let app = getCurrentInstance().appContext
  if (app.components.Bone) {
    state.globalRegistration = true
  } else {
    state.globalRegistration = false
  }

  let val = {}
  if (props.value) val = props.value

  for (const [bonename, boneStructure] of Object.entries(props.bone["using"])) {
    if (!Object.keys(val).includes(bonename) && boneStructure["defaultvalue"]) {
      // Copy, never share: a multilanguage or multiple defaultvalue is an object,
      // and handing the same one to every new entry makes them all change together
      // (and taints the structure's defaultvalue). toRaw first — structuredClone
      // cannot clone a reactive proxy.
      val[bonename] = structuredClone(toRaw(boneStructure["defaultvalue"]))
    }
  }

  emit("change", props.name, val, props.lang, props.index) //init
})
function nestedCategory() {
  if (props.bone?.params?.["categoryDefaultname"]) {
    return props.bone.params["categoryDefaultname"]
  } else if (props.bone?.format) {
    return props.bone.format
  }
  return undefined
}
</script>
<style scoped>
.form {
  width: 100%;
  position: relative;
}
</style>
