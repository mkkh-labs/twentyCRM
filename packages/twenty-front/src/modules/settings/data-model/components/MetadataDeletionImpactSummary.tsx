import { styled } from '@linaria/react';
import { type ReactNode } from 'react';

import { type PreparedMetadataDeletion } from '@/object-metadata/hooks/useMetadataDeletionChangeSet';
import { useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type MetadataDeletionImpactSummaryProps = {
  description: ReactNode;
  preparedDeletion: PreparedMetadataDeletion | null;
};

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledDependencyList = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  overflow-wrap: anywhere;
`;

export const MetadataDeletionImpactSummary = ({
  description,
  preparedDeletion,
}: MetadataDeletionImpactSummaryProps) => {
  const { t } = useLingui();

  if (preparedDeletion === null) {
    return description;
  }

  const dependencyGroups = [
    {
      label: t`Workflows`,
      values: preparedDeletion.dependencyImpact.workflows,
    },
    { label: t`Views`, values: preparedDeletion.dependencyImpact.views },
    {
      label: t`Applications`,
      values: preparedDeletion.dependencyImpact.applications,
    },
    {
      label: t`Contracts`,
      values: preparedDeletion.dependencyImpact.contracts,
    },
    { label: t`Metadata`, values: preparedDeletion.dependencyImpact.metadata },
  ].filter(({ values }) => values.length > 0);

  return (
    <StyledContainer>
      <div>{description}</div>
      {preparedDeletion.dependencyCount === 0 ? (
        <div>{t`No active metadata dependencies were found.`}</div>
      ) : (
        <>
          <div>
            {t`This deletion affects ${preparedDeletion.dependencyCount} active dependencies. Confirming acknowledges this exact plan.`}
          </div>
          <StyledDependencyList>
            {dependencyGroups.map(({ label, values }) => (
              <div key={label}>{`${label}: ${values.join(', ')}`}</div>
            ))}
          </StyledDependencyList>
        </>
      )}
    </StyledContainer>
  );
};
