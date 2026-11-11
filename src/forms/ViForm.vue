<template>
  <!-- Multi-step progress bar. Fully overridable via the `steps` slot — the
       slot props expose the envelope's step data plus helpers so a consumer can
       render any custom stepper. The default content is the built-in bar,
       shown when `showSteps` is set. -->
  <slot
    name="steps"
    :steps="state.steps"
    :current="state.step"
    :step-status="state.stepStatus"
    :status="state.status"
    :is-last-step="state.isLastStep"
    :step-index="stepIndex"
    :is-active="isStepActive"
    :is-done="isStepDone"
    :submit="submitStep"
    :loading="state.loading"
  >
    <div
      v-if="showSteps && state.steps"
      class="viform-steps"
      role="list"
    >
      <div
        v-for="(step, key) in state.steps"
        :key="key"
        class="viform-step"
        role="listitem"
        :class="{ 'is-active': isStepActive(key), 'is-done': isStepDone(key) }"
      >
        <span class="viform-step__marker">
          <wa-icon
            v-if="step['icon']"
            :name="step['icon']"
            :library="step['icon_library'] || 'default'"
          ></wa-icon>
        </span>
        <span class="viform-step__label">{{ step["label"] }}</span>
      </div>
    </div>
  </slot>

  <!-- List envelope (datatype === "list"): no form — expose the items for
       custom rendering. Slot props carry the list + flow actions. -->
  <slot
    v-if="state.datatype === 'list'"
    name="list"
    :items="state.list"
    :cursor="state.cursor"
    :orders="state.orders"
    :next="submitStep"
    :back="back"
    :is-first-step="state.isFirstStep"
    :is-last-step="state.isLastStep"
    :loading="state.loading"
    :current="state.step"
    :steps="state.steps"
    :errors="state.errors"
  >
    <ul class="viform-list">
      <li
        v-for="(item, i) in state.list || []"
        :key="item?.['key'] ?? i"
        class="viform-list__item"
      >
        {{ listLabel(item, i) }}
      </li>
    </ul>
  </slot>

  <form
    v-else
    v-bind="$attrs"
    :ref="(el) => (state.viformelement = el)"
    @submit.prevent.stop="() => {}"
  >
    <slot
      :structure="state.structure"
      :skel="state.skel"
      :errors="state.errors"
      :categories="state.categories"
    >
      <component
        :is="layout"
        v-slot="{ boneName, widget, visible, label }"
      >
        <bone
          :is="widget"
          v-if="widget !== undefined"
          v-show="visible === undefined ? state.structure[boneName]['visible'] : visible"
          :name="boneName"
          :autofocus="autofocus"
          :structure="state.structure"
          :skel="state.skel"
          :errors="state.errors"
          :boneactions="state.boneactions"
          :default-language="defaultLanguage"
          :label="label === undefined ? state.label : label"
          :error-style="errorStyle"
          :readonly="readonly"
          :debug="state.debug"
          @keypress.enter="handlePressEnter($event, boneName)"
          @change-internal="formUpdate"
        ></bone>
      </component>
    </slot>
  </form>

  <!-- Footer / action bar for the multi-step flow. Override via the `actions`
       slot; slot props expose the `next` (submit/advance) and `back` actions
       plus flow state. The default is a Back / Next|Submit bar. -->
  <slot
    name="actions"
    :next="submitStep"
    :back="back"
    :is-first-step="state.isFirstStep"
    :is-last-step="state.isLastStep"
    :loading="state.loading"
    :current="state.step"
    :steps="state.steps"
    :next-label="effectiveNextLabel"
    :submit-label="effectiveSubmitLabel"
    :back-label="effectiveBackLabel"
  >
    <div
      v-if="multistep"
      class="viform-actions"
    >
      <wa-button
        v-if="!state.isFirstStep"
        variant="neutral"
        :disabled="state.loading"
        @click="back"
      >
        {{ effectiveBackLabel }}
      </wa-button>
      <wa-button
        variant="brand"
        :loading="state.loading"
        @click="submitStep"
      >
        {{ state.isLastStep ? effectiveSubmitLabel : effectiveNextLabel }}
      </wa-button>
    </div>
  </slot>
</template>

