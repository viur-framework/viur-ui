import { describe, it, expect, beforeEach, vi } from "vitest"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import {
  useListFetch,
  useListFetchAll,
  useTreeFetch,
  useViewFetch,
  useEditFetch,
  useAddFetch,
  useDeleteFetch,
  useCloneFetch,
  usePreviewFetch,
  useMoveFetch,
  useListRootNodesFetch,
  useStructureFetch,
  createControllerFetch,
  uploadFile,
  resetState,
  HTTPError,
} from "../../src/request/request.js"
import { setCached, clearCache } from "../../src/request/cache.js"

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

async function waitUntilFinished(result, timeout = 3000) {
  await vi.waitFor(
    () => {
      if (!result.isFinished.value) throw new Error("not finished yet")
    },
    { timeout }
  )
}

const BASE = "http://api.test"

// ─── Reset state before each test ─────────────────────────────────────────────

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  await resetState()
  vi.restoreAllMocks()
})

// ─── HTTPError ─────────────────────────────────────────────────────────────────

describe("HTTPError", () => {
  it("is an Error with statusCode, statusText, response", () => {
    const resp = { ok: false, status: 404 }
    const err = new HTTPError(404, "Not Found", "not there", resp)
    expect(err).toBeInstanceOf(Error)
    expect(err.statusCode).toBe(404)
    expect(err.statusText).toBe("Not Found")
    expect(err.message).toBe("not there")
    expect(err.response).toBe(resp)
  })

  it("uses statusText as message when message is omitted", () => {
    const err = new HTTPError(500, "Internal Server Error")
    expect(err.message).toBe("Internal Server Error")
  })
})

// ─── skey batching ────────────────────────────────────────────────────────────

describe("skey token fetching", () => {
  it("fetches a batch and reuses tokens", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk1", "sk2", "sk3"])
      return jsonResponse({ action: "editSuccess", values: { key: "k1" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const r1 = useEditFetch("mod", "/", { key: "k1" })
    const r2 = useEditFetch("mod", "/", { key: "k2" })
    await waitUntilFinished(r1)
    await waitUntilFinished(r2)

    const skeyCalls = fetchMock.mock.calls.filter(([url]) => url.includes("/skey"))
    // Both requests share the same batch — only one skey fetch needed
    expect(skeyCalls.length).toBe(1)
  })

  it("falls back to single skey when batch endpoint returns non-ok", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey?amount=")) return jsonResponse(null, 400)
      if (url.includes("/skey")) return jsonResponse("single-sk")
      return jsonResponse({ action: "editSuccess", values: {} })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useEditFetch("mod", "/", {})
    await waitUntilFinished(result)

    const fallbackCall = fetchMock.mock.calls.find(([url]) => url.includes("/skey") && !url.includes("amount="))
    expect(fallbackCall).toBeDefined()
  })

  it("asks for single skeys after a 403 on the batch until resetState", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey?amount=")) return jsonResponse(null, 403)
      if (url.includes("/skey")) return jsonResponse("single-sk")
      return jsonResponse({ action: "editSuccess", values: {} })
    })
    vi.stubGlobal("fetch", fetchMock)
    const batchCalls = () => fetchMock.mock.calls.filter(([url]) => url.includes("/skey?amount=")).length

    await useEditFetch("mod", "/", {}, { immediate: false }).execute()
    await useEditFetch("mod", "/", {}, { immediate: false }).execute()
    expect(batchCalls()).toBe(1)

    // a login resets the state: the session may now get a batch
    await resetState()
    await useEditFetch("mod", "/", {}, { immediate: false }).execute()
    expect(batchCalls()).toBe(2)
  })

  it("fetches skeys again after a failed refill", async () => {
    let skeyAvailable = false
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return skeyAvailable ? jsonResponse(["sk1"]) : jsonResponse(null, 500)
        return jsonResponse({ action: "editSuccess", values: {} })
      })
    )

    await expect(useEditFetch("mod", "/", {}, { immediate: false }).execute()).rejects.toThrow()

    skeyAvailable = true
    const second = useEditFetch("mod", "/", {}, { immediate: false })
    await second.execute()
    expect(second.error.value).toBeNull()
  })
})

// ─── useListFetch ─────────────────────────────────────────────────────────────

