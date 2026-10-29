---
covers:
  [
    src.forms.bones.useBoneStore,
    src.forms.bones.addBoneWidget,
    src.forms.bones.getBoneWidget,
    src.forms.bones.addBoneActionbar,
    src.forms.bones.getBoneActionbar,
    src.forms.bones.addBoneEmptyState,
    src.forms.bones.getBoneEmptyState,
    src.forms.bones.BoneHasMultipleHandling,
  ]
status: accepted
---

## Seam

Own widget for a bone type: `addBoneWidget(type, component)` from
`src/forms/bones/index.js`. The key is either an exact ViUR type
(`"str.markdown"`) or a prefix ending in `.` (`"relational.tree."`). Own
entries are checked before the built-in `if`-chain, so they can also replace a
default widget.

Own button bar below a multiple bone: `addBoneActionbar(type, component)`,
same key rules. Per-value and per-bone buttons (delete, translate, ...) are not
the actionbar but `addAction` / `setDefaultActionsForType` in
`src/forms/bones/actions/index.js`.

Own empty state for a multiple bone: `addBoneEmptyState(type, component)`,
same key rules. `Bone.vue` puts it into the `empty` slot of
`BoneMultipleList`, which otherwise shows a readonly "no entries" input. The
component gets `name, lang, bone`; the actionbar is still rendered below it.
Without a registration nothing changes.

Widget contract, provided by `BoneSingleEntry` / `BoneMultipleList`: props
`name, value, index, lang, bone, autofocus`; emit
`change(name, value, lang, index, valid)`. Everything else (`params`,
`readonly`, `label`, `bonestructure`) comes from `inject("boneState")`.

Wrapper components (`<bone>`, `<bone-label>`, ...) are not resolved through
this store but registered globally by `installViurForms` in
`src/forms/install.js`.

## Rules

- Register before the first form renders, e.g. in the app's `main.js`. The
  store holds `additionalBones` as `shallowRef` inside `reactive`; a later
  `addBoneWidget` is not reactive and no rendered bone switches its widget.
- Built-in widgets emit `change` once on mount with the incoming value
  (init). It writes the widget's view of the value into `state.skel` and runs
  `logics()` (`visibleIf`, `evaluate`, ...). An own widget that normalises
  the value (e.g. `""` -> `null`) has to do the same, or the server value is
  sent unnormalised.
- Validation errors go out as `valid=false` in `change`, not as a throw. With
  `valid=false` `Bone.updateValue` does not store the value but still emits.
- Heavy widgets (editor, codemirror, phone lib) go in as
  `defineAsyncComponent`, as the built-in `jsonBone`, `phoneBone`, `codeBone`
  and `textBone` do. A static import lands in every consumer's bundle.
- A widget that renders the multiple list itself must be added to
  `state.multibones`; otherwise `Bone.vue` wraps it in `BoneMultipleList` and
  it gets one array entry per instance.
- To change only what an empty multiple bone shows, register an empty state
  instead of moving the widget to `multibones`; the list, drag and drop and
  per-entry actions stay with `BoneMultipleList`.

## Traps

- Prefix keys win by registration order, not by length. The
  `sort((a, b) => b.length - a.length)` in `getBoneWidget`,
  `getBoneActionbar` and `BoneHasMultipleHandling` compares the length of the
  `[key, widget]` pairs, which is always 2. With `"relational.tree."`
  registered before `"relational.tree.leaf.file."`, a file bone gets the
  first one.
- A prefix key without trailing dot also matches unrelated types:
  `"str.e"` catches `str.email` and `str.extra`. Always end prefix keys in `.`.
- An own key is only prefix-matched if it starts with the type family plus
  `.`. A key `"str"` (no dot) matches exactly `str`, never `str.email`.
- Actions use a different rule: `addAction` / `setDefaultActionsForType`
  match `type === prefix || type.startsWith(prefix + ".")`, so their keys are
  written without trailing dot. Same word, two syntaxes.
- `importWidgets` throws as soon as an own widget is registered
  (`bones.add` on a plain object). It has no callers; do not build on it.
- Because of the init emit, `ViForm` fires `change` (debounced 500 ms, last
  bone only) right after rendering, before any user input. A host that
  treats `change` as "dirty" is wrong from the start.
- Unknown types fall back to `rawBone`, silently. A typo in the key shows a
  raw text field, no warning.

## See also

- `docs/adr/forms/utils.md` - how `ViForm` collects and sends the values the
  widgets emit.
- `docs/adr/forms/bones/widgets/` - one document per built-in widget.
