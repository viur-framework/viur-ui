<template>
  <Story title="Bones/AddressBone">
    <Variant
      title="Mit Karte (Fake-Provider)"
      :auto-props-disabled="true"
      :init-state="() => ({ readonly: false })"
    >
      <template #default="{ state }">
        <WithProvider
          :provider="fakeProvider"
          style="padding: 1rem; max-width: 100%"
        >
          <Bone
            :is="addressBone"
            name="address"
            :structure="structure(state)"
            :skel="skel"
            @change="logEvent('change', $event)"
          />
        </WithProvider>
      </template>
      <template #controls="{ state }">
        <HstCheckbox
          v-model="state.readonly"
          title="Readonly"
        />
        <div class="hst-hint">
          Adresse in Berlin, Hamburg oder München eintippen -> Marker springt. Auf die Fläche klicken -> Felder werden
          befüllt. Der Fake-Provider kennt nur diese drei Städte.
        </div>
      </template>
    </Variant>

    <Variant
      title="Ohne Provider"
      :auto-props-disabled="true"
    >
      <WithProvider
        :provider="null"
        style="padding: 1rem; max-width: 100%"
      >
        <Bone
          :is="addressBone"
          name="address"
          :structure="structure({ readonly: false })"
          :skel="skel"
          @change="logEvent('change', $event)"
        />
      </WithProvider>
    </Variant>
  </Story>
</template>

<script setup>
import { provide, markRaw, defineComponent, h } from "vue"
import { logEvent } from "histoire/client"
import { createMainformState } from "../mocks/mainformState.js"
import Bone from "../../src/forms/bones/bone.vue"
import addressBoneWidget from "../../src/forms/bones/widgets/addressBone.vue"
import { setAddressProvider } from "../../src/forms/bones/address.js"

const addressBone = markRaw(addressBoneWidget)
const skel = { address: {} }

// Rough bounding box of Germany, the fake map is a plain rectangle over it.
const BOUNDS = { north: 55.1, south: 47.2, west: 5.8, east: 15.1 }
const CITIES = [
  { city: "Berlin", zip_code: "10117", coordinates: [52.517, 13.389] },
  { city: "Hamburg", zip_code: "20095", coordinates: [53.551, 9.994] },
  { city: "München", zip_code: "80331", coordinates: [48.137, 11.575] },
]

const FakeMap = markRaw(
  defineComponent({
    props: { coordinates: Array, readonly: Boolean },
    emits: ["pick"],
    setup(props, { emit }) {
      function click(event) {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - rect.left) / rect.width
        const y = (event.clientY - rect.top) / rect.height
        const lat = BOUNDS.north - y * (BOUNDS.north - BOUNDS.south)
        const lng = BOUNDS.west + x * (BOUNDS.east - BOUNDS.west)
        emit("pick", [Number(lat.toFixed(5)), Number(lng.toFixed(5))])
      }
      return () => {
        const [lat, lng] = props.coordinates ?? []
        const marker = props.coordinates
          ? h("div", {
              style: {
                position: "absolute",
                left: `${((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * 100}%`,
                top: `${((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * 100}%`,
                width: "12px",
                height: "12px",
                margin: "-6px 0 0 -6px",
                borderRadius: "50%",
                background: "var(--wa-color-danger-fill-loud, red)",
              },
            })
          : null
        return h(
          "div",
          {
            style: {
              position: "relative",
              boxSizing: "border-box",
              height: "100%",
              minHeight: "250px",
              border: "var(--wa-border-width-s, 1px) solid var(--wa-color-neutral-border-normal, #ccc)",
              borderRadius: "var(--wa-border-radius-m, 4px)",
              // Grid lines so the area reads as a map
              background:
                "linear-gradient(var(--wa-color-neutral-border-quiet, #ddd) 1px, transparent 1px) 0 0 / 100% 10%," +
                "linear-gradient(90deg, var(--wa-color-neutral-border-quiet, #ddd) 1px, transparent 1px) 0 0 / 10% 100%," +
                "var(--wa-color-brand-fill-quiet, #eef4ff)",
              cursor: props.readonly ? "default" : "crosshair",
            },
            onClick: click,
          },
          [
            ...CITIES.map((c) =>
              h(
                "span",
                {
                  style: {
                    position: "absolute",
                    left: `${((c.coordinates[1] - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * 100}%`,
                    top: `${((BOUNDS.north - c.coordinates[0]) / (BOUNDS.north - BOUNDS.south)) * 100}%`,
                    fontSize: "0.75rem",
                    pointerEvents: "none",
                  },
                },
                c.city
              )
            ),
            marker,
          ]
        )
      }
    },
  })
)

const fakeProvider = {
  map: FakeMap,
  geocode: async (address) => {
    const hit = CITIES.find((c) => c.city.toLowerCase() === String(address.city).trim().toLowerCase())
    return hit ? hit.coordinates : null
  },
  reverseGeocode: async ([lat, lng]) => {
    const distance = (c) => (c.coordinates[0] - lat) ** 2 + (c.coordinates[1] - lng) ** 2
    const nearest = [...CITIES].sort((a, b) => distance(a) - distance(b))[0]
    return {
      street_name: "Kartenpunkt",
      street_number: "1",
      zip_code: nearest.zip_code,
      city: nearest.city,
      country: "de",
    }
  },
}

// Sets the provider before its children (the address widget) are set up, and provides the
// form state — a provide in the story setup itself does not reach the variant content.
const WithProvider = markRaw(
  defineComponent({
    props: { provider: { type: Object, default: null } },
    setup(props, { slots }) {
      setAddressProvider(props.provider)
      provide("mainformState", createMainformState(skel))
      return () => h("div", slots.default?.())
    },
  })
)

const str = (descr, required = false) => ({
  type: "str",
  descr,
  required,
  readonly: false,
  multiple: false,
  visible: true,
  languages: null,
  params: {},
})

function structure(state) {
  return {
    address: {
      type: "record.address",
      descr: "Adresse",
      required: false,
      readonly: state.readonly,
      multiple: false,
      languages: null,
      format: "$(street_name) $(street_number), $(zip_code) $(city)",
      params: {},
      using: {
        street_name: str("Straße", true),
        street_number: str("Hausnummer"),
        address_addition: str("Adresszusatz"),
        zip_code: str("PLZ"),
        city: str("Stadt", true),
        country: {
          type: "select.country",
          descr: "Land",
          required: false,
          readonly: false,
          multiple: false,
          visible: true,
          languages: null,
          params: {},
          values: [
            ["de", "Deutschland"],
            ["at", "Österreich"],
            ["ch", "Schweiz"],
          ],
        },
        coordinates: {
          type: "spatial",
          descr: "Koordinaten",
          required: false,
          readonly: false,
          multiple: false,
          visible: true,
          languages: null,
          params: {},
          boundslat: [-90, 90],
          boundslng: [-180, 180],
        },
      },
    },
  }
}
</script>
