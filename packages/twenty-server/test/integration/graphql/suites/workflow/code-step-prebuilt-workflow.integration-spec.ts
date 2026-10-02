import gql from 'graphql-tag';
import request from 'supertest';
import {
  destroyWorkflowRun,
  getWorkflowRun,
  runWorkflowVersion,
  waitForWorkflowCompletion,
} from 'test/integration/graphql/suites/workflow/utils/workflow-run-test.util';
import { updateWorkflowVersionTrigger } from 'test/integration/graphql/suites/workflow/utils/update-workflow-version-trigger.util';
import { updateLogicFunctionSource } from 'test/integration/metadata/suites/logic-function/utils/update-logic-function-source.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { updateFeatureFlag } from 'test/integration/metadata/suites/utils/update-feature-flag.util';
import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';
import { FeatureFlagKey } from 'twenty-shared/types';

import { OutboxEventConsumerService } from 'src/engine/core-modules/transactional-outbox/services/outbox-event-consumer.service';
import { LogicFunctionExecutionMode } from 'src/engine/metadata-modules/logic-function/logic-function.entity';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

const client = request(`http://localhost:${APP_PORT}`);

const EXTERNAL_PACKAGES_FUNCTION_CODE = `import groupBy from 'lodash.groupby';

export const main = async (params: { items: Array<{ category: string; name: string }> }): Promise<object> => {
  const grouped = groupBy(params.items, 'category');
  return {
    grouped,
    categories: Object.keys(grouped),
  };
};`;

