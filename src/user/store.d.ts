/**
 * Values of the UserSkel as the backend delivers them. Only the fields the
 * store itself relies on are named — the rest stays open because the skel
 * is extended per project.
 */
export interface UserSkelValues {
  key?: string
  name?: string
  firstname?: string
  lastname?: string
  access?: string[]
  status?: number | string
  [field: string]: unknown
}

export type UserStatus = "unknown" | "loading" | "authenticated" | "anonymous"

export interface UserStoreState {
  /** Logged-in user or null. */
  user: UserSkelValues | null
  status: UserStatus
  /** Renderer for the requests (default: VITE_DEFAULT_RENDERER or "json"). */
  renderer: string
  googleClientId: string | null
  /**
   * Endpoint below `user` that `loginWithGoogle` posts the token to:
   * "auth_googleaccount/login" (viur-core 3.9, default) or "google/one_tap" (viur-core 4).
   */
  googleLoginEndpoint: string
}

/**
 * The store as returned by `useUserStore()`. The getters appear as values
 * because Pinia unwraps the refs of a setup store on the store object.
 */
export interface UserStore {
  state: UserStoreState
  isLoggedIn: boolean
  /** Access rights of the user (empty if nobody is logged in). */
  access: string[]
  isRoot: boolean
  isAdmin: boolean
  /** Root always counts as authorized. */
  hasAccess: (right: string) => boolean
  /** Short form of the name for UIs, "-" without a user. */
  shortName: string
  configure: (options?: { renderer?: string; googleClientId?: string | null; googleLoginEndpoint?: string }) => void
  /** Load the session. Yields null if nobody is logged in (401). */
  fetchSelf: () => Promise<UserSkelValues | null>
  logout: () => Promise<void>
  reset: () => void
  /**
   * Classic chain (viur-core 3.9): render a step via GET — an endpoint
   * below `user` (default "login") or a server URL. Returns the
   * normalized response; throws on a transport error.
   */
  loadLoginStep: (target?: string) => Promise<Record<string, any>>
  /** Choose a primary provider without a widget of its own; `next_url` is its first step. */
  selectAuthenticationProvider: (provider: string) => Promise<Record<string, any>>
  /** Log in with a Google identity token; returns the normalized response. */
  loginWithGoogle: (token: string) => Promise<Record<string, any> | null>
}

export declare function useUserStore(): UserStore
