import { randomUUID } from 'node:crypto';

import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';

import { PolicyAuditService } from 'src/engine/core-modules/policy/services/policy-audit.service';
import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyDecisionOutcome } from 'src/engine/core-modules/policy/types/policy-decision.type';

const WORKSPACE_ID = randomUUID();
const APPLICATION_ID = randomUUID();
const ACTOR_ID = randomUUID();
const WORKSPACE_MEMBER_ID = randomUUID();
const ROLE_ID = randomUUID();
const TRIGGER_SUFFIX = WORKSPACE_ID.split('-').join('');
const AUDIT_FAILURE_FUNCTION_NAME = `ideal_crm_audit_failure_${TRIGGER_SUFFIX}`;
const AUDIT_FAILURE_TRIGGER_NAME = `ideal_crm_audit_failure_${TRIGGER_SUFFIX}`;

type AuditRow = {
  phase: string;
  result: string;
  rootCorrelationId: string;
  attemptId: string;
  mutationOrEffectId: string;
  metadata: Record<string, unknown>;
};

const createContext = (): PolicyContext => {
  const rootCorrelationId = randomUUID();
  const decisionId = randomUUID();
  const attemptId = randomUUID();
  const mutationOrEffectId = randomUUID();

  return getAppProviderByClassName<PolicyContextService>(
    'PolicyContextService',
  ).create({
    workspaceId: WORKSPACE_ID,
    actor: {
      type: 'user',
      id: ACTOR_ID,
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    },
    authority: {
      type: 'roles',
      source: 'CALLER_BOUND',
      workspaceId: WORKSPACE_ID,
      rolePermissionConfig: { unionOf: [ROLE_ID] },
      authorityVersion: 'integration-role-map:1',
      revocationState: 'ACTIVE',
      evaluatedAt: new Date().toISOString(),
    },
    operation: 'integration.provider.send',
    riskClass: 'R2',
    target: {
      workspaceId: WORKSPACE_ID,
      resourceType: 'integration-effect',
      resourceId: mutationOrEffectId,
    },
    affectedFieldMetadataIds: [],
    correlation: {
      rootCorrelationId,
      decisionId,
      attemptId,
      mutationOrEffectId,
    },
  });
};

const createDecision = (
  context: PolicyContext,
  outcome: PolicyDecisionOutcome = 'ALLOW',
) =>
  getAppProviderByClassName<PolicyDecisionService>(
    'PolicyDecisionService',
  ).create({
    context,
    outcome,
    reasonCodes: outcome === 'ALLOW' ? ['AUTHORIZED'] : ['ROLE_DENIED'],
  });

const readAuditRows = async (policyDecisionId: string): Promise<AuditRow[]> =>
  global.testDataSource.query(
    `SELECT "phase", "result", "rootCorrelationId", "attemptId",
            "mutationOrEffectId", "metadata"
       FROM core."policyAuditEvent"
      WHERE "workspaceId" = $1 AND "policyDecisionId" = $2`,
    [WORKSPACE_ID, policyDecisionId],
  );

const removeAuditFailureTrigger = async (): Promise<void> => {
  await global.testDataSource.query(
    `DROP TRIGGER IF EXISTS "${AUDIT_FAILURE_TRIGGER_NAME}" ON core."policyAuditEvent"`,
  );
  await global.testDataSource.query(
    `DROP FUNCTION IF EXISTS core."${AUDIT_FAILURE_FUNCTION_NAME}"()`,
  );
};

