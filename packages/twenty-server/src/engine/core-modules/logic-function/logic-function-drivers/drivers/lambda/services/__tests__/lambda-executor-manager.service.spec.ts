import {
  GetFunctionCommand,
  GetFunctionConcurrencyCommand,
  PutFunctionConcurrencyCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';

import { LambdaExecutorManagerService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/services/lambda-executor-manager.service';
import { type LambdaAwsClientService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/services/lambda-aws-client.service';
import { type LambdaLayerManagerService } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/services/lambda-layer-manager.service';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { type CacheLockService } from 'src/engine/core-modules/cache-lock/cache-lock.service';
import { type LogicFunctionResourceService } from 'src/engine/core-modules/logic-function/logic-function-resource/logic-function-resource.service';
import { type FlatLogicFunction } from 'src/engine/metadata-modules/logic-function/types/flat-logic-function.type';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

describe('LambdaExecutorManagerService', () => {
  it('repairs missing reserved concurrency before reusing an executor', async () => {
    const sentCommands: object[] = [];
    const send = jest.fn(async (command: object) => {
      sentCommands.push(command);

      if (command instanceof GetFunctionCommand) {
        return {
          Configuration: {
            EphemeralStorage: { Size: 4096 },
            FunctionArn:
              'arn:aws:lambda:us-east-1:123456789012:function:function-id',
            FunctionName: 'function-id',
            MemorySize: 512,
            Role: 'arn:aws:iam::123456789012:role/twenty-lambda',
            Runtime: 'nodejs22.x',
            State: 'Active',
            Timeout: 900,
            VpcConfig: {
              SecurityGroupIds: ['sg-1'],
              SubnetIds: ['subnet-1'],
            },
          },
        };
      }

      if (command instanceof GetFunctionConcurrencyCommand) {
        return {};
      }

      return {};
    });
    const awsClient = {
      getLambdaClient: jest.fn().mockResolvedValue({ send }),
      waitFunctionUpdated: jest.fn().mockResolvedValue(undefined),
    } as unknown as LambdaAwsClientService;
    const layerManager = {
      ensureDepsLayer: jest.fn().mockResolvedValue('deps-layer-arn'),
      ensureSdkLayer: jest.fn().mockResolvedValue('sdk-layer-arn'),
      hasExpectedLayers: jest.fn().mockReturnValue(true),
    } as unknown as LambdaLayerManagerService;
    const cacheLockService = {
      withLock: jest.fn(async (callback: () => Promise<void>) => callback()),
    } as unknown as CacheLockService;
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatApplicationMaps: {
          byId: {
            'application-id': {
              id: 'application-id',
              isSdkLayerStale: false,
            },
          },
        },
      }),
    } as unknown as WorkspaceCacheService;
    const manager = new LambdaExecutorManagerService(
      {
        lambdaRole: 'arn:aws:iam::123456789012:role/twenty-lambda',
        reservedConcurrency: 1,
        vpcConfig: {
          securityGroupIds: ['sg-1'],
          subnetIds: ['subnet-1'],
        },
      },
      awsClient,
      layerManager,
      cacheLockService,
      {} as LogicFunctionResourceService,
      workspaceCacheService,
    );
    const flatApplication = {
      id: 'application-id',
      isSdkLayerStale: false,
    } as FlatApplication;
    const flatLogicFunction = {
      id: 'function-id',
      runtime: 'nodejs22.x',
      workspaceId: 'workspace-id',
    } as FlatLogicFunction;

    await manager.buildExecutor({
      applicationUniversalIdentifier: 'application-universal-identifier',
      flatApplication,
      flatLogicFunction,
    });

    const updateCommand = sentCommands.find(
      (command) => command instanceof UpdateFunctionConfigurationCommand,
    );
    const concurrencyCommand = sentCommands.find(
      (command) => command instanceof PutFunctionConcurrencyCommand,
    );

    expect(updateCommand).toBeDefined();
    expect(concurrencyCommand).toBeInstanceOf(PutFunctionConcurrencyCommand);
    expect((concurrencyCommand as PutFunctionConcurrencyCommand).input).toEqual(
      {
        FunctionName: 'function-id',
        ReservedConcurrentExecutions: 1,
      },
    );
  });
});
