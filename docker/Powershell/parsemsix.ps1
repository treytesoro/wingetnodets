
# Copy-Item C:\Users\tgtesoro\source\repos\wingetnode\source.msix C:\Users\tgtesoro\source\repos\wingetnode\source.zip

# Expand-Archive -Path C:\Users\tgtesoro\source\repos\wingetnode\source.zip -DestinationPath C:\Users\tgtesoro\source\repos\wingetnode\sourcefiles

Set-Location -Path C:\Users\tgtesoro\source\repos\wingetnode\sourcefiles
$namespace = @{e="http://schemas.microsoft.com/appx/manifest/foundation/windows10"}
$Path = "C:\Users\tgtesoro\source\repos\wingetnode\sourcefiles\AppxManifest.xml"
$XPathDisplayName = "/e:Package/e:Properties"
$XPathIdentity = "/e:Package/e:Identity"
$xObj_DisplayName = Select-Xml -Path $Path -XPath $XPathDisplayName -Namespace $namespace
$xObj_Identity = Select-Xml -Path $Path -XPath $XPathIdentity -Namespace $namespace

Write-Host $xObj_DisplayName.Node.PublisherDisplayName
Write-Host $xObj_DisplayName.Node.DisplayName
Write-Host $xObj_Identity.Node.Name
Write-Host $xObj_Identity.Node.Version

Set-Location -Path C:\Users\tgtesoro\source\repos\wingetnode\Powershell