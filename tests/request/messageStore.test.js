import { describe, it, expect, beforeEach, vi } from "vitest"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import { setActivePinia, createPinia } from "pinia"
import { useMessageStore, getMessageStore, notify, requestMessage } from "../../src/request/messageStore.js"
import {
  useEditFetch,
  useViewFetch,
  useDeleteFetch,
  useListFetch,
  resetState,
  HTTPError,
} from "../../src/request/request.js"

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

async function waitUntilFinished(result) {
  await vi.waitFor(() => {
    if (!result.isFinished.value) throw new Error("not finished yet")
  })
}

const withSkey = (body, status = 200) =>
  vi.fn().mockImplementation(async (url) => (url.includes("/skey") ? jsonResponse(["sk"]) : jsonResponse(body, status)))

beforeEach(async () => {
  vi.useRealTimers() // a fake-timer test must not stall the async reset below
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  setActivePinia(createPinia())
  await resetState()
  vi.restoreAllMocks()
})

describe("useMessageStore", () => {
  it("pushes messages with defaults and shortcuts", () => {
    const store = useMessageStore()
    const m = store.success("messages.request.edit.success", { module: "user", key: "k1" })
    expect(m.id).toBeGreaterThan(0)
    expect(m.type).toBe("success")
    expect(m.fallbackCode).toBe("messages.request.default.success")
    expect(m.module).toBe("user")
    expect(m.timeout).toBe(5000)
    expect(store.count).toBe(1)
    expect(store.latest).toBe(store.state.messages[0])

    const e = store.error({ text: "Boom", status: 500 })
    expect(e.type).toBe("error")
    expect(e.timeout).toBe(0) // sticky
    expect(store.errors).toHaveLength(1)
  })

  it("auto-dismisses after the timeout, errors stay", () => {
    vi.useFakeTimers()
    const store = useMessageStore()
    store.success("x")
    store.error("y")
    expect(store.count).toBe(2)
    vi.advanceTimersByTime(5000)
    expect(store.count).toBe(1)
    expect(store.latest.type).toBe("error")
  })

  it("remove(), clear(type) and clear()", () => {
    const store = useMessageStore()
    const a = store.info("a")
    store.warning("b")
    store.error("c")
    store.remove(a.id)
    expect(store.state.messages.map((m) => m.code)).toEqual(["b", "c"])
    store.clear("warning")
    expect(store.state.messages.map((m) => m.code)).toEqual(["c"])
    store.clear()
    expect(store.count).toBe(0)
  })

  it("configure() adjusts timeouts and max", () => {
    const store = useMessageStore()
    store.configure({ timeouts: { success: 0 }, max: 2 })
    store.success("1")
    store.success("2")
    store.success("3")
    expect(store.state.messages.map((m) => m.code)).toEqual(["2", "3"])
    expect(store.latest.timeout).toBe(0)
  })
})

describe("getMessageStore / notify — opt-in by existence", () => {
  it("returns the store when pinia is active", () => {
    expect(getMessageStore()).not.toBeNull()
    expect(notify({ type: "info", code: "x" })).toMatchObject({ code: "x" })
    expect(useMessageStore().count).toBe(1)
  })

  it("is a no-op without an active pinia", () => {
    setActivePinia(undefined)
    expect(getMessageStore()).toBeNull()
    expect(notify({ type: "info", code: "x" })).toBeNull()
  })
})

describe("requestMessage", () => {
  it("POST success → success message with action from the envelope", () => {
    const m = requestMessage({
      method: "POST",
      endpoint: "edit",
      module: "user",
      body: { version: 2, action: "edit", status: "success", data: { key: "k1" } },
    })
    expect(m).toMatchObject({ type: "success", code: "messages.request.edit.success", module: "user", key: "k1" })
  })

  it("POST rejected → error message carrying the envelope errors", () => {
    const m = requestMessage({
      method: "POST",
      endpoint: "login",
      module: "user.auth_userpassword",
      body: { action: "login", status: "rejected", errors: [{ field: "password" }] },
    })
    expect(m).toMatchObject({ type: "error", code: "messages.request.login.rejected", errors: [{ field: "password" }] })
    expect(m.params.count).toBe(1)
  })

  it("POST non-envelope body (v1 delete 'OKAY') → success with the endpoint as action", () => {
    const m = requestMessage({ method: "POST", endpoint: "delete", module: "items", body: "OKAY" })
    expect(m).toMatchObject({ type: "success", code: "messages.request.delete.success", action: "delete" })
  })

  it("POST rendering a form (status init/continue) and GET reads → nothing", () => {
    expect(requestMessage({ method: "POST", endpoint: "add", module: "x", body: { status: "init" } })).toBeNull()
    expect(requestMessage({ method: "POST", endpoint: "login", module: "x", body: { status: "continue" } })).toBeNull()
    expect(requestMessage({ method: "GET", endpoint: "view", module: "x", body: { status: "success" } })).toBeNull()
  })

  it("HTTP error → sticky error with the status", () => {
    const m = requestMessage({ method: "GET", endpoint: "view", module: "x", error: new HTTPError(404, "Not Found") })
    expect(m).toMatchObject({ type: "error", code: "messages.request.view.error", status: 404, text: "Not Found" })
  })
})

