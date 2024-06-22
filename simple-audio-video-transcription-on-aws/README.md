# Simple Audio & Video Transcription on AWS

This project provides a complete CDK sample to create a serverless audio / video transcription pipeline on AWS. It makes
use of Step Functions, AWS Lambda and Amazon Transcribe to provide the solution.

## Configuration Options

**Language Code for Amazon Transcribe** can be set in `cdk.json` under the `makeops/transcribe-locale` parameter. See [API Documentation](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html#API_StartTranscriptionJob_RequestSyntax) for more details
