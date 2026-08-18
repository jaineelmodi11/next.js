import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('atomic-dev-route-snapshot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      NEXT_TEST_DEV_ROUTE_SCAN_DELAY_MS: '2000',
    },
  })

  beforeAll(async () => {
    await next.start()
  })

  it('keeps serving the committed routes while discovering a new route', async () => {
    try {
      const initialResponse = await next.fetch('/committed/initial')
      expect(initialResponse.status).toBe(200)
      await initialResponse.arrayBuffer()

      let requestId = 0
      const requestCommittedRoute = async () => {
        try {
          const response = await next.fetch(`/committed/${requestId++}`, {
            signal: AbortSignal.timeout(2_000),
          })
          await response.arrayBuffer()
          return response.status
        } catch {
          // A request getting stranded across generations is also a violation.
          return 0
        }
      }
      await next.patchFile(
        'app/icon.tsx',
        `import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(<div style={{ background: 'black' }}>N</div>)
}`
      )
      await next.patchFile(
        'app/added/route.ts',
        `export function GET() { return new Response('added') }`
      )

      await retry(async () => {
        expect(next.cliOutput).toContain('[next-test] dev route scan 1 paused')
      }, 15_000)

      const statuses = await Promise.all(
        Array.from({ length: 20 }, requestCommittedRoute)
      )
      expect(new Set(statuses)).toEqual(new Set([200]))

      await retry(async () => {
        const response = await next.fetch('/added')
        const status = response.status
        await response.arrayBuffer()
        expect(status).toBe(200)
      }, 15_000)
    } finally {
      await next.stop('SIGTERM')
    }
  })
})
