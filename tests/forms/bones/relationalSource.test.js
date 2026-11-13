import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createApp, computed } from "vue"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import { resetState, HTTPError } from "../../../src/request/request.js"
import { useRelationalSource } from "../../../src/forms/bones/relationalSource.js"
import Utils from "../../../src/forms/bones/utils.js"

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: (k) => (k === "content-type" ? "application/json" : null) },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    clone() {
      return this
    },
  }
}

// Answers /list with `respond(searchParams)`; returns the parsed /list URLs.
function stubFetch(respond = () => ({ skellist: [], cursor: "", orders: [] })) {
  const urls = []
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url) => {
      if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
      const parsed = new URL(url)
      urls.push(parsed.searchParams)
      const result = await respond(parsed.searchParams)
      return result === "error" ? jsonResponse({}, 500) : jsonResponse(result)
    })
  )
  return urls
}

const page = (...names) => ({ skellist: names.map((name) => ({ key: name, name })), cursor: "next", orders: [] })
const boneState = (format = "$(dest.name)", type = "relational") => ({
  bonestructure: { type, module: "items", format },
})
const formatString = (format, { dest }) => dest.name

// Let the 300 ms search debounce elapse, then wait for the result.
async function settle(promise) {
  await vi.advanceTimersByTimeAsync(300)
  return promise
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  await resetState()
  vi.restoreAllMocks()
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useRelationalSource", () => {
  it("fetches one page of 99 without filter for an empty search", async () => {
    const urls = stubFetch(() => page("a", "b"))
    const items = await settle(useRelationalSource(boneState(), formatString)(""))
    expect(items).toEqual([
      { text: "a", value: "a", data: { key: "a", name: "a" } },
      { text: "b", value: "b", data: { key: "b", name: "b" } },
    ])
    expect(urls).toHaveLength(1)
    expect(urls[0].get("limit")).toBe("99")
    expect([...urls[0].keys()].some((key) => key.endsWith("$lk"))).toBe(false)
  })

  it("sends the search as a prefix filter on the first bone of the format", async () => {
    const urls = stubFetch(() => page("Entry"))
    const getList = useRelationalSource(boneState("$(dest.firstname) $(dest.lastname)"), formatString)
    expect((await settle(getList(" Ent "))).map((item) => item.value)).toEqual(["Entry"])
    expect(urls[0].get("firstname$lk")).toBe("Ent")
    expect(urls[0].get("limit")).toBe("99")
  })

  it("does not filter when the format names no bone", async () => {
    const urls = stubFetch()
    await settle(useRelationalSource(boneState("static"), formatString)("Ent"))
    expect([...urls[0].keys()].some((key) => key.endsWith("$lk"))).toBe(false)
  })

  it("sets skelType for tree bones", async () => {
    const urls = stubFetch()
    await settle(useRelationalSource(boneState("$(dest.name)", "relational.tree.leaf.file"), formatString)(""))
    expect(urls[0].get("skelType")).toBe("leaf")
  })

  it("rejects when the request fails", async () => {
    stubFetch(() => "error")
    const rejected = expect(useRelationalSource(boneState(), formatString)("x")).rejects.toBeInstanceOf(HTTPError)
    await vi.advanceTimersByTimeAsync(300)
    await rejected
  })

  it("an outdated slower response resolves with the newest result", async () => {
    let releaseOld
    const oldResponse = new Promise((resolve) => (releaseOld = resolve))
    stubFetch((params) => (params.get("name$lk") === "a" ? oldResponse : page("ab")))
    const getList = useRelationalSource(boneState(), formatString)
    const old = getList("a")
    await vi.advanceTimersByTimeAsync(300) // request for "a" is out, its response hangs
    const current = getList("ab")
    expect((await settle(current)).map((item) => item.value)).toEqual(["ab"])
    releaseOld(page("a", "ab", "ac"))
    expect((await old).map((item) => item.value)).toEqual(["ab"])
  })

  it("debounces keystrokes into one request; every call gets its result", async () => {
    const urls = stubFetch((params) => page(params.get("name$lk")))
    const getList = useRelationalSource(boneState(), formatString)
    const calls = [getList("a"), getList("ab"), getList("abc")]
    await vi.advanceTimersByTimeAsync(300)
    for (const items of await Promise.all(calls)) expect(items.map((item) => item.value)).toEqual(["abc"])
    expect(urls).toHaveLength(1)
  })
})

describe("useRelationalSource suggestion text", () => {
  // viur-core stores strings escaped; Utils.formatString unescapes them again
  const named = (name) => ({ skellist: [{ key: "k1", name }], cursor: "", orders: [] })

  it("escapes the text, which wa-combobox renders as HTML", async () => {
    stubFetch(() => named("&lt;img src=x onerror=alert(1)&gt; &amp; Co &#40;1&#41;"))
    const [item] = await settle(useRelationalSource(boneState(), Utils.formatString)(""))

    expect(item.text).toBe("&lt;img src=x onerror=alert(1)&gt; &amp;amp; Co (1)")
    expect(item.value).toBe("k1")
  })

  it("shows the typed text of an entry once rendered", async () => {
    stubFetch(() => named("Muster &#40;FFZ&#41; <b>"))
    const [item] = await settle(useRelationalSource(boneState(), Utils.formatString)(""))
    const option = document.createElement("div")
    option.innerHTML = item.text

    expect(option.textContent).toBe("Muster (FFZ) <b>")
    expect(option.children).toHaveLength(0)
  })
})

describe("relationParams", () => {
  it("adds the form's params; limit, skelType and the search filter stay the bone's", async () => {
    const urls = stubFetch()
    let getList
    const app = createApp({
      setup() {
        getList = useRelationalSource(boneState("$(dest.name)", "relational.tree.leaf.file"), formatString)
        return () => null
      },
    })
    app.provide(
      "relationParams",
      computed(() => (bone) => ({ category: bone.module, limit: 5, skelType: "node", name$lk: "x" }))
    )
    app.mount(document.createElement("div"))
    await settle(getList("Ent"))
    app.unmount()
    expect(urls[0].get("category")).toBe("items")
    expect(urls[0].get("limit")).toBe("99")
    expect(urls[0].get("skelType")).toBe("leaf")
    expect(urls[0].get("name$lk")).toBe("Ent")
  })

  it("passes the nearest and the outermost form to the function", async () => {
    const urls = stubFetch()
    const row = { skel: { customer: "c1" } }
    const outer = { skel: { kind: "b2b" } }
    let getList
    const app = createApp({
      setup() {
        getList = useRelationalSource(boneState(), formatString)
        return () => null
      },
    })
    app.provide("formState", row)
    app.provide("mainformState", outer)
    app.provide(
      "relationParams",
      computed(() => (bone, { form, mainForm }) => ({ customer: form.skel.customer, kind: mainForm.skel.kind }))
    )
    app.mount(document.createElement("div"))
    await settle(getList(""))
    app.unmount()
    expect(urls[0].get("customer")).toBe("c1")
    expect(urls[0].get("kind")).toBe("b2b")
  })
})
