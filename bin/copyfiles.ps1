# Set-Location ../

# As required by WingetWeb.ts createExpressEndpoints method, we need to copy the client files to the dist folder
Write-Host "Copying files...";
Copy-Item ./src/client ./docker/DockerFile/dist/ -Recurse -Force
Copy-Item ./ca ./docker/DockerFile/ca/ -Recurse -Force

