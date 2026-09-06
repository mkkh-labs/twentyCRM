import { buildLambdaVpcConfig } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/lambda/utils/build-lambda-vpc-config.util';

describe('buildLambdaVpcConfig', () => {
  it('omits AWS VPC configuration when no boundary is configured', () => {
    expect(buildLambdaVpcConfig(undefined)).toBeUndefined();
  });

  it('maps the configured subnet and security-group boundary', () => {
    expect(
      buildLambdaVpcConfig({
        subnetIds: ['subnet-1'],
        securityGroupIds: ['sg-1'],
      }),
    ).toEqual({
      SubnetIds: ['subnet-1'],
      SecurityGroupIds: ['sg-1'],
    });
  });
});
