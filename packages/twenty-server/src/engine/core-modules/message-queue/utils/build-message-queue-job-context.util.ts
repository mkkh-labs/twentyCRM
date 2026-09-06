import {
  type MessageQueueJob,
  type MessageQueueJobData,
  type MessageQueueJobRetryContext,
} from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';

export const buildMessageQueueJobContext = (
  job: MessageQueueJob<MessageQueueJobData>,
): MessageQueueJobRetryContext => ({
  jobId: job.id,
  jobName: job.name,
  retryLimit: job.retryLimit,
  updateData: job.updateData,
  ...(job.abortSignal === undefined ? {} : { abortSignal: job.abortSignal }),
});