const installAuditFailureTrigger = async (
  phase: 'INTENT' | 'OUTCOME',
): Promise<void> => {
  await removeAuditFailureTrigger();
  await global.testDataSource.query(`
    CREATE FUNCTION core."${AUDIT_FAILURE_FUNCTION_NAME}"()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."workspaceId" = '${WORKSPACE_ID}'::uuid
         AND NEW."phase" = '${phase}' THEN
        RAISE EXCEPTION 'Ideal CRM audit fault injection';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await global.testDataSource.query(`
    CREATE TRIGGER "${AUDIT_FAILURE_TRIGGER_NAME}"
    BEFORE INSERT ON core."policyAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION core."${AUDIT_FAILURE_FUNCTION_NAME}"()
  `);
};

describe('Protected policy operation persistence', () => {
  let protectedOperationService: ProtectedOperationService;

  beforeAll(async () => {
    protectedOperationService =
      getAppProviderByClassName<ProtectedOperationService>(
        'ProtectedOperationService',
      );

    await global.testDataSource.transaction(async (manager) => {
      await manager.query(
        'INSERT INTO core."workspace" ("id", "subdomain", "activationStatus", "workspaceCustomApplicationId") VALUES ($1, $2, $3, $4)',
        [
          WORKSPACE_ID,
          `protected-operation-${WORKSPACE_ID}`,
          'PENDING_CREATION',
          APPLICATION_ID,
        ],
      );
      await manager.query(
        'INSERT INTO core."application" ("id", "universalIdentifier", "name", "sourcePath", "workspaceId") VALUES ($1, $1, $2, $3, $4)',
        [APPLICATION_ID, 'Protected Operation Test', '/', WORKSPACE_ID],
      );
    });
  });

  afterEach(async () => {
    await removeAuditFailureTrigger();
  });

  afterAll(async () => {
    await removeAuditFailureTrigger();
    await global.testDataSource.query(
      'DELETE FROM core."workspace" WHERE "id" = $1',
      [WORKSPACE_ID],
    );
  });

  it('persists decision, intent, outcome, and immutable correlation lineage', async () => {
    const context = createContext();
    const decision = createDecision(context);

    await expect(
      protectedOperationService.execute({
        context,
        decision,
        auditMetadata: { payloadClassification: 'CONTROL' },
        execute: async () => ({ providerReference: 'provider-reference' }),
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      policyDecisionId: decision.id,
    });

    const rows = await readAuditRows(decision.id);

    expect(rows).toHaveLength(3);
    expect(rows.map(({ phase }) => phase)).toEqual(
      expect.arrayContaining(['DECISION', 'INTENT', 'OUTCOME']),
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'OUTCOME', result: 'success' }),
      ]),
    );
    expect(
      rows.every(
        (row) =>
          row.rootCorrelationId === context.correlation.rootCorrelationId &&
          row.attemptId === context.correlation.attemptId &&
          row.mutationOrEffectId === context.correlation.mutationOrEffectId &&
          row.metadata.payloadClassification === 'CONTROL',
      ),
    ).toBe(true);
  });

  it('denies before the effect when durable audit intent fails', async () => {
    const context = createContext();
    const decision = createDecision(context);
    const execute = jest.fn(async () => 'sent');

    await installAuditFailureTrigger('INTENT');

    await expect(
      protectedOperationService.execute({
        context,
        decision,
        auditMetadata: { payloadClassification: 'CONTROL' },
        execute,
      }),
    ).resolves.toEqual({
      status: 'DENIED',
      policyDecisionId: decision.id,
      reasonCodes: ['AUDIT_UNAVAILABLE'],
    });
    expect(execute).not.toHaveBeenCalled();
    await expect(readAuditRows(decision.id)).resolves.toEqual([
      expect.objectContaining({ phase: 'DECISION' }),
    ]);
  });

  it('requires reconciliation without repeating an effect after outcome failure', async () => {
    const context = createContext();
    const decision = createDecision(context);
    const execute = jest.fn(async () => 'sent');

    await installAuditFailureTrigger('OUTCOME');

    await expect(
      protectedOperationService.execute({
        context,
        decision,
        auditMetadata: { payloadClassification: 'CONTROL' },
        execute,
      }),
    ).resolves.toEqual({
      status: 'RECONCILIATION_REQUIRED',
      policyDecisionId: decision.id,
    });
    expect(execute).toHaveBeenCalledTimes(1);

    const rows = await readAuditRows(decision.id);

    expect(rows).toHaveLength(2);
    expect(rows.map(({ phase }) => phase)).toEqual(
      expect.arrayContaining(['DECISION', 'INTENT']),
    );
  });

  it('rejects non-allowlisted metadata before audit or effect', async () => {
    const context = createContext();
    const decision = createDecision(context);
    const execute = jest.fn(async () => 'sent');

    await expect(
      protectedOperationService.execute({
        context,
        decision,
        auditMetadata: {
          payloadClassification: 'CONTROL',
          sentinelSecret: 'do-not-export',
        } as never,
        execute,
      }),
    ).rejects.toThrow('Policy decision is not bound to the supplied context.');
    expect(execute).not.toHaveBeenCalled();
    await expect(readAuditRows(decision.id)).resolves.toEqual([]);
  });

  it('persists a denial without intent or protected effect', async () => {
    const context = createContext();
    const decision = createDecision(context, 'DENY');
    const execute = jest.fn(async () => 'sent');

    await expect(
      protectedOperationService.execute({
        context,
        decision,
        auditMetadata: { payloadClassification: 'CONTROL' },
        execute,
      }),
    ).resolves.toEqual({
      status: 'DENIED',
      policyDecisionId: decision.id,
      reasonCodes: ['ROLE_DENIED'],
    });
    expect(execute).not.toHaveBeenCalled();
    await expect(readAuditRows(decision.id)).resolves.toEqual([
      expect.objectContaining({
        phase: 'DECISION',
        result: 'denied',
      }),
    ]);
  });

  it('exposes workspace-bound audit evidence through the real service', async () => {
    const events = await getAppProviderByClassName<PolicyAuditService>(
      'PolicyAuditService',
    ).listRecent({ workspaceId: WORKSPACE_ID, limit: 100 });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.workspaceId === WORKSPACE_ID)).toBe(
      true,
    );
  });
});
