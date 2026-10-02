---
title: Twenty CRM P0 Policy Contracts Implementation Guide
version: 1.0.0
status: BLOCK_RELEASE
created_date: 2026-09-01
tags:
  - twenty-crm
  - policy
  - authorization
  - audit
  - observability
  - guide
confidence: 97
owner: MIKKOH
---

# Twenty CRM P0 Policy Contracts Implementation Guide

## Decision and scope

| Field                          | Value                                                                     |
| ------------------------------ | ------------------------------------------------------------------------- |
| Decision                       | `DEC-STRATEGY-P0-ADR-003` and `DEC-WORKFLOW-TRIGGER-INGRESS-005` accepted |
| Baseline                       | `adc2839d26660cf452995e9308c7237653dafd27`                                |
| Approved ADRs                  | ADR-P0-001 through ADR-P0-007                                             |
| External strategy digest       | `8c7a2a63250374eba54c93cd6c977b8a10e0aae8269907169a89afb99738dd86`        |
| Ingress repair                 | `docs/plans/scan-assess-trigger-ingress-scope-repair.md`                  |
| Runtime / deployment / release | `BLOCK_RELEASE`                                                           |

This guide freezes contracts and now records the implementation boundary. Focused tests
prove selected contracts, but do not prove all production paths. Existing authentication,
role resolution, object permissions, field restrictions, RLS, and workspace schema
isolation remain authoritative enforcement primitives; this design must not duplicate or
bypass them.

## Evidence labels

| Label              | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `[VERIFIED]`       | Pinned repository code, authority document, or command output directly supports the statement |
| `[INFERRED]`       | A bounded conclusion from verified evidence                                                   |
| `[UNKNOWN]`        | Runtime or deployment evidence is unavailable                                                 |
| `[RECOMMENDATION]` | The required implementation choice                                                            |

## Present-state constraints

| Claim                                                                                                              | Label        | Consequence                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System auth resolves to permission bypass in current ORM role configuration.                                       | `[VERIFIED]` | System context is limited to bootstrap/control metadata and cannot authorize protected business effects.                                                                                    |
| The pinned baseline allowed unresolved workflow role configuration to fall back to bypass.                         | `[VERIFIED]` | The implementation branch removes that exact fallback and denies system-bypass or cross-workspace workflow-version reads; remaining workflow bypasses require separate path classification. |
| Automated trigger relation enrichment reads under explicit bypass before queueing.                                 | `[VERIFIED]` | Trigger ingress is a separate policy boundary governed by the scope-repair contract.                                                                                                        |
| Existing ORM implements object, field, row, role-intersection, and tenant enforcement.                             | `[VERIFIED]` | Policy foundation validates identity and binding, then delegates resource enforcement to existing primitives.                                                                               |
| Production Sentry, role population, provider idempotency, alert delivery, and load/cardinality behavior are known. | `[UNKNOWN]`  | Each remains a release gate requiring independent operational evidence.                                                                                                                     |

## ADR translation

| ADR        | Frozen decision                                                                                | Prohibited alternative                                             |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ADR-P0-001 | Add one internal policy context over current auth and permission primitives.                   | Parallel authentication or a second permission graph               |
| ADR-P0-002 | Decide, persist durable intent when required, execute once, then persist outcome or reconcile. | Effect-before-policy or success-without-outcome evidence           |
| ADR-P0-003 | Workers reconstruct current workspace-bound authority from persisted identifiers.              | Trusting job role fields, system context, or fallback admin/bypass |
| ADR-P0-004 | Store append-only primary policy audit evidence in PostgreSQL with idempotent event keys.      | Best-effort logs as the primary audit ledger                       |
| ADR-P0-005 | Server owns immutable root correlation; each decision and attempt is unique.                   | Trusting inbound/model/job identifiers as the root                 |
| ADR-P0-006 | Audit and telemetry metadata use a closed allowlist.                                           | Recursive blacklist scrubbing or raw payload capture               |
| ADR-P0-007 | Rollout controls can disable paths but never make unresolved authority succeed.                | Fail-open compatibility flag or vulnerable worker rollback         |

## Canonical types

### Authority primitives

