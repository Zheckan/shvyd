import { expect, test } from 'bun:test'
import { createSerialQueue } from './createSerialQueue'

test('operations run in call order, and a failure does not stop later ones', async () => {
  const run = createSerialQueue()
  const order: string[] = []

  const slow = run(async () => {
    await Bun.sleep(5)
    order.push('slow')
  })
  const failing = run(async () => {
    order.push('failing')
    throw new Error('write failed')
  })
  const last = run(async () => {
    order.push('last')
    return 'done'
  })

  await slow
  await expect(failing).rejects.toThrow('write failed')
  expect(await last).toBe('done')
  expect(order).toEqual(['slow', 'failing', 'last'])
})
