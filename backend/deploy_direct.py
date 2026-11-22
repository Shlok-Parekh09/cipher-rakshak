"""Provision CipherRakshak through the regional AWS APIs."""
import io
import json
import os
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get('AWS_DEFAULT_REGION', 'ap-southeast-2')
sender = os.environ['SES_SENDER']
recipient = os.environ['SES_DEMO_RECIPIENT']
NAME = 'CipherRakshak'
session = boto3.Session(region_name=REGION)
account = session.client('sts').get_caller_identity()['Account']
iam = session.client('iam')
role_name = NAME + 'Lambda'
trust = {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'lambda.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]}
try:
    role = iam.get_role(RoleName=role_name)['Role']
except iam.exceptions.NoSuchEntityException:
    role = iam.create_role(RoleName=role_name, AssumeRolePolicyDocument=json.dumps(trust))['Role']
policy = {'Version': '2012-10-17', 'Statement': [
    {'Effect': 'Allow', 'Action': ['dynamodb:Scan', 'dynamodb:GetItem'], 'Resource': f'arn:aws:dynamodb:{REGION}:{account}:table/CipherRakshak_Directory'},
    {'Effect': 'Allow', 'Action': ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'], 'Resource': [f'arn:aws:dynamodb:{REGION}:{account}:table/CipherRakshak_Requests', f'arn:aws:dynamodb:{REGION}:{account}:table/CipherRakshak_Requests/index/*']},
    {'Effect': 'Allow', 'Action': 'bedrock:InvokeModel', 'Resource': f'arn:aws:bedrock:{REGION}::foundation-model/amazon.nova-lite-v1:0'},
    {'Effect': 'Allow', 'Action': 'ses:SendRawEmail', 'Resource': f'arn:aws:ses:{REGION}:{account}:identity/{sender}'},
    {'Effect': 'Allow', 'Action': ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], 'Resource': f'arn:aws:logs:{REGION}:{account}:log-group:/aws/lambda/{NAME}:*'}]}
iam.put_role_policy(RoleName=role_name, PolicyName=NAME, PolicyDocument=json.dumps(policy))
print('Lambda role configured.', flush=True)
code = io.BytesIO()
with zipfile.ZipFile(code, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in Path(__file__).with_name('src').glob('*.py'):
        archive.write(path, path.name)
lam = session.client('lambda')
env = {'DIRECTORY_TABLE': 'CipherRakshak_Directory', 'REQUESTS_TABLE': 'CipherRakshak_Requests', 'MODEL_ID': 'amazon.nova-lite-v1:0', 'SENDER': sender, 'DEMO_RECIPIENT': recipient, 'ALLOW_LIVE': 'false', 'ORIGIN': 'http://localhost:3000'}
try:
    function = lam.get_function(FunctionName=NAME)['Configuration']
    lam.update_function_code(FunctionName=NAME, ZipFile=code.getvalue())
    lam.get_waiter('function_updated_v2').wait(FunctionName=NAME)
    lam.update_function_configuration(FunctionName=NAME, Environment={'Variables': env}, Timeout=28, MemorySize=512)
except lam.exceptions.ResourceNotFoundException:
    for attempt in range(8):
        try:
            function = lam.create_function(FunctionName=NAME, Runtime='python3.12', Role=role['Arn'], Handler='handler.handler', Code={'ZipFile': code.getvalue()}, Timeout=28, MemorySize=512, Environment={'Variables': env})
            break
        except lam.exceptions.InvalidParameterValueException:
            if attempt == 7:
                raise
            time.sleep(5)
lam.get_waiter('function_active_v2').wait(FunctionName=NAME)
api = session.client('apigatewayv2')
gateway = next((a for a in api.get_apis()['Items'] if a['Name'] == NAME), None)
if not gateway:
    gateway = api.create_api(Name=NAME, ProtocolType='HTTP', CorsConfiguration={'AllowOrigins': ['http://localhost:3000'], 'AllowMethods': ['GET', 'POST', 'PATCH', 'OPTIONS'], 'AllowHeaders': ['authorization', 'content-type']})
aid = gateway['ApiId']
cognito = session.client('cognito-idp')
pool = next(p for p in cognito.list_user_pools(MaxResults=60)['UserPools'] if p['Name'] == NAME)
client = next(c for c in cognito.list_user_pool_clients(UserPoolId=pool['Id'], MaxResults=60)['UserPoolClients'] if c['ClientName'] == NAME+'Web')
auths = api.get_authorizers(ApiId=aid)['Items']
auth = next((a for a in auths if a['Name'] == 'Citizen'), None)
if not auth:
    auth = api.create_authorizer(ApiId=aid, Name='Citizen', AuthorizerType='JWT', IdentitySource=['$request.header.Authorization'], JwtConfiguration={'Audience': [client['ClientId']], 'Issuer': f"https://cognito-idp.{REGION}.amazonaws.com/{pool['Id']}"})
integrations = api.get_integrations(ApiId=aid)['Items']
integration = integrations[0] if integrations else api.create_integration(ApiId=aid, IntegrationType='AWS_PROXY', IntegrationUri=function['FunctionArn'], PayloadFormatVersion='2.0')
existing = {r['RouteKey'] for r in api.get_routes(ApiId=aid)['Items']}
for route in ['GET /api/health', 'GET /api/directory', 'POST /api/analyze', 'POST /api/dispatch', 'GET /api/requests', 'PATCH /api/requests/{request_id}', 'POST /api/escalate']:
    if route not in existing:
        options = {'AuthorizationType': 'NONE'} if route in ['GET /api/health', 'GET /api/directory'] else {'AuthorizationType': 'JWT', 'AuthorizerId': auth['AuthorizerId']}
        api.create_route(ApiId=aid, RouteKey=route, Target='integrations/'+integration['IntegrationId'], **options)
if not any(s['StageName'] == '$default' for s in api.get_stages(ApiId=aid)['Items']):
    api.create_stage(ApiId=aid, StageName='$default', AutoDeploy=True, DefaultRouteSettings={'ThrottlingBurstLimit': 15, 'ThrottlingRateLimit': 5})
try:
    lam.add_permission(FunctionName=NAME, StatementId='ApiGateway', Action='lambda:InvokeFunction', Principal='apigateway.amazonaws.com', SourceArn=f'arn:aws:execute-api:{REGION}:{account}:{aid}/*/*/*')
except lam.exceptions.ResourceConflictException:
    pass
print(json.dumps({'Endpoint': gateway['ApiEndpoint'], 'PoolId': pool['Id'], 'ClientId': client['ClientId'], 'SES': session.client('ses').get_identity_verification_attributes(Identities=[env['SENDER']])['VerificationAttributes']}, indent=2))
