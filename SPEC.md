---
title: Twenty CRM Ideal CRM Implementation Specification
version: 1.2.19
status: conditional
created_date: 2026-09-01
tags: [ideal-crm, security, workflows, policy, reliability]
confidence: 95
owner: MIKKOH
---

# Twenty CRM Ideal CRM Implementation Specification

## Release posture

Runtime, deployment, and release remain `BLOCK_RELEASE`. This specification
describes the implemented control plane and the evidence still required before
enabling protected agent writes or automated side effects in production.

## Invariants

| Invariant              | Enforced contract                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Policy before mutation | Protected tool effects execute only after a bound policy decision and durable decision evidence. R2/R3 effects also require durable intent.                                                                                    |
| Untrusted model output | Tool arguments contribute to a deterministic action digest; they cannot create or widen authority.                                                                                                                             |
| Least privilege        | User, application, and run-as roles are intersected. Bypass-bearing tool contexts are rejected.                                                                                                                                |
| Workspace isolation    | Actors, authority, targets, repositories, approvals, jobs, audit events, and outbox rows are workspace-bound.                                                                                                                  |
| Deterministic risk     | Risk is resolved from the concrete database, function, or static-tool execution reference. MCP annotations are ignored for authorization.                                                                                      |
| Retry safety           | Effect keys and action digests bind retried workflow effects. Every provider requires an explicit runtime capability entry; unknown or malformed entries deny, and ambiguous external outcomes remain reconciliation-required. |
| Auditability           | Policy decision, intent, outcome, correlation, actor, authority, target, and safe metadata are append-only evidence.                                                                                                           |
| Metadata safety        | Change sets use lifecycle guards, dependency analysis, base-version checks, and optimistic concurrency.                                                                                                                        |
| Event integrity        | Business mutation and outbox insertion share one TypeORM transaction and manager.                                                                                                                                              |
| Extension isolation    | Local unsandboxed logic-function execution is forbidden in production.                                                                                                                                                         |

## Module contracts

| Module                     | Implemented capability                                                                                                                                                                                                                                                              | Acceptance evidence                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Policy Context          | Typed policy actor, authority, target, risk, field scope, correlation, pure validation, context digest, decision binding                                                                                                                                                            | Unit tests for malformed, missing, bypass, service, tenant, role, correlation, and cache-backed agent/run-as identity states                                                           |
| M4 Audit + Telemetry       | Append-only audit ledger, ordered protected-operation service, allowlisted attributes, safe Sentry defaults, low-cardinality metrics, and indexed admin-only durable recovery health                                                                                                | Audit fault/redaction/health tests, live disposable health transitions, migration verification; sink and alert-delivery validation pending                                             |
| M2 Agent Action Policy     | Concrete-action risk resolver, dual write switches, automation gate, single-use 15-minute approvals, approve/deny admin workflow, current-role filtering for static dashboard tools, direct dashboard-duplication permission enforcement, and caller-bound R2/R3 emailing decisions | Risk, kill-switch, approval tamper/replay/expiry, identity, dispatch, dashboard denial/duplication, campaign revocation, direct-email ordering, and admin UI tests                     |
| M3 Workflow Reliability    | Lifecycle validator, deterministic effect ledger, CAS reservation/transitions, fail-closed runtime provider registry, bounded provider contract, uncertain-outcome reconciliation, deterministic campaign jobs, and queue-persisted Stripe snapshots                                | Duplicate, transition-race, provider-registration/capability, trigger replay, queue identity, campaign provider/persistence uncertainty, billing retry, and provider request-key tests |
| M5 Metadata Change Sets    | Lifecycle, dependency digest/acknowledgement, base-version/CAS guards, policy-bound apply/rollback, configuration snapshots, and object/field/index deletion routing                                                                                                                | Unit/resolver/UI tests, full builds, and live authorized/denied core GraphQL checks pass; destructive deletion paths are change-set-backed                                             |
| M6 Transactional Outbox    | Same-transaction API, workflow/configuration domain adoption, versioned queue publisher, dispatcher cron, consumer receipts, retries, dead-letter/reconciliation, retention, and operations UI                                                                                      | PostgreSQL commit/rollback, dispatcher/publisher/consumer/retention, and live operations-query authorization pass; target queue operations remain G8                                   |
| M7 Contract Versioning     | Immutable metadata snapshots, universal-ID diff/classification, query/UI comparison, and fail-closed GraphQL/OpenAPI/SDK CI coverage                                                                                                                                                | Snapshot/diff/resolver, live authorization, and production-build checks pass; hosted CI execution remains external evidence                                                            |
| M8 Approval + Admin UX     | Security-permission/access-token guarded approvals plus audit, workflow, outbox, change-set, and configuration-version operator surfaces                                                                                                                                            | Backend negative tests, UI tests, complete frontend suite, production builds, the prior 13-test browser suite, and focused 9-test test/production-mode security suites pass            |
| M9 Extension Guardrails    | Agent/run-as intersection, stopped-application token denial, ordered uninstall cleanup, production local-driver denial, Lambda VPC/resource revalidation, env-only `LOGIC_FUNCTION_LAMBDA_RESERVED_CONCURRENCY` defaulting to one, and manifest dry-run                             | Unit/fault/drift tests pass; deployed security-group egress, account quota/capacity, IAM, secret custody, and provider runtime evidence remain G8                                      |
| M10 Recovery + Portability | Version-bound AES-256-GCM export/import, SHA-256 manifest verification, fail-if-exists restore, transaction rollback, identity-conflict denial, filtered active-table DDL, and physical source-schema nullability preservation                                                      | 11 suites/54 tests pass; a fresh disposable encrypted export/import, rollback, exact row/schema parity, and duplicate-import denial drill pass                                         |

