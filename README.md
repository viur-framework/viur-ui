# viur-ui

Vue 3 components and request helpers for [ViUR](https://www.viur.dev).

## Install

```bash
npm install viur-ui
```

Peers: `vue` 3.5+, `pinia` 2–4, `vue-i18n`, `@viur/webawesome` 0.20+, `@vueuse/core` 12–14, `vue-router` 4–5; for code/text bones also `codemirror`, `@codemirror/{commands,language,language-data,state,view}`, `ckeditor5`, `@ckeditor/ckeditor5-vue`.

## Vite

```js
import vue from "@vitejs/plugin-vue"

export default {
  plugins: [vue()],
  optimizeDeps: {
    exclude: ["viur-ui"], // ships raw SFCs; pre-bundling duplicates module state in dev
  },
}
```

Env: `VITE_API_URL`, `VITE_DEFAULT_RENDERER` (`json` | `vi`).

## Vitest

```js
test: {
  server: { deps: { inline: ["viur-ui"] } }, // package .js files import .vue — Node can't load those
}
```

## Setup

```js
import "viur-ui/src/webawesomeConfig.js"
import { deTranslations, enTranslations } from "viur-ui"
import { installViurForms } from "viur-ui/src/forms/install.js"

app.use(createPinia())
app.use(i18n)
installViurForms(app) // also registers v-safe-html (DOMPurify) and $sanitizeHtml
```

Translations: merge the package messages before your app's own (app keys win):

```js
i18n.global.mergeLocaleMessage("de", deTranslations)
i18n.global.mergeLocaleMessage("en", enTranslations)
```

`webawesomeConfig.js` loads Web Awesome with its default theme and no external resources. It no longer imports `themes/awesome.css`, which pulls fonts from fonts.bunny.net (third party, needs a CSP entry). An app that wants that theme imports it itself and sets `class="wa-theme-awesome"` on `<html>`; better self-host the fonts.

It also loads Web Awesome's native styles: plain elements of the whole app (`button`, `input`, `select`, headings, …) look the Web Awesome way, on purpose. App styles build on that look rather than assuming browser defaults; e.g. resetting only `background` on a `<button>` leaves its white text and fixed height.

`installViurForms` registers these global names (async), skipping names that are already taken: `ViForm`, `vi-form`, `vi-form-category`, `Bone`, `bone`, `bone-label`, `bone-actions`, `bone-single-entry`, `bone-multiple-list`, `bone-multiple-wrapper`, `bone-nested-wrapper`. The package imports its wrappers locally, so running alongside `@viur/vue-utils` (e.g. a global `Bone` from there) doesn't affect viur-ui forms — but your own templates resolve whichever component owns the name.

### Icons

`@viur/webawesome` ships no icon SVGs; `wa-icon` loads them from `<base>/webawesome/assets/icons/`. viur-ui lists the Font Awesome icons its components use in [`icons.json`](./icons.json). Copy them into your app with the package's `wa-icons` (it only adds files, so it can run after your own `icons.json`):

```bash
npx wa-icons node_modules/viur-ui public/webawesome/assets/icons
```

## Safe HTML (recommended)

Route every `v-html` through DOMPurify at compile time — your templates and viur-ui's, without changes:

```js
import vue from "@vitejs/plugin-vue"
import { sanitizeVHtml } from "viur-ui/src/vite/sanitizeVHtml.js"

export default {
  plugins: [vue({ template: { compilerOptions: { directiveTransforms: { html: sanitizeVHtml } } } })],
}
```

`installViurForms(app)` provides the runtime sanitizer (`window.__sanitizeHtml`); call it before mounting. Without it, rendering throws rather than outputting unsanitized HTML. `v-safe-html` is then redundant.

Not covered: SSR, `innerHTML` in JS, `h("div", { innerHTML })` — use `sanitizeHtml()` there. Don't decode HTML entities before sanitizing.

## ViForm

```vue
<ViForm module="user" action="edit" :skelkey="key" />
```

Props, state and exposed API: [`src/forms/ViForm.d.vue.ts`](./src/forms/ViForm.d.vue.ts).

## API

```js
import { useListFetch, useViewFetch, useEditFetch, useConfigStore, notify } from "viur-ui"
```

Full list: [`index.js`](./index.js), types: [`index.d.ts`](./index.d.ts).

## Development

```bash
pnpm install        # root + example/ (workspace)
pnpm story:dev      # Histoire, :6006
pnpm test:run       # Vitest
pnpm lint
```

## Release

```bash
pnpm version patch && git push --follow-tags
```

Published by [`release.yml`](./.github/workflows/release.yml) via npm Trusted Publishing. `-alpha` / `-beta` / `-rc` → matching dist-tag, else `latest`.
