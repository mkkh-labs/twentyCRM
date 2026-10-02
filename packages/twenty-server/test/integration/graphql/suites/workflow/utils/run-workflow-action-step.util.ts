import gql from 'graphql-tag';
import { updateWorkflowVersionTrigger } from 'test/integration/graphql/suites/workflow/utils/update-workflow-version-trigger.util';
import {
  destroyWorkflowRun,
  getWorkflowRun,
  runWorkflowVersion,
  waitForWorkflowCompletion,
  type WorkflowRunStatusType,
} from 'test/integration/graphql/suites/workflow/utils/workflow-run-test.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { updateFeatureFlag } from 'test/integration/metadata/suites/utils/update-feature-flag.util';
import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';
import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { OutboxEventConsumerService } from 'src/engine/core-modules/transactional-outbox/services/outbox-event-consumer.service';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

type WorkflowActionStepType =
  | 'SEND_EMAIL'
  | 'DRAFT_EMAIL'
  | 'CREATE_CALENDAR_EVENT';

type WorkflowVersionStep = {
  id: string;
  type: string;
  settings: { input: Record<string, unknown> };
};

export type WorkflowActionStepRun = {
  status?: WorkflowRunStatusType;
  stepStatus?: string;
  stepResult?: Record<string, unknown>;
  stepError?: string;
};

const createWorkflow = async (name: string): Promise<string> => {
  const response = await makeGraphqlAPIRequest({
    query: gql`
      mutation CreateWorkflow($name: String!) {
        createWorkflow(data: { name: $name }) {
          id
        }
      }
    `,
    variables: { name },
  });

  expect(response.body.errors).toBeUndefined();

  return response.body.data.createWorkflow.id;
};

const destroyWorkflow = async (workflowId: string): Promise<void> => {
  await makeGraphqlAPIRequest({
    query: gql`
      mutation DestroyWorkflow($id: ID!) {
        destroyWorkflow(id: $id) {
          id
        }
      }
    `,
    variables: { id: workflowId },
  });
};

const findDraftWorkflowVersionId = async (
  workflowId: string,
): Promise<string> => {
  const response = await makeGraphqlAPIRequest({
    query: gql`
      query FindDraftWorkflowVersion($workflowId: UUID!) {
        workflowVersions(
          filter: { workflowId: { eq: $workflowId }, status: { in: ["DRAFT"] } }
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `,
    variables: { workflowId },
  });

  expect(response.body.errors).toBeUndefined();

  return response.body.data.workflowVersions.edges[0].node.id;
};

const createWorkflowVersionStep = async ({
  workflowVersionId,
  stepType,
}: {
  workflowVersionId: string;
  stepType: WorkflowActionStepType;
}): Promise<void> => {
  const response = await makeGraphqlAPIRequest({
    query: gql`
      mutation CreateWorkflowVersionStep(
        $input: CreateWorkflowVersionStepInput!
      ) {
        createWorkflowVersionStep(input: $input) {
          stepsDiff
        }
      }
    `,
    variables: {
      input: {
        workflowVersionId,
        stepType,
        parentStepId: 'trigger',
        position: { x: 200, y: 0 },
      },
    },
  });

  expect(response.body.errors).toBeUndefined();
};

const findWorkflowVersionStep = async ({
  workflowVersionId,
  stepType,
}: {
  workflowVersionId: string;
  stepType: WorkflowActionStepType;
}): Promise<WorkflowVersionStep> => {
  const response = await makeGraphqlAPIRequest({
    query: gql`
      query FindWorkflowVersionSteps($workflowVersionId: UUID!) {
        workflowVersion(filter: { id: { eq: $workflowVersionId } }) {
          steps
        }
      }
    `,
    variables: { workflowVersionId },
  });

  expect(response.body.errors).toBeUndefined();

  const step = response.body.data.workflowVersion.steps.find(
    (workflowVersionStep: WorkflowVersionStep) =>
      workflowVersionStep.type === stepType,
  );

  expect(step).toBeDefined();

  return step;
};

