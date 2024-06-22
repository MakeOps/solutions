import * as cdk from 'aws-cdk-lib';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { DefinitionBody, JsonPath, Pass, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { join } from 'path';

export class SimpleAudioVideoTranscriptionOnAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Declare the input Amazon S3 bucket
    const uploadBucket = new Bucket(this, 'UploadBucket')

    // Declare the transcript output Amazon S3 bucket
    const transcribeResultBucket = new Bucket(this, 'TranscribeResultBucket')

    // Create a new role to provide permissions to our step function file process
    const transcribeProcessorRole = new Role(this, 'TranscribeProcessorRole', {
      assumedBy: new ServicePrincipal('states.amazonaws.com')
    })

    // Create a DynamoDB table for storing the uploaded file metadata
    const fileUploadsTable = new Table(this, 'FileUploadTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING }
    })

    // Grant appropriate permissions to the role to perform file operations on the buckets
    uploadBucket.grantRead(transcribeProcessorRole)
    transcribeResultBucket.grantWrite(transcribeProcessorRole)

    // Define a step function workflow for processing the uploaded files
    const stepStartTranscription = new CallAwsService(this, 'StepStartTranscription', {
      service: 'transcribe',
      action: 'startTranscriptionJob',
      parameters: {
        TranscriptionJobName: JsonPath.uuid(),
        Media: { MediaFileUri: JsonPath.stringAt('$.media_file_uri') },
        LanguageCode: this.node.tryGetContext('makeops/transcribe-locale'),
        OutputBucketName: transcribeResultBucket.bucketName
      },
      iamResources: ['*']
    })

    // Define the step function flow
    const stepFunctionDefinition =
      new Pass(this, 'StepStart')
        .next(stepStartTranscription)

    // Declare the step function to process the inbound media files
    const uploadProcessorSfn = new StateMachine(this, 'UploadProcessorSfn', {
      definitionBody: DefinitionBody.fromChainable(stepFunctionDefinition),
      comment: 'Workflow to process audio / video files',
      role: transcribeProcessorRole
    })

    // Create a trigger function to react to new uploaded objects
    const uploadHandlerFunc = new DockerImageFunction(this, 'UploadHandlerFunc', {
      code: DockerImageCode.fromImageAsset(join(__dirname, 'code')),
      memorySize: 1024,
      environment: {
        'STATE_MACHINE_ARN': uploadProcessorSfn.stateMachineArn,
        'DDB_TABLE': fileUploadsTable.tableName
      }
    })

    // Grant permission for the upload lambda to execute the step function
    uploadProcessorSfn.grantStartExecution(uploadHandlerFunc)

    // Grant permission for the upload lambda to store file metadata
    fileUploadsTable.grantWriteData(uploadHandlerFunc)

    // Connect the Amazon S3 notification to trigger the lambda function
    uploadBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(uploadHandlerFunc), {
      prefix: 'uploads/tenant%3D'
    })

  }
}