```ts
export type PolicyRiskClass = 'R0' | 'R1' | 'R2' | 'R3';

export type PolicyActor =
  | Readonly<{
      type: 'user';
      id: string;
      workspaceMemberId: string;
      applicationId?: string;
    }>
  | Readonly<{ type: 'apiKey'; id: string }>
  | Readonly<{ type: 'application'; id: string }>
  | Readonly<{
      type: 'system';
      id: null;
      serviceAuthorityId: string;
    }>;

export type PolicyAuthoritySource =
  | 'CALLER_BOUND'
  | 'DELEGATED_APPLICATION'
  | 'SCOPED_SERVICE_PRINCIPAL'
  | 'LEGACY_RECONSTRUCTED';

export type ScopedRolePermissionConfig =
  | Readonly<{ unionOf: readonly [string, ...string[]] }>
  | Readonly<{ intersectionOf: readonly [string, ...string[]] }>;

export type PolicyAuthority =
  | Readonly<{
      type: 'roles';
      source: Exclude<PolicyAuthoritySource, 'SCOPED_SERVICE_PRINCIPAL'>;
      rolePermissionConfig: ScopedRolePermissionConfig;
      authorityVersion: string;
      revocationState: 'ACTIVE';
      evaluatedAt: string;
    }>
  | Readonly<{
      type: 'service';
      source: 'SCOPED_SERVICE_PRINCIPAL';
      serviceAuthorityId: string;
      allowedOperations: readonly string[];
      maximumRiskClass: 'R0';
      authorityVersion: string;
      revocationState: 'ACTIVE';
      evaluatedAt: string;
    }>;
```

The concrete implementation imports and excludes the repository-native
`RolePermissionConfig` bypass member rather than maintaining a duplicate role type. The
expanded type above documents the only shapes valid at the protected boundary.

### Tenant-bound context

```ts
export type PolicyTarget = Readonly<{
  objectMetadataId?: string;
  recordIds?: readonly string[];
  fieldMetadataIds?: readonly string[];
  resourceType: string;
  resourceId?: string;
}>;

export type PolicyCorrelationContext = Readonly<{
  rootCorrelationId: string;
  decisionId: string;
  attemptId: string;
  traceId?: string;
  jobId?: string;
  workflowRunId?: string;
  mutationOrEffectId?: string;
}>;

export type PolicyContext = Readonly<{
  schemaVersion: 1;
  policyVersion: 'p0-v1';
  workspaceId: string;
  actor: PolicyActor;
  authority: PolicyAuthority;
  operation: string;
  riskClass: PolicyRiskClass;
  target: PolicyTarget;
  affectedFieldMetadataIds: readonly string[];
  correlation: PolicyCorrelationContext;
}>;
```

Required strings are non-empty and bounded. IDs that refer to persisted entities are
valid UUIDs. Collections are deduplicated, sorted before digesting, bounded, and
non-empty when the operation requires a concrete target. The workspace binding is
verified against actor, application/service descriptor, roles, target, run, workflow,
and audit persistence before any protected boundary.

## Authority states

| State                          | Required evidence                                                                                 | Protected result                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `CALLER_BOUND_ACTIVE`          | Current user or API key, current workspace membership/key map, same-workspace roles               | Evaluate current existing permissions                       |
| `DELEGATED_APPLICATION_ACTIVE` | Current caller when applicable, active app, explicit app role, required intersection              | Evaluate intersection; one denial wins                      |
| `SCOPED_SERVICE_ACTIVE`        | Compile-time registered service ID, same workspace, operation allowlist, R0 maximum               | Control-metadata read only                                  |
| `LEGACY_RECONSTRUCTED_ACTIVE`  | Unambiguous persisted origin, current principal, explicit current role, tagged legacy correlation | Evaluate current permissions and append new decision        |
| `REVOKED`                      | Principal, membership, application, credential, role, or service descriptor is inactive           | Deny `AUTHORITY_REVOKED`                                    |
| `UNRESOLVED`                   | Required principal, role, workspace, or persisted origin cannot be resolved                       | Deny `AUTHORITY_UNRESOLVED`                                 |
| `MALFORMED`                    | Invalid schema, identifier, collection, operation, digest, or field shape                         | Deny `POLICY_CONTEXT_MALFORMED`                             |
| `LEGACY_AMBIGUOUS`             | Old job or run lacks one unambiguous current authority                                            | Deny `AUTHORITY_UNRESOLVED`                                 |
| `CROSS_WORKSPACE_MISMATCH`     | Any actor, role, target, run, workflow, job, or decision belongs elsewhere                        | Deny `POLICY_CONTEXT_MISMATCH` without existence disclosure |
| `BYPASS_BEARING`               | Role config or payload contains `shouldBypassPermissionChecks` or equivalent                      | Deny `BYPASS_AUTHORITY_FORBIDDEN`                           |

