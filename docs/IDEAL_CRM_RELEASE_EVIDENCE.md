---
title: Twenty CRM Ideal CRM Release Evidence
version: 0.1.0
status: BLOCK_RELEASE
created_date: 2026-10-01
tags: [ideal-crm, release-evidence, ci, security]
confidence: 97
owner: MIKKOH
---

# Twenty CRM Ideal CRM Release Evidence

## Decision

`NO-GO / BLOCK_RELEASE`. Local closeout work is in progress on
`codex/ideal-crm-closeout`; PR#1 remains Draft and points to
`831b9f45992e613bd857fc3c9b5e6293ba1c4753`. No merge, deployment, or release
is authorized.

## Evidence snapshot

| Item                          | Evidence                                                                       | Classification                             |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Fork baseline                 | `main@adc2839d26660cf452995e9308c7237653dafd27`                                | `[VERIFIED]` on 2026-10-01                 |
| PR head                       | `codex/ideal-crm-guide-task-1@831b9f45992e613bd857fc3c9b5e6293ba1c4753`        | `[VERIFIED]` on 2026-10-01                 |
| Closeout branch               | `codex/ideal-crm-closeout@c2ee33dcf50fb967c9697a1a48182787070d0a0a`            | `[VERIFIED]`; local only                   |
| PR state                      | [PR#1](https://github.com/mkkh-labs/twentyCRM/pull/1): OPEN, Draft, `UNSTABLE` | `BLOCK_RELEASE`                            |
| PR checks                     | 107 pass, 22 fail, 18 skip                                                     | `[VERIFIED]`; exact PR-head snapshot       |
| Toolchain                     | Node `24.16.0`, Yarn `4.13.0`, Nx `22.7.8`                                     | `[VERIFIED]` in closeout worktree          |
| Original external attachments | Exact historical Downloads paths are absent from current governing artifacts   | `[UNVERIFIED]`; paths and contents unknown |

## Causal cluster ledger

| Cluster                           | Classification | Failing checks                                  | First causal evidence                                                                                                                                             | Owner                | Proposed fix                                                                                                                              | Focused reproducer                                                     | Closure evidence                                                                            |
| --------------------------------- | -------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| CL-01 static formatting           | `FIX_NOW`      | `server-lint-typecheck`                         | Oxfmt reported four server files; fresh Prettier reported four governing documents                                                                                | Repository closeout  | Apply only the reported formatters to those paths                                                                                         | Targeted Oxfmt and Prettier checks                                     | Local commit `735e0860b4`; hosted rerun pending                                             |
| CL-02 instance migration drift    | `PROVE_NOW`    | `server-validation`                             | Generator produced `PendingMigrationCheckFastInstanceCommand` for 2.38 and changed the command registry                                                           | Database migration   | Reproduce in a verified disposable database, identify the entity delta, generate the real command, and prove a second generation is empty | CI-equivalent migration generation against disposable PostgreSQL       | Open                                                                                        |
| CL-03 cross-version authority     | `FIX_NOW`      | `cross-version-upgrade / cross-version-upgrade` | Two workspaces failed `DropMessageDirectionFieldCommand` with `Destructive metadata changes require explicit authorization.`                                      | Upgrade runtime      | Bind each registered workspace command to its workspace and operation; mark the destructive 2.3 command as a system build                 | Focused runner, command, and authorization tests                       | Local commit `c2ee33dcf5`; 18 tests and direct server typecheck pass; full workflow pending |
| CL-04 Postcard lifecycle          | `PROVE_NOW`    | `example-app-postcard`                          | Registry install failed because the application was temporarily stopped                                                                                           | Applications         | Trace packaging, install, token, and cleanup state; preserve stopped-application denial                                                   | CI-equivalent Postcard install workflow                                | Open                                                                                        |
| CL-05 integration bootstrap state | `PROVE_NOW`    | Integration shards 1-16                         | Every shard log contains missing `core.keyValuePair`; the same startup window also reports missing `core.appToken` and `core.upgradeMigration`                    | Server integration   | Determine whether bootstrap ordering, migration state, build output, or database reuse causes the missing relations                       | One representative CI-equivalent shard with isolated services          | Open                                                                                        |
| CL-06 integration metadata state  | `PROVE_NOW`    | Integration shards 1-16                         | Every shard reports `METADATA_VALIDATION_FAILED`; shard 1 also has application foreign-key failures, and shards 1, 5, 7, 15, and 16 show duplicate-data conflicts | Metadata integration | Reproduce after CL-05 isolation, then separate fixture collisions from product regressions                                                | Representative metadata suites followed by all formerly failing shards | Open                                                                                        |

## Failing-check inventory

| Check                                           |         Job ID | URL                                                                                     | Cluster             | Status                        |
| ----------------------------------------------- | -------------: | --------------------------------------------------------------------------------------- | ------------------- | ----------------------------- |
| `server-lint-typecheck`                         | `101406026387` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101406026387) | CL-01               | Local fix; hosted open        |
| `server-validation`                             | `101407674434` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674434) | CL-02               | Open                          |
| `cross-version-upgrade / cross-version-upgrade` | `101407674483` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674483) | CL-03               | Local fix; full workflow open |
| `example-app-postcard`                          | `101405118966` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002447095/job/101405118966) | CL-04               | Open                          |
| `ci-example-app-postcard-status-check`          | `101405991165` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002447095/job/101405991165) | CL-04 dependent     | Open                          |
| `server-integration-test (1)`                   | `101407674565` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674565) | CL-05, CL-06        | Open                          |
| `server-integration-test (2)`                   | `101407674592` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674592) | CL-05, CL-06        | Open                          |
| `server-integration-test (3)`                   | `101407674577` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674577) | CL-05, CL-06        | Open                          |
| `server-integration-test (4)`                   | `101407674620` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674620) | CL-05, CL-06        | Open                          |
| `server-integration-test (5)`                   | `101407674628` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674628) | CL-05, CL-06        | Open                          |
| `server-integration-test (6)`                   | `101407674578` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674578) | CL-05, CL-06        | Open                          |
| `server-integration-test (7)`                   | `101407674607` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674607) | CL-05, CL-06        | Open                          |
| `server-integration-test (8)`                   | `101407674640` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674640) | CL-05, CL-06        | Open                          |
| `server-integration-test (9)`                   | `101407674602` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674602) | CL-05, CL-06        | Open                          |
| `server-integration-test (10)`                  | `101407674646` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674646) | CL-05, CL-06        | Open                          |
| `server-integration-test (11)`                  | `101407674652` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674652) | CL-05, CL-06        | Open                          |
| `server-integration-test (12)`                  | `101407674709` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674709) | CL-05, CL-06        | Open                          |
| `server-integration-test (13)`                  | `101407674661` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674661) | CL-05, CL-06        | Open                          |
| `server-integration-test (14)`                  | `101407674617` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674617) | CL-05, CL-06        | Open                          |
| `server-integration-test (15)`                  | `101407674603` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674603) | CL-05, CL-06        | Open                          |
| `server-integration-test (16)`                  | `101407674591` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674591) | CL-05, CL-06        | Open                          |
| `ci-server-status-check`                        | `101413559993` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101413559993) | Aggregate dependent | Open                          |

