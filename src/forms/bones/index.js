import rawBone from "./widgets/rawBone.vue"
import keyBone from "./widgets/keyBone.vue"
import stringBone from "./widgets/stringBone.vue"
import emailBone from "./widgets/emailBone.vue"
import dateBone from "./widgets/dateBone.vue"
import selectBone from "./widgets/selectBone.vue"
import booleanBone from "./widgets/booleanBone.vue"
import passwordBone from "./widgets/passwordBone.vue"
import recordBone from "./widgets/recordBone.vue"
import colorBone from "./widgets/colorBone.vue"
import numericBone from "./widgets/numericBone.vue"
import relationalBone from "./widgets/relationalBone.vue"
import fileBone from "./widgets/fileBone.vue"
import spatialBone from "./widgets/spatialBone.vue"

import booleanBoneSelect from "./widgets/booleanBoneSelect.vue"
import booleanBoneChoose from "./widgets/booleanBoneChoose.vue"
import selectBoneChoose from "./widgets/selectBoneChoose.vue"
import relationalBoneSelect from "./widgets/relationalBoneSelect.vue"

import defaultBar from "./actionbar/defaultBar.vue"
import relationalBar from "./actionbar/relationalBar.vue"
import fileBar from "./actionbar/fileBar.vue"

import { reactive, shallowRef, defineAsyncComponent } from "vue"
import { defineStore } from "pinia"

// Heavy bones — lazy loaded so consumers don't pay for their deps unless used.
// json-editor-vue (~60KB+), libphonenumber-js (~150KB), CodeMirror suite (~200KB+),
// CKEditor5 suite (~400KB+) only land in the bundle when a form actually renders
// the corresponding bone type.
const jsonBone = defineAsyncComponent(() => import("./widgets/jsonBone.vue"))
const phoneBone = defineAsyncComponent(() => import("./widgets/phoneBone.vue"))
const codeBone = defineAsyncComponent(() => import("./widgets/codeBone.vue"))
const textBone = defineAsyncComponent(() => import("./widgets/textBone.vue"))

/**
 * Entry of `registry` for `boneType`: exact key, else the longest dotted key that `boneType`
 * starts with ("relational." matches "relational.user"). `undefined` if none matches.
 */
function lookup(registry, boneType) {
  if (Object.hasOwn(registry, boneType)) return registry[boneType]
  const prefix = Object.keys(registry)
    .filter((key) => key.includes(".") && boneType.startsWith(key))
    .sort((a, b) => b.length - a.length)[0]
  return prefix === undefined ? undefined : registry[prefix]
}

export const useBoneStore = defineStore("boneStore", () => {
  const state = reactive({
    additionalBones: shallowRef({}),
    defaultBones: shallowRef({
      rawBone,
      keyBone,
      stringBone,
      emailBone,
      dateBone,
      booleanBone,
      selectBone,
      passwordBone,
      recordBone,
      numericBone,
      colorBone,
      relationalBone,
      jsonBone,
      fileBone,
      textBone,
      spatialBone,
      phoneBone,
      booleanBoneSelect,
      booleanBoneChoose,
      selectBoneChoose,
      relationalBoneSelect,
      codeBone,
    }),
    actionbars: shallowRef({
      "relational.tree.leaf.file.file": fileBar,
      "relational.": relationalBar,
    }),
    multibones: shallowRef(["select", "select."]),
    emptyStates: shallowRef({}),
  })

  // Replace instead of mutating: the registries are shallowRefs, only a new object triggers.
  function addBoneWidget(boneType, widget) {
    state.additionalBones = { ...state.additionalBones, [boneType]: widget }
  }

  function getBoneWidget(boneType) {
    const custom = lookup(state.additionalBones, boneType)
    if (custom) return custom

    if (boneType === "date" || boneType.startsWith("date.")) {
      return dateBone
    } else if (boneType === "key") {
      return keyBone
    } else if (boneType === "str.email") {
      return emailBone
    } else if (boneType === "str.phone") {
      return phoneBone
    } else if (boneType === "str" || boneType.startsWith("str.")) {
      return stringBone
    } else if (boneType === "select.choose") {
      return selectBoneChoose
    } else if (boneType === "select" || boneType.startsWith("select.")) {
      return selectBone
    } else if (boneType === "bool.choose") {
      return booleanBoneChoose
    } else if (boneType === "bool.select") {
      return booleanBoneSelect
    } else if (boneType === "bool" || boneType.startsWith("bool.")) {
      return booleanBone
    } else if (boneType === "password" || boneType.startsWith("password.")) {
      return passwordBone
    } else if (boneType === "record" || boneType.startsWith("record.")) {
      return recordBone
    } else if (boneType === "numeric" || boneType.startsWith("numeric.")) {
      return numericBone
    } else if (boneType === "relational.tree.leaf.file.file" || boneType.startsWith("relational.tree.leaf.file.")) {
      return fileBone
    } else if (boneType === "relational.select" || boneType.startsWith("relational.select.")) {
      return relationalBoneSelect
    } else if (boneType === "relational" || boneType.startsWith("relational.")) {
      return relationalBone
    } else if (boneType === "raw.json") {
      return jsonBone
    } else if (boneType.startsWith("raw.code.")) {
      return codeBone
    } else if (boneType === "color" || boneType.startsWith("color.")) {
      return colorBone
    } else if (boneType === "text" || boneType.startsWith("text.")) {
      return textBone
    } else if (boneType === "spatial" || boneType.startsWith("spatial.")) {
      return spatialBone
    }

    return rawBone
  }

  function addBoneActionbar(boneType, widget) {
    state.actionbars = { ...state.actionbars, [boneType]: widget }
  }

  function getBoneActionbar(boneType) {
    return lookup(state.actionbars, boneType) ?? defaultBar
  }

  // Shown by BoneMultipleList instead of the "no entries" input while a multiple bone is empty
  function addBoneEmptyState(boneType, widget) {
    state.emptyStates = { ...state.emptyStates, [boneType]: widget }
  }

  function getBoneEmptyState(boneType) {
    return lookup(state.emptyStates, boneType)
  }

  return {
    state,
    addBoneWidget,
    getBoneWidget,

    addBoneActionbar,
    getBoneActionbar,

    addBoneEmptyState,
    getBoneEmptyState,
  }
})

export function addBoneActionbar(boneType, widget) {
  const boneStore = useBoneStore()
  return boneStore.addBoneActionbar(boneType, widget)
}

export function getBoneActionbar(boneType) {
  const boneStore = useBoneStore()
  return boneStore.getBoneActionbar(boneType)
}

export function addBoneEmptyState(boneType, widget) {
  const boneStore = useBoneStore()
  return boneStore.addBoneEmptyState(boneType, widget)
}

export function getBoneEmptyState(boneType) {
  const boneStore = useBoneStore()
  return boneStore.getBoneEmptyState(boneType)
}

export function getBoneWidget(boneType) {
  const boneStore = useBoneStore()
  return boneStore.getBoneWidget(boneType)
}

export function addBoneWidget(boneType, widget) {
  const boneStore = useBoneStore()
  boneStore.addBoneWidget(boneType, widget)
}

export function BoneHasMultipleHandling(boneType) {
  const boneStore = useBoneStore()
  return boneStore.state.multibones.some(
    (type) => type === boneType || (type.includes(".") && boneType.startsWith(type))
  )
}
