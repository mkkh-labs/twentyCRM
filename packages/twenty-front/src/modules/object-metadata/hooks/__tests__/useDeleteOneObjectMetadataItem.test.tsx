import { act, renderHook } from '@testing-library/react';

import { useDeleteOneObjectMetadataItem } from '@/object-metadata/hooks/useDeleteOneObjectMetadataItem';

import { jestExpectSuccessfulMetadataRequestResult } from '@/object-metadata/hooks/__tests__/utils/jest-expect-metadata-request-status.util';
import { GET_CURRENT_USER } from '@/users/graphql/queries/getCurrentUser';
import { FIND_ALL_VIEWS } from '@/views/graphql/queries/findAllViews';
import { FindManyCommandMenuItemsDocument } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { mockedUserData } from '~/testing/mock-data/users';
import { mockedViews } from '~/testing/mock-data/generated/metadata/views/mock-views-data';
import {
  query as findManyObjectMetadataItemsQuery,
  responseData as findManyObjectMetadataItemsResponseData,
} from '@/object-metadata/hooks/__mocks__/useFindManyObjectMetadataItems';

const preparedDeletion = {
  id: '22222222-2222-4222-8222-222222222222',
  version: 2,
  dependencyImpact: {
    workflows: [],
    views: [],
    applications: [],
    contracts: [],
    metadata: [],
  },
  dependencyCount: 0,
};
const mockPrepareMetadataDeletion = jest
  .fn()
  .mockResolvedValue(preparedDeletion);
const mockApplyPreparedMetadataDeletion = jest
  .fn()
  .mockResolvedValue({ status: 'SUCCEEDED' });

jest.mock('@/object-metadata/hooks/useMetadataDeletionChangeSet', () => ({
  useMetadataDeletionChangeSet: () => ({
    prepareMetadataDeletion: mockPrepareMetadataDeletion,
    applyPreparedMetadataDeletion: mockApplyPreparedMetadataDeletion,
  }),
}));

const mocks = [
  {
    request: {
      query: GET_CURRENT_USER,
      variables: {},
    },
    result: jest.fn(() => ({
      data: {
        currentUser: mockedUserData,
      },
    })),
  },
  {
    request: {
      query: FIND_ALL_VIEWS,
      variables: {},
    },
    result: jest.fn(() => ({
      data: {
        getViews: mockedViews,
      },
    })),
  },
  {
    request: {
      query: findManyObjectMetadataItemsQuery,
      variables: {},
    },
    result: jest.fn(() => ({
      data: findManyObjectMetadataItemsResponseData,
    })),
  },
  {
    request: {
      query: FindManyCommandMenuItemsDocument,
      variables: {},
    },
    result: jest.fn(() => ({
      data: {
        commandMenuItems: [],
      },
    })),
  },
];

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: mocks,
});

describe('useDeleteOneObjectMetadataItem', () => {
  it('should work as expected', async () => {
    const { result } = renderHook(() => useDeleteOneObjectMetadataItem(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      const preparation =
        await result.current.prepareDeleteOneObjectMetadataItem('idToDelete');

      jestExpectSuccessfulMetadataRequestResult(preparation);
      const res = await result.current.deleteOneObjectMetadataItem(
        'idToDelete',
        preparation.response,
      );

      jestExpectSuccessfulMetadataRequestResult(res);
      expect(res.response).toEqual({ status: 'SUCCEEDED' });
    });

    expect(mockPrepareMetadataDeletion).toHaveBeenCalledWith({
      targetType: 'OBJECT',
      targetId: 'idToDelete',
    });
    expect(mockApplyPreparedMetadataDeletion).toHaveBeenCalledWith(
      preparedDeletion,
      { acknowledgeDependencies: true },
    );
  });
});