describe("useListFetch", () => {
  function makeFetch({ skellist = [], cursor = "", orders = [], viewSkel = {} } = {}) {
    return vi.fn().mockImplementation(async (url) => {
      if (url.includes("/structure")) return jsonResponse({ viewSkel })
      return jsonResponse({ skellist, cursor, orders })
    })
  }

  it("GETs /json/{controller}/list", async () => {
    const fetchMock = makeFetch({ skellist: [{ key: "e1" }] })
    vi.stubGlobal("fetch", fetchMock)

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)

    const listCall = fetchMock.mock.calls.find(([url]) => url.includes("/list"))
    expect(listCall[0]).toContain(`${BASE}/json/items/list`)
    expect(result.data.value).toEqual([{ key: "e1" }])
  })

  it("passes params as query string", async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal("fetch", fetchMock)

    const result = useListFetch("items", { immediate: false, params: { search: "hello", limit: 10 } })
    await result.execute()
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls.find(([u]) => u.includes("/list"))
    expect(url).toContain("search=hello")
    expect(url).toContain("limit=10")
  })

  it("uses group in URL: list/{group}", async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal("fetch", fetchMock)

    const result = useListFetch("items", { immediate: false, group: "active" })
    await result.execute()
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls.find(([u]) => u.includes("/list/"))
    expect(url).toContain("/list/active")
  })

  it("uses custom url option", async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal("fetch", fetchMock)

    const result = useListFetch("items", { immediate: false, url: `${BASE}/custom/endpoint` })
    await result.execute()
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls.find(([u]) => u.includes("/custom/endpoint"))
    expect(url).toContain("/custom/endpoint")
  })

  it("uses custom renderer in URL", async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal("fetch", fetchMock)

    const result = useListFetch("items", { immediate: false, renderer: "xml" })
    await result.execute()
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls.find(([u]) => u.includes("/list"))
    expect(url).toContain("/xml/items/list")
  })

  it("immediate: false does not fetch until execute()", async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal("fetch", fetchMock)

    useListFetch("items", { immediate: false })
    await new Promise((r) => setTimeout(r, 50))

    const listCalls = fetchMock.mock.calls.filter(([u]) => u.includes("/list"))
    expect(listCalls.length).toBe(0)
  })

  it("returns structure from /structure endpoint", async () => {
    const viewSkel = { name: { type: "str" }, age: { type: "numeric" } }
    vi.stubGlobal("fetch", makeFetch({ viewSkel }))

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)

    expect(result.structure.value).toEqual(viewSkel)
  })

  it("liest die Struktur aus der HEUTIGEN Antwort von /structure", async () => {
    // /<modul>/structure renders like any other action:
    // { action: "structure.view", values, structure } — not { viewSkel }.
    const bones = { name: { type: "str" }, age: { type: "numeric" } }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) {
          return jsonResponse({ action: "structure.view", values: {}, structure: bones, errors: [] })
        }
        return jsonResponse({ skellist: [{ key: "e1" }], cursor: "", orders: [] })
      })
    )

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)

    expect(result.structure.value).toEqual(bones)
  })

  it("glättet eine Struktur in Paar-Form (json.bone.structure.keytuples)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) {
          return jsonResponse({
            action: "structure.view",
            values: {},
            structure: [
              ["name", { type: "str" }],
              ["age", { type: "numeric" }],
            ],
            errors: [],
          })
        }
        return jsonResponse({ skellist: [], cursor: "", orders: [] })
      })
    )

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)

    expect(result.structure.value).toEqual({ name: { type: "str" }, age: { type: "numeric" } })
  })

  it("nimmt die Struktur aus der Liste, wenn sie mitkommt", async () => {
    // With the flag `json.bone.structure.inlists` the list delivers it directly.
    const bones = { title: { type: "str" } }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) return jsonResponse({ viewSkel: { veraltet: {} } })
        return jsonResponse({ skellist: [{ key: "e1" }], structure: bones, cursor: "", orders: [] })
      })
    )

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)

    expect(result.structure.value).toEqual(bones)
  })

  it("returns orders from response", async () => {
    vi.stubGlobal("fetch", makeFetch({ orders: ["name asc", "date desc"] }))

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)

    expect(result.orders.value).toEqual(["name asc", "date desc"])
  })

  it("execute() clears data synchronously before new fetch resolves", async () => {
    vi.stubGlobal("fetch", makeFetch({ skellist: [{ key: "e1" }] }))

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)
    expect(result.data.value).toEqual([{ key: "e1" }])

    // execute() clears data synchronously before the new fetch resolves
    result.execute()
    expect(result.data.value).toEqual([])
  })

  it("next() appends data and uses cursor", async () => {
    let callCount = 0
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
        callCount++
        if (callCount === 1) return jsonResponse({ skellist: [{ key: "p1" }], cursor: "page2", orders: [] })
        return jsonResponse({ skellist: [{ key: "p2" }], cursor: "", orders: [] })
      })
    )

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)
    expect(result.cursor.value).toBe("page2")

    await result.next()
    await waitUntilFinished(result)

    expect(result.data.value.map((e) => e.key)).toEqual(["p1", "p2"])
    expect(result.cursor.value).toBe("")
  })

  it("filter() calls execute() with new params", async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal("fetch", fetchMock)

    const result = useListFetch("items", { immediate: false })
    await result.filter({ category: "books" })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls.find(([u]) => u.includes("/list"))
    expect(url).toContain("category=books")
  })

  it("reset() clears state without fetching", async () => {
    vi.stubGlobal("fetch", makeFetch({ skellist: [{ key: "e1" }] }))

    const result = useListFetch("items", { immediate: false })
    await result.execute()
    await waitUntilFinished(result)

    result.reset()
    expect(result.data.value).toEqual([])
    expect(result.cursor.value).toBe("")
    expect(result.orders.value).toEqual([])
  })

  it("cached: true stores response and serves cache hit", async () => {
    const fetchMock = makeFetch({ skellist: [{ key: "cached1" }] })
    vi.stubGlobal("fetch", fetchMock)

    // First fetch populates cache
    const r1 = useListFetch("items", { immediate: false, cached: true, ttl: 3600 })
    await r1.execute()
    await waitUntilFinished(r1)
    expect(r1.data.value).toEqual([{ key: "cached1" }])

    const firstCallCount = fetchMock.mock.calls.filter(([u]) => u.includes("/list")).length

    // Second instance should hit cache, not fetch
    const r2 = useListFetch("items", { immediate: false, cached: true, ttl: 3600 })
    await r2.execute()
    await waitUntilFinished(r2)
    expect(r2.data.value).toEqual([{ key: "cached1" }])

    const secondCallCount = fetchMock.mock.calls.filter(([u]) => u.includes("/list")).length
    expect(secondCallCount).toBe(firstCallCount) // no additional list fetch
  })

  it("execute() rejects with HTTPError on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
        return jsonResponse({}, 404)
      })
    )

    const result = useListFetch("items", { immediate: false })
    await expect(result.execute()).rejects.toBeInstanceOf(HTTPError)
    expect(result.error.value).toBeInstanceOf(HTTPError)
    expect(result.error.value.statusCode).toBe(404)
  })
})

// ─── useListFetchAll ──────────────────────────────────────────────────────────