## Pure validator contract

```ts
export type PolicyContextDenialReason =
  | 'AUTHORITY_REVOKED'
  | 'AUTHORITY_UNRESOLVED'
  | 'BYPASS_AUTHORITY_FORBIDDEN'
  | 'IDENTITY_MISSING'
  | 'POLICY_CONTEXT_MALFORMED'
  | 'POLICY_CONTEXT_MISMATCH'
  | 'POLICY_VERSION_UNSUPPORTED'
  | 'SERVICE_OPERATION_FORBIDDEN'
  | 'SERVICE_RISK_FORBIDDEN'
  | 'TENANT_CONTEXT_MISSING';

export type PolicyContextValidation =
  | Readonly<{ valid: true; context: PolicyContext }>
  | Readonly<{
      valid: false;
      reason: PolicyContextDenialReason;
      safeDetails?: Readonly<{ field: string; classification: string }>;
    }>;

export const validatePolicyContext = (
  candidate: unknown,
): PolicyContextValidation;
```

`validatePolicyContext` is deterministic, synchronous, and side-effect-free. It does
not query state or authorize resources. The context builder performs current-state
lookups; the pure validator rejects invalid structure and forbidden authority shapes;
the policy decision service compares all persisted tenant and revocation bindings; the
existing ORM/tool executor remains final resource enforcement.

### Validation order

| Order | Check                                                                             | Safe denial                                                |
| ----: | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
|     1 | Candidate is a plain bounded object with schema and policy version 1              | `POLICY_CONTEXT_MALFORMED` or `POLICY_VERSION_UNSUPPORTED` |
|     2 | Workspace, operation, target, actor, and correlation fields are present and valid | `TENANT_CONTEXT_MISSING`, `IDENTITY_MISSING`, or malformed |
|     3 | Authority shape contains no bypass or unknown member                              | `BYPASS_AUTHORITY_FORBIDDEN` or malformed                  |
|     4 | Role sets are non-empty, unique, and bounded                                      | `AUTHORITY_UNRESOLVED`                                     |
|     5 | Service operation and risk are within the static R0 descriptor                    | `SERVICE_OPERATION_FORBIDDEN` or `SERVICE_RISK_FORBIDDEN`  |
|     6 | Actor and authority-source variants are compatible                                | `POLICY_CONTEXT_MISMATCH`                                  |
|     7 | Correlation IDs are valid and no untrusted field claims root ownership            | malformed or mismatch                                      |

No error includes raw arguments, payload values, credentials, tokens, model text,
record values, or foreign resource details.

## Fail-closed truth table

| Input                        |         R0 control read |                   R1 write |                       R2/R3 effect | Side-effect assertion                     |
| ---------------------------- | ----------------------: | -------------------------: | ---------------------------------: | ----------------------------------------- |
| Valid current user authority |        Policy evaluated |           Policy evaluated |          Approval policy evaluated | Existing ORM/tool denial still wins       |
| Valid API key and role map   |        Policy evaluated |           Policy evaluated |          Approval policy evaluated | Revoked/expired key yields zero call      |
| Valid user via app           |  Intersect user and app |     Intersect user and app |            Intersect plus approval | Any denied dimension wins                 |
| Valid app-only authority     |       Explicit app role | Automation policy required |      Approval/preapproval required | No admin fallback                         |
| Valid scoped service         |     Allowlisted R0 only |                       Deny |                               Deny | No business mutation or provider call     |
| Missing role or actor        |                    Deny |                       Deny |                               Deny | Zero protected call                       |
| Malformed or identity-less   |                    Deny |                       Deny |                               Deny | Zero repository/tool/provider call        |
| Revoked after enqueue        |    Deny current attempt |                       Deny |     Deny/reconcile prior ambiguity | Stale payload is not authority            |
| Workspace mismatch           |             Opaque deny |                Opaque deny |                        Opaque deny | No existence signal or cross-schema probe |
| Legacy unambiguous           |  Reconstruct and decide |     Reconstruct and decide | Reconstruct plus required controls | New decision/attempt IDs                  |
| Legacy ambiguous             |                    Deny |                       Deny |                               Deny | Dead-letter/operator evidence             |
| Bypass-bearing context       |                    Deny |                       Deny |                               Deny | Cannot cross protected boundary           |
| MCP annotation claims safe   | No authorization effect |    No authorization effect |            No authorization effect | Concrete action determines risk           |

