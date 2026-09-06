import { buildMessageQueueJobContext } from 'src/engine/core-modules/message-queue/utils/build-message-queue-job-context.util';

describe('buildMessageQueueJobContext', () => {
  it('propagates the concrete job identity and retry capabilities', () => {
    const updateData = jest.fn();
    const context = buildMessageQueueJobContext({
      id: 'job-123',
      name: 'RunWorkflowJob',
      data: {},
      retryLimit: 3,
      updateData,
    });

    expect(context).toEqual({
      jobId: 'job-123',
      jobName: 'RunWorkflowJob',
      retryLimit: 3,
      updateData,
    });
  });
});
