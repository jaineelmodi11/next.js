'use client'

import { usePathname, useSearchParams } from 'next/navigation'

export function RouterUrl() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <>
      <output id="router-pathname">{pathname}</output>
      <output id="router-search">{searchParams.toString()}</output>
    </>
  )
}