describe("request layer integration", () => {
  it("useEditFetch success pushes a success message", async () => {
    vi.stubGlobal("fetch", withSkey({ action: "editSuccess", values: { key: "k1" } }))
    const result = useEditFetch("user", "/", { key: "k1", name: "Ada" })
    await waitUntilFinished(result)

    const store = useMessageStore()
    expect(store.count).toBe(1)
    expect(store.latest).toMatchObject({
      type: "success",
      code: "messages.request.edit.success",
      module: "user",
      key: "k1",
    })
  })

  it("nested controller path is reported dotted", async () => {
    vi.stubGlobal("fetch", withSkey({ action: "deleteSuccess", values: { key: "k1" } }))
    const result = useDeleteFetch(["shop", "order"], "/", { key: "k1" })
    await waitUntilFinished(result)
    expect(useMessageStore().latest.module).toBe("shop.order")
  })

  it("rejected envelope pushes an error with the server errors", async () => {
    vi.stubGlobal(
      "fetch",
      withSkey({ action: "edit", values: {}, errors: [{ field: "name", errorMessage: "Field not set" }] })
    )
    const result = useEditFetch("user", "/", { key: "k1" })
    await waitUntilFinished(result)
    expect(useMessageStore().latest).toMatchObject({ type: "error", code: "messages.request.edit.rejected" })
    expect(useMessageStore().latest.errors[0].field).toBe("name")
  })

  it("HTTP error pushes an error message (GET and list)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    const view = useViewFetch("user", "/", { key: "k1" })
    await waitUntilFinished(view)
    const list = useListFetch("user")
    await waitUntilFinished(list)

    const codes = useMessageStore().state.messages.map((m) => [m.code, m.status])
    expect(codes).toEqual([
      ["messages.request.view.error", 500],
      ["messages.request.list.error", 500],
    ])
  })

  it("HTTP error carries the reason the server gives", async () => {
    vi.stubGlobal("fetch", withSkey({ status: 403, reason: "Forbidden", descr: "No access to this ticket" }, 403))
    const result = useEditFetch("ticket", "/", { key: "k1" })
    await waitUntilFinished(result)

    expect(result.error.value.statusCode).toBe(403)
    expect(result.error.value.message).toBe("No access to this ticket")
    expect(useMessageStore().latest).toMatchObject({ type: "error", status: 403, text: "No access to this ticket" })
  })

  it("HTTP error of a list carries the reason the server gives", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: 400, descr: "Invalid filter" }, 400)))
    const list = useListFetch("ticket")
    await waitUntilFinished(list)
    expect(useMessageStore().latest).toMatchObject({ type: "error", status: 400, text: "Invalid filter" })
  })

  it("GET success pushes nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ action: "view", values: { key: "k1" } })))
    const result = useViewFetch("user", "/", { key: "k1" })
    await waitUntilFinished(result)
    expect(useMessageStore().count).toBe(0)
  })

  it("ctx.messages = false keeps a request silent", async () => {
    vi.stubGlobal("fetch", withSkey({ action: "editSuccess", values: { key: "k1" } }))
    const result = useEditFetch("user", "/", { key: "k1" }, { messages: false })
    await waitUntilFinished(result)
    expect(useMessageStore().count).toBe(0)
  })

  it("without pinia the request layer just works", async () => {
    setActivePinia(undefined)
    vi.stubGlobal("fetch", withSkey({ action: "editSuccess", values: { key: "k1" } }))
    const result = useEditFetch("user", "/", { key: "k1" })
    await waitUntilFinished(result)
    expect(result.data.value.status).toBe("success")
  })
})
