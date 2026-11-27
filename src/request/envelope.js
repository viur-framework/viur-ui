// --------------------------------------------------------------------------- //
// Envelope normalization — v1 → v2                                            //
// --------------------------------------------------------------------------- //
//
// viur-ui works PRIMARILY on the viur-actions "envelope v2" response shape
// (see sources/viur-actions/src/viur/actions/envelope.py). To also keep
// supporting the classic v1 ViUR JSON protocol (`values` / `skellist` /
// `structure` / `errors` / `action`), we normalize every response UP to the
// canonical v2 envelope at the `.json()`/parse boundary.
//
// This is the exact inverse of vi-vue-utils, which normalizes v2 DOWN to v1.
// There, v1 is canonical and v2 responses are adapted; here, v2 is canonical
// and v1 responses are adapted.
//
// The normalization is transparent for bodies that are already v2 (they carry
// the JSON number `version: 2`) and for non-ViUR payloads (skey arrays, the
// version-agnostic `getStructure` map, custom endpoints) — those pass through
// unchanged.
//
// By default the request layer hits the unversioned `/json/…` endpoint, which
// the server aliases to the newest wire format (envelope v2). A specific
// version can be pinned via the separate `version` parameter (`2`/`"v2"` for
// v2, `1`/`"v1"` for classic v1) — see `create_url` in request.js. Either way,
// this module guarantees viur-ui consumes a v2-shaped body.

/**
 * Canonical v2 envelope field set (see viur-actions envelope.py):
 *   version, action, status, step, step_status, steps, follow,
 *   datatype, module, structure, data, errors
 * plus a list-only `meta: { cursor, orders }`.
 */

/** v1 actions whose selected value IS the url of the next step. */
const SELECTION_ACTIONS = ["select_authentication_provider", "select_secondfactor_provider"]

/**
 * Target url of the next step in the CLASSIC v1 login.
 *
 * v2 (viur-actions) drives a multi-step action itself: every response carries
 * the `follow` url of the next step. v1 has no such field — there the target IS
 * the value the user picked: `/user/login` renders a single select whose option
 * KEYS are the provider urls ("/vi/user/auth_userpassword/login", …), and a POST
 * echoes the chosen key back in the body. So the selection doubles as the
 * follow.
 *
 * The same shape appears twice in the flow: choosing the PRIMARY provider
 * (`select_authentication_provider`) and choosing the SECOND FACTOR
 * (`select_secondfactor_provider`).
 *
 * Only applied to a body that really is such a selection: one of those actions,
 * a select bone, and a chosen value that is one of that bone's own option keys.
 * Returns null otherwise.
 *
 * @param {*} body normalized (v2-shaped) body
 * @returns {string|null}
 */
export function v1SelectionFollow(body) {
  if (!body || typeof body !== "object" || !SELECTION_ACTIONS.includes(body["action"])) {
    return null
  }
  const values = body["data"] ?? body["values"] ?? {}
  const structure = body["structure"] ?? {}
  for (const [name, bone] of Object.entries(structure)) {
    if (!String(bone?.["type"] ?? "").startsWith("select")) continue
    const chosen = values?.[name]
    if (typeof chosen !== "string" || !/^(\/|https?:\/\/)/.test(chosen)) continue
    // Only if the value actually is one of the offered target URLs.
    if (bone?.["values"] && Object.prototype.hasOwnProperty.call(bone["values"], chosen)) return chosen
  }
  return null
}

/**
 * Normalize the `errors` array so consumers can rely on `fieldPath` being a
 * LIST of path segments (that is how viur-core declares it and how the bones
 * match errors to fields: `fieldPath[0] === boneName`).
 *
 * Some server paths hand a plain string instead — viur-core's userpassword
 * login, for example, builds its "Invalid username or password provided" error
 * with the bare bone name. A string would then be indexed character-wise and
 * the error would silently never reach any field.
 *
 * @param {*} errors
 * @returns {Array}
 */
function normalizeErrors(errors) {
  if (!Array.isArray(errors)) return []
  return errors.map((error) => {
    if (!error || typeof error !== "object") return error
    const fieldPath = error["fieldPath"]
    if (fieldPath == null || Array.isArray(fieldPath)) return error
    return { ...error, fieldPath: String(fieldPath).split(".").filter(Boolean) }
  })
}

/**
 * True if `data` is an already-parsed viur-actions envelope-v2 body.
 * The wire carries `version` as the JSON number `2`; we also tolerate the
 * string `"2"` defensively.
 * @param {*} data
 * @returns {boolean}
 */
