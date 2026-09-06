import { IdealCrmHealthIndicator } from 'src/engine/core-modules/admin-panel/indicators/ideal-crm.health';

const createHealthIndicatorService = () => ({
  check: jest.fn().mockReturnValue({
    up: jest.fn().mockImplementation((data) => ({
      idealCrm: { status: 'up', ...data },
    })),
    down: jest.fn().mockImplementation((data) => ({
      idealCrm: { status: 'down', ...data },
    })),
  }),
});

const createAuditQueryBuilder = (unresolvedAllowedDecisionCount: number) => {
  const queryBuilder = {
    andWhere: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue({
      count: String(unresolvedAllowedDecisionCount),
    }),
    select: jest.fn(),
    where: jest.fn(),
  };

  queryBuilder.select.mockReturnValue(queryBuilder);
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);

  return queryBuilder;
};

const createIndicator = ({
  outboxCounts = [0, 0],
  outboxConsumerReconciliationCount = 0,
  outboxConsumerStaleProcessingCount = 0,
  workflowCounts = [0, 0, 0],
  unresolvedAllowedDecisionCount = 0,
}: {
  outboxCounts?: [number, number];
  outboxConsumerReconciliationCount?: number;
  outboxConsumerStaleProcessingCount?: number;
  workflowCounts?: [number, number, number];
  unresolvedAllowedDecisionCount?: number;
}) => {
  const healthIndicatorService = createHealthIndicatorService();
  const auditQueryBuilder = createAuditQueryBuilder(
    unresolvedAllowedDecisionCount,
  );
  const indicator = Object.assign(
    Object.create(IdealCrmHealthIndicator.prototype),
    {
      healthIndicatorService,
      outboxEventRepository: {
        countBy: jest
          .fn()
          .mockResolvedValueOnce(outboxCounts[0])
          .mockResolvedValueOnce(outboxCounts[1]),
      },
      outboxConsumerReceiptRepository: {
        countBy: jest
          .fn()
          .mockResolvedValueOnce(outboxConsumerReconciliationCount)
          .mockResolvedValueOnce(outboxConsumerStaleProcessingCount),
      },
      policyAuditEventRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(auditQueryBuilder),
      },
      workflowEffectExecutionRepository: {
        countBy: jest
          .fn()
          .mockResolvedValueOnce(workflowCounts[0])
          .mockResolvedValueOnce(workflowCounts[1])
          .mockResolvedValueOnce(workflowCounts[2]),
      },
    },
  ) as IdealCrmHealthIndicator;

  return { indicator };
};

describe('IdealCrmHealthIndicator', () => {
  it('reports operational when every durable recovery condition is clear', async () => {
    const { indicator } = createIndicator({});

    const result = await indicator.isHealthy();

    expect(result.idealCrm).toMatchObject({
      status: 'up',
      details: {
        outbox: {
          consumerReconciliationRequired: 0,
          consumerStaleProcessing: 0,
          dead: 0,
          reconciliationRequired: 0,
        },
        policyAudit: {
          unresolvedAllowedDecisions: 0,
        },
        workflowEffects: {
          deadLettered: 0,
          failedPermanent: 0,
          uncertain: 0,
        },
      },
    });
  });

  it('reports an outage with count-only evidence for every recovery condition', async () => {
    const { indicator } = createIndicator({
      outboxCounts: [2, 3],
      outboxConsumerReconciliationCount: 4,
      outboxConsumerStaleProcessingCount: 6,
      workflowCounts: [5, 7, 11],
      unresolvedAllowedDecisionCount: 13,
    });

    const result = await indicator.isHealthy();

    expect(result.idealCrm).toEqual({
      status: 'down',
      message: 'Ideal CRM has unresolved protected-operation conditions.',
      details: {
        outbox: {
          consumerReconciliationRequired: 4,
          consumerStaleProcessing: 6,
          dead: 2,
          reconciliationRequired: 3,
        },
        policyAudit: {
          unresolvedAllowedDecisions: 13,
        },
        workflowEffects: {
          deadLettered: 5,
          failedPermanent: 7,
          uncertain: 11,
        },
      },
    });
  });

  it('fails closed without returning repository error details', async () => {
    const { indicator } = createIndicator({});

    Object.assign(indicator, {
      outboxEventRepository: {
        countBy: jest.fn().mockRejectedValue(new Error('secret database URL')),
      },
    });

    const result = await indicator.isHealthy();

    expect(result.idealCrm).toEqual({
      status: 'down',
      message: 'Ideal CRM recovery health could not be evaluated.',
    });
    expect(JSON.stringify(result)).not.toContain('secret database URL');
  });
});
