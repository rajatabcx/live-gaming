// Lets Node's built-in TypeScript support resolve extensionless relative imports,
// so pure-TS modules (game sims) run headless: node --import ./scripts/ts-resolve.mjs file.ts
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        return next(`${specifier}/index.ts`, context);
      }
    }
  },
});
