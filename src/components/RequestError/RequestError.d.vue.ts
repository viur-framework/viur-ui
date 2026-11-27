import type { DefineComponent } from "vue"
import type { HTTPError } from "../../../index"

/** Props of RequestError.vue. */
export interface RequestErrorProps {
  /**
   * The failed request: an HTTPError shows "<status> <title>" and the `descr`
   * of viur-core's error body; any other error (or a string) its message only.
   * Nothing is rendered without an error.
   */
  error?: HTTPError | Error | string | null
}

declare const RequestError: DefineComponent<RequestErrorProps>
export default RequestError
