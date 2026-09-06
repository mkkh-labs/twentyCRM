import { isLambdaExecutorConfigurationCompliant } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/utils/is-lambda-executor-configuration-compliant.util';

const EXPECTED_CONFIGURATION = {
  EphemeralStorage: { Size: 4096 },
  MemorySize: 512,
  Role: 'arn:aws:iam::123456789012:role/twenty-lambda',
  Runtime: 'nodejs22.x' as const,
  State: 'Active' as const,
  Timeout: 900,
  VpcConfig: {
    SecurityGroupIds: ['sg-222', 'sg-111'],
    SubnetIds: ['subnet-222', 'subnet-111'],
  },
};

const EXPECTED_INPUT = {
  actualReservedConcurrency: 1,
  expectedRole: 'arn:aws:iam::123456789012:role/twenty-lambda',
  expectedReservedConcurrency: 1,
  expectedRuntime: 'nodejs22.x' as const,
  expectedVpcConfig: {
    securityGroupIds: ['sg-111', 'sg-222'],
    subnetIds: ['subnet-111', 'subnet-222'],
  },
};

describe('isLambdaExecutorConfigurationCompliant', () => {
  it('accepts the expected bounded configuration regardless of VPC identifier order', () => {
    expect(
      isLambdaExecutorConfigurationCompliant({
        configuration: EXPECTED_CONFIGURATION,
        ...EXPECTED_INPUT,
      }),
    ).toBe(true);
  });

  it('rejects a missing executor configuration', () => {
    expect(
      isLambdaExecutorConfigurationCompliant({
        configuration: undefined,
        ...EXPECTED_INPUT,
      }),
    ).toBe(false);
  });

  it.each([
    ['runtime', { Runtime: 'nodejs20.x' as const }],
    ['role', { Role: 'arn:aws:iam::123456789012:role/admin' }],
    ['timeout', { Timeout: 899 }],
    ['memory', { MemorySize: 1024 }],
    ['ephemeral storage', { EphemeralStorage: { Size: 10240 } }],
    [
      'subnets',
      {
        VpcConfig: {
          ...EXPECTED_CONFIGURATION.VpcConfig,
          SubnetIds: ['subnet-foreign'],
        },
      },
    ],
    [
      'security groups',
      {
        VpcConfig: {
          ...EXPECTED_CONFIGURATION.VpcConfig,
          SecurityGroupIds: ['sg-public'],
        },
      },
    ],
  ])('rejects drifted %s configuration', (_label, override) => {
    expect(
      isLambdaExecutorConfigurationCompliant({
        configuration: { ...EXPECTED_CONFIGURATION, ...override },
        ...EXPECTED_INPUT,
      }),
    ).toBe(false);
  });

  it('does not remove an existing VPC attachment when none is required', () => {
    expect(
      isLambdaExecutorConfigurationCompliant({
        configuration: EXPECTED_CONFIGURATION,
        ...EXPECTED_INPUT,
        expectedVpcConfig: undefined,
      }),
    ).toBe(true);
  });

  it('rejects drifted reserved concurrency', () => {
    expect(
      isLambdaExecutorConfigurationCompliant({
        configuration: EXPECTED_CONFIGURATION,
        ...EXPECTED_INPUT,
        actualReservedConcurrency: 2,
      }),
    ).toBe(false);
  });
});
