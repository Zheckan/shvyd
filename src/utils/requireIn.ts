/** Returns a lookup that throws when `root` lacks an element of the expected type. */
export function requireIn(root: ParentNode) {
  return function required<T extends Element>(
    selector: string,
    constructor: new (...args: never[]) => T
  ): T {
    const element = root.querySelector(selector)

    if (!(element instanceof constructor)) {
      throw new Error(`Shvyd could not find ${selector}.`)
    }

    return element
  }
}
