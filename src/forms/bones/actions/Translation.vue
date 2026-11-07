<template>
  <div class="translate-wrapper">
    <div class="translate-grid">
      <div class="translate-flex">
        <wa-textarea
          :value="state.value_de"
          :label="t('actions.translate.original', { lang: 'de' })"
          @change="updateValueDe"
        ></wa-textarea>
      </div>

      <div class="translate-icon-wrap">
        <wa-icon name="arrows-left-right"></wa-icon>
      </div>

      <div class="translate-flex">
        <wa-textarea
          :value="state.result || '-'"
          :label="t('actions.translate.target', { lang: state.currentLang })"
          @change="updateValue"
        ></wa-textarea>
      </div>
    </div>

    <div class="translate-footer">
      <span class="translate-small-print">
        {{ t("actions.aiHint") }}
      </span>
      <div></div>
      <wa-button
        size="small"
        variant="brand"
        :loading="state.loading"
        @click="translate"
      >
        {{ t("actions.translate.run") }}
      </wa-button>
    </div>
  </div>

  <div
    slot="footer"
    class="translate-dialog-footer"
  >
    <wa-button
      variant="danger"
      size="small"
      appearance="outlined"
      @click="CloseAction"
    >
      {{ $t("relation.abort") }}
    </wa-button>

    <div class="translate-dialog-footer-spacer"></div>

    <wa-button
      variant="success"
      appearance="outlined"
      size="small"
      :disabled="!state.nextlang"
      @click="nextlang"
    >
      {{ t("actions.translate.applyNext") }}
    </wa-button>
    <wa-button
      variant="success"
      size="small"
      @click="ApplySelection"
    >
      {{ t("actions.translate.apply", { lang: state.currentLang }) }}
    </wa-button>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n"
import { reactive, onMounted, computed, watch } from "vue"
import { createControllerFetch } from "../../../request/index.js"

const { t } = useI18n()

const props = defineProps({
  name: String,
  module: String,
  tabId: String,
  action: Object,
  params: Object,
})

const emit = defineEmits(["close", "next"])
const translateFetch = createControllerFetch({ endpoint: "translate", method: "POST" })

const state = reactive({
  result: null,
  currentLang: null,
  rawLang: computed(() => state.currentLang?.split("_")[0]),
  simple: computed(() => state.currentLang?.split("-x-")?.length === 2),
  value_de: null,
  loading: false,
  nextlang: computed(() => {
    const val = getValue()
    if (!val) return "de"
    for (const [l, v] of Object.entries(val)) {
      if ((!v || (Array.isArray(v) && (v.length === 0 || !v?.[props.params.index]))) && state.currentLang !== l) {
        return l
      }
    }
    return Object.keys(val).filter((x) => x !== "de")?.[0]
  }),
})

async function translate() {
  state.loading = true
  try {
    const fetchResult = translateFetch(
      "assistant",
      "/",
      {
        text: state.value_de,
        language: state.rawLang,
        characteristic: state.simple ? "simple" : undefined,
      },
      { immediate: false }
    )
    await fetchResult.execute()
    // v2 envelope carries the payload in `data`; fall back to the raw body for
    // non-envelope responses.
    const result = fetchResult.data.value
    state.result = result?.data ?? result
  } finally {
    state.loading = false
  }
}

function getValue(lang = null) {
  let val = props.params.boneState.bonevalue
  if (props.params.index !== null) {
    if (lang) {
      val = val?.[lang]
      val = val?.[props.params.index]
    }
  } else if (lang) {
    val = val?.[lang]
  }
  return val
}

onMounted(() => {
  state.value_de = getValue("de")
  state.currentLang = state.nextlang
  if (state.nextlang !== "de") {
    state.currentLang = props.params.boneState.currentLanguage
  }
  state.result = getValue(state.currentLang)
})

watch(
  () => getValue("de"),
  (newVal) => {
    state.value_de = newVal
  }
)

function updateValue(e) {
  state.result = e.target.value
}
function updateValueDe(e) {
  state.value_de = e.target.value
}

function nextlang() {
  emit("next", state.result, state.currentLang)
  state.currentLang = state.nextlang
  state.result = getValue(state.currentLang)
}

function CloseAction() {
  state.result = null
  emit("close")
}

function ApplySelection() {
  emit("close", state.result, state.currentLang)
}
</script>

<style scoped>
.translate-wrapper {
  padding: var(--wa-space-l);
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s);
}

.translate-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3em minmax(0, 1fr);
}

.translate-flex {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-xs);
}

.translate-icon-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.translate-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3em minmax(0, 1fr);
}

.translate-small-print {
  font-size: 0.7em;
}

wa-textarea {
  &::part(form-control-label) {
    margin-bottom: var(--wa-space-xs);
    font-weight: 600;
  }
}

.translate-dialog-footer {
  display: flex;
  flex-direction: row;
  gap: var(--wa-space-s);
}

.translate-dialog-footer-spacer {
  flex: 1;
}
</style>
