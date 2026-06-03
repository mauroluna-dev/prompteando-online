# Changelog

## [0.2.0](https://github.com/mauroluna-dev/prompteando-online/compare/v0.1.1...v0.2.0) (2026-06-03)


### ⚠ BREAKING CHANGES

* **config:** deployments must replace DATABASE_URL with POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB.

### Bug Fixes

* **prod:** default POSTGRES_USER/DB, require only POSTGRES_PASSWORD ([#54](https://github.com/mauroluna-dev/prompteando-online/issues/54)) ([7dfe2af](https://github.com/mauroluna-dev/prompteando-online/commit/7dfe2af7963e4a7933f176db35bdf8da76cfb9fe))


### Refactors

* **config:** build Postgres connection from POSTGRES_* parts ([#56](https://github.com/mauroluna-dev/prompteando-online/issues/56)) ([7f929ce](https://github.com/mauroluna-dev/prompteando-online/commit/7f929cebc28e4beb06e417d9559ced0b71a56c3e))


### CI/CD

* keep breaking changes pre-1.0 (bump-minor-pre-major) ([#57](https://github.com/mauroluna-dev/prompteando-online/issues/57)) ([637da61](https://github.com/mauroluna-dev/prompteando-online/commit/637da619273559f326edb7c64d5669c73e40337b))

## [0.1.1](https://github.com/mauroluna-dev/prompteando-online/compare/v0.1.0...v0.1.1) (2026-06-03)


### CI/CD

* add release-please for changelog + versioned image releases ([454accb](https://github.com/mauroluna-dev/prompteando-online/commit/454accb2a2ae819dd2ed639cb96b70e52d56f842))
* add release-please for changelog + versioned image releases ([343d201](https://github.com/mauroluna-dev/prompteando-online/commit/343d201d309d92020ded2b5c02b29a4fbbeab76e))
