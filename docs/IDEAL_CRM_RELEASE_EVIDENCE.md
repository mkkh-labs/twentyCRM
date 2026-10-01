---
title: Twenty CRM Ideal CRM Release Evidence
version: 0.2.0
status: BLOCK_RELEASE
created_date: 2026-10-01
tags: [ideal-crm, release-evidence, ci, security]
confidence: 98
owner: MIKKOH
---

# Twenty CRM Ideal CRM Release Evidence

## Decision

`NO-GO / BLOCK_RELEASE`. Repository integration stabilization is locally green on
`codex/ideal-crm-closeout`; PR#1 remains Draft and points to
`831b9f45992e613bd857fc3c9b5e6293ba1c4753`. No merge, deployment, or release
is authorized.

## Evidence snapshot

| Item                          | Evidence                                                                       | Classification                             |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Fork baseline                 | `main@adc2839d26660cf452995e9308c7237653dafd27`                                | `[VERIFIED]` on 2026-10-01                 |
| PR head                       | `codex/ideal-crm-guide-task-1@831b9f45992e613bd857fc3c9b5e6293ba1c4753`        | `[VERIFIED]` on 2026-10-01                 |
| Closeout branch               | `codex/ideal-crm-closeout@5b04c4ad97c8a58520a12bc78c053f2289ca29a1`            | `[VERIFIED]`; local only                   |
| PR state                      | [PR#1](https://github.com/mkkh-labs/twentyCRM/pull/1): OPEN, Draft, `UNSTABLE` | `BLOCK_RELEASE`                            |
| PR checks                     | 107 pass, 22 fail, 18 skip                                                     | `[VERIFIED]`; exact PR-head snapshot       |
| Toolchain                     | Node `24.16.0`, Yarn `4.13.0`, Nx `22.7.8`                                     | `[VERIFIED]` in closeout worktree          |
| Original external attachments | Exact historical Downloads paths are absent from current governing artifacts   | `[UNVERIFIED]`; paths and contents unknown |

## Causal cluster ledger

| Cluster                           | Classification    | Failing checks                                  | First causal evidence                                                                                                                                         | Owner                | Proposed fix                                                                                                              | Focused reproducer                                               | Closure evidence                                                                            |
| --------------------------------- | ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| CL-01 static formatting           | `FIX_NOW`         | `server-lint-typecheck`                         | Oxfmt reported four server files; fresh Prettier reported four governing documents                                                                            | Repository closeout  | Apply only the reported formatters to those paths                                                                         | Targeted Oxfmt and Prettier checks                               | Local commit `735e0860b4`; hosted rerun pending                                             |
| CL-02 instance migration drift    | `NO_OP_EVIDENCED` | `server-validation`                             | Entity metadata omitted hand-authored checks, a composite foreign key, and workspace foreign-key names                                                        | Database migration   | Align entity metadata, add the 2.38 command, and prove generator idempotence                                              | CI-equivalent migration generation against disposable PostgreSQL | Local commits `f84441d47a`, `7cd58e9131`; up/down/up drill and second generation pass       |
| CL-03 cross-version authority     | `FIX_NOW`         | `cross-version-upgrade / cross-version-upgrade` | Two workspaces failed `DropMessageDirectionFieldCommand` with `Destructive metadata changes require explicit authorization.`                                  | Upgrade runtime      | Bind each registered workspace command to its workspace and operation; mark the destructive 2.3 command as a system build | Focused runner, command, and authorization tests                 | Local commit `c2ee33dcf5`; 18 tests and direct server typecheck pass; full workflow pending |
| CL-04 Postcard lifecycle          | `FIX_NOW`         | `example-app-postcard`                          | Successful uninstall left the application stop marker in distributed state                                                                                    | Applications         | Clear the stop marker only after deletion succeeds; preserve stopped-app denial                                           | Focused uninstall and token-denial suites                        | Local commit `bb6a0be06a`; 2 suites and 9 tests pass; full workflow pending                 |
| CL-05 integration bootstrap state | `NO_OP_EVIDENCED` | Integration shards 1-16                         | Config loading races the initial schema and logs missing `core.keyValuePair`, then retries after database initialization                                      | Server integration   | Prove the transient message does not abort reset or Jest                                                                  | All 16 shards with isolated PostgreSQL, Redis, and ClickHouse    | Local PASS: all shards exit 0; bootstrap message is non-causal                              |
| CL-06 integration runtime state   | `NO_OP_EVIDENCED` | Integration shards 1-16                         | Metadata schema routing, billing fixtures, queue waiting, standard-app role, Stripe mock state, and billing-aware workspace expectations failed independently | Server integration   | Fix each root without skips, timeout expansion, or permission weakening                                                   | Focused suites followed by all 16 integration shards             | Local PASS: 608 suites, 3,260 tests; 2 suites and 26 tests skipped by existing contracts    |
| CL-07 guarded writes              | `NO_OP_EVIDENCED` | Integration shards 4 and 11                     | Workspace feature flags were enabled while the global test-only agent write switch remained false                                                             | Test runtime         | Enable the global switch only in `.env.test`                                                                              | AI record-file, Microsoft send-email, and full shard reruns      | Local commit `9200d2e0f9`; focused and shard tests pass                                     |
| CL-08 Stripe webhook mock         | `NO_OP_EVIDENCED` | Integration shard 10                            | Separate stateless SDK mocks could not retrieve webhook resources                                                                                             | Test runtime         | Reuse a mock per API key and retain price and subscription events                                                         | Billing controller suite and shard 10                            | Local commit `86528307c3`; 4 focused tests and shard pass                                   |
| CL-09 billing activation contract | `NO_OP_EVIDENCED` | Integration shard 11                            | Workspace tests expected `ACTIVE` even though billing mode correctly yields `CREATED` without a subscription                                                  | Workspace runtime    | Assert the documented terminal state for each billing mode                                                                | Workspace creation suite and shard 11                            | Local commit `9200d2e0f9`; 5 focused tests and shard pass                                   |
| CL-10 metadata control routing    | `NO_OP_EVIDENCED` | Integration shards 1 and 15                     | Workspace-bound change-set, configuration-version, and outbox resolvers were registered on the core schema                                                    | Metadata integration | Register the guarded controls on the metadata schema                                                                      | Metadata control suite and shards 1 and 15                       | Local commits `197270c420`, `5b04c4ad97`; 4 focused tests and shard passes                  |

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

| SHA          | Scope                       | Command evidence                                                                           | Result                                      |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `735e0860b4` | Static formatting           | Targeted Oxfmt, targeted Prettier, and `git diff --check`                                  | `PASS`                                      |
| `c2ee33dcf5` | Upgrade operation authority | Three focused Jest suites                                                                  | `PASS`: 18 tests, 0 failures                |
| `c2ee33dcf5` | Server types                | Direct `tsgo -p packages/twenty-server/tsconfig.json --noEmit` after required local builds | `PASS`: exit 0                              |
| `f84441d47a` | Migration drift             | Disposable PostgreSQL generation, up/down/up drill, second generation                      | `PASS`: no second diff                      |
| `bb6a0be06a` | Postcard lifecycle          | Focused uninstall and stopped-token suites                                                 | `PASS`: 9 tests, 0 failures                 |
| `5b04c4ad97` | Server integration          | CI-equivalent billing-enabled shards `1/16` through `16/16`, isolated reset per shard      | `PASS`: 608 suites, 3,260 tests, 26 skipped |
| `5b04c4ad97` | Focused regressions         | Migration, billing, workspace, metadata-control, workflow, and application suites          | `PASS`                                      |
| `5b04c4ad97` | Server types and lint       | Direct tsgo; diff lint and formatting                                                      | `PASS`: exit 0; 0 lint errors               |

Jest reported non-fatal open-handle warnings after green summaries in shards 12, 14, and 16.
Those warnings remain `PROVE_NOW` for cleanup but did not fail the inventory.

## Open release gates

| Gate                              | Status           | Required evidence                                                                                      |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Repository and exact-final-SHA CI | `BLOCK_RELEASE`  | Every primary failure closed and aggregate checks green or legitimately path-skipped                   |
| G1-G7                             | `BLOCK_RELEASE`  | Final-SHA security, compatibility, migration, queue, recovery, and E2E matrix                          |
| G8                                | `BLOCK_RELEASE`  | Authorized target evidence for alerts, providers, extensions, capacity, retention, backup, and restore |
| Independent review                | `BLOCK_RELEASE`  | Security and migration approval with findings resolved or explicitly accepted                          |
| Merge, deployment, release        | `NOT AUTHORIZED` | Separate explicit MIKKOH decisions after preceding gates pass                                          |
