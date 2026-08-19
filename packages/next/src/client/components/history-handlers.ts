import type { AppHistoryState } from './router-reducer/router-reducer-types'
import { restore, traverse } from './navigator'

const ACTIVATION_MARKER = '__PRIVATE_NEXTJS_INTERNALS_HISTORY_ACTIVATION'

type HistoryBootstrapBridge = {
  activationHref: string
  originalPushState: typeof window.history.pushState
  originalReplaceState: typeof window.history.replaceState
  observation: {
    state: PopStateEvent['state']
    href: string
  } | null
}

declare global {
  interface Window {
    __next_h?: HistoryBootstrapBridge
  }
}

// Entries pushed before hydration can only refer to the initial router tree by
// the activation marker installed by the bootstrap script. Keep that mapping
// after the bridge is removed so those entries remain traversable.
let activationHistoryState: AppHistoryState | null = null
let ownsHistory = false

export function getHistoryActivationUrl(): URL {
  const activationUrl = new URL(
    window.__next_h?.activationHref ?? window.location.href
  )
  if (isActivationRoute(activationUrl)) {
    activationUrl.hash = window.location.hash
  }
  return activationUrl
}

export function getAppHistoryState(
  state: PopStateEvent['state']
): AppHistoryState | null {
  if (state?.__NA === true && state.__PRIVATE_NEXTJS_INTERNALS_TREE) {
    return state.__PRIVATE_NEXTJS_INTERNALS_TREE
  }
  if (state?.[ACTIVATION_MARKER] === true) {
    return activationHistoryState
  }
  return null
}

function isActivationRoute(activationUrl: URL): boolean {
  const currentUrl = new URL(window.location.href)
  return (
    activationUrl.origin === currentUrl.origin &&
    activationUrl.pathname === currentUrl.pathname &&
    activationUrl.search === currentUrl.search
  )
}

export function initializeHistoryBridge(
  initialHistoryState: AppHistoryState
): 'hydrate' | 'reload' {
  const bridge = window.__next_h
  if (bridge === undefined) {
    return 'hydrate'
  }

  activationHistoryState = initialHistoryState
  if (window.history.state?.[ACTIVATION_MARKER] === true) {
    if (isActivationRoute(new URL(bridge.activationHref))) {
      bridge.observation = {
        state: window.history.state,
        href: window.location.href,
      }
    }
    return 'hydrate'
  }

  const historyState = getAppHistoryState(window.history.state)
  if (historyState === null) {
    if (isActivationRoute(new URL(bridge.activationHref))) {
      bridge.observation = {
        state: window.history.state,
        href: window.location.href,
      }
      return 'hydrate'
    }
    return 'reload'
  }

  return 'hydrate'
}

function copyNextJsInternalHistoryState(data: any) {
  if (data == null) data = {}
  const currentState = window.history.state
  if (currentState?.__NA) {
    data.__NA = currentState.__NA
    data.__PRIVATE_NEXTJS_INTERNALS_TREE =
      currentState.__PRIVATE_NEXTJS_INTERNALS_TREE
  }
  return data
}

function hasUnobservedHistoryChange(): boolean {
  const bridge = window.__next_h
  return (
    bridge !== undefined &&
    (bridge.observation === null ||
      bridge.observation.state !== window.history.state ||
      bridge.observation.href !== window.location.href)
  )
}

export function writeHistory(
  method: 'pushState' | 'replaceState',
  data: any,
  url: string | URL | null
): void {
  const bridge = window.__next_h
  // The initial insertion effect must not overwrite an entry that startup did
  // not observe. The Router effect will restore that entry when it takes over.
  if (hasUnobservedHistoryChange()) {
    return
  }
  if (data?.__NA === true) {
    delete data[ACTIVATION_MARKER]
  }
  const write =
    bridge === undefined
      ? window.history[method]
      : method === 'pushState'
        ? bridge.originalPushState
        : bridge.originalReplaceState
  write.call(window.history, data, '', url)
  if (bridge !== undefined) {
    bridge.observation = {
      state: window.history.state,
      href: window.location.href,
    }
  }
}

type HistoryHandoff =
  | { kind: 'unchanged' }
  | { kind: 'restore'; historyState: AppHistoryState }
  | { kind: 'reload' }

export function takeHistoryOwnership(): HistoryHandoff {
  if (ownsHistory) return { kind: 'unchanged' }
  ownsHistory = true

  const bridge = window.__next_h
  const historyChanged = hasUnobservedHistoryChange()
  const historyState = historyChanged
    ? getAppHistoryState(window.history.state)
    : undefined
  const originalPushState = (
    bridge?.originalPushState ?? window.history.pushState
  ).bind(window.history)
  const originalReplaceState = (
    bridge?.originalReplaceState ?? window.history.replaceState
  ).bind(window.history)

  if (historyState !== undefined && historyState !== null) {
    const currentState = { ...window.history.state }
    delete currentState[ACTIVATION_MARKER]
    originalReplaceState(
      {
        ...currentState,
        __NA: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: historyState,
      },
      '',
      window.location.href
    )
  }

  delete window.__next_h

  const applyUrlFromHistoryPushReplace = (
    url: string | URL | null | undefined
  ) => {
    const href = window.location.href
    restore(
      new URL(url ?? href, href),
      window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE
    )
  }

  window.history.pushState = function pushState(
    data: any,
    _unused: string,
    url?: string | URL | null
  ): void {
    if (data?.__NA || data?._N) {
      return originalPushState(data, _unused, url)
    }

    data = copyNextJsInternalHistoryState(data)
    if (url) applyUrlFromHistoryPushReplace(url)
    return originalPushState(data, _unused, url)
  }

  window.history.replaceState = function replaceState(
    data: any,
    _unused: string,
    url?: string | URL | null
  ): void {
    if (data?.__NA || data?._N) {
      return originalReplaceState(data, _unused, url)
    }

    data = copyNextJsInternalHistoryState(data)
    if (url) applyUrlFromHistoryPushReplace(url)
    return originalReplaceState(data, _unused, url)
  }

  const onPopState = (event: PopStateEvent) => {
    if (!event.state) return

    const appHistoryState = getAppHistoryState(event.state)
    if (appHistoryState === null) {
      window.location.reload()
    } else {
      traverse(window.location.href, appHistoryState)
    }
  }
  window.addEventListener('popstate', onPopState)

  if (historyState === null) return { kind: 'reload' }
  if (historyState === undefined) return { kind: 'unchanged' }
  return { kind: 'restore', historyState }
}
