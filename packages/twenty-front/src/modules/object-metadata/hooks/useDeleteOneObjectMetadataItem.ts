import { useInvalidateMetadataStore } from '@/metadata-store/hooks/useInvalidateMetadataStore';
import { useCleanMorphRelationsTargetingObjectMetadataId } from '@/metadata-store/hooks/useCleanMorphRelationsTargetingObjectMetadataId';
import { useMetadataErrorHandler } from '@/metadata-error-handler/hooks/useMetadataErrorHandler';
import { useUpdateMetadataStoreDraft } from '@/metadata-store/hooks/useUpdateMetadataStoreDraft';
import {
  type PreparedMetadataDeletion,
  useMetadataDeletionChangeSet,
} from '@/object-metadata/hooks/useMetadataDeletionChangeSet';
import { type MetadataRequestResult } from '@/object-metadata/types/MetadataRequestResult.type';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { CrudOperationType } from 'twenty-shared/types';

export const useDeleteOneObjectMetadataItem = () => {
  const { applyPreparedMetadataDeletion, prepareMetadataDeletion } =
    useMetadataDeletionChangeSet();

  const { handleMetadataError } = useMetadataErrorHandler();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { removeFromDraft, applyChanges } = useUpdateMetadataStoreDraft();
  const { invalidateMetadataStore } = useInvalidateMetadataStore();
  const { cleanMorphRelations } =
    useCleanMorphRelationsTargetingObjectMetadataId();

  const handleError = (error: unknown) => {
    if (CombinedGraphQLErrors.is(error)) {
      handleMetadataError(error, {
        primaryMetadataName: 'objectMetadata',
        operationType: CrudOperationType.DELETE,
      });
    } else {
      enqueueErrorSnackBar({ message: t`An error occurred.` });
    }
  };

  const prepareDeleteOneObjectMetadataItem = async (
    idToDelete: string,
  ): Promise<MetadataRequestResult<PreparedMetadataDeletion>> => {
    try {
      const response = await prepareMetadataDeletion({
        targetType: 'OBJECT',
        targetId: idToDelete,
      });

      return { status: 'successful', response };
    } catch (error) {
      handleError(error);

      return { status: 'failed', error };
    }
  };

  const deleteOneObjectMetadataItem = async (
    idToDelete: string,
    preparedDeletion: PreparedMetadataDeletion,
  ): Promise<
    MetadataRequestResult<
      Awaited<ReturnType<typeof applyPreparedMetadataDeletion>>
    >
  > => {
    try {
      const response = await applyPreparedMetadataDeletion(preparedDeletion, {
        acknowledgeDependencies: true,
      });

      removeFromDraft({ key: 'objectMetadataItems', itemIds: [idToDelete] });
      cleanMorphRelations(idToDelete);
      applyChanges();

      invalidateMetadataStore();

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
    deleteOneObjectMetadataItem,
    prepareDeleteOneObjectMetadataItem,
  };
};
