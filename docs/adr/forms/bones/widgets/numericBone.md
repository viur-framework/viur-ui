---
covers: [src.forms.bones.widgets.numericBone]
status: accepted
---

## Seam

Routes from `numeric` and `numeric.*` (except `numeric.duration`, see
`numericBoneDuration.md`). Driven by the server bone:
`minAmount` / `maxAmount` -> `min` / `max`, `precision` -> `step`
(`precision: 2` -> `0.01`; no precision -> no step, i.e. integers only in
the native check). Native validity goes out as `valid`.

## Traps

- The init emit sends `"" + props.value`. An empty bone (`null`) writes the
  string `"null"` into `state.skel`, which `toFormData` sends as is. Every
  emitted value is a string, never a number.
- Server-side errors are not highlighted: the template sets
  `data-data-invalid` instead of `data-user-invalid`.
- The min/max hints are hidden for the int64 sentinels the server sends as
  "no limit", and also for a real limit of `0` (`&& state.minAmount`).

## See also

- `docs/adr/forms/bones.md` - registry and widget contract.
