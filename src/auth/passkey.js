// The WebAuthn ceremony of a passkey in the browser: viur-core sends the options
// of navigator.credentials.get() as JSON (binary values base64url-encoded) and
// takes the response back as JSON in `credential`, like its ceremony page.

function toBuffer(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64 + "===".slice((base64.length + 3) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer
}

function toBase64url(buffer) {
  const binary = String.fromCharCode(...new Uint8Array(buffer))
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** True if this browser can run a passkey ceremony. */
export function supportsPasskeys() {
  return !!window.PublicKeyCredential && !!navigator.credentials
}

/** The options of the server as `publicKey` of navigator.credentials.get(). */
export function requestOptions(options) {
  const publicKey = { ...options, challenge: toBuffer(options.challenge) }
  // without allowCredentials (the login): any discoverable passkey of this site
  if (options.allowCredentials) {
    publicKey.allowCredentials = options.allowCredentials.map((descriptor) => ({
      ...descriptor,
      id: toBuffer(descriptor.id),
    }))
  }
  return publicKey
}

/** The response of navigator.credentials.get() as the JSON the server verifies. */
export function serializeAssertion(credential) {
  const response = credential.response
  const result = {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      authenticatorData: toBase64url(response.authenticatorData),
      signature: toBase64url(response.signature),
    },
  }
  if (credential.authenticatorAttachment) result.authenticatorAttachment = credential.authenticatorAttachment
  if (response.userHandle) result.response.userHandle = toBase64url(response.userHandle)
  return JSON.stringify(result)
}

/** Runs the assertion for the options of the server; resolves with `credential` for the server. */
export async function getAssertion(options) {
  try {
    return serializeAssertion(await navigator.credentials.get({ publicKey: requestOptions(options) }))
  } catch (error) {
    // cancelled, timed out or no passkey for this site: the caller tells the user
    throw error
  }
}

/** True if the options of the server create a new passkey (registration) rather than sign in with one. */
export function isCreation(options) {
  return !!options?.user && !!options?.pubKeyCredParams
}

/** The options of the server as `publicKey` of navigator.credentials.create(). */
export function creationOptions(options) {
  return {
    ...options,
    challenge: toBuffer(options.challenge),
    user: { ...options.user, id: toBuffer(options.user.id) },
    excludeCredentials: (options.excludeCredentials ?? []).map((descriptor) => ({
      ...descriptor,
      id: toBuffer(descriptor.id),
    })),
  }
}

/** The response of navigator.credentials.create() as the JSON the server verifies. */
export function serializeAttestation(credential) {
  const response = credential.response
  const result = {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      attestationObject: toBase64url(response.attestationObject),
    },
  }
  if (credential.authenticatorAttachment) result.authenticatorAttachment = credential.authenticatorAttachment
  if (response.getTransports) result.response.transports = response.getTransports()
  return JSON.stringify(result)
}

/** Creates a passkey for the options of the server; resolves with `credential` for the server. */
export async function createPasskey(options) {
  try {
    return serializeAttestation(await navigator.credentials.create({ publicKey: creationOptions(options) }))
  } catch (error) {
    // cancelled, timed out or the passkey exists already: the caller tells the user
    throw error
  }
}
