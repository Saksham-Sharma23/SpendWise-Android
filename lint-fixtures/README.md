# Lint fixtures

Each file here breaks exactly one rule from `eslint.config.js`, on purpose.

`npm run lint:selftest` runs ESLint over this folder and asserts that every
expected rule fires. It is the test for the linter itself: a rule that stops
working — a renamed plugin option, a selector that no longer matches the AST —
fails loudly here instead of silently passing every future PR.

The folder is in `ignores`, so a normal `npm run lint` never reports these.
