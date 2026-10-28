import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import { Storage } from "happy-dom"

// Provide fake IndexedDB for all tests
globalThis.indexedDB = new IDBFactory()
globalThis.IDBKeyRange = IDBKeyRange

// Newer Node versions (seen with 26) define their own global localStorage and
// sessionStorage. Without --localstorage-file they are undefined and hide the
// ones of happy-dom.
for (const name of ["localStorage", "sessionStorage"]) {
  if (!globalThis[name]) {
    Object.defineProperty(globalThis, name, { value: new Storage(), configurable: true, writable: true })
  }
}
