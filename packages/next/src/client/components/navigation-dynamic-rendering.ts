// Client-safe access to the server-only dynamic-rendering hooks used by the
// navigation hooks. On the server these re-export the real implementations; in
// the browser bundle this module is aliased to
// `./navigation-dynamic-rendering.browser` (see
// scripts/generate-browser-variant-aliases.mjs), which exports `undefined` so
// the server module is not bundled into the client. Callers use optional calls
// (`useDynamicRouteParams?.(...)`), so the browser stub is a no-op.
import React from 'react'
import { browser } from 'react-dom'

import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  ClientHookDynamicError,
  makeClientHookHangingPromise,
} from '../../server/dynamic-rendering-utils'
import { workAsyncStorage } from '../../server/app-render/work-async-storage.external'
import {
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from '../../server/app-render/work-unit-async-storage.external'

export { useDynamicRouteParams } from '../../server/app-render/dynamic-rendering'

export function useDynamicSearchParams(expression: string) {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore) {
    // We assume pages router context and just return
    return
  }

  if (!workUnitStore) {
    throwForMissingRequestStore(expression)
  }

  switch (workUnitStore.type) {
    case 'validation-client':
      // During instant validation we try to behave as close to client as possible,
      // so this shouldn't hang during SSR.
      return
    case 'prerender-client': {
      React.use(
        makeClientHookHangingPromise(
          workUnitStore.renderSignal,
          new ClientHookDynamicError(workStore.route, expression)
        )
      )
      break
    }
    case 'prerender-legacy': {
      if (workStore.forceStatic) {
        return
      }
      if (process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT) {
        // @ts-expect-error TODO: Update @types/react-dom to include the reason argument.
        React.use(browser(expression))
        return
      } else {
        throw new BailoutToCSRError(expression)
      }
    }
    case 'prerender':
    case 'prerender-runtime':
      throw new InvariantError(
        `\`${expression}\` was called from a Server Component. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`
      )
    case 'cache':
    case 'unstable-cache':
    case 'private-cache':
      throw new InvariantError(
        `\`${expression}\` was called inside a cache scope. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`
      )
    case 'generate-static-params':
      throw new InvariantError(
        `\`${expression}\` was called in \`generateStaticParams\`. Next.js should be preventing ${expression} from being included in server component files statically, but did not in this case.`
      )
    case 'request':
      return
    default:
      workUnitStore satisfies never
  }
}
