---
covers:
  [
    src.forms.bones.address.setAddressProvider,
    src.forms.bones.address.getAddressProvider,
    src.forms.bones.address.createAddressSync,
    src.forms.bones.address.hasCoordinates,
    src.forms.bones.widgets.addressBone,
  ]
status: accepted
---

## Seam

The address widget handles bones of type `record.address` (viur-core
`AddressBone`). viur-ui ships no map: the app plugs one in with
`setAddressProvider({ map, geocode, reverseGeocode })`, exported from the
package root. Every member is optional:

- `map` - component with props `coordinates` (`[lat, lng]` or `null`) and
  `readonly`, emits `pick` with `[lat, lng]`.
- `geocode(address)` - address fields -> `[lat, lng]` or `null`.
- `reverseGeocode([lat, lng])` - -> address fields (`street_name`,
  `street_number`, `zip_code`, `city`, `region`, `country`) or `null`.

Without a provider the widget renders exactly like the record widget.

## Rules

- The provider handles consent and cookies of its map service itself. viur-ui
  stays free of any map dependency and consent logic - do not add one here.
- Geocoding runs only through the provider. Do not call a geocoding service
  from the widget or from `createAddressSync`.

## Traps

- The widget reads the provider once in `setup`. Call `setAddressProvider`
  before the first form renders; a provider set later does not reach widgets
  that are already mounted.
- ViUR's empty `SpatialBone` value is `[0, 0]`. `hasCoordinates` treats it as
  "no coordinates", so a real point at exactly 0/0 is not representable.
- Geocoding is debounced (800 ms) and starts only once `street_name` and `city`
  are filled. It reruns only when the geocodable part of the address
  (`addressKey`, including `region`) changed - stored coordinates survive
  until the address is edited.
- A map click wins over typing: `pick` cancels a pending geocode, and a newer
  request discards the result of every older one.
- Rejected `geocode`/`reverseGeocode` promises are swallowed (treated as
  `null`). The provider has to report its own errors.

## See also

- `docs/adr/forms/bones.md`
- `docs/adr/forms/nested.md` - the fields are a nested record form.
