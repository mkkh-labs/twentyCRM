import { Injectable } from '@nestjs/common';

import { WORKFLOW_PROVIDER_CAPABILITIES } from 'src/engine/core-modules/workflow-reliability/constants/workflow-provider-capabilities.constant';
import { type WorkflowProviderCapability } from 'src/engine/core-modules/workflow-reliability/types/workflow-provider-capability.type';
import { resolveWorkflowProviderCapability } from 'src/engine/core-modules/workflow-reliability/utils/resolve-workflow-provider-capability.util';

@Injectable()
export class WorkflowProviderCapabilityRegistryService {
  resolve(providerClass: string): WorkflowProviderCapability {
    return resolveWorkflowProviderCapability({
      providerClass,
      capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
    });
  }
}