const updateWorkflowVersionStepInput = async ({
  workflowVersionId,
  step,
  input,
}: {
  workflowVersionId: string;
  step: WorkflowVersionStep;
  input: Record<string, unknown>;
}): Promise<void> => {
  const response = await makeGraphqlAPIRequest({
    query: gql`
      mutation UpdateWorkflowVersionStep(
        $input: UpdateWorkflowVersionStepInput!
      ) {
        updateWorkflowVersionStep(input: $input) {
          id
        }
      }
    `,
    variables: {
      input: {
        workflowVersionId,
        step: {
          ...step,
          settings: {
            ...step.settings,
            input: { ...step.settings.input, ...input },
          },
        },
      },
    },
  });

  expect(response.body.errors).toBeUndefined();
};

const approveWorkflowAction = async (workflowRunId: string): Promise<void> => {
  const pendingResponse = await makeMetadataAPIRequest({
    query: gql`
      query PendingAgentActionApprovalRequests {
        pendingAgentActionApprovalRequests {
          id
          workflowRunId
        }
      }
    `,
  });

  expect(pendingResponse.body.errors).toBeUndefined();

  const approvalRequest =
    pendingResponse.body.data.pendingAgentActionApprovalRequests.find(
      (candidate: { workflowRunId: string }) =>
        candidate.workflowRunId === workflowRunId,
    );

  expect(approvalRequest).toBeDefined();

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
};

const waitForApprovalContinuation = async ({
  workflowRunId,
  stepId,
}: {
  workflowRunId: string;
  stepId: string;
}): Promise<void> => {
  for (let attempt = 0; attempt < 60; attempt++) {
    const workflowRun = await getWorkflowRun(workflowRunId);
    const stepError = workflowRun?.state.stepInfos?.[stepId]?.error;

    if (
      workflowRun?.status !== 'FAILED' ||
      !stepError?.includes('APPROVAL_REQUIRED')
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Workflow approval continuation was not scheduled.');
};

export const runWorkflowActionStep = async ({
  name,
  stepType,
  input,
  payload,
}: {
  name: string;
  stepType: WorkflowActionStepType;
  input: Record<string, unknown>;
  payload?: object;
}): Promise<WorkflowActionStepRun> => {
  let workflowId: string | undefined;
  let workflowRunId: string | undefined;

  try {
    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
      value: true,
      expectToFail: false,
    });

    workflowId = await createWorkflow(name);
    const workflowVersionId = await findDraftWorkflowVersionId(workflowId);

    await updateWorkflowVersionTrigger({
      workflowVersionId,
      trigger: {
        name: 'Manual Trigger',
        type: 'MANUAL',
        settings: { outputSchema: {} },
        nextStepIds: [],
        position: { x: 0, y: 0 },
      },
    });

    await createWorkflowVersionStep({ workflowVersionId, stepType });

    const step = await findWorkflowVersionStep({ workflowVersionId, stepType });

    await updateWorkflowVersionStepInput({ workflowVersionId, step, input });

    workflowRunId = await runWorkflowVersion({ workflowVersionId, payload });

    let workflowRun = await waitForWorkflowCompletion(workflowRunId);
    let stepInfo = workflowRun?.state?.stepInfos?.[step.id];

    if (stepInfo?.error?.includes('APPROVAL_REQUIRED')) {
      await approveWorkflowAction(workflowRunId);
      await waitForApprovalContinuation({
        workflowRunId,
        stepId: step.id,
      });
      workflowRun = await waitForWorkflowCompletion(workflowRunId);
      stepInfo = workflowRun?.state?.stepInfos?.[step.id];
    }

    return {
      status: workflowRun?.status,
      stepStatus: stepInfo?.status,
      stepResult: stepInfo?.result,
      stepError: stepInfo?.error,
    };
  } finally {
    if (isDefined(workflowRunId)) {
      await destroyWorkflowRun(workflowRunId);
    }

    if (isDefined(workflowId)) {
      await destroyWorkflow(workflowId);
    }

    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
      value: false,
      expectToFail: false,
    });
  }
};
