<#
.SYNOPSIS
  書籍ページ画像からWindows標準OCRを用いて単語・意味を抽出し、下書きCSVを生成するスクリプト

.DESCRIPTION
  C:\Users\hirat\toeic-private\images 内の画像ファイル（.jpg, .png 等）を読み取り、
  Windows 11 標準の OCR エンジンでテキスト認識を行います。
  抽出結果は C:\Users\hirat\toeic-private\ocr_drafts 配下に下書きCSVとして出力されます。
  
  外部サーバーへの送信は一切行わず、PCローカル内で完全に処理されます。
  checked 列は空欄で出力されるため、Excel等で確認・修正後に checked=1 を入力して
  アプリ側で読み込ませることができます。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/ocr/extract_words.ps1
  powershell -ExecutionPolicy Bypass -File tools/ocr/extract_words.ps1 -Prefix "kin"
#>

[CmdletBinding()]
param(
    [string]$ImageDir = "C:\Users\hirat\toeic-private\images",
    [string]$OutputDir = "C:\Users\hirat\toeic-private\ocr_drafts",
    [string]$Prefix = "kin"
)

$ErrorActionPreference = "Stop"

# WinRT の非同期処理ヘルパー
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
}[0]

function Await-WinRT($asyncOp, $type) {
    $asTask = $asTaskGeneric.MakeGenericMethod($type)
    $task = $asTask.Invoke($null, @($asyncOp))
    $task.Wait()
    return $task.Result
}

# WinRT 型のロード
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null

$lang = [Windows.Globalization.Language]::new("ja")
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if (-not $engine) {
    Write-Error "Windows 日本語 OCR エンジンの初期化に失敗しました。"
    exit 1
}