Missing, invalid, revoked, identity-less, cross-workspace, or bypass-bearing protected
contexts deny before protected mutation, ORM write, external provider call, MCP tool
invocation, workflow action, or any other side effect.

## Policy decision contract

```ts
export type PolicyDecisionOutcome = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export type PolicyDecision = Readonly<{
  schemaVersion: 1;
  id: string;
  parentDecisionId?: string;
  workspaceId: string;
  contextDigest: string;
  outcome: PolicyDecisionOutcome;
  reasonCodes: readonly string[];
  policyVersion: 'p0-v1';
  evaluatedAt: string;
  correlation: PolicyCorrelationContext;
}>;
```

The context digest is SHA-256 over a canonical key-sorted representation. It binds
evidence but grants no authority. M2 uses a separate canonical action digest covering
workspace, actor, concrete action, target, arguments, expiry, and approval identity.

## Ordered protected operation

| Phase     | Durable requirement                                  | Failure behavior                                    |
| --------- | ---------------------------------------------------- | --------------------------------------------------- |
| Validate  | Pure shape plus current authority and tenant binding | Deny; no effect                                     |
| Decide    | Persist immutable decision evidence                  | Failure blocks protected effect                     |
| Intent    | Persist idempotent `INTENT` for R2/R3 before effect  | `AUDIT_UNAVAILABLE`; no effect                      |
| Effect    | Invoke the already-authorized executor exactly once  | Append failed/unknown outcome                       |
| Outcome   | Persist `SUCCEEDED`, `FAILED`, or `UNKNOWN`          | Post-effect failure becomes reconciliation-required |
| Reconcile | Query provider/current state when supported          | Never auto-repeat an uncertain external effect      |

## Audit envelopes

```ts
export type PolicyAuditMetadata = Readonly<{
  targetCount?: number;
  argumentDigest?: string;
  idempotencyKeyDigest?: string;
  providerClass?: string;
  providerReferenceDigest?: string;
  correlationSource?: 'SERVER_GENERATED' | 'LEGACY_WORKFLOW_RUN_ID';
  workflowVersionId?: string;
  replayOfAttemptId?: string;
  payloadSchemaVersion?: number;
  payloadDigest?: string;
  payloadClassification?: 'CONTROL' | 'BUSINESS_RESTRICTED';
}>;

export type PolicyAuditIntent = Readonly<{
  schemaVersion: 1;
  eventId: string;
  eventKey: string;
  phase: 'DECISION' | 'INTENT';
  workspaceId: string;
  actor: PolicyActor;
  authoritySource: PolicyAuthoritySource;
  operation: string;
  riskClass: PolicyRiskClass;
  target: Readonly<{ resourceType: string; resourceId?: string }>;
  affectedFieldMetadataIds: readonly string[];
  policyDecisionId: string;
  policyOutcome: PolicyDecisionOutcome;
  reasonCodes: readonly string[];
  contextDigest: string;
  correlation: PolicyCorrelationContext;
  metadata: PolicyAuditMetadata;
  occurredAt: string;
}>;

export type PolicyAuditOutcome = Readonly<{
  schemaVersion: 1;
  eventId: string;
  eventKey: string;
  phase: 'OUTCOME' | 'RECONCILIATION';
  workspaceId: string;
  policyDecisionId: string;
  result: 'success' | 'denied' | 'failed' | 'partial' | 'unknown';
  reasonCodes: readonly string[];
  correlation: PolicyCorrelationContext;
  metadata: PolicyAuditMetadata;
  occurredAt: string;
}>;
```

Append is idempotent by workspace and event key. A duplicate is accepted only when its
phase, decision, and digest match exactly. No update/delete API is exported. Primary
ledger failure before R2/R3 blocks; post-effect outcome failure returns
`RECONCILIATION_REQUIRED` and prevents automatic retry.

## Correlation ownership

