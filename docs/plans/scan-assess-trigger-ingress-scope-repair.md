---
title: Twenty CRM P0 Workflow Trigger Ingress Scope Repair
version: 1.0.0
status: BLOCK_RELEASE
created_date: 2026-09-01
tags:
  - twenty-crm
  - workflow
  - authorization
  - security
  - scan
  - assess
confidence: 98
owner: MIKKOH
---

# Twenty CRM P0 Workflow Trigger Ingress Scope Repair

## Gate decision

| Field          | Decision                                        |
| -------------- | ----------------------------------------------- |
| Decision       | `DEC-WORKFLOW-TRIGGER-INGRESS-005` accepted     |
| Baseline       | `adc2839d26660cf452995e9308c7237653dafd27`      |
| Finding        | `WORKFLOW_TRIGGER_PAYLOAD_AUTHORITY_BYPASS`     |
| Classification | `BLOCK_RELEASE`                                 |
| Runtime state  | Unchanged by this artifact                      |
| GUIDE state    | May resume only with this boundary incorporated |

This document extends, and does not silently revise, ADR-P0-001 through ADR-P0-007.
Runtime, deployment, and release remain `BLOCK_RELEASE` until the requirements and tests
defined here are implemented and evidenced.

## Claim discipline

| Label              | Meaning in this artifact                                          |
| ------------------ | ----------------------------------------------------------------- |
| `[VERIFIED]`       | Directly supported by pinned source or an observed command result |
| `[INFERRED]`       | Security or reliability consequence derived from verified source  |
| `[UNKNOWN]`        | Evidence is insufficient at the pinned baseline                   |
| `[RECOMMENDATION]` | Required future-state design; not present-state behavior          |

## Pinned source evidence

| ID     | Claim                                                                                                                                         | Classification | Evidence                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| TI-E01 | The database trigger listener clones event batches before enrichment.                                                                         | `[VERIFIED]`   | `workflow-database-event-trigger.listener.ts` handlers call `structuredClone` before enrichment. |
| TI-E02 | Relation enrichment constructs a system auth context and requests related-object repositories with `shouldBypassPermissionChecks: true`.      | `[VERIFIED]`   | `enrichRecordsWithRelations` at the pinned baseline.                                             |
| TI-E03 | Relation enrichment uses unrestricted `find` results and attaches the matching related record object to `before` or `after`.                  | `[VERIFIED]`   | `relatedObjectRepository.find` and assignment to `record[joinField.name]`.                       |
| TI-E04 | Each matching event is serialized into `WorkflowTriggerJobData.payload` with workspace and workflow IDs.                                      | `[VERIFIED]`   | `handleEvent` queues `WorkflowTriggerJob` with `{ workspaceId, workflowId, payload }`.           |
| TI-E05 | The job contract has no schema version, provenance, policy version, payload classification, correlation, idempotency, or expiry field.        | `[VERIFIED]`   | `WorkflowTriggerJobData` contains only `workspaceId`, `workflowId`, and `payload`.               |
| TI-E06 | The worker opens the payload-selected workspace under system context and reads workflow configuration through explicit permission bypass.     | `[VERIFIED]`   | `WorkflowTriggerJob.handle` uses `buildSystemAuthContext` and a bypassed workflow repository.    |
| TI-E07 | The worker forwards the queued payload directly to `WorkflowRunnerWorkspaceService.run`.                                                      | `[VERIFIED]`   | `payload: data.payload` in the runner call.                                                      |
| TI-E08 | Subsequent workflow execution context can resolve no application/admin role to `shouldBypassPermissionChecks: true`.                          | `[VERIFIED]`   | `workflow-execution-context.service.ts` fallback expression at the pinned baseline.              |
| TI-E09 | Downstream execution authorization cannot remove values already retained in a queue payload.                                                  | `[INFERRED]`   | Queue serialization precedes workflow execution context reconstruction.                          |
| TI-E10 | The exact production exposure, queue retention, Sentry configuration, and affected workspace population are not established by static source. | `[UNKNOWN]`    | Requires controlled runtime and deployment evidence.                                             |

## Boundary decomposition

