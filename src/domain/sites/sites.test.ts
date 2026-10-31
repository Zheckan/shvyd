import { describe, expect, test } from 'bun:test'
import { parseSite, siteFromOrigins } from './sites'

describe('site identity', () => {
  test('a frame uses its top-level page, so hiding a site covers its embedded frames', () => {
    expect(
      siteFromOrigins('https://ads.example.net', [
        'https://www.news.example.com',
      ])
    ).toBe('news.example.com')
    expect(
      siteFromOrigins('https://inner.example', [
        'https://middle.example',
        'https://Top.Example.org',
      ])
    ).toBe('top.example.org')
  })

  test('a top-level page uses its own host, ignoring port and a leading www', () => {
    expect(siteFromOrigins('https://www.example.com', [])).toBe('example.com')
    expect(siteFromOrigins('http://localhost:5173', [])).toBe('localhost')
    expect(siteFromOrigins('http://127.0.0.1:8080', [])).toBe('127.0.0.1')
    expect(siteFromOrigins('http://[::1]:5173', [])).toBe('[::1]')
  })

  test('pages without a web origin have no site', () => {
    expect(siteFromOrigins('null', [])).toBeUndefined()
    expect(siteFromOrigins('file://', [])).toBeUndefined()
    expect(siteFromOrigins('https://example.com', ['null'])).toBeUndefined()
  })

  test('only valid host names are accepted from messages and storage', () => {
    expect(parseSite('Example.COM')).toBe('example.com')
    expect(() => parseSite('example.com/path')).toThrow()
    expect(() => parseSite('')).toThrow()
    expect(() => parseSite('a'.repeat(254))).toThrow()
    expect(() => parseSite(42)).toThrow()
  })
})
