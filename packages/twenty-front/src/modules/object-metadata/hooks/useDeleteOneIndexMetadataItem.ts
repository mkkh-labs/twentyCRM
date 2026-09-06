import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { CrudOperationType } from 'twenty-shared/types';

import { useMetadataErrorHandler } from '@/metadata-error-handler/hooks/useMetadataErrorHandler';
import { useUpdateMetadataStoreDraft } from '@/metadata-store/hooks/useUpdateMetadataStoreDraft';
import { type MetadataRequestResult } from '@/object-metadata/types/MetadataRequestResult.type';
import {
  type PreparedMetadataDeletion,
  useMetadataDeletionChangeSet,
} from '@/object-metadata/hooks/useMetadataDeletionChangeSet';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

export const useDeleteOneIndexMetadataItem = () => {
  const { applyPreparedMetadataDeletion, prepareMetadataDeletion } =
    useMetadataDeletionChangeSet();

  const { handleMetadataError } = useMetadataErrorHandler();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { removeFromDraft, applyChanges } = useUpdateMetadataStoreDraft();

  const handleError = (error: unknown) => {
    if (CombinedGraphQLErrors.is(error)) {
      handleMetadataError(error, {
        primaryMetadataName: 'index',
        operationType: CrudOperationType.DELETE,
      });
    } else {
      enqueueErrorSnackBar({ message: t`An error occurred.` });
    }
  };

  const prepareDeleteOneIndexMetadataItem = async ({
    idToDelete,
  }: {
    idToDelete: string;
  }): Promise<MetadataRequestResult<PreparedMetadataDeletion>> => {
    try {
      const response = await prepareMetadataDeletion({
        targetType: 'INDEX',
        targetId: idToDelete,
      });

      return { status: 'successful', response };
    } catch (error) {
      handleError(error);

      return { status: 'failed', error };
    }
  };

  const deleteOneIndexMetadataItem = async ({
    idToDelete,
    preparedDeletion,
  }: {
    idToDelete: string;
    preparedDeletion: PreparedMetadataDeletion;
  }): Promise<
    MetadataRequestResult<
      Awaited<ReturnType<typeof applyPreparedMetadataDeletion>>
    >
  > => {
    try {
      const response = await applyPreparedMetadataDeletion(preparedDeletion, {
        acknowledgeDependencies: true,
      });

      removeFromDraft({ key: 'indexMetadataItems', itemIds: [idToDelete] });
      applyChanges();

      return {
        status: 'successful',
        response,
      };
    } catch (error) {
      handleError(error);

      return {
        status: 'failed',
        error,
      };
    }
  };

  return {
    deleteOneIndexMetadataItem,
    prepareDeleteOneIndexMetadataItem,
  };
};
