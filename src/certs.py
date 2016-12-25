import json
import datetime
import distutils.spawn

def renew(event, context):
    if not distutils.spawn.find_executable('aws'): raise StandardError('aws cli is not available on the path')

    current_time = datetime.datetime.now().time()
    body = {
        "message": "Hello, the current time is " + str(current_time)
    }

    response = {
        "statusCode": 200,
        "body": json.dumps(body)
    }

    return response