describe("useListFetchAll", () => {
  it("auto-fetches all pages until cursor is empty", async () => {
    let page = 0
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
        page++
        if (page === 1) return jsonResponse({ skellist: [{ key: "p1" }], cursor: "next", orders: [] })
        if (page === 2) return jsonResponse({ skellist: [{ key: "p2" }], cursor: "next2", orders: [] })
        return jsonResponse({ skellist: [{ key: "p3" }], cursor: "", orders: [] })
      })
    )

    const result = useListFetchAll("items", { immediate: false })
    await result.execute()

    expect(result.data.value.map((e) => e.key)).toEqual(["p1", "p2", "p3"])
    expect(result.complete.value).toBe(true)
  })

  it("loads every page with immediate=true", async () => {
    let page = 0
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
        page++
        if (page === 1) return jsonResponse({ skellist: [{ key: "p1" }], cursor: "next", orders: [] })
        return jsonResponse({ skellist: [{ key: "p2" }], cursor: "", orders: [] })
      })
    )

    const result = useListFetchAll("items")

    await vi.waitFor(() => {
      if (!result.complete.value) throw new Error("not done")
    })
    expect(result.data.value.map((e) => e.key)).toEqual(["p1", "p2"])
  })

  it("stops at an empty page that repeats the cursor", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
      if (!url.includes("cursor=")) return jsonResponse({ skellist: [{ key: "p1" }], cursor: "end", orders: [] })
      return jsonResponse({ skellist: [], cursor: "end", orders: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useListFetchAll("items", { immediate: false })
    await result.execute()

    expect(result.data.value.map((e) => e.key)).toEqual(["p1"])
    expect(result.complete.value).toBe(true)
    expect(fetchMock.mock.calls.filter(([u]) => u.includes("/list")).length).toBe(2)
  })

  it("execute() rejects when a later page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
        if (!url.includes("cursor=")) return jsonResponse({ skellist: [{ key: "p1" }], cursor: "next", orders: [] })
        return jsonResponse({}, 500)
      })
    )

    const result = useListFetchAll("items", { immediate: false })
    await expect(result.execute()).rejects.toBeInstanceOf(HTTPError)
    expect(result.data.value.map((e) => e.key)).toEqual(["p1"])
  })
})

// ─── useTreeFetch ─────────────────────────────────────────────────────────────

function makeTreeFetch({ nodeCursor = "", leafCursor = "" } = {}) {
  let nodePage = 0
  let leafPage = 0
  return vi.fn().mockImplementation(async (url) => {
    if (url.includes("/structure")) return jsonResponse({ viewNodeSkel: { name: {} }, viewLeafSkel: { file: {} } })
    if (url.includes("skelType=node")) {
      nodePage++
      return jsonResponse({
        skellist: [{ key: `n${nodePage}` }],
        cursor: nodePage === 1 ? nodeCursor : "",
        orders: [],
      })
    }
    if (url.includes("skelType=leaf")) {
      leafPage++
      return jsonResponse({
        skellist: [{ key: `l${leafPage}` }],
        cursor: leafPage === 1 ? leafCursor : "",
        orders: [],
      })
    }
    throw new Error(`unexpected url ${url}`)
  })
}

describe("useTreeFetch", () => {
  it("fetches nodes and leaves of a parent and combines them", async () => {
    const fetchMock = makeTreeFetch()
    vi.stubGlobal("fetch", fetchMock)

    const tree = useTreeFetch("files", { parententry: "root1" })
    await waitUntilFinished(tree)

    const listUrls = fetchMock.mock.calls.map(([u]) => u).filter((u) => u.includes("/list"))
    expect(listUrls).toHaveLength(2)
    expect(listUrls.some((u) => u.includes("skelType=node") && u.includes("parententry=root1"))).toBe(true)
    expect(listUrls.some((u) => u.includes("skelType=leaf") && u.includes("parententry=root1"))).toBe(true)

    expect(tree.nodes.data.value).toEqual([{ key: "n1" }])
    expect(tree.leaves.data.value).toEqual([{ key: "l1" }])
    expect(tree.data.value).toEqual([
      { key: "n1", skelType: "node" },
      { key: "l1", skelType: "leaf" },
    ])
    expect(tree.structure.value).toEqual({ node: { name: {} }, leaf: { file: {} } })
    expect(tree.hasMore.value).toBe(false)
    expect(tree.error.value).toBeNull()
  })

  it("next() paginates nodes first, then leaves", async () => {
    vi.stubGlobal("fetch", makeTreeFetch({ nodeCursor: "n-more", leafCursor: "l-more" }))

    const tree = useTreeFetch("files", { parententry: "root1" })
    await waitUntilFinished(tree)
    expect(tree.hasMore.value).toBe(true)

    await tree.next()
    await waitUntilFinished(tree)
    expect(tree.nodes.data.value.map((e) => e.key)).toEqual(["n1", "n2"])
    expect(tree.leaves.data.value.map((e) => e.key)).toEqual(["l1"])
    expect(tree.hasMore.value).toBe(true)

    await tree.next()
    await waitUntilFinished(tree)
    expect(tree.leaves.data.value.map((e) => e.key)).toEqual(["l1", "l2"])
    expect(tree.hasMore.value).toBe(false)
  })

  it("open() re-fetches both lists for a new parententry, keeping other params", async () => {
    const fetchMock = makeTreeFetch()
    vi.stubGlobal("fetch", fetchMock)

    const tree = useTreeFetch("files", { parententry: "root1", params: { orderby: "name" } })
    await waitUntilFinished(tree)

    await tree.open("sub1")
    await waitUntilFinished(tree)

    const listUrls = fetchMock.mock.calls.map(([u]) => u).filter((u) => u.includes("parententry=sub1"))
    expect(listUrls).toHaveLength(2)
    expect(listUrls.every((u) => u.includes("orderby=name"))).toBe(true)
    expect(listUrls.some((u) => u.includes("skelType=node"))).toBe(true)
    expect(listUrls.some((u) => u.includes("skelType=leaf"))).toBe(true)
    expect(tree.data.value.map((e) => e.key)).toEqual(["n2", "l2"])
  })

  it("all: true fetches every page of both lists", async () => {
    vi.stubGlobal("fetch", makeTreeFetch({ nodeCursor: "n-more", leafCursor: "l-more" }))

    const tree = useTreeFetch("files", { parententry: "root1", all: true })
    await vi.waitFor(() => {
      if (tree.data.value.length !== 4) throw new Error("not all pages yet")
    })
    expect(tree.data.value.map((e) => e.key)).toEqual(["n1", "n2", "l1", "l2"])
    expect(tree.hasMore.value).toBe(false)
  })

  it("reset() clears both lists", async () => {
    vi.stubGlobal("fetch", makeTreeFetch())

    const tree = useTreeFetch("files", { parententry: "root1" })
    await waitUntilFinished(tree)
    tree.reset()
    expect(tree.data.value).toEqual([])
    expect(tree.structure.value).toEqual({ node: {}, leaf: {} })
  })
})

