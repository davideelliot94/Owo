#!bin/bash

echo $DOCKER_HUB_PASSWORD | base64 --decode | docker login -u $1 --password-stdin