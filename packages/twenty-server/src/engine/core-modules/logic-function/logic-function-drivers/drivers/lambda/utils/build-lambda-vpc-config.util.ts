import { type LambdaDriverOptions } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/types/lambda-driver.type';

type LambdaVpcConfig = {
  SubnetIds: string[];
  SecurityGroupIds: string[];
};

export const buildLambdaVpcConfig = (
  vpcConfig: LambdaDriverOptions['vpcConfig'],
): LambdaVpcConfig | undefined =>
  vpcConfig
    ? {
        SubnetIds: vpcConfig.subnetIds,
        SecurityGroupIds: vpcConfig.securityGroupIds,
      }
    : undefined;
