import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import WebSocket from 'ws'

describe('atomic-dev-route-announcement', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.start()
  })

  it('announces an added route only after it can be served', async () => {
    let socket: WebSocket | undefined
    let responseAtAnnouncement:
      | Promise<{ status: number; body: string }>
      | undefined
    let responseAtRemoval: Promise<{ status: number; body: string }> | undefined
    let announcementError: unknown

    try {
      socket = new WebSocket(`ws://localhost:${next.appPort}/_next/hmr`, {
        origin: next.url,
      })
      await new Promise<void>((resolve, reject) => {
        socket!.once('open', resolve)
        socket!.once('error', reject)
      })
      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          if (
            responseAtAnnouncement === undefined &&
            message.type === 'addedPage' &&
            message.data?.[0] === '/added'
          ) {
            responseAtAnnouncement = next
              .fetch('/added')
              .then(async (response) => ({
                status: response.status,
                body: await response.text(),
              }))
          }
          if (
            responseAtRemoval === undefined &&
            message.type === 'removedPage' &&
            message.data?.[0] === '/added'
          ) {
            responseAtRemoval = next.fetch('/added').then(async (response) => ({
              status: response.status,
              body: await response.text(),
            }))
          }
        } catch (error) {
          announcementError = error
        }
      })

      // Static metadata analysis makes the Watchpack scan observably async,
      // widening otherwise timing-dependent publication gaps.
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
        if (announcementError) throw announcementError
        expect(responseAtAnnouncement).toBeDefined()
      }, 15_000)
      expect(await responseAtAnnouncement).toEqual({
        status: 200,
        body: 'added',
      })

      await next.deleteFile('app/added/route.ts')
      await retry(async () => {
        if (announcementError) throw announcementError
        expect(responseAtRemoval).toBeDefined()
      }, 15_000)
      expect((await responseAtRemoval)?.status).toBe(404)
    } finally {
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        const socketClosed = new Promise<void>((resolve) => {
          socket!.once('close', () => resolve())
        })
        socket.terminate()
        await socketClosed
      }
      await next.stop('SIGTERM')
    }
  })
})
