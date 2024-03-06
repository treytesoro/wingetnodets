#!/bin/bash

### This script MUST be run from the root of the project ###
### NPM script will run this when running "compile-lin" from project root ###

# As required by WingetWeb.ts createExpressEndpoints method, we need to copy the client files to the dist folder
echo "Copying files..."
cp -r ./src/client ./docker/DockerFile/dist/
cp -r ./ca ./docker/DockerFile/ca
cp ./src/locales.json ./docker/DockerFile/dist/locales.json

cp  ./bin/msi.sh ./docker/DockerFile/ca/msi.sh

if [ ! -d "./docker/Dockerfile/noclone" ]; then
    mkdir "./docker/Dockerfile/noclone"
fi

if [ ! -f "./docker/Dockerfile/noclone/config.json" ]; then
  cp ./config.example.json ./docker/Dockerfile/noclone/config.json
fi