| Identifier          | Owner                              | Lifecycle                                          | Metric-label rule |
| ------------------- | ---------------------------------- | -------------------------------------------------- | ----------------- |
| Root correlation ID | Server request/ingress adapter     | Immutable across transports                        | Forbidden         |
| Decision ID         | Policy decision service            | Unique per evaluation                              | Forbidden         |
| Job ID              | Queue driver                       | Unique delivery identity; not business idempotency | Forbidden         |
| Workflow run ID     | Workflow runner                    | Stable run identity                                | Forbidden         |
| Attempt ID          | Worker/protected-operation adapter | New for every retry/replay/evaluation              | Forbidden         |
| Mutation/effect ID  | M3 effect ledger                   | Stable per protected business effect               | Forbidden         |
| Trace ID            | Telemetry SDK                      | Span lineage only; not authorization               | Forbidden         |
| Audit event ID      | Audit service                      | Unique append identity                             | Forbidden         |

Incoming headers, MCP JSON-RPC IDs, model output, arbitrary job data, and trace IDs do
not become policy roots. A validated persisted origin decision may propagate the
server-owned root. Messaging instrumentation propagates context while policy separately
validates the durable root binding.

## Redaction and telemetry

| Sink          | Allowed                                                          | Forbidden                                                                              |
| ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Primary audit | Typed envelope and closed metadata                               | Raw payload, arguments, record values, tokens, credentials, model input/output         |
| Event mirror  | Event ID, phase, action class, risk, result, reasons, root, time | Actor/resource IDs, metadata, provider payload/reference                               |
| Logs/errors   | Stable reason and bounded operation class                        | Raw exception messages when they may contain customer/provider data                    |
| Traces        | Low-cardinality operation, risk, outcome, safe reason class      | CRM values, IDs as metric dimensions, prompts/responses, secrets                       |
| Metrics       | Bounded actor/operation/risk/outcome/reason/transport classes    | Workspace, actor, record, root, attempt, trace, job, provider reference, raw tool name |

Unknown metadata keys reject before persistence. Runtime validation enforces types,
lengths, counts, UUID/hex formats, total serialized size, and sentinel-secret exclusion.
Telemetry views and exemplar behavior are tested at the exported sink; dropping an
attribute from metric dimensions is not by itself proof that exemplar data is safe.

## Seven mandatory scenario tests

| Scenario                    | Fixture                                                               | Trigger                       | Required assertions                                                                        |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Unresolved role             | App-only run with no explicit app/admin role                          | Worker reconstructs authority | `AUTHORITY_UNRESOLVED`; no ORM mutation, tool, provider, workflow action, or bypass config |
| Cross-workspace mismatch    | Workspace A job references B run/record/member                        | Worker/ingress validation     | Opaque deny; no B probe/disclosure/effect; safe A-scoped evidence only                     |
| Post-enqueue revocation     | Valid origin then remove role/principal before attempt                | Worker consumes job           | Current state wins; deny before new effect; prior uncertainty reconciled                   |
| Identity-less tool          | Protected tenant tool without resolvable principal/service descriptor | Tool dispatch                 | Deny before handler; annotations and arguments cannot supply authority                     |
| Audit-sink failure          | Inject primary failure before effect and outcome failure after effect | Protected operation           | Pre-effect zero call; post-effect reconciliation-required, no success/resend               |
| Cross-transport correlation | HTTP or MCP request queues workflow and executes effect               | End-to-end path               | Root stable; decision/job/run/attempt/effect/trace/audit identifiers join correctly        |
| Trace/audit redaction       | Sentinel token, credential, CRM value, model input/output             | Every sink/export             | Sentinel absent; unsafe event rejects; no critical effect without safe evidence            |

Each case records setup, trigger, expected result, prohibited calls, audit assertion, and
correlation assertion. Tests must fail if the handler was called even when the final
state subsequently appears denied.

## Requirement traceability

