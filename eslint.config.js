import pluginVue from "eslint-plugin-vue"
import eslintConfigPrettier from "eslint-config-prettier"
import eslintPluginPrettier from "eslint-plugin-prettier"
import globals from "globals"

export default [
  {
    ignores: [
      "sources/dt4/public/pdfjs/*",
      "viur-cloudfunctions/*",
      "sources/packages/*",
      ".venv/*",
      "deploy/*",
      "sources/old_dt4/*",
      "sources/viur-scriptor/*",
      "sources/vi-admin/*",
    ],
  },
  // Vue plugin configurations (must come first)
  ...pluginVue.configs["flat/recommended"], // Use essential instead of recommended to avoid formatting rules
  // Main configuration
  {
    // Language options with global variables
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },

    // Plugins
    plugins: {
      prettier: eslintPluginPrettier,
    },

    // Rules
    rules: {
      // Prettier integration - now uses .prettierrc
      "prettier/prettier": "warn",

      // General rules
      "no-unused-vars": "off",

      // Vue specific rules
      "vue/order-in-components": "warn",
      "vue/no-deprecated-slot-attribute": "off",
      "vue/multi-word-component-names": "warn",
      "vue/component-definition-name-casing": "off",
      "vue/attributes-order": "warn",
      "vue/multiline-html-element-content-newline": "warn",
      "vue/html-self-closing": "warn",
      "vue/no-side-effects-in-computed-properties": "warn",
      "vue/max-attributes-per-line": [
        "warn",
        {
          singleline: {
            max: 3,
          },
          multiline: {
            max: 1,
          },
        },
      ],
      "no-restricted-syntax": [
        "error",

        {
          selector:
            "AwaitExpression" +
            ":not(TryStatement AwaitExpression)" +
            ":not(ReturnStatement > AwaitExpression)" +
            ":not([argument.type='CallExpression']" +
            "[argument.callee.type='MemberExpression']" +
            "[argument.callee.property.name='catch'])" +
            ":not(CallExpression[callee.type='MemberExpression'][callee.property.name='catch'] " +
            "CallExpression[callee.type='MemberExpression'][callee.property.name='then'] " +
            "AwaitExpression)",
          message:
            "await must be inside a try/catch block, unless it is returned (return await ...), the awaited expression handles errors inline (await promise.catch(...)), or it is inside a .then(...) that is followed by .catch(...).",
        },

        // Updated: require .catch after .then ONLY when the .then is not inside a try/catch
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='then']" +
            // allow: .then(...) when it is inside a try/catch (errors handled by outer try/catch)
            ":not(TryStatement CallExpression[callee.type='MemberExpression'][callee.property.name='then'])" +
            // otherwise, require a .catch(...) in the same chain
            ":not(CallExpression[callee.type='MemberExpression'][callee.property.name='catch'] " +
            "CallExpression[callee.type='MemberExpression'][callee.property.name='then'])",
          message:
            "Any promise chain using .then(...) must include a .catch(...) in the same chain unless it is inside a try/catch block.",
        },
      ],
    },
  },

  // Prettier config to disable conflicting rules (must come last)
  eslintConfigPrettier,
]
