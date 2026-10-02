---
title: Twenty CRM Ideal CRM Implementation Status
version: 1.3.16
status: BLOCK_RELEASE
created_date: 2026-09-01
tags: [ideal-crm, traceability, security, release-gate]
confidence: 97
owner: MIKKOH
---

# Twenty CRM Ideal CRM Implementation Status

## Decision

`CONDITIONAL GO` for blocked draft code review; `NO-GO / BLOCK_RELEASE` for
production deployment and release. M1 and M3 now include authenticated
database-trigger provenance, current-trigger binding, and a strict
`RunWorkflowJob` envelope with focused negative coverage. Delete/destroy
triggers remain fail-closed pending a governed tombstone contract. M6 still
requires hosted fault and queue evidence, and target-environment G8 proof is
unavailable.

## Traceability

| Requirement                                    | Module | Primary implementation                                                                                    | Validation                                                                                                                                                                                     | Status                                                                                                                   |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tenant-bound authority and fail-closed context | M1     | `policy/`, workflow common/trigger/run services                                                           | Pure-validator, context, worker, signed-provenance, stale-binding, and cross-workspace denial tests                                                                                            | Implemented locally; delete/destroy events remain denied pending the tombstone contract                                  |
| Concrete action risk and approval binding      | M2     | `policy/`, `tool-provider/`, emailing policy services                                                     | Risk, digest, expiry, replay, role/permission revocation, direct/test-email ordering, and approval-request tests                                                                               | Implemented for registered tool dispatch and caller-bound emailing effects                                               |
| Workflow retry safety and uncertainty          | M3     | `workflow-reliability/`, workflow trigger/run/delay/effect paths, campaign jobs                           | Lifecycle, duplicate, replay, provider capability, strict trigger/run envelopes, deterministic queue identity, ambiguous provider/persistence tests, and exact-SHA hosted Server matrix        | Implemented in source and hosted CI; target provider-operation evidence remains `BLOCK_RELEASE`                          |
| Durable attributable policy evidence           | M4     | policy audit entity/services, protected-operation service, emailing system policy, telemetry sanitization | Audit ordering/failure, correlation, R1 service-mutation bounds, and sentinel-redaction tests                                                                                                  | Implemented locally; deployed sinks and alerts remain G8                                                                 |
| Safe metadata changes                          | M5     | `metadata-change-set/`, destructive metadata UI hooks, workspace-migration guard                          | Lifecycle, dependency, stale-base, CAS, resolver, apply/rollback, UI, role-compatibility, live deletion, application uninstall, 1,306-test metadata regression, and live browser authorization | Object, field, and index deletion flows plus the core GraphQL control surface are integrated; target use remains blocked |
| Transactional events                           | M6     | `transactional-outbox/`, workflow-run and configuration-version mutations                                 | Publisher/dispatcher/consumer/retention tests, PostgreSQL commit/rollback integration, live operations-query authorization, and hosted integration shards                                      | Source and hosted workspace binding pass; target queue operations, retention, alerts, and fault drills remain G8         |
| Configuration and contract versioning          | M7     | `configuration-version/`, API compatibility workflow, settings UI                                         | Snapshot/diff/resolver tests, live browser authorization, fail-closed CI review, builds, and exact-SHA GraphQL/OpenAPI comparison                                                              | Implemented and hosted CI green; deployed target compatibility remains G8                                                |
| Approval administration                        | M8     | approval, audit, workflow, outbox, change-set, and configuration settings UI                              | Backend authorization tests, UI tests, full frontend regression                                                                                                                                | Implemented review/operator surfaces                                                                                     |
| Extension containment                          | M9     | application stop/uninstall, logic-function drivers, Lambda VPC/resource/concurrency contract              | Token denial, cleanup ordering/failure, environment, configuration-drift, VPC, reserved-concurrency, manifest, and role tests                                                                  | Code guardrails implemented; deployed egress/account-capacity/IAM/secret proof remains G8                                |
| Recovery and portability                       | M10    | encrypted workspace export/import, physical source-schema nullability preservation, and runbook           | 11 suites/54 tests plus fresh disposable rollback, positive restore, exact row/schema parity, and duplicate denial                                                                             | Implemented and locally drilled; target RTO/RPO remains G8                                                               |