## Local validation ledger

| SHA          | Scope                       | Command evidence                                                                           | Result                       |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| `735e0860b4` | Static formatting           | Targeted Oxfmt, targeted Prettier, and `git diff --check`                                  | `PASS`                       |
| `c2ee33dcf5` | Upgrade operation authority | Three focused Jest suites                                                                  | `PASS`: 18 tests, 0 failures |
| `c2ee33dcf5` | Server types                | Direct `tsgo -p packages/twenty-server/tsconfig.json --noEmit` after required local builds | `PASS`: exit 0               |

## Open release gates

| Gate                              | Status           | Required evidence                                                                                      |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Repository and exact-final-SHA CI | `BLOCK_RELEASE`  | Every primary failure closed and aggregate checks green or legitimately path-skipped                   |
| G1-G7                             | `BLOCK_RELEASE`  | Final-SHA security, compatibility, migration, queue, recovery, and E2E matrix                          |
| G8                                | `BLOCK_RELEASE`  | Authorized target evidence for alerts, providers, extensions, capacity, retention, backup, and restore |
| Independent review                | `BLOCK_RELEASE`  | Security and migration approval with findings resolved or explicitly accepted                          |
| Merge, deployment, release        | `NOT AUTHORIZED` | Separate explicit MIKKOH decisions after preceding gates pass                                          |
