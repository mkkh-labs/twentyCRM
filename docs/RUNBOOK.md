---
title: Twenty CRM Ideal CRM Validation and Recovery Runbook
version: 1.4.26
status: conditional
created_date: 2026-09-01
tags: [ideal-crm, runbook, validation, rollback, recovery]
confidence: 95
owner: MIKKOH
---

# Twenty CRM Ideal CRM Validation and Recovery Runbook

## Safety posture

The default state is `BLOCK_RELEASE`. All production deployment, production
database mutation, credential rotation, live permission change, data deletion,
infrastructure teardown, force push, and history rewriting require separate
explicit authorization. Database reset or volume deletion requires verified
disposable context.

## Review-lane release blockers

| Boundary                | Current evidence                                                                                                                             | Required release proof                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Trigger ingress         | Minimal references and scoped refetch exist; the digest is not authenticated provenance and does not bind current trigger configuration      | Tamper, replay, revocation, field-policy, and cross-workspace tests deny before protected reads or effects |
| Run-workflow queue      | Trigger jobs use a strict envelope; `RunWorkflowJob` does not yet have equivalent schema, authority, correlation, and provenance enforcement | Malformed, legacy, foreign-workspace, and revoked payloads deny before workspace execution                 |
| Delete/destroy triggers | Compatibility is preserved by denying these events                                                                                           | Approve and test a minimal tombstone contract, migration, replay, and rollback path                        |
| Transactional outbox    | Local tenant binding and stale-receipt reconciliation tests pass                                                                             | Hosted queue, crash-recovery, cross-workspace, retention, alert, and fault-injection evidence              |

## Preflight

Record the exact working directory, repository root, branch, SHA, status, Node
version, package manager, and target environment. Stop on a dirty unexpected
path, wrong branch/SHA, unknown database ownership, missing authority, or any
cross-workspace anomaly.

## Validation order

| Stage       | Required result                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Static      | YAML/frontmatter, placeholder, trailing-whitespace, generated migration registration, and targeted diff checks pass.                    |
| Shared      | `twenty-shared` builds without stale cache.                                                                                             |
| Unit        | Policy, workflow reliability, trigger ingress, tool policy, metadata change-set, outbox, configuration, and extension guard tests pass. |
| Type        | Direct server `tsgo --noEmit` succeeds.                                                                                                 |
| Build       | Server and affected clients build from a clean generated-output state.                                                                  |
| Database    | Forward commands apply; exact created tables/indexes/constraints are inspected; down/up works only in a verified disposable database.   |
| Integration | Negative tenant/role/field/RLS/revocation/replay/tamper/audit/redaction cases pass against PostgreSQL and Redis.                        |
| Operations  | Alerts, SLOs, retention, load/cardinality, provider reconciliation, backups, and restore are proven in the target environment.          |

## Rollout

1. Keep global and workspace agent-write switches disabled.
2. Apply forward upgrade commands while no protected automation is enabled.
3. Inventory standard-application roles and deny affected workflows where the
   role is missing; do not synthesize administrator authority.
4. Reject legacy or unknown-provenance trigger jobs. Drain compatible in-flight
   jobs under current authority and quarantine incompatible payloads.
5. Enable read-only policy/audit observation and verify redaction, metrics, and
   alert routing.
6. Enable bounded R1 writes for an approved canary workspace only after G1-G7.
7. Enable R2/R3 only with the reviewed approval surface and single-use binding.
8. Broaden rollout only after target-environment G8 evidence is accepted.

## Incident handling

| Condition                                        | Immediate action                                                                           | Recovery state                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Missing or mismatched authority                  | Deny, preserve safe decision evidence, quarantine job                                      | No effect permitted                                 |
| Missing or malformed provider capability         | Deny before policy, effect reservation, or provider invocation                             | Register only after code review and target evidence |
| Duplicate delivery                               | Return the existing effect state; never create a second effect                             | Resume only from a valid retry state                |
| Provider failed before acceptance                | Retry only when the registered provider contract permits it                                | `RETRY_WAIT` or `DEAD_LETTERED`                     |
| Provider outcome ambiguous                       | Stop automatic retry and reconcile by provider reference/idempotency key                   | `RUNNING` with uncertainty evidence                 |
| Pre-effect audit unavailable                     | Deny protected effect                                                                      | No effect permitted                                 |
| Post-effect audit/outbox completion unavailable  | Never report success; create/retain reconciliation evidence                                | `RECONCILIATION_REQUIRED`                           |
| Ideal CRM recovery health is down or unavailable | Stop protected rollout, inspect count-only categories, preserve tenant evidence separately | `BLOCK_RELEASE` until reconciled                    |
| Stale metadata base/version                      | Reject plan/apply                                                                          | Re-plan from the current version                    |
| Cross-workspace evidence                         | Stop rollout, disable protected automation, preserve evidence                              | `BLOCK_RELEASE`                                     |

