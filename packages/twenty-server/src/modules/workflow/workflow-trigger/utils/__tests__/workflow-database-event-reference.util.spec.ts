import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { buildWorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/utils/build-workflow-database-event-reference.util';
import { validateWorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/utils/validate-workflow-database-event-reference.util';

describe('workflow database-event reference', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const workspaceId = '20202020-0000-4000-8000-000000000001';
  const workflowId = '20202020-0000-4000-8000-000000000002';
  const objectMetadataId = '20202020-0000-4000-8000-000000000003';
  const recordId = '20202020-0000-4000-8000-000000000004';

  const buildReference = () =>
    buildWorkflowDatabaseEventReference({
      workspaceId,
      workflowId,
      objectMetadataId,
      objectNameSingular: 'company',
      action: DatabaseEventAction.UPDATED,
      event: {
        recordId,
        properties: {
          updatedFields: ['name'],
          before: { name: 'Old', secret: 'sentinel-before' },
          after: { name: 'New', secret: 'sentinel-after' },
          diff: {},
        },
      },
      now,
    });

  it('serializes only tenant-bound provenance and immutable references', () => {
    const reference = buildReference();

    expect(
      validateWorkflowDatabaseEventReference(
        reference,
        workspaceId,
        workflowId,
        new Date('2026-09-01T00:01:00.000Z'),
      ),
    ).toBe(true);
    expect(JSON.stringify(reference)).not.toContain('sentinel-before');
    expect(JSON.stringify(reference)).not.toContain('sentinel-after');
  });

  it('rejects a cross-workspace binding', () => {
    expect(
      validateWorkflowDatabaseEventReference(
        buildReference(),
        '20202020-0000-4000-8000-000000000099',
        workflowId,
        new Date('2026-09-01T00:01:00.000Z'),
      ),
    ).toBe(false);
  });

  it('rejects tampering and expiry', () => {
    const reference = buildReference();

    expect(
      validateWorkflowDatabaseEventReference(
        { ...reference, recordId: '20202020-0000-4000-8000-000000000099' },
        workspaceId,
        workflowId,
        new Date('2026-09-01T00:01:00.000Z'),
      ),
    ).toBe(false);
    expect(
      validateWorkflowDatabaseEventReference(
        reference,
        workspaceId,
        workflowId,
        new Date('2026-09-01T00:16:00.000Z'),
      ),
    ).toBe(false);
  });

  it('derives a stable tenant-bound idempotency key for duplicate delivery', () => {
    const firstReference = buildReference();
    const secondReference = buildWorkflowDatabaseEventReference({
      workspaceId,
      workflowId,
      objectMetadataId,
      objectNameSingular: 'company',
      action: DatabaseEventAction.UPDATED,
      event: {
        recordId,
        properties: {
          updatedFields: ['name'],
          before: { name: 'Old', secret: 'sentinel-before' },
          after: { name: 'New', secret: 'sentinel-after' },
          diff: {},
        },
      },
      now: new Date('2026-09-01T00:01:00.000Z'),
    });

    expect(firstReference.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    expect(secondReference.idempotencyKey).toBe(firstReference.idempotencyKey);
    expect(secondReference.payloadDigest).not.toBe(
      firstReference.payloadDigest,
    );
  });
});
