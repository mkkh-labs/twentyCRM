import { WorkflowTriggerProvenanceService } from 'src/modules/workflow/workflow-trigger/services/workflow-trigger-provenance.service';

type ConfigValues = Partial<{
  APP_SECRET: string;
  ENCRYPTION_KEY: string;
  FALLBACK_ENCRYPTION_KEY: string;
}>;

const buildService = (values: ConfigValues) =>
  new WorkflowTriggerProvenanceService({
    get: jest.fn((key: keyof ConfigValues) => values[key]) as never,
  } as never);

describe('WorkflowTriggerProvenanceService', () => {
  const reference = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workflowId: '22222222-2222-4222-8222-222222222222',
    recordId: '33333333-3333-4333-8333-333333333333',
  };

  it('signs with the primary key and verifies with timing-safe HMAC', () => {
    const service = buildService({ ENCRYPTION_KEY: 'primary-key' });
    const provenance = service.sign(reference);

    expect(provenance).toMatchObject({ signatureVersion: 1 });
    expect(provenance.signatureKeyId).toMatch(/^[a-f0-9]{64}$/);
    expect(provenance.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(service.verify(reference, provenance)).toBe(true);
    expect(
      service.verify({ ...reference, recordId: 'tampered' }, provenance),
    ).toBe(false);
  });

  it('verifies in-flight references with the fallback rotation key', () => {
    const priorService = buildService({ ENCRYPTION_KEY: 'prior-key' });
    const provenance = priorService.sign(reference);
    const rotatedService = buildService({
      ENCRYPTION_KEY: 'current-key',
      FALLBACK_ENCRYPTION_KEY: 'prior-key',
    });

    expect(rotatedService.verify(reference, provenance)).toBe(true);
  });

  it('rejects an unknown key identifier or unsupported signature version', () => {
    const service = buildService({ APP_SECRET: 'app-secret' });
    const provenance = service.sign(reference);

    expect(
      service.verify(reference, {
        ...provenance,
        signatureKeyId: '0'.repeat(64),
      }),
    ).toBe(false);
    expect(
      service.verify(reference, {
        ...provenance,
        signatureVersion: 2 as never,
      }),
    ).toBe(false);
  });

  it('fails closed when no signing material is configured', () => {
    expect(() => buildService({}).sign(reference)).toThrow(
      'Workflow trigger provenance signing key is not configured.',
    );
  });
});