# ディレクトリの存在確認
if (-not (Test-Path $ImageDir)) {
    Write-Warning "画像フォルダが存在しませんでした。作成します: $ImageDir"
    New-Item -ItemType Directory -Force -Path $ImageDir | Out-Null
}
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$images = Get-ChildItem -Path $ImageDir -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|bmp)$' }
if ($images.Count -eq 0) {
    Write-Host "`n[情報] $ImageDir 内に対象の画像ファイル (.jpg, .png) が見つかりませんでした。" -ForegroundColor Yellow
    Write-Host "手持ちの書籍ページをスマホ等で撮影し、上記フォルダに配置してから再実行してください。"
    Write-Host "`n撮影のコツ:"
    Write-Host " 1. ページを平らにし、真上から影が入らないように明るい場所で撮影"
    Write-Host " 2. ファイル名を 'kin_p001.jpg' のように番号順にしておくと整理が簡単です"
    exit 0
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " TOEIC Trainer 書籍画像ローカルOCR抽出ツール" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "対象画像数: $($images.Count) 件"
Write-Host "保存先: $OutputDir`n"

$csvEscape = {
    param([string]$val)
    if ($null -eq $val) { return '""' }
    $s = $val -replace '"', '""'
    return "`"$s`""
}

$timeStamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outCsvPath = Join-Path $OutputDir "draft_${Prefix}_${timeStamp}.csv"

$csvLines = [System.Collections.Generic.List[string]]::new()
# 見出し行 (BOM付きUTF-8)
$csvLines.Add("id,word,meaning,pos,phrase,phrase_ja,checked,source,raw_text")

$totalExtracted = 0
$itemIndex = 1

foreach ($img in $images) {
    Write-Host "処理中: $($img.Name)..." -NoNewline

    try {
        $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($img.FullName)
        $file = Await-WinRT $fileOp ([Windows.Storage.StorageFile])

        $streamOp = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
        $stream = Await-WinRT $streamOp ([Windows.Storage.Streams.IRandomAccessStream])

        $decoderOp = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
        $decoder = Await-WinRT $decoderOp ([Windows.Graphics.Imaging.BitmapDecoder])

        $bitmapOp = $decoder.GetSoftwareBitmapAsync()
        $bitmap = Await-WinRT $bitmapOp ([Windows.Graphics.Imaging.SoftwareBitmap])

        $ocrOp = $engine.RecognizeAsync($bitmap)
        $ocrResult = Await-WinRT $ocrOp ([Windows.Media.Ocr.OcrResult])

        $lines = $ocrResult.Lines
        Write-Host " 完了 ($($lines.Count) 行認識)" -ForegroundColor Green

        foreach ($lineObj in $lines) {
            $raw = $lineObj.Text.Trim()
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }

            # 1. 行頭の見出し番号を抽出
            $num = $null
            $cleanRaw = $raw
            if ($cleanRaw -match '^\s*(\d{1,4})[\.\s]+(.*)$') {
                $num = $matches[1]
                $cleanRaw = $matches[2].Trim()
            }

            # 2. 品詞表記の検出と除去 (例: [ 動 ], [名], [形], [副], など)
            $pos = ""
            if ($cleanRaw -match '\[\s*(動|名|形|副|他|前|接)\s*\]') {
                $posTag = $matches[1]
                switch ($posTag) {
                    "動" { $pos = "動詞" }
                    "名" { $pos = "名詞" }
                    "形" { $pos = "形容詞" }
                    "副" { $pos = "副詞" }
                    default { $pos = "その他" }
                }
                # 品詞タグを文字列から除去
                $cleanRaw = $cleanRaw -replace '\[\s*(動|名|形|副|他|前|接)\s*\]', ' '
                $cleanRaw = $cleanRaw.Trim()
            }

            # 3. 英語単語部分と日本語訳の分離
            $word = ""
            $meaning = ""

            # パターン: 英語単語 (英字・ハイフン) + 日本語部分 (ひらがな・カタカナ・漢字・波ダッシュ〜)
            if ($cleanRaw -match '^([a-zA-Z\-\s\(\)\/\.,'']+?)\s+([~〜\p{IsHiragana}\p{IsKatakana}\p{IsCJKUnifiedIdeographs}].*)$') {
                $word = $matches[1].Trim()
                $meaning = $matches[2].Trim()
            } elseif ($cleanRaw -match '^([a-zA-Z\-\s]+)$') {
                $word = $cleanRaw
            } else {
                # 英語と日本語が連続している場合
                if ($cleanRaw -match '^([a-zA-Z\-]+)(.*)$') {
                    $word = $matches[1].Trim()
                    $meaning = $matches[2].Trim()
                } else {
                    $meaning = $cleanRaw
                }
            }

            # 4. 日本語・記号内の不要な空白を除去 (例: "確 認 す る" -> "確認する", "~ を" -> "〜を")
            $meaning = $meaning -replace '~', '〜'
            $meaning = [regex]::Replace($meaning, '(?<=[\p{IsHiragana}\p{IsKatakana}\p{IsCJKUnifiedIdeographs}〜])\s+(?=[\p{IsHiragana}\p{IsKatakana}\p{IsCJKUnifiedIdeographs}〜])', '')

            # 単語IDの採番
            $idStr = if ($num) {
                "{0}-{1:D4}" -f $Prefix, [int]$num
            } else {
                "{0}-{1:D4}" -f $Prefix, $itemIndex
            }
            $itemIndex++

            # CSV行の構築 (checked は空欄で出力)
            $rowStr = "{0},{1},{2},{3},{4},{5},{6},{7},{8}" -f `
                (& $csvEscape $idStr), `
                (& $csvEscape $word), `
                (& $csvEscape $meaning), `
                (& $csvEscape $pos), `
                (& $csvEscape ""), `
                (& $csvEscape ""), `
                (& $csvEscape ""), `
                (& $csvEscape $img.Name), `
                (& $csvEscape $raw)

            $csvLines.Add($rowStr)
            $totalExtracted++
        }
    } catch {
        Write-Host " 失敗: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# BOM付きUTF-8で保存 (Excelでそのまま開いても文字化けしない)
[System.IO.File]::WriteAllLines($outCsvPath, $csvLines, (New-Object System.Text.UTF8Encoding $true))

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " 抽出完了！" -ForegroundColor Green
Write-Host " 合計抽出行数: $totalExtracted 行"
Write-Host " 出力ファイル: $outCsvPath"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "`n【次の手順（確認と取り込み）】"
Write-Host " 1. 上記のCSVを Excel で開きます。"
Write-Host " 2. 単語（word）や意味（meaning）の誤認識・ズレを確認・修正します。"
Write-Host " 3. アプリに取り込みたい行の 'checked' 列に '1' を入力します。"
Write-Host " 4. 保存後、このファイルをスマホへコピーし、アプリの「設定」→「教材CSVを読み込む」で取り込みます。"
Write-Host "    ※checked 列が '1' の行だけが安全に登録されます。"
