import { randomUUID } from 'node:crypto';

import gql from 'graphql-tag';
import request from 'supertest';
import { FeatureFlagKey } from 'twenty-shared/types';
import { makeMetadataAPIRequestWithFileUpload } from 'test/integration/metadata/suites/utils/make-metadata-api-request-with-file-upload.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { updateFeatureFlag } from 'test/integration/metadata/suites/utils/update-feature-flag.util';
import { deleteRecordsByIds } from 'test/integration/utils/delete-records-by-ids';

import { buildAgentActionDigest } from 'src/engine/core-modules/policy/utils/build-agent-action-digest.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

const TEST_WORKSPACE_SCHEMA = 'workspace_1wgvd1injqtife6y4rvfbu3h5';

const uploadAiChatFileMutation = gql`
  mutation UploadAiChatFile($file: Upload!) {
    uploadAiChatFile(file: $file) {
      id
      path
    }
  }
`;

type McpToolCallResult = {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
};

type DatabaseToolPayload<TResult> = {
  success: boolean;
  message: string;
  result: TResult;
  error?: string;
};

const approvePendingAttachmentCreateMany = async (
  args: Record<string, unknown>,
): Promise<void> => {
  const pendingResponse = await makeMetadataAPIRequest({
    query: gql`
      query PendingAgentActionApprovalRequests {
        pendingAgentActionApprovalRequests {
          id
          actorId
          action
          target
          actionDigest
          workflowRunId
        }
      }
    `,
  });

  expect(pendingResponse.body.errors).toBeUndefined();

  const matchingRequests =
    pendingResponse.body.data.pendingAgentActionApprovalRequests.filter(
      (request: {
        action: string;
        target: string;
        actorId: string;
        actionDigest: string;
        workflowRunId: string | null;
      }) =>
        request.action === 'database.create_many' &&
        request.target === 'database:attachment' &&
        request.workflowRunId === null &&
        request.actionDigest ===
          buildAgentActionDigest({
            workspaceId: SEED_APPLE_WORKSPACE_ID,
            actorId: request.actorId,
            action: request.action,
            target: request.target,
            arguments: args,
          }),
    );

  expect(matchingRequests).toHaveLength(1);

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
        requestId: matchingRequests[0].id,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
    },
  });

  expect(approveResponse.body.errors).toBeUndefined();
};

const callExecuteTool = async <TResult>(
  toolName: string,
  args: Record<string, unknown>,
): Promise<DatabaseToolPayload<TResult>> => {
  const execute = async (): Promise<McpToolCallResult> => {
    const id = `call-${randomUUID()}`;
    const response = await request(`http://localhost:${APP_PORT}`)
      .post('/mcp')
      .set('Authorization', `Bearer ${API_KEY_ACCESS_TOKEN}`)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          id,
          params: {
            name: 'execute_tool',
            arguments: { toolName, arguments: args },
          },
        }),
      )
      .expect(200);

    return response.body.result as McpToolCallResult;
  };

  let result = await execute();
  const initialPayload = JSON.parse(
    result.content?.[0]?.text as string,
  ) as DatabaseToolPayload<TResult>;

  if (result.isError && initialPayload.error === 'APPROVAL_REQUIRED') {
    await approvePendingAttachmentCreateMany(args);
    result = await execute();
  }

  if (result.isError) {
    throw new Error(result.content?.[0]?.text ?? 'MCP tool call failed');
  }

  return JSON.parse(
    result.content?.[0]?.text as string,
  ) as DatabaseToolPayload<TResult>;
};

const getAttachmentFileIds = async (
  attachmentIds: string[],
): Promise<string[]> => {
  const rows = await global.testDataSource.query(
    `SELECT id, file FROM "${TEST_WORKSPACE_SCHEMA}"."attachment" WHERE id = ANY($1)`,
    [attachmentIds],
  );

  return rows.map(
    (row: { file: Array<{ fileId: string }> }) => row.file[0].fileId,
  );
};

describe('agent chat files in record CRUD tools (integration)', () => {
  let chatFileId: string;
  const createdAttachmentIds: string[] = [];

  beforeAll(async () => {
    jest.useRealTimers();
    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
      value: true,
      expectToFail: false,
    });

    const response = await makeMetadataAPIRequestWithFileUpload(
      { query: uploadAiChatFileMutation, variables: { file: null } },
      {
        field: 'file',
        buffer: Buffer.from('%PDF-1.4 chat upload'),
        filename: 'chat-upload.pdf',
        contentType: 'application/pdf',
      },
    );

    chatFileId = response.body.data.uploadAiChatFile.id;

    expect(response.body.data.uploadAiChatFile.path).toContain('agent-chat/');
  });

  afterAll(async () => {
    await deleteRecordsByIds('attachment', createdAttachmentIds);
    await updateFeatureFlag({
      featureFlag: FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
      value: false,
      expectToFail: false,
    });
  });

  it('should copy a chat upload once per record when several records reference it', async () => {
    const payload = await callExecuteTool<Array<{ id: string }>>(
      'create_many_attachments',
      {
        records: [
          {
            name: 'first.pdf',
            file: [{ fileId: chatFileId, label: 'first.pdf' }],
          },
          {
            name: 'second.pdf',
            file: [{ fileId: chatFileId, label: 'second.pdf' }],
          },
        ],
      },
    );

    expect(payload.success).toBe(true);

    const attachmentIds = payload.result.map((record) => record.id);

    createdAttachmentIds.push(...attachmentIds);

    expect(attachmentIds).toHaveLength(2);

    const storedFileIds = await getAttachmentFileIds(attachmentIds);

    expect(storedFileIds).toHaveLength(2);
    expect(storedFileIds[0]).not.toBe(storedFileIds[1]);
    expect(storedFileIds).not.toContain(chatFileId);

    const copiedFiles = await global.testDataSource.query(
      'SELECT id, path FROM core."file" WHERE id = ANY($1)',
      [storedFileIds],
    );

    expect(copiedFiles).toHaveLength(2);
    copiedFiles.forEach((file: { path: string }) => {
      expect(file.path).toContain('files-field/');
    });
  });
});
