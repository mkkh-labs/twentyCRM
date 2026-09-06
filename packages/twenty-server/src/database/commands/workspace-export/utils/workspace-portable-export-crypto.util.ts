import { createCipheriv, scryptSync, type CipherGCM } from 'crypto';

export const deriveWorkspaceExportKey = (
  encryptionSecret: string,
  salt: Buffer,
): Buffer => {
  if (encryptionSecret.length < 32) {
    throw new Error(
      'Workspace export encryption secret must contain at least 32 characters.',
    );
  }

  return scryptSync(encryptionSecret, salt, 32);
};

export const createWorkspaceExportCipher = (
  key: Buffer,
  initializationVector: Buffer,
): CipherGCM => createCipheriv('aes-256-gcm', key, initializationVector);
