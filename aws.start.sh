#!/bin/bash

# exit on errors
set -euo pipefail

# if [[ `uname -m` == 'arm64' && `uname -s` == 'Darwin' ]]; then
# 	echo "ABORTING! The container images are currently not building on M1 Silicon"
# 	exit 1
# fi

# import .env vars
if [ -f ".env" ]; then
	export $(egrep -v '^#' .env | xargs)
	# check for mandatory vars here
	if [[ -z $AWS_DEFAULT_REGION || -z $AWS_ACCESS_KEY_ID || -z $AWS_SECRET_ACCESS_KEY ]]; then
		echo "ERROR: missing mandatory environment variable, check .env.example, exiting"
		exit 1
	fi
	if [[ -z $ROUTETABLE || -z $AWS_VPC_ID ]]; then
		echo "ERROR: missing previously created environment variable, did previous setup.sh script run OK? exiting"
		exit 1
	fi
	# make sure .env ends in newline
	lastchar=$(tail -c 1 .env)
	if [ "$lastchar" != "" ]; then 
		echo >> .env
	fi
else
	echo "file .env not found. exiting"
	exit 1
fi
# for any relative paths
export SCRIPT_DIR=$(dirname "$(realpath $0)")
echo "SCRIPT_DIR=$SCRIPT_DIR" 2>&1 | tee -a setup.log

echo "Remove existing docker ecs context..."
docker context rm ecs 2>&1 | tee -a setup.log

echo "Creating docker ecs context ..."
docker context create ecs ecs --from-env  2>&1 | tee -a setup.log

export IMAGE_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com"
echo $IMAGE_REPO  2>&1 | tee -a setup.log

echo "Docker login ecr..."
# docker logout
aws ecr get-login-password | docker login --password-stdin --username AWS $IMAGE_REPO

echo "Docker build..." 2>&1 | tee -a setup.log
docker compose -f $SCRIPT_DIR/docker-compose.yml -f $SCRIPT_DIR/docker-compose.aws.yml build

echo "Docker push..."  2>&1 | tee -a setup.log
# prime the docker caches first. scanner has no dependencies
docker compose -f $SCRIPT_DIR/docker-compose.yml -f $SCRIPT_DIR/docker-compose.aws.yml push scanner
docker compose -f $SCRIPT_DIR/docker-compose.yml -f $SCRIPT_DIR/docker-compose.aws.yml push

echo "Docker convert..." 2>&1 | tee -a setup.log
docker --context ecs compose -f $SCRIPT_DIR/docker-compose.yml -f $SCRIPT_DIR/docker-compose.aws.yml convert > "cfn.yml.$(date +"%Y.%m.%d-%H:%M").log"

echo "Docker up..." 2>&1 | tee -a setup.log
# do `docker --debug` if you want extra info
docker --context ecs compose -f $SCRIPT_DIR/docker-compose.yml -f $SCRIPT_DIR/docker-compose.aws.yml up

echo "Docker ps..." 2>&1 | tee -a setup.log
docker --context ecs compose -f $SCRIPT_DIR/docker-compose.yml -f $SCRIPT_DIR/docker-compose.aws.yml ps