| Boundary            | Trusted input                                       | Authority requirement                                                                | Forbidden shortcut                                           | Failure posture                                   |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| Event admission     | Typed internal event plus owning workspace identity | Workspace must exist and own the emitted metadata and record reference               | Treating an internal event as inherently authorized          | Deny before metadata or business-record read      |
| Trigger discovery   | Workspace-bound trigger cache                       | Active workflow and trigger must belong to the same workspace                        | Cross-workspace cache/key reuse                              | Return no candidate and emit safe denial evidence |
| Filter evaluation   | Allowed event projection                            | Filter fields must be authorized for the delegated workflow/app context              | Evaluating against unrestricted hydrated entities            | Deny candidate; disclose no restricted value      |
| Relation enrichment | Same-workspace immutable references                 | Protected business reads use explicit role/service scope and object/field/row policy | Generic system context or permission bypass                  | Read no related business record; enqueue nothing  |
| Serialization       | Validated minimal projection                        | Schema, tenant, provenance, classification, policy version, expiry, digest           | Arbitrary object payload or embedded authority claims        | Reject before queue add                           |
| Queue persistence   | Versioned trigger envelope                          | Durable idempotency and bounded retention independent of queue job lifetime          | Assuming BullMQ job ID is a permanent effect ledger          | No runnable job on invalid envelope               |
| Worker bootstrap    | Tenant-bound opaque identifiers                     | System authority may read only minimum workflow-control metadata                     | Using bootstrap authority for business action                | Deny before run mutation or action dispatch       |
| Worker revalidation | Persisted references and current state              | Rebuild current actor/app/service authority and permitted data projection            | Trusting enqueue-time role or hydrated data                  | Deny or safe re-fetch; never widen                |
| Protected effect    | Current policy decision and durable audit intent    | Existing object/field/RLS checks plus M2/M3 controls                                 | Model output, MCP hint, or workflow payload as authorization | Zero effect on deny; reconcile ambiguous outcomes |

## Trigger-ingress requirements

These requirements extend the existing 24 M1-M4 requirements. They use the `M1I`,
`M3I`, and `M4I` prefixes to avoid renumbering accepted requirements.

| ID     | Requirement                                  | Acceptance rule                                                                                                                              | Traceability                                       |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| M1I-01 | Event admission is tenant-bound.             | Missing or foreign workspace, object metadata, or record binding produces no enrichment or job.                                              | M1-01, M1-04; TF-01, TF-05; S7 workspace isolation |
| M1I-02 | Trigger authority is explicit.               | Each workflow trigger resolves an active same-workspace application/workflow authority before protected filtering or enrichment.             | M1-02, M1-03, M1-05; TF-04, TF-09                  |
| M1I-03 | System bootstrap is metadata-only.           | System authority may retrieve only documented workflow-control metadata under an R0 service descriptor.                                      | M1-02; TF-05, TF-07                                |
| M1I-04 | Business-record reads use scoped authority.  | Relation reads enforce current object, field, row, application, and workspace restrictions.                                                  | M1-02, M1-04; TF-03, TF-05                         |
| M1I-05 | Payloads cannot carry authority.             | Actor, role, bypass, approval, and tool-annotation fields in event data are ignored as authorization inputs.                                 | M1-01, M2-07; TF-06, TF-07                         |
| M1I-06 | Worker revalidation uses current state.      | Revocation, role change, field tightening, deletion, or workspace mismatch after enqueue denies or safely re-fetches.                        | M1-05, M1-06; TF-08, TF-09                         |
| M1I-07 | Unknown relation and provenance fail closed. | Unsupported relation metadata or unknown payload provenance produces no hydrated value or protected effect.                                  | M1-04; TF-05, TF-12                                |
| M3I-01 | Trigger envelope is versioned and immutable. | Schema version, workspace, event reference, workflow, payload digest, and provenance are validated before use.                               | M3-01, M3-05; TF-08                                |
| M3I-02 | Queue delivery is idempotent.                | Duplicate event/workflow pairs cannot create duplicate protected effects, including after queue record removal.                              | M3-01; TF-08                                       |
| M3I-03 | Retention is bounded.                        | Payload expiry is enforced before worker processing; expired payload data is not executed or re-enqueued.                                    | M3-02, M3-04; TF-08                                |
| M3I-04 | Replay preserves lineage.                    | Authorized replay has a new attempt/decision and retains root/event/effect linkage without broadening projection.                            | M1-06, M3-05; TF-08                                |
| M3I-05 | Deleted data is not resurrected.             | A deleted source or related record is handled through current-state policy and cannot be reconstructed from stale unrestricted payload data. | M3-03, M3-05; TF-08, TF-09                         |
| M4I-01 | Ingress decisions are auditable.             | Admission, filter, enrichment, serialization, enqueue, revalidation, denial, and reconciliation have attributable phases.                    | M4-01, M4-02; TF-10, TF-11                         |
| M4I-02 | Correlation spans ingress and execution.     | One server-owned root links event, payload version/hash, job, run, attempt, decision, effect, trace, and audit IDs.                          | M1-06, M4-03; TF-08, TF-11                         |
| M4I-03 | Payload metadata is allowlisted.             | Raw hydrated entities, credentials, tokens, model content, and restricted values never enter telemetry or audit metadata.                    | M4-04; TF-12                                       |
| M4I-04 | Critical audit failure blocks or reconciles. | Pre-effect primary failure blocks; post-effect outcome failure cannot report success or auto-repeat.                                         | M4-05; TF-10, TF-11                                |

