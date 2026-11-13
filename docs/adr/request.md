---
covers:
  [
    src.request.request.createControllerFetch,
    src.request.request.createControllerListFetch,
    src.request.request.useTreeFetch,
    src.request.request.resetState,
    src.request.request.uploadFile,
    src.request.envelope.normalizeEnvelope,
    src.request.cache.clearCache,
    src.request.cache.invalidateByKey,
    src.request.skel.normalizeStructure,
    src.request.skel.skelDataToFormData,
    src.request.configStore.useConfigStore,
    src.request.configStore.hasModuleAccess,
    src.request.configStore.normalizeModulePath,
    src.request.messageStore.notify,
  ]
status: accepted
---

## Seam

CRUD goes through the prebuilt fetches in `src/request/request.js`
(`useListFetch`, `useViewFetch`, `useEditFetch`, `useAddFetch`, ...), which
hit the native `/json/<module>/<action>` routes. A real domain endpoint gets
its own fetch via `createControllerFetch({ endpoint, method, secure,
invalidates, invalidatesAll })`; lists via `createControllerListFetch`, trees
(nodes + leaves of one parent) via `useTreeFetch`.

Per-request knobs live in the 4th argument (`ctx`): `version`, `lang`,
`headers`, `query`, `cached`/`ttl`, `messages`, `skey`. Every response is
lifted to envelope v2 by `normalizeEnvelope`; read `data`, `errors`,
`status`, `follow`, lists also `meta.cursor`.

Admin navigation and rights: `useConfigStore().fetchConfig()` before the
login renders, `fetchConfig({ user })` after it; the tree comes from
`moduleTree` / `navigationTree`, lookups from `moduleNode`.

## Rules

- No custom endpoint that paraphrases a CRUD verb. `edit` takes only the
  bones to change; a status switch is an edit with `status` alone.
- Lists are cursor-paged: `next()` / `nextAll()`, never an offset. Sort or
  filter locally only once `complete` is true.
- Mutating calls pass `secure: true`; the skey is fetched in batches of 10
  and appended by the layer. Never build a skey into the URL yourself.
- After login and logout call `resetState()`: cached skeys belong to the old
  session and the IndexedDB request cache may hold another user's data.
- A fetch that changes data the cache may hold sets `invalidates` (entity
  key) or `invalidatesAll` (all cached lists of the module).

## Traps

- The second argument of `createControllerFetch(...)(controller, args, data)`
  is appended as path segments after the endpoint (`"<key>"`, `["node", key]`,
  `"/"` for none), also for POST and in the cache key. It is no data object:
  parameters go into `data`, query string for GET, FormData for POST.
  Anything else (e.g. an object) throws a `TypeError`. `invalidates` reads
  the key from `data.key` or the response, not from the path: for delete,
  pass the key in `data`.
- GET `data` uses `new URLSearchParams(data)`: an array becomes `a=1%2C2`,
  not repeated keys. List params do append repeated keys.
- POST drops `null`/`undefined` values, so the bone stays untouched. To
  clear a bone send `""`.
- `skelDataToFormData` returns an array of one-key objects, not FormData.
  Passed as `data` it posts keys `"0"`, `"1"`, ...
- `cached: true` with the default `ttl: 0` never expires. Only invalidation,
  `resetState()` or the 1000-entry trim remove it.
- On `localhost` importing `cache.js` wipes the whole cache, so caching
  looks broken in local dev.
- `invalidatesAll` clears the prefix `<VITE_API_URL ?? origin>/<renderer>/<module>/`.
  URLs built with `version` (`/json/v2/...`) or `lang` (`/de/json/...`) do
  not match and stay stale.
- No `indexedDB` guard: without it (node tests, SSR) every `invalidates` /
  `invalidatesAll` fetch fails in `afterFetch` although the server already
  wrote.
- `normalizeEnvelope` does not normalise `structure`. Single fetches can
  hand out the pair-list form; run `normalizeStructure` yourself, also on
  `bone.using`. Non-ViUR bodies pass through unchanged.
- `hasModuleAccess` also accepts the base name: `order-edit` unlocks every
  `*.order` module. UI visibility only, the server checks again.
- `sortIndex: 0` counts as "no index" and sorts after indexed modules.
  Groups that name each other as `moduleGroup` vanish with their modules.
- `moduleNode` accepts `shop/order`, `module(name)` does not normalise.
- `logout()` resets skeys and cache but not the config store. Stale admin
  `modules` stay until `useConfigStore().reset()` or a forced fetch.

## See also

- `docs/adr/forms/utils.md` - how `ViForm` builds its edit/add payload.
