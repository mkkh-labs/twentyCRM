import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';

import { SettingsAgentActionApprovals } from '@/settings/security/components/SettingsAgentActionApprovals';
import { GET_PENDING_AGENT_ACTION_APPROVAL_REQUESTS } from '@/settings/security/graphql/agentActionApprovals';
import { messages } from '~/locales/generated/en';

i18n.load({
  [SOURCE_LOCALE]: messages,
});
i18n.activate(SOURCE_LOCALE);

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));

describe('SettingsAgentActionApprovals', () => {
  it('renders only digest-bound metadata for a pending request', async () => {
    render(
      <MockedProvider
        mocks={[
          {
            request: { query: GET_PENDING_AGENT_ACTION_APPROVAL_REQUESTS },
            result: {
              data: {
                pendingAgentActionApprovalRequests: [
                  {
                    id: '11111111-1111-4111-8111-111111111111',
                    actorId: '22222222-2222-4222-8222-222222222222',
                    action: 'database.delete_one',
                    target: 'database:company',
                    riskClass: 'R3',
                    actionDigest: 'a'.repeat(64),
                    expiresAt: '2026-09-01T12:15:00.000Z',
                    createdAt: '2026-09-01T12:00:00.000Z',
                  },
                ],
              },
            },
          },
        ]}
      >
        <I18nProvider i18n={i18n}>
          <SettingsAgentActionApprovals />
        </I18nProvider>
      </MockedProvider>,
    );

    expect(
      await screen.findByText('Workspace agent writes blocked'),
    ).toBeVisible();
    expect(await screen.findByText('R3 · database.delete_one')).toBeVisible();
    expect(
      screen.getByText(
        `Actor 22222222-2222-4222-8222-222222222222 · database:company · Expires 2026-09-01T12:15:00.000Z · Digest ${'a'.repeat(64)}`,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Approve for 5 minutes/ }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Deny/ })).toBeVisible();
  });
});
