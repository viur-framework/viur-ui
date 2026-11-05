---
covers: [src.forms.ViForm, src.forms.utils.useFormUtils, src.forms.install.installViurForms]
status: accepted
---

## Seam

A host uses `ViForm` (registered by `installViurForms(app)`), not
`useFormUtils` directly. Two ways in:

- server-driven: `module` + `action` (+ `skelkey`, `group`, `skeltype`,
  `renderer`). The URL is built from these and hits the native ViUR route.
- local: `structure` + `skel`, no request on render.

Hooks on the instance (`defineExpose`): `sendData`, `fetchData`, `loadStep`,
`submitStep`, `back`, `reload`, `resetForm`, `updateSkel`, `state`. Extra
POST fields (contexts) go in as `additionalData` of `sendData`; server
defaults are overridden with the `values` prop. Rendering of single bones is
`docs/adr/forms/bones.md`.

## Rules

- CRUD goes through `module`/`action`, never through `sendData(alternativUrl)`
  to a custom endpoint that paraphrases add/edit. `alternativUrl` is for real
  domain actions.
- Show server errors from `state.errors` (per bone via `fieldPath`), not
  from the rejection. On an error response `sendData` applies the body first
  and rejects afterwards, so a host `catch` that resets the form wipes the
  errors it just got.
- Field-level dependencies belong in the bone `params` (`visibleIf`,
  `readonlyIf`, `requiredIf`, `evaluate`), evaluated by `logics()` on every
  change. Do not watch `state.skel` in the host to toggle bones.

## Traps

- The `bones` prop only filters what is displayed. `toFormData` still sends
  every non-readonly bone of the structure, including the hidden ones.
- Readonly bones are not sent (except `key`) unless `sendReadOnly` is set. A
  bone made readonly by `readonlyIf` disappears from the request too.
- `fetchData` renders the form with POST, not GET. ViUR answers a POST
  without skey with the form, so a custom action must accept POST to render.
- `sendData` drops the `key` field from the body by default
  (`removeKeyFromDataset`); the key travels in the URL.
- `null`/`undefined` are sent as `""`, an empty multiple as one empty field.
  That is how ViUR clears a bone; do not filter them out.
- An invalid form rejects with the string `"Form is not valid"`, not an
  `Error`, and sends nothing.
- Client validity (`state.isValid`) comes from the `valid` of each `change`.
  `updateSkel` keeps it per entry (`lang`, `index`), and `state.valids[name]`
  is false while any entry of the bone is invalid. An update without `index`
  (whole language list, e.g. after removing or reordering) or without `lang`
  and `index` (whole bone) replaces the entries below it; the widgets report
  again as they remount or change. A widget that reports a wrong `index` or
  `lang` therefore keeps or drops the wrong entry.
- `evaluate` writes `result.toString()` into the skel, so a computed numeric
  bone holds a string.
- `visibleIf` and `requiredIf` swallow expression errors, `readonlyIf` and
  `evaluate` throw out of `updateSkel` and skip the remaining bones.
- `initForm` deep-copies the structure per form (`logics()` mutates bone
  flags). Changing the `structure` prop later reruns `logics()` but does not
  copy the new structure in.
- `values` prefills a freshly rendered form and is not reapplied to the
  response of a submit.
- Categories are sorted by their normalised key, not by structure order;
  `system` and `internal` start collapsed.
- A v1 multi-step step without `follow` is posted back to the URL it was
  rendered from.

## See also

- `docs/adr/forms/bones.md` - widget registry and widget contract.
- `docs/adr/request.md` - `createControllerFetch` and the envelope.
