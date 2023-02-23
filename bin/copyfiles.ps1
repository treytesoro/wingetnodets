# Set-Location ../

Write-Host "Copying files";

Copy-Item ./src/client ./docker/DockerFile/dist/ -Recurse -Force

