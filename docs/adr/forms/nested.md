---
covers: [src.forms.bones.BoneNestedWrapper, src.forms.utils.logics]
status: accepted
---

## Seam

A form inside a form comes from a bone with `using` (record, relational
with `using`). `BoneNestedWrapper` renders a full `<vi-form>` with
`:internal="mainformState"`, `:skel="value"`, `:structure="bone.using"` and
emits the whole sub-skel as the bone value. An own widget that needs a
sub-form does the same; it is not a separate API.

What crosses the levels, via provide/inject:

- `formState` - the nearest form.
- `mainformState` - the outermost form only (provided when `internal` is
  not set). Nested forms take `readonly` and `boneactions` from it.
- `boneActionsConfig` - the outer `actions` prop, passed down unchanged.
- `bonePath` - DOM id path, extended by `lang-<code>` / `idx-<n>`.

In `visibleIf` / `readonlyIf` / `requiredIf` / `evaluate`, `_skel` is the
skel of the outermost form on every level.

## Rules

- Values go up only as the bone's `change` with the complete sub-skel. Do
  not write into `mainformState.skel` from a nested form.
- Submit only through the outermost form's exposed `sendData` (or
  `submitStep`). An app that saves `state.skel` itself calls the exposed
  `flush()` first to emit the outer form's pending `change`.

## Traps

- A nested form emits `change` at once; only the outermost form debounces
  it by 500 ms (emitting the last change of a burst). The outer `state.skel`
  is therefore always current, its `change` event is not.
- The nested form watches its `skel` prop deeply, but re-runs `initForm`
  only if the prop differs from its own `state.skel` (drag & drop, reset,
  new skel from outside). The echo of its own change is ignored; re-running
  on it used to reset rows to a stale value. `values` is not reapplied.
- `_skel` skips intermediate levels: a record inside a record cannot address
  its parent record, only the outermost form.
- Nested forms receive no `errors`. A server error for a sub-bone stays in
  the outer `state.errors`, and the outer `<bone>` shows only paths of
  length 1 (2 with `multiple` or `languages`, 3 with both), so errors on
  fields of a single record are not displayed anywhere.
- A readonly record bone still renders editable sub-bones: `recordBone`
  passes `disabled`, which `BoneNestedWrapper` does not declare. The edits
  are then dropped by the readonly outer `<bone>` and never sent.

## See also

- `docs/adr/forms/bones/widgets/recordBone.md` - wrapper details.
- `docs/adr/forms/utils.md` - `logics()`, `initForm`, `resetForm`.