## Verified controls

| Control                                     | Evidence-backed result                                                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing or bypass-bearing policy context    | Denied by pure validation                                                                                                                                                                                                                                 |
| Worker standard-application role resolution | Revalidated at execution; missing role throws before protected workflow use                                                                                                                                                                               |
| Workflow configuration fallback             | Exact `rolePermissionConfig ?? bypass` path removed; system-bypass and workspace mismatch deny before repository access                                                                                                                                   |
| Trigger payload ingress                     | Minimal tenant-bound event reference; hydrated records are not persisted; HMAC provenance and current trigger-configuration binding deny tampered, expired, stale, replayed, and cross-workspace payloads                                                 |
| Tool authorization                          | Concrete tool descriptor and current provider availability are revalidated before policy; MCP hints do not authorize                                                                                                                                      |
| Direct dashboard duplication                | Current role permissions are resolved at the service boundary; bypass, object/field restriction, and RLS contexts deny before page-layout metadata mutation                                                                                               |
| Material approval                           | Request stores digest-bound metadata only; approve/deny is workspace-bound and concurrency guarded                                                                                                                                                        |
| External uncertainty                        | Workflow effect and outbox states retain reconciliation-required outcomes instead of blind retry                                                                                                                                                          |
| Provider capability boundary                | Unknown or malformed provider contracts deny before policy, reservation, or invocation; registered adapters grant one attempt and no unproven idempotency/reconciliation capability                                                                       |
| Sensitive telemetry                         | Policy attributes use a closed allowlist; default Sentry AI input/output and PII capture remain disabled in code                                                                                                                                          |
| Sentry trace context                        | Only validated trace, span, and optional parent-span identifiers survive error-event sanitization; arbitrary trace data, tags, and links are removed                                                                                                      |
| Legacy queue payloads                       | `WorkflowTriggerJob` and `RunWorkflowJob` reject legacy, malformed, extra-key, non-UUID, and tenant-inconsistent payloads before workspace execution                                                                                                      |
| Upgrade discovery                           | Compiled `upgrade --dry-run` discovered all 304 registered steps and completed one seeded disposable workspace with zero failures                                                                                                                         |
| Local browser flows                         | The prior 13-test suite passes; the corrected focused production-mode and test-mode suites each pass 10/10, covering nine live CSRF, tenant, authentication, M5-M7 control-API, and authorized M5 draft cases                                             |
| Durable recovery visibility                 | Admin-only system health reports count-only outbox, workflow-effect, and indexed orphaned allowed-policy evidence; disposable PostgreSQL mutations proved outage and recovery transitions                                                                 |
| Lambda configuration drift                  | Existing executors are reused only when role, runtime, VPC identifiers, memory, timeout, ephemeral storage, state, and layers match the bounded contract                                                                                                  |
| Lambda concurrency                          | `LOGIC_FUNCTION_LAMBDA_RESERVED_CONCURRENCY` is env-only and defaults to one; live AWS drift is read before reuse and repaired under the build lock before invocation                                                                                     |
| Campaign and emailing effects               | Human request R3, materialization R1, and per-recipient provider R2 decisions preserve parent/root lineage; direct and test email use R2; revoked current permission denies; provider/persistence ambiguity enters reconciliation without automatic retry |
| Internal emailing mutations                 | Delivery-webhook and campaign-statistics bypasses are reachable only inside fixed-operation `serviceMutation` policy callbacks; ordinary R0 service principals remain unable to write                                                                     |
| Application uninstall                       | Migration dry-run receives a structured clone; the actual apply retains its independent input and leaves no application workspace table or enum types after uninstall                                                                                     |

## Release blockers

