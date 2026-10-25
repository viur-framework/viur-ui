import type { Component, DefineComponent } from "vue"

/** Props of ViForm.vue (see defineProps there — the common ones here). */
export interface ViFormProps {
  /** Module name or dot path ("user", "shop.order"). */
  module?: string
  /** Action below the module ("add", "edit", "login", "auth_.../login"). */
  action?: string | null
  /** Subtype of grouped lists. */
  group?: string | null
  /** Key of the entry for edit/clone — a singleton doesn't need one. */
  skelkey?: string | null
  /** Tree type ("node" | "leaf"). */
  skeltype?: string | null
  /** Send the skey along (default: true). */
  secure?: boolean
  /**
   * Write feedback to the message store (save successful, login
   * failed, …). Only takes effect if the app has installed Pinia;
   * `false` keeps this form silent. Default: true.
   */
  useMessageStore?: boolean
  /** Ready-made structure/values instead of a request. */
  skel?: Record<string, any> | string | null
  structure?: Record<string, any> | unknown[] | null
  values?: Record<string, any> | null
  /** Show only these bones. */
  bones?: string[]
  /** Additional data for BUILDING the form (e.g. `{ bounce: 1 }`). */
  params?: Record<string, any>
  /** Alternative URL for building the form. */
  fetchUrl?: string | null
  /** Renderer of the requests (default: VITE_DEFAULT_RENDERER). */
  renderer?: string
  /** Pin the protocol version. */
  version?: string | number | null
  useCategories?: boolean
  collapsedCategories?: string[]
  categoryDefaultname?: string
  readonly?: boolean
  /** With `bones`: send only those bones (plus key) instead of every writable bone. */
  sendOnlyShownBones?: boolean
  /**
   * Layout component that places the bones (default: LayoutCategory). It renders
   * its default slot once per bone with `{ boneName, widget, visible?, label? }`.
   */
  layout?: Component
  /** Label position of the bones (default: "normal"). */
  label?: "normal" | "top" | "hide" | "placeholder"
  /** Show bone action bars (required actions always appear). */
  boneactions?: boolean
  /**
   * Form-wide action configuration: entries like `bone.params.actions`
   * (`"-name"` explicitly disables, even required actions). Array = all
   * bones; object = per bone name, `"*"` for all.
   */
  actions?: (string | Record<string, any>)[] | Record<string, (string | Record<string, any>)[]> | null
  /** Run a multi-step flow (login, wizards). */
  multistep?: boolean
  showSteps?: boolean
  submitLabel?: string
  nextLabel?: string
  backLabel?: string
}

/** State of the form as exposed by `state`. */
export interface ViFormState {
  loading: boolean
  failed: unknown
  skel: Record<string, any>
  /** Values of the last server state (basis for resetForm). */
  pristine: Record<string, any> | null
  structure: Record<string, any> | null
  errors: { fieldPath?: string[]; errorMessage?: string; severity?: number }[]
  /** v2 status of the last response: "init" | "success" | "rejected" | … */
  status: string | null
  actionname: string | null
  actionparams: Record<string, any> | null
  step: string | null
  steps: Record<string, any> | null
  postUrl: string | null
  [key: string]: unknown
}

/** What ViForm exposes via defineExpose. */
export interface ViFormApi {
  /** Submit the values (POST to the form's URL). */
  sendData: (
    alternativeUrl?: string | null,
    additionalData?: Record<string, any> | null,
    headers?: Record<string, string> | null,
    removeKeyFromDataset?: boolean
  ) => Promise<unknown>
  /** (Re)fetch the form from the server. */
  fetchData: (
    alternativeUrl?: string | null,
    additionalData?: Record<string, any> | null,
    headers?: Record<string, string> | null
  ) => Promise<unknown>
  /** Render a step of a multi-step flow. */
  loadStep: (url?: string | null) => Promise<unknown>
  /** Submit the current step and advance to the next one if applicable. */
  submitStep: () => Promise<unknown>
  /** Go back one step. */
  back: () => Promise<unknown> | void
  updateSkel: (values: Record<string, any>) => void
  /** Rebuild from scratch — refetches the form from the server. */
  reload: () => void
  /** Discard changes: values of the last server state without a new request. */
  resetForm: () => void
  state: ViFormState
}

declare const ViForm: DefineComponent<ViFormProps, ViFormApi, any>
export default ViForm