// ─── useViewFetch ─────────────────────────────────────────────────────────────

describe("useViewFetch", () => {
  it("GETs /json/{controller}/view with data params as query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: { key: "v1", name: "Test" } }))
    vi.stubGlobal("fetch", fetchMock)

    const result = useViewFetch("items", "/", { key: "v1" })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain(`${BASE}/json/items/view`)
    expect(url).toContain("key=v1")
  })

  it("cached: true returns cache hit without re-fetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: { key: "cv1" } }))
    vi.stubGlobal("fetch", fetchMock)

    const r1 = useViewFetch("items", "/", { key: "cv1" }, { cached: true, ttl: 3600 })
    await waitUntilFinished(r1)
    // body is normalized to the canonical v2 envelope: entity payload in `data`
    expect(r1.data.value.data).toEqual({ key: "cv1" })
    expect(r1.data.value.version).toBe(2)

    const callCountAfterFirst = fetchMock.mock.calls.length

    const r2 = useViewFetch("items", "/", { key: "cv1" }, { cached: true, ttl: 3600 })
    await waitUntilFinished(r2)
    expect(r2.data.value.data).toEqual({ key: "cv1" })
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst) // no new fetch
  })

  it("sets HTTPError on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)))

    const result = useViewFetch("items", "/", { key: "missing" })
    await waitUntilFinished(result)

    expect(result.error.value).toBeInstanceOf(HTTPError)
    expect(result.error.value.statusCode).toBe(404)
  })

  it("execute() rejects with HTTPError on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)))

    const result = useViewFetch("items", "/", { key: "missing" }, { immediate: false })
    await expect(result.execute()).rejects.toBeInstanceOf(HTTPError)
    expect(result.error.value).toBeInstanceOf(HTTPError)
    expect(result.error.value.statusCode).toBe(404)
  })
})

// ─── useStructureFetch ────────────────────────────────────────────────────────

describe("useStructureFetch", () => {
  it("GETs /json/{controller}/structure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ viewSkel: { title: { type: "str" } } }))
    vi.stubGlobal("fetch", fetchMock)

    const result = useStructureFetch("items", "/")
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain(`${BASE}/json/items/structure`)
  })
})

// ─── useEditFetch ─────────────────────────────────────────────────────────────

describe("useEditFetch", () => {
  it("POSTs FormData with skey to /json/{controller}/edit", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk-edit"])
      return jsonResponse({ action: "editSuccess", values: { key: "k1" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useEditFetch("items", "/", { key: "k1", name: "Updated" })
    await waitUntilFinished(result)

    const [editUrl, editOptions] = fetchMock.mock.calls.find(([u]) => u.includes("/edit"))
    expect(editUrl).toContain(`${BASE}/json/items/edit`)
    expect(editOptions.method).toBe("POST")
    expect(editOptions.body).toBeInstanceOf(FormData)
    expect(editOptions.body.get("skey")).toBe("sk-edit")
    expect(editOptions.body.get("name")).toBe("Updated")
  })

  it("invalidates cache by entity key after success", async () => {
    // Pre-populate cache
    await setCached(`${BASE}/json/items/view?key=k1`, { values: { key: "k1" } }, ["k1"])
    expect(
      await import("../../src/request/cache.js").then((m) => m.getCached(`${BASE}/json/items/view?key=k1`, 0))
    ).not.toBeNull()

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk-inv"])
        return jsonResponse({ action: "editSuccess", values: { key: "k1" } })
      })
    )

    const result = useEditFetch("items", "/", { key: "k1" })
    await waitUntilFinished(result)

    const cached = await import("../../src/request/cache.js").then((m) =>
      m.getCached(`${BASE}/json/items/view?key=k1`, 0)
    )
    expect(cached).toBeNull()
  })

  it("sends credentials: include", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk"])
      return jsonResponse({ action: "editSuccess", values: {} })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useEditFetch("items", "/", {})
    await waitUntilFinished(result)

    const [, options] = fetchMock.mock.calls.find(([u]) => u.includes("/edit"))
    expect(options.credentials).toBe("include")
  })

  it("sends null and empty arrays as '' so the server empties them, omits undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk"])
        return jsonResponse({ action: "editSuccess", values: {} })
      })
    )

    const result = useEditFetch("items", "/", {
      name: "x",
      emptyField: null,
      emptyList: [],
      list: ["a", null, "b"],
      optional: undefined,
    })
    await waitUntilFinished(result)

    const [, options] = vi.mocked(globalThis.fetch).mock.calls.find(([u]) => u.includes("/edit"))
    // null must not appear as the string "null"
    expect(options.body.getAll("emptyField")).toEqual([""])
    expect(options.body.getAll("emptyList")).toEqual([""])
    expect(options.body.getAll("list")).toEqual(["a", "b"])
    expect(options.body.has("optional")).toBe(false)
    expect(options.body.get("name")).toBe("x")
  })
})

