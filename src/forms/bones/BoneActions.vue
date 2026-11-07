<template>
  <template
    v-for="(action, i) in state.actions"
    :key="action.arg + '_' + name + '_' + lang + '_' + i"
  >
    <!-- title may be an i18n key (e.g. "bone.del") — plain text stays
         plain text ($te check, no missing-key warnings). -->
    <wa-button
      :disabled="isActionDisabled(action, ctx)"
      size="medium"
      appearance="outlined"
      :variant="action.variant ?? 'neutral'"
      :title="action.title && $te(action.title) ? $t(action.title) : action.title"
      @click="onClick(action)"
    >
      <wa-icon :name="action.icon"></wa-icon>
    </wa-button>

    <action-dialog
      v-if="action.type === 'assistant'"
      :open="action._opened"
      :name="bone?.descr"
      :module="bone?.module"
      :action="action"
      :params="{ name, value, index, lang, bone, boneState }"
      @close="onClose"
      @next="onNext"
    ></action-dialog>
  </template>
</template>

<script setup>
import { reactive, computed, onMounted, inject } from "vue"
import { resolveActions, isActionDisabled, getActionHandler, formConfiguredActions } from "./actions/index.js"
import { resolveRelationParams } from "./relationalSource.js"
import ActionDialog from "./actions/ActionDialog.vue"

const emit = defineEmits(["change"])

const props = defineProps({
  name: String,
  value: [Object, String, Number, Boolean, Array],
  index: Number,
  lang: String,
  bone: Object,
  /**
   * Which actions this bar shows:
   * - "entry": all with `boneactions`, otherwise only the required actions (default)
   * - "value": only the required actions — on the value of ONE language of a
   *   multilingual bone (delete/download only affect this language)
   * - "bone": only the rest — the bar next to the language tabs (translate …)
   */
  scope: {
    type: String,
    default: "entry",
    validator: (value) => ["entry", "value", "bone"].includes(value),
  },
})

const boneState = inject("boneState")
// Selector for relational bones provided by the HOST (e.g. an admin that
// opens a list dialog): `(request) => Promise<Row[]|null>`. Without a
// provider the corresponding action simply doesn't exist (`when` predicate).
const relationSelector = inject("viurRelationSelector", null)
// For multi-selection into multiple bones (appends further entries) and
// the required action "remove row".
const addMultipleEntry = inject("addMultipleEntry", null)
const removeMultipleEntry = inject("removeMultipleEntry", null)
// Form-wide action configuration (ViForm `actions` prop).
const boneActionsConfig = inject("boneActionsConfig", null)
// Extra query params for relation queries (ViForm `relationParams` prop).
const relationParams = inject("relationParams", null)

const state = reactive({
  actions: [],
})

/** Is this action bar inside a ROW of a multiple bone? */
const multipleRow = props.index !== null && props.index !== undefined

const ctx = computed(() => ({
  name: props.name,
  value: props.value,
  index: props.index,
  lang: props.lang,
  bone: props.bone,
  boneState,
  relationSelector,
  /** Extra query params of the form for loading relation targets (e.g. in a selection dialog). */
  relationParams: resolveRelationParams(relationParams, boneState?.bonestructure ?? props.bone),
  multipleRow,
  update: (val) => emit("change", props.name, val, props.lang, props.index),
  /** Append another entry to the multiple array (multi-selection). */
  appendEntry: (val) => addMultipleEntry?.(props.lang ?? null, val),
  /** Remove THIS row from the multiple array (required action). */
  removeEntry: () => removeMultipleEntry?.(props.index, props.lang ?? null),
}))

onMounted(() => {
  // Form configuration BEFORE the bone's own params.actions (bone-local
  // is more specific); minus entries always win regardless of source.
  const configured = [...formConfiguredActions(boneActionsConfig, props.name), ...(props.bone?.params?.actions ?? [])]
  const all = resolveActions(props.bone, configured, boneState, { relationSelector, multipleRow })
  // Without `boneactions` only the REQUIRED actions remain (scaffolding, e.g. the
  // row X) — the bar as a whole is opt-in, the scaffolding is not.
  if (props.scope === "bone") {
    state.actions = all.filter((action) => !action.required)
  } else if (props.scope === "value" || !boneState?.boneactions) {
    state.actions = all.filter((action) => action.required)
  } else {
    state.actions = all
  }
})

function onClick(action) {
  if (action.type === "assistant") {
    action._opened = true
  } else if (action.type === "callback") {
    const handler = getActionHandler(action.arg)
    handler?.(ctx.value)
  }
}

function onClose(val, lang, action) {
  action._opened = false
  if (val) emit("change", props.name, val, lang, props.index)
}

function onNext(val, lang, action) {
  if (val) emit("change", props.name, val, lang, props.index)
}
</script>
