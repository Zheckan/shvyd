/**
 * Runs async operations one at a time in call order. A failed operation rejects
 * only its own caller; later operations still run.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve()

  return function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation)
    tail = result.catch(() => undefined)

    return result
  }
}
