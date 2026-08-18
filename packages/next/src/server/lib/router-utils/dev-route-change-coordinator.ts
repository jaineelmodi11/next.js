export type DevRouteChanges = {
  added: string[]
  removed: string[]
}

export function createDevRouteChangeCoordinator(
  onChanges: (changes: DevRouteChanges) => void
) {
  let watchpackRoutes: Set<string> | undefined
  let bundlerRoutes: Set<string> | undefined
  let announcedRoutes: Set<string> | undefined

  const reconcile = () => {
    if (!watchpackRoutes || !bundlerRoutes) return

    const committedBundlerRoutes = bundlerRoutes
    const readyRoutes = new Set(
      [...watchpackRoutes].filter((route) => committedBundlerRoutes.has(route))
    )
    if (!announcedRoutes) {
      announcedRoutes = readyRoutes
      return
    }

    const added = [...readyRoutes].filter(
      (route) => !announcedRoutes!.has(route)
    )
    const removed = [...announcedRoutes].filter(
      (route) => !readyRoutes.has(route)
    )

    announcedRoutes = readyRoutes
    if (added.length > 0 || removed.length > 0) {
      onChanges({ added, removed })
    }
  }

  return {
    updateWatchpack(routes: Iterable<string>) {
      watchpackRoutes = new Set(routes)
      reconcile()
    },
    updateBundler(routes: Iterable<string>) {
      bundlerRoutes = new Set(routes)
      reconcile()
    },
  }
}

export type DevRouteChangeCoordinator = ReturnType<
  typeof createDevRouteChangeCoordinator
>
