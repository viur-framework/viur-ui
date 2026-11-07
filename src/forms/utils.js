import { createControllerFetch, normalizeEnvelope, normalizeStructure } from "../request/index.js"
import Logics from "logics-js"
import { inject, toRaw, reactive, markRaw } from "vue"
import Utils from "./bones/utils.js"

/**
 * Deep copy of plain data (skel values) that resolves Vue proxies on EVERY
 * level. structuredClone alone fails at this: a record/using form
 * receives the reactive value of the parent bone, and `{ ...proxy }` keeps the
 * nested values as proxies. Other objects (Date, File) remain shared.
 */
function rawCopy(value) {
  const raw = toRaw(value)
  if (Array.isArray(raw)) return raw.map(rawCopy)
  if (raw && typeof raw === "object" && Object.getPrototypeOf(raw) === Object.prototype) {
    return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, rawCopy(entry)]))
  }
  return raw
}

export function useFormUtils(props, state) {
  function buildRequestSpec(urlOverride = null) {
    let path = urlOverride

    if (!path) {
      path = `/${props.renderer}/${props.module}/${props.action}`

      const isTree = ["node", "leaf"].includes(props.skeltype)

      if (props.group) {
        path += `/${props.group}`
      } else if (isTree) {
        path += `/${props.skeltype}`
      }

      // Only append with a key: a SINGLETON has exactly one entry, its
      // `edit` takes no key. Without this check `/edit/undefined` resulted.
      if (["edit", "clone"].includes(props.action) || (isTree && props.action === "add")) {
        if (props.skelkey) {
          path += `/${props.skelkey}`
        }
      }
    }

    const parsedUrl = new URL(path, window.location.origin)
    const segments = parsedUrl.pathname.split("/").filter(Boolean)
    const renderer = segments[0] || props.renderer
    const requestSegments = segments[0] === renderer ? segments.slice(1) : segments

    if (requestSegments.length < 2) {
      throw new Error(`Invalid request path: ${path}`)
    }

    return {
      renderer,
      controller: requestSegments.slice(0, -1),
      endpoint: requestSegments.at(-1),
      // preserve any query string from a server-provided url (e.g. a `follow`
      // step url) so it is passed through to the request
      query: parsedUrl.search ? parsedUrl.search.slice(1) : "",
    }
  }

  async function _envelopeFromResponse(response) {
    // A cloned Response bypasses the request layer's .json() normalization, so
    // lift it to the canonical v2 shape here too.
    try {
      return normalizeEnvelope(await response.clone().json())
    } catch {
      return null
    }
  }

  // Apply a (normalized v2) envelope to the form state. Central place that maps
  // the envelope onto skel / structure / errors and the multi-step fields.
  function applyResponseState(data, { updateStructure = false, presetValues = false } = {}) {
    data = data ?? {}

    state.datatype = data["datatype"] ?? null

    if (data["datatype"] === "list") {
      // List envelope: structure is null — don't build a form. Expose the items
      // for custom rendering via the `list` slot instead, and never crash on the
      // null structure a list carries.
      const items = data["data"] !== undefined ? data["data"] : data["skellist"]
      state.list = Array.isArray(items) ? items : []
      state.cursor = data["meta"]?.["cursor"] ?? data["cursor"] ?? null
      state.orders = data["meta"]?.["orders"] ?? data["orders"] ?? []
      state.structure = {}
      state.skel = {}
    } else {
      // Entity: payload lives in `data` (v1 `values` is lifted to `data` by
      // normalizeEnvelope; accept `values` too for a raw body).
      const values = data["data"] !== undefined ? data["data"] : data["values"]
      if (updateStructure && data["structure"] != null) {
        // The `values` prop prefills a freshly RENDERED form. The
        // response to a submit mirrors what was sent — it must not
        // overwrite that again.
        initForm(values, data["structure"], presetValues ? state.values : null)
        // New structure = server flags: apply visibleIf/readonlyIf/requiredIf/evaluate
        // right away, not only on the next input.
        logics()
      } else if (values !== undefined) {
        state.skel = values
      }
      state.list = null
    }

    state.errors = data["errors"]
    state.actionparams = data["params"]
    state.actionname = data["action"]

    // Envelope-v2 multi-step fields. Absent on classic v1 bodies → reset to null
    // (harmless for single-step forms). `follow` becomes the POST target for the
    // *current* step; on a POST response it is the *next* step's URL.
    state.step = data["step"] ?? null
    state.stepStatus = data["step_status"] ?? null
    state.steps = data["steps"] ?? null
    state.status = data["status"] ?? null
    if (data["follow"] !== undefined) {
      state.postUrl = data["follow"]
    }
    state.loading = false
  }

  // GET-render a step of a follow-driven multi-step action. Unlike fetchData
  // (which POSTs — a submit), this renders the step's *initial* form. `url` is
  // the envelope `follow` / `steps[key].url`; omit it to build the entry URL
  // from props.
  async function loadStep(url = null) {
    state.loading = true
    state.failed = null
    const requestSpec = buildRequestSpec(url)
    const request = createControllerFetch({ endpoint: requestSpec.endpoint, method: "GET" })
    const fetchResult = request(
      requestSpec.controller,
      "/",
      {},
      {
        renderer: requestSpec.renderer,
        version: props.version,
        query: requestSpec.query,
        immediate: false,
        messages: props.useMessageStore !== false,
      }
    )
    try {
      await fetchResult.execute()
      applyResponseState(fetchResult.data.value, { updateStructure: true, presetValues: true })
      // A v1 step carries no target (no `follow`, no next_url, no
      // params.action_url) — there the step is sent back to the SAME URL
      // it was rendered from. Without this, postUrl would be
      // null after rendering and the submit button would do nothing.
      if (!state.postUrl && url) {
        state.postUrl = url
      }
      return fetchResult
    } catch (error) {
      state.failed = error
      state.loading = false
      throw error
    }
  }

  // Back one step in a multi-step flow. The target is the previous step's
  // backend-provided endpoint URL (`steps[prevKey].url`) — no client-side
  // history. GET-rendering it prefills from the server session. No-op on the
  // first step or when the previous step carries no url.
  async function back() {
    if (!state.steps || !state.step) return
    const keys = Object.keys(state.steps)
    const idx = keys.indexOf(state.step)
    if (idx <= 0) return
    const prev = state.steps[keys[idx - 1]]
    const url = prev && (prev.url || prev.endpoint)
    if (!url) return
    return loadStep(url)
  }

  function toFormData() {
    let formdata = []

    function handleEntry(result, currentFieldName, bone, val) {
      if (bone["type"].startsWith("record")) {
        let struct = normalizeStructure(bone["using"])
        for (const [_fieldname, _bone] of Object.entries(struct)) {
          result = result.concat(boneToForm(`${currentFieldName}.${_fieldname}`, _bone, val?.[_fieldname]))
        }
      } else if (val === Object(val) && bone["using"]) {
        //recusive call for nested data
        if (val["dest"]?.["key"]) {
          let struct = normalizeStructure(bone["using"])
          for (const [_fieldname, _bone] of Object.entries(struct)) {
            result = result.concat(boneToForm(`${currentFieldName}.${_fieldname}`, _bone, val["rel"]?.[_fieldname]))
          }
          result.push({ [`${currentFieldName}.key`]: val["dest"]["key"] })
        } else {
          // viur-core cannot store `rel` without a relation: say so instead of dropping it silently.
          // multiple: skip the row (`name.idx=""` is ignored or, with languages, breaks the server)
          if (val["rel"]) console.warn(`[ViForm] ${currentFieldName}: using data without a relation is not sent`)
          if (!bone["multiple"]) result.push({ [`${currentFieldName}`]: null })
        }
      } else if (bone["type"].startsWith("spatial") && val) {
        //spatialbones
        result.push({ [currentFieldName + ".lat"]: val[0] })
        result.push({ [currentFieldName + ".lng"]: val[1] })
      } else if (bone["type"].startsWith("raw.json") && val) {
        result.push({ [currentFieldName]: JSON.stringify(val) })
      } else if (val === Object(val)) {
        //normal relations
        result.push({ [currentFieldName]: val["dest"]?.["key"] || null })
      } else {
        //everything else
        result.push({ [currentFieldName]: val })
      }
      return result
    }

    function boneToForm(fieldname, bone, value) {
      let result = []
      //only record and relational bones get indexed fields
      let indexBone = bone["type"].startsWith("record")
      let languages = bone["languages"] || ["none"]
      let languageValue = value
      for (const lang of languages) {
        let currentFieldName = fieldname
        if (lang !== "none") {
          currentFieldName += `.${lang}` //append lang
          if (languageValue) value = languageValue[lang]
        }

        if (bone["multiple"]) {
          if (!value) value = []
          const sentBefore = result.length
          for (const [idx, val] of value.entries()) {
            let currentFieldnameMultiple = currentFieldName

            if (indexBone || val?.["rel"] || (bone["using"] && val?.["rel"] !== null)) {
              currentFieldnameMultiple = `${currentFieldName}.${idx}` //append idx
            }
            result = handleEntry(result, currentFieldnameMultiple, bone, val)
          }
          if (result.length === sentBefore) {
            result.push({ [currentFieldName]: null }) //send empty multiple fields (also when every row was skipped)
          }
        } else {
          result = handleEntry(result, currentFieldName, bone, value)
        }
      }
      return result
    }

    // sendOnlyShownBones: a form restricted with `bones` must not write the load-time
    // values of hidden bones back over newer changes
    const onlyShown = props.sendOnlyShownBones && props.bones?.length > 0
    for (const [fieldname, bone] of Object.entries(state.structure)) {
      if (onlyShown && !props.bones.includes(fieldname) && bone.type !== "key") {
        continue
      } else if (props.sendReadOnly) {
        formdata.push(boneToForm(fieldname, bone, state.skel[fieldname]))
      } else if (!state.structure[fieldname]["readonly"] || bone.type === "key") {
        formdata.push(boneToForm(fieldname, bone, state.skel[fieldname]))
      }
    }

    formdata = formdata.flat(10)
    return formdata
  }

  function sendData(alternativUrl = null, additionalData = null, headers = null, removeKeyFromDataset = true) {
    state.loading = true
    // No <form> element in list mode — nothing to validate.
    let isValid = state.viformelement && !props.novalidate ? state.viformelement.reportValidity() : true
    if (!isValid) {
      state.loading = false
      return new Promise((resolve, reject) => reject("Form is not valid"))
    }

    const requestSpec = buildRequestSpec(alternativUrl)
    const request = createControllerFetch({
      endpoint: requestSpec.endpoint,
      method: "POST",
      secure: props.secure,
    })

    const formData = new FormData()
    for (const bone of toFormData()) {
      for (const [k, v] of Object.entries(bone)) {
        let val = v
        if ([undefined, null].includes(v)) {
          val = ""
        }
        formData.append(k, val)
      }
    }

    let data = {}
    for (const key of formData.keys()) {
      if (key === "key" && removeKeyFromDataset) continue
      data[[key]] = formData.getAll(key)
    }
    if (additionalData) {
      data = { ...data, ...additionalData } //inject data like contexts
    }

    const fetchResult = request(requestSpec.controller, "/", data, {
      renderer: requestSpec.renderer,
      version: props.version,
      query: requestSpec.query,
      headers,
      immediate: false,
      messages: props.useMessageStore !== false,
    })

    return fetchResult
      .execute()
      .then(async () => {
        // Apply the (normalized v2) envelope — updates skel / errors / action
        // and, for multi-step flows, step / steps / status / follow. Re-init the
        // form when the response carries a structure (e.g. the next step's form).
        const responseData = fetchResult.data.value
        applyResponseState(responseData, { updateStructure: responseData?.["structure"] != null })
        return fetchResult
      })
      .catch(async (error) => {
        // A rejected/failed submit may still carry a form body (errors +
        // structure) on the error response — re-apply it so the form comes back
        // populated. Otherwise just surface the failure.
        const body = error?.response ? await _envelopeFromResponse(error.response).catch(() => null) : null
        if (body) {
          applyResponseState(body, { updateStructure: true })
        } else {
          state.loading = false
        }
        state.failed = error
        throw error
      })
  }

  function fetchData(alternativUrl = null, additionalData = null, headers = null) {
    //fetch data
    state.loading = true
    const requestSpec = buildRequestSpec(alternativUrl)
    const request = createControllerFetch({
      endpoint: requestSpec.endpoint,
      method: "POST",
      secure: props.secure,
    })

    let data = {}
    if (additionalData) {
      data = { ...data, ...additionalData } //inject data like contexts
    }
    state.failed = null
    const fetchResult = request(requestSpec.controller, "/", data, {
      renderer: requestSpec.renderer,
      version: props.version,
      query: requestSpec.query,
      headers,
      immediate: false,
      messages: props.useMessageStore !== false,
    })

    return fetchResult
      .execute()
      .then(async () => {
        // Canonical v2 envelope: entity payload is in `data`, bone definitions
        // in `structure` (both present for v1 too after normalizeEnvelope).
        let responseData = fetchResult.data.value
        initForm(responseData["data"], responseData["structure"], state.values)

        state.errors = responseData["errors"]
        state.actionparams = responseData["params"]
        state.actionname = responseData["action"]
        state.loading = false
        return fetchResult
      })
      .catch(async (error) => {
        state.failed = error
        throw error
      })
  }

  function reload() {
    state.loading = true
    if (props.multistep && props.module && props.action) {
      // Follow-driven multi-step: GET-render the entry step. The submit chain
      // (POST → follow → GET next) is driven by ViForm via loadStep/sendData.
      loadStep()
        .then(() => {
          state.loading = false
        })
        .catch(() => {
          state.loading = false
        })
    } else if (props.structure) {
      initForm(props.skel, props.structure, state.values)
      state.loading = false
    } else if (props.module && props.action) {
      fetchData(props.fetchUrl, props.params)
        .then(async (resp) => {
          state.loading = false
        })
        .catch(async (error) => {
          state.loading = false
        })
    } else {
      console.log(props)
      console.error("Error while building Form: you need atleast module and action or structure parameters")
    }
  }

  function updateCategories() {
    if (!state.structure) {
      state.structure = {}
    }

    let catname = state.categoryDefaultname
    if (!!catname && state.categoryDefaultname.includes("$(")) {
      catname = Utils.stripHtml(Utils.formatString(catname, state.skel, "Allgemein"))
    }

    let categories = { default: { name: catname, bones: [], visible: false, open: true } }

    for (const [boneName, bone] of Object.entries(state.structure)) {
      if (props.bones.length > 0) {
        if (!props.bones.includes(boneName)) {
          continue
        }
      }

      let category = "default"
      let boneStructure = state.structure[boneName]

      if (bone?.params?.category) {
        category = bone.params.category.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()
      }

      if (Object.keys(categories).includes(category)) {
        categories[category]["bones"].push({
          name: boneName,
        })
      } else {
        categories[category] = {
          name: bone.params.category,
          bones: [
            {
              name: boneName,
            },
          ],
        }
      }
      if (boneStructure["visible"] === true) {
        categories[category]["visible"] = true
      }

      if (
        (props.collapsedCategories &&
          props.collapsedCategories.map((x) => x.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()).includes(category)) ||
        category === "system" ||
        category === "internal" ||
        props.collapsedCategories?.[0] === "*"
      ) {
        categories[category]["open"] = false
      } else {
        categories[category]["open"] = true
      }
    }

    let sortedCategories = {}
    Object.keys(categories)
      .sort()
      .forEach(function (key) {
        sortedCategories[key] = categories[key]
      })

    return sortedCategories
  }

  // Validity per entry of a bone: a multiple or multilingual bone reports each entry on its own
  // (lang, index), so one entry must not overwrite another. `state.valids[name]` stays the bone's
  // verdict (all entries valid). An update for a wider scope (whole language, whole bone) replaces
  // the narrower states: after removing or reordering, the entries no longer sit where they were
  // reported, and the widgets report again as they remount or change.
  const entryValids = {}

  function recordValidity(name, lang, index, valid) {
    const scope = `${lang ?? ""}|`
    const entries = (entryValids[name] ??= {})
    if (index === null || index === undefined) {
      for (const key of Object.keys(entries)) {
        if (lang === null || lang === undefined || key.startsWith(scope)) delete entries[key]
      }
    }
    entries[scope + (index ?? "")] = valid !== false
    state.valids[name] = Object.values(entries).every(Boolean)
  }

  function updateSkel(data) {
    const { name, lang, value, index, valid } = data
    recordValidity(name, lang, index, valid)

    let skelvalue = state.skel[name]
    if (value === undefined) return false
    if (state.readonly) return false

    if (lang) {
      if (!skelvalue) {
        skelvalue = {}
      }
      if (Object.keys(skelvalue).includes(lang) && index !== null) {
        if (!skelvalue[lang]) {
          skelvalue[lang] = []
        }
        skelvalue[lang][index] = value
      } else {
        skelvalue[lang] = value
      }
    } else if (index !== null) {
      if (!skelvalue) {
        skelvalue = []
      }
      skelvalue[index] = value
    } else {
      skelvalue = value
    }
    state.skel[name] = skelvalue
    logics() //postprocess all bones if needed
  }

  function _logics(structure, skel) {
    for (const [boneName, bone] of Object.entries(structure)) {
      if (bone?.["params"]?.["evaluate"]) {
        let ex = new Logics(bone?.["params"]?.["evaluate"])
        state.skel[boneName] = ex.run(skel).toString() //rule produces, valid results? multilang, multiple etc?
      }

      if (bone?.["params"]?.["visibleIf"]) {
        try {
          let ex = new Logics(bone?.["params"]?.["visibleIf"])
          bone["visible"] = ex.run(skel).toBool()
        } catch (error) {
          //console.log(bone?.["params"]?.["visibleIf"])
        }
      }

      if (bone?.["params"]?.["readonlyIf"]) {
        let ex = new Logics(bone?.["params"]?.["readonlyIf"])
        bone["readonly"] = ex.run(skel).toBool()
      }
      if (bone?.["params"]?.["requiredIf"]) {
        try {
          let ex = new Logics(bone?.["params"]?.["requiredIf"])
          bone["required"] = ex.run(skel).toBool()
        } catch (error) {
          //console.log(bone?.["params"]?.["requiredIf"])
        }
      }
      if (bone?.["using"]) {
        _logics(normalizeStructure(bone["using"]), skel)
      }
    }
  }

  function logics() {
    let skel = { ...state.skel, _skel: state.skel }

    if (props.internal) {
      // injet mainform with _skel
      skel = { ...skel, _skel: props.internal.skel }
    }
    _logics(state.structure, skel)
  }

  function initForm(skel, structure, values = {}) {
    let skeldata = skel || {}
    let formvalues = {}
    if (values) {
      formvalues = values
    }

    if (structure !== undefined) {
      //props are refs to a js Object, removing reactivativ is not enought, we musst create copy of that object.
      //each form has its own structure and mutating dont change the structure for other forms, this is needed for multiple records with logics
      let struct = {}
      for (const [k, v] of Object.entries(normalizeStructure(structure))) {
        struct[k] = toRaw(v)
      }
      state.structure = structuredClone(struct)
    }

    state.skel = { ...skeldata, ...formvalues }
    // Keep the state as it came in: `state.skel` is the working copy and
    // changes while typing. resetForm() restores from this without
    // reloading ("discard changes").
    // markRaw: read-only data, no reactive proxy.
    state.pristine = markRaw(rawCopy(state.skel))

    state.categories = updateCategories()
  }

  /**
   * Discard changes: restore the values of the last server state,
   * WITHOUT a new request (that's what reload() is for). Structure and categories remain.
   */
  function resetForm() {
    if (state.pristine === undefined || state.pristine === null) return
    initForm(rawCopy(state.pristine), undefined, state.values)
    state.errors = []
  }

  return {
    fetchData,
    sendData,
    loadStep,
    resetForm,
    back,
    buildRequestUrl: () => {
      const requestSpec = buildRequestSpec()
      return `/${requestSpec.renderer}/${requestSpec.controller.join("/")}/${requestSpec.endpoint}`
    },
    updateCategories,
    updateSkel,
    normalizeStructure,
    initForm,
    logics,
    reload,
  }
}
