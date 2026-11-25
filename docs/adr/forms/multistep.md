---
covers: [src.forms.utils.loadStep, src.forms.utils.advanceStep, src.forms.utils.isRenderedStep, src.forms.utils.back, src.request.envelope.v1SelectionFollow]
status: accepted
---

## Seam

`<ViForm multistep module="..." action="..." />` runs a server-driven flow
(login chains, wizards). The server decides the sequence; the client only
follows:

- render: `loadStep(url?)` GETs the entry URL (from `module`/`action`) or a
  step URL and applies the envelope (`step`, `steps`, `status`,
  `step_status`, `follow`).
- next: `submitStep()` flushes nested forms, POSTs to `state.postUrl` (the
  envelope's `follow`) and hands the answer to `advanceStep(data)`:
  `status: "success"` -> `emit("success", data)`, `"rejected"` -> stay,
  otherwise advance (see below) and `emit("step-change", { step, steps })`.
- back: `back()` GETs `steps[previousKey].url` (or `.endpoint`).

`follow` is always the next address; the status decides what to do with it:

| answer | `follow` is | client |
|---|---|---|
| `init` (GET-rendered step) | this step's POST target | show the form, POST there |
| `rejected` | this step's POST target | show errors, POST there again |
| `continue` + `step_status: "success"` | the next step | GET it (intermediate step, the default) |
| `continue` + `step_status: "init"` + `structure` | the next step's POST target | the answer IS the next step: show it, no GET |
| `success` | optional target after the flow | `emit("success")` |

The server picks per answer whether it renders the next step itself
(`isRenderedStep`) or leaves it to the intermediate GET; both may be mixed in
one run. The intermediate step stays the default: every step keeps its own
GET (reload, new tab, `back`, post-redirect-get for the HTML renderer), and a
POST handler need not know the form of the next step. Rendering directly saves
one request per step; a server does it by calling the next step's render
function, so the GET of that step stays the single place that renders it.

UI hooks are slots, all optional: `steps` (progress bar; built-in one only
with `showSteps`), `actions` (`next`, `back`, `isFirstStep`, `isLastStep`,
`loading`, labels), `list` (a step whose `datatype` is `"list"`; no form is
rendered). Button texts: `nextLabel` / `submitLabel` / `backLabel`, default
i18n `form.next|submit|back`. `LoginScreen` is the reference consumer.

v1 servers send no `follow`: a step is posted back to the URL it was
rendered from, and for selection actions `v1SelectionFollow` takes the
chosen select value as target if it is one of the offered URLs.

## Rules

- Never build step URLs on the client or keep a client-side step history.
  Targets come from `follow` and `steps[...].url`; `back` re-renders from
  the server session.
- Advance with `submitStep` (or the slot's `next`/`submit`), not with your
  own `sendData` + `loadStep` chain; it would skip the nested flush, the
  `success` / `step-change` events and directly rendered steps. Where you must
  post yourself (a `list` step), pass the answer to `advanceStep`.
- Never decide the next step from `step` or the order of `steps`. Whether an
  answer is the next step is `continue` + `step_status: "init"` + a
  `structure`, nothing else.

## Traps

- `multistep` without both `module` and `action` silently falls back to the
  normal paths (`structure` or `fetchData`).
- The entry step is a GET (`loadStep`), the single-step form renders with a
  POST (`fetchData`).
- `isFirstStep` / `isLastStep` come from the key order of `steps`. Without a
  `steps` map the built-in bar never shows "Submit" and never shows "Back".
- `submitStep` swallows every error and resolves `undefined`. Errors show
  only through `state.errors` and the `failed` event.
- `submitStep` takes no arguments and a `list` step has no structure, so
  `next` posts an empty body. To send the picked item call
  `form.sendData(form.state.postUrl, { key })` yourself.
- A `continue` with `step_status: "init"` but without `structure` (a list
  step, or a server that forgot it) is not a rendered step: the client GETs
  `follow`.
- A directly rendered step is applied twice: once by `sendData` as the echo
  of the submit, once by `advanceStep` as a rendered step, so `values`
  prefills it.
- `back` is a silent no-op on the first step or when the previous step has
  no `url`/`endpoint`.
- `values` is applied to every rendered step (GET-rendered or directly
  rendered), so a key matching a bone of a later step prefills that step too.
- `postUrl` only changes when the envelope carries `follow`; on v1 it keeps
  the last URL.

## See also

- `docs/adr/forms/utils.md` - `sendData`, `applyResponseState`, errors.
- `docs/adr/request.md` - envelope normalization (v1 -> v2).
