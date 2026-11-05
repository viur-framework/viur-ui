/**
 * Map and geocoder for the address widget (`record.address`).
 *
 * viur-ui ships no map provider: the app plugs one in, so this package stays
 * free of a map dependency and of the provider's consent/cookie handling.
 * Without a provider the address widget renders like a plain record.
 *
 * @typedef {[number, number]} LatLng
 * @typedef {Object} AddressProvider
 * @property {import("vue").Component} [map] - Props `coordinates` (LatLng|null) and `readonly` (Boolean),
 *   emits `pick` (LatLng) when the user clicks the map. Handles its own consent.
 * @property {(address: Object) => Promise<LatLng|null>} [geocode] - Address fields -> coordinates.
 * @property {(coordinates: LatLng) => Promise<Object|null>} [reverseGeocode] - Coordinates -> address
 *   fields (`street_name`, `street_number`, `zip_code`, `city`, `region`, `country`). `region` only
 *   matters if the bone has one (optional field, see viur-core `AddressRelSkel`).
 */

let provider = null

/** @param {AddressProvider|null} value */
export function setAddressProvider(value) {
  provider = value
}

/** @returns {AddressProvider|null} */
export function getAddressProvider() {
  return provider
}

const QUERY_FIELDS = ["street_name", "street_number", "zip_code", "city", "region", "country"]

/**
 * Identity of the geocodable part of an address, `null` while street or city is missing.
 * Used to geocode only when that part actually changed.
 */
export function addressKey(value) {
  if (!value?.["street_name"] || !value?.["city"]) return null
  return QUERY_FIELDS.map((field) =>
    String(value[field] ?? "")
      .trim()
      .toLowerCase()
  ).join("|")
}

/** `true` for a usable `[lat, lng]`; ViUR's empty SpatialBone value is `[0, 0]`. */
export function hasCoordinates(value) {
  if (!Array.isArray(value) || value.length !== 2) return false
  const [lat, lng] = value.map((part) => (part === null || part === "" ? NaN : Number(part)))
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
}

/**
 * Keeps address fields and coordinates in sync through the provider.
 * - `edit(value)`: fields changed -> geocode after `delay` ms, only if the address changed
 * - `pick(coordinates)`: map click -> set coordinates, then fill the fields via reverse geocoding
 * Every new request makes older, still running ones obsolete.
 *
 * @param {AddressProvider|null} provider
 * @param {(value: Object) => void} emitValue - Receives every new address value.
 */
export function createAddressSync(provider, emitValue, { delay = 800 } = {}) {
  let value = {}
  // Address that the current coordinates belong to — geocode only when it changes.
  let geocodedKey = null
  let requestId = 0
  let timer = null

  function update(next) {
    value = next
    emitValue(next)
  }

  async function geocode() {
    const key = addressKey(value)
    if (!key || key === geocodedKey) return
    const id = ++requestId
    const coordinates = await provider.geocode({ ...value }).catch(() => null)
    if (id !== requestId) return
    geocodedKey = key
    if (hasCoordinates(coordinates)) update({ ...value, coordinates })
  }

  return {
    /** Stored coordinates stay until the address is edited; without any, the first edit geocodes. */
    init(initial) {
      value = initial ?? {}
      geocodedKey = hasCoordinates(value["coordinates"]) ? addressKey(value) : null
    },
    /** Value changed from outside (no geocoding). */
    set(next) {
      value = next ?? {}
    },
    edit(next) {
      update(next)
      if (!provider?.geocode || addressKey(next) === geocodedKey) return
      clearTimeout(timer)
      timer = setTimeout(geocode, delay)
    },
    async pick(coordinates) {
      if (!hasCoordinates(coordinates)) return
      clearTimeout(timer)
      const id = ++requestId
      // A pending geocode of the typed address must not move the pin again.
      geocodedKey = addressKey(value)
      update({ ...value, coordinates })
      if (!provider?.reverseGeocode) return
      const fields = await provider.reverseGeocode(coordinates).catch(() => null)
      if (id !== requestId || !fields) return
      const filled = { ...value, ...fields, coordinates }
      // The pin is more precise than geocoding the filled-in address would be.
      geocodedKey = addressKey(filled)
      update(filled)
    },
  }
}
