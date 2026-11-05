<template>
  <Story title="Bones/NumericBoneDuration">
    <Variant
      title="Playground"
      :auto-props-disabled="true"
      :source="pgSourceRef"
      :init-state="
        () => ({
          boneName: 'estimate',
          descr: 'Estimate',
          boneType: 'numeric.duration',
          readonly: false,
          required: false,
          multiple: false,
          label: 'normal',
          hoursPerDay: 8,
          daysPerWeek: 5,
          largestUnit: 'week',
          presets: '15, 60, 240, 480, 2400',
          max: '',
        })
      "
    >
      <template #default="{ state }">
        {{ syncPgSource(state) }}
        <BoneStoryWrapper
          :bone-name="state.boneName"
          bone-type="numeric.duration"
          :structure="structure(state)"
          :skel="{ [state.boneName]: 90 }"
          :label="state.label"
        />
      </template>
      <template #controls="{ state }">
        <HstText
          v-model="state.descr"
          title="Description (Label)"
        />
        <div class="hst-hint">{{ hints.descr }}</div>

        <HstCheckbox
          v-model="state.readonly"
          title="Readonly"
        />
        <div class="hst-hint">{{ hints.readonly }}</div>

        <HstCheckbox
          v-model="state.required"
          title="Required"
        />
        <div class="hst-hint">{{ hints.required }}</div>

        <HstCheckbox
          v-model="state.multiple"
          title="Multiple"
        />
        <div class="hst-hint">{{ hints.multiple }}</div>

        <HstNumber
          v-model="state.hoursPerDay"
          title="params.hours_per_day"
        />
        <div class="hst-hint">Hours in one day: 24 = calendar day (default), 8 = working day.</div>

        <HstNumber
          v-model="state.daysPerWeek"
          title="params.days_per_week"
        />
        <div class="hst-hint">Days in one week: 7 (default) or 5.</div>

        <HstSelect
          v-model="state.largestUnit"
          title="params.largest_unit"
          :options="[
            { label: 'week', value: 'week' },
            { label: 'day', value: 'day' },
            { label: 'hour', value: 'hour' },
            { label: 'minute', value: 'minute' },
          ]"
        />
        <div class="hst-hint">Largest unit that is accepted and shown.</div>

        <HstText
          v-model="state.presets"
          title="params.presets"
        />
        <div class="hst-hint">Quick picks in minutes, comma separated.</div>

        <HstText
          v-model="state.max"
          title="max"
        />
        <div class="hst-hint">Largest value in minutes (empty: no limit).</div>
      </template>
    </Variant>
  </Story>
</template>

<script setup>
import { ref } from "vue"
import BoneStoryWrapper from "../BoneStoryWrapper.vue"
import { hints } from "../fixtures/controlHints.js"
import { src, makeStructure } from "../fixtures/storyUtils.js"

const pgSourceRef = ref("")

function structure(state) {
  return makeStructure(state, {
    max: state.max === "" ? undefined : Number(state.max),
    params: {
      hours_per_day: state.hoursPerDay,
      days_per_week: state.daysPerWeek,
      largest_unit: state.largestUnit,
      presets: state.presets
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => v > 0),
    },
  })
}

function syncPgSource(state) {
  pgSourceRef.value = src(structure(state), { [state.boneName]: 90 })
  return ""
}
</script>

<style>
.hst-hint {
  font-size: 11px;
  color: #888;
  padding: 2px 12px 10px;
  line-height: 1.5;
}
</style>
