param([Parameter(Mandatory=$true)][string]$PathsBase64, [ValidateSet('File','Directory')][string]$TargetKind='File', [switch]$AllowMissingTail, [switch]$Quiet)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try {
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    $taskPaths = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PathsBase64)) | ConvertFrom-Json
    Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class VolabiLocalDrive {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern uint GetDriveTypeW(string root);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern uint QueryDosDeviceW(string name, StringBuilder target, int capacity);
}
"@
    foreach ($taskPath in $taskPaths) {
        if ($taskPath -notmatch '^[A-Za-z]:\\' -or $taskPath.Substring(2) -match '[:<>"|?*\x00-\x1F]' -or $taskPath -match '(?:^|\\)\.\.?(?:\\|$)' -or $taskPath -match '[. ](?:\\|$)') { throw 'LOCAL_PATH_REQUIRED' }
        $taskRoot = $taskPath.Substring(0,3)
        if ([VolabiLocalDrive]::GetDriveTypeW($taskRoot) -ne 3) { throw 'LOCAL_FIXED_DRIVE_REQUIRED' }
        $taskTarget = [Text.StringBuilder]::new(4096)
        if ([VolabiLocalDrive]::QueryDosDeviceW($taskPath.Substring(0,2), $taskTarget, $taskTarget.Capacity) -eq 0 -or $taskTarget.ToString() -notmatch '^\\Device\\HarddiskVolume[0-9]+$') { throw 'LOCAL_FIXED_DRIVE_REQUIRED' }
        $taskCursor = $taskRoot
        $taskParts = $taskPath.Substring(3).Split('\')
        for ($taskIndex = -1; $taskIndex -lt $taskParts.Length; $taskIndex++) {
            if ($taskIndex -ge 0) { $taskCursor = [IO.Path]::Combine($taskCursor, $taskParts[$taskIndex]) }
            try { $taskAttributes = [IO.File]::GetAttributes($taskCursor) } catch { if ($AllowMissingTail -and $TargetKind -eq 'Directory') { break } else { throw } }
            if (($taskAttributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'LOCAL_REPARSE_PATH_FORBIDDEN' }
            if ($taskIndex -lt ($taskParts.Length - 1) -and ($taskAttributes -band [IO.FileAttributes]::Directory) -eq 0) { throw 'LOCAL_ANCESTOR_NOT_DIRECTORY' }
            if ($taskIndex -eq ($taskParts.Length - 1)) {
                if ($TargetKind -eq 'File' -and ($taskAttributes -band [IO.FileAttributes]::Directory) -ne 0) { throw 'LOCAL_FILE_REQUIRED' }
                if ($TargetKind -eq 'Directory' -and ($taskAttributes -band [IO.FileAttributes]::Directory) -eq 0) { throw 'LOCAL_DIRECTORY_REQUIRED' }
            }
        }
    }
    if (-not $Quiet) { [Console]::Out.Write('LOCAL_FILES_OK') }
} catch {
    [Console]::Error.WriteLine('LOCAL_FILE_PATH_REJECTED')
    exit 1
}
