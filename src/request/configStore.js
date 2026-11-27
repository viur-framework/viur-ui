import { defineStore } from "pinia"
import { reactive, computed, markRaw } from "vue"

// --------------------------------------------------------------------------- //
// Config store — `/vi/config`                                                 //
// --------------------------------------------------------------------------- //
//
// ViUR core (>= 3.9) exposes `/vi/config`, which serves two audiences with one
// endpoint:
//
//   • ANONYMOUS: the public `configuration` map — the `conf.admin.*` settings
//     (dotted keys, e.g. "admin.name"), the Google OAuth client id under
//     "admin.user.google.clientID" (only when configured), "admin.user.registration"
//     (viur-core 4, only when the self-registration is enabled),
//     "admin.user.second_factor_setup" (viur-core 4, only when users may add
//     second factors themselves), the current
//     "admin.language" and the available "admin.languages". The login screen
//     needs this BEFORE it renders, e.g. to decide whether Google sign-in is
//     offered at all.
//
//   • ADMIN / ROOT: the same `configuration` PLUS `version` (core version as a
//     4-tuple) and `modules` — the admin info of every routable module, keyed
//     by its vi path ("user", "file", "shop.order", …). This is everything the
//     admin needs to build its navigation and module views. The server only
//     adds these when the session user carries the "admin" or "root" right, so
//     after a login the call is only worth repeating for such a user — see
//     `fetchConfig({ user })`.

// --------------------------------------------------------------------------- //
// Module tree — navigation tree + lookup (part of the config store)          //
// --------------------------------------------------------------------------- //
//
// Input (both held by the store):
//   • `modules`: `{ [modulePath]: adminInfo }` — every routable module keyed by
//     its dotted vi path ("user", "shop.order"). adminInfo carries `name`,
//     `handler`, `icon`, `display`, `sortIndex`, `moduleGroup`, `views`, … (see
//     viur-core `Module.adminInfo`).
//   • `groups`: `configuration["admin.module.groups"]` (this is how viur-core renders
//     `conf.admin.module_groups`) —
//     `{ [groupKey]: { name, icon, sortIndex, moduleGroup? } }`. A group may
//     itself name a parent group via `moduleGroup` (nested groups).
//
// Requirements (derived from the old admin's db.js, not copied):
//   1. Modules are placed below the group named in their `moduleGroup`; when
//      that group does not exist they stay at top level.
//   2. Groups nest via their own `moduleGroup`; a group without any visible
//      child is hidden.
//   3. `views` of a module become child nodes that INHERIT the module's info
//      (`{ ...module, ...view }`, `context` merged) and are addressed by their
//      index. Views may nest again.
//   4. Access: "root" sees everything; otherwise a module is accessible with
//      `<module>-add|edit|delete` (plus `-view` when `showWithViewAccess`), a
//      grouped view with `<module>-<group>-…`. The flags are checked for the
//      full path ("shop.order") and the base module name ("order").
//   5. Ordering: explicit numeric `sortIndex` first (ascending), then the rest
//      alphabetically by name. Groups and modules are sorted together.
//   6. `display`: "visible" (default) | "hidden" (registered but not shown; a
//      relational bone may still use it) | "group" (shown, not clickable, only
//      expands its views).
//   7. Two consumers: the NAVIGATION needs the tree (`buildModuleTree`), the
//      rest of the app needs to LOOK UP a module/view by name
//      (`flattenModuleTree` + `findModule`), e.g. from a route.
//
// The input objects are never mutated; every node is a fresh object.

const MUTATING_RIGHTS = ["add", "edit", "delete"]
const VIEW_RIGHTS = [...MUTATING_RIGHTS, "view"]

// one collator for all name comparisons (much cheaper than localeCompare with
// options per call)
const collator = new Intl.Collator(undefined, { sensitivity: "base" })

/** Access flags as a Set for O(1) checks; accepts an array or a Set. */
function accessSet(access) {
  if (access instanceof Set) return access
  return new Set(Array.isArray(access) ? access : [])
}

/** Dotted module path — accepts the "/" form the old admin used in routes. */
export function normalizeModulePath(path) {
  return typeof path === "string" ? path.replaceAll("/", ".") : path
}

/** Last segment of a dotted module path: "shop.order" → "order". */
export function baseModuleName(path) {
  return normalizeModulePath(path).split(".").at(-1)
}

/**
 * Coarse handler family for picking a UI component:
 * "list" | "tree" | "hierarchy" (tree.node) | "singleton" | null
 */
export function handlerType(handler) {
  if (typeof handler !== "string" || !handler) return null
  if (handler === "tree.node" || handler.startsWith("tree.node.")) return "hierarchy"
  for (const type of ["list", "tree", "singleton"]) {
    if (handler === type || handler.startsWith(`${type}.`)) return type
  }
  return null
}

