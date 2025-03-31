const cdk = require('aws-cdk-lib');
const rds = require('aws-cdk-lib/aws-rds');
const ec2 = require('aws-cdk-lib/aws-ec2');
const secretsmanager = require('aws-cdk-lib/aws-secretsmanager');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const cr = require('aws-cdk-lib/custom-resources');
const cognito = require("aws-cdk-lib/aws-cognito");
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const wafv2 = require('aws-cdk-lib/aws-wafv2');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');



class RdsProjectStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // Create a VPC
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for RDS instance and Lambda function'
    })

    // Create Cognito User Pool
    const userPool = new cognito.UserPool(this, "MyUserPool", {
      userPoolName: "MyAppUserPool",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true }
      },
    });

    // Create User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, "MyUserPoolClient", {
      userPool,
      userPoolClientName: "MyAppClient",
      authFlows: { userPassword: true },
    });

    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3306), 'Allow MySQL access from anywhere');
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic(), 'Allow all traffic from anywhere');
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.allTraffic(), 'Allow all traffic from anywhere');

    // Create a Secrets Manager secret for the database credentials
    const dbCredentialsSecret = new secretsmanager.Secret(this, 'DbCredentialsSecret', {
      secretName: 'EcoturismoCredentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true
      }
    });

    // Create the RDS instance
    const dbInstance = new rds.DatabaseInstance(this, 'EcoturismoInstance', {
      instanceIdentifier: 'ecoturismo2025',  // Custom name for the RDS instance
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_40 }),
      vpc,
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      databaseName: 'Ecoturismo',
      publiclyAccessible: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [dbSecurityGroup] // Attach security group
    });

    const httpLambda = new lambda.Function(this, 'Reservaslambda', {
      functionName: 'httpMethods',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/methods'), // Points to a folder with your function
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId, // ✅ Set dynamically
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_USER: 'admin',
        DB_PASSWORD: dbCredentialsSecret.secretValueFromJson('password').unsafeUnwrap(),
        DB_NAME: 'Ecoturismo',
        DYNAMO_TABLE: "hosting"
      },
      vpc,
      allowPublicSubnet: true, // Allow Lambda to be in a public subnet
      securityGroups: [dbSecurityGroup] // Attach security group
    });

    const dataRegistration = new lambda.Function(this, 'registeringLambda', {
      functionName: 'registeringLambda',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/registering'), // Points to a folder with your function
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_USER: 'admin',
        DB_PASSWORD: dbCredentialsSecret.secretValueFromJson('password').unsafeUnwrap(),
        DB_NAME: 'Ecoturismo'
      },
      vpc,
      allowPublicSubnet: true, // Allow Lambda to be in a public subnet
      securityGroups: [dbSecurityGroup] // Attach security group
    });

    const startPayment = new lambda.Function(this, 'startPayment', {
      functionName: 'PaymentInProgress',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/startPayment'), // Points to a folder with your function
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_USER: 'admin',
        DB_PASSWORD: dbCredentialsSecret.secretValueFromJson('password').unsafeUnwrap(),
        DB_NAME: 'Ecoturismo'
      },
      vpc,
      allowPublicSubnet: true, // Allow Lambda to be in a public subnet
      securityGroups: [dbSecurityGroup] // Attach security group
    });



    const api = new apigateway.RestApi(this, 'API1', {
      restApiName: 'ApiRegistering',
      description: 'This service serves a simple ApiGateway.',
      deployOptions: {
        stageName: 'dev',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
    }
    });


    const getApiIntegration1 = new apigateway.LambdaIntegration(httpLambda);
    const getApiIntegration2 = new apigateway.LambdaIntegration(dataRegistration);
    const getApiIntegration3 = new apigateway.LambdaIntegration(startPayment);

    const requestValidator = new apigateway.RequestValidator(this, 'HeaderValidator', {
      restApi: api,
      requestValidatorName: 'CloudFrontHeaderValidator',
      validateRequestBody: false,
      validateRequestParameters: true
    });

    const apiResource1 = api.root.addResource('reservations');
    apiResource1.addMethod('POST', getApiIntegration1);
    apiResource1.addMethod('GET', new apigateway.LambdaIntegration(httpLambda),{
      requestParameters: {
        'method.request.querystring.reservation_id': true
      }
    });

    const apiResource2 = api.root.addResource('dataRegistration')
    apiResource2.addMethod('POST', getApiIntegration2); 
    
    const apiResource3 = api.root.addResource('startPayment')
    apiResource3.addMethod('POST', getApiIntegration3)

    const webAcl = new wafv2.CfnWebACL(this, 'MyWebACL', {
      scope: 'REGIONAL',
      defaultAction: { block: {} },
      rules: [{
          name: 'AllowOnlyCloudFront',
          priority: 1,
          action: { allow: {} },
          statement: {
              byteMatchStatement: {
                  fieldToMatch: { singleHeader: { name: 'x-cloudfront-access' } },
                  positionalConstraint: 'EXACTLY',
                  searchString: 'Allow',
                  textTransformations: [{ type: 'NONE', priority: 0 }]
              }
          },
          visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AllowOnlyCloudFrontRule',
          },
      }],
      visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: 'MyWebACL',
      }
    });


  // Associate WAF with API Gateway
  new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssociation', {
      resourceArn: api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
  });

  const distribution = new cloudfront.Distribution(this, 'MyCloudFrontDistribution', {
    defaultBehavior: {
        origin: new origins.HttpOrigin(`${api.restApiId}.execute-api.${this.region}.amazonaws.com`, {
            originPath: '/dev',
            customHeaders: { 'X-CloudFront-Access': 'Allow' },
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    },
  });

    // ✅ **Output CloudFront URL**
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`
    });

    
    // Lambda function to create a table
    const createTablesLambda = new lambda.Function(this, 'CreateTables', {
      functionName: 'lambdaTables',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/create-table-function'),
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_USER: 'admin',
        DB_PASSWORD: dbCredentialsSecret.secretValueFromJson('password').unsafeUnwrap(),
        DB_NAME: 'Ecoturismo'
      },
      vpc,
      allowPublicSubnet: true, // Allow Lambda to be in a public subnet
      securityGroups: [dbSecurityGroup] // Attach security group
    });

    

    // Custom resource to trigger the Lambda function on deployment
    new cr.AwsCustomResource(this, 'RunCreateTablesLambda', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: createTablesLambda.functionName,
          InvocationType: 'RequestResponse'
        },
        physicalResourceId: cr.PhysicalResourceId.of('RunCreateTablesLambda')
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new cdk.aws_iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [createTablesLambda.functionArn]
        })
      ])
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "ApiEndpoint", { value: api.url });

    // Output the database endpoint
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress
    });
  }
}

// Define the app and stack
const app = new cdk.App();
new RdsProjectStack(app, 'RdsProjectStack', {
  env: {
    account: '164797387787',
    region: 'us-east-1'
  }

});
module.exports = { RdsProjectStack }
