# TOEIC Trainer（自分専用 TOEIC 単語学習Webアプリ）

Android スマートフォンの Chrome でテンポよく4択単語学習・発音確認を行うための個人用Webアプリです。

## 1. 安全上のルール（必読）

* **GitHub Pages で公開するのは「アプリのプログラム本体」と「自作サンプル30語」だけです。**
* 市販書籍（『金のフレーズ』など）から作成した CSV やページ画像、個人用の学習記録バックアップは、**絶対にこのリポジトリの中に入れず、リポジトリ外の `C:\Users\hirat\toeic-private\` に保管してください。**
* GitHub に `git push` する前には、必ず以下の**公開前チェックスクリプト**を実行してください。

```powershell
powershell -ExecutionPolicy Bypass -File tools/check_publish.ps1
```

---

## 2. PCでの動作確認方法

以下のコマンドを実行し、ブラウザで `http://localhost:8000` を開きます（または `docs/index.html` を直接ブラウザで開きます）。

```powershell
python -m http.server 8000 --directory "c:\Users\hirat\AI-Brain\toeic-trainer\docs"
```

---

## 3. スマートフォンで使えるようにする手順（GitHub Pages 公開）

### 手順①：GitHub で空のリポジトリを作成する
1. ブラウザで [GitHub](https://github.com/) にログインし、右上の「**+**」→「**New repository**」を開きます。
2. 以下のように入力します。
   * **Repository name**: `toeic-trainer`
   * **Public / Private**: **Public**（GitHub Free プランで GitHub Pages を使うために必要です。書籍データは一切含めないため安全です）
   * **Add a README file / Add .gitignore / Choose a license**: **すべてチェックを入れない（空のまま）**
3. 「**Create repository**」をクリックします。

### 手順②：公開前チェックを実行する
PowerShell で `toeic-trainer` フォルダに移動し、チェックスクリプトを実行します。

```powershell
cd c:\Users\hirat\AI-Brain\toeic-trainer
powershell -ExecutionPolicy Bypass -File tools/check_publish.ps1
```
最後に `結果: 【合格】書籍データ・個人データの混入はありません。` と表示されることを確認します。

### 手順③：GitHub へアップロード（push）する
※ `<あなたのGitHubユーザー名>` の部分をご自身のユーザー名に置き換えて実行してください。

```powershell
cd c:\Users\hirat\AI-Brain\toeic-trainer
git remote add origin https://github.com/<あなたのGitHubユーザー名>/toeic-trainer.git
git branch -M main
git push -u origin main
```
* 初回実行時、Windows の Git Credential Manager によりブラウザ（またはログイン画面）が開きます。画面の案内に従って GitHub で認証してください（パスワードやトークンをコード内に直接書く必要はありません）。

### 手順④：GitHub Pages の配信設定を行う
1. GitHub の `toeic-trainer` リポジトリ画面で、上部の「**Settings**」タブを開きます。
2. 左側メニューの「**Pages**」をクリックします。
3. **Build and deployment** の **Branch** で以下を選択し、「**Save**」を押します。
   * ブランチ: **`main`**
   * フォルダ: **`/docs`**（※必ず `/ (root)` ではなく **`/docs`** を選んでください）
4. 1〜2分ほど待ち、ページを再読み込みすると上部に公開URLが表示されます。
   * 公開URL: `https://<あなたのGitHubユーザー名>.github.io/toeic-trainer/`

### 手順⑤：公開後チェック（安全確認）
1. GitHubのリポジトリ画面で、書籍データ（CSVや写真）が含まれていないことを目で確認します。
2. `https://<あなたのGitHubユーザー名>.github.io/toeic-trainer/` を開き、アプリが動くことを確認します。
3. `https://<あなたのGitHubユーザー名>.github.io/toeic-trainer/DESIGN.md` を開き、**404 Not Found** になること（`docs/` 以外のファイルがWeb配信されていないこと）を確認します。

---

## 4. Android スマホのホーム画面に追加する手順

1. Android スマホの **Chrome** で、`https://<あなたのGitHubユーザー名>.github.io/toeic-trainer/` を開きます。
2. 画面右上のメニュー「**⋮**」をタップします。
3. 「**ホーム画面に追加**」（または「**アプリをインストール**」）をタップします。
4. 確認画面で「追加」（または「インストール」）をタップすると、スマホのホーム画面に **TOEIC単語（青いTアイコン）** が追加され、ワンタップで全画面起動できるようになります。

---

## 5. アプリを更新するときの手順（2回目以降）

コードを修正したあと、スマホ側にも反映させたい場合は以下の3コマンドを実行します。

```powershell
cd c:\Users\hirat\AI-Brain\toeic-trainer
powershell -ExecutionPolicy Bypass -File tools/check_publish.ps1
git push
```
※ 合格を確認してから `git push` してください。数分でスマホ側にも反映されます。