## Authority states

| State                                                              | Protected behavior                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Caller-bound user or API key                                       | Allow only within the current workspace and role projection.                                           |
| Delegated application                                              | Allow only through the current application role and any caller-role intersection.                      |
| Scoped service principal                                           | Allow only explicit R0 operations in its allowlist.                                                    |
| Scoped service mutation                                            | Allow only its fixed R0/R1 operation; deny R2/R3 and unknown operations.                               |
| Missing, revoked, unresolved, malformed, legacy, foreign-workspace | Deny before protected read, mutation, tool invocation, workflow action, provider call, or side effect. |
| Bypass-bearing context                                             | Deny; no compatibility flag may restore it.                                                            |

## Workflow ingress contract

Database-event trigger jobs persist a schema-versioned, expiring, tenant-bound
event reference with HMAC-authenticated producer provenance. Jobs do not persist
hydrated before/after records. The worker validates the signed workspace,
workflow, version, trigger, event, and correlation bindings; re-resolves current
application authority and trigger configuration; and re-fetches the current
record through scoped ORM permissions. `RunWorkflowJob` separately enforces an
exact-key, schema-versioned UUID envelope before workspace execution. Focused
tamper, expiry, replay, stale-binding, malformed, legacy, and cross-workspace
negative coverage passes locally. Delete/destroy event triggers remain denied
until a separately approved minimal tombstone contract exists.

## Release gates

| Gate                | Required proof                                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 Authority        | No protected worker or workflow-tool path can acquire broader authority because identity or role resolution failed.                                                                                                                                                                                         |
| G2 Tenant/field/row | Integration tests prove cross-workspace, restricted-row, and restricted-field denial without existence disclosure; live local HTTP tests prove sibling-Origin denial, immutable Apple binding for an Apple-only token on a YC hostname, unauthenticated denial, and foreign-workspace M5-M7 control denial. |
| G3 Revocation       | Post-enqueue revocation and policy-version change deny or re-fetch under current authority.                                                                                                                                                                                                                 |
| G4 Audit            | Pre-effect audit failure blocks; post-effect evidence failure produces durable reconciliation and never success.                                                                                                                                                                                            |
| G5 Correlation      | Request/MCP, decision, job/run/attempt, effect/mutation, trace, outbox, and audit identifiers are joinable.                                                                                                                                                                                                 |
| G6 Redaction        | Sentinel credentials, tokens, CRM values, prompts, and model outputs are absent from every configured sink and export.                                                                                                                                                                                      |
| G7 Compatibility    | Existing workspace roles, legacy/in-flight jobs, self-hosted upgrades, retries, rollback, and downgrade behavior are exercised.                                                                                                                                                                             |
| G8 Operations       | Production Sentry settings, recovery-health polling and alert delivery, provider guarantees, load/cardinality, retention, backup, and restore evidence are independently verified.                                                                                                                          |

## Known unknowns

Production Sentry capture, deployed standard-application role population,
provider idempotency/reconciliation support beyond the conservative one-attempt
runtime registry, audit-gap alert delivery,
production load/cardinality, Lambda security-group egress, regional account
concurrency quota/capacity, Lambda IAM permissions, backup scheduling, and
measured recovery objectives remain `[UNVERIFIED]`. The repository still
contains 99 literal system-bypass occurrences across 64 production source
files outside the protected production workflow/dashboard-tool and direct
dashboard-duplication paths; they are
not evidence that every unrelated subsystem has been converted to the Ideal CRM
authority contract. Production release remains
`BLOCK_RELEASE` until target-environment G8 validation, deployment review, and
stakeholder authorization are complete.
