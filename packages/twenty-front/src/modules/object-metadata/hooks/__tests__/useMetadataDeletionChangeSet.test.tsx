import { MockedProvider } from '@apollo/client/testing/react';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

import {
  ACKNOWLEDGE_METADATA_CHANGE_SET_DEPENDENCIES,
  APPLY_METADATA_CHANGE_SET,
  APPROVE_METADATA_CHANGE_SET,
  PLAN_METADATA_CHANGE_SET,
  PREPARE_METADATA_DELETION_CHANGE_SET,
  VALIDATE_METADATA_CHANGE_SET,
} from '@/object-metadata/graphql/metadata-change-set.mutations';
import { useMetadataDeletionChangeSet } from '@/object-metadata/hooks/useMetadataDeletionChangeSet';

const TARGET_ID = '11111111-1111-4111-8111-111111111111';
const CHANGE_SET_ID = '22222222-2222-4222-8222-222222222222';
const APPLY_TOKEN = 'apply-token';

const buildWrapper =
  (mocks: React.ComponentProps<typeof MockedProvider>['mocks']) =>
  ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks}>{children}</MockedProvider>
  );

describe('useMetadataDeletionChangeSet', () => {
  it('prepares a dependency preview before applying a destructive change', async () => {
    const mocks = [
      {
        request: {
          query: PREPARE_METADATA_DELETION_CHANGE_SET,
          variables: { input: { targetType: 'FIELD', targetId: TARGET_ID } },
        },
        result: {
          data: {
            prepareMetadataDeletionChangeSet: {
              id: CHANGE_SET_ID,
              state: 'DRAFT',
              version: 1,
            },
          },
        },
      },
      {
        request: {
          query: PLAN_METADATA_CHANGE_SET,
          variables: { id: CHANGE_SET_ID, expectedVersion: 1 },
        },
        result: {
          data: {
            planMetadataChangeSet: {
              dependencyImpact: {
                workflows: ['workflow-a'],
                views: [],
                applications: [],
                contracts: [],
                metadata: [],
              },
              state: 'PLANNED',
              version: 2,
            },
          },
        },
      },
    ];
    const { result } = renderHook(() => useMetadataDeletionChangeSet(), {
      wrapper: buildWrapper(mocks),
    });

    await act(async () => {
      await expect(
        result.current.prepareMetadataDeletion({
          targetType: 'FIELD',
          targetId: TARGET_ID,
        }),
      ).resolves.toMatchObject({
        id: CHANGE_SET_ID,
        version: 2,
        dependencyCount: 1,
      });
    });
  });

  it('requires acknowledgement and applies the exact prepared dependency set', async () => {
    const dependencyImpact = {
      workflows: ['workflow-a'],
      views: [],
      applications: [],
      contracts: [],
      metadata: [],
    };
    const mocks = [
      {
        request: {
          query: ACKNOWLEDGE_METADATA_CHANGE_SET_DEPENDENCIES,
          variables: { id: CHANGE_SET_ID, expectedVersion: 2 },
        },
        result: {
          data: {
            acknowledgeMetadataChangeSetDependencies: {
              dependencyResolutionDigest: 'a'.repeat(64),
              version: 3,
            },
          },
        },
      },
      {
        request: {
          query: VALIDATE_METADATA_CHANGE_SET,
          variables: { id: CHANGE_SET_ID, expectedVersion: 3 },
        },
        result: {
          data: {
            validateMetadataChangeSet: {
              applyToken: APPLY_TOKEN,
              compatibilityFindings: ['BREAKING_CHANGE', 'ACTIVE_DEPENDENCIES'],
              riskClass: 'R3',
              state: 'VALIDATED',
              version: 4,
            },
          },
        },
      },
      {
        request: {
          query: APPROVE_METADATA_CHANGE_SET,
          variables: {
            id: CHANGE_SET_ID,
            expectedVersion: 4,
            applyToken: APPLY_TOKEN,
          },
        },
        result: { data: { approveMetadataChangeSet: true } },
      },
      {
        request: {
          query: APPLY_METADATA_CHANGE_SET,
          variables: {
            id: CHANGE_SET_ID,
            expectedVersion: 5,
            applyToken: APPLY_TOKEN,
          },
        },
        result: {
          data: {
            applyMetadataChangeSet: {
              status: 'SUCCEEDED',
              value: { appliedMetadataVersion: 9 },
            },
          },
        },
      },
    ];
    const { result } = renderHook(() => useMetadataDeletionChangeSet(), {
      wrapper: buildWrapper(mocks),
    });

    await act(async () => {
      await expect(
        result.current.applyPreparedMetadataDeletion(
          {
            id: CHANGE_SET_ID,
            version: 2,
            dependencyImpact,
            dependencyCount: 1,
          },
          { acknowledgeDependencies: true },
        ),
      ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    });
  });

  it('denies a dependency-bearing apply without explicit acknowledgement', async () => {
    const { result } = renderHook(() => useMetadataDeletionChangeSet(), {
      wrapper: buildWrapper([]),
    });

    await expect(
      result.current.applyPreparedMetadataDeletion(
        {
          id: CHANGE_SET_ID,
          version: 2,
          dependencyImpact: {
            workflows: ['workflow-a'],
            views: [],
            applications: [],
            contracts: [],
            metadata: [],
          },
          dependencyCount: 1,
        },
        { acknowledgeDependencies: false },
      ),
    ).rejects.toThrow('explicit dependency acknowledgement');
  });
});
