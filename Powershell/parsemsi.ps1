$packageEndpoint = "http://LT8V8T9Y2:7070/api/package"



$windowsInstaller = New-Object -ComObject WindowsInstaller.Installer;
Add-Type -AssemblyName System.Globalization;

class MSIDetails {
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
    [string]$Author;
    [string]$License;
    [Installer[]]$Installers;

    MSIDetails() {
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

function Fetch() {
    [OutputType([MSIDetails])]
    Param(
        [Parameter(Mandatory=$true, Position=1)]
        [string]$PackageURL
    )

    [void]($MSI = $windowsInstaller.OpenDatabase($filePath, 0));
    [void]($hash = (get-filehash -A SHA256 $filePath).Hash);
    [void]($ShortcutsView = $MSI.OpenView("select * from Property"));
    [void]($ShortcutsView.Execute());

    [void]($Shortcuts = $ShortcutsView.Fetch());

    [void]([MSIDetails]$msidetails = [MSIDetails]::new());
    [void]([Installer]$installer = [Installer]::New());
    $installer.InstallerURL = $PackageURL;
    $installer.InstallerSha256 = $hash;
    $installer.InstallerType = (Get-ChildItem $filePath).Extension.Substring(1);
    $installer.InstallMode = "silent";
    $installer.Architecture = if($packagearch -eq "1") {"x86"} else  {"x64"};
    [void]($installer.InstallerSwitches = [InstallerSwitch]::new());
    [void]($installer.InstallerSwitches.Silent = $optionalSilentInstallString);
    [void]($msidetails.Installers = $msidetails.Installers + $installer);



    While ($null -ne $Shortcuts) {
        [void]($colname  = $Shortcuts.GetType().InvokeMember("StringData", 'Public, NonPublic, Instance, GetProperty, GetField', $null, $Shortcuts, 1));
        [void]($colvalue = $Shortcuts.GetType().InvokeMember("StringData", 'Public, NonPublic, Instance, GetProperty, GetField', $null, $Shortcuts, 2));

        switch ($colname) {
            "Manufacturer" { 
                [void]($msidetails.PackageIdentifier = $colvalue);
                [void]($msidetails.Publisher = $colvalue);
                break;
             }
            "ProductLanguage" { 
                $culture = [CultureInfo]::new([System.Convert]::ToInt32($colvalue));
                [void]($msidetails.PackageLocale = $culture.Name);                
                break;
             }
            "ProductName" { 
                [void]($msidetails.PackageName = $colvalue);
                [void]($msidetails.PackageIdentifier = $msidetails.PackageIdentifier+"."+$colvalue);
                break;
             }
            "ProductVersion" { 
                [void]($msidetails.PackageVersion = $colvalue);
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
    
    return (,$msidetails);
    
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

$msistuff = Fetch -PackageURL $pUrl;

$optionalDescription = Read-Host -Prompt 'Enter optional description text';
$msistuff.Description = if($optionalDescription.Trim() -eq "") { "No description available"} else { $optionalDescription }

$optionalShortDescription = Read-Host -Prompt 'Enter optional short description text';
$msistuff.ShortDescription = if($optionalShortDescription.Trim() -eq "") { "No description available"} else { $optionalShortDescription }

$optionalAuthor = Read-Host -Prompt "Enter author";
if($optionalAuthor.Trim() -eq "") {
    $optionalAuthor = $msistuff.Manufacturer
}

$optionalLicense = Read-Host -Prompt "Enter license details";
$msistuff.License = if($optionalLicense.Trim() -eq "") { "No license information available"} else { $optionalLicense }

$msistuff.Author = $optionalAuthor;

$json = $msistuff | ConvertTo-JSON -Depth 100;
$json | Out-File -FilePath .\tempfiles\packageManifest.json -Encoding "utf8"

[System.Runtime.InteropServices.Marshal]::ReleaseComObject( $windowsInstaller ) > $null;

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