## Rollback and forward fix

Disable protected automation first. Do not restore the removed permission-bypass
fallback. Prefer a forward fix when data or durable evidence has been written.
Schema down commands are permitted only in the verified disposable validation
database or under a separately approved production rollback plan after proving
that no dependent rows or older application instances remain.

For ambiguous external effects, rollback means pausing new effects and
reconciling existing records; it never means blindly replaying the request.
Outbox `DEAD` and reconciliation-required rows, workflow effect uncertainty,
policy audit records, and correlation identifiers must be retained through the
incident review.

## Portability and restore evidence

Exports use a versioned manifest and AES-256-GCM encrypted SQL stream with a
SHA-256 artifact digest, workspace/schema binding, platform-version boundary,
active-table projection, and optional configuration-snapshot binding. Import is
fail-if-workspace-exists, rejects shared-user identity conflicts, executes in a
single database transaction, validates the restored workspace/schema/version,
and never reports success after an uncertain failure. Recovery-time and
recovery-point objectives remain `[UNVERIFIED]` until measured in the target
deployment.

## Exit decision

| Outcome                                     | Decision                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Any G1-G7 failure                           | `NO-GO / BLOCK_RELEASE`                                                          |
| G1-G7 pass, G8 incomplete                   | `CONDITIONAL GO` for non-production planning or isolated canary preparation only |
| G1-G8 accepted with target runtime evidence | Eligible for a separate production deployment authorization                      |

## Current branch evidence

