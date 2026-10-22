param([Parameter(Mandatory=$true)][ValidateSet('Store','InternalRead')][string]$Mode, [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ResourceSha256, [string]$ResourceId='')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskSecretDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Primora\VolabiAuditions'
$taskSecretFile = Join-Path $taskSecretDirectory 'azure-speech-development-key.dpapi'
$taskBstr = [IntPtr]::Zero
$taskSecretBytes = $null
. (Join-Path $PSScriptRoot 'credential-binding.ps1')
try {
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if ($Mode -eq 'Store') {
        if ($ResourceId -notmatch '^/subscriptions/[a-f0-9-]+/resourceGroups/[\w.-]+/providers/Microsoft\.CognitiveServices/accounts/[\w-]+$') { throw 'CONFIRMED_RESOURCE_REQUIRED' }
        $taskHasher = [Security.Cryptography.SHA256]::Create()
        try { $taskComputedHash = ([BitConverter]::ToString($taskHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($ResourceId)))).Replace('-','').ToLowerInvariant() } finally { $taskHasher.Dispose() }
        if ($taskComputedHash -cne $ResourceSha256) { throw 'CONFIRMED_RESOURCE_MISMATCH' }
        $taskPathPayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($taskSecretDirectory) -Compress)))
        & (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'local-path.ps1') -PathsBase64 $taskPathPayload -TargetKind Directory -AllowMissingTail -Quiet
        if ($LASTEXITCODE -ne 0) { throw 'LOCAL_CREDENTIAL_PATH_REJECTED' }
        # CreateNew below refuses an existing file without reading or following it.
        [IO.Directory]::CreateDirectory($taskSecretDirectory) | Out-Null
        if ((Get-Item -LiteralPath $taskSecretDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_POINT_FORBIDDEN' }
        $taskAcl = New-Object Security.AccessControl.DirectorySecurity
        $taskAcl.SetOwner($taskIdentity.User)
        $taskAcl.SetAccessRuleProtection($true, $false)
        $taskRule = New-Object Security.AccessControl.FileSystemAccessRule($taskIdentity.User, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $taskAcl.AddAccessRule($taskRule)
        Set-Acl -LiteralPath $taskSecretDirectory -AclObject $taskAcl
        [Console]::Out.WriteLine(('Confirmed DEVELOPMENT ARM resource: ' + $ResourceId))
        if ((Read-Host 'Type CONFIRM only after checking the key will be copied from exactly this resource') -cne 'CONFIRM') { throw 'RESOURCE_CONFIRMATION_REQUIRED' }
        $taskSecure = Read-Host 'Key from that confirmed DEVELOPMENT resource (masked; never paste into chat)' -AsSecureString
        if ($taskSecure.Length -lt 16) { throw 'KEY_TOO_SHORT' }
        Add-Type -AssemblyName System.Security
        $taskBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
        $taskPlainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskBstr)
        $taskSecretBytes = [Text.Encoding]::UTF8.GetBytes($taskPlainKey)
        $taskEntropy = [Text.Encoding]::UTF8.GetBytes($ResourceSha256)
        $taskProtected = [Security.Cryptography.ProtectedData]::Protect($taskSecretBytes, $taskEntropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $taskEnvelope = [ordered]@{schemaVersion=1;resourceSha256=$ResourceSha256;protectedKey=[Convert]::ToBase64String($taskProtected)}
        $taskBytes = [Text.UTF8Encoding]::new($false).GetBytes(($taskEnvelope | ConvertTo-Json -Compress))
        $taskStream = [IO.File]::Open($taskSecretFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $taskStream.Write($taskBytes, 0, $taskBytes.Length); $taskStream.Flush($true) } finally { $taskStream.Dispose() }
        [Console]::Out.WriteLine('Development credential encrypted with current-user Windows DPAPI and confirmed resource binding; no synthesis request made.')
    } else {
        if (-not [Console]::IsOutputRedirected) { throw 'INTERNAL_CAPTURED_PIPE_ONLY' }
        $taskPathPayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($taskSecretFile) -Compress)))
        & (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'local-path.ps1') -PathsBase64 $taskPathPayload -Quiet
        if ($LASTEXITCODE -ne 0) { throw 'LOCAL_CREDENTIAL_PATH_REJECTED' }
        if ((Get-Item -LiteralPath $taskSecretFile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_POINT_FORBIDDEN' }
        $taskFileAcl = Get-Acl -LiteralPath $taskSecretFile
        if ($taskFileAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskIdentity.User.Value) { throw 'OWNER_MISMATCH' }
        foreach ($taskAccess in $taskFileAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
            if ($taskAccess.AccessControlType -eq 'Allow' -and $taskAccess.IdentityReference.Value -ne $taskIdentity.User.Value) { throw 'CREDENTIAL_ACL_TOO_BROAD' }
        }
        $taskEnvelope = [IO.File]::ReadAllText($taskSecretFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
        $taskProtected = Get-VolabiBoundCiphertext -Envelope $taskEnvelope -ExpectedResourceSha256 $ResourceSha256
        Add-Type -AssemblyName System.Security
        $taskEntropy = [Text.Encoding]::UTF8.GetBytes($ResourceSha256)
        $taskSecretBytes = [Security.Cryptography.ProtectedData]::Unprotect($taskProtected, $taskEntropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $taskPlainKey = [Text.UTF8Encoding]::new($false,$true).GetString($taskSecretBytes)
        if ($taskPlainKey -cnotmatch '^[A-Za-z0-9+/_=-]{16,512}$') { throw 'KEY_FORMAT_INVALID' }
        [Console]::Out.Write($taskPlainKey)
    }
} catch {
    [Console]::Error.WriteLine('SECURE_CREDENTIAL_OPERATION_FAILED')
    exit 1
} finally {
    if ($taskBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskBstr) }
    if ($null -ne $taskSecretBytes) { [Array]::Clear($taskSecretBytes, 0, $taskSecretBytes.Length) }
    $taskSecure = $null; $taskPlainKey = $null; $taskBytes = $null
}