describe('Code step workflow with PREBUILT logic function (e2e)', () => {
  let createdWorkflowId: string | null = null;
  let createdWorkflowVersionId: string | null = null;
  let codeStepId: string | null = null;
  let codeStepLogicFunctionId: string | null = null;
  let createdWorkflowRunId: string | null = null;

  beforeAll(async () => {
    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_LOGIC_FUNCTION_PREBUILT_MODE_ENABLED,
      value: true,
      expectToFail: false,
    });
    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
      value: true,
      expectToFail: false,
    });

    const createWorkflowResponse = await client
      .post('/graphql')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: `
          mutation CreateWorkflow {
            createWorkflow(data: {
              name: "Code Step PREBUILT Test"
            }) {
              id
            }
          }
        `,
      });

    expect(createWorkflowResponse.body.errors).toBeUndefined();
    createdWorkflowId = createWorkflowResponse.body.data.createWorkflow.id;

    const getWorkflowResponse = await client
      .post('/graphql')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: `
          query GetWorkflow($id: UUID!) {
            workflow(filter: { id: { eq: $id } }) {
              id
              versions {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        `,
        variables: { id: createdWorkflowId },
      });

    expect(getWorkflowResponse.body.errors).toBeUndefined();
    createdWorkflowVersionId =
      getWorkflowResponse.body.data.workflow.versions.edges[0].node.id;

    const manualTrigger = {
      name: 'Manual Trigger',
      type: 'MANUAL',
      settings: {
        outputSchema: {
          items: { isLeaf: true, type: 'array', value: undefined },
        },
      },
      nextStepIds: [],
      position: { x: 0, y: 0 },
    };

    const updateTriggerResponse = await updateWorkflowVersionTrigger({
      workflowVersionId: createdWorkflowVersionId!,
      trigger: manualTrigger,
    });

    expect(updateTriggerResponse.body.errors).toBeUndefined();

    const createCodeStepResponse = await client
      .post('/graphql')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: `
          mutation CreateWorkflowVersionStep($input: CreateWorkflowVersionStepInput!) {
            createWorkflowVersionStep(input: $input) {
              stepsDiff
            }
          }
        `,
        variables: {
          input: {
            workflowVersionId: createdWorkflowVersionId,
            stepType: 'CODE',
            parentStepId: 'trigger',
            position: { x: 200, y: 0 },
          },
        },
      });

    expect(createCodeStepResponse.body.errors).toBeUndefined();

    const getStepsResponse = await client
      .post('/graphql')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: `
          query GetWorkflowVersion($id: UUID!) {
            workflowVersion(filter: { id: { eq: $id } }) {
              id
              steps
            }
          }
        `,
        variables: { id: createdWorkflowVersionId },
      });

    expect(getStepsResponse.body.errors).toBeUndefined();

    const codeStep = getStepsResponse.body.data.workflowVersion.steps.find(
      (step: { type: string }) => step.type === 'CODE',
    );

    expect(codeStep).toBeDefined();
    codeStepId = codeStep.id;

    const logicFunctionId = codeStep.settings.input.logicFunctionId;

    expect(logicFunctionId).toBeDefined();
    codeStepLogicFunctionId = logicFunctionId;

    const updateStepResponse = await client
      .post('/graphql')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: `
          mutation UpdateWorkflowVersionStep($input: UpdateWorkflowVersionStepInput!) {
            updateWorkflowVersionStep(input: $input) {
              id
            }
          }
        `,
        variables: {
          input: {
            workflowVersionId: createdWorkflowVersionId,
            step: {
              ...codeStep,
              settings: {
                ...codeStep.settings,
                input: {
                  ...codeStep.settings.input,
                  logicFunctionInput: { items: '{{trigger.items}}' },
                },
              },
            },
          },
        },
      });

    expect(updateStepResponse.body.errors).toBeUndefined();

    const updateSourceResponse = await updateLogicFunctionSource({
      input: {
        id: logicFunctionId,
        update: {
          sourceHandlerCode: EXTERNAL_PACKAGES_FUNCTION_CODE,
        },
      },
      expectToFail: false,
    });

    expect(updateSourceResponse.errors).toBeUndefined();

    const activateResponse = await client
      .post('/graphql')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: `
          mutation ActivateWorkflowVersion($workflowVersionId: UUID!) {
            activateWorkflowVersion(workflowVersionId: $workflowVersionId)
          }
        `,
        variables: { workflowVersionId: createdWorkflowVersionId },
      });

    expect(activateResponse.body.errors).toBeUndefined();
    expect(activateResponse.body.data.activateWorkflowVersion).toBe(true);
  });

  afterAll(async () => {
    if (createdWorkflowRunId) {
      await destroyWorkflowRun(createdWorkflowRunId);
    }

    if (createdWorkflowId) {
      await client
        .post('/graphql')
        .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
        .send({
          query: `
            mutation DestroyWorkflow($id: ID!) {
              destroyWorkflow(id: $id) {
                id
              }
            }
          `,
          variables: { id: createdWorkflowId },
        });
    }

    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_LOGIC_FUNCTION_PREBUILT_MODE_ENABLED,
      value: false,
      expectToFail: false,
    });
    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
      value: false,
      expectToFail: false,
    });
  });

  it('flips the underlying logic function to PREBUILT on workflow activation', async () => {
    const findLogicFunctionResponse = await makeMetadataAPIRequest({
      query: gql`
        query FindOneLogicFunction($input: LogicFunctionIdInput!) {
          findOneLogicFunction(input: $input) {
            id
            executionMode
          }
        }
      `,
      variables: { input: { id: codeStepLogicFunctionId } },
    });

    expect(findLogicFunctionResponse.body.errors).toBeUndefined();

    const logicFunction =
      findLogicFunctionResponse.body.data.findOneLogicFunction;

    expect(logicFunction.executionMode).toBe(
      LogicFunctionExecutionMode.PREBUILT,
    );
  });

  it('runs the approved code step from its prebuilt bundle and resolves bare imports', async () => {
    createdWorkflowRunId = await runWorkflowVersion({
      workflowVersionId: createdWorkflowVersionId!,
      payload: {
        items: [
          { category: 'fruit', name: 'apple' },
          { category: 'vegetable', name: 'carrot' },
          { category: 'fruit', name: 'banana' },
        ],
      },
    });

    const blockedWorkflowRun =
      await waitForWorkflowCompletion(createdWorkflowRunId);

    expect(blockedWorkflowRun?.status).toBe('FAILED');
    expect(
      blockedWorkflowRun?.state?.stepInfos?.[codeStepId!]?.error,
    ).toContain('APPROVAL_REQUIRED');

    const pendingResponse = await makeMetadataAPIRequest({
      query: gql`
        query PendingAgentActionApprovalRequests {
          pendingAgentActionApprovalRequests {
            id
            workflowRunId
            workflowStepId
            rootCorrelationId
            originPolicyDecisionId
          }
        }
      `,
    });

    expect(pendingResponse.body.errors).toBeUndefined();
    const approvalRequest =
      pendingResponse.body.data.pendingAgentActionApprovalRequests.find(
        (candidate: { workflowRunId: string }) =>
          candidate.workflowRunId === createdWorkflowRunId,
      );

    expect(approvalRequest).toMatchObject({
      workflowRunId: createdWorkflowRunId,
      workflowStepId: codeStepId,
      rootCorrelationId: createdWorkflowRunId,
      originPolicyDecisionId: expect.any(String),
    });

    const approveResponse = await makeMetadataAPIRequest({
      query: gql`
        mutation ApproveAgentActionRequest(
          $input: ApproveAgentActionRequestInput!
        ) {
          approveAgentActionRequest(input: $input) {
            id
          }
        }
      `,
      variables: {
        input: {
          requestId: approvalRequest.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      },
    });

    expect(approveResponse.body.errors).toBeUndefined();

    const [approvalEvent] = await global.testDataSource.query(
      `SELECT id FROM core."outboxEvent"
       WHERE "eventType" = 'agent.action.approved'
         AND "aggregateId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [approvalRequest.id],
    );

    expect(approvalEvent).toBeDefined();

    const [publishedEvents] = await global.testDataSource.query(
      `UPDATE core."outboxEvent"
       SET state = 'PUBLISHED',
           "attemptCount" = "attemptCount" + 1,
           "publishedAt" = NOW()
       WHERE id = $1
         AND "workspaceId" = $2
         AND state = 'PENDING'
       RETURNING id`,
      [approvalEvent.id, SEED_APPLE_WORKSPACE_ID],
    );

    expect(publishedEvents).toHaveLength(1);

    const consumeResult =
      await getAppProviderByClassName<OutboxEventConsumerService>(
        'OutboxEventConsumerService',
      ).consume({
        outboxEventId: approvalEvent.id,
        workspaceId: SEED_APPLE_WORKSPACE_ID,
      });

    expect(consumeResult.status).not.toBe('RECONCILIATION_REQUIRED');

    let workflowRun = await getWorkflowRun(createdWorkflowRunId);

    for (
      let attempt = 0;
      attempt < 40 && workflowRun?.status !== 'COMPLETED';
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      workflowRun = await getWorkflowRun(createdWorkflowRunId);
    }

    expect(workflowRun?.status).toBe('COMPLETED');
    expect(workflowRun?.state?.stepInfos?.trigger?.status).toBe('SUCCESS');
    expect(workflowRun?.state?.stepInfos?.[codeStepId!]?.status).toBe(
      'SUCCESS',
    );

    const stepResult = workflowRun?.state?.stepInfos?.[codeStepId!]?.result as
      | {
          grouped?: Record<string, Array<{ category: string; name: string }>>;
          categories?: string[];
        }
      | undefined;

    expect(stepResult?.grouped).toMatchObject({
      fruit: [
        { category: 'fruit', name: 'apple' },
        { category: 'fruit', name: 'banana' },
      ],
      vegetable: [{ category: 'vegetable', name: 'carrot' }],
    });
    expect(stepResult?.categories).toEqual(
      expect.arrayContaining(['fruit', 'vegetable']),
    );

    const [durabilityEvidence] = (await global.testDataSource.query(
      `SELECT
         request.status AS "requestStatus",
         request."approvalId",
         request."workflowRunId",
         request."workflowStepId",
         request."rootCorrelationId" AS "requestRootCorrelationId",
         approval."consumedAt" IS NOT NULL AS "approvalConsumed",
         approval."consumedByDecisionId" IS NOT NULL AS "consumingDecisionRecorded",
         event."eventType",
         event."schemaVersion",
         event."rootCorrelationId" AS "eventRootCorrelationId",
         event.state AS "eventState",
         event."attemptCount",
         event."lastErrorCode" AS "eventError",
         receipt."consumerName",
         receipt.state AS "receiptState",
         receipt."lastErrorCode" AS "receiptError"
       FROM core."agentActionApprovalRequest" request
       JOIN core."agentActionApproval" approval
         ON approval.id = request."approvalId"
       JOIN core."outboxEvent" event
         ON event."aggregateType" = 'agentActionApprovalRequest'
        AND event."aggregateId" = request.id::text
       JOIN core."outboxConsumerReceipt" receipt
         ON receipt."outboxEventId" = event.id
       WHERE request.id = $1`,
      [approvalRequest.id],
    )) as Array<{
      requestStatus: string;
      approvalId: string;
      workflowRunId: string;
      workflowStepId: string;
      requestRootCorrelationId: string;
      approvalConsumed: boolean;
      consumingDecisionRecorded: boolean;
      eventType: string;
      schemaVersion: number;
      eventRootCorrelationId: string;
      eventState: string;
      attemptCount: number;
      eventError: string | null;
      consumerName: string;
      receiptState: string;
      receiptError: string | null;
    }>;

    expect(durabilityEvidence).toEqual({
      requestStatus: 'APPROVED',
      approvalId: approveResponse.body.data.approveAgentActionRequest.id,
      workflowRunId: createdWorkflowRunId,
      workflowStepId: codeStepId,
      requestRootCorrelationId: createdWorkflowRunId,
      approvalConsumed: true,
      consumingDecisionRecorded: true,
      eventType: 'agent.action.approved',
      schemaVersion: 1,
      eventRootCorrelationId: createdWorkflowRunId,
      eventState: 'PUBLISHED',
      attemptCount: 1,
      eventError: null,
      consumerName: 'internal-event-bus',
      receiptState: 'COMPLETED',
      receiptError: null,
    });
  }, 60_000);
});
