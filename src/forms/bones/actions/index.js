import { defineAsyncComponent, unref } from "vue"
import Translation from "./Translation.vue"
import Debug from "./Debug.vue"

// Lazy: DescribeImage is only loaded when the dialog is actually opened
// (like the heavy bones).
const DescribeImage = defineAsyncComponent(() => import("./DescribeImage.vue"))
import { handler as downloadHandler } from "./Download.vue"
import { handler as placeholderHandler } from "./Placeholder.vue"
import { handler as deleteHandler } from "./Delete.vue"

/**
 * Default definitions: same inline format as formerly in BoneActions.
 * Strings in `bone.params.actions` are looked up here.
 * Custom objects from `bone.params.actions` are passed through in the same form.
 */
const defaultActions = {
  translate: {
    type: "assistant",
    arg: "translate",
    name: "actions.translate.name",
    icon: "language",
    library: "default",
    title: "actions.translate.name",
  },
  describe_image: {
    type: "assistant",
    arg: "describe_image",
    name: "actions.describeImage.name",
    icon: "file-lines",
    library: "default",
    title: "actions.describeImage.title",
  },
  download: {
    type: "callback",
    arg: "download",
    name: "bone.download",
    icon: "download",
    library: "default",
    title: "bone.download",
    // Scaffolding like the row X: present even without `boneactions` (formerly a button in the
    // file widget) — and read-only, so also on readonly bones.
    required: true,
    allowReadonly: true,
  },
  debug: {
    type: "assistant",
    arg: "debug",
    name: "actions.debug.name",
    icon: "bug",
    library: "default",
    title: "actions.debug.title",
  },
  placeholder: {
    type: "callback",
    arg: "placeholder",
    name: "actions.placeholder.name",
    icon: "wrench",
    library: "default",
    title: "actions.placeholder.title",
  },
  delete: {
    type: "callback",
    arg: "delete",
    name: "actions.delete.name",
    icon: "xmark",
    library: "default",
    title: "bone.del",
    position: "end",
    variant: "danger",
    // Scaffolding: without it you can't get rid of a set relation/file
    // (formerly a button in the widget) — hence present even without `boneactions`.
    required: true,
    // Only visible on relational single bones (not multiple).
    when: (ctx) => prefixMatches("relational", ctx?.bone?.type) && !ctx?.bone?.multiple,
  },
  removeEntry: {
    type: "callback",
    arg: "removeEntry",
    name: "bone.del",
    icon: "xmark",
    library: "default",
    title: "bone.del",
    position: "end",
    variant: "danger",
    // REQUIRED action (scaffolding): removes THIS row of a multiple bone —
    // without it you could never get rid of an entry. Only visible in row contexts
    // (BoneActions with index).
    required: true,
    when: (ctx) => ctx?.multipleRow === true,
  },
}

/** Dialog content for `type: "assistant"` actions, mapped by `arg`. */
const componentRegistry = {
  translate: Translation,
  describe_image: DescribeImage,
  debug: Debug,
}

/** Directly invoked handlers for `type: "callback"` actions, mapped by `arg`. */
const handlerRegistry = {
  download: downloadHandler,
  placeholder: placeholderHandler,
  delete: deleteHandler,
  removeEntry: (ctx) => ctx.removeEntry?.(),
}

/** No value to act on: empty, or an object/array without content (only
 *  null/undefined/empty lists — like `isObjectEmpty` in the bone). */
function isEmptyValue(value) {
  if (!value) return true
  if (typeof value !== "object") return false
  return Object.values(value).every((entry) => entry == null || (Array.isArray(entry) && entry.length === 0))
}

/** Disabled check by `arg`. Receives the action context (name, value, index, lang, bone, boneState). */
const disabledRegistry = {
  translate: (ctx) => !ctx.bone?.languages,
  describe_image: (ctx) => !ctx.value?.dest?.key,
  download: (ctx) => !ctx.value?.dest?.downloadUrl,
  // on its OWN value — when multilingual that of one language, not of the bone
  delete: (ctx) => isEmptyValue(ctx.value),
}

/**
 * Default actions per bone type prefix. When resolving, ALL matching
 * prefixes are merged (shortest first, deduplicated).
 *
 * Matching rule: a prefix matches if `boneType === prefix` (exact) OR
 * `boneType.startsWith(prefix + ".")` (subtype). The empty prefix `""` matches everything.
 *
 * Definitions with `required: true` (delete, download) appear even without
 * `boneactions`; a host can still deselect them here (as with `"-name"`).
 */
const defaultActionsByType = {
  "": ["debug", "placeholder"],
  relational: ["delete"],
  "relational.tree.leaf.file": ["download"],
}

/**
 * REQUIRED actions per bone type prefix (scaffolding functions). Unlike the
 * defaults, they survive both a `bone.params.actions` list from the server
 * and the host's `setDefaultActionsForType` — only their own
 * `when` predicate (functional availability) hides them. They are
 * also rendered WITHOUT `boneactions` (BoneActions filters for them).
 */
const requiredActionsByType = {
  "": ["removeEntry"],
}

