#!/bin/bash

#for .env scope in this script
export $(egrep -v '^#' .env | xargs)

aws logs tail --follow /docker-compose/shepherd-db-seeder