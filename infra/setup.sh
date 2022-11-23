#!/bin/bash

######################################
#   Prequisite: install aws-cli v2   #
######################################

# exit on errors
set -euo pipefail

echo "+====================================================+"			2>&1 | tee -a setup.log
echo "| Starting $(realpath $0) @ $(date "+%Y-%m-%d %H:%M:%S%z") |"		2>&1 | tee -a setup.log
echo "+====================================================+"			2>&1 | tee -a setup.log

# import .env
if [ -f ".env" ]; then
	export $(egrep -v '^#' .env | xargs)
	# should probably check for mandatory vars here
else
	echo "file .env not found. exiting"
	exit 1
fi
# for any relative paths
export SCRIPT_DIR=$(dirname "$(realpath $0)")
echo "SCRIPT_DIR=$SCRIPT_DIR" 2>&1 | tee -a setup.log


echo "Creating ecr repositories..." 2>&1 | tee -a setup.log

function create_repo {
	if ! aws ecr describe-repositories --repository-names $1 2>&-; then
		echo "creating ecr repo $1..."
		aws ecr create-repository --repository-name $1  2>&1 | tee -a setup.log
	fi
}
function delete_repo {
	if aws ecr describe-repositories --repository-names $1 2>&-; then
		echo "deleting ecr repo $1..."
		aws ecr delete-repository --repository-name $1 --force  2>&1 | tee -a setup.log
	fi
}

create_repo 'shepherd-db-seeder'



echo "Deploying stack using aws.template..." 2>&1 | tee -a setup.log

aws cloudformation deploy \
	--template-file $SCRIPT_DIR/aws.template \
	--stack-name shepherd-db-seeder-aws-stack

echo 

export AWS_ACCOUNT_ID=$(aws cloudformation describe-stacks \
  --stack-name shepherd-db-seeder-aws-stack \
  --query "Stacks[0].Outputs[?OutputKey=='AwsAccountId'].OutputValue" \
  --output text)
sed -i '/^AWS_ACCOUNT_ID/d' .env  # remove old line before adding new
echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID" | tee -a .env

export AWS_VPC_ID=$(aws cloudformation describe-stacks \
  --stack-name shepherd-db-seeder-aws-stack \
  --query "Stacks[0].Outputs[?OutputKey=='ShepherdVPC'].OutputValue" \
  --output text)
sed -i '/^AWS_VPC_ID/d' .env  # remove old line before adding new
echo "AWS_VPC_ID=$AWS_VPC_ID" | tee -a .env

export AWS_SECURITY_GROUP_ID=$(aws cloudformation describe-stacks \
  --stack-name shepherd-db-seeder-aws-stack \
  --query "Stacks[0].Outputs[?OutputKey=='ShepherdSecurityGroup'].OutputValue" \
  --output text)
sed -i '/^AWS_SECURITY_GROUP_ID/d' .env  # remove old line before adding new
echo "AWS_SECURITY_GROUP_ID=$AWS_SECURITY_GROUP_ID" | tee -a .env

export DB_HOST=$(aws cloudformation describe-stacks \
	--stack-name shepherd-db-seeder-aws-stack \
	--query "Stacks[0].Outputs[?OutputKey=='RdsEndpointUrl'].OutputValue" \
	--output text)
sed -i '/^DB_HOST/d' .env  # remove old line before adding new
echo "DB_HOST=$DB_HOST" | tee -a .env


export SUBNET1=$(aws cloudformation describe-stacks \
	--stack-name shepherd-db-seeder-aws-stack \
	--query "Stacks[0].Outputs[?OutputKey=='Subnet1'].OutputValue" \
	--output text)
sed -i '/^SUBNET1/d' .env  # remove old line before adding new
echo "SUBNET1=$SUBNET1" | tee -a .env

export SUBNET2=$(aws cloudformation describe-stacks \
	--stack-name shepherd-db-seeder-aws-stack \
	--query "Stacks[0].Outputs[?OutputKey=='Subnet2'].OutputValue" \
	--output text)
sed -i '/^SUBNET2/d' .env  # remove old line before adding new
echo "SUBNET2=$SUBNET2" | tee -a .env

export SUBNET3=$(aws cloudformation describe-stacks \
	--stack-name shepherd-db-seeder-aws-stack \
	--query "Stacks[0].Outputs[?OutputKey=='Subnet3'].OutputValue" \
	--output text)
sed -i '/^SUBNET3/d' .env  # remove old line before adding new
echo "SUBNET3=$SUBNET3" | tee -a .env

export ROUTETABLE=$(aws cloudformation describe-stacks \
	--stack-name shepherd-db-seeder-aws-stack \
	--query "Stacks[0].Outputs[?OutputKey=='RouteTable'].OutputValue" \
	--output text)
sed -i '/^ROUTETABLE/d' .env  # remove old line before adding new
echo "ROUTETABLE=$ROUTETABLE" | tee -a .env


