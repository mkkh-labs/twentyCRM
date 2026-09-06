import { LogicFunctionDriverType } from 'src/engine/core-modules/logic-function/logic-function-drivers/interfaces/logic-function-driver.interface';
import { assertLogicFunctionDriverIsSafe } from 'src/engine/core-modules/logic-function/logic-function-drivers/utils/assert-logic-function-driver-is-safe.util';
import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';

describe('assertLogicFunctionDriverIsSafe', () => {
  it('rejects unsandboxed local execution in production', () => {
    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LOCAL,
        nodeEnvironment: NodeEnvironment.PRODUCTION,
        lambdaEgressMode: 'UNRESTRICTED',
        lambdaReservedConcurrency: 1,
        lambdaSubnetIds: [],
        lambdaSecurityGroupIds: [],
      }),
    ).toThrow('unsandboxed and forbidden in production');
  });

  it('allows local execution only in non-production environments', () => {
    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LOCAL,
        nodeEnvironment: NodeEnvironment.DEVELOPMENT,
        lambdaEgressMode: 'UNRESTRICTED',
        lambdaReservedConcurrency: 1,
        lambdaSubnetIds: [],
        lambdaSecurityGroupIds: [],
      }),
    ).not.toThrow();
  });

  it('rejects production Lambda without a declared VPC-controlled egress boundary', () => {
    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LAMBDA,
        nodeEnvironment: NodeEnvironment.PRODUCTION,
        lambdaEgressMode: 'UNRESTRICTED',
        lambdaReservedConcurrency: 1,
        lambdaSubnetIds: [],
        lambdaSecurityGroupIds: [],
      }),
    ).toThrow('VPC-controlled egress');
  });

  it('rejects incomplete production Lambda VPC configuration', () => {
    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LAMBDA,
        nodeEnvironment: NodeEnvironment.PRODUCTION,
        lambdaEgressMode: 'VPC_CONTROLLED',
        lambdaReservedConcurrency: 1,
        lambdaSubnetIds: ['subnet-1'],
        lambdaSecurityGroupIds: [],
      }),
    ).toThrow('subnet and security-group');
  });

  it('accepts production Lambda only with an explicit VPC boundary', () => {
    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LAMBDA,
        nodeEnvironment: NodeEnvironment.PRODUCTION,
        lambdaEgressMode: 'VPC_CONTROLLED',
        lambdaReservedConcurrency: 1,
        lambdaSubnetIds: ['subnet-1'],
        lambdaSecurityGroupIds: ['sg-1'],
      }),
    ).not.toThrow();
  });

  it('rejects production Lambda without positive reserved concurrency', () => {
    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LAMBDA,
        nodeEnvironment: NodeEnvironment.PRODUCTION,
        lambdaEgressMode: 'VPC_CONTROLLED',
        lambdaReservedConcurrency: 0,
        lambdaSubnetIds: ['subnet-1'],
        lambdaSecurityGroupIds: ['sg-1'],
      }),
    ).toThrow('reserved concurrency');
  });

  it('rejects production Lambda identifiers outside AWS VPC bounds', () => {
    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LAMBDA,
        nodeEnvironment: NodeEnvironment.PRODUCTION,
        lambdaEgressMode: 'VPC_CONTROLLED',
        lambdaReservedConcurrency: 1,
        lambdaSubnetIds: ['not-a-subnet'],
        lambdaSecurityGroupIds: ['sg-1'],
      }),
    ).toThrow('invalid subnet or security-group');

    expect(() =>
      assertLogicFunctionDriverIsSafe({
        driverType: LogicFunctionDriverType.LAMBDA,
        nodeEnvironment: NodeEnvironment.PRODUCTION,
        lambdaEgressMode: 'VPC_CONTROLLED',
        lambdaReservedConcurrency: 1,
        lambdaSubnetIds: Array.from(
          { length: 17 },
          (_, index) => `subnet-${index}`,
        ),
        lambdaSecurityGroupIds: ['sg-1'],
      }),
    ).toThrow('AWS VPC limits');
  });
});
