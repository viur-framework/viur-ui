import type { Ref, ComputedRef } from "vue"
import type { UseFetchReturn } from "@vueuse/core"

// ─── List ─────────────────────────────────────────────────────────────────────

export interface ListFetchInstance {
  data: Ref<Record<string, any>[]>
  structure: Ref<Record<string, any>>
  orders: Ref<any[]>
  cursor: Ref<string>
  params: Ref<Record<string, any>>
  /** everything loaded (finished and no cursor left) — safe for local sort/filter */
  complete: ComputedRef<boolean>
  isFetching: Ref<boolean>
  isFinished: Ref<boolean>
  error: Ref<any>
  execute: () => Promise<any>
  /** load the next `pages` pages (default 1) */
  next: (pages?: number) => Promise<void>
  /** load every remaining page */
  nextAll: () => Promise<void>
  filter: (params: Record<string, any>) => Promise<any>
  reset: () => void
}

export interface ListFetchOptions {
  params?: Record<string, any>
  group?: string | null
  url?: string | null
  renderer?: string
  /** pin the wire format, e.g. `2`/`"v2"` (default: unversioned endpoint) */
  version?: string | number | null
  immediate?: boolean
  cached?: boolean
  ttl?: number
  /** push failures to the message store (when one exists), default `true` */
  messages?: boolean
  /** Extra headers for the LIST requests (not the structure) — object or
   *  function, evaluated per request (e.g. X-VIUR-BONELIST). */
  headers?: Record<string, string> | (() => Record<string, string> | null) | null
}

export declare const useListFetch: (controller: string | string[], options?: ListFetchOptions) => ListFetchInstance
export declare const useListFetchAll: (controller: string | string[], options?: ListFetchOptions) => ListFetchInstance

// ─── Tree (nodes + leaves) ────────────────────────────────────────────────────

export interface TreeFetchOptions extends Omit<ListFetchOptions, "group" | "url"> {
  /** shortcut for `params.parententry` */
  parententry?: string | null
  /** fetch every page of both lists automatically */
  all?: boolean
}

export interface TreeFetchInstance {
  nodes: ListFetchInstance
  leaves: ListFetchInstance
  /** nodes followed by leaves, each enriched with `skelType: "node" | "leaf"` */
  data: ComputedRef<Record<string, any>[]>
  structure: ComputedRef<{ node: Record<string, any>; leaf: Record<string, any> }>
  isFetching: ComputedRef<boolean>
  isFinished: ComputedRef<boolean>
  error: ComputedRef<any>
  hasMore: ComputedRef<boolean>
  /** both lists fully loaded — safe for local sort/filter */
  complete: ComputedRef<boolean>
  execute: () => Promise<any>
  /** paginates nodes first, then leaves */
  next: () => Promise<any>
  /** loads every remaining page of both lists */
  nextAll: () => Promise<any>
  filter: (params: Record<string, any>) => Promise<any>
  /** switch to another parent node, keeping the other params */
  open: (parententry: string) => Promise<any>
  reset: () => void
}

export declare function useTreeFetch(controller: string | string[], options?: TreeFetchOptions): TreeFetchInstance

// ─── View / Add / Edit / Delete ───────────────────────────────────────────────

type ControllerFetchFn = (
  controller: string | string[],
  args?: string,
  data?: Record<string, any>,
  ctx?: Record<string, any>
) => UseFetchReturn<any>

/**
 * Build a custom query against an endpoint of a module — the basis of the
 * `use*Fetch` helpers. `ctx` accepts, among others, `renderer`, `version`, `query`
 * (additional query string), `headers`, `immediate`.
 */
export declare function createControllerFetch(options?: {
  endpoint?: string
  method?: string
  secure?: boolean
  invalidates?: boolean
  invalidatesAll?: boolean
}): ControllerFetchFn

