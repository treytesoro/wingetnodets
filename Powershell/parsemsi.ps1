$config = Get-Content -Path ./parserconfig.json;

$config = $config | ConvertFrom-Json

$packageEndpoint = $config.ingestpackageURI;

$windowsInstaller = New-Object -ComObject WindowsInstaller.Installer;
Add-Type -AssemblyName System.Globalization;

<#
TODO: Probably should just use a dictionary.
This will be refactored.  It will make the Fetch function easier
to write/read.
#>
class PackageManifest {
    [string]$PackageIdentifier;
    [string]$PackageVersion;
    [string]$PackageLocale;
    [string]$PackageName;
    [string]$Publisher;
    [string]$Description;
    [string]$ShortDescription;
    [string]$Copyright;
    [string]$PrivacyUrl;
    [string]$PublisherUrl;
    [string]$PublisherSupportUrl;
    [string[]]$Tags;
    [string]$Moniker;
    [string]$Author;
    [string]$License;
    [Installer[]]$Installers;

    PackageManifest() {
        $this.Copyright = "";
        $this.PrivacyUrl = "";
        $this.PublisherUrl = "";
        $this.PublisherSupportUrl = "";
        $this.Tags = @();
    }
}

class Installer {
    [string]$Architecture;
    [string]$InstallerType;
    [string]$InstallerUrl;
    [string]$InstallerSha256;
    [string]$InstallMode;
    [InstallerSwitch]$InstallerSwitches;
}

class InstallerSwitch {
    [string]$Silent;
}

<#
.SYNOPSIS
Inspects an MSI file and extracts metadata to build a PackageManifest object

.DESCRIPTION
Inspects an MSI file and extracts metadata to build a PackageManifest object

.PARAMETER PackageURL
Source URL or package. This is where the MSI file will be downloaded from.

.PARAMETER filePath
The local path to the MSI file. This needs to first be downloaded from the PackageURL.

.NOTES
General notes
#>
function CreatePackageManifest() {
    [OutputType([PackageManifest])]
    Param(
        [Parameter(Mandatory=$true, Position=1)]
        [string]$PackageURL,
        [Parameter(Mandatory=$true, Position=2)]
        [string]$filePath
    )

    [void]($MSI = $windowsInstaller.OpenDatabase($filePath, 0));
    [void]($hash = (get-filehash -A SHA256 $filePath).Hash);
    [void]($ShortcutsView = $MSI.OpenView("select * from Property"));
    [void]($ShortcutsView.Execute());

    [void]($Shortcuts = $ShortcutsView.Fetch());

    [void]([PackageManifest]$PackageManifest = [PackageManifest]::new());
    [void]([Installer]$installer = [Installer]::New());
    $installer.InstallerURL = $PackageURL;
    $installer.InstallerSha256 = $hash;
    $installer.InstallerType = (Get-ChildItem $filePath).Extension.Substring(1);
    $installer.InstallMode = "silent";
    $installer.Architecture = if($packagearch -eq "1") {"x86"} else  {"x64"};
    [void]($installer.InstallerSwitches = [InstallerSwitch]::new());
    [void]($installer.InstallerSwitches.Silent = $optionalSilentInstallString);
    [void]($PackageManifest.Installers = $PackageManifest.Installers + $installer);



    While ($null -ne $Shortcuts) {
        [void]($colname  = $Shortcuts.GetType().InvokeMember("StringData", 'Public, NonPublic, Instance, GetProperty, GetField', $null, $Shortcuts, 1));
        [void]($colvalue = $Shortcuts.GetType().InvokeMember("StringData", 'Public, NonPublic, Instance, GetProperty, GetField', $null, $Shortcuts, 2));

        switch ($colname) {
            "Manufacturer" { 
                [void]($PackageManifest.PackageIdentifier = $colvalue);
                [void]($PackageManifest.Publisher = $colvalue);
                break;
             }
            "ProductLanguage" { 
                $culture = [CultureInfo]::new([System.Convert]::ToInt32($colvalue));
                [void]($PackageManifest.PackageLocale = $culture.Name);                
                break;
             }
            "ProductName" { 
                [void]($PackageManifest.PackageName = $colvalue);
                [void]($PackageManifest.PackageIdentifier = $PackageManifest.PackageIdentifier+"."+$colvalue);
                break;
             }
            "ProductVersion" { 
                [void]($PackageManifest.PackageVersion = $colvalue);
                break;
             }
            Default {}
        }
        [void]($Shortcuts = $ShortcutsView.Fetch());
    }
    [void]($ShortcutsView.Close());
    [void]($MSI.commit());
    
    [void]([System.Runtime.InteropServices.Marshal]::ReleaseComObject( $ShortcutsView ) > $null);
    [void]([System.Runtime.InteropServices.Marshal]::ReleaseComObject( $MSI ) > $null);
    [void]($ShortcutsView = $null);
    [void]($MSI = $null);
    
    return (,$PackageManifest);
    
}

$pUrl = Read-Host -Prompt 'Enter MSI package URL';
try {
    Invoke-WebRequest $pUrl -OutFile .\tempfiles\temp.msi;
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
$filePath = (Get-Location | Select-Object -ExpandProperty "Path") +  "\tempfiles\temp.msi";
Write-Host $filePath;

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

$optionalSilentInstallString = Read-Host -Prompt 'Enter optional silent install arguments';
Write-Host $optionalSilentInstallString;

$pkgmanifest = CreatePackageManifest -PackageURL $pUrl -filePath $filePath;

$optionalDescription = Read-Host -Prompt 'Enter optional description text';
$pkgmanifest.Description = if($optionalDescription.Trim() -eq "") { "No description available"} else { $optionalDescription }

$optionalShortDescription = Read-Host -Prompt 'Enter optional short description text';
$pkgmanifest.ShortDescription = if($optionalShortDescription.Trim() -eq "") { "No description available"} else { $optionalShortDescription }

$optionalAuthor = Read-Host -Prompt "Enter author";
if($optionalAuthor.Trim() -eq "") {
    $optionalAuthor = $pkgmanifest.Manufacturer
}

$optionalLicense = Read-Host -Prompt "Enter license details";
$pkgmanifest.License = if($optionalLicense.Trim() -eq "") { "No license information available"} else { $optionalLicense }

$pkgmanifest.Author = $optionalAuthor;

$json = $pkgmanifest | ConvertTo-JSON -Depth 100;
$json | Out-File -FilePath .\tempfiles\packageManifest.json -Encoding "utf8"

[System.Runtime.InteropServices.Marshal]::ReleaseComObject( $windowsInstaller ) > $null;

# opens in notepad for manual editing
Start-Process -FilePath "notepad" -Wait -WindowStyle Maximized -ArgumentList .\tempfiles\packageManifest.json

$windowsInstaller = $null;

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