# Offline metadata validation only: no key files and no DPAPI Protect/Unprotect.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credential-binding.ps1')
$taskExpected = 'a' * 64
$taskEnvelope = [pscustomobject]@{schemaVersion=1;resourceSha256=$taskExpected;protectedKey='AQID'}
$taskBytes = Get-VolabiBoundCiphertext -Envelope $taskEnvelope -ExpectedResourceSha256 $taskExpected
if ($taskBytes.Length -ne 3 -or $taskBytes[0] -ne 1) { throw 'OFFLINE_MATCH_FAILED' }
$taskEnvelope.resourceSha256 = 'b' * 64
$taskEnvelope.protectedKey = 'deliberately-not-base64'
$taskRejected = $false
try { Get-VolabiBoundCiphertext -Envelope $taskEnvelope -ExpectedResourceSha256 $taskExpected | Out-Null } catch { if ($_.Exception.Message -eq 'CREDENTIAL_RESOURCE_MISMATCH') { $taskRejected = $true } else { throw } }
if (-not $taskRejected) { throw 'OFFLINE_MISMATCH_NOT_REJECTED' }
$taskEnvelope.resourceSha256 = $taskExpected
$taskEnvelope.schemaVersion = 0
$taskRejected = $false
try { Get-VolabiBoundCiphertext -Envelope $taskEnvelope -ExpectedResourceSha256 $taskExpected | Out-Null } catch { if ($_.Exception.Message -eq 'CREDENTIAL_ENVELOPE_INVALID') { $taskRejected = $true } else { throw } }
if (-not $taskRejected) { throw 'OFFLINE_UNBOUND_NOT_REJECTED' }
[Console]::Out.Write('RESOURCE_BINDING_OFFLINE_CASES_PASS')
