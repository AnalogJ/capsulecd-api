
- https://github.com/remicastaing/serverless-examples/tree/master/lib
- https://github.com/ryanfitz/vogels
- https://docs.aws.amazon.com/amazondynamodb/latest/gettingstartedguide/GettingStarted.NodeJs.01.html


/usr/local/Cellar/curl/7.47.1/bin/curl https://us-east-1.docker.joyent.com:2376/info --cert cert.pem --key key.pem --cacert ca.pem
https://apidocs.joyent.com/docker/commands/run
https://github.com/apocas/dockerode/issues/106
https://docs.docker.com/engine/reference/api/docker_remote_api_v1.22/#create-a-container


#!/bin/bash
# Delete all containers
docker rm $(docker ps -a -q)
# Delete all images
docker rmi $(docker images -q)


Custom Heaeders

	{
	  "apiRequestTemplate": {
		"application/json": {
		  "serviceType": "$input.params('serviceType')",
		  "orgId": "$input.params('orgId')",
		  "repoId": "$input.params('repoId')",
		  "page": "$input.params('page')",
		  "auth": "$input.params().header.get('X-CapsuleCD-Auth')"
		}
	  }
	}