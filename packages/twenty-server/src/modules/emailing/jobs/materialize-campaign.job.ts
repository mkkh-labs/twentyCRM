import { MATERIALIZE_CAMPAIGN_JOB } from 'src/engine/core-modules/emailing-domain/constants/campaign.constant';
import { type MaterializeCampaignJobData } from 'src/engine/core-modules/emailing-domain/types/materialize-campaign-job-data.type';
import { type MessageQueueJobContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageCampaignService } from 'src/modules/emailing/services/message-campaign.service';
import { assertCampaignJobAuthority } from 'src/modules/emailing/utils/assert-campaign-job-authority.util';
import { materializeCampaignJobDataSchema } from 'src/modules/emailing/zod-schemas/campaign-job-data.zod-schema';

@Processor(MessageQueue.emailQueue)
export class MaterializeCampaignJob {
  constructor(
    private readonly messageCampaignService: MessageCampaignService,
  ) {}

  @Process(MATERIALIZE_CAMPAIGN_JOB)
  async handle(
    data: unknown,
    jobContext?: MessageQueueJobContext,
  ): Promise<void> {
    const parsedData = materializeCampaignJobDataSchema.safeParse(data);

    if (!parsedData.success) {
      throw new Error('Campaign job authority is missing or invalid');
    }

    assertCampaignJobAuthority({
      data: parsedData.data,
      jobContext,
      expectedJobName: MATERIALIZE_CAMPAIGN_JOB,
    });

    await this.messageCampaignService.processMaterializeJob(
      parsedData.data as MaterializeCampaignJobData,
    );
  }
}
