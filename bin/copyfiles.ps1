### This script MUST be run from the root of the project ###
### NPM script will run this when running "compile-win" from project root ###

# As required by WingetWeb.ts createExpressEndpoints method, we need to copy the client files to the dist folder
Write-Host "Copying files...";
Copy-Item ./src/client ./docker/DockerFile/dist/ -Recurse -Force
Copy-Item ./ca ./docker/DockerFile/ca/ -Recurse -Force
Copy-Item ./src/locales.json ./docker/DockerFile/dist/locales.json -Force

# TODO create and copy a powershell msi inspector script for the web ui package inspector

if (!(Test-Path .\docker\Dockerfile\noclone)) {
    mkdir .\docker\Dockerfile\noclone
}

if (!(Test-Path .\docker\Dockerfile\config.json)) {
    Copy-Item .\config.example.json .\docker\Dockerfile\noclone\config.json
}