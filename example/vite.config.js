import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "path"

const fromExampleNodeModules = (pkg) => path.resolve(import.meta.dirname, "node_modules", pkg)

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith("wa-"),
        },
      },
    }),
  ],
  resolve: {
    alias: [
      // Subpaths go through ckeditor5's `exports` map ("./*" -> "./dist/*"), which a plain directory alias bypasses
      { find: /^ckeditor5\/(.*)$/, replacement: fromExampleNodeModules("ckeditor5/dist/$1") },
      ...Object.entries({
        vue: fromExampleNodeModules("vue"),
        pinia: fromExampleNodeModules("pinia"),
        "vue-i18n": fromExampleNodeModules("vue-i18n"),
        "@vueuse/core": fromExampleNodeModules("@vueuse/core"),
        "vue-draggable-plus": fromExampleNodeModules("vue-draggable-plus"),
        "logics-js": fromExampleNodeModules("logics-js"),
        "@ckeditor/ckeditor5-vue": fromExampleNodeModules("@ckeditor/ckeditor5-vue"),
        "@viur/webawesome": fromExampleNodeModules("@viur/webawesome"),
        ckeditor5: fromExampleNodeModules("ckeditor5"),
        codemirror: fromExampleNodeModules("codemirror"),
        "@codemirror/language-data": fromExampleNodeModules("@codemirror/language-data"),
      }).map(([find, replacement]) => ({ find, replacement })),
    ],
    dedupe: ["vue", "pinia", "vue-i18n", "@vueuse/core"],
  },
  optimizeDeps: {
    exclude: ["viur-ui"],
  },
})
