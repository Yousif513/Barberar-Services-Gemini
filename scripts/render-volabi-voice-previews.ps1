param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$profilesPath = Join-Path $resolvedRoot 'planning/volabi/persona-and-skills/PERSONA_REGISTRY.json'
$profiles = (Get-Content -LiteralPath $profilesPath -Raw | ConvertFrom-Json).profiles
$outputRoot = Join-Path $resolvedRoot 'web_platform/public/volabi/voices'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$settings = @{
 nora=@('Zira',-1,0); adam=@('David',-2,-3); alexander=@('David',-1,-1); sarah=@('Zira',0,-2);
 victoria=@('Zira',1,1); emma=@('Zira',-1,2); maya=@('Zira',0,3); ethan=@('David',1,0);
 daniel=@('David',-2,-2); sophia=@('Zira',1,2); layla=@('Zira',-2,-1); omar=@('David',-1,-4);
 olivia=@('Zira',0,0); lina=@('Zira',1,3); rayan=@('David',0,1)
}
$receipts = @()
foreach ($profile in $profiles) {
 $agentId = [string]$profile.agent_id
 $setting = $settings[$agentId]
 if (-not $setting) { throw 'No authored preview prosody for agent' }
 $speaker = New-Object -ComObject SAPI.SpVoice
 $voices = $speaker.GetVoices()
 $selected = $null
 for ($index=0; $index -lt $voices.Count; $index++) {
  if ($voices.Item($index).GetDescription().Contains([string]$setting[0])) { $selected=$voices.Item($index); break }
 }
 if (-not $selected) { throw 'Required installed local speech engine missing' }
 $speaker.Voice = $selected
 $speaker.Rate = [int]$setting[1]
 $script = 'This is a proposed voice preview for ' + $profile.display_name + '. ' + $profile.audition_script.en
 $escaped = [System.Security.SecurityElement]::Escape($script)
 $xml = '<pitch absmiddle="' + $setting[2] + '">' + $escaped + '</pitch>'
 $output = Join-Path $outputRoot ($agentId+'-en.wav')
 $stream = New-Object -ComObject SAPI.SpFileStream
 try {
  $stream.Open($output,3,$false)
  $speaker.AudioOutputStream = $stream
  $speaker.Speak($xml,8) | Out-Null
 } finally { $stream.Close() }
 $receipts += [ordered]@{agent_id=$agentId;relative_path=('web_platform/public/volabi/voices/'+$agentId+'-en.wav');engine=$selected.GetDescription();language='en-US';rate=$setting[1];pitch=$setting[2];script=$script;sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLower();classification='offline_prosody_preview_not_distinct_licensed_production_voice';employee_activated=$false}
 [System.Runtime.InteropServices.Marshal]::ReleaseComObject($stream) | Out-Null
 [System.Runtime.InteropServices.Marshal]::ReleaseComObject($speaker) | Out-Null
}
$report = [ordered]@{generated_on='2026-10-22';method='Windows installed SAPI file synthesis, no playback, microphone, API call or external upload';base_engine_count=2;arabic_local_voice='not_installed';production_voice='not_selected_or_licensed';source='https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ms723597(v=vs.85)';previews=$receipts}
$receiptPath = Join-Path $resolvedRoot 'planning/volabi/persona-and-skills/VOICE_PREVIEW_RECEIPTS.json'
[System.IO.File]::WriteAllText($receiptPath, ($report | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
Write-Output ('Wrote '+$receipts.Count+' offline English previews; two base engines; Arabic and final voice identity pending.')