<script setup>
import { useI18n } from "vue-i18n"
import { useFormUtils } from "./utils.js"
import { v1SelectionFollow } from "../request/index.js"
import { reactive, watch, onBeforeMount, onMounted, onBeforeUnmount, computed, provide, inject, ref } from "vue"
import { useDebounceFn } from "@vueuse/core"
import LayoutCategory from "./layouts/LayoutCategory.vue"
import Bone from "./bones/Bone.vue"

// The template has several root nodes (steps, list, form, actions), so Vue would
// drop attributes like `class` passed to <vi-form>. Forward them to the <form>.
defineOptions({
  inheritAttrs: false,
})

const emit = defineEmits(["change", "keypress-enter", "failed", "success", "step-change"])

const { t } = useI18n()
const effectiveNextLabel = computed(() => props.nextLabel ?? t("form.next"))
const effectiveSubmitLabel = computed(() => props.submitLabel ?? t("form.submit"))
const effectiveBackLabel = computed(() => props.backLabel ?? t("form.back"))
const props = defineProps({
  //modulename
  module: {
    type: String,
  },
  //like add, edit, clone ...
  action: null,
  // groupedlists subtype
  group: null,
  // edit or clone need a existing skelkey
  skelkey: null,
  // trees need a skeltype like leaf or node
  skeltype: null,
  // use skey or not
  secure: {
    type: Boolean,
    default: true,
  },
  // feed the message store (feedback after saving, login errors, …) — only
  // effective when the app installed Pinia; false keeps this form silent
  useMessageStore: {
    type: Boolean,
    default: true,
  },
  //the above fields are needed for normal form.

  //if skel and structure defined this will be used instead of fetchData
  skel: {
    type: [Object, null, String],
    default: null,
  },
  structure: {
    type: [Object, Array],
    default: null,
  },

  // show only these bones
  bones: {
    type: Array,
    default: () => [],
  },
  //override server defaultvalues
  values: {
    type: Object,
    default: null,
  },
  //used for fetch data
  params: {
    type: Object,
    default: () => ({}),
  },
  // define the renderer default is json
  renderer: {
    type: String,
    default: import.meta.env.VITE_DEFAULT_RENDERER || "json",
  },
  // optionally pin the protocol version alongside the renderer (e.g. 2 / "v2"
  // / "v1"). Default null hits the unversioned endpoint (server aliases to the
  // newest wire format, envelope v2).
  version: {
    type: [String, Number, null],
    default: null,
  },
  useCategories: {
    type: Boolean,
    default: true,
  },
  collapsedCategories: {
    type: Array,
    default: () => [],
  },
  categoryDefaultname: {
    type: String,
    default: "Allgemein",
  },
  sendReadOnly: {
    type: Boolean,
    default: false,
  },
  // with `bones`: send only those bones (plus key), not every writable bone of the structure
  sendOnlyShownBones: {
    type: Boolean,
    default: false,
  },
  internal: {
    type: [Object, null],
    default: null,
  },
  boneactions: {
    type: Boolean,
    default: false,
  },
  /**
   * Form-wide action configuration for the bones — the same entries
   * as `bone.params.actions`: names/inline objects additionally ENABLE,
   * `"-name"` explicitly DISABLES (even overrides required actions).
   *
   *   :actions="['-removeEntry']"                             // ALL bones
   *   :actions="{ '*': ['debug'], tags: ['-removeEntry'] }"   // per bone
   *
   * Passed to the bones via provide("boneActionsConfig") and merged there BEFORE
   * `bone.params.actions` (bone-local is more specific; a minus
   * always wins, regardless of the source).
   */
  actions: {
    type: [Array, Object],
    default: null,
  },
  layout: {
    type: Object,
    default: LayoutCategory,
  },
  label: {
    type: String,
    default: "normal",
    validator(value, props) {
      return ["normal", "top", "hide", "placeholder"].includes(value)
    },
  },
  defaultLanguage: {
    type: String,
    default: "de",
  },
  fetchUrl: {
    type: [String, null],
    default: null,
  },
  errorStyle: {
    type: String,
    default: "default",
    validator(value, props) {
      return ["default", "decent"].includes(value)
    },
  },
  allowEnter: {
    type: Boolean,
    default: false,
  },
  autofocus: {
    default: false,
    type: Boolean,
  },
  readonly: {
    type: [Boolean, null],
    default: null,
  },
  debug: {
    type: Boolean,
    default: false,
  },
  // Follow-driven multi-step mode: GET-render the entry step, then POST each
  // step to the envelope's `follow` URL and advance until `status: "success"`.
  multistep: {
    type: Boolean,
    default: false,
  },
  // Render the built-in progress bar from the envelope's `steps` map. For a
  // custom stepper use the `steps` slot instead (its slot props expose steps,
  // current, stepStatus, status, isLastStep, stepIndex, isActive, isDone,
  // submit, loading); `showSteps` only gates the default built-in bar.
  showSteps: {
    type: Boolean,
    default: false,
  },
  // Labels for the built-in multistep action buttons.
  nextLabel: {
    type: [String, null],
    default: null,
  },
  submitLabel: {
    type: [String, null],
    default: null,
  },
  backLabel: {
    type: [String, null],
    default: null,
  },
  // add errors, from the outside (maybe relevant if form is build with slots)
  // errors: []
})

