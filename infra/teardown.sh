#!/bin/bash

# exit on errors
set -euo pipefail

# import .env
if [ -f ".env" ]; then
	export $(egrep -v '^#' .env | xargs)
else
	echo "file .env not found. exiting"
	exit 1
fi



echo "Deleting cloudformation stack...(networks and RDS)" 2>&1 | tee -a setup.log
aws cloudformation delete-stack --stack-name shepherd-db-seeder-aws-stack

echo "Waiting for delete stack to complete..." 2>&1 | tee -a setup.log
aws cloudformation wait stack-delete-complete --stack-name shepherd-db-seeder-aws-stack 2>&1 | tee -a setup.log

echo "Deleting ecr repositories..." 2>&1 | tee -a setup.log
aws ecr delete-repository --repository-name shepherd-db-seeder --force  2>&1 | tee -a setup.log

