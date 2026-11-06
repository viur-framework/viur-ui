import { defineConfig } from "histoire"
import { HstVue } from "@histoire/plugin-vue"
import vue from "@vitejs/plugin-vue"
import path from "path"
import { fileURLToPath } from "url"
import { existsSync } from "fs"
import { parse } from "vue-docgen-api"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const vueDocgenPlugin = {
  name: "vue-docgen",
  enforce: "post",
  async transform(code, id) {
    if (!id.endsWith(".vue") || id.includes("node_modules")) return
    try {
      const meta = await parse(id)
      return { code: code + `\n_sfc_main.__docgenInfo = ${JSON.stringify(meta)}`, map: null }
    } catch {
      return null
    }
  },
}

function generateDocs(meta) {
  const lines = []

  lines.push(`# ${meta.displayName || "Component"}`)
  if (meta.description) {
    lines.push("", meta.description)
  }

  const cssClasses = meta.tags?.cssClass
  if (cssClasses?.length) {
    lines.push("", "## CSS-Klassen", "", "| Klasse | Beschreibung |", "|---|---|")
    for (const { description } of cssClasses) {
      if (!description) continue
      const sep = description.indexOf(" - ")
      if (sep !== -1) {
        lines.push(`| \`${description.slice(0, sep)}\` | ${description.slice(sep + 3)} |`)
      } else {
        lines.push(`| \`${description}\` | |`)
      }
    }
  }

  const cell = (s) =>
    String(s || "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ")

  if (meta.props?.length) {
    lines.push("", "## Props", "", "| Prop | Typ | Beschreibung |", "|---|---|---|")
    for (const prop of meta.props) {
      const type = cell(prop.type?.name || "-")
      const desc = cell(prop.description)
      lines.push(`| \`${prop.name}\` | \`${type}\` | ${desc} |`)
    }
  }

  if (meta.events?.length) {
    lines.push("", "## Events", "", "| Event | Beschreibung |", "|---|---|")
    for (const event of meta.events) {
      lines.push(`| \`${event.name}\` | ${cell(event.description)} |`)
    }
  }

  return lines.join("\n")
}

const vueDocgenDocsPlugin = {
  name: "vue-docgen-docs",
  enforce: "pre",
  async transform(code, id) {
    if (!id.endsWith(".story.vue") || id.includes("node_modules")) return null
    if (code.includes("<docs")) return null

    const storyName = path.basename(id, ".story.vue")
    const boneName = storyName.charAt(0).toLowerCase() + storyName.slice(1) + ".vue"
    const bonePath = path.resolve(__dirname, "src/forms/bones/widgets", boneName)
    if (!existsSync(bonePath)) return null

    this.addWatchFile(bonePath)

    try {
      const meta = await parse(bonePath)
      const docs = generateDocs(meta)
      return { code: code + `\n<docs lang="md">\n${docs}\n</docs>`, map: null }
    } catch {
      return null
    }
  },
}

export default defineConfig({
  plugins: [HstVue()],
  setupFile: "./stories/setup.js",
  storyMatch: ["stories/bones/**/*.story.vue"],
  vite: {
    publicDir: "stories/public",
    plugins: [
      vueDocgenDocsPlugin,
      vueDocgenPlugin,
      {
        name: "histoire-mock-request",
        enforce: "pre",
        resolveId(id) {
          if (/\/request\/index\.js$/.test(id)) {
            return path.resolve(__dirname, "stories/mocks/request.js")
          }
        },
      },
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
        {
          find: "@ckeditor/ckeditor5-vue",
          replacement: path.resolve(__dirname, "example/node_modules/@ckeditor/ckeditor5-vue"),
        },
        // Subpaths go through ckeditor5's `exports` map ("./*" -> "./dist/*"), which a plain directory alias bypasses
        { find: /^ckeditor5\/(.*)$/, replacement: path.resolve(__dirname, "example/node_modules/ckeditor5/dist/$1") },
        { find: "ckeditor5", replacement: path.resolve(__dirname, "example/node_modules/ckeditor5") },
        { find: "codemirror", replacement: path.resolve(__dirname, "example/node_modules/codemirror") },
        {
          find: "@codemirror/language-data",
          replacement: path.resolve(__dirname, "example/node_modules/@codemirror/language-data"),
        },
        // codeBone imports these directly; pnpm does not hoist codemirror's own deps
        ...["commands", "language", "state", "view"].map((name) => ({
          find: new RegExp(`^@codemirror/${name}$`),
          replacement: path.resolve(__dirname, `example/node_modules/@codemirror/${name}`),
        })),
        { find: "@viur/webawesome", replacement: path.resolve(__dirname, "example/node_modules/@viur/webawesome") },
        { find: "logics-js", replacement: path.resolve(__dirname, "example/node_modules/logics-js") },
      ],
      dedupe: [
        "vue",
        "pinia",
        "vue-i18n",
        "@vueuse/core",
        "vue-draggable-plus",
        "codemirror",
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@codemirror/language-data",
        "ckeditor5",
        "@ckeditor/ckeditor5-vue",
      ],
    },
    optimizeDeps: {
      exclude: [],
    },
  },
})
