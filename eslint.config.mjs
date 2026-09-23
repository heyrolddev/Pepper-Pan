import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * Reading a `const` before the line that declares it.
       *
       * TypeScript already refuses the obvious version of this, which is why
       * it never looked like a gap worth closing. It does NOT refuse it
       * inside a callback — a closure might legitimately run later, so the
       * compiler cannot know — and that is where it actually happened: a
       * `lines.forEach(...)` reaching for a Map declared thirty lines further
       * down. `forEach` runs immediately, so every counter sale threw
       * "Cannot access 'nameById' before initialization" straight into HQ's
       * error screen, and `tsc`, `next build` and 342 tests were all green.
       *
       * Functions are exempt because hoisted `function` declarations are a
       * normal way to write a file top-down. Everything else is not.
       */
      "@typescript-eslint/no-use-before-define": [
        "error",
        { functions: false, classes: true, variables: true },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