## Minimal trigger envelope

`[RECOMMENDATION]` Persist immutable references and an authorized field projection, not
an unrestricted hydrated object. The envelope is transport data only and grants no
authority.

```ts
export type WorkflowTriggerIngressEnvelopeV1 = Readonly<{
  schemaVersion: 1;
  workspaceId: string;
  workflowId: string;
  event: Readonly<{
    name: string;
    objectMetadataId: string;
    recordId: string;
    action: 'CREATED' | 'UPDATED' | 'DELETED' | 'DESTROYED' | 'UPSERTED';
    occurredAt: string;
  }>;
  projection: Readonly<Record<string, unknown>>;
  allowedFieldMetadataIds: readonly string[];
  provenance: 'DATABASE_EVENT_POLICY_PROJECTION';
  policyVersion: 'p0-v1';
  originPolicyDecisionId: string;
  rootCorrelationId: string;
  payloadDigest: string;
  idempotencyKey: string;
  expiresAt: string;
}>;
```

### Envelope invariants

| Invariant  | Rule                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Tenant     | Every referenced entity is resolved in `workspaceId`; no cross-schema fallback                                     |
| Provenance | Only the closed provenance literal is accepted for v1                                                              |
| Projection | Keys are derived from an explicit permitted field set; unknown keys reject serialization                           |
| Relations  | Relation values are identifier-only or a separately authorized bounded projection                                  |
| Integrity  | Digest covers schema version, tenant, workflow, event reference, field set, projection, policy version, and expiry |
| Authority  | No role config, bypass bit, approval state, credential, or raw auth context is serialized                          |
| Retention  | Worker rejects an expired envelope before reading protected business data                                          |
| Replay     | Idempotency is durable outside BullMQ job retention and scoped by workspace/workflow/event/action                  |

## Fail-closed matrix

| Scenario                             | Ingress result                                                | Queue result                                       | Worker/effect result                              |
| ------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Valid caller-bound trigger           | Allowed projection after current intersection                 | One versioned job                                  | Revalidate current authority; enforce policy      |
| Valid delegated application          | App and initiating scope intersect                            | One versioned job                                  | Current app/role required                         |
| Valid scoped service principal       | R0 control metadata only                                      | Only if business projection has separate authority | Cannot authorize protected effect                 |
| Missing workspace                    | Deny before read                                              | No job                                             | No run/effect                                     |
| Foreign workspace relation           | Opaque deny; disclose nothing                                 | No job                                             | No cross-schema probe                             |
| Unresolved workflow/application role | Deny before business enrichment                               | No job                                             | No fallback admin/bypass                          |
| Revoked after enqueue                | Previously stored minimum envelope remains untrusted          | Existing job may remain                            | Deny or re-fetch/filter; audit revocation         |
| Field policy tightened               | Do not add newly restricted value                             | Existing projection is stale                       | Re-fetch/filter or deny; never use stale field    |
| Unknown relation                     | Skip only when no filter/action depends on it; otherwise deny | No unsafe job                                      | No implicit null-based allow                      |
| Deleted record                       | No resurrection from stale hydration                          | Existing reference may remain                      | Deterministic no-op/deny under current state      |
| Malformed/oversized payload          | Bounded parse rejects                                         | No job                                             | No workflow/AI/tool input                         |
| Unknown provenance/version           | Reject                                                        | No new job                                         | Dead-letter/operator-visible compatibility result |
| Duplicate/replay                     | Same durable ingress key                                      | Deduplicate transport                              | M3 effect ledger prevents duplicate effect        |
| Bypass-bearing field                 | Ignore as data and reject as authority                        | No broadened job                                   | Deny protected context                            |
| Audit primary unavailable            | Critical admission/effect intent cannot be established        | No critical job/effect                             | `AUDIT_UNAVAILABLE`                               |

## Test contract

