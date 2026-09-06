import {
  type FunctionConfiguration,
  type Runtime,
} from '@aws-sdk/client-lambda';

import {
  EXECUTOR_LAMBDA_MEMORY_MB,
  EXECUTOR_LAMBDA_TIMEOUT_SECONDS,
  LAMBDA_EPHEMERAL_STORAGE_MB,
} from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/constants/lambda-driver.constant';
import { type LambdaDriverOptions } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/types/lambda-driver.type';

const haveSameStringValues = (
  firstValues: string[] | undefined,
  secondValues: string[],
): boolean => {
  if (firstValues?.length !== secondValues.length) {
    return false;
  }

  const sortedFirstValues = [...firstValues].sort();
  const sortedSecondValues = [...secondValues].sort();

  return sortedFirstValues.every(
    (value, index) => value === sortedSecondValues[index],
  );
};

export const isLambdaExecutorConfigurationCompliant = ({
  configuration,
  actualReservedConcurrency,
  expectedRole,
  expectedReservedConcurrency,
  expectedRuntime,
  expectedVpcConfig,
}: {
  configuration: FunctionConfiguration | undefined;
  actualReservedConcurrency: number | undefined;
  expectedRole: string;
  expectedReservedConcurrency: number;
  expectedRuntime: Runtime;
  expectedVpcConfig: LambdaDriverOptions['vpcConfig'];
}): boolean => {
  if (
    configuration?.State !== 'Active' ||
    configuration.Runtime !== expectedRuntime ||
    configuration.Role !== expectedRole ||
    actualReservedConcurrency !== expectedReservedConcurrency ||
    configuration.Timeout !== EXECUTOR_LAMBDA_TIMEOUT_SECONDS ||
    configuration.MemorySize !== EXECUTOR_LAMBDA_MEMORY_MB ||
    configuration.EphemeralStorage?.Size !== LAMBDA_EPHEMERAL_STORAGE_MB
  ) {
    return false;
  }

  if (expectedVpcConfig === undefined) {
    return true;
  }

  return (
    haveSameStringValues(
      configuration.VpcConfig?.SubnetIds,
      expectedVpcConfig.subnetIds,
    ) &&
    haveSameStringValues(
      configuration.VpcConfig?.SecurityGroupIds,
      expectedVpcConfig.securityGroupIds,
    )
  );
};
