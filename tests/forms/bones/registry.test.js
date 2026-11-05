import { describe, it, expect, beforeEach } from "vitest"
import { defineComponent, nextTick, watchEffect } from "vue"
import { createPinia, setActivePinia } from "pinia"
import {
  addBoneWidget,
  getBoneWidget,
  addBoneActionbar,
  getBoneActionbar,
  addBoneEmptyState,
  getBoneEmptyState,
} from "../../../src/forms/bones/index.js"

const widget = (name) => defineComponent({ name, render: () => null })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe("bone registry", () => {
  it("picks the longest matching widget prefix, not the first registered", () => {
    const tree = widget("tree")
    const file = widget("file")
    addBoneWidget("relational.tree.", tree)
    addBoneWidget("relational.tree.leaf.file.", file)

    expect(getBoneWidget("relational.tree.leaf.file.file")).toBe(file)
    expect(getBoneWidget("relational.tree.node")).toBe(tree)
  })

  it("picks the longest matching actionbar prefix, not the first registered", () => {
    const tree = widget("treeBar")
    const file = widget("fileBar")
    addBoneActionbar("relational.tree.", tree)
    addBoneActionbar("relational.tree.leaf.image.", file)

    expect(getBoneActionbar("relational.tree.leaf.image.x")).toBe(file)
  })

  it("updates reactive lookups when a widget is added after the first render", async () => {
    const custom = widget("custom")
    let resolved = null
    watchEffect(() => (resolved = getBoneWidget("str.custom")))
    expect(resolved).not.toBe(custom)

    addBoneWidget("str.custom", custom)
    await nextTick()

    expect(resolved).toBe(custom)
  })

  it("updates reactive lookups when an actionbar is added after the first render", async () => {
    const custom = widget("customBar")
    let resolved = null
    watchEffect(() => (resolved = getBoneActionbar("str.custom")))
    expect(resolved).not.toBe(custom)

    addBoneActionbar("str.custom", custom)
    await nextTick()

    expect(resolved).toBe(custom)
  })

  it("resolves an empty state by prefix and has none by default", () => {
    const empty = widget("imageEmpty")
    expect(getBoneEmptyState("relational.tree.leaf.file.image.file")).toBeUndefined()

    addBoneEmptyState("relational.tree.leaf.file.image.", empty)

    expect(getBoneEmptyState("relational.tree.leaf.file.image.file")).toBe(empty)
    expect(getBoneEmptyState("relational.tree.leaf.file.file")).toBeUndefined()
  })
})