export function isEnvelopeV2(data) {
  return (
    !!data && typeof data === "object" && !Array.isArray(data) && (data["version"] === 2 || data["version"] === "2")
  )
}

/**
 * True if `data` is an envelope as viur-core 4 sends it: it always carries
 * `steps` and `step_status` (`null` when there are none). A v1 body of
 * viur-core 3.9 lifted by `normalizeEnvelope` never has them, so this works on
 * normalized bodies, too.
 * @param {*} data
 * @returns {boolean}
 */
export function isViur4Envelope(data) {
  return isEnvelopeV2(data) && "steps" in data && "step_status" in data
}

/**
 * Map a classic v1 `action` string (+ errors) to a v2 `(action, status)` pair.
 * Inverse of vi-vue-utils' `v1ActionString`.
 *
 * - `addSuccess` / `editSuccess` / `cloneSuccess` / `deleteSuccess` / `moveSuccess` → the plain
 *   verb with `status: "success"`.
 * - `view` / `list` → the verb with `status: "success"` (a completed read).
 * - any other verb (`add` / `edit` / `clone` / custom): `status: "rejected"`
 *   when the response carries errors, else `status: "init"` (a freshly rendered
 *   or in-flight form).
 *
 * @param {string|undefined} action v1 action string
 * @param {Array|undefined} errors v1 errors array
 * @returns {{ action: string, status: string }}
 */
function v2ActionStatus(action, errors) {
  switch (action) {
    case "addSuccess":
      return { action: "add", status: "success" }
    case "editSuccess":
      return { action: "edit", status: "success" }
    case "cloneSuccess":
      return { action: "clone", status: "success" }
    case "deleteSuccess":
      return { action: "delete", status: "success" }
    case "moveSuccess":
      return { action: "move", status: "success" }
  }

  if (action === "view" || action === "list") {
    return { action, status: "success" }
  }

  const status = Array.isArray(errors) && errors.length > 0 ? "rejected" : "init"
  return { action: action ?? null, status }
}

/**
 * Normalize a parsed response body to the canonical v2 envelope shape.
 *
 * - Bodies already in v2 pass through (only `errors`/`meta` are defensively
 *   ensured).
 * - Classic v1 bodies (carrying `skellist`, `values`, or a v1 `action`) are
 *   lifted to v2: `data` (from `skellist`/`values`), `datatype`, `structure`,
 *   `errors`, `follow`, `(action, status)` and — for lists — `meta`. The
 *   original v1 fields are kept alongside, so the result is a superset and the
 *   transform is idempotent.
 * - Everything else (arrays, primitives, non-ViUR objects such as the skey list
 *   or the `getStructure` map) passes through unchanged.
 *
 * @param {*} data parsed response body
 * @returns {*} v2-shaped body (or the input unchanged)
 */
export function normalizeEnvelope(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data
  }

  if (isEnvelopeV2(data)) {
    const out = { ...data }
    out["version"] = 2
    out["errors"] = normalizeErrors(data["errors"])
    if (data["datatype"] === "list" && !data["meta"]) {
      out["meta"] = { cursor: data["cursor"] ?? null, orders: data["orders"] || [] }
    }
    return out
  }

  const isList = Array.isArray(data["skellist"])
  const isEntity = "values" in data
  const hasV1Action = typeof data["action"] === "string"

  // Not a ViUR structured response (skey, getStructure map, custom payload):
  // leave untouched.
  if (!isList && !isEntity && !hasV1Action) {
    return data
  }

  const out = { ...data }
  out["version"] = 2
  const { action, status } = v2ActionStatus(data["action"], data["errors"])
  out["action"] = action
  out["status"] = status
  out["errors"] = normalizeErrors(data["errors"])
  // Target of the step. v1 puts it in different places depending on the stage:
  //   next_url          – set by the server (e.g. choice of the second factor)
  //   params.action_url  – for a rendered step that brings its own target
  //                        (viur-core: the OTP step of the second factor
  //                        comes as `edit` with action_url)
  out["follow"] = data["follow"] ?? data["next_url"] ?? data["params"]?.["action_url"] ?? null
  out["structure"] = data["structure"] ?? null

  if (isList) {
    out["datatype"] = "list"
    out["data"] = data["skellist"]
    out["meta"] = { cursor: data["cursor"] ?? null, orders: data["orders"] || [] }
  } else {
    out["datatype"] = "entity"
    out["data"] = isEntity ? data["values"] : (data["data"] ?? null)
  }

  return out
}
