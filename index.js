// Request
export {
  useListFetch,
  useListFetchAll,
  useViewFetch,
  useAddFetch,
  useEditFetch,
  useDeleteFetch,
  useCloneFetch,
  usePreviewFetch,
  useMoveFetch,
  useListRootNodesFetch,
  useTreeFetch,
  useStructureFetch,
  uploadFile,
  downloadUrlFor,
  serveUrlFor,
  skelDataToFormData,
  normalizeEnvelope,
  normalizeStructure,
  resetState,
  HTTPError,
  createControllerFetch,
  useConfigStore,
  canAccessAdminConfig,
  buildModuleTree,
  flattenModuleTree,
  findModule,
  visibleModuleTree,
  hasModuleAccess,
  handlerType,
  useMessageStore,
  getMessageStore,
  notify,
} from "./src/request/index.js"

// Display of a failed request (status, title, description of viur-core's error body)
export { default as RequestError } from "./src/components/RequestError/RequestError.vue"

// Login of viur-core 4 in a ViForm: the layout (method choice, password form,
// passkey, Google One Tap) and the composable it acts through (see src/auth/)
export { default as LoginLayout } from "./src/auth/LoginLayout.vue"
// one-time codes of second factors: form layout and bone widget (wa-otp-input)
export { default as OtpLayout } from "./src/auth/OtpLayout.vue"
export { default as OtpBone } from "./src/auth/OtpBone.vue"
// passkeys in a ViForm: signing in with one, adding one (passkeys/add)
export { default as PasskeyLayout } from "./src/auth/PasskeyLayout.vue"
export { useLoginMethods } from "./src/auth/useLoginMethods.js"

// Theme (brand color from the configuration)
export { useColorStore, hexToHsl, BRAND_LIGHTNESS } from "./src/theme/colorStore.js"

// Translations (components of this package; merge into the app's vue-i18n instance —
// vue-i18n is required, the components translate with t() without fallbacks)
export { default as deTranslations } from "./src/translations/de.js"
export { default as enTranslations } from "./src/translations/en.js"

// Display of bone values
export { default as boneLogic } from "./src/forms/bones/view/boneLogic.js"

// Safe HTML rendering (DOMPurify): v-safe-html directive + sanitizeHtml()
export { default as safeHtml, sanitizeHtml, vSafeHtml } from "./src/vite/safeHtml.js"

// Map + geocoder for the address widget (record.address), provided by the app
export { setAddressProvider } from "./src/forms/bones/address.js"
