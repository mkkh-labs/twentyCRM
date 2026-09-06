import { Logger } from '@nestjs/common';

import {
  UpdateSubscriptionQuantityJob,
  type UpdateSubscriptionQuantityJobData,
} from 'src/engine/core-modules/billing/jobs/update-subscription-quantity.job';

describe('UpdateSubscriptionQuantityJob reliability boundary', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildDependencies = () => ({
    billingSubscriptionUpdateService: {
      changeSeats: jest.fn().mockResolvedValue(undefined),
    },
    userWorkspaceRepository: {
      count: jest.fn().mockResolvedValue(3),
    },
    jobContext: {
      jobId: 'job-1',
      jobName: UpdateSubscriptionQuantityJob.name,
      retryLimit: 2,
      updateData: jest.fn().mockResolvedValue(undefined),
    },
  });

  const buildJob = (dependencies: ReturnType<typeof buildDependencies>) =>
    new UpdateSubscriptionQuantityJob(
      dependencies.billingSubscriptionUpdateService as never,
      dependencies.userWorkspaceRepository as never,
    );

  it('persists the effect snapshot before updating Stripe', async () => {
    const dependencies = buildDependencies();
    const data: UpdateSubscriptionQuantityJobData = {
      workspaceId: 'workspace-1',
    };

    await expect(
      buildJob(dependencies).handle(data, dependencies.jobContext),
    ).resolves.toBeUndefined();

    const expectedSnapshot = {
      workspaceId: 'workspace-1',
      workspaceMembersCount: 3,
      idempotencyKey:
        'd5e372e6c9643b0ab8c4e73f385ea77fb186a59c78b5a100845486bd3de37015',
    };

    expect(dependencies.jobContext.updateData).toHaveBeenCalledWith(
      expectedSnapshot,
    );
    expect(
      dependencies.jobContext.updateData.mock.invocationCallOrder[0],
    ).toBeLessThan(
      dependencies.billingSubscriptionUpdateService.changeSeats.mock
        .invocationCallOrder[0],
    );
    expect(
      dependencies.billingSubscriptionUpdateService.changeSeats,
    ).toHaveBeenCalledWith('workspace-1', 3, {
      idempotencyKey: expectedSnapshot.idempotencyKey,
    });
  });

  it('reuses a valid persisted snapshot without recounting members', async () => {
    const dependencies = buildDependencies();
    const data: UpdateSubscriptionQuantityJobData = {
      workspaceId: 'workspace-1',
      workspaceMembersCount: 3,
      idempotencyKey:
        'd5e372e6c9643b0ab8c4e73f385ea77fb186a59c78b5a100845486bd3de37015',
    };

    await expect(
      buildJob(dependencies).handle(data, dependencies.jobContext),
    ).resolves.toBeUndefined();

    expect(dependencies.userWorkspaceRepository.count).not.toHaveBeenCalled();
    expect(dependencies.jobContext.updateData).not.toHaveBeenCalled();
    expect(
      dependencies.billingSubscriptionUpdateService.changeSeats,
    ).toHaveBeenCalledWith('workspace-1', 3, {
      idempotencyKey: data.idempotencyKey,
    });
  });

  it('rejects a tampered persisted snapshot before the external effect', async () => {
    const dependencies = buildDependencies();

    await expect(
      buildJob(dependencies).handle(
        {
          workspaceId: 'workspace-1',
          workspaceMembersCount: 3,
          idempotencyKey: 'tampered',
        },
        dependencies.jobContext,
      ),
    ).rejects.toThrow('Invalid billing quantity job snapshot');

    expect(
      dependencies.billingSubscriptionUpdateService.changeSeats,
    ).not.toHaveBeenCalled();
  });

  it('rejects a missing queue identity before reading or writing', async () => {
    const dependencies = buildDependencies();

    await expect(
      buildJob(dependencies).handle(
        { workspaceId: 'workspace-1' },
        { ...dependencies.jobContext, jobId: undefined },
      ),
    ).rejects.toThrow('Billing quantity job identity is required');

    expect(dependencies.userWorkspaceRepository.count).not.toHaveBeenCalled();
    expect(
      dependencies.billingSubscriptionUpdateService.changeSeats,
    ).not.toHaveBeenCalled();
  });

  it('uses the enqueue operation identity when the sync driver has no job id', async () => {
    const dependencies = buildDependencies();

    await expect(
      buildJob(dependencies).handle(
        {
          workspaceId: 'workspace-1',
          operationId: 'operation-1',
        },
        { ...dependencies.jobContext, jobId: '' },
      ),
    ).resolves.toBeUndefined();

    expect(dependencies.jobContext.updateData).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      operationId: 'operation-1',
      workspaceMembersCount: 3,
      idempotencyKey:
        '9b9d8da0c8641dcc7bf812d5e88856761f9b08c91bdf7310e9f15f81c6936e57',
    });
  });

  it('propagates provider failure so the queue cannot report success', async () => {
    const dependencies = buildDependencies();

    dependencies.billingSubscriptionUpdateService.changeSeats.mockRejectedValue(
      new Error('Stripe timeout'),
    );

    await expect(
      buildJob(dependencies).handle(
        { workspaceId: 'workspace-1' },
        dependencies.jobContext,
      ),
    ).rejects.toThrow('Stripe timeout');
  });

  it('does not call the provider when the active member count is zero', async () => {
    const dependencies = buildDependencies();

    dependencies.userWorkspaceRepository.count.mockResolvedValue(0);

    await expect(
      buildJob(dependencies).handle(
        { workspaceId: 'workspace-1' },
        dependencies.jobContext,
      ),
    ).resolves.toBeUndefined();

    expect(dependencies.jobContext.updateData).not.toHaveBeenCalled();
    expect(
      dependencies.billingSubscriptionUpdateService.changeSeats,
    ).not.toHaveBeenCalled();
  });
});
