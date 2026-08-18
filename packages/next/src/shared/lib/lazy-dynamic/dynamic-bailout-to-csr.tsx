'use client'

import { use, type ReactElement } from 'react'
import { browser } from 'react-dom'
import { BailoutToCSRError } from './bailout-to-csr'

interface BailoutToCSRProps {
  reason: string
  children: ReactElement
}

/**
 * Signals during server rendering that this subtree should be client-rendered.
 */
export function BailoutToCSR({ reason, children }: BailoutToCSRProps) {
  if (process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT) {
    // @ts-expect-error TODO: Update @types/react-dom to include the reason argument.
    use(browser(reason))
    return children
  }

  if (typeof window === 'undefined') {
    throw new BailoutToCSRError(reason)
  }

  return children
}