// ─── useAddFetch ──────────────────────────────────────────────────────────────

describe("useAddFetch", () => {
  it("POSTs to /json/{controller}/add with skey", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk-add"])
      return jsonResponse({ action: "addSuccess", values: { key: "new-key" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useAddFetch("items", "/", { name: "New Item" })
    await waitUntilFinished(result)

    const [addUrl, addOptions] = fetchMock.mock.calls.find(([u]) => u.includes("/add"))
    expect(addUrl).toContain(`${BASE}/json/items/add`)
    expect(addOptions.body.get("skey")).toBe("sk-add")
  })

  it("clears cache by controller prefix after success", async () => {
    const listKey = `${BASE}/json/items/list`
    await setCached(listKey, { skellist: [] }, [])

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk-add"])
        return jsonResponse({ action: "addSuccess", values: { key: "new-key" } })
      })
    )

    const result = useAddFetch("items", "/", { name: "New" })
    await waitUntilFinished(result)

    const cached = await import("../../src/request/cache.js").then((m) => m.getCached(listKey, 0))
    expect(cached).toBeNull()
  })
})

describe("useAddFetch cache", () => {
  it("clears the module's lists in every language and version, nothing else", async () => {
    const { getCached } = await import("../../src/request/cache.js")
    const keys = {
      plain: `${BASE}/json/items/list`,
      lang: `${BASE}/de/json/items/list?limit=99`,
      version: `${BASE}/json/v2/items/list`,
      otherModule: `${BASE}/json/other/list`,
      nestedModule: `${BASE}/json/shop/items/list`,
    }
    for (const key of Object.values(keys)) await setCached(key, { skellist: [] }, [])
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk-add"])
        return jsonResponse({ action: "addSuccess", values: { key: "new-key" } })
      })
    )

    await waitUntilFinished(useAddFetch("items", "/", { name: "New" }))

    const left = {}
    for (const [name, key] of Object.entries(keys)) left[name] = (await getCached(key, 0)) !== null
    expect(left).toEqual({ plain: false, lang: false, version: false, otherModule: true, nestedModule: true })
  })
})

// ─── useDeleteFetch ───────────────────────────────────────────────────────────

describe("useDeleteFetch", () => {
  it("POSTs to /json/{controller}/delete with skey and invalidates", async () => {
    const viewKey = `${BASE}/json/items/view?key=del1`
    await setCached(viewKey, { values: { key: "del1" } }, ["del1"])

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk-del"])
        return jsonResponse({ action: "deleteSuccess", values: { key: "del1" } })
      })
    )

    const result = useDeleteFetch("items", "/", { key: "del1" })
    await waitUntilFinished(result)

    const [delUrl] = vi.mocked(globalThis.fetch).mock.calls.find(([u]) => u.includes("/delete"))
    expect(delUrl).toContain(`${BASE}/json/items/delete`)

    const cached = await import("../../src/request/cache.js").then((m) => m.getCached(viewKey, 0))
    expect(cached).toBeNull()
  })
})

// ─── useCloneFetch ────────────────────────────────────────────────────────────

