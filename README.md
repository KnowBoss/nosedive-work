# [work](kb/01a15bb1-da9e-7d2d-aa82-5ee97257adc6.md)

**Development status:** Work is under active development and is not yet ready for general release. Commands, APIs, and file formats may change without backward compatibility. Use for experimentation and evaluation; avoid relying on it for critical workflows.

Copyright (c) 2026 Dan Stace.

Licensed under the [PolyForm Internal Use License 1.0.0](LICENSE). Use and modification for your own or your company's internal business operations are permitted without a license fee. Redistribution is not permitted under this license. This is a source-available license, not an open-source license.

Work requires [nosedive-core](https://github.com/Nosedive-Devex/nosedive-core), which is separately licensed under MIT.

## Tests

With core checked out and built beside this repo as `nosedive-core`:

```sh
npm ci
npm run typecheck
node ../nosedive-core/dist/cli.js pass --test 01a15bb1-da9e-7d2d-aa82-5ee97257adc6
```

In a hero that wears work, `nosedive pass --test 01a15bb1-da9e-7d2d-aa82-5ee97257adc6` runs the same tests with the hero's core. [CI](.github/workflows/ci.yml) runs them on Ubuntu and Windows against core's main, on every pull request.
