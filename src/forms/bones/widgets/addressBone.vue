<template>
  <div
    class="bone-widget bone-widget-address"
    :class="`bone-widget-address-${name}`"
  >
    <div class="bone-widget-address-layout">
      <Wrapper_nested
        :value="value"
        :name="name"
        :index="index"
        :lang="lang"
        :bone="bone"
        :disabled="bone['readonly']"
        @change="changeEvent"
      ></Wrapper_nested>
      <component
        :is="provider.map"
        v-if="provider?.map"
        class="bone-widget-address-map"
        :coordinates="state.coordinates"
        :readonly="!!bone['readonly']"
        @pick="pick"
      ></component>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, onMounted, watch } from "vue"
import Wrapper_nested from "../BoneNestedWrapper.vue"
import { getAddressProvider, createAddressSync, hasCoordinates } from "../address.js"
/**
 * Address widget for bones of type `record.address` (viur-core `AddressBone`).
 *
 * Renders the sub-bones like the record widget. If the app registered a
 * provider via `setAddressProvider()`, a map is shown below the fields:
 * - typing an address geocodes it and moves the marker
 * - clicking the map sets the coordinates and fills the fields (reverse geocoding)
 *
 * Without a provider it behaves exactly like the record widget.
 *
 * @displayName AddressBone
 *
 * @cssClass bone-widget-address - Identifies the bone type
 * @cssClass bone-widget-address-{name} - Dynamically set per bone
 * @cssClass bone-widget-address-map - The provider's map component
 */
defineOptions({
  inheritAttrs: false,
})

const emit = defineEmits([
  /**
   * Fired on every value change and on mount (initialization).
   * @arg {string} name - Bone name
   * @arg {object} value - Current address (object with sub-bone values)
   * @arg {string|undefined} lang - Language key
   * @arg {number|undefined} index - Index in the multiple array
   */
  "change",
])
const props = defineProps({
  /** Bone name – passed as the first argument in every `change` event. */
  name: String,
  /** Current address; object with sub-bone values. */
  value: null,
  /** Index in the multiple array; `undefined` for a single value. */
  index: Number,
  /** Language key for multilingual bones, e.g. `"de"`. */
  lang: String,
  /** Bone structure; `using` contains the sub-bone definitions. */
  bone: Object,
  /** Currently not used. */
  autofocus: Boolean,
})

const provider = getAddressProvider()
const state = reactive({
  value: {},
  coordinates: computed(() => (hasCoordinates(state.value?.coordinates) ? state.value.coordinates : null)),
})
const sync = createAddressSync(provider, (value) => {
  state.value = value
  emit("change", props.name, value, props.lang, props.index)
})

function changeEvent(data) {
  if (!data || typeof data !== "object") return // init event of the nested wrapper
  sync.edit(data["value"])
}

function pick(coordinates) {
  if (props.bone?.["readonly"]) return
  return sync.pick(coordinates)
}

watch(
  () => props.value,
  (value) => {
    state.value = value ?? {}
    sync.set(state.value)
  }
)

onMounted(() => {
  state.value = props.value ?? {}
  sync.init(state.value)
  emit("change", props.name, props.value, props.lang, props.index) //init
})
</script>

<style scoped>
.bone-widget-address {
  container-type: inline-size;
}

.bone-widget-address-layout {
  display: grid;
  gap: var(--wa-space-s);
}

.bone-widget-address-map {
  min-height: 250px;
}

/* Map next to the fields when there is room, below them otherwise */
@container (min-width: 640px) {
  .bone-widget-address-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  .bone-widget-address-map {
    position: sticky;
    top: 0;
    min-height: 350px;
  }
}
</style>
