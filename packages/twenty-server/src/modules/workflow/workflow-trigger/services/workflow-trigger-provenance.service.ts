import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';

import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { deriveInstanceHmacKey } from 'src/engine/core-modules/secret-encryption/utils/derive-instance-hmac-key.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkflowTriggerProvenanceSignature } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger-job-data.type';

const WORKFLOW_TRIGGER_PROVENANCE_PURPOSE = 'workflow-trigger-provenance';
const SHA_256_PATTERN = /^[a-f0-9]{64}$/;

type SigningKey = Readonly<{
  id: string;
  key: Buffer;
}>;

@Injectable()
export class WorkflowTriggerProvenanceService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  sign(value: unknown): WorkflowTriggerProvenanceSignature {
    const [primaryKey] = this.resolveSigningKeys();

    if (!primaryKey) {
      throw new Error(
        'Workflow trigger provenance signing key is not configured.',
      );
    }

    return {
      signatureVersion: 1,
      signatureKeyId: primaryKey.id,
      signature: this.computeSignature(value, primaryKey.key).toString('hex'),
    };
  }

  verify(
    value: unknown,
    provenance: WorkflowTriggerProvenanceSignature,
  ): boolean {
    if (
      provenance.signatureVersion !== 1 ||
      !SHA_256_PATTERN.test(provenance.signatureKeyId) ||
      !SHA_256_PATTERN.test(provenance.signature)
    ) {
      return false;
    }

    const verificationKey = this.resolveSigningKeys().find(
      (candidate) => candidate.id === provenance.signatureKeyId,
    );

    if (!verificationKey) {
      return false;
    }

    const suppliedSignature = Buffer.from(provenance.signature, 'hex');
    const expectedSignature = this.computeSignature(value, verificationKey.key);

    return (
      suppliedSignature.length === expectedSignature.length &&
      timingSafeEqual(suppliedSignature, expectedSignature)
    );
  }

  private resolveSigningKeys(): SigningKey[] {
    const encryptionKey = this.twentyConfigService.get('ENCRYPTION_KEY');
    const fallbackEncryptionKey = this.twentyConfigService.get(
      'FALLBACK_ENCRYPTION_KEY',
    );
    const appSecret = this.twentyConfigService.get('APP_SECRET');
    const primaryRawKey = isNonEmptyString(encryptionKey)
      ? encryptionKey
      : appSecret;

    if (!isNonEmptyString(primaryRawKey)) {
      return [];
    }

    const rawKeys = [
      primaryRawKey,
      ...(isNonEmptyString(fallbackEncryptionKey)
        ? [fallbackEncryptionKey]
        : []),
      ...(isNonEmptyString(appSecret) ? [appSecret] : []),
    ];
    const keysById = new Map<string, SigningKey>();

    for (const rawKey of rawKeys) {
      const key = deriveInstanceHmacKey({
        rawKey,
        purpose: WORKFLOW_TRIGGER_PROVENANCE_PURPOSE,
      });
      const id = createHash('sha256').update(key).digest('hex');

      keysById.set(id, { id, key });
    }

    return [...keysById.values()];
  }

  private computeSignature(value: unknown, key: Buffer): Buffer {
    return createHmac('sha256', key)
      .update(buildDeterministicDigest(value))
      .digest();
  }
}
