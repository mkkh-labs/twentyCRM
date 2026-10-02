import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { SettingsAdminIndicatorHealthStatusContent } from '@/settings/admin-panel/health-status/components/SettingsAdminIndicatorHealthStatusContent';

jest.mock(
  '@/settings/admin-panel/health-status/components/SettingsAdminJsonDataIndicatorHealthStatus',
  () => ({
    SettingsAdminJsonDataIndicatorHealthStatus: () => (
      <div>Structured operational evidence</div>
    ),
  }),
);

jest.mock(
  '@/settings/admin-panel/health-status/components/SettingsAdminWorkerHealthStatus',
  () => ({
    SettingsAdminWorkerHealthStatus: () => <div>Worker health</div>,
  }),
);

jest.mock(
  '@/settings/admin-panel/health-status/components/SettingsAdminConnectedAccountHealthStatus',
  () => ({
    SettingsAdminConnectedAccountHealthStatus: () => (
      <div>Connected account health</div>
    ),
  }),
);

describe('SettingsAdminIndicatorHealthStatusContent', () => {
  it('renders structured evidence for the Ideal CRM health indicator', () => {
    render(
      <MemoryRouter
        initialEntries={['/idealCrm']}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route
            path="/:indicatorId"
            element={<SettingsAdminIndicatorHealthStatusContent />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Structured operational evidence'),
    ).toBeInTheDocument();
  });
});
