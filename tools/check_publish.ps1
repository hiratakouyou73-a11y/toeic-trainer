# 公開前チェックスクリプト（push の前に毎回実行）
# 使い方: powershell -ExecutionPolicy Bypass -File tools/check_publish.ps1

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $PSScriptRoot
Set-Location $RepoDir

$failed = $false

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " TOEIC Trainer 公開前セキュリティ・構成チェック" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. 操作対象のリポジトリ確認
$topLevel = (git rev-parse --show-toplevel).Trim()
Write-Host "`n[1/6] リポジトリのルート確認: $topLevel"
if ($topLevel -notmatch "toeic-trainer$") {
    Write-Host "  [NG] リポジトリが toeic-trainer ではありません！（親の AI-Brain を操作しようとしています）" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  [OK] 独立した toeic-trainer リポジトリです。" -ForegroundColor Green
}

# 2. 追跡中の全ファイル一覧
$trackedFiles = @(git ls-files)
Write-Host "`n[2/6] Gitが追跡しているファイル一覧 ($($trackedFiles.Count) 件):"
foreach ($f in $trackedFiles) {
    Write-Host "  - $f"
}

# 3. 危険な拡張子・パスが現在追跡されていないか
Write-Host "`n[3/6] 公開禁止ファイル（CSV・画像・PDF・バックアップ）の混入チェック:"
$forbiddenCurrent = $trackedFiles | Where-Object {
    ($_ -match '(^private/|\.csv$|\.pdf$|\.jpe?g$|\.heic$|^toeic-backup-.*\.json$|\.png$)') -and
    ($_ -notmatch '^docs/icons/.*\.png$')
}
if ($forbiddenCurrent) {
    Write-Host "  [NG] 公開禁止ファイルが追跡対象に含まれています！" -ForegroundColor Red
    $forbiddenCurrent | ForEach-Object { Write-Host "    ! $_" -ForegroundColor Red }
    $failed = $true
} else {
    Write-Host "  [OK] 公開禁止ファイルは含まれていません（docs/icons/*.png のみ許可）。" -ForegroundColor Green
}

# 4. 過去の全コミット履歴にも含まれていないか
Write-Host "`n[4/6] 過去の全コミット履歴の検査:"
$historyFiles = @(git log --all --name-only --format="" | Sort-Object -Unique | Where-Object { $_ -ne "" })
$forbiddenHistory = $historyFiles | Where-Object {
    ($_ -match '(^private/|\.csv$|\.pdf$|\.jpe?g$|\.heic$|^toeic-backup-.*\.json$|\.png$)') -and
    ($_ -notmatch '^docs/icons/.*\.png$')
}
if ($forbiddenHistory) {
    Write-Host "  [NG] 過去のコミット履歴に公開禁止ファイルが残っています！" -ForegroundColor Red
    $forbiddenHistory | ForEach-Object { Write-Host "    ! $_" -ForegroundColor Red }
    $failed = $true
} else {
    Write-Host "  [OK] 過去のコミット履歴にも公開禁止ファイルはありません。" -ForegroundColor Green
}

# 5. .gitignore の動作確認
Write-Host "`n[5/6] .gitignore の除外設定確認 (private/test.csv, test.csv):"
$ignoreCheck1 = git check-ignore -v "private/test.csv" 2>$null
$ignoreCheck2 = git check-ignore -v "test.csv" 2>$null
if ($ignoreCheck1 -and $ignoreCheck2) {
    Write-Host "  [OK] .gitignore により CSV・private/ は正しく除外設定されています。" -ForegroundColor Green
} else {
    Write-Host "  [NG] .gitignore の除外設定が機能していません！" -ForegroundColor Red
    $failed = $true
}

# 6. 未コミットの変更確認
Write-Host "`n[6/6] 作業ツリーの状態 (git status):"
$statusLines = @(git status --short)
if ($statusLines.Count -eq 0) {
    Write-Host "  [OK] 未コミットの変更はありません（クリーンな状態）。" -ForegroundColor Green
} else {
    Write-Host "  [注意] 未コミットの変更または未追跡ファイルがあります:" -ForegroundColor Yellow
    $statusLines | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
if ($failed) {
    Write-Host " 結果: 【不合格】修正するまで git push しないでください！" -ForegroundColor Red
    exit 1
} else {
    Write-Host " 結果: 【合格】書籍データ・個人データの混入はありません。" -ForegroundColor Green
    exit 0
}