const state = reactive({
  skel: {}, // working data
  pristine: null, // values of the last server state (for resetForm)
  structure: {}, // working data, use dict!
  errors: [], // working data
  actionparams: {}, //actionskel parameters
  actionname: null, //lastaction name
  valids: {}, // local validation states
  loading: false, //loading state
  categories: [], //categories to render
  values: computed(() => props.values),
  internal: computed(() => props.internal),
  useCategories: computed(() => props.useCategories),
  label: computed(() => props.label),
  bones: computed(() => props.bones),
  boneactions: computed(() => props.boneactions),
  isValid: computed(() => {
    // is form valid?
    let validstate = true
    for (const [key, value] of Object.entries(state.valids)) {
      if (!value) {
        validstate = false
        break
      }
    }
    return validstate
  }),
  viformelement: ref(null),
  debug: computed(() => props.debug),
  readonly: computed(() => props.readonly),
  categoryDefaultname: computed(() => props.categoryDefaultname),
  failed: null,
  // multi-step envelope state (populated by applyResponseState)
  step: null, // current step key
  stepStatus: null, // current step outcome
  steps: null, // map of all steps {key: {icon, icon_library, label}}
  status: null, // overall action status
  postUrl: null, // where the current step submits to (envelope `follow`)
  datatype: null, // "entity" | "list" — shape of the current response
  list: null, // list items when datatype === "list" (else null)
  cursor: null, // list-only pagination cursor
  orders: [], // list-only ordering hints
  isLastStep: computed(() => {
    if (!state.steps) return false
    const keys = Object.keys(state.steps)
    return keys.length > 0 && state.step === keys[keys.length - 1]
  }),
  isFirstStep: computed(() => {
    if (!state.steps) return true
    const keys = Object.keys(state.steps)
    return keys.length === 0 || state.step === keys[0]
  }),
})

function stepIndex(key) {
  return state.steps ? Object.keys(state.steps).indexOf(key) : -1
}
function isStepActive(key) {
  return key === state.step
}
function isStepDone(key) {
  return stepIndex(key) < stepIndex(state.step)
}
// Best-effort label for the default #list rendering (overridden via the slot).
function listLabel(item, i) {
  if (item == null || typeof item !== "object") return String(item)
  if (typeof item["name"] === "string" && item["name"]) return item["name"]
  if (typeof item["key"] === "string" && item["key"]) return item["key"]
  return `#${i + 1}`
}
provide("formState", state)
// Form-wide action configuration (see actions prop) — computed so that
// a reactive prop change reaches the bones.
provide(
  "boneActionsConfig",
  computed(() => props.actions)
)
if (!props.internal) {
  provide("mainformState", state)
}

const {
  fetchData,
  sendData: sendDataNow,
  loadStep,
  resetForm,
  back,
  updateSkel,
  initForm,
  logics,
  reload,
} = useFormUtils(props, state)

// The change event is debounced: it breaks the feedback loop between nested
// forms and the outer form (outer skel -> props.skel -> initForm). A pending
// change of a nested form is therefore not yet in the outer state.skel, so
// the outermost form flushes them before it sends.
let pendingChange = null
const formUpdateEvent = useDebounceFn(flushChange, 500)

function flushChange() {
  if (pendingChange === null) return false
  const data = pendingChange
  pendingChange = null
  emit("change", data)
  return true
}

// Unmounted inside the debounce window (e.g. the view is left right after
// typing): emit the pending change now, or the last input never reaches the
// listener.
onBeforeUnmount(flushChange)

