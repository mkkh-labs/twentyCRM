import { LogicFunctionDriverType } from 'src/engine/core-modules/logic-function/logic-function-drivers/interfaces/logic-function-driver.interface';
import { type LogicFunctionLambdaEgressMode } from 'src/engine/core-modules/logic-function/logic-function-drivers/types/logic-function-lambda-egress-mode.type';
import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';

const AWS_LAMBDA_MAXIMUM_SUBNETS = 16;
const AWS_LAMBDA_MAXIMUM_SECURITY_GROUPS = 5;
const AWS_SUBNET_ID_PATTERN = /^subnet-[0-9a-z]+$/;
const AWS_SECURITY_GROUP_ID_PATTERN = /^sg-[0-9A-Za-z]+$/;

export const assertLogicFunctionDriverIsSafe = ({
  driverType,
  nodeEnvironment,
  lambdaEgressMode,
  lambdaReservedConcurrency,
  lambdaSubnetIds,
  lambdaSecurityGroupIds,
}: Readonly<{
  driverType: LogicFunctionDriverType;
  nodeEnvironment: NodeEnvironment;
  lambdaEgressMode: LogicFunctionLambdaEgressMode;
  lambdaReservedConcurrency: number;
  lambdaSubnetIds: string[];
  lambdaSecurityGroupIds: string[];
}>): void => {
  if (
    driverType === LogicFunctionDriverType.LOCAL &&
    nodeEnvironment === NodeEnvironment.PRODUCTION
  ) {
    throw new Error(
      'Local logic-function execution is unsandboxed and forbidden in production.',
    );
  }

  if (
    driverType !== LogicFunctionDriverType.LAMBDA ||
    nodeEnvironment !== NodeEnvironment.PRODUCTION
  ) {
    return;
  }

  if (lambdaEgressMode !== 'VPC_CONTROLLED') {
    throw new Error(
      'Production Lambda logic-function execution requires VPC-controlled egress.',
    );
  }

  if (
    !Number.isSafeInteger(lambdaReservedConcurrency) ||
    lambdaReservedConcurrency < 1
  ) {
    throw new Error(
      'Production Lambda logic-function execution requires positive reserved concurrency.',
    );
  }

  if (
    lambdaSubnetIds.length === 0 ||
    lambdaSecurityGroupIds.length === 0 ||
    lambdaSubnetIds.some((subnetId) => subnetId.trim().length === 0) ||
    lambdaSecurityGroupIds.some(
      (securityGroupId) => securityGroupId.trim().length === 0,
    )
  ) {
    throw new Error(
      'Production Lambda logic-function execution requires at least one subnet and security-group.',
    );
  }

  if (
    lambdaSubnetIds.length > AWS_LAMBDA_MAXIMUM_SUBNETS ||
    lambdaSecurityGroupIds.length > AWS_LAMBDA_MAXIMUM_SECURITY_GROUPS
  ) {
    throw new Error(
      'Production Lambda logic-function VPC configuration exceeds AWS VPC limits.',
    );
  }

  if (
    lambdaSubnetIds.some((subnetId) => !AWS_SUBNET_ID_PATTERN.test(subnetId)) ||
    lambdaSecurityGroupIds.some(
      (securityGroupId) => !AWS_SECURITY_GROUP_ID_PATTERN.test(securityGroupId),
    )
  ) {
    throw new Error(
      'Production Lambda logic-function VPC configuration contains an invalid subnet or security-group identifier.',
    );
  }
};
