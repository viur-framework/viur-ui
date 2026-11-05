---
covers:
  [
    src.components.DurationInput.DurationInput,
    src.components.DurationInput.duration.parseDuration,
    src.components.DurationInput.duration.formatDuration,
    src.components.DurationInput.duration.splitDuration,
  ]
status: accepted
---

## Seam

A duration stored as whole minutes (a viur-core `NumericBone`): `DurationInput`
with `v-model` (minutes or `null`). It accepts shorthand (`1d 2h 30m`, `2,5h`,
`90m`, `1:30` as h:mm, a bare number as minutes), previews the normalised
value in the `wa-input` hint while typing and normalises the text when the
field is left. `presets` (minutes) adds quick-pick buttons. Inside a `ViForm`
use the bone type `numeric.duration` instead
(`docs/adr/forms/bones/widgets/numericBoneDuration.md`).

Without a component: `parseDuration(text, options)` and
`formatDuration(minutes, options, label)` from
`src/components/DurationInput/duration.ts`, e.g. for table cells.

Unit names come from the translations: `duration.units` (display),
`duration.long` (spoken names of the quick picks, plural forms) and
`duration.aliases` (comma separated names the parser accepts in addition to
the English ones in `ENGLISH_ALIASES`).

## Rules

- `hoursPerDay` / `daysPerWeek` default to the calendar (24 / 7). Effort and
  time tracking usually wants a working day: set `8` / `5`. The same options
  must be used wherever the value is formatted, or `1 d` means two things.
- Both must be at least 1 and give a whole number of minutes per day and per
  week (`7.5` hours is fine, `0.02` is not), and `largestUnit` must be one of
  the four units. Every helper (`checkDurationOptions`, `unitMinutes`,
  `parseDuration`, `splitDuration`, `formatDuration`) checks this first and
  throws a `RangeError` otherwise, whatever the input (also for `""`, a bare
  number or `null`). This keeps splitting into units lossless: every
  formatted value parses back to the same minutes.
- The component does not throw for that: unusable options or limits (`min`
  above `max`, no whole minute between them, a `min` beyond the safe range, a
  negative `max`) disable the field and its quick picks, show
  `duration.misconfigured` in the hint and log the reason with
  `console.error`. A `max` beyond the safe range is no limit.
- Only whole, non-negative, safe numbers are durations (`isDurationValue`).
  `splitDuration` / `formatDuration` throw for anything else instead of
  printing a wrong duration (`-1` used to become `6 d 23 h 59 min`). The
  component shows such a model value as it is (`-1`, `1.5`, `NaN`) with
  `duration.invalidValue` at once and never rounds it; only typed text is
  rounded. Quick picks that are no duration are left out.
- Validity is one computed state: the message (setup error, model value that
  is no duration, required, unparseable text, limits) and the value of the
  text. One watcher reports every change of it, including the state at
  mount: `invalid(message)` when the message is new,
  `update:modelValue` when the state is usable and the value differs from the
  model or was unusable before. A usable state at mount is not reported (the
  model already holds it). So a change of `min`/`max`/`required`, of the
  model while the field is not being edited, of the options or of the locale
  reports by itself; there is no per-event reporting that could go stale. A
  change of the model alone is never sent back: it may be the host's answer.
- Unusable text leaves the value as it was; the message shows in the hint once
  the field is left (`change` or `blur`) and is set as custom validity on the
  `wa-input`. A fractional `min`/`max` allows the whole minutes inside it
  (`max: 60.5` allows 60, not 61); a non-finite one is no limit.
- Draft against model update: while the user edits (typed, field not yet
  left), a new `modelValue` neither replaces the text nor is answered; it may
  be the host's answer to the input (rounded, refused, changed elsewhere).
  Each usable value is sent once. Leaving the field shows the model value the
  host kept (`31` to a host that rounds to quarter hours shows `30 min`; a
  host that refuses shows the old value). An unusable text stays with its
  error. A change of the options or of the locale shows the model value anew
  and drops a draft (the same text would now mean something else).
- Attributes that are not props (`label`, `placeholder`, `name`, `size`,
  listeners such as `@keydown`) go to the inner `wa-input`.

## Traps

- `webawesomeCompat.css` hides the label of every `wa-input` with
  `display: none`, and Chromium then gives the field no accessible name at
  all. Next to an own visible label pass `label` plus
  `class="wa-visually-hidden-label"`: `DurationInput` turns the label back on
  for that class and Web Awesome's utility hides it visually only.
- Web Awesome sets no `aria-invalid` on the inner input. The error reaches
  assistive technology as the description (hint, `aria-describedby`), not as
  an invalid state.
- `wa-button` does not pass `aria-label` on to its inner button. The quick
  picks therefore carry their spoken name ("15 minutes") as
  `.wa-visually-hidden` text, which needs the Web Awesome utility styles
  (`webawesome.css`, loaded by `webawesomeConfig.js`).
- The result is rounded to whole minutes: `1,5` gives `2`, `0,01h` gives `1`.
- The tests run in happy-dom without Web Awesome (it needs `ElementInternals`,
  which happy-dom lacks). Accessible name, hint as description, native
  validity, disabled quick picks and the configuration error of the real
  elements were checked by hand in Chromium (Histoire, accessibility tree via
  CDP), not automatically. Browser tests (e.g. Vitest browser mode) would
  close that gap.
- Units above `largestUnit` are rejected, not converted (`1d` in an hours-only
  field is ambiguous).
- No `Intl.DurationFormat`: its output (`1 Tg., 2 Std. und 30 Min.`) cannot be
  typed back, and its days are calendar days.

## See also

- `docs/adr/forms/bones/widgets/numericBoneDuration.md`
