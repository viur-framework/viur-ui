---
covers:
  [
    src.forms.bones.actions.addAction,
    src.forms.bones.actions.setDefaultActionsForType,
    src.forms.bones.actions.setRequiredActionsForType,
    src.forms.bones.actions.resolveActions,
    src.forms.bones.actions.formConfiguredActions,
    src.forms.bones.BoneActions,
  ]
status: accepted
---

## Seam

Buttons next to a bone value (translate, delete, download, own ones). Not
exported from the package root; import from
`src/forms/bones/actions/index.js`.

`resolveActions` merges, in this order: form-wide `actions` prop of
`ViForm` (array = all bones, object = per bone name plus `"*"`), the
server's `bone.params.actions`, the type defaults
(`setDefaultActionsForType(prefix, names)`) and the required ones
(`setRequiredActionsForType`). Entries are a name, an inline definition, or
`"-name"` to remove one.

Own action: `addAction(name, { default, component, handler, disabled })`.
Definition fields: `type` (`"callback"` | `"assistant"`), `arg`, `name`,
`title` (i18n key or text), `icon`, `library`, `variant`,
`position: "end"`, `required`, `allowReadonly`, `when(ctx)`.

- `callback`: `handler(ctx)` with `name, value, index, lang, bone,
boneState, relationSelector, multipleRow` and the writers
  `update(val)`, `appendEntry(val)`, `removeEntry()`.
- `assistant`: `component` opens in a dialog with props
  `name, module, tabId, action, params` (`params` = `name, value, index,
lang, bone, boneState`) and answers `emit("close"|"next", value, lang)`.

Visibility: `ViForm` `boneactions=false` (default) shows only actions with
`required: true`; `true` shows all. A host can provide
`viurRelationSelector` (`(request) => Promise<Row[]|null>`); it reaches
`ctx.relationSelector`, so an own action gates on it with `when`.
`ctx.relationParams` holds the form's `relationParams` for this bone; a
selection dialog passes them on (e.g. `ViurBrowser` `params`), like the
relational suggestions do.

## Rules

- Register actions and type defaults in `main.js` before the first form
  mounts.
- Add buttons with `addAction`, not by editing `defaultActions` or
  `BoneActions.vue`.
- A callback writes through `ctx.update` / `appendEntry` / `removeEntry`.
  Mutating `boneState.bonevalue` does not reach the form.
- Remove scaffolding (`removeEntry`, `delete`, `download`) only on purpose
  with `"-name"`: without `removeEntry` a multiple entry cannot be removed.

## Traps

- `BoneActions` resolves its list once in `onMounted`. A later change of the
  `actions` prop or a late `addAction` does not reach mounted bones, although
  `Bone.vue`'s `hasActions` is computed and does update, so the wrapper and
  the buttons can disagree.
- Prefix keys here have no trailing dot (`"relational"` matches
  `relational` and `relational.*`); the widget registry needs one. See
  `forms/bones.md`.
- `required: true` on a definition is not the same as
  `requiredActionsByType`. `delete` and `download` are flagged required but
  come from the type defaults, so `setDefaultActionsForType("relational",
[...])` without `"delete"` drops it. Only `removeEntry` survives
  everything except `"-removeEntry"`.
- `setDefaultActionsForType` replaces the list of that exact prefix. All
  matching prefixes are still merged, so `""` (`debug`, `placeholder`) is on
  every bone. `placeholder` is a test action that only logs to the console.
- Readonly disables every action without `allowReadonly`; it stays visible.
- A dialog result is applied only when truthy: `""`, `0`, `false` cannot be
  set through `close`/`next`.
- An unknown name string is dropped silently.

## See also

- `docs/adr/forms/bones/bone.md` - `boneState`, `multipleRow`, scopes.
- `docs/adr/forms/bones.md` - actionbar vs. actions.