| Blocker                          | Classification    | Required closure evidence                                                                                                                                                                                         |
| -------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger provenance and binding   | `NO_OP_EVIDENCED` | HMAC provenance and current trigger binding are implemented; 13 changed security/upgrade suites pass 90 tests, including tamper, expiry, stale-binding, malformed, and cross-workspace denial                     |
| Run-workflow job envelope        | `NO_OP_EVIDENCED` | Exact-key schema, tenant, workflow-run, correlation, and provenance UUID validation denies malformed and legacy payloads before workspace execution                                                               |
| Delete/destroy trigger contract  | `BLOCK_RELEASE`   | Keep these triggers denied until a minimal tombstone contract and compatible migration/replay behavior are approved and tested                                                                                    |
| Target Sentry and audit delivery | `BLOCK_RELEASE`   | Route the recovery-health source to an owned target alert; verify PII/AI capture settings, delivery/acknowledgement/escalation, and sink-level sentinel tests                                                     |
| Provider reliability             | `BLOCK_RELEASE`   | Validate each production provider's idempotency/reconciliation guarantees and ambiguous-outcome runbook before promoting any conservative runtime capability                                                      |
| Extension runtime operations     | `BLOCK_RELEASE`   | Verify deployed Lambda configuration, security-group egress, regional account quota/capacity, IAM permissions, secret custody, and kill-switch behavior                                                           |
| Capacity and retention           | `BLOCK_RELEASE`   | Prove load profile, SLOs, telemetry cardinality budgets, sampling, audit/outbox retention, and alert thresholds                                                                                                   |
| Production recovery              | `BLOCK_RELEASE`   | Validate backup schedule, encrypted artifact custody, target-environment restore, measured RTO/RPO, and operator ownership                                                                                        |
| Hosted release controls          | `BLOCK_RELEASE`   | Run protected CI, target migration, target-environment adversarial security E2E, canary, rollback, monitoring, and stakeholder Go/No-Go gates; local builds and the 13-test browser suite pass under Node 24.16.0 |

## Current local validation

| Gate                                  | Evidence                                                                                                               | Result                                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete server integration inventory | Four disposable-reset shards; 605 suites passed, 2 skipped; 3,238 tests passed, 26 skipped; 859 snapshots passed       | `PASS`; every final shard exited 0; test-only seed requires `NODE_ENV=test` during reset                                                                                                    |
| Server unit regression                | 1,106 suites and 7,499 tests passed; 4 suites and 15 tests skipped; 116 snapshots passed                               | `PASS`; uncached Node 24.16.0 run exited 0; worker teardown warning remains `PROVE_NOW`                                                                                                     |
| Frontend unit regression              | Four direct Jest shards; 1,160 suites, 6,873 tests, and 133 snapshots passed                                           | `PASS`; monolithic worker `SIGSEGV` and Nx flake label remain `PROVE_NOW`                                                                                                                   |
| Direct server typecheck               | `npx tsgo -p tsconfig.json --noEmit`                                                                                   | `PASS`; exit 0                                                                                                                                                                              |
| Fresh builds                          | `twenty-shared`, `twenty-server`, and `twenty-front`; server compiled 8,149 files; frontend transformed 27,122 modules | `PASS`; `twenty-ui:build` flake label remains `PROVE_NOW`                                                                                                                                   |
| Overlay formatting                    | Oxfmt matched 492 files clean; `git diff --check` passed                                                               | `PASS`                                                                                                                                                                                      |
| Type-aware lint                       | Server, authored frontend, shared, and renderer overlays reported zero errors; two known naming warnings remain        | `PASS` with warnings                                                                                                                                                                        |
| Focused browser security              | Login setup plus nine live CSRF, tenant, authentication, M5-M7 control-API, and M5 draft-persistence cases             | `PASS`; production and test modes each pass 10/10 in 1.3 minutes against disposable PostgreSQL/Redis and rebuilt artifacts; production used an explicit local credentialed-origin allowlist |

The complete integration inventory is partitioned into four deterministic Jest
shards because the single-process aggregate reached V8 heap exhaustion near
8 GB. Every suite is represented, every shard started after a fresh disposable
database reset, and no failing suite was suppressed.

## Rollback

Keep both agent-write switches disabled. Before adoption, the safest reversal is
to revert the review branch commits and leave the baseline runtime unchanged.
After schema adoption, prefer a forward fix; use down commands only in a verified
disposable environment or under a separately reviewed data-safe rollback plan.
Never restore the removed fail-open workflow fallback.

## Next executable milestone

Obtain G8 evidence from the intended deployment without enabling writes: Sentry
capture configuration, audit-alert delivery, provider capability matrix,
Lambda egress/resource policy, SLO/cardinality/retention budgets, backup/restore
ownership, and measured recovery targets. Then conduct independent security and
migration review plus a separately authorized canary/rollback review before any
production release decision.
