/**
 * Browser stand-in for Node filesystem and path built-ins pulled in by the
 * vendored loader. Browser boot never calls the filesystem resolver.
 */

/** Fail if browser boot reaches a Node filesystem or path built-in. */
const unavailable = (): never => {
  throw new Error('Node built-ins are not available in the browser')
}

const stub = new Proxy(unavailable, {
  get: () => unavailable,
  apply: () => unavailable(),
})

export default stub