| Check                                   | Result                                                                                                                                                                                                                                                                                                                    | Release interpretation                                                                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server direct typecheck                 | `npx tsgo -p tsconfig.json --noEmit` passed after the final integration isolation fixes, exit 0                                                                                                                                                                                                                           | Static server contract is coherent                                                                                                                                                                                                                        |
| Server production build                 | Fresh build passed; SWC compiled 8,149 files                                                                                                                                                                                                                                                                              | Server sources and assets compile under required Node 24.16.0                                                                                                                                                                                             |
| Shared Nx build                         | Passed without cache                                                                                                                                                                                                                                                                                                      | Vite, declarations, barrels, and alias rewrite complete under required Node 24.16.0                                                                                                                                                                       |
| Frontend direct typecheck               | Passed, exit 0                                                                                                                                                                                                                                                                                                            | Frontend type gate passes                                                                                                                                                                                                                                 |
| Frontend production build               | Fresh build passed; Vite transformed 27,122 modules                                                                                                                                                                                                                                                                       | Operator and metadata UI bundles successfully                                                                                                                                                                                                             |
| Browser E2E                             | The corrected focused suite passes setup plus nine cases in production and test modes (10/10 in 1.3 minutes each); production mode used an explicit local credentialed-origin allowlist and started from `packages/twenty-server` so TypeORM resolves compiled entities                                                   | A real Apple-only principal remains Apple-bound on metadata transport and is denied core controls on the YC host; authorized M5 draft persistence, unauthenticated denial, and CSRF no-write behavior pass; target HTTPS adversarial E2E remains required |
| Full server units                       | 1,100 suites and 7,457 tests passed; 4 suites and 15 tests skipped by their definitions; 116 snapshots passed; exit 0                                                                                                                                                                                                     | Fresh local regression passes; the earlier serial diagnostic found zero open handles, while the worker teardown warning remains `PROVE_NOW`                                                                                                               |
| Full frontend units                     | Four direct Jest shards passed: 1,160 suites, 6,873 tests, and 133 snapshots; every shard exit 0                                                                                                                                                                                                                          | Frontend inventory passes; non-deterministic monolithic worker `SIGSEGV` remains `PROVE_NOW` for hosted CI isolation                                                                                                                                      |
| Complete server integration inventory   | Four disposable-reset shards passed: 605 suites, 3,238 tests, and 859 snapshots; 2 suites and 26 tests skipped by their definitions; every final shard exit 0                                                                                                                                                             | Full local integration coverage passes; set `NODE_ENV=test` during reset so test-only security fixtures are seeded                                                                                                                                        |
| Ideal CRM and authorization integration | 16 suites and 103 tests passed                                                                                                                                                                                                                                                                                            | Guarded GraphQL, role compatibility, workspace/object/field/row/relation denial, RLS, cross-workspace policy/audit, transactional domain adoption, and PostgreSQL rollback pass                                                                           |
| Metadata integration regression         | 266 suites and 1,306 tests passed; 2 suites and 5 tests skipped by their definitions; 614 snapshots passed after a clean reset of the actual `test` database                                                                                                                                                              | Object/field REST and GraphQL destructive-change conflicts, application install/uninstall, same-batch relations/indexes/views, standard-object fields, and metadata compatibility pass together                                                           |
| MCP integration                         | 1 suite and 4 tests passed                                                                                                                                                                                                                                                                                                | MCP tool schema and persisted morph-target execution pass                                                                                                                                                                                                 |
| Queue and upgrade compatibility         | 7 suites and 20 tests passed; compiled dry-run discovered 304 steps and completed one seeded workspace with zero failures                                                                                                                                                                                                 | Trigger-job legacy denial and execution-time authority reconstruction are locally proven; strict `RunWorkflowJob` envelope and authenticated trigger provenance remain `BLOCK_RELEASE`                                                                    |
| Telemetry and extension units           | 13 suites and 59 tests passed; focused error trace-redaction regression passed                                                                                                                                                                                                                                            | Policy metrics/audit failures, provider uncertainty, Sentry allowlisting, and logic-function driver/VPC boundaries are locally covered                                                                                                                    |
| Portability units                       | 11 suites and 54 tests passed                                                                                                                                                                                                                                                                                             | Encryption, manifest, physical source nullability, DDL filtering, identity conflicts, and import failure paths are covered                                                                                                                                |
| Approval migration drill                | Disposable fast up/down/up and slow invalidation passed with exact column, constraint, index, and state-reset assertions                                                                                                                                                                                                  | Forward schema, isolated data backfill, and rollback mechanics are locally proven                                                                                                                                                                         |
| Live restore drill                      | Fresh encrypted export/import passed after a RED/GREEN fix for legacy nullable ACTOR subcolumns; 35 workspace and 74 workspace-scoped core table counts, 797 column definitions, 127 constraints, and 156 indexes matched with zero mismatches; duplicate import denied                                                   | Disposable positive restore, transaction rollback on the reproduced schema conflict, physical-schema parity, and fail-if-exists behavior are proven                                                                                                       |
| Lint and formatting                     | Direct type-aware Oxlint found zero errors and two known naming warnings on `MessageCampaignService`; server, authored frontend, shared, and renderer overlays pass; oxfmt matched 492 files clean; `git diff --check` passed                                                                                             | Authored modified and untracked TypeScript surfaces conform; generated GraphQL output remains generator-owned                                                                                                                                             |
| Test infrastructure warnings            | Server `silent` and frontend `testTimeout` validation warnings are removed; the server parallel worker teardown warning, intermittent Node 24 V8 GC frontend-worker crash, and Nx `twenty-ui:build` flake remain                                                                                                          | Keep the remaining warnings `PROVE_NOW`; isolated reruns and serial diagnostics pass, but target CI evidence is still required                                                                                                                            |
| Remote-DOM generator                    | Native async Prettier run exits in 1.5 seconds                                                                                                                                                                                                                                                                            | Removes the Node 24 build hang caused by the synchronous formatter worker                                                                                                                                                                                 |
| Ideal CRM recovery health               | Admin-only indicator unit tests pass; live PostgreSQL transitions report outbox dead, indexed orphaned allowed-policy evidence, and recovery without returning tenant data                                                                                                                                                | Supplies one fail-closed polling source; target alert delivery remains G8                                                                                                                                                                                 |
| Lambda executor configuration           | Three focused suites and 19 tests pass; existing executor reuse requires exact state/role/runtime/VPC/memory/timeout/storage/reserved-concurrency compliance; server build compiled 8,115 files                                                                                                                           | Source guardrails self-repair configuration and concurrency drift before invocation; deployed egress/account-capacity/IAM/secret evidence remains G8                                                                                                      |
| Workflow provider registry              | Focused RED/GREEN proved unknown providers previously reached the effect path; the runtime registry now rejects unknown/malformed contracts and keeps every registered adapter at one attempt without assumed idempotency or reconciliation                                                                               | Local fail-closed registration is proven; integration-specific target guarantees remain G8                                                                                                                                                                |
| Emailing and campaign authority         | 13 suites and 78 tests pass; direct/test email, campaign request/materialization/provider boundaries, current permission revocation, strict job envelopes, deterministic queue IDs, provider/persistence uncertainty, and audited webhook/statistics mutations are covered                                                | Local ordering and denial are proven; production provider reconciliation and alert delivery remain G8                                                                                                                                                     |
| AI actor identity boundary              | Focused RED/GREEN: 1 suite and 7 tests pass; current role is validated before cache-backed member resolution, agent/run-as identities reject deleted or inconsistent members, and foreign-workspace or foreign-user bindings deny                                                                                         | Agent and run-as actor construction reuse the tenant-keyed identity cache instead of acquiring local or indirect system authority; production role population remains G8                                                                                  |
| AI onboarding locale boundary           | Focused RED/GREEN: 1 suite and 3 tests pass; active tenant-bound cache identity supplies locale while deleted or foreign-user entries fall back safely                                                                                                                                                                    | Removes the remaining production AI/workflow ORM bypass without widening onboarding authority; host-language fallback remains available                                                                                                                   |
| Billing seat-update reliability         | Focused RED/GREEN: 5 suites and 11 tests pass; the job persists and verifies count/request identity before Stripe, supports BullMQ and synchronous-driver identities, reuses the snapshot across two bounded retries, propagates provider failures, and uses core membership count instead of workspace permission bypass | Ambiguous Stripe retries retain stable effect parameters and request keys; target Stripe behavior, failed-job alerting, and reconciliation drills remain G8                                                                                               |
| Dashboard tool authority                | Focused RED/GREEN: 9 suites and 32 tests pass; direct server typecheck, type-aware lint, formatting, and the 8,130-file server build pass; caller auth and scoped roles reach ORM reads/writes, dashboard system objects enforce object/field/RLS permissions, and static descriptors are recalculated before dispatch    | Read-only roles receive only read tools; missing, field-restricted, or row-restricted mutation authority denies before composite effects; target adversarial E2E remains required                                                                         |
| Direct dashboard duplication authority  | Focused RED reproduced restricted-role duplication before the fix; GREEN passes 1 suite/3 tests and the combined positive/negative 2-suite/7-test set; server typecheck, build, focused lint, and formatting pass                                                                                                         | Current object read/update, field, and RLS permissions are checked before page-layout duplication; hosted negative evidence remains required                                                                                                              |
| Application uninstall isolation         | Focused 4-test application integration suite and full 1,306-test metadata regression pass; direct database inspection found zero residual application tables or enum types                                                                                                                                                | Dry-run planning receives a structured clone, so mutable migration planning cannot consume the actual apply input and strand workspace schema objects                                                                                                     |