export declare const useViewFetch: ControllerFetchFn
export declare const useStructureFetch: ControllerFetchFn
/** Unwrap envelope v2 (v1 responses are returned unchanged). */
export declare function normalizeEnvelope(body: unknown): unknown
/** Flatten a skel structure — accepts both dict and pair-list form. */
export declare function normalizeStructure(structure: unknown): Record<string, Record<string, unknown>>
export declare const useAddFetch: ControllerFetchFn
export declare const useEditFetch: ControllerFetchFn
export declare const useDeleteFetch: ControllerFetchFn
/** List & Tree: `{ key, ...values }` / `{ skelType, key, parententry, ...values }` */
export declare const useCloneFetch: ControllerFetchFn
/** List only */
export declare const usePreviewFetch: ControllerFetchFn
/** Tree only: `{ skelType, key, parentNode, sortindex? }` */
export declare const useMoveFetch: ControllerFetchFn
/** Tree only: GET, resolves to `Array<{ name: string; key: string }>` */
export declare const useListRootNodesFetch: ControllerFetchFn

// ─── Config store (/vi/config) ────────────────────────────────────────────────

export interface ConfigStoreState {
  /** public `conf.admin.*` settings with dotted keys, e.g. "admin.name" */
  configuration: Record<string, any>
  /** admin/root only: `{ [modulePath]: adminInfo }`, null until loaded */
  modules: Record<string, Record<string, any>> | null
  /** admin/root only: core version `[major, minor, patch, extra]` */
  version: (number | string | null)[] | null
  status: "unknown" | "loading" | "public" | "admin" | "error"
  error: Error | null
  renderer: string
  /** access flags gating the module tree (set via fetchConfig({ user }) / setAccess) */
  access: string[]
}

/** A node of the module tree built from `modules` + `admin.module.groups`. */
export interface ModuleNode {
  type: "group" | "module" | "view"
  /** "shop.order" | "shop.order#1" (view) | "group:shop" */
  key: string
  /** group key for type "group", else null */
  groupKey: string | null
  /** dotted module path; null for groups */
  module: string | null
  /** last path segment: "shop.order" → "order" */
  baseModule: string | null
  name: string
  icon: string | null
  handler: string | null
  handlerType: "list" | "tree" | "hierarchy" | "singleton" | null
  /** `group` of a list.grouped view */
  group?: string | null
  display: "visible" | "hidden" | "group" | string
  sortIndex?: number
  /** user may use the module (add/edit/delete right, root, …) */
  hasAccess: boolean
  /** node should be rendered in a navigation */
  visible: boolean
  /** view index below its module; null otherwise */
  view?: number | null
  /** key of the parent node, null at top level */
  parent: string | null
  /** the (merged) adminInfo; never the server object itself */
  info: Record<string, any>
  children: ModuleNode[]
}

export declare function buildModuleTree(input?: {
  modules?: Record<string, Record<string, any>> | null
  groups?: Record<string, Record<string, any>> | null
  access?: string[]
}): ModuleNode[]
export declare function flattenModuleTree(tree: ModuleNode[]): Record<string, ModuleNode>
export declare function findModule(
  lookup: Record<string, ModuleNode>,
  module: string,
  view?: number | string | null
): ModuleNode | null
export declare function visibleModuleTree(tree: ModuleNode[]): ModuleNode[]
export declare function hasModuleAccess(
  access: string[],
  module: string,
  options?: { group?: string | null; showWithViewAccess?: boolean }
): boolean
export declare function handlerType(handler: string | null | undefined): ModuleNode["handlerType"]

