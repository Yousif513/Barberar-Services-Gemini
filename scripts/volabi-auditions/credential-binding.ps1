# Pure envelope validation shared by the private reader and offline tests. No file or DPAPI access.
function Get-VolabiBoundCiphertext {
    param([Parameter(Mandatory=$true)]$Envelope, [Parameter(Mandatory=$true)][string]$ExpectedResourceSha256)
    if ($ExpectedResourceSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'CREDENTIAL_RESOURCE_BINDING_REQUIRED' }
    $taskNames = @($Envelope.PSObject.Properties.Name | Sort-Object)
    if (($taskNames -join ',') -cne 'protectedKey,resourceSha256,schemaVersion' -or $Envelope.schemaVersion -ne 1) { throw 'CREDENTIAL_ENVELOPE_INVALID' }
    # Compare the confirmed resource before decoding/decrypting any protected material.
    if ($Envelope.resourceSha256 -cne $ExpectedResourceSha256) { throw 'CREDENTIAL_RESOURCE_MISMATCH' }
    if ($Envelope.protectedKey -isnot [string] -or $Envelope.protectedKey.Length -gt 8192) { throw 'CREDENTIAL_ENVELOPE_INVALID' }
    try { $taskProtectedBytes = [Convert]::FromBase64String($Envelope.protectedKey) } catch { throw 'CREDENTIAL_ENVELOPE_INVALID' }
    return ,$taskProtectedBytes
}
