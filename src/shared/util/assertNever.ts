/**
 * Put `default: assertNever(value)` at the end of a `switch` over a union type.
 * If someone adds a new variant and forgets a `case`, TypeScript reports an error there.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
