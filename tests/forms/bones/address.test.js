import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import {
  addressKey,
  hasCoordinates,
  setAddressProvider,
  getAddressProvider,
  createAddressSync,
} from "../../../src/forms/bones/address.js"

describe("addressKey", () => {
  it("is null while street or city is missing", () => {
    expect(addressKey(null)).toBeNull()
    expect(addressKey({ city: "Musterstadt" })).toBeNull()
    expect(addressKey({ street_name: "Musterstraße" })).toBeNull()
  })

  it("ignores case, surrounding spaces and non-address fields", () => {
    const a = { street_name: "Musterstraße", street_number: "1", zip_code: "12345", city: "Musterstadt" }
    const b = { ...a, street_name: " musterstraße ", address_addition: "Hinterhaus", coordinates: [52.5, 13.4] }
    expect(addressKey(a)).toBe(addressKey(b))
  })

  it("changes when a geocodable field changes", () => {
    const a = { street_name: "Musterstraße", city: "Musterstadt" }
    expect(addressKey(a)).not.toBe(addressKey({ ...a, zip_code: "12345" }))
    expect(addressKey(a)).not.toBe(addressKey({ ...a, country: "de" }))
    expect(addressKey(a)).not.toBe(addressKey({ ...a, region: "Bayern" }))
  })
})

describe("hasCoordinates", () => {
  it("accepts a [lat, lng] pair, also as strings", () => {
    expect(hasCoordinates([51.49, 7.45])).toBe(true)
    expect(hasCoordinates(["51.49", "7.45"])).toBe(true)
  })

  it("rejects ViUR's empty value and incomplete input", () => {
    expect(hasCoordinates([0, 0])).toBe(false)
    expect(hasCoordinates([null, null])).toBe(false)
    expect(hasCoordinates([51.49, ""])).toBe(false)
    expect(hasCoordinates([51.49])).toBe(false)
    expect(hasCoordinates(null)).toBe(false)
  })
})

describe("address provider", () => {
  afterEach(() => setAddressProvider(null))

  it("is empty by default and returns what the app registered", () => {
    expect(getAddressProvider()).toBeNull()
    const provider = { geocode: async () => null }
    setAddressProvider(provider)
    expect(getAddressProvider()).toBe(provider)
  })
})

describe("createAddressSync", () => {
  const address = { street_name: "Musterstraße", street_number: "1", zip_code: "10115", city: "Berlin" }
  const berlin = [52.53, 13.38]
  const hamburg = [53.55, 9.99]
  let emitted
  const last = () => emitted[emitted.length - 1]

  beforeEach(() => {
    vi.useFakeTimers()
    emitted = []
  })
  afterEach(() => vi.useRealTimers())

  function setup(provider) {
    const sync = createAddressSync(provider, (value) => emitted.push(value), { delay: 100 })
    sync.init({})
    return sync
  }

  it("geocodes a typed address after the delay, once per address", async () => {
    const geocode = vi.fn(async () => berlin)
    const sync = setup({ geocode })

    sync.edit({ ...address })
    sync.edit({ ...address, address_addition: "Hinterhaus" }) // not part of the geocoded address
    await vi.advanceTimersByTimeAsync(100)

    expect(geocode).toHaveBeenCalledTimes(1)
    expect(last()).toEqual({ ...address, address_addition: "Hinterhaus", coordinates: berlin })

    sync.edit({ ...last(), address_addition: "Vorderhaus" })
    await vi.advanceTimersByTimeAsync(100)
    expect(geocode).toHaveBeenCalledTimes(1)
  })

  it("does not geocode stored coordinates on open, but after the address is edited", async () => {
    const geocode = vi.fn(async () => hamburg)
    const sync = createAddressSync({ geocode }, (value) => emitted.push(value), { delay: 100 })
    sync.init({ ...address, coordinates: berlin })

    sync.edit({ ...address, coordinates: berlin })
    await vi.advanceTimersByTimeAsync(100)
    expect(geocode).not.toHaveBeenCalled()

    sync.edit({ ...address, city: "Hamburg", coordinates: berlin })
    await vi.advanceTimersByTimeAsync(100)
    expect(last().coordinates).toEqual(hamburg)
  })

  it("keeps the coordinates when geocoding finds nothing or fails", async () => {
    const sync = setup({ geocode: async () => Promise.reject(new Error("offline")) })
    sync.edit({ ...address, coordinates: berlin })
    await vi.advanceTimersByTimeAsync(100)
    expect(last().coordinates).toEqual(berlin)
  })

  it("a map click sets the coordinates and fills the fields", async () => {
    const geocode = vi.fn(async () => berlin)
    const fields = { street_name: "Kartenweg", street_number: "2", zip_code: "20095", city: "Hamburg", country: "de" }
    const sync = setup({ geocode, reverseGeocode: async () => fields })

    await sync.pick(hamburg)

    expect(emitted[0]).toEqual({ coordinates: hamburg }) // marker moves right away
    expect(last()).toEqual({ ...fields, coordinates: hamburg })

    // The filled-in address is not geocoded again — the pin is more precise.
    sync.edit({ ...last() })
    await vi.advanceTimersByTimeAsync(100)
    expect(geocode).not.toHaveBeenCalled()
  })

  it("a map click cancels a pending geocode of the typed address", async () => {
    const geocode = vi.fn(async () => berlin)
    const sync = setup({ geocode })

    sync.edit({ ...address })
    await sync.pick(hamburg)
    await vi.advanceTimersByTimeAsync(100)

    expect(geocode).not.toHaveBeenCalled()
    expect(last().coordinates).toEqual(hamburg)
  })

  it("drops a geocode answer that arrives after a map click", async () => {
    let answer
    const sync = setup({ geocode: () => new Promise((resolve) => (answer = resolve)) })

    sync.edit({ ...address })
    await vi.advanceTimersByTimeAsync(100) // geocode request is running
    await sync.pick(hamburg)
    answer(berlin)
    await vi.advanceTimersByTimeAsync(0)

    expect(last().coordinates).toEqual(hamburg)
  })

  it("without a provider only passes the values through", async () => {
    const sync = setup(null)
    sync.edit({ ...address })
    await sync.pick(hamburg)
    expect(last()).toEqual({ ...address, coordinates: hamburg })
  })
})
