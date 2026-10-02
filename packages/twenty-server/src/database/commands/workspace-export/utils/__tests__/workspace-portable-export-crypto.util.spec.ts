import { createDecipheriv, randomBytes } from 'crypto';

import {
  createWorkspaceExportCipher,
  deriveWorkspaceExportKey,
} from 'src/database/commands/workspace-export/utils/workspace-portable-export-crypto.util';

describe('workspace portable export crypto', () => {
  it('round-trips ciphertext only with the bound key and authentication tag', () => {
    const salt = randomBytes(16);
    const initializationVector = randomBytes(12);
    const key = deriveWorkspaceExportKey(
      'test-only-secret-at-least-32-characters',
      salt,
    );
    const cipher = createWorkspaceExportCipher(key, initializationVector);
    const ciphertext = Buffer.concat([
      cipher.update('workspace backup'),
      cipher.final(),
    ]);
    const authenticationTag = cipher.getAuthTag();
    const decipher = createDecipheriv('aes-256-gcm', key, initializationVector);

    decipher.setAuthTag(authenticationTag);

    expect(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(),
    ).toBe('workspace backup');
  });

  it('rejects an empty encryption secret', () => {
    expect(() => deriveWorkspaceExportKey('', randomBytes(16))).toThrow(
      'at least 32 characters',
    );
  });

  it('rejects an encryption secret shorter than 32 characters', () => {
    expect(() =>
      deriveWorkspaceExportKey('short-secret', randomBytes(16)),
    ).toThrow('at least 32 characters');
  });
});
