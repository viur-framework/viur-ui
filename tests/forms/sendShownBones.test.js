import { describe, it, expect, beforeEach, vi } from "vitest"
import { reactive } from "vue"
import { useFormUtils } from "../../src/forms/utils.js"

// A form restricted with `bones` must be able to send only those bones: otherwise
// it writes the load-time values of hidden bones back over newer changes.

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (k) => (k === "content-type" ? "application/json" : null) },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    clone() {
      return this
    },
  }
}

const STRUCTURE = {
  title: { type: "str", visible: true, readonly: false, params: {} },
  description: { type: "str", visible: true, readonly: false, params: {} },
  attachments: { type: "str", visible: true, readonly: false, params: {} },
}

function makeState() {
  return reactive({
    skel: { title: "neu", description: "alt", attachments: "a1" },
    structure: STRUCTURE,
    errors: [],
    actionparams: {},
    valids: {},
    loading: false,
    categories: [],
    values: {},
    readonly: false,
    categoryDefaultname: "Allgemein",
    viformelement: null,
  })
}

function makeProps(overrides = {}) {
  return {
    module: "ticket",
    action: "edit",
    renderer: "json",
    version: null,
    secure: false,
    skelkey: "t1",
    bones: ["title"],
    collapsedCategories: [],
    values: null,
    sendReadOnly: false,
    structure: null,
    params: {},
    fetchUrl: null,
    internal: null,
    ...overrides,
  }
}

async function sentFields(props, additionalData = null) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ action: "editSuccess", status: "success", values: {} }))
  vi.stubGlobal("fetch", fetchMock)
  const { sendData } = useFormUtils(props, makeState())
  await sendData(null, additionalData)
  const body = fetchMock.mock.calls.at(-1)[1].body
  return new Set([...body.keys()])
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("sendOnlyShownBones", () => {
  it("sends every writable bone by default", async () => {
    const fields = await sentFields(makeProps())
    expect(fields).toEqual(new Set(["title", "description", "attachments"]))
  })

  it("sends only shown bones with sendOnlyShownBones", async () => {
    const fields = await sentFields(makeProps({ sendOnlyShownBones: true }), { x: "1" })
    expect(fields).toEqual(new Set(["title", "x"]))
  })

  it("sends every writable bone when no bones are given", async () => {
    const fields = await sentFields(makeProps({ sendOnlyShownBones: true, bones: [] }))
    expect(fields).toEqual(new Set(["title", "description", "attachments"]))
  })
})

describe("using row without relation", () => {
  const relBone = (multiple) => ({
    type: "relational.tree.leaf.file",
    visible: true,
    readonly: false,
    multiple,
    params: {},
    using: { caption: { type: "str", params: {} } },
  })

  async function sent(bone, value) {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ action: "editSuccess", status: "success", values: {} }))
    vi.stubGlobal("fetch", fetchMock)
    const state = { ...makeState(), skel: { images: value }, structure: { images: bone } }
    await useFormUtils(makeProps({ bones: [] }), reactive(state)).sendData()
    return [...fetchMock.mock.calls.at(-1)[1].body.entries()]
  }

  it("multiple: skips the row with a warning, keeps the rows with a relation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const body = await sent(relBone(true), [
      { dest: null, rel: { caption: "lost" } },
      { dest: { key: "f1" }, rel: { caption: "kept" } },
    ])
    expect(body).toEqual([
      ["images.1.caption", "kept"],
      ["images.1.key", "f1"],
    ])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("images.0"))
  })

  it("multiple: sends the field empty when every row is skipped", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await sent(relBone(true), [{ dest: null, rel: { caption: "lost" } }])).toEqual([["images", ""]])
  })

  it("single: empties the relation with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await sent(relBone(false), { dest: null, rel: { caption: "lost" } })).toEqual([["images", ""]])
    expect(warn).toHaveBeenCalledOnce()
  })
})
