import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { type CampaignJobAuthority } from 'src/engine/core-modules/emailing-domain/types/campaign-job-authority.type';
import { type MessageQueueJobContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';

export const assertCampaignJobAuthority = ({
  data,
  jobContext,
  expectedJobName,
}: {
  data: Partial<CampaignJobAuthority> & { workspaceId?: string };
  jobContext?: MessageQueueJobContext;
  expectedJobName: string;
}): void => {
  if (
    data.schemaVersion !== 1 ||
    !isDefined(data.workspaceId) ||
    !isValidUuid(data.workspaceId) ||
    !isDefined(data.userWorkspaceId) ||
    !isValidUuid(data.userWorkspaceId) ||
    !isDefined(data.roleId) ||
    !isValidUuid(data.roleId) ||
    !isDefined(data.rootCorrelationId) ||
    !isValidUuid(data.rootCorrelationId) ||
    !isDefined(jobContext?.jobId) ||
    !isValidUuid(jobContext.jobId) ||
    jobContext?.jobName !== expectedJobName
  ) {
    throw new Error('Campaign job authority is missing or invalid');
  }
};
