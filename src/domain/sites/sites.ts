const MAX_HOST_LENGTH = 253
const HOST_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/
const IPV6_HOST = /^\[[0-9a-f:.]+\]$/

/** Validates and normalizes a site: a lowercase host name without a leading `www.`. */
export function parseSite(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Choose a website.')
  }

  const site = value
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '')

  if (
    !site ||
    site.length > MAX_HOST_LENGTH ||
    !(HOST_NAME.test(site) || IPV6_HOST.test(site))
  ) {
    throw new Error('Choose a website.')
  }

  return site
}

/**
 * The site a frame belongs to: its top-level page's host. `ancestorOrigins`
 * lists parents nearest first, so the last entry is the top-level page.
 */
export function siteFromOrigins(
  frameOrigin: string,
  ancestorOrigins: readonly string[]
): string | undefined {
  const topOrigin = ancestorOrigins.at(-1) ?? frameOrigin

  try {
    const url = new URL(topOrigin)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }

    return parseSite(url.hostname)
  } catch {
    return undefined
  }
}

export function parseSiteList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Hidden sites could not be read.')
  }

  return value.map(parseSite)
}