export interface ConfigStore {
  state: ConfigStoreState
  isLoaded: boolean
  isAdminLoaded: boolean
  googleClientId: string | null
  hasGoogleLogin: boolean
  language: string | null
  languages: string[]
  moduleNames: string[]
  /** `configuration["admin.module.groups"]` (viur-core: `conf.admin.module_groups`) */
  groups: Record<string, Record<string, any>>
  /** full tree incl. hidden/inaccessible nodes */
  moduleTree: ModuleNode[]
  /** tree pruned to visible nodes — what a navigation renders */
  navigationTree: ModuleNode[]
  /** `{ [key]: node }`; keys "shop.order", "shop.order#1", "group:shop" */
  moduleLookup: Record<string, ModuleNode>
  /** read a setting by dotted key; the `admin.` prefix is optional */
  get<T = any>(key: string, fallback?: T): T
  /** raw adminInfo of a module as served by /vi/config */
  module(name: string): Record<string, any> | null
  /** resolved tree node of a module or one of its views (index | group | name) */
  moduleNode(name: string, view?: number | string | null): ModuleNode | null
  /** set the access flags used for the tree (usually `user.access`) */
  setAccess(access: string[] | null | undefined): void
  configure(options?: { renderer?: string }): void
  /**
   * Load `/vi/config`. Without `user`: always requests (call before rendering
   * the login screen). With `user`: only requests when the user has admin/root
   * rights (the module part), otherwise it is skipped.
   */
  fetchConfig(options?: { user?: Record<string, any> | null; force?: boolean }): Promise<ConfigStoreState>
  reset(): void
}

export declare function useConfigStore(): ConfigStore

// ─── Message store (user feedback) ────────────────────────────────────────────

export type MessageType = "success" | "error" | "warning" | "info"

export interface Message {
  id: number
  type: MessageType
  /** translation key, e.g. "messages.request.edit.success" */
  code: string | null
  /** generic translation key, e.g. "messages.request.default.success" */
  fallbackCode: string
  /** ready-made text (e.g. a server error message); wins over `code` in UIs */
  text: string | null
  params: Record<string, any>
  /** controller path, dotted ("user", "shop.order") */
  module: string | null
  /** envelope action / endpoint ("edit", "login") */
  action: string | null
  key: string | null
  /** envelope errors of a rejected request */
  errors: any[]
  /** HTTP status of a failed request */
  status: number | null
  /** ms until auto-dismiss, 0 = sticky */
  timeout: number
  timestamp: number
}

export type MessageInput = Partial<Omit<Message, "id" | "timestamp">>

export interface MessageStore {
  state: { messages: Message[]; timeouts: Record<MessageType, number>; max: number }
  latest: Message | null
  errors: Message[]
  count: number
  configure(options?: { timeouts?: Partial<Record<MessageType, number>>; max?: number }): void
  push(message: MessageInput): Message
  success(codeOrMessage: string | MessageInput, extra?: MessageInput): Message
  error(codeOrMessage: string | MessageInput, extra?: MessageInput): Message
  warning(codeOrMessage: string | MessageInput, extra?: MessageInput): Message
  info(codeOrMessage: string | MessageInput, extra?: MessageInput): Message
  remove(id: number): void
  clear(type?: MessageType | null): void
}

export declare function useMessageStore(): MessageStore
/** The message store if the app installed Pinia, else null. */
export declare function getMessageStore(): MessageStore | null
/** Push a message when a store exists; no-op (null) otherwise. */
export declare function notify(message: MessageInput): Message | null
export declare function canAccessAdminConfig(user: Record<string, any> | null | undefined): boolean

// ─── Color store (brand color from the configuration) ─────────────────────────

export interface ColorStore {
  /** Set to override the configuration; null → `admin.color.primary` / `.secondary`. */
  state: { primaryColor: string | null; secondaryColor: string | null }
  /** WebAwesome brand tokens (`--wa-color-brand-95…05`, `--wa-color-brand`, `-on`); empty without a valid color */
  brandColors: Record<string, string>
  /** `hsl(…)` with hue/saturation of the color; `lightness` (%) replaces its lightness, 0 keeps it */
  getPrimaryColor(lightness?: number): string | null
  getSecondaryColor(lightness?: number): string | null
  getAlphaColor(color: "primaryColor" | "secondaryColor", lightness: number, alpha: number): string | null
  /** Writes the brand palette into `doc` (a `<style>` in the head) and keeps it in sync; returns stop() */
  applyBrandColor(doc?: Document): () => void
}