describe("useCloneFetch", () => {
  it("List: POSTs key with skey to /json/{controller}/clone and clears controller cache", async () => {
    const listKey = `${BASE}/json/items/list`
    await setCached(listKey, { skellist: [] }, [])

    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk-clone"])
      return jsonResponse({ action: "cloneSuccess", values: { key: "cloned" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useCloneFetch("items", "/", { key: "src1", name: "Copy" })
    await waitUntilFinished(result)

    const [url, options] = fetchMock.mock.calls.find(([u]) => u.includes("/clone"))
    expect(url).toContain(`${BASE}/json/items/clone`)
    expect(options.method).toBe("POST")
    expect(options.body.get("key")).toBe("src1")
    expect(options.body.get("skey")).toBe("sk-clone")
    expect(result.data.value.action).toBe("clone")
    expect(result.data.value.status).toBe("success")

    const cached = await import("../../src/request/cache.js").then((m) => m.getCached(listKey, 0))
    expect(cached).toBeNull()
  })

  it("Tree: passes skelType and parententry in the body", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk-clone"])
      return jsonResponse({ action: "cloneSuccess", values: { key: "cloned" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useCloneFetch("files", "/", { skelType: "node", key: "n1", parententry: "root1" })
    await waitUntilFinished(result)

    const [url, options] = fetchMock.mock.calls.find(([u]) => u.includes("/clone"))
    expect(url).toContain(`${BASE}/json/files/clone`)
    expect(options.body.get("skelType")).toBe("node")
    expect(options.body.get("parententry")).toBe("root1")
  })
})

// ─── usePreviewFetch ──────────────────────────────────────────────────────────

describe("usePreviewFetch", () => {
  it("POSTs values with skey to /json/{controller}/preview", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk-prev"])
      return jsonResponse({ action: "view", values: { name: "Draft" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = usePreviewFetch("items", "/", { name: "Draft" })
    await waitUntilFinished(result)

    const [url, options] = fetchMock.mock.calls.find(([u]) => u.includes("/preview"))
    expect(url).toContain(`${BASE}/json/items/preview`)
    expect(options.method).toBe("POST")
    expect(options.body.get("name")).toBe("Draft")
    expect(options.body.get("skey")).toBe("sk-prev")
    expect(result.data.value.data).toEqual({ name: "Draft" })
  })
})

// ─── useMoveFetch ─────────────────────────────────────────────────────────────

describe("useMoveFetch", () => {
  it("POSTs skelType/key/parentNode with skey and invalidates entity + controller cache", async () => {
    const viewKey = `${BASE}/json/files/view?key=leaf1&skelType=leaf`
    const listKey = `${BASE}/json/files/list?skelType=leaf&parententry=old`
    await setCached(viewKey, { values: { key: "leaf1" } }, ["leaf1"])
    await setCached(listKey, { skellist: [] }, [])

    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk-move"])
      return jsonResponse({ action: "moveSuccess", values: { key: "leaf1", parententry: "new" } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = useMoveFetch("files", "/", { skelType: "leaf", key: "leaf1", parentNode: "new", sortindex: 5 })
    await waitUntilFinished(result)

    const [url, options] = fetchMock.mock.calls.find(([u]) => u.includes("/move"))
    expect(url).toContain(`${BASE}/json/files/move`)
    expect(options.method).toBe("POST")
    expect(options.body.get("skelType")).toBe("leaf")
    expect(options.body.get("key")).toBe("leaf1")
    expect(options.body.get("parentNode")).toBe("new")
    expect(options.body.get("sortindex")).toBe("5")
    expect(options.body.get("skey")).toBe("sk-move")
    expect(result.data.value.action).toBe("move")
    expect(result.data.value.status).toBe("success")

    const cache = await import("../../src/request/cache.js")
    expect(await cache.getCached(viewKey, 0)).toBeNull()
    expect(await cache.getCached(listKey, 0)).toBeNull()
  })
})

// ─── useListRootNodesFetch ────────────────────────────────────────────────────

describe("useListRootNodesFetch", () => {
  it("GETs /json/{controller}/listRootNodes and returns the plain array", async () => {
    const rootNodes = [{ name: "Default", key: "root1" }]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rootNodes))
    vi.stubGlobal("fetch", fetchMock)

    const result = useListRootNodesFetch("files")
    await waitUntilFinished(result)

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/json/files/listRootNodes`)
    expect(options.method).toBe("GET")
    expect(result.data.value).toEqual(rootNodes)
  })
})

// ─── createControllerFetch options ───────────────────────────────────────────

describe("createControllerFetch options", () => {
  it("version: adds version segment to URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: {} }))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "view" })
    const result = useFetch("items", "/", {}, { version: "v2" })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("/v2/")
  })

  it("query: appends extra query string to a GET url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: {} }))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "view" })
    const result = useFetch("items", "/", {}, { query: "token=abc&foo=bar" })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("token=abc")
    expect(url).toContain("foo=bar")
  })

  it("GET: sends an array in data as repeated params, as the server expects for a list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "costs" })
    const result = useFetch("items", "/", { key: ["a", "b"], other: "x" })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    const params = new URL(url).searchParams
    expect(params.getAll("key")).toEqual(["a", "b"])
    expect(params.get("other")).toBe("x")
  })

  it("query: sends an array in a query object as repeated params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "view" })
    const result = useFetch("items", "/", {}, { query: { key: ["a", "b"] } })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(new URL(url).searchParams.getAll("key")).toEqual(["a", "b"])
  })

  it("GET: takes data given as URLSearchParams unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "costs" })
    const data = new URLSearchParams([
      ["key", "a"],
      ["key", "b"],
    ])
    const result = useFetch("items", "/", data)
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(new URL(url).searchParams.getAll("key")).toEqual(["a", "b"])
  })

  it("query: appends to a POST url without leaking into the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ action: "editSuccess", values: {} }))
    vi.stubGlobal("fetch", fetchMock)

    // secure defaults to false here → no skey fetch
    const useFetch = createControllerFetch({ endpoint: "edit", method: "POST" })
    const result = useFetch("items", "/", { name: "x" }, { query: "token=abc" })
    await waitUntilFinished(result)

    const [url, options] = fetchMock.mock.calls.find(([u]) => u.includes("/edit"))
    expect(url).toContain("token=abc")
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get("name")).toBe("x")
    expect(options.body.get("token")).toBeNull() // query stays in the URL, not the body
  })

  it("lang: adds lang segment to URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: {} }))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "view" })
    const result = useFetch("items", "/", {}, { lang: "de" })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("/de/")
  })

  it("renderer: uses custom renderer in URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: {} }))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "view" })
    const result = useFetch("items", "/", {}, { renderer: "vi" })
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("/vi/items/view")
  })

  it("headers: custom headers are merged into request", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk"])
      return jsonResponse({ action: "editSuccess", values: {} })
    })
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "edit", method: "POST", secure: true })
    const result = useFetch("items", "/", {}, { headers: { "X-Custom": "test-value" } })
    await waitUntilFinished(result)

    const [, options] = fetchMock.mock.calls.find(([u]) => u.includes("/edit"))
    expect(options.headers["X-Custom"]).toBe("test-value")
  })

  it("mode: sets fetch mode option", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: {} }))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "view" })
    const result = useFetch("items", "/", {}, { mode: "cors" })
    await waitUntilFinished(result)

    const [, options] = fetchMock.mock.calls[0]
    expect(options.mode).toBe("cors")
  })

  it("controller as array: joins with slashes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: {} }))
    vi.stubGlobal("fetch", fetchMock)

    const useFetch = createControllerFetch({ endpoint: "view" })
    const result = useFetch(["category", "items"], "/")
    await waitUntilFinished(result)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("/json/category/items/view")
  })
})

// ─── uploadFile ───────────────────────────────────────────────────────────────

describe("uploadFile", () => {
  it("performs three-step upload: getUploadURL → storage → file/add", async () => {
    const uploadUrl = "https://storage.googleapis.com/upload/abc"
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk1", "sk2", "sk3", "sk4"])
      if (url.includes("/getUploadURL")) return jsonResponse({ values: { uploadUrl, uploadKey: "upload-key" } })
      if (url.includes("/file/add"))
        return jsonResponse({ action: "addSuccess", values: { key: "file-key", name: "test.jpg" } })
      // storage upload (no-cors)
      return { ok: true, status: 200, json: () => Promise.resolve(null) }
    })
    vi.stubGlobal("fetch", fetchMock)

    const file = new File(["hello"], "test.jpg", { type: "image/jpeg" })
    const values = await uploadFile(file)

    expect(values).toEqual({ key: "file-key", name: "test.jpg" })

    const urlCalls = fetchMock.mock.calls.map(([u]) => u)
    expect(urlCalls.some((u) => u.includes("/getUploadURL"))).toBe(true)
    expect(urlCalls.some((u) => u === uploadUrl)).toBe(true)
    expect(urlCalls.some((u) => u.includes("/file/add"))).toBe(true)
  })

  it("uses no-cors mode for storage upload", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      if (url.includes("/skey")) return jsonResponse(["sk1", "sk2", "sk3", "sk4"])
      if (url.includes("/getUploadURL"))
        return jsonResponse({ values: { uploadUrl: "https://storage.example.com/upload", uploadKey: "k" } })
      if (url.includes("/file/add")) return jsonResponse({ action: "addSuccess", values: {} })
      return { ok: true, status: 200, json: () => Promise.resolve(null) }
    })
    vi.stubGlobal("fetch", fetchMock)

    const file = new File(["data"], "file.bin", { type: "application/octet-stream" })
    await uploadFile(file)

    const storageCall = fetchMock.mock.calls.find(([u]) => u.includes("storage.example.com"))
    expect(storageCall[1].mode).toBe("no-cors")
  })

  it("passes the abort signal to all three requests", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk1", "sk2", "sk3", "sk4"])
      if (url.includes("/getUploadURL"))
        return jsonResponse({ values: { uploadUrl: "https://storage.example.com/upload", uploadKey: "k" } })
      if (url.includes("/file/add")) return jsonResponse({ action: "addSuccess", values: {} })
      return { ok: true, status: 200, json: () => Promise.resolve(null) }
    })
    vi.stubGlobal("fetch", fetchMock)
    const { signal } = new AbortController()

    await uploadFile(new File(["data"], "file.bin"), { signal })

    const uploadCalls = fetchMock.mock.calls.filter(([u]) => !u.includes("/skey"))
    expect(uploadCalls).toHaveLength(3)
    expect(uploadCalls.every(([, opts]) => opts.signal === signal)).toBe(true)
  })

  it("passes target and publicUpload to getUploadURL", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/skey")) return jsonResponse(["sk1", "sk2", "sk3", "sk4"])
      if (url.includes("/getUploadURL"))
        return jsonResponse({ values: { uploadUrl: "https://storage.example.com/upload", uploadKey: "k" } })
      if (url.includes("/file/add")) return jsonResponse({ action: "addSuccess", values: {} })
      return { ok: true, status: 200, json: () => Promise.resolve(null) }
    })
    vi.stubGlobal("fetch", fetchMock)

    const file = new File(["x"], "x.txt", { type: "text/plain" })
    await uploadFile(file, { target: "node-key", publicUpload: true })

    const [, opts] = fetchMock.mock.calls.find(([u]) => u.includes("/getUploadURL"))
    expect(opts.body.get("node")).toBe("node-key")
    expect(opts.body.get("public")).toBe("true")
  })

  it("throws when getUploadURL fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk1", "sk2"])
        return { ok: false, status: 500, json: () => Promise.resolve(null) }
      })
    )

    const file = new File(["x"], "x.txt")
    await expect(uploadFile(file)).rejects.toThrow("getUploadURL failed")
  })

  it("keeps status and reason of the server when getUploadURL is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk1", "sk2"])
        return jsonResponse({ status: 413, reason: "Request Entity Too Large", descr: "File too large" }, 413)
      })
    )

    const error = await uploadFile(new File(["x"], "x.txt")).catch((e) => e)
    expect(error).toBeInstanceOf(HTTPError)
    expect(error.statusCode).toBe(413)
    expect(error.message).toBe("getUploadURL failed: 413 - File too large")
  })

  it("keeps the reason of the server when file/add is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (url.includes("/skey")) return jsonResponse(["sk1", "sk2"])
        if (url.includes("/getUploadURL"))
          return jsonResponse({ values: { uploadUrl: "https://storage.example.com/upload", uploadKey: "k" } })
        if (url.includes("/file/add")) return jsonResponse({ status: 403, descr: "No access" }, 403)
        return { ok: true, status: 200, json: () => Promise.resolve(null) }
      })
    )

    const error = await uploadFile(new File(["x"], "x.txt")).catch((e) => e)
    expect(error.statusCode).toBe(403)
    expect(error.message).toBe("file/add failed: 403 - No access")
  })
})

describe("useTreeFetch — parententry bleibt über filter()/next() erhalten", () => {
  it("filter mit parententry + anschließende next()-Seiten tragen Ort und amount", async () => {
    let call = 0
    const urls = []
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        urls.push(url)
        if (url.includes("/structure")) return jsonResponse({ viewNodeSkel: {}, viewLeafSkel: {} })
        call++
        return jsonResponse({ skellist: [{ key: `e${call}` }], cursor: call < 8 ? `c${call}` : "", orders: [] })
      })
    )
    const tree = useTreeFetch("files", { params: { limit: 10 }, immediate: false })
    await tree.open("root-1")
    // Page size change: new limit, location MUST be included (ViurBrowser currentParams)
    await tree.filter({ limit: 50, parententry: "root-1" })
    await tree.next()
    await tree.next()

    const afterFilter = urls.filter((u) => u.includes("/list") && u.includes("limit=50"))
    expect(afterFilter.length).toBeGreaterThanOrEqual(3)
    for (const url of afterFilter) {
      expect(url, url).toContain("parententry=root-1")
    }
  })
})

describe("useTreeFetch — nextAll lädt beide Listen vollständig", () => {
  function staleCursorServer(nodePages, leafPages) {
    let nodeCalls = 0
    let leafCalls = 0
    return vi.fn().mockImplementation(async (url) => {
      if (url.includes("/structure")) return jsonResponse({ viewNodeSkel: {}, viewLeafSkel: {} })
      if (url.includes("skelType=node")) {
        nodeCalls++
        // last "page": empty, but with the SAME cursor marker (ViUR end)
        if (nodeCalls > nodePages) return jsonResponse({ skellist: [], cursor: `n${nodePages}`, orders: [] })
        return jsonResponse({ skellist: [{ key: `n-${nodeCalls}` }], cursor: `n${nodeCalls}`, orders: [] })
      }
      leafCalls++
      if (leafCalls > leafPages) return jsonResponse({ skellist: [], cursor: `l${leafPages}`, orders: [] })
      return jsonResponse({ skellist: [{ key: `l-${leafCalls}` }], cursor: `l${leafCalls}`, orders: [] })
    })
  }

  it("nextAll() lädt Nodes UND Leaves bis zum Ende (stale-Cursor-Abschluss)", async () => {
    vi.stubGlobal("fetch", staleCursorServer(3, 2))
    const tree = useTreeFetch("files", { parententry: "root-1", immediate: false })
    await tree.execute()
    await tree.nextAll()
    expect(tree.data.value.map((e) => e.key)).toEqual(["n-1", "n-2", "n-3", "l-1", "l-2"])
    expect(tree.hasMore.value).toBe(false)
    expect(tree.complete.value).toBe(true)
  })

  it("next() bleibt nicht am Nodes-Ende hängen, sondern lädt danach Leaves", async () => {
    vi.stubGlobal("fetch", staleCursorServer(1, 2))
    const tree = useTreeFetch("files", { parententry: "root-1", immediate: false })
    await tree.execute() // page 1 of both lists
    await tree.next() // nodes: empty page with old cursor → exhausted → leaves page 2
    expect(tree.data.value.map((e) => e.key)).toEqual(["n-1", "l-1", "l-2"])
    await tree.next()
    expect(tree.hasMore.value).toBe(false)
  })
})

describe("useListFetch — next(pages) / nextAll", () => {
  function pagedServer(pages) {
    let calls = 0
    return vi.fn().mockImplementation(async (url) => {
      if (url.includes("/structure")) return jsonResponse({ viewSkel: {} })
      calls++
      // end: empty page with the same cursor marker (ViUR behavior)
      if (calls > pages) return jsonResponse({ skellist: [], cursor: `c${pages}`, orders: [] })
      return jsonResponse({ skellist: [{ key: `e${calls}` }], cursor: `c${calls}`, orders: [] })
    })
  }

  it("next(3) lädt drei Seiten", async () => {
    vi.stubGlobal("fetch", pagedServer(10))
    const list = useListFetch("items", { immediate: false })
    await list.execute()
    await list.next(3)
    expect(list.data.value.map((e) => e.key)).toEqual(["e1", "e2", "e3", "e4"])
    expect(list.cursor.value).toBe("c4")
  })

  it("nextAll() lädt bis zum Stale-Cursor-Ende und löscht den Cursor", async () => {
    vi.stubGlobal("fetch", pagedServer(4))
    const list = useListFetch("items", { immediate: false })
    expect(list.complete.value).toBe(false)
    await list.execute()
    expect(list.complete.value).toBe(false) // cursor open
    await list.nextAll()
    expect(list.data.value.map((e) => e.key)).toEqual(["e1", "e2", "e3", "e4"])
    expect(list.cursor.value).toBe("")
    expect(list.complete.value).toBe(true)
  })

  it("next() über das Ende hinaus bleibt harmlos", async () => {
    vi.stubGlobal("fetch", pagedServer(1))
    const list = useListFetch("items", { immediate: false })
    await list.execute()
    await list.nextAll()
    await list.next()
    expect(list.data.value.map((e) => e.key)).toEqual(["e1"])
  })
})

describe("useListFetch — superseded runs do not write", () => {
  it("a response that arrives after execute() does not overwrite the newer list", async () => {
    let releaseStructure
    const structureGate = new Promise((resolve) => (releaseStructure = resolve))
    let structureCalls = 0
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/structure")) {
        structureCalls++
        // the first run hangs between list response and structure response
        if (structureCalls === 1) await structureGate
        return jsonResponse({ viewSkel: {} })
      }
      const tenant = new URL(url).searchParams.get("tenant")
      return jsonResponse({ skellist: [{ key: `${tenant}1` }], cursor: `${tenant}-cursor`, orders: [] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const list = useListFetch("items", { immediate: false, params: { tenant: "a" } })
    const first = list.execute()
    await vi.waitFor(() => expect(structureCalls).toBe(1))

    await list.filter({ tenant: "b" })
    expect(list.data.value).toEqual([{ key: "b1" }])

    releaseStructure()
    await first
    expect(list.data.value).toEqual([{ key: "b1" }])
    expect(list.cursor.value).toBe("b-cursor")
  })

  it("aborting a running request is not reported as an error", async () => {
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (url.includes("/structure")) return Promise.resolve(jsonResponse({ viewSkel: {} }))
      if (new URL(url).searchParams.get("tenant") === "a") {
        // like the real fetch: reject at once on an already aborted signal
        return new Promise((_, reject) => {
          const fail = () => reject(new DOMException("aborted", "AbortError"))
          if (options.signal.aborted) fail()
          else options.signal.addEventListener("abort", fail)
        })
      }
      return Promise.resolve(jsonResponse({ skellist: [{ key: "b1" }], cursor: "", orders: [] }))
    })
    vi.stubGlobal("fetch", fetchMock)

    const list = useListFetch("items", { immediate: false, params: { tenant: "a" } })
    const first = list.execute()
    await list.filter({ tenant: "b" })
    await first

    expect(list.data.value).toEqual([{ key: "b1" }])
    expect(list.error.value).toBeNull()
  })
})