| Requirement                | Contract owner                          | Primary proof                                                        |
| -------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| M1-01 request context      | Context builder + request adapter       | User/API-key allow and missing actor/workspace/role zero-call denial |
| M1-02 worker parity        | Worker reconstruction + existing ORM    | Request/worker object, field, and RLS result equivalence             |
| M1-03 app authority        | Application resolver                    | Explicit current role; no-role returns no bypass                     |
| M1-04 tenant isolation     | Context validator + scoped repositories | Two-workspace opaque denial and zero effect                          |
| M1-05 revocation           | Current-state authority resolver        | Revoke-after-enqueue denial                                          |
| M1-06 retry lineage        | Correlation builder                     | Stable root/run and unique attempt/decision/job                      |
| M2-01 concrete risk        | Action registry                         | Wrapper annotation cannot downgrade R2/R3                            |
| M2-02 R1 automation        | Agent action policy                     | Role allow without automation policy denies                          |
| M2-03 R2/R3 approval       | Approval store + action digest          | Missing/expired/reused/mismatched approval denies                    |
| M2-04 role denial wins     | Policy decision service                 | Valid approval plus role denial yields zero effect                   |
| M2-05 exact action digest  | Canonical digest utility                | Target or argument change invalidates approval                       |
| M2-06 kill switches        | Agent action policy                     | Agent write denied while human read remains                          |
| M2-07 model isolation      | Tool registry/executor                  | Prompt fields cannot alter risk, policy, or approval                 |
| M3-01 effect idempotency   | Durable effect ledger                   | Concurrent duplicate delivery calls provider once                    |
| M3-02 bounded retry        | Retry policy registry                   | Permanent/exhausted failure cannot cycle indefinitely                |
| M3-03 ambiguous outcome    | Capability registry + reconciliation    | Timeout-after-success does not resend                                |
| M3-04 lifecycle/DLQ        | Workflow execution state                | Poison job reaches operator-visible terminal state                   |
| M3-05 replay               | Replay authorization + lineage          | Unauthorized duplicate replay has zero provider call                 |
| M3-06 queue telemetry      | Queue metrics                           | Backlog/age observable without identifiers as labels                 |
| M4-01 auth/deny audit      | Policy audit service                    | Allow and deny both emit safe attributable evidence                  |
| M4-02 reconstruction       | Audit envelope                          | Actor/workspace/action/target/policy/result join without payload     |
| M4-03 cross-transport join | Correlation contract                    | Request/MCP through audit end-to-end join                            |
| M4-04 redaction            | Closed metadata validator               | Sink-level sentinel absence                                          |
| M4-05 audit durability     | Ordered operation                       | Fault-injected block and reconciliation semantics                    |

The trigger-ingress extensions M1I-01 through M4I-04 are implemented and tested through
the scope-repair artifact; they are required consumers of the same contracts.

## Threat traceability

| Threat                   | Contract response                            | Required proof                          |
| ------------------------ | -------------------------------------------- | --------------------------------------- |
| TF-01 user request       | Current membership and scoped context        | Request integration                     |
| TF-02 API key            | Current key, expiry/revocation, role map     | API/MCP negative integration            |
| TF-03 user via app       | User/application role intersection           | One-deny-wins tests                     |
| TF-04 app-only workflow  | Explicit app role and no fallback            | Worker unit/integration                 |
| TF-05 worker bootstrap   | R0 system descriptor and persisted ownership | Cross-workspace worker test             |
| TF-06 MCP wrapper        | Concrete action classification               | Annotation and malicious-argument tests |
| TF-07 identity-less tool | Empty contextless protected allowlist        | Zero-handler-call test                  |
| TF-08 retry/replay       | New decision each attempt and M3 ledger      | Duplicate/uncertain/replay tests        |
| TF-09 revoked authority  | Execution-time current-state resolution      | Revoke-after-enqueue matrix             |
| TF-10 pre-effect audit   | Durable primary intent                       | Audit failure injection                 |
| TF-11 post-effect audit  | Unknown outcome and reconciliation           | Provider-success/outcome-failure test   |
| TF-12 export/redaction   | Closed allowlist and sink validation         | Sentinel end-to-end suite               |

## Compatibility and migration

| Surface             | Required behavior                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Legacy job          | Optional reader fields permit parsing; current authority reconstruction must be unambiguous or deny       |
| In-flight queue     | Pause until only fail-closed workers consume protected jobs; do not rewrite/delete jobs                   |
| Existing workspace  | Idempotently backfill explicit standard-app role; unresolved workspaces remain disabled                   |
| Self-hosted upgrade | Up/down/up migration evidence in disposable fixtures; deny unknown policy/payload versions                |
| Retry/replay        | Preserve root/run/effect lineage; mint attempt/decision; current authority wins                           |
| Feature flag        | Can disable registration/effects; cannot bypass missing authority or audit requirements                   |
| Rollback            | Pause protected automation, retain evidence, forward-fix workers/schema; never restore fail-open fallback |
| Provider variance   | Register proven idempotency/reconciliation capability; unsupported effects receive no automatic retry     |

