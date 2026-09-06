import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export const computeFileSha256 = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
};
