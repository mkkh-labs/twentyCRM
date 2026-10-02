import { readFile, stat } from 'fs/promises';

export const readWorkspaceExportEncryptionSecret = async (
  encryptionKeyFile: string,
): Promise<string> => {
  const keyFileStat = await stat(encryptionKeyFile);

  if (!keyFileStat.isFile()) {
    throw new Error('Workspace export encryption key path must be a file.');
  }

  if ((keyFileStat.mode & 0o077) !== 0) {
    throw new Error(
      'Workspace export encryption key file must not be accessible by group or other users.',
    );
  }

  const encryptionSecret = (await readFile(encryptionKeyFile, 'utf8')).replace(
    /\r?\n$/,
    '',
  );

  if (encryptionSecret.length === 0) {
    throw new Error('Workspace export encryption key file must not be empty.');
  }

  return encryptionSecret;
};