export declare function useColorStore(): ColorStore
/** "#rrggbb" / "#rgb" → [h, s, l] (degrees, %, %); null for anything else */
export declare function hexToHsl(color: unknown): [number, number, number] | null
/** Lightness (HSL, %) per WebAwesome brand step, lightest first */
export declare const BRAND_LIGHTNESS: [string, number][]

// ─── File Upload ──────────────────────────────────────────────────────────────

export interface UploadFileOptions {
  target?: string
  publicUpload?: boolean
  renderer?: string | null
  version?: string | number | null
  /** Aborts the upload (all three requests). */
  signal?: AbortSignal
}

export declare function uploadFile(file: File, options?: UploadFileOptions): Promise<Record<string, any>>
export declare function resetState(): Promise<void>

export declare class HTTPError extends Error {
  statusCode: number
  statusText: string
  response: Response | null
  constructor(statusCode: number, statusText: string, message?: string, response?: Response | null)
}

// ─── Skel Utilities ───────────────────────────────────────────────────────────

export declare function downloadUrlFor(bone: any, thumbnail?: boolean, renderer?: string): string | null
export declare function serveUrlFor(
  servingurl: string,
  size?: number | null,
  filename?: string | null,
  options?: string,
  download?: boolean
): string

// ─── Skel Utilities ───────────────────────────────────────────────────────────

// ─── Low-level fetch helpers ──────────────────────────────────────────────────

export declare function get(url: string): Promise<Response>
export declare function post(
  url: string,
  data?: Record<string, any>,
  headers?: Record<string, string> | null
): Promise<Response>
export declare function securePost(
  url: string,
  data?: Record<string, any>,
  headers?: Record<string, string> | null,
  renderer?: string
): Promise<Response>

// ─── Skel Utilities ───────────────────────────────────────────────────────────

export declare function skelDataToFormData(
  skel: Record<string, any>,
  structure: Record<string, any>
): { [field: string]: any }[]

// ─── Translations ─────────────────────────────────────────────────────────────

/** Message trees of the package components — merge into the app's vue-i18n messages
 *  (vue-i18n is required; the components translate with t() without fallbacks). */
export declare const deTranslations: Record<string, any>
export declare const enTranslations: Record<string, any>

// ─── Safe HTML ────────────────────────────────────────────────────────────────

/** Sanitizes an HTML string with DOMPurify (scripts, event handlers and javascript: URLs removed). */
export declare function sanitizeHtml(value: unknown): string
/** Vue plugin: registers the `v-safe-html` directive and `$sanitizeHtml`. */
export declare const safeHtml: import("vue").Plugin
/** The `v-safe-html` directive for local registration (`import { vSafeHtml }` in `<script setup>`). */
export declare const vSafeHtml: import("vue").ObjectDirective<HTMLElement, unknown>

/** Map component and geocoder for the address widget (`record.address`). viur-ui ships none. */
export interface AddressProvider {
  /** Props `coordinates` (`[lat, lng] | null`) and `readonly`; emits `pick` with `[lat, lng]`. Handles its own consent. */
  map?: import("vue").Component
  /** Address fields -> `[lat, lng]`, `null` if not found. */
  geocode?: (address: Record<string, unknown>) => Promise<[number, number] | null>
  /** `[lat, lng]` -> address fields (`street_name`, `street_number`, `zip_code`, `city`, `region`, `country`). */
  reverseGeocode?: (coordinates: [number, number]) => Promise<Record<string, unknown> | null>
}
/** Registers the map/geocoder for all address widgets. Call once at app start, `null` removes it. */
export declare function setAddressProvider(provider: AddressProvider | null): void
