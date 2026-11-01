import { expect, test } from 'bun:test'
import { nextReleaseVersion } from './release-version'

test('the first release of a line uses the source version', () => {
  expect(nextReleaseVersion('0.0.1', [])).toBe('0.0.1')
  expect(nextReleaseVersion('0.1.0', ['v0.0.1', 'v0.0.7'])).toBe('0.1.0')
})

test('later merges raise the patch past the highest release in the line', () => {
  expect(nextReleaseVersion('0.0.1', ['v0.0.1'])).toBe('0.0.2')
  expect(nextReleaseVersion('0.0.1', ['v0.0.1', 'v0.0.9', 'v0.0.3'])).toBe(
    '0.0.10'
  )
  expect(nextReleaseVersion('0.1.0', ['v0.1.0', 'v0.1.1', 'v0.0.12'])).toBe(
    '0.1.2'
  )
})

test('a source patch above the released ones wins', () => {
  expect(nextReleaseVersion('0.0.5', ['v0.0.2'])).toBe('0.0.5')
})

test('other tags and malformed versions are handled', () => {
  expect(nextReleaseVersion('1.0.0', ['v1.0.0-beta', 'latest', 'v2.0.0'])).toBe(
    '1.0.0'
  )
  expect(() => nextReleaseVersion('1.0', [])).toThrow('MAJOR.MINOR.PATCH')
})
