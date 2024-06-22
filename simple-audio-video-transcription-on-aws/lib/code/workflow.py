import os
import json
import uuid
import boto3

from urllib.parse import unquote


STATE_MACHINE_ARN = os.environ.get('STATE_MACHINE_ARN')

sfn = boto3.client('stepfunctions')


def handle_file_record(record: dict):
    '''Handle a single new file event'''

    object_key = unquote(record['s3']['object']['key'])
    bucket_name = record['s3']['bucket']['name']

    media_file_uri = f's3://{bucket_name}/{object_key}'
    tenant = [part for part in object_key.split('/') if 'tenant' in part][0].split('=', 2)[1]

    print(f'Trigger Step Function tenant={tenant} media_file_uri={media_file_uri}')

    payload = {
        'tenant': tenant,
        'media_file_uri': media_file_uri,
        'unique_id': f't-{uuid.uuid4().hex}'
    }

    res = sfn.start_execution(
        stateMachineArn=STATE_MACHINE_ARN,
        input=json.dumps(payload)
    )

    return {
        'execution_arn': res['executionArn'],
        'start_date': res['startDate'].isoformat(),
        'media_file_uri': media_file_uri
    }


def handle_event(event, _context):
    '''Handle new file uploaded to S3'''

    output_objects = []

    for record in event['Records']:

        if record['eventName'] not in ['ObjectCreated:CompleteMultipartUpload', 'ObjectCreated:Put']:
            continue

        event_time = record['eventTime']
        key = record['s3']['object']['key']

        print(f'New file uploaded time={event_time} key={key}')

        res = handle_file_record(record)
        output_objects.append(res)

    return output_objects