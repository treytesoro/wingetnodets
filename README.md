# Wingetnodets Project

## Introduction
This is a NodeJS/MongoDB Proof of Concept implementation of the Winget Restsource reference code.

This project is in early development.  Not all possible winget cli options have been implemented.

### Docker
A docker image is available to try with an example compose file:

[WingetNodeTS Docker](https://hub.docker.com/r/treytesoro/wingetnode)

This docker image will allow you to quickly get up and running with the ability to generate its own certificates.

[![Example](https://img.youtube.com/vi/PwxUlk35r5Q/0.jpg)](https://youtu.be/PwxUlk35r5Q)

Feel free to contact me here or on my discord if you have any questions.

### Intune

If you are wondering if this will ever work with Intune and its method of using winget, then likely no. Intune is currently only supporting msstore hosted applications.  To pull packages from a private winget repository with Intune, you would need create a legacy app to deploy a script which runs the winget command.

### Official Winget Restsource and CLI documentation

Please refer to the following for more information on the official reference implementation:
1. [winget-cli-restsource](https://github.com/microsoft/winget-cli-restsource)
2. [winget-cli](https://github.com/microsoft/winget-cli)
   1. [Example manifest yaml files](https://github.com/microsoft/winget-cli/tree/master/schemas/JSON/manifests)
   2. [Example version 1.4 JSON response format](https://github.com/microsoft/winget-cli/blob/master/src/AppInstallerCLITests/RestInterface_1_4.cpp#L43)<br/>Note: as of this writing, version 1.4 has not been released, but prior versions are available to view in the same folder as the above link.

## REST API project and MongoDB configuration

### WebServer
You will need a signed certificate for your REST webserver. Winget will not allow HTTP rest endpoints. InstallerURLs can be served over regular http.

You will need to create a directory at the root of the project named `noclone`.  Copy the [a config.example.json](./config.example.json) to this directory and rename to `config.json`. Edit the fields for your environment.

--

Searching with the filters `--name`, `--tag`, `--exact` are implemented but may return unexpected results. A Search query using `--query` is currently not implemented.

### MongoDB
The only requirement here is an accessible Mongo instance with a database named "winget".<br/>
For dev/test purposes, I'm using the official mongodb and mongo-express docker images. The sample docker compose file listed they have should work fine for testing.
```
https://hub.docker.com/_/mongo
```

To get started:
1. Create a folder named `noclone` at the project root.
2. Copy `config.example.json` to `noclone/config.json`
3. Generate a private and public key for the webserver and copy to `noclone`
4. Update config.json with your environment's settings.
5. Run `npm install` from project root.
6. Run `npm start` to start the web server.

## Generating and uploading package manifest JSON files.
In `./Powershell`, there are 3 .ps1 files
1. parsemsi.ps1 (requires WindowsInstaller.Installer COM from WixTools)
2. parsemsix.ps1 (work in progress)
3. parsenullsoft.ps1

Edit the `parserconfig.json` file and set `ingestpackageURI`. This is the URI of the /package REST endpoint.

Running a parser will prompt for the URL of the package

For example:
```
https://localhost:7071/api/downloads/setup.msi
```

The script will download the file to a temp file and run some commands to inspect the file.
You'll be prompted for any additional information for the package.

Once inspection is complete, the script will open the resulting manifest file in Notepad.exe. From here you can make any manual adjustments to the file.

Upon optionally saving changes and closing the notepad instance, you will be prompted to upload the manifest to our winget REST server. If you choose to upload, a
batch file located in `./Batch` named `upload.cmd` will execute. 

## Adding the new winget source
This will vary depending on your environment's configuration. "dmtstore" can be any name.<br/>
The argument is the url to the running index.js.  SSL is required!
```
winget source add -n dmtstore -a https://localhost:7071/api -t Microsoft.Rest
```
### Searching a single repository
```
winget search SomeInstaller -s dmtstore
```
[![Example](https://img.youtube.com/vi/HE05j9lHqcM/0.jpg)](https://youtu.be/HE05j9lHqcM)

***`Since we're dev/testing, local DB corruption can occur, especiallly if you change an existing package manifest. Just delete the source's DB folder.`***<br/>
Sources maintain their own independent sqlite DBs in the following path:
```
%USERPROFILE%\AppData\Local\Packages\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\LocalState
```

## Current TODO
- [ ] Finish powershell scripts to help with manifest creation in Windows
- [ ] Create bash scripts for manifest creation in Linux (msitools can parse msi properties)
- [ ] Adjust mongo queries - search still needs work. I need to search additional fields and format the return data
- [ ] Implement all possible filtering to support winget cli filtering options
- [ ] Way, way, way down the road... I plan on implementing the package ingestion/validation endpoints
- [ ] Rejoice


## Troubleshooting
### If getting a certificate error, you may need the following registry value
Allows unpinned sources (otherwise add source via GPO):
```
HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\AppInstaller
EnableBypassCertificatePinningForMicrosoftStore (DWORD): 1
```

