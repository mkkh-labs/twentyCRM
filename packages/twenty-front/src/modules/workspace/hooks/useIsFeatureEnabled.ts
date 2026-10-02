import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { type FeatureFlagKey as SharedFeatureFlagKey } from 'twenty-shared/types';
import { type FeatureFlagKey as GeneratedFeatureFlagKey } from '~/generated-metadata/graphql';

export const useIsFeatureEnabled = (
  featureKey: SharedFeatureFlagKey | GeneratedFeatureFlagKey | null,
) => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);

  if (!featureKey) {
    return false;
  }

  const featureFlag = currentWorkspace?.featureFlags?.find(
    (flag) => flag.key === featureKey,
  );

  return !!featureFlag?.value;
};
