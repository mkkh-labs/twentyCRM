---
title: Twenty CRM Ideal CRM Release Evidence
version: 0.3.1
status: BLOCK_RELEASE
created_date: 2026-10-01
tags: [ideal-crm, release-evidence, ci, security]
confidence: 98
owner: MIKKOH
---

# Twenty CRM Ideal CRM Release Evidence

## Decision

`NO-GO / BLOCK_RELEASE` for deployment and release. Repository stabilization,
strict workflow ingress, schema alignment, cross-version upgrade, and the
Postcard lifecycle are locally green on `codex/ideal-crm-closeout`. PR#1 must
remain Draft while exact-pushed-SHA checks run. No merge, deployment, or release
is authorized.

## Evidence snapshot

| Item                          | Evidence                                                                     | Classification                             |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| Fork baseline                 | `main@adc2839d26660cf452995e9308c7237653dafd27`                              | `[VERIFIED]` on 2026-10-01                 |
| PR head                       | `codex/ideal-crm-guide-task-1@00e0bebe5a1479e65182e5f04fa4e973df239675`      | `[VERIFIED]` on 2026-10-02                 |
| Closeout code anchor          | `codex/ideal-crm-closeout@00e0bebe5a`                                        | `[VERIFIED]`; this evidence update follows |
| PR state                      | [PR#1](https://github.com/mkkh-labs/twentyCRM/pull/1): OPEN, Draft           | `BLOCK_RELEASE`                            |
| PR checks                     | Exact-SHA checks running; no readiness inference                             | `PROVE_NOW`                                |
| Toolchain                     | Node `24.16.0`, Yarn `4.13.0`, Nx `22.7.8`                                   | `[VERIFIED]` in closeout worktree          |
| Original external attachments | Exact historical Downloads paths are absent from current governing artifacts | `[UNVERIFIED]`; paths and contents unknown |

## Causal cluster ledger

| Cluster                           | Classification    | Failing checks                                   | First causal evidence                                                                                                                                         | Owner                | Proposed fix                                                                                                    | Focused reproducer                                               | Closure evidence                                                                         |
| --------------------------------- | ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| CL-01 static formatting           | `FIX_NOW`         | `server-lint-typecheck`                          | Oxfmt reported four server files; fresh Prettier reported four governing documents                                                                            | Repository closeout  | Apply only the reported formatters to those paths                                                               | Targeted Oxfmt and Prettier checks                               | Local commit `735e0860b4`; hosted rerun pending                                          |
| CL-02 instance migration drift    | `NO_OP_EVIDENCED` | `server-validation`                              | Entity metadata omitted hand-authored checks, a composite foreign key, and workspace foreign-key names                                                        | Database migration   | Align entity metadata, add the 2.38 command, and prove generator idempotence                                    | CI-equivalent migration generation against disposable PostgreSQL | Local commits `f84441d47a`, `7cd58e9131`; up/down/up drill and second generation pass    |
| CL-03 cross-version authority     | `NO_OP_EVIDENCED` | `cross-version-upgrade / cross-version-upgrade`  | Two workspaces failed `DropMessageDirectionFieldCommand` with `Destructive metadata changes require explicit authorization.`                                  | Upgrade runtime      | Bind each registered workspace command to its workspace and operation; keep post-cursor 2.38 commands reachable | Focused runner/command tests plus isolated v1.22-to-current run  | Local commits `c2ee33dcf5`, `a9d8cc3dac`; four workspaces and instance report current    |
| CL-04 Postcard lifecycle          | `NO_OP_EVIDENCED` | `example-app-postcard`                           | Successful uninstall left the application stop marker in distributed state                                                                                    | Applications         | Clear the stop marker only after deletion succeeds; preserve stopped-app denial                                 | Focused suites plus CI-equivalent publish/install lifecycle      | Local commit `bb6a0be06a`; 9 focused tests and full Postcard lifecycle pass              |
| CL-05 integration bootstrap state | `NO_OP_EVIDENCED` | Integration shards 1-16                          | Config loading races the initial schema and logs missing `core.keyValuePair`, then retries after database initialization                                      | Server integration   | Prove the transient message does not abort reset or Jest                                                        | All 16 shards with isolated PostgreSQL, Redis, and ClickHouse    | Local PASS: all shards exit 0; bootstrap message is non-causal                           |
| CL-06 integration runtime state   | `NO_OP_EVIDENCED` | Integration shards 1-16                          | Metadata schema routing, billing fixtures, queue waiting, standard-app role, Stripe mock state, and billing-aware workspace expectations failed independently | Server integration   | Fix each root without skips, timeout expansion, or permission weakening                                         | Focused suites followed by all 16 integration shards             | Local PASS: 608 suites, 3,260 tests; 2 suites and 26 tests skipped by existing contracts |
| CL-07 guarded writes              | `NO_OP_EVIDENCED` | Integration shards 4 and 11                      | Workspace feature flags were enabled while the global test-only agent write switch remained false                                                             | Test runtime         | Enable the global switch only in `.env.test`                                                                    | AI record-file, Microsoft send-email, and full shard reruns      | Local commit `9200d2e0f9`; focused and shard tests pass                                  |
| CL-08 Stripe webhook mock         | `NO_OP_EVIDENCED` | Integration shard 10                             | Separate stateless SDK mocks could not retrieve webhook resources                                                                                             | Test runtime         | Reuse a mock per API key and retain price and subscription events                                               | Billing controller suite and shard 10                            | Local commit `86528307c3`; 4 focused tests and shard pass                                |
| CL-09 billing activation contract | `NO_OP_EVIDENCED` | Integration shard 11                             | Workspace tests expected `ACTIVE` even though billing mode correctly yields `CREATED` without a subscription                                                  | Workspace runtime    | Assert the documented terminal state for each billing mode                                                      | Workspace creation suite and shard 11                            | Local commit `9200d2e0f9`; 5 focused tests and shard pass                                |
| CL-10 metadata control routing    | `NO_OP_EVIDENCED` | Integration shards 1 and 15                      | Workspace-bound change-set, configuration-version, and outbox resolvers were registered on the core schema                                                    | Metadata integration | Register the guarded controls on the metadata schema                                                            | Metadata control suite and shards 1 and 15                       | Local commits `197270c420`, `5b04c4ad97`; 4 focused tests and shard passes               |
| CL-11 prior-version mutation gate | `NO_OP_EVIDENCED` | `server-previous-version-upgrade-mutation-guard` | The intentional 2.3 command hardening modifies a prior-version command, so the repository guard requires its explicit review label                            | Upgrade review       | Apply `ci:allow-previous-version-upgrade-mutation`; retain timestamp and focused command tests                  | Exact GitHub guard plus focused upgrade tests                    | Label applied to Draft PR#1; replacement exact-SHA checks required                       |

## Failing-check inventory

| Check                                           |         Job ID | URL                                                                                     | Cluster             | Status                    |
| ----------------------------------------------- | -------------: | --------------------------------------------------------------------------------------- | ------------------- | ------------------------- |
| `server-lint-typecheck`                         | `101406026387` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101406026387) | CL-01               | Local fix; hosted open    |
| `server-validation`                             | `101407674434` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674434) | CL-02               | Open                      |
| `cross-version-upgrade / cross-version-upgrade` | `101407674483` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674483) | CL-03               | Local full workflow pass  |
| `example-app-postcard`                          | `101405118966` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002447095/job/101405118966) | CL-04               | Local full lifecycle pass |
| `ci-example-app-postcard-status-check`          | `101405991165` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002447095/job/101405991165) | CL-04 dependent     | Open                      |
| `server-integration-test (1)`                   | `101407674565` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674565) | CL-05, CL-06        | Open                      |
| `server-integration-test (2)`                   | `101407674592` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674592) | CL-05, CL-06        | Open                      |
| `server-integration-test (3)`                   | `101407674577` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674577) | CL-05, CL-06        | Open                      |
| `server-integration-test (4)`                   | `101407674620` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674620) | CL-05, CL-06        | Open                      |
| `server-integration-test (5)`                   | `101407674628` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674628) | CL-05, CL-06        | Open                      |
| `server-integration-test (6)`                   | `101407674578` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674578) | CL-05, CL-06        | Open                      |
| `server-integration-test (7)`                   | `101407674607` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674607) | CL-05, CL-06        | Open                      |
| `server-integration-test (8)`                   | `101407674640` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674640) | CL-05, CL-06        | Open                      |
| `server-integration-test (9)`                   | `101407674602` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674602) | CL-05, CL-06        | Open                      |
| `server-integration-test (10)`                  | `101407674646` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674646) | CL-05, CL-06        | Open                      |
| `server-integration-test (11)`                  | `101407674652` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674652) | CL-05, CL-06        | Open                      |
| `server-integration-test (12)`                  | `101407674709` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674709) | CL-05, CL-06        | Open                      |
| `server-integration-test (13)`                  | `101407674661` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674661) | CL-05, CL-06        | Open                      |
| `server-integration-test (14)`                  | `101407674617` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674617) | CL-05, CL-06        | Open                      |
| `server-integration-test (15)`                  | `101407674603` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674603) | CL-05, CL-06        | Open                      |
| `server-integration-test (16)`                  | `101407674591` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101407674591) | CL-05, CL-06        | Open                      |
| `ci-server-status-check`                        | `101413559993` | [job](https://github.com/mkkh-labs/twentyCRM/actions/runs/34002446959/job/101413559993) | Aggregate dependent | Open                      |

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
| `68b107ce97` | Workflow ingress security   | Run-job envelope, signed trigger provenance, binding, listener, and worker suites          | `PASS`: included in 13 suites/90 tests      |
| `a9d8cc3dac` | Cross-version upgrade       | Isolated v1.22 seed, current upgrade/status, four-workspace completion                     | `PASS`: instance/workspaces current         |
| `a9d8cc3dac` | Migration no-drift          | Canonical fast generator against reset PostgreSQL                                          | `PASS`: no schema changes found             |
| `a9d8cc3dac` | Postcard CI lifecycle       | SDK build, Vitest, application publish, and application install                            | `PASS`: 2 tests; publish/install succeeded  |
| Current code | Full server units           | Uncached Node 24.16.0 Nx/Jest inventory and six dependency builds                          | `PASS`: 1,106 suites; 7,499 tests; exit 0   |

Jest reported non-fatal open-handle warnings after green summaries in shards 12,
14, and 16. Those warnings remain `PROVE_NOW` for cleanup but did not fail the
inventory.

## G1-G8 control matrix

| Gate                | Final local evidence                                                                                                                                                   | Classification                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| G1 Authority        | Missing, malformed, bypass-bearing, revoked, stale-role, foreign-workspace, legacy queue, tampered provenance, and stale-trigger cases deny before protected execution | `NO_OP_EVIDENCED` locally                                      |
| G2 Tenant/field/row | Workspace/object/field/relation/RLS denial integration plus live unauthenticated, CSRF, immutable-token-binding, and foreign-workspace control cases pass              | `NO_OP_EVIDENCED` locally                                      |
| G3 Revocation/retry | Current role/trigger revalidation, approval expiry/replay, duplicate effects, bounded provider behavior, and reconciliation-required uncertainty pass                  | `NO_OP_EVIDENCED` locally; provider target proof is G8         |
| G4 Audit            | Pre-effect audit failure blocks; post-effect ambiguity stays non-success and enters durable reconciliation; PostgreSQL rollback coverage passes                        | `NO_OP_EVIDENCED` locally; alert delivery is G8                |
| G5 Correlation      | Request/root, decision, workflow run, attempt, effect, audit, trace, mutation, and outbox identifiers have focused lineage assertions                                  | `NO_OP_EVIDENCED` locally                                      |
| G6 Redaction        | Closed telemetry attributes, Sentry trace sanitization, disabled default PII/AI capture, and sentinel-redaction tests pass                                             | `NO_OP_EVIDENCED` in source/tests; configured sink proof is G8 |
| G7 Compatibility    | Full units/integration, strict legacy denial, migration up/down/up, v1.22-to-current upgrade, retry/rollback, and Postcard lifecycle pass locally                      | `NO_OP_EVIDENCED` locally; hosted exact-SHA CI pending         |
| G8 Operations       | Target alerts, provider guarantees, load/cardinality, retention, deployed Lambda controls, backup custody, restore ownership, and measured RTO/RPO are unavailable     | `BLOCK_RELEASE`                                                |

## Open release gates

| Gate                              | Status           | Required evidence                                                                                      |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Repository and exact-final-SHA CI | `BLOCK_RELEASE`  | Every primary failure closed and aggregate checks green or legitimately path-skipped                   |
| G1-G7                             | `BLOCK_RELEASE`  | Final-SHA security, compatibility, migration, queue, recovery, and E2E matrix                          |
| G8                                | `BLOCK_RELEASE`  | Authorized target evidence for alerts, providers, extensions, capacity, retention, backup, and restore |
| Independent review                | `BLOCK_RELEASE`  | Security and migration approval with findings resolved or explicitly accepted                          |
| Merge, deployment, release        | `NOT AUTHORIZED` | Separate explicit MIKKOH decisions after preceding gates pass                                          |
