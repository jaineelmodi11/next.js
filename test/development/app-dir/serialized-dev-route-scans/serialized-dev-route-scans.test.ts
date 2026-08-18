import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('serialized-dev-route-scans', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      NEXT_TEST_DEV_ROUTE_FIRST_SCAN_DELAY_MS: '3000',
    },
  })

  beforeAll(async () => {
    await next.start()
  })

  it('publishes overlapping scans in event order', async () => {
    try {
      const committedResponse = await next.fetch('/committed')
      expect(committedResponse.status).toBe(200)
      await committedResponse.arrayBuffer()

      await next.patchFile(
        'app/first/route.ts',
        `export function GET() { return new Response('first') }`
      )

      // The first scan has captured /first when it pauses. The next Watchpack
      // event captures the newer generation containing both added routes.
      await retry(async () => {
        expect(next.cliOutput).toContain('[next-test] dev route scan 1 paused')
      }, 15_000)
      await next.patchFile(
        'app/second/route.ts',
        `export function GET() { return new Response('second') }`
      )

      await retry(async () => {
        expect(next.cliOutput).toContain(
          '[next-test] dev route scan 1 published'
        )
        expect(next.cliOutput).toContain(
          '[next-test] dev route scan 2 published'
        )
      }, 15_000)

      const [firstResponse, secondResponse] = await Promise.all([
        next.fetch('/first'),
        next.fetch('/second'),
      ])
      expect(firstResponse.status).toBe(200)
      expect(secondResponse.status).toBe(200)
      expect(await firstResponse.text()).toBe('first')
      expect(await secondResponse.text()).toBe('second')
    } finally {
      await next.stop('SIGTERM')
    }
  })
})
