import { MockedProvider } from '@apollo/client/testing/react';
import { type MockedResponse } from '@apollo/client/testing';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';

import { SettingsOutboxOperations } from '@/settings/security/components/SettingsOutboxOperations';
import { SettingsPolicyAuditExplorer } from '@/settings/security/components/SettingsPolicyAuditExplorer';
import { SettingsWorkflowOperations } from '@/settings/security/components/SettingsWorkflowOperations';
import { GET_OUTBOX_OPERATIONS } from '@/settings/security/graphql/outboxOperations';
import { GET_POLICY_AUDIT_EVENTS } from '@/settings/security/graphql/policyAuditEvents';
import { GET_WORKFLOW_OPERATIONS } from '@/settings/security/graphql/workflowOperations';
import { messages } from '~/locales/generated/en';

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const renderWithI18n = (
  component: React.ReactNode,
  mocks: readonly MockedResponse[],
) =>
  render(
    <MockedProvider mocks={mocks}>
      <I18nProvider i18n={i18n}>{component}</I18nProvider>
    </MockedProvider>,
  );

describe('settings operations evidence', () => {
  it('renders workspace-scoped policy decision and correlation evidence', async () => {
    renderWithI18n(<SettingsPolicyAuditExplorer />, [
      {
        request: {
          query: GET_POLICY_AUDIT_EVENTS,
          variables: { limit: 100 },
        },
        result: {
          data: {
            policyAuditEvents: [
              {
                id: 'audit-1',
                occurredAt: '2026-09-01T12:00:00.000Z',
                phase: 'OUTCOME',
                actorType: 'user',
                actorId: 'actor-1',
                authoritySource: 'CALLER',
                operation: 'metadata.apply',
                riskClass: 'R3',
                resourceType: 'metadataChangeSet',
                resourceId: 'change-set-1',
                policyDecisionId: 'decision-1',
                policyOutcome: 'ALLOW',
                result: 'success',
                reasonCodes: [],
                rootCorrelationId: 'correlation-1',
                attemptId: 'attempt-1',
                traceId: null,
                workflowRunId: null,
                jobId: null,
                mutationOrEffectId: 'change-set-1',
              },
            ],
          },
        },
      },
    ]);

    expect(
      await screen.findByText('R3 · ALLOW · metadata.apply'),
    ).toBeVisible();
    expect(screen.getByText(/Correlation correlation-1/)).toBeVisible();
    expect(screen.getByText(/Decision decision-1/)).toBeVisible();
  });

  it('renders dead-letter replay safety without offering unsafe replay', async () => {
    renderWithI18n(<SettingsWorkflowOperations />, [
      {
        request: { query: GET_WORKFLOW_OPERATIONS, variables: { limit: 50 } },
        result: {
          data: {
            workflowOperations: [
              {
                id: 'effect-1',
                workflowRunId: 'run-1',
                stepId: 'step-1',
                state: 'DEAD_LETTERED',
                attemptCount: 3,
                retryAt: null,
                providerClass: 'HTTP',
                actionDigest: 'a'.repeat(64),
                providerReferenceDigest: null,
                lastErrorCode: 'RETRY_EXHAUSTED',
                uncertaintyReason: null,
                createdAt: '2026-09-01T12:00:00.000Z',
                updatedAt: '2026-09-01T12:05:00.000Z',
                replaySafety: 'REPLAY_REQUIRES_DURABLE_SOURCE_ENVELOPE',
              },
            ],
          },
        },
      },
    ]);

    expect(
      await screen.findByText('DEAD_LETTERED · HTTP · step-1'),
    ).toBeVisible();
    expect(
      screen.getByText(/REPLAY_REQUIRES_DURABLE_SOURCE_ENVELOPE/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /replay/i })).toBeNull();
  });

  it('renders outbox reconciliation evidence without exposing payloads', async () => {
    renderWithI18n(<SettingsOutboxOperations />, [
      {
        request: { query: GET_OUTBOX_OPERATIONS, variables: { limit: 50 } },
        result: {
          data: {
            outboxOperations: [
              {
                id: 'event-1',
                eventType: 'configuration.version.created',
                schemaVersion: 1,
                aggregateType: 'configurationVersion',
                aggregateId: 'version-1',
                payloadDigest: 'b'.repeat(64),
                rootCorrelationId: 'correlation-1',
                state: 'RECONCILIATION_REQUIRED',
                attemptCount: 1,
                availableAt: '2026-09-01T12:00:00.000Z',
                publishedAt: null,
                lastErrorCode: 'OUTBOX_PUBLISH_OUTCOME_UNCERTAIN',
                createdAt: '2026-09-01T12:00:00.000Z',
                recoverySafety: 'RECONCILE_BEFORE_REPLAY',
              },
            ],
          },
        },
      },
    ]);

    expect(
      await screen.findByText(
        'RECONCILIATION_REQUIRED · configuration.version.created v1',
      ),
    ).toBeVisible();
    expect(screen.getByText(/RECONCILE_BEFORE_REPLAY/)).toBeVisible();
    expect(screen.getByText(/Correlation correlation-1/)).toBeVisible();
    expect(screen.queryByText(/secret/i)).toBeNull();
  });
});
