#!/usr/bin/env pwsh

# AWS認証情報設定
$env:AWS_ACCESS_KEY_ID='HUGAHUGA'
$env:AWS_SECRET_ACCESS_KEY='HOGEHOGE'
$env:AWS_REGION='ap-northeast-1'

# Sandbox 起動
Write-Host "Starting Amplify Sandbox..."
cd c:\works\m1
npm run sandbox -- --outputs-out-dir web/public --outputs-format json
