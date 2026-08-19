import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

describe('history changes before hydration', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function stallScripts(page: Playwright.Page) {
    let stalling = true
    const stalled: Array<() => void> = []
    await page.route('**/_next/static/**', async (route) => {
      if (stalling && route.request().resourceType() === 'script') {
        await new Promise<void>((resolve) => stalled.push(resolve))
      }
      await route.continue()
    })
    return function releaseScripts() {
      stalling = false
      for (const release of stalled) release()
    }
  }

  function waitForSelector(
    browser: Awaited<ReturnType<typeof next.browser>>,
    selector: string
  ) {
    return browser.elementByCss(selector, {
      waitUntil: false,
      timeout: 10_000,
    })
  }

  function readRouterPathname(
    browser: Awaited<ReturnType<typeof next.browser>>
  ): Promise<string> {
    return browser.eval(
      'document.getElementById("router-pathname")?.textContent ?? ""'
    )
  }

  function readRouterSearch(
    browser: Awaited<ReturnType<typeof next.browser>>
  ): Promise<string> {
    return browser.eval(
      'document.getElementById("router-search")?.textContent ?? ""'
    )
  }

  async function loadWithHydrationBlocked(path: string, readySelector: string) {
    let page: Playwright.Page
    let releaseScripts: () => void
    const browser = await next.browser(path, {
      waitUntil: 'commit',
      waitHydration: false,
      async beforePageLoad(currentPage: Playwright.Page) {
        page = currentPage
        releaseScripts = await stallScripts(currentPage)
      },
    })
    await page.waitForSelector(readySelector)
    await page.evaluate('window.__documentMarker = Math.random()')
    const documentMarker = await page.evaluate('window.__documentMarker')
    return { browser, page, releaseScripts, documentMarker }
  }

  async function navigateThenReloadWithHydrationBlocked(
    startPath: string,
    linkId: string,
    destinationSelector: string
  ) {
    let page: Playwright.Page
    const browser = await next.browser(startPath, {
      beforePageLoad(currentPage: Playwright.Page) {
        page = currentPage
      },
    })
    await browser.elementById(linkId).click()
    await waitForSelector(browser, destinationSelector)
    const releaseScripts = await stallScripts(page)
    await browser.refresh({ waitUntil: 'commit' })
    await page.evaluate('window.__documentMarker = Math.random()')
    const documentMarker = await page.evaluate('window.__documentMarker')
    return { browser, page, releaseScripts, documentMarker }
  }

  it('restores the tree stored on an entry traversed to before hydration', async () => {
    const { browser, page, releaseScripts, documentMarker } =
      await navigateThenReloadWithHydrationBlocked('/', 'to-post', '#post')
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await browser.back({ waitUntil: 'commit' })
    expect(new URL(await browser.url()).pathname).toBe('/')
    releaseScripts()
    await waitForSelector(browser, '#home')
    expect(await browser.eval('window.__documentMarker')).toBe(documentMarker)
    expect(pageErrors).toEqual([])
  })

  it('hydrates the activation entry on an ordinary reload', async () => {
    const { browser, page, releaseScripts, documentMarker } =
      await navigateThenReloadWithHydrationBlocked('/', 'to-post', '#post')
    await page.evaluate(
      'document.getElementById("post").__serverElementMarker = Math.random()'
    )
    const serverElementMarker = await page.evaluate(
      'document.getElementById("post").__serverElementMarker'
    )
    releaseScripts()
    await retry(async () => {
      expect(await readRouterPathname(browser)).toBe('/post')
      expect(await browser.eval('typeof window.__next_h')).toBe('undefined')
    })
    expect(await browser.eval('window.__documentMarker')).toBe(documentMarker)
    expect(
      await browser.eval(
        'document.getElementById("post").__serverElementMarker'
      )
    ).toBe(serverElementMarker)
    expect(
      await browser.eval(
        'window.history.state.__PRIVATE_NEXTJS_INTERNALS_HISTORY_ACTIVATION'
      )
    ).toBeUndefined()
    expect(await browser.eval('window.history.state.__NA')).toBe(true)
  })

  it('restores rendered search state stored on the traversed entry', async () => {
    const { browser, releaseScripts } =
      await navigateThenReloadWithHydrationBlocked(
        '/search?page=1',
        'to-page-2',
        '#page-2'
      )
    await browser.back({ waitUntil: 'commit' })
    expect(new URL(await browser.url()).search).toBe('?page=1')
    releaseScripts()
    await waitForSelector(browser, '#page-1')
    await browser.forward()
    await waitForSelector(browser, '#page-2')
  })

  it('keeps the document activation entry recognizable and restorable', async () => {
    const { browser, page, releaseScripts, documentMarker } =
      await loadWithHydrationBlocked('/post', '#post')
    await page.evaluate(() => {
      window.history.pushState({}, '', '/post?early=push')
      setTimeout(() => window.history.back(), 0)
    })
    await retry(async () => {
      expect(new URL(page.url()).search).toBe('')
    })
    releaseScripts()
    await retry(async () => {
      expect(await readRouterPathname(browser)).toBe('/post')
    })
    expect(await browser.eval('window.__documentMarker')).toBe(documentMarker)
    const hydratedDocumentMarker = await browser.eval(
      'window.__documentMarker = Math.random()'
    )
    await browser.forward()
    await retry(async () => {
      expect(await readRouterSearch(browser)).toBe('early=push')
    })
    expect(await browser.eval('window.__documentMarker')).toBe(
      hydratedDocumentMarker
    )
    await browser.back()
    await retry(async () => {
      expect(await readRouterSearch(browser)).toBe('')
    })
    expect(await browser.eval('window.__documentMarker')).toBe(
      hydratedDocumentMarker
    )
  })

  it('records writes before external scripts run and hands ownership to the router', async () => {
    const { browser, page, releaseScripts } = await loadWithHydrationBlocked(
      '/post',
      '#post'
    )
    expect(await page.evaluate('typeof window.__next_h')).toBe('object')
    await page.evaluate(() => {
      window.history.pushState(
        { thirdParty: 'preserved' },
        '',
        '/post?before=external-scripts'
      )
    })
    releaseScripts()
    await retry(async () => {
      expect(await readRouterSearch(browser)).toBe('before=external-scripts')
      expect(await browser.eval('typeof window.__next_h')).toBe('undefined')
    })
    expect(await browser.eval('window.history.state.thirdParty')).toBe(
      'preserved'
    )
    expect(await browser.eval('window.history.state.__NA')).toBe(true)
  })

  describe.each([
    { method: 'pushState' as const, search: '?after=back-push' },
    { method: 'replaceState' as const, search: '?after=back-replace' },
  ])('$method after an early traversal', ({ method, search }) => {
    it('inherits the tree from the traversed-to entry', async () => {
      const { browser, page, releaseScripts, documentMarker } =
        await navigateThenReloadWithHydrationBlocked('/', 'to-post', '#post')
      await browser.back({ waitUntil: 'commit' })
      await page.evaluate(
        ({ method, search }) => {
          window.history[method]({ thirdParty: 'preserved' }, '', `/${search}`)
        },
        { method, search }
      )
      releaseScripts()
      await waitForSelector(browser, '#home')
      await retry(async () => {
        expect(await readRouterSearch(browser)).toBe(search.slice(1))
      })
      await browser.elementById('to-post').click()
      await waitForSelector(browser, '#post')
      await browser.back()
      await waitForSelector(browser, '#home')
      expect(new URL(await browser.url()).search).toBe(search)
      expect(await browser.eval('window.__documentMarker')).toBe(documentMarker)
    })
  })

  it('treats a fragment traversal as the same rendered route', async () => {
    const { browser, page, releaseScripts, documentMarker } =
      await loadWithHydrationBlocked('/post', '#post')
    await page.click('#hash-link')
    expect(new URL(page.url()).hash).toBe('#section')
    releaseScripts()
    await retry(async () => {
      expect(new URL(await browser.url()).hash).toBe('#section')
      expect(await readRouterPathname(browser)).toBe('/post')
    })
    expect(await browser.eval('window.__documentMarker')).toBe(documentMarker)
    await browser.back()
    await retry(async () => {
      expect(new URL(await browser.url()).hash).toBe('')
      expect(await readRouterPathname(browser)).toBe('/post')
    })
    await browser.forward()
    await retry(async () => {
      expect(new URL(await browser.url()).hash).toBe('#section')
      expect(await readRouterPathname(browser)).toBe('/post')
    })
    expect(await browser.eval('window.__documentMarker')).toBe(documentMarker)
  })

  it('reloads an entry whose router state cannot be restored', async () => {
    const { browser, page, releaseScripts, documentMarker } =
      await loadWithHydrationBlocked('/post', '#post')
    await page.evaluate(() => {
      History.prototype.pushState.call(
        window.history,
        { foreign: true },
        '',
        '/post?foreign=1'
      )
      History.prototype.pushState.call(
        window.history,
        { foreign: true },
        '',
        '/post?foreign=2'
      )
      window.history.back()
    })
    await retry(async () => {
      expect(new URL(page.url()).search).toBe('?foreign=1')
    })
    releaseScripts()
    await retry(async () => {
      expect(await browser.eval('window.__documentMarker')).not.toBe(
        documentMarker
      )
      expect(await readRouterSearch(browser)).toBe('foreign=1')
    })
  })
})
