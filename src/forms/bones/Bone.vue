<template>
  <div
    class="bone"
    :class="{
      'has-subbones': state.bonestructure['using'],
      'is-label-top': label === 'top',
      'is-label-hide': ['hide', 'placeholder'].includes(label),
      [`bone-type-${state.bonestructure['type'].split('.')[0]}`]: true,
      [`bone-name-${name}`]: true,
      'is-required': state.required,
    }"
  >
    <bone-label
      v-if="!['hide', 'placeholder'].includes(label)"
      :name="name"
      :debug="state.debug"
    >
      <span :class="{ 'bone-label-required': state.required }">{{ state.bonestructure["descr"] }}</span>
      <span
        v-if="state.required"
        class="bone-label-required"
      >
        *
      </span>
      <wa-tooltip
        v-if="state.hasTooltip && !showLabelInfo"
        :for="state.labelTooltipTargetId"
        placement="top"
      >
        {{ $t(state.bonestructure.params["tooltip"]) }}
      </wa-tooltip>
      <div
        v-if="state.hasTooltip && !showLabelInfo"
        :id="state.labelTooltipTargetId"
        class="bone-label-tooltip"
      >
        <wa-icon name="question"></wa-icon>
      </div>
    </bone-label>

    <wa-alert
      v-if="showLabelInfo && state.hasTooltip"
      variant="brand"
      open
      class="bone-label-info"
    >
      <wa-icon
        slot="icon"
        name="circle-info"
      ></wa-icon>
      {{ state.bonestructure.params["tooltip"] }}
    </wa-alert>
    <wa-tooltip
      class="bone-tooltip"
      :for="state.boneTooltipTargetId"
      :disabled="!state.showtooltip"
      :show-delay="1000"
    >
      {{ state.bonestructure?.["descr"] }}
    </wa-tooltip>

    <div
      :id="state.boneTooltipTargetId"
      class="bone-inner wa-stack wa-gap-xs"
      :class="{ 'is-required': state.required }"
    >
      <!-- Multilanguage: one tab per language -->
      <div
        v-if="state.multilanguage"
        class="bone-row wa-flank:end wa-gap-xs wa-align-items-start"
      >
        <wa-tab-group
          class="bone-lang-tabs"
          placement="bottom"
        >
          <template
            v-for="lang in state.languages"
            :key="name + '_' + lang + '_tab'"
          >
            <wa-tab
              slot="nav"
              :panel="'lang_' + lang"
              :active="state.currentLanguage === lang"
              :data-lang="lang"
              @click="updateLanguage"
            >
              {{ $t(lang) }}
            </wa-tab>
            <wa-tab-panel
              :name="'lang_' + lang"
              :active="state.currentLanguage === lang"
            >
              <bone-multiple-list
                :is="is"
                v-if="state.multiple && !BoneHasMultipleHandling(state.bonestructure['type'])"
                :name="name"
                :lang="lang"
                :entries="state.bonevalue?.[lang]"
                :bonestructure="state.bonestructure"
                :readonly="state.readonly"
                :actionbar="state.actionbar"
              />
              <!-- Value actions (delete, download …) per language on the entry -->
              <bone-single-entry
                :is="is"
                v-else
                :name="name"
                :lang="lang"
                :bonevalue="state.bonevalue?.[lang]"
                :bonestructure="state.bonestructure"
                :boneactions="false"
              />
            </wa-tab-panel>
          </template>
        </wa-tab-group>
        <!-- Bone actions across all languages (translate …) -->
        <div
          v-if="state.boneactions && !state.multiple && state.hasOptionalActions"
          class="wa-cluster wa-gap-xs"
        >
          <bone-actions
            :value="state.bonevalue"
            :name="name"
            :index="null"
            :bone="state.bonestructure"
            scope="bone"
            @change="updateValue"
          ></bone-actions>
        </div>
      </div>

      <!-- Single-language -->
      <template v-else>
        <bone-multiple-list
          :is="is"
          v-if="state.multiple && !BoneHasMultipleHandling(state.bonestructure['type'])"
          :name="name"
          :entries="state.bonevalue"
          :bonestructure="state.bonestructure"
          :readonly="state.readonly"
          :actionbar="state.actionbar"
        />
        <bone-single-entry
          :is="is"
          v-else
          :name="name"
          :bonevalue="state.bonevalue"
          :bonestructure="state.bonestructure"
          :boneactions="state.boneactions"
          :autofocus="autofocus"
        />
      </template>

      <!-- Error messages -->
      <template v-if="errorStyle === 'default'">
        <wa-callout
          v-for="message in state.errorMessages"
          :key="message"
          open
          :summary="$t('bone.errors_summary')"
          variant="danger"
          class="bone-error"
        >
          <wa-icon
            slot="icon"
            name="triangle-exclamation"
          ></wa-icon>
          <div class="bone-error">
            {{ errorMessage(message) }}
          </div>
        </wa-callout>
      </template>
      <template v-else>
        <div
          v-for="message in state.errorMessages"
          :key="message"
          style="font-size: 0.8em; color: red"
        >
          {{ errorMessage(message) }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/** @displayName Bone */
import { reactive, computed, onBeforeMount, provide, watch, watchEffect, inject, unref } from "vue"
import BoneLabel from "./BoneLabel.vue"
import { BoneHasMultipleHandling, getBoneActionbar } from "./index.js"
import rawBone from "./widgets/rawBone.vue"
import Utils, { buildBoneDomId } from "./utils.js"
import BoneActions from "./BoneActions.vue"
import { formConfiguredActions, resolveActions } from "./actions/index.js"
import BoneMultipleList from "./BoneMultipleList.vue"
import BoneSingleEntry from "./BoneSingleEntry.vue"
import { useI18n } from "vue-i18n"

/**
 * @emits change - Historical relic, not used directly
 * @emits change-internal {Object} - Internal event for ViForm: { name, value, lang, index, valid }
 * @emits handleClick - Historical relic, not used directly
 */
const emit = defineEmits(["change", "change-internal", "handleClick"])

const props = defineProps({
  is: {
    type: Object,
    default: rawBone, // The bone widget to render (e.g. StringBone), typically set by ViForm
  },
  name: {
    type: String,
    required: true, // Bone identifier; must match a key in structure and skel
  },
  languages: {
    type: Array,
    default: undefined, // Explicit language list; overrides bonestructure.languages
  },
  multiple: {
    type: Boolean,
    default: false, // Explicit multiple flag; overrides bonestructure.multiple
  },
  readonly: {
    type: Boolean,
    default: false, // Explicit readonly flag; overrides bonestructure.readonly
  },
  required: {
    type: Boolean,
    default: false, // Explicit required flag; overrides bonestructure.required
  },
  params: {
    type: Object,
    default: undefined, // Additional parameters; overrides bonestructure.params
  },
  value: {
    type: [Object, String, Number, Boolean, Array],
    default: undefined, // Explicit value; overrides skel[name] if set
  },
  structure: {
    type: Object,
    required: true, // Complete skeleton structure (all bone definitions of the form)
  },
  skel: {
    type: null,
    required: true, // Skeleton data object with the current values
  },
  errors: {
    type: Array,
    default: () => [], // Error array from the server response; entries with a matching fieldPath are displayed
  },
  label: {
    type: String,
    default: "normal", // Label mode: "normal" | "top" | "hide" | "placeholder"
    validator(value, props) {
      return ["normal", "top", "hide", "placeholder"].includes(value)
    },
  },
  boneactions: {
    type: Boolean,
    default: true, // Enables BoneActions (defaults per bone type + bone.params.actions). Explicitly false to suppress actions.
  },
  showLabelInfo: {
    type: Boolean,
    default: false, // Shows tooltip content as wa-alert instead of a tooltip
  },
  autofocus: {
    type: Boolean,
    default: false, // Passes autofocus on to the bone widget
  },
  defaultLanguage: {
    type: String,
    default: "de", // Language active by default in the multilang tab
  },
  showBoneTooltip: {
    type: Boolean,
    default: false, // Forces the tooltip on the input area
  },
  errorStyle: {
    type: String,
    default: "default", // Error display style: "default" (wa-alert) | "decent" (small red text)
    validator(value, props) {
      return ["default", "decent"].includes(value)
    },
  },
  debug: {
    type: Boolean,
    default: false, // Enables debug mode: bone name as tooltip on the label
  },
})
const { t } = useI18n()

const parentBonePath = inject("bonePath", [])
// For the visibility of the relation selector (action `when` checks for it).
const relationSelector = inject("viurRelationSelector", null)
// Form-wide action configuration (ViForm `actions` prop).
const boneActionsConfig = inject("boneActionsConfig", null)
/** Full bone path as an array for nested bone DOM IDs. @returns {ComputedRef<string[]>} */
const bonePath = computed(() => [...(unref(parentBonePath) ?? []), props.name])
provide("bonePath", bonePath)

/**
 * Checks whether an object contains only null values or empty arrays.
 * @param {Object} obj - The object to check
 * @returns {boolean}
 */
function isObjectEmpty(obj) {
  for (const [, value] of Object.entries(obj)) {
    if (value !== null) {
      if (Array.isArray(value) && value.length > 0) {
        return false
      } else if (!Array.isArray(value)) {
        return false
      }
    }
  }
  return true
}

const state = reactive({
  boneactions: computed(() => props.boneactions), // Whether BoneActions buttons are shown

  // The bone definition from the structure (e.g. type, params, languages)
  bonestructure: computed(() => {
    return props.structure?.[props.name]
  }),
  bonevalue: null, // Current bone value; initialized from skel and updated on changes
  multilanguage: computed(() => state.languages?.length && state.languages.length > 0), // Whether the bone is multilingual (at least one language configured)
  // Active language list: from props.languages or bonestructure.languages
  languages: computed(() => {
    if (props.languages) {
      return props.languages
    }
    return state.bonestructure && Object.keys(state.bonestructure).includes("languages")
      ? state.bonestructure["languages"]
      : []
  }),
  // Readonly status: props.readonly takes precedence over bonestructure.readonly
  readonly: computed(() => {
    if (props.readonly) {
      return props.readonly
    }
    return state.bonestructure && Object.keys(state.bonestructure).includes("readonly")
      ? state.bonestructure["readonly"]
      : false
  }),
  // Required status: props.required takes precedence over bonestructure.required
  required: computed(() => {
    if (props.required) {
      return props.required
    }
    return state.bonestructure && Object.keys(state.bonestructure).includes("required")
      ? state.bonestructure["required"]
      : false
  }),
  // Whether a tooltip text exists in bonestructure.params
  hasTooltip: computed(() => {
    // `params` always comes from viur-core as an object; if it's missing (custom renderer,
    // hand-built structure), the form must not die from it.
    return state.bonestructure && Object.keys(state.bonestructure["params"] ?? {}).includes("tooltip") ? true : false
  }),
  // Multiple status: props.multiple takes precedence over bonestructure.multiple
  multiple: computed(() => {
    if (props.multiple) {
      return props.multiple
    }
    return state.bonestructure && Object.keys(state.bonestructure).includes("multiple")
      ? state.bonestructure["multiple"]
      : false
  }),
  // Bone parameters: props.params take precedence over bonestructure.params
  params: computed(() => {
    if (props.params) {
      return props.params
    }
    return state.bonestructure && Object.keys(state.bonestructure).includes("params")
      ? state.bonestructure["params"]
      : {}
  }),
  // The actionbar component matching the bone type (e.g. for file, relational)
  actionbar: computed(() => {
    return getBoneActionbar(state.bonestructure?.["type"])
  }),
  // Whether the bone value is empty (null, empty array, empty object). Always false in readonly mode
  isEmpty: computed(() => {
    // Ignore the computation when the state is readonly
    if (state.readonly) return false

    // Check for null or undefined values
    if (!state.bonevalue) return true

    // Check if the value is an array with elements
    if (Array.isArray(state.bonevalue) && state.bonevalue.length === 0) return true

    // Check if the value is an object and not an array, then use helper function to check if it's empty
    if (state.bonevalue === Object(state.bonevalue) && !Array.isArray(state.bonevalue))
      return isObjectEmpty(state.bonevalue)

    return false
  }),
  // Error messages from props.errors, filtered to this bone (fieldPath + severity)
  errorMessages: computed(() => {
    let errors = []
    for (let error of props.errors) {
      if (
        error["fieldPath"][0] === props.name &&
        (error["fieldPath"].length === 1 ||
          ((state.multilanguage || state.multiple) && error["fieldPath"].length === 2) ||
          (state.multilanguage && state.multiple && error["fieldPath"].length === 3)) &&
        (error["severity"] > 2 || (state.required && (error["severity"] === 2 || error["severity"] === 0)))
      ) {
        //severity level???
        errors.push(error["errorMessage"])
      }
    }
    return errors
  }),
  label: computed(() => props.label), // Current label mode (mirrored from props.label)
  // Whether the bone tooltip is shown (with hidden/placeholder label or showBoneTooltip=true)
  showtooltip: computed(() => {
    if (props.showBoneTooltip) {
      return true
    }
    if (["hide", "placeholder"].includes(props.label)) {
      return true
    }
    return false
  }),
  defaultLanguage: computed(() => props.defaultLanguage), // Default language (mirrored from props.defaultLanguage)
  currentLanguage: null, // Currently active language tab
  debug: computed(() => props.debug), // Debug mode (mirrored from props.debug)
  labelTooltipTargetId: computed(() => buildBoneDomId(unref(bonePath) ?? [], "label-tooltip")), // Unique DOM ID for the label tooltip anchor
  boneTooltipTargetId: computed(() => buildBoneDomId(unref(bonePath) ?? [], "field-tooltip")), // Unique DOM ID for the bone tooltip anchor
  // Whether any actions can be resolved for this bone at all (for UI wrapper visibility).
  // WITH the same extra context and the same config merge order
  // as BoneActions itself — otherwise e.g. the relation selector
  // (when: relationSelector) drops out here and the wrapper hides an actually
  // existing action, or one deselected via ViForm stays "visible".
  resolvedActions: computed(() =>
    resolveActions(
      state.bonestructure,
      [...formConfiguredActions(boneActionsConfig, props.name), ...(state.bonestructure?.params?.actions ?? [])],
      state,
      { relationSelector }
    )
  ),
  hasActions: computed(() => state.resolvedActions.length > 0),
  // Required actions (delete, download …) appear even without `boneactions`
  hasRequiredActions: computed(() => state.resolvedActions.some((action) => action.required)),
  hasOptionalActions: computed(() => state.resolvedActions.some((action) => !action.required)),
})
provide("boneState", state)

/**
 * Assigns a stable _key attribute (UUID) to each object in the array if it doesn't have one yet.
 * Called via watchEffect to ensure stable :key bindings for vue-draggable.
 * @param {Array<Object>} arr - Multiple array whose entries are objects
 */
function ensureKeys(arr) {
  for (const it of arr) {
    // null entries occur, e.g. an empty spatial value [null, null]
    if (it && typeof it === "object" && !it._key) {
      it._key = crypto.randomUUID()
    }
  }
}
watchEffect(() => {
  if (Array.isArray(state.bonevalue)) {
    ensureKeys(state.bonevalue)
  }
})

/**
 * Updates state.bonevalue based on the lang/index context and fires change-internal.
 * With valid=false the value is not stored, but the event is still fired.
 * With state.readonly no event is fired.
 * @param {string} name - bone name
 * @param {unknown} val - new value
 * @param {string|null} lang - language key (for multilang bones)
 * @param {number|null} index - index (for multiple bones)
 * @param {boolean} valid - whether the value is valid
 * @returns {false|void}
 */
function updateValue(name, val, lang = null, index = null, valid = true) {
  if (val === undefined) return false
  if (valid) {
    if (lang) {
      if (!state.bonevalue) {
        state.bonevalue = {}
      }
      if (Object.keys(state.bonevalue).includes(lang) && index !== null) {
        state.bonevalue[lang][index] = val
      } else {
        state.bonevalue[lang] = val
      }
    } else if (index !== null) {
      state.bonevalue[index] = val
    } else {
      state.bonevalue = val
    }
  }

  if (state.readonly) return false

  let changeInternalObj = {
    name: name,
    value: val,
    lang: lang,
    index: index,
    valid: valid,
  }

  emit("change-internal", changeInternalObj)
}

/**
 * Adds a new entry to the multiple array.
 * Passed on to actionbars via provide("addMultipleEntry").
 * @param {string|null} lang - language key (for multilang bones)
 * @param {unknown} data - initial value of the new entry
 */
function addMultipleEntry(lang = null, data = "") {
  if (lang) {
    if (Object.keys(state.bonevalue).includes(lang)) {
      state.bonevalue[lang].push(data)
    } else {
      state.bonevalue[lang] = [data]
    }
  } else {
    if (state.bonevalue) {
      state.bonevalue.push(data)
    } else {
      state.bonevalue = [data]
    }
  }
}

/**
 * Fires updateValue after a multiple array mutation (splice).
 * @param {string|null} lang - language key or null
 */
function emitMultipleUpdate(lang) {
  if (lang) {
    updateValue(props.name, state.bonevalue[lang], lang)
  } else {
    updateValue(props.name, state.bonevalue)
  }
}

/**
 * Removes a single entry from the multiple array by index.
 * @param {number} index - index of the entry to remove
 * @param {string|null} lang - language key (for multilang bones)
 */
function removeMultipleEntry(index, lang = null) {
  if (lang) {
    state.bonevalue?.[lang].splice(index, 1)
  } else {
    state.bonevalue.splice(index, 1)
  }
  emitMultipleUpdate(lang)
}

/**
 * Removes all entries from the multiple array.
 * Passed on to actionbars via provide("removeMultipleEntries").
 * @param {string|null} lang - language key (for multilang bones)
 */
function removeMultipleEntries(lang = null) {
  if (lang) {
    state.bonevalue?.[lang].splice(0)
  } else {
    state.bonevalue.splice(0)
  }
  emitMultipleUpdate(lang)
}

/**
 * Switches the active language based on the data-lang attribute of the clicked tab element.
 * @param {Event} e - click event from the wa-tab
 */
function updateLanguage(e) {
  state.currentLanguage = e.target.dataset.lang
}

/**
 * Delegates to Utils.formatString — provided via provide("formatString") for relational bones.
 * @param {string} formatstr - format template
 * @param {unknown} boneValue - bone value inserted into the template
 * @returns {string}
 */
function formatString(formatstr, boneValue) {
  return Utils.formatString(formatstr, boneValue)
}

/**
 * Translates an error key via vue-i18n (errors.{key}). Falls back to the raw string.
 * @param {string} error - error key or raw error text
 * @returns {string}
 */
function errorMessage(error) {
  const key = `errors.${error}`
  let temp = t(key)
  if (temp === key) {
    temp = t(error)
  }
  return temp
}

watch(
  () => props.skel?.[props.name],
  () => {
    state.bonevalue = props.skel?.[props.name]
  }
)

// Pick the language tab: the requested language — if the bone doesn't have it,
// the first of its languages (otherwise NO tab would be active).
function pickLanguage(wanted) {
  if (!state.languages?.length || state.languages.includes(wanted)) return wanted
  return state.languages[0]
}

watch(
  () => state.defaultLanguage,
  (newVal) => {
    state.currentLanguage = pickLanguage(newVal)
  }
)

onBeforeMount(() => {
  if (props.value) {
    state.bonevalue = props.value
  } else {
    state.bonevalue = props.skel?.[props.name]
  }
  state.currentLanguage = pickLanguage(state.defaultLanguage)
})

provide("updateValue", updateValue)
provide("addMultipleEntry", addMultipleEntry)
// For the required action "removeEntry" (row X of the multiple lists).
provide("removeMultipleEntry", removeMultipleEntry)
provide("removeMultipleEntries", removeMultipleEntries)
provide("formatString", formatString)
</script>

<style scoped>
@layer foundation.form {
  /* Bone wrapper: label left, content right. Wraps below the label as soon as the
     content gets less than 20rem in its own container (not the viewport), so nested
     forms stack too. The content's huge flex-grow keeps the label at ~235px while
     side by side; once wrapped, the label spans the full width. */
  .bone {
    display: flex;
    flex-wrap: wrap;
    gap: var(--wa-space-s);
    margin-bottom: 20px;

    & > :deep(.bone-label) {
      flex: 1 1 235px;
    }

    & > .bone-inner {
      flex: 999 1 20rem;
      min-width: 0;
    }

    & > .bone-label-info {
      flex-basis: 100%;
    }

    /* Label above the content or none at all: one column at every width */
    &.is-label-top,
    &.is-label-hide {
      flex-direction: column;
      flex-wrap: nowrap;

      /* in a column the 235px basis of the label would become its height */
      & > :deep(.bone-label) {
        flex: 0 0 auto;
      }

      & > .bone-inner {
        flex: 1 1 auto;
      }
    }
  }
  .bone-label-required {
    color: var(--wa-color-brand-50);
    font-weight: 700;
  }

  /* Error callout below the bone content */
  wa-callout.bone-error {
    padding: var(--wa-space-xs);
    border: 1px solid var(--wa-color-border-loud);
    border-radius: var(--wa-border-radius-m);
    color: var(--wa-color-on-quiet);

    & wa-icon {
      margin-inline-end: var(--wa-space-2xs);
    }
  }

  /* Language switcher: tabs below the input field (multilang bones) */
  .bone-lang-tabs {
    width: 100%;
    --track-width: 0;

    &::part(body) {
      overflow-x: hidden;
    }

    & wa-tab-panel::part(base) {
      padding: 0;
    }

    & wa-tab {
      &::part(base) {
        padding: var(--wa-space-xs);
        background-color: var(--wa-color-neutral-80);
        border-radius: 0;
        border-left: 1px solid var(--wa-color-border-loud);
        border-bottom: 1px solid var(--wa-color-border-loud);
      }

      &:hover::part(base) {
        background-color: var(--wa-color-neutral-90);
      }

      &[aria-selected="true"] {
        &::part(base) {
          border-bottom: 2px solid var(--wa-color-brand-50);
          background-color: var(--wa-color-fill-quiet);
        }
      }

      /* rounded outer corners; neighboring tabs overlap by 1px */
      &:first-child::part(base) {
        margin-left: 1rem;
        border-bottom-left-radius: 5px;
      }

      &:nth-last-child(2)::part(base) {
        border-bottom-right-radius: 5px;
        border-right: 1px solid var(--wa-color-border-loud);
      }

      &:not(:first-child)::part(base) {
        margin-left: -1px;
      }
    }
  }
}
</style>
<style>
* {
  box-sizing: border-box;
}
</style>
<!--
<style scoped>
@layer foundation.form {
  .bone-wrapper {
    display: grid;
    grid-template-columns: 235px 1fr;
    grid-gap: var(--wa-space-s);
    margin-bottom: 20px;

    &.bone-wrapper-record,
    &.label-top,
    &.has-subbones {
      display: flex;
      flex-direction: column;
      grid-gap: 0;

      & > :deep(.bone-name) {
        border-bottom-left-radius: 0;
        border-top-right-radius: var(--wa-border-radius-m);
        min-width: 235px;
      }

      & > .bone-inner-wrap {
        padding-top: var(--wa-space-s);
        border-top: 2px solid var(--wa-color-neutral-80);
        margin-bottom: 5px;
      }

      & .multiple-bone {
        border-bottom: 1px solid var(--wa-color-neutral-80);
        padding-bottom: var(--wa-space-s);
        margin-bottom: var(--wa-space-s);

        &:deep(wa-details) {
          &:last-child {
            &::part(base) {
              border-bottom: none;
            }
          }
        }
      }
    }

    &.label-hide {
      display: flex;
      flex-direction: column;
      grid-gap: 0;
    }

    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  }

  wa-tab-panel::part(base) {
    padding: 0;
  }

  .lang-tab {
    width: 100%;
    --track-width: 0;
    --indicator-color: var(--vi-background-color);
    --track-color: var(--vi-border-color);

    &::part(body) {
      padding-bottom: var(--wa-space-xs);
      overflow-x: hidden;
    }

    &::part(tabs) {
      border-top: 1px solid var(--vi-border-color);
    }

    & wa-tab {
      margin-top: -1px;

      &[aria-selected="true"] {
        z-index: 1;

        &::part(base) {
          background-color: var(--vi-background-color);
          border: 1px solid var(--vi-border-color);
          border-top: 1px solid var(--vi-background-color) !important;
          border-bottom: 2px solid var(--wa-color-brand-50) !important;
        }
      }

      &::part(base) {
        background-color: var(--wa-color-neutral-90);
        border: 1px solid var(--wa-color-neutral-70);
        border-top: 1px solid var(--vi-border-color);
        border-radius: 0;
        padding: var(--wa-space-xs);
        transition: all ease 0.3s;
      }

      &:hover {
        &::part(base) {
          background-color: var(--vi-background-color);
          border: 1px solid var(--vi-border-color);
        }
      }

      &:first-child {
        &::part(base) {
          border-bottom-left-radius: 5px;
        }
      }

      &:nth-last-child(2) {
        &::part(base) {
          border-bottom-right-radius: 5px;
        }
      }

      &:not(:first-child) {
        &::part(base) {
          margin-left: -1px;
        }
      }
    }
  }

  .multiple-placeholder {
    &:not(.readonly) {
      margin-bottom: var(--wa-space-xs);
    }

    & wa-input {
      &::part(base) {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        opacity: 0.7;
      }
    }

    @media (max-width: 900px) {
      & wa-input {
        &::part(base) {
          border-top-right-radius: 0;
          border-bottom-left-radius: var(--wa-border-radius-m);
        }
      }
    }
  }

  .multiple-bone {
    margin-bottom: var(--wa-space-xs);

    &:first-child {
      padding-top: var(--wa-space-xs);
    }

    & .bone-wrapper {
      margin-bottom: var(--wa-space-xs);
    }

    &:first-child {
      & :deep(.value-line) {
      }
    }
  }

  .bone-inner-wrap {
    min-width: 1px;

    & wa-alert {
      margin-top: var(--wa-space-xs);
      background-color: transparent;

      &::part(message) {
        padding: var(--wa-space-xs) var(--wa-space-s);
      }

      &::part(icon) {
        padding-left: var(--wa-space-s);
      }
    }
  }

  .label-info {
    &::part(base) {
      align-items: center;
      margin-left: 0.5em;
      background-color: var(--wa-color-info-95);
      border: none;
      overflow: visible;
    }

    &::part(message) {
      padding: var(--wa-space-s);
    }

    &::part(icon) {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background-color: var(--wa-color-surface-default);
      width: 1em;
      height: 1em;
      margin-left: -0.5em;
      padding-left: 0;
    }
  }

  .tooltip {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    padding-left: 0.4em;

    & wa-icon {
      background-color: var(--wa-color-info-50);
      color: #fff;
      padding: 0.4em;
      border-radius: 50%;
      font-size: 0.55em;
    }
  }

  wa-tooltip {
    &::part(body) {
      background-color: var(--wa-color-info-50);
    }

    &::part(base__arrow) {
      background-color: var(--wa-color-info-50);
    }
  }

  .required {
    color: var(--wa-color-brand-50);
    font-weight: 700;
  }

  :deep(wa-combobox) {
    &::part(input__base) {
      border: 1px solid var(--vi-border-color);
      box-shadow: none !important;
    }

    &::part(input__prefix) {
      display: none !important;
    }

    &::part(input__suffix) {
      display: none !important;
    }
  }

  wa-tooltip.bone-tooltip {
    &::part(body) {
      background-color: var(--wa-color-brand-50);
    }

    &::part(base__arrow) {
      background-color: var(--wa-color-brand-50);
    }
  }
}

.error-msg::part(base) {
  background-color: #ffecec;
  color: var(--wa-color-danger-30);
}

.wrapper-bone-row {
  display: flex;
  flex-direction: row;
  gap: var(--wa-space-xs);
}

.wrapper-bone-block {
  display: block;
  width: 100%;
}
</style>

<style>
wa-input[data-user-invalid]::part(base),
wa-select[data-user-invalid]::part(combobox),
wa-checkbox[data-user-invalid]::part(control) {
  border-color: var(--wa-color-danger-50);
}
</style>
-->
