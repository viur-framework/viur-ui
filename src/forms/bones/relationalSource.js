import { useDebounceFn } from "@vueuse/core"
import { useListFetch } from "../../request/index.js"

/**
 * `source` for the relational selection widgets (e.g. `<wa-combobox :source>`).
 *
 * Fetches one page (ViUR maximum 99). The search text becomes a server-side
 * prefix filter on the first bone of the bone's `format`
 * (`$(dest.name)` -> `name$lk`, ViUR's StringBone prefix match — no fulltext
 * adapter needed). Without such a bone the search is not applied.
 * The combobox calls `source` on every keystroke: requests are debounced, and
 * a superseded call (cancelled by the debounce or answered late) resolves with
 * the newest result, so it can't overwrite it.
 *
 * @param {object} boneState - Injected bone state (`bonestructure.type/module/format`)
 * @param {Function} formatString - Injected formatter
 * @returns {(search?: string) => Promise<{ text: string, value: string, data: object }[]>}
 *   `text` is HTML-escaped (wa-combobox renders it as HTML); `data` is the raw skeleton.
 */
/** Text as HTML: wa-combobox renders suggestion texts with `unsafeHTML`. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function useRelationalSource(boneState, formatString) {
  let latest = null

  async function fetchItems(search) {
    const { type, module, format } = boneState.bonestructure
    const params = { limit: 99 }
    if (type.startsWith("relational.tree.leaf")) params.skelType = "leaf"
    else if (type.startsWith("relational.tree.node")) params.skelType = "node"
    // ponytail: only the first bone of the format is searched, e.g. not the lastname in "$(dest.firstname) $(dest.lastname)"
    const searchBone = /\$\(dest\.(\w+)/.exec(format ?? "")?.[1]
    if (search && searchBone) params[`${searchBone}$lk`] = search

    const listFetch = useListFetch(module, {
      immediate: false,
      params,
      renderer: import.meta.env.VITE_DEFAULT_RENDERER || "vi",
    })
    try {
      await listFetch.execute()
    } catch (error) {
      throw error // the widget decides how to show it
    }
    return listFetch.data.value.map((skel) => ({
      // formatString unescapes the values viur-core stores escaped, and wa-combobox
      // puts `text` in as HTML: escape it again, or an entry named
      // `<img onerror=…>` runs as markup in the suggestions (stored XSS).
      text: escapeHtml(formatString(format, { dest: skel })),
      value: skel.key,
      data: skel,
    }))
  }

  const debouncedFetch = useDebounceFn(fetchItems, 300)

  return async function getList(search = "") {
    // A call cancelled by the debounce resolves with undefined — `latest` covers it.
    const request = debouncedFetch(search.trim())
    latest = request
    try {
      await request
    } catch (error) {
      if (request === latest) throw error
    }
    return latest
  }
}
