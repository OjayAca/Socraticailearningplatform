# Make a separate build directory with the registered staging web config.
# Run from the repository root. The resulting workspace has no server credentials.
$ErrorActionPreference = 'Stop'
if (Get-ChildItem Env: | Where-Object {
    $_.Value -and $_.Name -match '^(NEXT_PUBLIC_FIREBASE_|VITE_FIREBASE_|FIREBASE_|GCLOUD_PROJECT$|GOOGLE_CLOUD_PROJECT$|GEMINI_API_KEY$|GOOGLE_APPLICATION_CREDENTIALS$|.*_EMULATOR_HOST$|(?:NEXT_PUBLIC|VITE)_RECAPTCHA_)'
}) {
    throw 'Use a clean build shell without inherited Firebase, cloud, Gemini, reCAPTCHA or emulator settings.'
}
$project = 'mindguide-stg-ojay-0823'
$appId = '1:206700776816:web:bf09cc2a884d446ef753b5'
$firebase = Join-Path (Get-Location) 'node_modules/.bin/firebase.cmd'
$raw = & $firebase apps:sdkconfig WEB $appId --project $project --json --non-interactive
if ($LASTEXITCODE -ne 0) { throw 'Could not obtain the registered staging web configuration.' }
$sdk = ($raw -join [Environment]::NewLine | ConvertFrom-Json).result.sdkConfig
if ($sdk.projectId -ne $project -or $sdk.appId -ne $appId -or !$sdk.apiKey -or !$sdk.authDomain) {
    throw 'Staging web configuration identity mismatch.'
}
$workspace = Join-Path ([IO.Path]::GetTempPath()) ('mindguide-staging-build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workspace | Out-Null
$files = @(rg --files app src server public packages/contracts)
if ($LASTEXITCODE -ne 0 -or !$files.Count) { throw 'Could not inventory application sources.' }
$files += 'package.json','package-lock.json','next.config.mjs','postcss.config.mjs','tsconfig.json','next-env.d.ts','firebase.json','firestore.rules','firestore.indexes.json'
foreach ($file in $files) {
    if ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected linked source: $file" }
    $dest = Join-Path $workspace $file
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest)) | Out-Null
    Copy-Item -LiteralPath $file -Destination $dest
}
$fields = @{apiKey='API_KEY';projectId='PROJECT_ID';authDomain='AUTH_DOMAIN';storageBucket='STORAGE_BUCKET';appId='APP_ID';messagingSenderId='MESSAGING_SENDER_ID';measurementId='MEASUREMENT_ID'}
$lines = @("FIREBASE_PROJECT_ID=$project")
foreach ($field in $fields.GetEnumerator()) {
    if ($sdk.($field.Key)) { $lines += 'NEXT_PUBLIC_FIREBASE_' + $field.Value + '=' + $sdk.($field.Key) }
}
[IO.File]::WriteAllLines((Join-Path $workspace '.env.local'), $lines)
[IO.File]::WriteAllText((Join-Path $workspace '.firebaserc'), (@{projects=@{staging=$project}} | ConvertTo-Json))
Write-Output $workspace