function prefixMatches(prefix, boneType) {
  if (prefix === "") return true
  if (!boneType) return false
  return boneType === prefix || boneType.startsWith(prefix + ".")
}

/**
 * Extends the registry. Every field is optional.
 * @param {string} name
 * @param {{ default?: object, component?: object, handler?: Function, disabled?: Function }} opts
 */
export function addAction(name, opts) {
  if (opts.default) defaultActions[name] = opts.default
  if (opts.component) componentRegistry[name] = opts.component
  if (opts.handler) handlerRegistry[name] = opts.handler
  if (opts.disabled) disabledRegistry[name] = opts.disabled
}

/** Sets the default actions for a bone type prefix. */
export function setDefaultActionsForType(typePrefix, actionNames) {
  defaultActionsByType[typePrefix] = actionNames
}

/** Sets the REQUIRED actions for a bone type prefix (host curation). */
export function setRequiredActionsForType(typePrefix, actionNames) {
  requiredActionsByType[typePrefix] = actionNames
}

/**
 * Resolve the form-wide action configuration (ViForm `actions` prop, via
 * provide("boneActionsConfig") — possibly a ref) for ONE bone:
 * an array applies to all bones, an object per bone name with `"*"` for all.
 * The entries have the same form as `bone.params.actions` (incl. `"-name"`).
 */
export function formConfiguredActions(config, boneName) {
  const value = unref(config)
  if (!value) return []
  if (Array.isArray(value)) return [...value]
  return [...(value["*"] ?? []), ...(value[boneName] ?? [])]
}

export function getActionComponent(arg) {
  return componentRegistry[arg]
}

export function getActionHandler(arg) {
  return handlerRegistry[arg]
}

export function isActionDisabled(action, ctx) {
  // In readonly mode all actions are disabled in principle — except for
  // purely read-only ones (`allowReadonly`, e.g. download).
  if (ctx?.boneState?.readonly && !action?.allowReadonly) return true
  const fn = disabledRegistry[action?.arg]
  return fn ? !!fn(ctx) : false
}

/**
 * Collects all action names of a prefix map for a bone type across
 * matching prefixes (shortest first, deduplicated).
 *
 * @param {Record<string, string[]>} map
 * @param {string} boneType
 * @returns {string[]}
 */
function collectFromMap(map, boneType) {
  const matched = Object.keys(map)
    .filter((p) => prefixMatches(p, boneType))
    .sort((a, b) => a.length - b.length)
  const names = []
  for (const p of matched) {
    for (const n of map[p]) {
      if (!names.includes(n)) names.push(n)
    }
  }
  return names
}

/** Returns the `arg` identifier of an entry (string or inline definition). */
function entryArg(entry) {
  return typeof entry === "string" ? entry : entry?.arg
}

/**
 * Resolves the action list for a bone.
 * - Type defaults from `defaultActionsByType` are **always** applied
 *   (matching prefixes combined, shortest first).
 * - REQUIRED actions from `requiredActionsByType` are ALWAYS added on top.
 * - `configured` (typically `bone.params.actions`) is prepended and the
 *   defaults are merged in deduplicated. This way e.g. the `delete`
 *   action always stays available for relational bones, even if the backend sends a
 *   `params.actions` list.
 * - EXPLICIT DESELECTION: a string entry `"-name"` in `configured` removes
 *   the action `name` — even a default or required action (the deliberate
 *   deselection on the bone overrides the requirement; only it does).
 * - Strings are resolved via default lookup, inline objects are passed through.
 * - Actions with `when(ctx)` are filtered out if the predicate returns falsy.
 *
 * Every returned action is a shallow copy so that `_opened` mutations
 * don't change the source. Sorted: actions with `position: "end"` go last.
 *
 * @param {object} bone - complete bone definition (with type, multiple, params)
 * @param {Array<string|object>|undefined} configured
 * @param {object} [boneState] - reactive bone state (for when/disabled predicates)
 * @param {object} [extras] - additional context for `when` (e.g. injected hosts like `relationSelector`)
 * @returns {object[]}
 */
export function resolveActions(bone, configured, boneState, extras = {}) {
  const defaults = collectFromMap(defaultActionsByType, bone?.type)
  const required = collectFromMap(requiredActionsByType, bone?.type)
  const entries = Array.isArray(configured) ? [...configured] : []
  // Explicit deselection: collect "-name" entries and remove them from the list.
  const disabled = new Set(entries.filter((e) => typeof e === "string" && e.startsWith("-")).map((e) => e.slice(1)))
  const names = entries.filter((e) => !(typeof e === "string" && e.startsWith("-")))
  for (const d of [...defaults, ...required]) {
    if (!names.some((e) => entryArg(e) === d)) names.push(d)
  }
  const ctx = { bone, boneState, ...extras }
  return names
    .filter((entry) => !disabled.has(entryArg(entry)))
    .map((entry) => (typeof entry === "string" ? defaultActions[entry] : entry))
    .filter(Boolean)
    .map((a) => ({ ...a }))
    .filter((a) => (typeof a.when === "function" ? !!a.when(ctx) : true))
    .sort((a, b) => (a.position === "end" ? 1 : 0) - (b.position === "end" ? 1 : 0))
}
