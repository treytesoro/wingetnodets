$config = Get-Content -Path ./parserconfig.json;

$config = $config | ConvertFrom-Json

$packageEndpoint = $config.ingestpackageURI;

$pUrl = "";
$pUrl = Read-Host -Prompt 'Enter Nullsoft package URL';
try {
    Invoke-WebRequest $pUrl -OutFile .\tempfiles\temp.exe;
}
catch {
    <#Do this if a terminating exception happens#>
    Write-Host "";
    Write-Host $_ -ForegroundColor Red;
    Write-Host "Please validate the URI and try again." -ForegroundColor Red;
    Write-Host "`tYou entered:" -ForegroundColor Yellow -BackgroundColor Black;
    Write-Host "`t$($pUrl)" -ForegroundColor Yellow -BackgroundColor Black;
    Write-Host "";
    exit;
}

$filePath = (Get-Location | Select-Object -ExpandProperty "Path") +  "\tempfiles\temp.exe";

$props = get-item $filePath | select-object -Property *;

$packagearch = "0";
do {
    Write-Host "===============================================";
    Write-Host "      Select supported architecture type:";
    Write-Host "";
    Write-Host "            X86: Press 1 for x86";
    Write-Host "            X64: Press 2 for x64";
    Write-Host "===============================================";
    $packagearch = Read-Host -Prompt 'Enter architecture';
} until ($packagearch -eq "1" -or $packagearch -eq "2");

$packagearch = if ($packagearch -eq "1") { "x86" } else { "x64" };

$optionalDescription = Read-Host -Prompt 'Enter optional description text';
$optionalDescription = if($optionalDescription.Trim() -eq "") { "No description available"} else { $optionalDescription }

$optionalShortDescription = Read-Host -Prompt 'Enter optional short description text';
$optionalShortDescription = if($optionalShortDescription.Trim() -eq "") { "No description available"} else { $optionalShortDescription }

$optionalLicense = Read-Host -Prompt "Enter license details";
$optionalLicense = if($optionalLicense.Trim() -eq "") { "No license information available"} else { $optionalLicense }

$optionalAuthor = Read-Host -Prompt "Enter author ($($props.VersionInfo.CompanyName))";
if($optionalAuthor.Trim() -eq "") {
    $optionalAuthor = $props.VersionInfo.CompanyName
}
$optionalSilentInstallString = "";
$optionalSilentInstallString = Read-Host -Prompt 'Enter optional silent install arguments';

$data = @{
    PackageIdentifier = $props.VersionInfo.CompanyName+"."+$props.VersionInfo.ProductName;
    PackageVersion = $props.VersionInfo.FileVersion;
    PackageLocale = if($props.VersionInfo.Language.Contains("English")) { "en-US" } else {  };
    PackageName = $props.VersionInfo.ProductName;
    Publisher = $props.VersionInfo.CompanyName;
    Description = $optionalDescription;
    License = $optionalLicense;
    Agreements = @();
    ShortDescription = $optionalShortDescription;
    Copyright = $props.VersionInfo.LegalCopyright;
    PrivacyUrl = "";
    PublisherUrl = "";
    PublisherSupportUrl = "";
    Tags = @();
    Author = $optionalAuthor;
    Installers = @(
        @{
            Architecture=$packagearch;
            InstallerType= "nullsoft";
            InstallerUrl = $pUrl;
            InstallerSha256 = (Get-FileHash $filePath).Hash;
            InstallMode = "silent";
            InstallerSwitches = @{
                Silent = $optionalSilentInstallString;
            }
        }
    );
};

$json =  $data | ConvertTo-JSON -Depth 100;
Write-Host $json;
$json | Out-File -FilePath .\tempfiles\packageManifest.json -Encoding "utf8"

Start-Process -FilePath "notepad" -Wait -WindowStyle Maximized -ArgumentList .\tempfiles\packageManifest.json

$doupload = "0";
do {
    Write-Host "==================================================";
    Write-Host "      Upload package manifest to REST server?     ";
    Write-Host "                                                  ";
    Write-Host "            1: Press 1 to upload file             ";
    Write-Host "            Q: Press Q to quit                    ";
    Write-Host "==================================================";
    $doupload = Read-Host -Prompt 'Upload file?';
} until ($doupload -eq "1" -or $doupload.ToUpper() -eq "Q");

if($doupload -eq "1") {
    Write-Host "Uploading"
    $json = Get-Content .\tempfiles\packageManifest.json
    Invoke-WebRequest -Method Post -Uri $packageEndpoint -ContentType "application/json" -Body $json
}
