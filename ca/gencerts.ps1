$rootcert = New-SelfSignedCertificate -CertStoreLocation cert:\CurrentUser\My -DnsName "Wingetnode CA" -KeyUsage CertSign -KeyExportPolicy Exportable
Write-host "Certificate Thumbprint: $($rootcert.Thumbprint)"

$rsaprivate = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($rootcert)
$rsaprivatepem = $rsaprivate.ExportRSAPrivateKeyPem()

$base64certificate = @"
-----BEGIN CERTIFICATE-----
$([Convert]::ToBase64String($rootcert.Export('Cert'), [System.Base64FormattingOptions]::InsertLineBreaks))
-----END CERTIFICATE-----
"@
Set-Content -Path "WingetnodeRootCA.cer" -Value $base64certificate
Set-Content -Path "WingetnodeRootCA.key" -Value $rsaprivatepem
#This needs to be added to Trusted Root on all labcomputers 
# Export-Certificate -Cert $rootcert -FilePath WingetnodeRootCA.cer


#the thumbprint of need to be changed to your root certificate. 
$rootca = $rootcert #Get-ChildItem cert:\CurrentUser\my | Where-Object {$_.Thumbprint -eq "C46F2E3F00E61DFBCB006FFD8F245165AC4B371D"}

#Path can be changed to 'cert:\CurrentUser\My\' if needed
$webcert =New-SelfSignedCertificate -certstorelocation cert:\CurrentUser\My -dnsname localhost, mightyrazer -Signer $rootca -KeyExportPolicy Exportable
$webrsaprivate = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($webcert)
$webrsaprivatepem = $webrsaprivate.ExportRSAPrivateKeyPem()
$webbase64certificate = @"
-----BEGIN CERTIFICATE-----
$([Convert]::ToBase64String($webcert.Export('Cert'), [System.Base64FormattingOptions]::InsertLineBreaks))
-----END CERTIFICATE-----
"@
Set-Content -Path "WebCert.cer" -Value $webbase64certificate
Set-Content -Path "WebCert.key" -Value $webrsaprivatepem
