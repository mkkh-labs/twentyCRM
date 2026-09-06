import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MessageCampaignPolicyService } from 'src/modules/emailing/services/message-campaign-policy.service';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const CAMPAIGN_ID = '20202020-ffff-4d02-bf25-6aeccf7ea419';
const USER_ID = '20202020-3333-4d02-bf25-6aeccf7ea419';
const WORKSPACE_MEMBER_ID = '20202020-4444-4d02-bf25-6aeccf7ea419';
const ROLE_ID = '20202020-cccc-4d02-bf25-6aeccf7ea419';

const authContext = {
  type: 'user',
  workspace: { id: WORKSPACE_ID, metadataVersion: 7 },
  user: { id: USER_ID },
  workspaceMemberId: WORKSPACE_MEMBER_ID,
  userWorkspaceId: '20202020-bbbb-4d02-bf25-6aeccf7ea419',
} as unknown as UserWorkspaceAuthContext;

describe('MessageCampaignPolicyService', () => {
  const buildService = ({
    rolePermissionConfig = { unionOf: [ROLE_ID] },
    protectedResult = 'SUCCEEDED',
    hasWorkspacePermission = true,
  }: {
    rolePermissionConfig?:
      | { unionOf: string[] }
      | { shouldBypassPermissionChecks: true }
      | null;
    protectedResult?: 'SUCCEEDED' | 'RECONCILIATION_REQUIRED';
    hasWorkspacePermission?: boolean;
  } = {}) => {
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
    };
    const protectedOperationService = {
      execute: jest.fn().mockImplementation(async ({ execute, decision }) => {
        if (protectedResult === 'RECONCILIATION_REQUIRED') {
          await execute();

          return {
            status: 'RECONCILIATION_REQUIRED',
            policyDecisionId: decision.id,
          };
        }

        return {
          status: 'SUCCEEDED',
          value: await execute(),
          policyDecisionId: decision.id,
        };
      }),
    };
    const permissionsService = {
      userHasWorkspaceSettingPermission: jest
        .fn()
        .mockResolvedValue(hasWorkspacePermission),
    };
    const service = new MessageCampaignPolicyService(
      workspaceOrmManager as never,
      permissionsService as never,
      new PolicyContextService(),
      new PolicyCorrelationService(),
      new PolicyDecisionService(),
      protectedOperationService as never,
    );

    return { permissionsService, service, protectedOperationService };
  };

  it('denies a revoked workspace permission before the effect', async () => {
    const { service, protectedOperationService } = buildService({
      hasWorkspacePermission: false,
    });
    const effect = jest.fn();

    await expect(
      service.execute({
        authContext,
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.send.enqueue',
        riskClass: 'R3',
        targetResourceType: 'messageCampaign',
        targetResourceId: CAMPAIGN_ID,
        actionArguments: { campaignId: CAMPAIGN_ID },
        execute: effect,
      }),
    ).rejects.toThrow('Campaign workspace permission is not active.');
    expect(effect).not.toHaveBeenCalled();
    expect(protectedOperationService.execute).not.toHaveBeenCalled();
  });

  it('denies a bypass-bearing campaign authority before the effect', async () => {
    const { service, protectedOperationService } = buildService({
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    const effect = jest.fn();

    await expect(
      service.execute({
        authContext,
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.send.enqueue',
        riskClass: 'R3',
        targetResourceType: 'messageCampaign',
        targetResourceId: CAMPAIGN_ID,
        actionArguments: { campaignId: CAMPAIGN_ID },
        execute: effect,
      }),
    ).rejects.toThrow('Campaign authority is unresolved.');
    expect(effect).not.toHaveBeenCalled();
    expect(protectedOperationService.execute).not.toHaveBeenCalled();
  });

  it('binds a campaign effect to current authority and durable policy evidence', async () => {
    const { permissionsService, service, protectedOperationService } =
      buildService();
    const effect = jest.fn().mockResolvedValue({ queuedCount: 3 });

    await expect(
      service.execute({
        authContext,
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.send.enqueue',
        riskClass: 'R3',
        targetResourceType: 'messageCampaign',
        targetResourceId: CAMPAIGN_ID,
        targetCount: 3,
        actionArguments: { campaignId: CAMPAIGN_ID },
        execute: effect,
      }),
    ).resolves.toMatchObject({
      value: { queuedCount: 3 },
      policyDecisionId: expect.any(String),
      rootCorrelationId: expect.any(String),
    });

    expect(effect).toHaveBeenCalledWith({
      policyDecisionId: expect.any(String),
      rootCorrelationId: expect.any(String),
    });
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      userWorkspaceId: authContext.userWorkspaceId,
      setting: 'WORKSPACE',
      workspaceId: WORKSPACE_ID,
    });
    expect(protectedOperationService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        auditMetadata: {
          argumentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          targetCount: 3,
        },
        context: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          operation: 'campaign.send.enqueue',
          riskClass: 'R3',
          actor: expect.objectContaining({
            type: 'user',
            id: USER_ID,
            workspaceMemberId: WORKSPACE_MEMBER_ID,
          }),
          authority: {
            type: 'roles',
            source: 'CALLER_BOUND',
            workspaceId: WORKSPACE_ID,
            authorityVersion: 'campaign-metadata-7',
            revocationState: 'ACTIVE',
            evaluatedAt: expect.any(String),
            rolePermissionConfig: { unionOf: [ROLE_ID] },
          },
        }),
      }),
    );
  });

  it('never reports success after the effect when audit outcome persistence fails', async () => {
    const { service } = buildService({
      protectedResult: 'RECONCILIATION_REQUIRED',
    });
    const effect = jest.fn().mockResolvedValue({ queuedCount: 3 });

    await expect(
      service.execute({
        authContext,
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.send.enqueue',
        riskClass: 'R3',
        targetResourceType: 'messageCampaign',
        targetResourceId: CAMPAIGN_ID,
        actionArguments: { campaignId: CAMPAIGN_ID },
        execute: effect,
      }),
    ).rejects.toThrow(
      'Campaign operation requires reconciliation after protected execution.',
    );
    expect(effect).toHaveBeenCalledTimes(1);
  });
});