| Test ID | Fixture and trigger                                              | Required assertions                                                                     |
| ------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| TI-T01  | Valid same-workspace event and explicitly scoped workflow role   | Permitted projection only; one envelope; root and decision linkage present              |
| TI-T02  | Event missing workspace                                          | No metadata read, relation read, queue call, workflow run, or effect                    |
| TI-T03  | Relation ID belongs to another workspace                         | No existence signal, identifier, value, relation graph, or queue call                   |
| TI-T04  | Application and admin role both unresolved                       | No protected enrichment, job, run, ORM write, provider, MCP, or workflow action         |
| TI-T05  | Role revoked after enqueue                                       | Worker denies before use/effect and records safe revocation evidence                    |
| TI-T06  | Field restriction tightened after enqueue                        | Stale value is discarded; current allowed projection is re-fetched or execution denies  |
| TI-T07  | Source or relation deleted                                       | No stale value resurrection; deterministic audited result                               |
| TI-T08  | Unknown relation metadata                                        | Fail closed when required by filter/action; no unrestricted fallback read               |
| TI-T09  | Malicious, recursive, or oversized event                         | Bounded rejection; no queue, log, trace, audit, AI, or tool propagation of sentinel     |
| TI-T10  | Duplicate delivery after BullMQ cleanup                          | Durable ingress/effect identity prevents a second protected effect                      |
| TI-T11  | Expired or unsupported envelope                                  | No execution; operator-visible compatibility/dead-letter outcome                        |
| TI-T12  | Pre-effect audit append fault                                    | Zero effect and `AUDIT_UNAVAILABLE`                                                     |
| TI-T13  | Provider success then audit outcome fault                        | Reconciliation-required; no success and no automatic resend                             |
| TI-T14  | Sink capture with sentinel credentials and restricted CRM values | Sentinel absent from logs, spans, errors, audit, mirror, export, and AI context         |
| TI-T15  | End-to-end trigger event                                         | Event, decision, payload hash, job, run, attempt, effect, trace, and audit join by root |

Each test must assert both expected state and prohibited calls. Positive tests do not
substitute for negative tenant, role, row, field, replay, redaction, and audit-failure
evidence.

## Compatibility, migration, and rollback

| Condition                                    | Safe behavior                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy queued payload                        | New worker treats it as unknown provenance; reconstruct from durable references only when unambiguous, otherwise deny and dead-letter |
| Old worker with new job                      | Queue remains paused until old workers cannot consume protected jobs                                                                  |
| Existing workspace without explicit app role | Backfill explicit same-workspace role; unresolved workspace stays disabled                                                            |
| In-flight retry                              | Preserve root/run identity, mint attempt/decision, revalidate current authority                                                       |
| Self-hosted mixed version                    | Default deny for unknown envelope; publish upgrade preflight and unresolved-workspace inventory without sensitive data                |
| Feature flag disabled                        | May disable registration or effects; may not restore bypass or unresolved-authority execution                                         |
| Rollback requested                           | Pause affected queues/workflows and forward-fix; retain audit/effect evidence and do not downgrade to vulnerable worker code          |
| Policy schema changes                        | Versioned envelope reader supports explicit versions; unknown versions deny                                                           |

## Candidate future implementation paths

No path in this table is changed by this artifact.

| Area               | Candidate path                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listener           | `packages/twenty-server/src/modules/workflow/workflow-trigger/automated-trigger/listeners/workflow-database-event-trigger.listener.ts`                |
| Listener tests     | `packages/twenty-server/src/modules/workflow/workflow-trigger/automated-trigger/listeners/__tests__/workflow-database-event-trigger.listener.spec.ts` |
| Trigger job        | `packages/twenty-server/src/modules/workflow/workflow-trigger/jobs/workflow-trigger.job.ts`                                                           |
| Trigger job tests  | Colocated new `__tests__/workflow-trigger.job.spec.ts` after preflight confirms convention                                                            |
| Event contracts    | `packages/twenty-shared/src/database-events/` only if a shared transport contract is required                                                         |
| Policy contracts   | `packages/twenty-server/src/engine/core-modules/policy/`                                                                                              |
| Queue contract     | Existing message-queue job options, driver, and explorer paths after focused inventory                                                                |
| Workflow authority | `packages/twenty-server/src/modules/workflow/workflow-executor/services/workflow-execution-context.service.ts`                                        |
| Effect reliability | Future M3 workflow effect ledger and reconciliation paths                                                                                             |

## Additional finding rule

Any newly observed bypassed business read, unbound service principal, payload-forwarding
path, cross-workspace probe, unaudited critical effect, or redaction escape is recorded as
a separate `BLOCK_RELEASE` finding. It is not generalized beyond direct evidence.

## Gate

| Criterion                                       | Status                                               |
| ----------------------------------------------- | ---------------------------------------------------- |
| Ingress stages modeled separately               | PASS                                                 |
| Authority at every stage explicit               | PASS as required future-state contract               |
| Minimal payload and provenance contract defined | PASS                                                 |
| M1-M4 and S7 traceability extended              | PASS                                                 |
| Negative tests specified                        | PASS                                                 |
| Compatibility and rollback specified            | PASS                                                 |
| Runtime safety proven                           | FAIL — implementation and executable evidence absent |

## Stop condition

`CODEX_TWENTYCRM_IDEAL_CRM_SCAN_ASSESS_TRIGGER_INGRESS_COMPLETE_RUNTIME_BLOCKED`
