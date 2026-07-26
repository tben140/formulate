/**
 * Typing shim for @shopify/checkout-sheet-kit.
 *
 * The package sets `"types": "src/index.ts"` — it points TypeScript at its raw
 * source rather than at built declarations. That means `skipLibCheck` does not
 * apply (it only skips `.d.ts` files), so the package's own source is
 * typechecked as part of this app.
 *
 * Its source calls `Error.captureStackTrace`, a V8/Node API that isn't in the
 * React Native lib set, producing:
 *
 *   error TS2339: Property 'captureStackTrace' does not exist on type
 *   'ErrorConstructor'
 *
 * Declaring it optional here is narrower than pulling @types/node into a React
 * Native app, which would wrongly imply Node globals are available at runtime.
 *
 * Remove once the package ships built declarations.
 */

declare global {
  interface ErrorConstructor {
    // `constructorOpt` receives a class constructor, so it needs the broad
    // `Function` type — the same signature @types/node declares.
    captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
  }
}

export {};
