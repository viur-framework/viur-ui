<template>
  <div class="image-description-wrapper">
    <div class="image-description-grid">
      <div>
        <img
          :src="state.url"
          alt=""
          draggable="false"
          style="height: 50px"
        />
      </div>

      <div class="image-description-flex">
        <wa-tab-group
          v-if="state.value"
          class="bone-lang-tabs"
          placement="bottom"
        >
          <template
            v-for="(_val, lang) in state.value"
            :key="lang + '_tab'"
          >
            <wa-tab
              slot="nav"
              :panel="'lang_' + lang"
              :disabled="state.loading"
              @click="state.currentLang = lang"
            >
              {{ $t(lang) }}
            </wa-tab>

            <wa-tab-panel :name="'lang_' + lang">
              <wa-textarea
                :value="state.value[lang]"
                :label="t('actions.describeImage.label', { lang })"
                @change="updateValue($event, lang)"
              ></wa-textarea>
            </wa-tab-panel>
          </template>
        </wa-tab-group>

        <wa-input
          v-model="state.prompt"
          :placeholder="t('actions.describeImage.instructions')"
        ></wa-input>
        <span class="image-description-small-print">
          {{ t("actions.aiHint") }}
        </span>
        <wa-button
          size="small"
          variant="brand"
          :loading="state.loading"
          @click="describe"
        >
          {{ t("actions.describeImage.run") }}
        </wa-button>
      </div>
    </div>
  </div>

  <div
    slot="footer"
    class="footer"
  >
    <wa-button
      variant="danger"
      size="small"
      appearance="outlined"
      @click="CloseAction"
    >
      {{ $t("relation.abort") }}
    </wa-button>

    <wa-button
      variant="success"
      size="small"
      @click="ApplySelection"
    >
      {{ t("actions.describeImage.apply") }}
    </wa-button>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n"
import { reactive, onMounted, inject, computed } from "vue"
import { createControllerFetch } from "../../../request/index.js"

const { t } = useI18n()

const props = defineProps({
  name: String,
  module: String,
  tabId: String,
  action: Object,
  params: Object,
})
const viform = inject("viform")
const emit = defineEmits(["close", "next"])
const describeImageFetch = createControllerFetch({ endpoint: "describe_image", method: "POST" })

const state = reactive({
  value: null,
  currentLang: null,
  url: computed(
    () => (import.meta.env.VITE_API_URL ?? window.location.origin) + (props.params.value?.dest?.downloadUrl ?? "")
  ),
  prompt: null,
  loading: false,
})

async function describe() {
  state.loading = true
  try {
    const fetchResult = describeImageFetch(
      "assistant",
      "/",
      {
        filekey: props.params.value.dest.key,
        context: JSON.stringify(viform?.value?.state?.skel),
        prompt: state.prompt ?? undefined,
        language: state.currentLang,
      },
      { immediate: false }
    )
    await fetchResult.execute()
    // v2 envelope carries the payload in `data`; fall back to the raw body for
    // non-envelope responses.
    const result = fetchResult.data.value
    state.value[state.currentLang] = result?.data ?? result
  } finally {
    state.loading = false
  }
}

onMounted(() => {
  state.value = props.params.value?.rel?.alt
  if (!state.value) {
    const langs = {}
    for (const l of props.params.bone?.using?.alt?.languages ?? []) {
      langs[l] = ""
    }
    state.value = langs
  }
  state.currentLang = props.params.bone?.using?.alt?.languages?.[0]
})

function updateValue(e, lang) {
  state.value[lang] = e.target.value
}

function CloseAction() {
  emit("close")
}

function ApplySelection() {
  const val = { ...(props.params.value ?? {}) }
  if (!val.rel) {
    val.rel = { alt: state.value }
  } else {
    val.rel = { ...val.rel, alt: state.value }
  }
  emit("close", val, props.params.lang ?? null)
}
</script>

<style scoped>
.image-description-wrapper {
  padding: var(--wa-space-l);
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s);
}

.image-description-grid {
  display: grid;
  grid-template-columns: 15em minmax(0, 1fr);
  gap: var(--wa-space-l);
}

.footer {
  display: flex;
  justify-content: space-between;
}

.image-description-small-print {
  font-size: 0.7em;
}

.image-description-flex {
  display: flex;
  flex-direction: column;
  gap: var(--wa-space-s);
}

wa-textarea {
  &::part(form-control-label) {
    margin-bottom: var(--wa-space-xs);
    font-weight: 600;
  }
}
</style>
