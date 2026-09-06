import { AsyncLocalStorage } from 'node:async_hooks';

import { type DestructiveMetadataChangeExecutionContext } from 'src/engine/workspace-manager/workspace-migration/types/destructive-metadata-change-execution-context.type';

const destructiveMetadataChangeExecutionStorage =
  new AsyncLocalStorage<DestructiveMetadataChangeExecutionContext>();

export const getDestructiveMetadataChangeExecutionContext = () =>
  destructiveMetadataChangeExecutionStorage.getStore();

export const withDestructiveMetadataChangeExecutionContext = <TResult>(
  context: DestructiveMetadataChangeExecutionContext,
  callback: () => TResult,
): TResult => destructiveMetadataChangeExecutionStorage.run(context, callback);