/**
 * Whether an access list grants a module (or one of its grouped views).
 * @param {string[]|Set<string>} access user access flags
 * @param {string} module dotted module path
 * @param {{ group?: string|null, showWithViewAccess?: boolean }} [options]
 */
export function hasModuleAccess(access, module, { group = null, showWithViewAccess = false } = {}) {
  const flags = accessSet(access)
  if (flags.has("root")) return true
  const rights = showWithViewAccess ? VIEW_RIGHTS : MUTATING_RIGHTS
  const path = normalizeModulePath(module)
  const base = baseModuleName(path)
  const names = base === path ? [path] : [path, base]
  for (const name of names) {
    const prefix = group ? `${name}-${group}` : name
    for (const right of rights) {
      if (flags.has(`${prefix}-${right}`)) return true
    }
  }
  return false
}

function sortNodes(nodes) {
  const indexed = (n) => typeof n.sortIndex === "number" && Number.isFinite(n.sortIndex) && n.sortIndex !== 0
  return nodes.sort((a, b) => {
    const ai = indexed(a)
    const bi = indexed(b)
    if (ai && bi && a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex
    if (ai !== bi) return ai ? -1 : 1
    return collator.compare(String(a.name ?? ""), String(b.name ?? ""))
  })
}

function mergeViewInfo(parentInfo, viewInfo) {
  // a view inherits the module's info, but not its own children, position or
  // display mode
  const { views: _views, display: _display, sortIndex: _sortIndex, ...inherited } = parentInfo
  const merged = { ...inherited, ...viewInfo }
  if (parentInfo.context || viewInfo.context) {
    merged.context = { ...(parentInfo.context ?? {}), ...(viewInfo.context ?? {}) }
  }
  return merged
}

function finalizeVisibility(node) {
  for (const child of node.children) finalizeVisibility(child)
  if (node.display === "hidden") {
    node.visible = false
    return
  }
  const childVisible = node.children.some((c) => c.visible)
  if (node.type === "group") {
    node.visible = childVisible
  } else {
    node.visible = node.hasAccess || childVisible
  }
}

/**
 * Build the navigation tree.
 *
 * @param {{ modules?: object, groups?: object, access?: string[] }} input
 * @returns {ModuleNode[]} sorted top-level nodes
 */
export function buildModuleTree({ modules = {}, groups = {}, access = [] } = {}) {
  const flags = accessSet(access)
  const isRoot = flags.has("root")
  const groupNodes = {}
  for (const [key, info] of Object.entries(groups ?? {})) {
    groupNodes[key] = {
      type: "group",
      key: `group:${key}`,
      groupKey: key,
      module: null,
      baseModule: null,
      name: info?.name ?? key,
      icon: info?.icon ?? null,
      handler: null,
      handlerType: null,
      display: info?.display ?? "visible",
      sortIndex: info?.sortIndex,
      hasAccess: false,
      visible: true,
      parent: null,
      info: info ?? {},
      children: [],
    }
  }

  const roots = []

  // groups: nest below their parent group, else top level
  for (const node of Object.values(groupNodes)) {
    const parentKey = node.info.moduleGroup
    const parent = parentKey && parentKey !== node.groupKey ? groupNodes[parentKey] : null
    if (parent) {
      node.parent = parent.key
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function makeViews(parentNode, views, depth) {
    const out = []
    views.forEach((viewInfo, index) => {
      const info = mergeViewInfo(parentNode.info, viewInfo ?? {})
      const node = makeModuleNode(parentNode.module, info, {
        type: "view",
        key: `${parentNode.key}#${index}`,
        view: index,
        parent: parentNode.key,
      })
      if (Array.isArray(info.views) && info.views.length && depth < 10) {
        node.children = makeViews(node, info.views, depth + 1)
      }
      out.push(node)
    })
    return out // sorted once for the whole tree by sortAll()
  }

  function makeModuleNode(module, info, extra) {
    const showWithViewAccess = !!info.showWithViewAccess
    const group = info.group ?? null
    const baseModule = baseModuleName(module)
    const node = {
      type: "module",
      key: module,
      groupKey: null,
      module,
      baseModule,
      name: info.name ?? baseModule,
      icon: info.icon ?? null,
      handler: info.handler ?? null,
      handlerType: handlerType(info.handler),
      group,
      display: info.display ?? "visible",
      sortIndex: info.sortIndex,
      hasAccess: false,
      visible: true,
      view: null,
      parent: null,
      info,
      children: [],
      ...extra,
    }
    // a "group" display never gets its own access — it only expands its views
    node.hasAccess =
      node.display !== "group" &&
      !!node.handler &&
      (isRoot || hasModuleAccess(flags, module, { group, showWithViewAccess }))
    return node
  }

  for (const [path, rawInfo] of Object.entries(modules ?? {})) {
    const module = normalizeModulePath(path)
    const info = rawInfo ?? {}
    const node = makeModuleNode(module, info, {})
    if (Array.isArray(info.views) && info.views.length) {
      node.children = makeViews(node, info.views, 0)
    }
    const parent = info.moduleGroup ? groupNodes[info.moduleGroup] : null
    if (parent) {
      node.parent = parent.key
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortAll = (nodes) => {
    sortNodes(nodes)
    for (const n of nodes) sortAll(n.children)
    return nodes
  }
  sortAll(roots)
  for (const node of roots) finalizeVisibility(node)
  return roots
}

/**
 * Flatten a tree into a lookup `{ [key]: node }`. Keys are the dotted module
 * path for modules ("shop.order"), `<module>#<index>` for views
 * ("shop.order#1", nested "shop.order#1#0") and `group:<key>` for groups.
 */
export function flattenModuleTree(tree) {
  const out = {}
  const walk = (nodes) => {
    for (const node of nodes) {
      out[node.key] = node
      if (node.children.length) walk(node.children)
    }
  }
  walk(tree ?? [])
  return out
}

/**
 * Look up a module or one of its views.
 *
 * @param {object} lookup result of `flattenModuleTree`
 * @param {string} module dotted (or slashed) module path
 * @param {number|string|null} [view] view index, or a string matching the
 *   view's `group` or `name`
 * @returns {ModuleNode|null}
 */
export function findModule(lookup, module, view = null) {
  if (!lookup || !module) return null
  const node = lookup[normalizeModulePath(module)] ?? null
  if (view === null || view === undefined || view === "") return node
  if (!node) return null
  const index = typeof view === "number" ? view : /^\d+$/.test(String(view)) ? Number(view) : null
  if (index !== null) return lookup[`${node.key}#${index}`] ?? null
  return node.children.find((c) => c.type === "view" && (c.group === view || c.name === view)) ?? null
}

/** Only the visible nodes (recursively) — what a navigation renders. */
export function visibleModuleTree(tree) {
  return (tree ?? []).filter((n) => n.visible).map((n) => ({ ...n, children: visibleModuleTree(n.children) }))
}

// --------------------------------------------------------------------------- //
// Store                                                                       //
// --------------------------------------------------------------------------- //

const ADMIN_RIGHTS = ["admin", "root"]

/** True when a user skel carries a right that unlocks the module part. */
export function canAccessAdminConfig(user) {
  const access = Array.isArray(user?.access) ? user.access : []
  return ADMIN_RIGHTS.some((flag) => access.includes(flag))
}

function configUrl(renderer) {
  const base = import.meta.env.VITE_API_URL ?? window.location.origin
  return `${base}/${renderer}/config`
}

export const useConfigStore = defineStore("viurConfig", () => {
  const state = reactive({
    // public settings: `conf.admin.*` with dotted keys, language(s), google client id
    configuration: {},
    // admin-only: `{ [modulePath]: adminInfo }`, null until loaded with admin rights
    modules: null,
    // admin-only: core version `[major, minor, patch, extra]`, null until loaded
    version: null,
    // "unknown" | "loading" | "public" | "admin" | "error"
    status: "unknown",
    error: null,
    // renderer segment of the endpoint; ViUR serves the config via the vi renderer
    renderer: "vi",
    // access flags of the session user, used to gate the module tree
    access: [],
  })

  // Set view of `state.access`, rebuilt only when the flags change
  const accessFlags = computed(() => new Set(state.access))

  let _pending = null

  // ── getters ────────────────────────────────────────────────────────────────
  const isLoaded = computed(() => state.status === "public" || state.status === "admin")
  /** The module part (admin/root) has been loaded. */
  const isAdminLoaded = computed(() => state.status === "admin")
  const googleClientId = computed(() => state.configuration["admin.user.google.clientID"] ?? null)
  const hasGoogleLogin = computed(() => !!googleClientId.value)
  /** viur-core 4: the password login allows the self-registration. */
  const registrationEnabled = computed(() => state.configuration["admin.user.registration"] === true)
  /** viur-core 4: signed-in users may add second factors (authenticator app, passkeys, recovery codes). */
  const secondFactorSetupEnabled = computed(() => state.configuration["admin.user.second_factor_setup"] === true)
  const language = computed(() => state.configuration["admin.language"] ?? null)
  const languages = computed(() => state.configuration["admin.languages"] ?? [])
  const moduleNames = computed(() => Object.keys(state.modules ?? {}))
  /**
   * Groups of the module navigation. viur-core renders `conf.admin.module_groups`
   * as the DOTTED key `admin.module.groups` (singular). The plural stays as a
   * fallback in case a project/version delivers it that way.
   */
  const groups = computed(
    () => state.configuration["admin.module.groups"] ?? state.configuration["admin.modules.groups"] ?? {}
  )

  // ── module tree (navigation) & lookup ─────────────────────────────────────
  /** Full tree incl. hidden/inaccessible nodes (see buildModuleTree above). */
  const moduleTree = computed(() =>
    buildModuleTree({ modules: state.modules ?? {}, groups: groups.value, access: accessFlags.value })
  )
  /** Tree pruned to what the navigation should render. */
  const navigationTree = computed(() => visibleModuleTree(moduleTree.value))
  /** `{ [key]: node }` for lookups; keys: "shop.order", "shop.order#1", "group:shop". */
  const moduleLookup = computed(() => flattenModuleTree(moduleTree.value))

  /** Resolve a module (or one of its views) node; view = index | group | name. */
  function moduleNode(name, view = null) {
    return findModule(moduleLookup.value, name, view)
  }

  /** Set the access flags used for the tree (usually `user.access`). */
  function setAccess(access) {
    state.access = Array.isArray(access) ? [...access] : []
  }

  /** Read a setting; accepts the dotted key ("admin.name") or the bare part
   *  ("name", "user.google.clientID") — the `admin.` prefix is optional. */
  function get(key, fallback = undefined) {
    if (key in state.configuration) return state.configuration[key]
    const prefixed = `admin.${key}`
    return prefixed in state.configuration ? state.configuration[prefixed] : fallback
  }

  /** Admin info of one module ("user", "shop.order"); null when unknown or
   *  when the module part has not been loaded. */
  function module(name) {
    return state.modules?.[name] ?? null
  }

  function configure({ renderer } = {}) {
    if (renderer) state.renderer = renderer
  }

  // ── fetching ───────────────────────────────────────────────────────────────
  /**
   * Load `/vi/config`.
   *
   * Without arguments the request is always made — call it once BEFORE
   * rendering the login screen (anonymous → public settings).
   *
   * Pass `{ user }` (the UserSkel values) after a login: the module part is
   * only served for admin/root, so for any other user the request is skipped
   * and the public settings already loaded are kept. If the user has the
   * rights, the config is re-fetched and `modules`/`version` filled.
   *
   * Concurrent calls share one request. Resolves with the store state; a
   * failed request sets `status: "error"` and rejects.
   *
   * @param {{ user?: object|null, force?: boolean }} [options]
   * @returns {Promise<object>} the reactive state
   */
  async function fetchConfig({ user = undefined, force = false } = {}) {
    if (user !== undefined) {
      setAccess(user?.access)
      if (!canAccessAdminConfig(user)) return state
      if (isAdminLoaded.value && !force) return state
    }
    if (_pending) return _pending
    _pending = _fetch().finally(() => {
      _pending = null
    })
    return _pending
  }

  async function _fetch() {
    state.status = "loading"
    state.error = null
    try {
      const response = await fetch(configUrl(state.renderer), {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!response.ok) {
        throw new Error(`config request failed: ${response.status} ${response.statusText}`)
      }
      const body = await response.json()
      // markRaw: the config is read-only data. Wrapping thousands of module
      // infos in deep reactive proxies would make every read in the tree
      // builder go through a proxy trap and track thousands of dependencies.
      // Replacing the whole object still triggers the computeds.
      state.configuration = markRaw(body?.configuration ?? {})
      if (body?.modules) {
        state.modules = markRaw(body.modules)
        state.version = Array.isArray(body.version) ? body.version : null
        state.status = "admin"
      } else {
        // an anonymous answer never carries modules — drop stale admin data
        // (e.g. after a logout)
        state.modules = null
        state.version = null
        state.status = "public"
      }
      return state
    } catch (error) {
      state.status = "error"
      state.error = error
      throw error
    }
  }

  function reset() {
    state.configuration = {}
    state.modules = null
    state.version = null
    state.status = "unknown"
    state.error = null
    state.access = []
    _pending = null
  }

  return {
    state,
    // getters
    isLoaded,
    isAdminLoaded,
    googleClientId,
    hasGoogleLogin,
    registrationEnabled,
    secondFactorSetupEnabled,
    language,
    languages,
    moduleNames,
    groups,
    moduleTree,
    navigationTree,
    moduleLookup,
    get,
    module,
    moduleNode,
    setAccess,
    // config
    configure,
    // actions
    fetchConfig,
    reset,
  }
})
