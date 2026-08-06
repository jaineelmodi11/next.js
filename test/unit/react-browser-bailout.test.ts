import { createRenderInBrowserAbortSignal } from 'next/dist/server/app-render/stream-ops'
import { isBailoutToCSRError } from 'next/dist/shared/lib/lazy-dynamic/bailout-to-csr'

describe('createRenderInBrowserAbortSignal', () => {
  it.each([
    {
      name: 'uses the legacy CSR bailout by default',
      reactBrowserBailout: false,
      isLegacyBailout: true,
      isReactRecoverable: false,
    },
    {
      name: 'uses the React browser recoverable when enabled',
      reactBrowserBailout: true,
      isLegacyBailout: false,
      isReactRecoverable: true,
    },
  ])(
    '$name',
    ({ reactBrowserBailout, isLegacyBailout, isReactRecoverable }) => {
      const signal = createRenderInBrowserAbortSignal(reactBrowserBailout)

      expect(signal.aborted).toBe(true)
      expect(isBailoutToCSRError(signal.reason)).toBe(isLegacyBailout)
      expect(
        Reflect.get(signal.reason, '$$typeof') ===
          Symbol.for('react.recoverable')
      ).toBe(isReactRecoverable)
      if (isReactRecoverable) {
        expect(Reflect.get(signal.reason, '_reason')).toBe('Render in Browser')
      }
    }
  )
})
