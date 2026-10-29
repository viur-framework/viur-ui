---
covers: [src.forms.bones.Bone]
status: accepted
---

## Seam

`<bone>` sits between the form and the widget: label, language tabs,
multiple list, errors, actions. `ViForm` renders it; standalone it needs
`name`, `structure`, `skel` and `is` (from `getBoneWidget(type)`), and
reports `change-internal` with `{ name, value, lang, index, valid }`.

Value shape by structure: single value, array (`multiple`), object per
language (`languages`), object of arrays (both). Props `languages`,
`multiple`, `readonly`, `required`, `params`, `value` override the
structure.

Provided to widget, actionbar, empty state and actions:

- `boneState` - `bonestructure`, `bonevalue`, `readonly`, `required`,
  `multiple`, `languages`, `currentLanguage`, `params`, `boneactions`,
  `resolvedActions`.
- `updateValue(name, val, lang, index, valid)`, `addMultipleEntry(lang,
data)`, `removeMultipleEntry(index, lang)`, `removeMultipleEntries(lang)`,
  `formatString`.
- `bonePath` - build DOM ids with `buildBoneDomId(bonePath, suffix)`.

## Rules

- Widgets report through `emit("change", ...)`, actionbars through the
  injected writers. Never assign `boneState.bonevalue` directly; it does
  not reach the form.
- DOM ids come from `bonePath`, never from `name` alone: the same bone name
  repeats in multiple, multilingual and nested bones.
- Error texts are translated as `errors.<message>`, then `<message>`. Add
  missing texts to the translations, not to the bone.

## Traps

- `change` and `handleClick` are declared but never emitted. Listen to
  `change-internal`.
- The boolean overrides can only switch on: `readonly=false` does not
  override `readonly: true` from the structure.
- `value` is read once before mount and only when truthy; `0`, `""` and
  `false` fall back to `skel[name]`.
- `bonevalue` follows `skel[name]` only when its identity changes. An
  in-place mutation from outside is not shown.
- `valid=false`: not stored, still emitted. Readonly: stored locally, not
  emitted. The shown value can drift from the form's skel.
- Errors are shown when `fieldPath[0]` is the name and the path length fits
  (1; 2 with `multiple` or `languages`; 3 with both). Severity above 2 is
  always shown, 0 and 2 only on required bones.
- Object entries of a multiple get a `_key` UUID for drag and drop. It sits
  in the skel; a multiple `raw.json` bone sends it along via
  `JSON.stringify`.
- `addMultipleEntry` emits nothing. The form learns about the new row from
  the init `change` of the widget that renders it.
- If `defaultLanguage` is not among the bone's languages, the first one is
  active.
- The empty state from `getBoneEmptyState(type)` fills the `empty` slot of
  `BoneMultipleList`. It only shows for multiple bones that are not in
  `multibones`, and also in readonly mode, where the actionbar is hidden.

## See also

- `docs/adr/forms/bones.md` - registry and widget contract.
- `docs/adr/forms/bones/actions.md` - the buttons.