## Implementation boundaries

| Task | Scope                                                                             | Gate                                                    |
| ---: | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
|    1 | Pure types, validator, canonical digest, metadata validator, unit tests           | Red/green focused tests and typecheck                   |
|    2 | Audit entity/service/module, generated forward migration, idempotent append tests | Migration up/down/up plus fault injection               |
|    3 | Request/MCP/queue correlation adapters and actual job context                     | Transport lineage integration                           |
|    4 | Fail-closed workflow authority, role migration, trigger-ingress minimization      | Unresolved/cross-workspace/revocation tests             |
|    5 | MCP/tool concrete-action policy propagation                                       | Annotation, injection, RLS, field-denial tests          |
|    6 | Redaction, Sentry-safe defaults, bounded metrics, audit mirror                    | Sink-level sentinel and cardinality tests               |
|    7 | M1/M4 integration and compatibility gate                                          | Full negative, migration, and rollback suite            |
|    8 | M2 agent action policy and approvals                                              | Exact approval/digest/role/kill-switch tests            |
|    9 | M3 effect ledger, lifecycle, DLQ, reconciliation                                  | Duplicate, poison, ambiguous-outcome tests              |
|   10 | M5-M10 in approved order                                                          | Module-specific planning and gates before each mutation |

## Exact Task 1 future files

| Operation | Path                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Create    | `packages/twenty-server/src/engine/core-modules/policy/types/policy-context.type.ts`                 |
| Create    | `packages/twenty-server/src/engine/core-modules/policy/types/policy-decision.type.ts`                |
| Create    | `packages/twenty-server/src/engine/core-modules/policy/types/policy-audit-metadata.type.ts`          |
| Create    | `packages/twenty-server/src/engine/core-modules/policy/types/policy-audit-event.type.ts`             |
| Create    | `packages/twenty-server/src/engine/core-modules/policy/utils/validate-policy-context.util.ts`        |
| Create    | `packages/twenty-server/src/engine/core-modules/policy/utils/build-policy-context-digest.util.ts`    |
| Create    | `packages/twenty-server/src/engine/core-modules/policy/utils/validate-policy-audit-metadata.util.ts` |
| Create    | Colocated unit tests for each pure utility                                                           |

Task 2 and subsequent paths remain those mapped in the accepted strategy plus the trigger
listener/job/test candidates in the scope-repair artifact. Exact migration filenames are
generated at execution time and never invented or written by hand.

## Release gates

| Gate                         | Status                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| G1 no bypass on absence      | `BLOCK_RELEASE` — source still contains fallback                 |
| G2 workspace-bound authority | `BLOCK_RELEASE` — negative integration evidence absent           |
| G3 execution-time revocation | `BLOCK_RELEASE` — runtime enforcement absent                     |
| G4 durable audit             | `BLOCK_RELEASE` — ledger and fault-injection evidence absent     |
| G5 correlation continuity    | `BLOCK_RELEASE` — end-to-end join evidence absent                |
| G6 sensitive-data exclusion  | `BLOCK_RELEASE` — sink-level evidence absent                     |
| G7 compatibility             | `BLOCK_RELEASE` — migrations/in-flight/self-host evidence absent |
| G8 production validation     | `BLOCK_RELEASE` — deployment evidence remains unknown            |

## Known unknowns

| Unknown                               | Required proof                                                              |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Production Sentry PII and AI capture  | Read-only deployed configuration and sink capture review                    |
| Existing standard-app role population | Workspace inventory and migration dry run                                   |
| Provider idempotency/reconciliation   | Provider capability matrix and controlled fault tests                       |
| Audit-gap alert delivery              | Alert routing, acknowledgement, escalation, and test delivery evidence      |
| Production load/cardinality           | Approved workload, SLO, sampling, retention, and exporter cardinality tests |

## Gate result

The contracts are implementation-ready for Task 1. They are not runtime-ready and do
not authorize a release. Every downstream task must preserve the fail-closed validator,
current-state authority reconstruction, ordered audit/effect semantics, immutable root
correlation, closed metadata allowlist, and trigger-ingress boundary.

## Stop condition

`CODEX_TWENTYCRM_IDEAL_CRM_GUIDE_TASK_1_COMPLETE_RUNTIME_BLOCKED`
