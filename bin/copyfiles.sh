#!/bin/bash

echo "Copying files..."

cp -r ./src/client ./docker/DockerFile/dist/
cp -r ./ca ./docker/DockerFile/ca

cp  ./bin/msi.sh ./docker/DockerFile/ca/msi.sh