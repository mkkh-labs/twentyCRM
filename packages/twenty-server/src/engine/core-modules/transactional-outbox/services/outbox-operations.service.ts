import { Injectable } from '@nestjs/common';

import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

@Injectable()
export class OutboxOperationsService {
  constructor(
    @InjectWorkspaceScopedRepository(OutboxEventEntity)
    private readonly repository: WorkspaceScopedRepository<OutboxEventEntity>,
  ) {}

  async listRecent({
    workspaceId,
    limit,
  }: Readonly<{
    workspaceId: string;
    limit: number;
  }>): Promise<OutboxEventEntity[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Outbox operation list limit is invalid.');
    }

    return this.repository.find(workspaceId, {
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