const nestedFlushes = props.internal ? inject("nestedFlushes", null) : new Set()
if (!props.internal) {
  provide("nestedFlushes", nestedFlushes)
} else if (nestedFlushes) {
  onMounted(() => nestedFlushes.add(flushChange))
  onBeforeUnmount(() => nestedFlushes.delete(flushChange))
}

function flushNestedForms() {
  // A flush can leave a pending change one level up (form in form), so repeat
  // until nothing is pending. ponytail: capped instead of proving termination.
  for (let pass = 0; pass < 10; pass++) {
    let flushed = false
    for (const flush of nestedFlushes) flushed = flush() || flushed
    if (!flushed) return
  }
}

function sendData(...args) {
  flushNestedForms()
  return sendDataNow(...args)
}

onBeforeMount(() => {
  reload()
})

watch(
  () => state.failed,
  (newVal, oldVal) => {
    emit("failed", state.failed)
  }
)

watch(
  () => props.skel,
  (oldVal, newVal) => {
    //dragging internalforms
    // structure wont be updated, cause of logic changes on structures
    initForm(props.skel, undefined, state.value)
    //rerun logics after dragging
    logics()
  },
  { deep: true }
)
watch(
  () => props.structure,
  (oldVal, newVal) => {
    //rerun logics if structure on mainform changes
    logics()
  },
  { deep: true }
)

function formUpdate(data) {
  updateSkel(data)
  pendingChange = data
  formUpdateEvent()
}

function handlePressEnter(ev, name) {
  // IF FLAG IS SET
  if (!props.allowEnter) {
    return
  }

  const value = ev.originalTarget.value

  // intercept event to adjust it so it triggers the same change event like @change-internal
  let data = {
    name: name,
    value: value,
    // TODO: needs to be implemented naturally and not interceptive
    lang: null,
    index: null,
    valid: true,
  }

  formUpdate(data)

  emit("keypress-enter")
}
provide("formUpdate", formUpdate)

// Multi-step driver: POST the current step to its `follow` URL, then advance.
// - rejected → stay on the step (errors were already applied by sendData)
// - success  → emit("success")
// - continue → GET the next step's `follow` and render it
async function submitStep() {
  if (state.loading) return
  try {
    // sendData returns the request-layer fetch result; its `.data.value` holds
    // the normalized v2 envelope.
    const fetchResult = await sendData(state.postUrl)
    const data = fetchResult?.data?.value
    // v2 delivers the next step's target as `follow`. The classic
    // v1 login chain doesn't have that — there the target is the selected value
    // (the provider selection lists URLs).
    const follow = data?.["follow"] ?? v1SelectionFollow(data)
    if (data?.["status"] === "success") {
      emit("success", data)
    } else if (data?.["status"] !== "rejected" && follow) {
      await loadStep(follow)
      emit("step-change", { step: state.step, steps: state.steps })
    }
    return data
  } catch (error) {
    // Invalid form (client-side) or a rejection/network error — sendData has
    // already surfaced it via state.errors / state.failed. Stay on the step.
    return
  }
}

defineExpose({ sendData, fetchData, loadStep, submitStep, back, updateSkel, reload, resetForm, state })
</script>

<style scoped>
.viform-steps {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-block-end: 1.5rem;
  flex-wrap: wrap;
  padding: var(--wa-space-m);
}

.viform-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1 1 0;
  min-width: max-content;
  color: var(--wa-color-neutral-60, #71717a);
}

.viform-step:not(:last-child)::after {
  content: "";
  flex: 1;
  height: 2px;
  background: var(--wa-color-neutral-90, #e4e4e7);
  margin-inline-start: 0.5rem;
}

.viform-step__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
  block-size: 2rem;
  border-radius: 50%;
  border: 2px solid currentColor;
  font-size: 1rem;
  flex: 0 0 auto;
}

.viform-step__label {
  font-weight: 500;
  white-space: nowrap;
}

.viform-step.is-active {
  color: var(--wa-color-brand-60, #2563eb);
}

.viform-step.is-done {
  color: var(--wa-color-success-40, #16a34a);
}

.viform-step.is-done .viform-step__marker,
.viform-step.is-active .viform-step__marker {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.viform-actions {
  display: flex;
  justify-content: flex-end;
  margin-block-start: 1.5rem;
}

/* Minimal default #list rendering — overridable via the `list` slot. */
.viform-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.viform-list__item {
  padding: 0.5rem 0.25rem;
  border-block-end: 1px solid var(--wa-color-neutral-90, #e4e4e7);
}
</style>
