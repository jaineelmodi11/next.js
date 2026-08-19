// This must remain self-contained plain JavaScript. It is emitted inline so it
// can observe history changes before the external client bootstrap runs.
// Keep it readable: this bridge is small enough that maintaining a
// separate generated/minified artifact would cost more than it saves.
export const historyBootstrapScript = String.raw`
(function () {
  var currentHistory = history
  var originalPushState = currentHistory.pushState
  var originalReplaceState = currentHistory.replaceState
  var activationMarker = '__PRIVATE_NEXTJS_INTERNALS_HISTORY_ACTIVATION'
  var earlyHistory = {
    activationHref: location.href,
    originalPushState: originalPushState,
    originalReplaceState: originalReplaceState,
    observation: null,
  }

  // The browser-created entry has no App Router state yet. Mark it as belonging
  // to this document so a traversal back to it can be associated with the
  // initial router tree once hydration creates that tree.
  var activationState = currentHistory.state
  if (activationState == null || typeof activationState !== 'object') {
    activationState = {}
  }
  delete activationState.__NA
  delete activationState.__PRIVATE_NEXTJS_INTERNALS_TREE
  activationState[activationMarker] = true
  originalReplaceState.call(
    currentHistory,
    activationState,
    '',
    location.href
  )

  function copyNextJsInternalHistoryState(data) {
    if (data == null) data = {}
    var currentState = currentHistory.state
    if (currentState && currentState.__NA) {
      data.__NA = currentState.__NA
      data.__PRIVATE_NEXTJS_INTERNALS_TREE =
        currentState.__PRIVATE_NEXTJS_INTERNALS_TREE
    } else if (currentState && currentState[activationMarker]) {
      data[activationMarker] = true
    }
    return data
  }

  currentHistory.pushState = function (data) {
    arguments[0] = copyNextJsInternalHistoryState(data)
    originalPushState.apply(currentHistory, arguments)
  }
  currentHistory.replaceState = function (data) {
    arguments[0] = copyNextJsInternalHistoryState(data)
    originalReplaceState.apply(currentHistory, arguments)
  }
  self.__next_h = earlyHistory
})()
`

export function prependHistoryBootstrapScript(
  bootstrapScriptContent: string | undefined
) {
  return bootstrapScriptContent
    ? `${historyBootstrapScript};${bootstrapScriptContent}`
    : historyBootstrapScript
}
