import { SEND_CAMPAIGN_EMAIL_JOB } from 'src/engine/core-modules/emailing-domain/constants/campaign.constant';
import { type MessageQueueJobContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';
import { MessageCampaignService } from 'src/modules/emailing/services/message-campaign.service';
import { type SendCampaignEmailJobData } from 'src/engine/core-modules/emailing-domain/types/send-campaign-email-job-data.type';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { assertCampaignJobAuthority } from 'src/modules/emailing/utils/assert-campaign-job-authority.util';
import { sendCampaignEmailJobDataSchema } from 'src/modules/emailing/zod-schemas/campaign-job-data.zod-schema';

@Processor(MessageQueue.emailQueue)
export class SendCampaignEmailJob {
  constructor(
    private readonly messageCampaignService: MessageCampaignService,
  ) {}

  @Process(SEND_CAMPAIGN_EMAIL_JOB)
  async handle(
    data: unknown,
    jobContext?: MessageQueueJobContext,
  ): Promise<void> {
    const parsedData = sendCampaignEmailJobDataSchema.safeParse(data);

    if (!parsedData.success) {
      throw new Error('Campaign job authority is missing or invalid');
    }

    assertCampaignJobAuthority({
      data: parsedData.data,
      jobContext,
      expectedJobName: SEND_CAMPAIGN_EMAIL_JOB,
    });

    await this.messageCampaignService.processSendJob(
      parsedData.data as SendCampaignEmailJobData,
    );
  }
}