### Local adversarial browser and API proof

| Case    | Live trigger                                               | Required result                                                                   | Local evidence |
| ------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------- |
| E2E-S01 | Cookie-authenticated GraphQL mutation without `Origin`     | HTTP 403, `CSRF_ORIGIN_MISMATCH`, and no record                                   | Passed         |
| E2E-S02 | Active-session mutation with sibling-workspace `Origin`    | HTTP 403, `CSRF_ORIGIN_MISMATCH`, and no record                                   | Passed         |
| E2E-S03 | Apple-only access token calls metadata on the YC host      | Preserve Apple workspace binding; never rebind or disclose YC                     | Passed         |
| E2E-S04 | Unauthenticated metadata `currentWorkspace` query          | Deny without protected data or workspace disclosure                               | Passed         |
| E2E-S05 | Authorized administrator queries M5-M7 control surfaces    | Five registered control collections return without schema or authorization errors | Passed         |
| E2E-S06 | Authorized administrator creates an M5 draft               | Persist tenant-bound `DRAFT` version 1 without applying metadata effects          | Passed         |
| E2E-S07 | Apple-only access token calls core controls on the YC host | Deny with `data: null`, errors, and no YC disclosure                              | Passed         |
| E2E-S08 | Cookie-free client queries M5-M7 controls                  | Deny with `data: null`, errors, and no Apple disclosure                           | Passed         |
| E2E-S09 | Session-cookie metadata mutation omits `Origin`            | HTTP 403, `CSRF_ORIGIN_MISMATCH`, and unchanged change-set list                   | Passed         |

These cases execute against disposable PostgreSQL, Redis, server, worker, and
frontend processes. They strengthen G1/G2 and CSRF evidence but do not replace
target G8 configuration, routing, monitoring, load, recovery, or canary proof.

### Ideal CRM recovery-health contract

| Indicator state             | Meaning                                                                                                                    | Required operator action                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `OPERATIONAL`               | No counted outbox dead/reconciliation, workflow dead-letter/permanent/uncertain, or overdue allowed-policy evidence exists | Continue observation; do not infer that G8 or production readiness is complete                            |
| `OUTAGE` with count details | At least one durable recovery category is non-zero                                                                         | Pause protected rollout, query authorized tenant-scoped operator surfaces, reconcile, and retain evidence |
| `OUTAGE` without details    | Repository evaluation failed and the indicator denied by default                                                           | Treat monitoring as unavailable, investigate the health dependency, and keep protected rollout stopped    |

The admin route is an authenticated monitoring source. It deliberately returns
aggregate counts rather than tenant identifiers or business data. Production
polling interval, alert thresholds, delivery, ownership, acknowledgement,
escalation, retention, and capacity remain G8 deployment responsibilities.

This evidence is local to `codex/ideal-crm-guide-task-1` at baseline
`adc2839d26660cf452995e9308c7237653dafd27` plus the uncommitted implementation
diff. It does not validate production configuration, traffic, providers,
alert delivery, backup scheduling, recovery objectives, or live tenant data.
