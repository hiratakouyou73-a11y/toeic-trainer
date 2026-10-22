(function () {
  "use strict";

  // ==========================================
  // 1. 定数とストレージキー
  // ==========================================
  const STORAGE_KEYS = {
    PROGRESS: "toeic.progress",
    PROGRESS_PREV: "toeic.progress.prev",
    META: "toeic.meta",
    DECKS: "toeic.decks",
    SETTINGS: "toeic.settings"
  };

  const SCHEMA_VERSION = 1;

  // ==========================================
  // 2. ストレージ管理 (LocalStorage & データ保全)
  // ==========================================
  function loadJSON(key, defaultValue) {
    try {
      const data = localStorage.getItem(key);
      if (!data) return defaultValue;
      return JSON.parse(data);
    } catch (e) {
      console.warn("Storage read error for key: " + key, e);
      return defaultValue;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage write error for key: " + key, e);
      alert("端末の保存容量不足等のため、記録の保存に失敗しました。");
      return false;
    }
  }

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getProgress() {
    const def = {
      schemaVersion: SCHEMA_VERSION,
      words: {}, // wordId: { correct: 0, wrong: 0, streak: 0, lastAt: "YYYY-MM-DD" }
      days: {}   // "YYYY-MM-DD": { answered: 0, correct: 0 }
    };
    const p = loadJSON(STORAGE_KEYS.PROGRESS, def);
    if (!p.words) p.words = {};
    if (!p.days) p.days = {};
    return p;
  }

  function saveWordRecord(wordId, isCorrect) {
    const p = getProgress();
    const today = getTodayString();

    // 1. 単語ごと
    if (!p.words[wordId]) {
      p.words[wordId] = { correct: 0, wrong: 0, streak: 0, lastAt: today };
    }
    const w = p.words[wordId];
    w.lastAt = today;
    if (isCorrect) {
      w.correct += 1;
      w.streak += 1;
    } else {
      w.wrong += 1;
      w.streak = 0; // 不正解またはわからないでリセット
    }

    // 2. 日ごと
    if (!p.days[today]) {
      p.days[today] = { answered: 0, correct: 0 };
    }
    p.days[today].answered += 1;
    if (isCorrect) {
      p.days[today].correct += 1;
    }

    saveJSON(STORAGE_KEYS.PROGRESS, p);
  }

  // 連続学習日数（ストリーク）の計算
  function calculateStreak(daysObj) {
    if (!daysObj) return 0;
    const todayStr = getTodayString();
    
    // 今日回答があるか、もしくは昨日回答があるかを起点とする
    let d = new Date();
    let currStr = getTodayString();
    let streak = 0;

    // 今日解いていなければ、昨日から連続しているかチェック
    if (!daysObj[currStr] || daysObj[currStr].answered === 0) {
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      currStr = `${y}-${m}-${day}`;
      if (!daysObj[currStr] || daysObj[currStr].answered === 0) {
        return 0; // 今日も昨日も解いていなければ 0日
      }
    }

    // 過去に遡って数える
    while (true) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${day}`;

      if (daysObj[key] && daysObj[key].answered > 0) {
        streak += 1;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  // ==========================================
  // 3. データ保護 (navigator.storage.persist)
  // ==========================================
  let persistStatus = "確認中...";

  async function checkAndRequestPersist() {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
          persistStatus = "保護済み (自動削除の対象外)";
        } else {
          const granted = await navigator.storage.persist();
          persistStatus = granted ? "保護済み (許可されました)" : "未保護 (手動バックアップ推奨)";
        }
      } catch (e) {
        persistStatus = "確認不可 (ブラウザ制約)";
      }
    } else {
      persistStatus = "非対応ブラウザ";
    }

    const meta = loadJSON(STORAGE_KEYS.META, {});
    meta.persistStatus = persistStatus;
    saveJSON(STORAGE_KEYS.META, meta);
  }

  // ==========================================
  // 4. データ管理 & 出題ロジック
  // ==========================================
  function getDeckWords() {
    if (Array.isArray(window.SAMPLE_WORDS)) {
      return window.SAMPLE_WORDS;
    }
    return [];
  }

  function shuffleArray(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // 1問分の4択（正解1＋誤答3）を生成
  function buildChoices(targetWord, allWords) {
    const candidates = allWords.filter(function (w) {
      return w.id !== targetWord.id && w.meaning !== targetWord.meaning;
    });

    const samePos = shuffleArray(
      candidates.filter(function (w) {
        return targetWord.pos && w.pos === targetWord.pos;
      })
    );
    const otherPos = shuffleArray(
      candidates.filter(function (w) {
        return !targetWord.pos || w.pos !== targetWord.pos;
      })
    );

    const orderedPool = samePos.concat(otherPos);
    const distractors = [];
    const usedMeanings = new Set([targetWord.meaning]);

    for (let i = 0; i < orderedPool.length; i++) {
      const item = orderedPool[i];
      if (!usedMeanings.has(item.meaning)) {
        distractors.push(item);
        usedMeanings.add(item.meaning);
        if (distractors.length === 3) break;
      }
    }

    return shuffleArray([targetWord].concat(distractors));
  }

  // 出題モードに応じた単語選定
  // mode: 'smart' (おまかせ), 'random' (ランダム), 'weak' (苦手だけ)
  function selectQuestions(allWords, mode, count) {
    if (allWords.length === 0) return [];
    const p = getProgress();

    if (mode === "random") {
      return shuffleArray(allWords).slice(0, Math.min(count, allWords.length));
    }

    // 単語を習熟度別に分類
    const weakList = [];       // streak === 0 かつ 回答履歴あり
    const unlearnedList = [];  // 回答履歴なし
    const learningList = [];   // streak 1-2
    const masteredList = [];   // streak >= 3

    allWords.forEach(w => {
      const r = p.words[w.id];
      if (!r || (r.correct === 0 && r.wrong === 0)) {
        unlearnedList.push(w);
      } else if (r.streak === 0) {
        weakList.push(w);
      } else if (r.streak >= 3) {
        masteredList.push(w);
      } else {
        learningList.push(w);
      }
    });

    if (mode === "weak") {
      if (weakList.length === 0) {
        return []; // 苦手単語なし
      }
      return shuffleArray(weakList).slice(0, Math.min(count, weakList.length));
    }

    // おまかせモード (smart)
    // 1. 苦手 (最大40%)
    // 2. 未学習 (最大40%)
    // 3. 学習中 (残り枠)
    // 4. 足りなければ 覚えた から補填
    const targetWeakCount = Math.floor(count * 0.4);
    const targetUnlearnedCount = Math.floor(count * 0.4);

    const picked = [];
    const usedIds = new Set();

    function addFromPool(pool, maxNeeded) {
      const shuffled = shuffleArray(pool);
      for (const item of shuffled) {
        if (picked.length >= count) break;
        if (maxNeeded > 0 && !usedIds.has(item.id)) {
          picked.push(item);
          usedIds.add(item.id);
          maxNeeded--;
        }
      }
    }

    // 1. 苦手
    addFromPool(weakList, targetWeakCount);
    // 2. 未学習 (本の番号順を維持しつつ)
    const neededUnlearned = Math.min(targetUnlearnedCount, count - picked.length);
    for (const item of unlearnedList) {
      if (picked.length >= count) break;
      if (!usedIds.has(item.id)) {
        picked.push(item);
        usedIds.add(item.id);
        if (picked.length >= targetWeakCount + neededUnlearned) break;
      }
    }
    // 3. 学習中
    addFromPool(learningList, count - picked.length);
    // 4. それでも足りなければ未学習の残り
    addFromPool(unlearnedList, count - picked.length);
    // 5. それでも足りなければ覚えた
    addFromPool(masteredList, count - picked.length);
    // 6. 最終防衛線: 全単語から補填
    addFromPool(allWords, count - picked.length);

    return shuffleArray(picked);
  }

  // ==========================================
  // 5. 音声再生 (Web Speech API)
  // ==========================================
  const speechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined";

  let cachedEnglishVoice = null;

  function loadEnglishVoice() {
    if (!speechSupported) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;
    cachedEnglishVoice =
      voices.find(v => v.lang === "en-US") ||
      voices.find(v => v.lang && v.lang.toLowerCase().startsWith("en")) ||
      null;
  }

  if (speechSupported) {
    loadEnglishVoice();
    if ("onvoiceschanged" in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadEnglishVoice;
    }
  }

  function stopSpeech() {
    if (!speechSupported) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }

  function speakEnglish(text) {
    if (!speechSupported || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      if (!cachedEnglishVoice) loadEnglishVoice();
      if (cachedEnglishVoice) utter.voice = cachedEnglishVoice;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  // ==========================================
  // 6. アプリ状態管理
  // ==========================================
  const state = {
    selectedCount: 10,
    selectedMode: "smart", // 'smart' | 'random' | 'weak'
    allWords: [],
    questions: [],
    currentIndex: 0,
    currentChoices: [],
    answered: false,
    correctCount: 0,
    wrongWords: [],
    autoNextTimer: null
  };

  function clearAutoNextTimer() {
    if (state.autoNextTimer !== null) {
      clearTimeout(state.autoNextTimer);
      state.autoNextTimer = null;
    }
  }

  // ==========================================
  // 7. DOM要素
  // ==========================================
  const screens = {
    home: document.getElementById("screen-home"),
    quiz: document.getElementById("screen-quiz"),
    result: document.getElementById("screen-result"),
    stats: document.getElementById("screen-stats"),
    settings: document.getElementById("screen-settings")
  };

  const els = {
    // ホーム
    btnOpenStats: document.getElementById("btn-open-stats"),
    btnOpenSettings: document.getElementById("btn-open-settings"),
    homeBackupAlert: document.getElementById("home-backup-alert"),
    btnAlertToSettings: document.getElementById("btn-alert-to-settings"),
    streakBadge: document.getElementById("streak-badge"),
    todayCount: document.getElementById("today-count"),
    todayRate: document.getElementById("today-rate"),
    deckInfo: document.getElementById("deck-info"),
    modeBtns: document.querySelectorAll(".mode-btn"),
    countBtns: document.querySelectorAll(".count-btn"),
    homeError: document.getElementById("home-error"),
    btnStart: document.getElementById("btn-start"),

    // クイズ
    btnQuit: document.getElementById("btn-quit"),
    progressText: document.getElementById("quiz-progress-text"),
    progressBar: document.getElementById("quiz-progress-bar"),
    quizWord: document.getElementById("quiz-word"),
    btnSpeakWord: document.getElementById("btn-speak-word"),
    quizPos: document.getElementById("quiz-pos"),
    feedbackPanel: document.getElementById("feedback-panel"),
    feedbackBadge: document.getElementById("feedback-badge"),
    feedbackMeaning: document.getElementById("feedback-meaning"),
    feedbackPhraseRow: document.getElementById("feedback-phrase-row"),
    feedbackPhrase: document.getElementById("feedback-phrase"),
    feedbackPhraseJa: document.getElementById("feedback-phrase-ja"),
    btnSpeakPhrase: document.getElementById("btn-speak-phrase"),
    choiceBtns: document.querySelectorAll(".choice-btn"),
    btnDontKnow: document.getElementById("btn-dont-know"),

    // 結果
    resultRate: document.getElementById("result-rate"),
    resultDetail: document.getElementById("result-detail"),
    wrongListTitle: document.getElementById("wrong-list-title"),
    noWrongMsg: document.getElementById("no-wrong-msg"),
    wrongList: document.getElementById("wrong-list"),
    btnRetryWrong: document.getElementById("btn-retry-wrong"),
    btnRetryAll: document.getElementById("btn-retry-all"),
    btnBackHome: document.getElementById("btn-back-home"),

    // 記録画面
    btnStatsBack: document.getElementById("btn-stats-back"),
    statsStreak: document.getElementById("stats-streak"),
    statsTotalAnswers: document.getElementById("stats-total-answers"),
    statsOverallRate: document.getElementById("stats-overall-rate"),
    mWeakCount: document.getElementById("m-weak-count"),
    mWeakBar: document.getElementById("m-weak-bar"),
    mLearningCount: document.getElementById("m-learning-count"),
    mLearningBar: document.getElementById("m-learning-bar"),
    mMasteredCount: document.getElementById("m-mastered-count"),
    mMasteredBar: document.getElementById("m-mastered-bar"),
    mUnlearnedCount: document.getElementById("m-unlearned-count"),
    mUnlearnedBar: document.getElementById("m-unlearned-bar"),
    chartContainer: document.getElementById("chart-container"),
    noWeakMsg: document.getElementById("no-weak-msg"),
    statsWeakList: document.getElementById("stats-weak-list"),

    // 設定画面
    btnSettingsBack: document.getElementById("btn-settings-back"),
    settingsLastBackup: document.getElementById("settings-last-backup"),
    btnExportBackup: document.getElementById("btn-export-backup"),
    importBackupInput: document.getElementById("import-backup-input"),
    undoWrap: document.getElementById("undo-wrap"),
    btnUndoRestore: document.getElementById("btn-undo-restore"),
    settingsPersistStatus: document.getElementById("settings-persist-status")
  };

  function showScreen(screenName) {
    clearAutoNextTimer();
    stopSpeech();
    Object.keys(screens).forEach(key => {
      if (key === screenName) {
        screens[key].classList.add("active");
      } else {
        screens[key].classList.remove("active");
      }
    });

    if (screenName === "home") {
      refreshHomeScreen();
    } else if (screenName === "stats") {
      renderStatsScreen();
    } else if (screenName === "settings") {
      renderSettingsScreen();
    }
  }

  function setChoiceButtonContent(btn, text, mark) {
    btn.textContent = "";
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    btn.appendChild(textSpan);

    if (mark) {
      const markSpan = document.createElement("span");
      markSpan.className = "choice-mark";
      markSpan.textContent = mark;
      btn.appendChild(markSpan);
    }
  }

  // ==========================================
  // 8. ホーム画面の更新 & バックアップ警告
  // ==========================================
  function refreshHomeScreen() {
    const p = getProgress();
    const today = getTodayString();
    const todayData = p.days[today] || { answered: 0, correct: 0 };

    els.todayCount.textContent = todayData.answered;
    if (todayData.answered > 0) {
      const rate = Math.round((todayData.correct / todayData.answered) * 100);
      els.todayRate.textContent = rate + "%";
    } else {
      els.todayRate.textContent = "--%";
    }

    const streak = calculateStreak(p.days);
    els.streakBadge.textContent = `🔥 ${streak}日連続`;

    // バックアップ警告チェック
    const meta = loadJSON(STORAGE_KEYS.META, {});
    const lastBackup = meta.lastBackupDate; // "YYYY-MM-DD"
    let totalAnswered = 0;
    Object.values(p.days).forEach(d => totalAnswered += (d.answered || 0));

    let needAlert = false;
    if (totalAnswered > 0) {
      if (!lastBackup) {
        needAlert = true;
      } else {
        const last = new Date(lastBackup);
        const now = new Date();
        const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays >= 7) needAlert = true;
      }
    }

    if (needAlert) {
      els.homeBackupAlert.classList.remove("hidden");
    } else {
      els.homeBackupAlert.classList.add("hidden");
    }
  }

  // ==========================================
  // 9. クイズ進行処理
  // ==========================================
  function startQuiz(customPool) {
    const allWords = getDeckWords();
    state.allWords = allWords;

    if (allWords.length < 4) {
      els.homeError.textContent = "単語が4語以上必要です。";
      els.homeError.classList.remove("hidden");
      return;
    }

    let questions = [];
    if (Array.isArray(customPool) && customPool.length > 0) {
      questions = shuffleArray(customPool);
    } else {
      questions = selectQuestions(allWords, state.selectedMode, state.selectedCount);
    }

    if (questions.length === 0) {
      if (state.selectedMode === "weak") {
        els.homeError.textContent = "現在、苦手な単語はありません！";
      } else {
        els.homeError.textContent = "出題可能な単語がありません。";
      }
      els.homeError.classList.remove("hidden");
      return;
    }

    els.homeError.classList.add("hidden");
    state.questions = questions;
    state.currentIndex = 0;
    state.correctCount = 0;
    state.wrongWords = [];

    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    clearAutoNextTimer();
    state.answered = false;

    const total = state.questions.length;
    const currentWord = state.questions[state.currentIndex];
    state.currentChoices = buildChoices(currentWord, state.allWords);

    els.progressText.textContent = `${state.currentIndex + 1} / ${total}`;
    const progressPercent = ((state.currentIndex + 1) / total) * 100;
    els.progressBar.style.width = progressPercent + "%";

    els.quizWord.textContent = currentWord.word;
    if (currentWord.pos) {
      els.quizPos.textContent = currentWord.pos;
      els.quizPos.classList.remove("hidden");
    } else {
      els.quizPos.classList.add("hidden");
    }

    els.feedbackPanel.classList.add("hidden");

    els.choiceBtns.forEach((btn, idx) => {
      const choice = state.currentChoices[idx];
      btn.disabled = false;
      btn.classList.remove("correct", "wrong");
      setChoiceButtonContent(btn, choice ? choice.meaning : "", "");
    });

    els.btnDontKnow.classList.remove("hidden");
    els.btnDontKnow.disabled = false;

    speakEnglish(currentWord.word);
  }

  function handleAnswer(selectedIndex) {
    if (state.answered) return;
    state.answered = true;

    const currentWord = state.questions[state.currentIndex];
    const pickedChoice = selectedIndex !== null ? state.currentChoices[selectedIndex] : null;
    const isCorrect = pickedChoice !== null && pickedChoice.id === currentWord.id;

    if (isCorrect) {
      state.correctCount += 1;
    } else {
      state.wrongWords.push(currentWord);
    }

    // 1問解くごとに即座にストレージへ永続化（途中で閉じても安心）
    saveWordRecord(currentWord.id, isCorrect);

    // 選択肢の表示切り替え
    els.choiceBtns.forEach((btn, idx) => {
      btn.disabled = true;
      const choice = state.currentChoices[idx];
      if (!choice) return;

      if (choice.id === currentWord.id) {
        btn.classList.add("correct");
        setChoiceButtonContent(btn, choice.meaning, "⭕");
      } else if (idx === selectedIndex) {
        btn.classList.add("wrong");
        setChoiceButtonContent(btn, choice.meaning, "❌");
      }
    });

    els.btnDontKnow.classList.add("hidden");

    // フィードバックパネル
    els.feedbackBadge.textContent = isCorrect ? "⭕ 正解" : "❌ 不正解";
    els.feedbackBadge.className = "feedback-badge " + (isCorrect ? "is-correct" : "is-wrong");
    els.feedbackMeaning.textContent = currentWord.meaning;

    if (currentWord.phrase) {
      els.feedbackPhrase.textContent = currentWord.phrase;
      els.feedbackPhraseJa.textContent = currentWord.phrase_ja || "";
      els.feedbackPhraseRow.classList.remove("hidden");
    } else {
      els.feedbackPhraseRow.classList.add("hidden");
    }
    els.feedbackPanel.classList.remove("hidden");

    // 全自動進行（正解は0.9秒、不正解・わからないは1.8秒で確認後に自動で次へ）
    const delayMs = isCorrect ? 900 : 1800;
    state.autoNextTimer = setTimeout(function () {
      goNextQuestion();
    }, delayMs);
  }

  function goNextQuestion() {
    clearAutoNextTimer();
    if (state.currentIndex + 1 < state.questions.length) {
      state.currentIndex += 1;
      renderQuestion();
    } else {
      renderResult();
    }
  }

  function renderResult() {
    showScreen("result");

    const total = state.questions.length;
    const correct = state.correctCount;
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

    els.resultRate.textContent = rate + "%";
    els.resultDetail.textContent = total + "問中 " + correct + "問正解";

    const wrongCount = state.wrongWords.length;
    els.wrongListTitle.textContent = "間違えた単語（" + wrongCount + "語）";
    els.wrongList.textContent = "";

    if (wrongCount === 0) {
      els.noWrongMsg.classList.remove("hidden");
      els.wrongList.classList.add("hidden");
      els.btnRetryWrong.classList.add("hidden");
    } else {
      els.noWrongMsg.classList.add("hidden");
      els.wrongList.classList.remove("hidden");
      els.btnRetryWrong.classList.remove("hidden");

      state.wrongWords.forEach(item => {
        const li = document.createElement("li");
        li.className = "wrong-item";

        const infoDiv = document.createElement("div");
        infoDiv.className = "wrong-word-info";

        const wordSpan = document.createElement("span");
        wordSpan.className = "wrong-word";
        wordSpan.textContent = item.word;

        const meaningSpan = document.createElement("span");
        meaningSpan.className = "wrong-meaning";
        meaningSpan.textContent = item.meaning;

        infoDiv.appendChild(wordSpan);
        infoDiv.appendChild(meaningSpan);
        li.appendChild(infoDiv);

        if (speechSupported) {
          const spkBtn = document.createElement("button");
          spkBtn.type = "button";
          spkBtn.className = "speak-btn speak-btn-sm";
          spkBtn.textContent = "🔊";
          spkBtn.setAttribute("aria-label", item.word + " の発音を聞く");
          spkBtn.addEventListener("click", () => speakEnglish(item.word));
          li.appendChild(spkBtn);
        }

        els.wrongList.appendChild(li);
      });
    }
  }

  // ==========================================
  // 10. 記録画面の描画
  // ==========================================
  function renderStatsScreen() {
    const p = getProgress();
    const allWords = getDeckWords();
    const totalWordsCount = allWords.length || 1;

    // 総合スコア
    const streak = calculateStreak(p.days);
    els.statsStreak.textContent = `${streak}日`;

    let totalAns = 0;
    let totalCor = 0;
    Object.values(p.days).forEach(d => {
      totalAns += (d.answered || 0);
      totalCor += (d.correct || 0);
    });
    els.statsTotalAnswers.textContent = `${totalAns}問`;
    els.statsOverallRate.textContent = totalAns > 0 ? Math.round((totalCor / totalAns) * 100) + "%" : "--%";

    // 習熟度集計
    let weakC = 0, learnC = 0, mastC = 0, unlearnC = 0;
    const weakItems = [];

    allWords.forEach(w => {
      const r = p.words[w.id];
      if (!r || (r.correct === 0 && r.wrong === 0)) {
        unlearnC++;
      } else if (r.streak === 0) {
        weakC++;
        weakItems.push({ word: w, wrongCount: r.wrong });
      } else if (r.streak >= 3) {
        mastC++;
      } else {
        learnC++;
      }
    });

    els.mWeakCount.textContent = weakC;
    els.mLearningCount.textContent = learnC;
    els.mMasteredCount.textContent = mastC;
    els.mUnlearnedCount.textContent = unlearnC;

    els.mWeakBar.style.width = ((weakC / totalWordsCount) * 100) + "%";
    els.mLearningBar.style.width = ((learnC / totalWordsCount) * 100) + "%";
    els.mMasteredBar.style.width = ((mastC / totalWordsCount) * 100) + "%";
    els.mUnlearnedBar.style.width = ((unlearnC / totalWordsCount) * 100) + "%";

    // 14日間グラフ
    renderChart(p.days);

    // 苦手単語ワースト一覧 (不正解数降順)
    weakItems.sort((a, b) => b.wrongCount - a.wrongCount);
    els.statsWeakList.textContent = "";
    if (weakItems.length === 0) {
      els.noWeakMsg.classList.remove("hidden");
      els.statsWeakList.classList.add("hidden");
    } else {
      els.noWeakMsg.classList.add("hidden");
      els.statsWeakList.classList.remove("hidden");

      weakItems.forEach(item => {
        const li = document.createElement("li");
        li.className = "wrong-item";

        const infoDiv = document.createElement("div");
        infoDiv.className = "wrong-word-info";

        const wordSpan = document.createElement("span");
        wordSpan.className = "wrong-word";
        wordSpan.textContent = `${item.word.word} (誤答 ${item.wrongCount}回)`;

        const meaningSpan = document.createElement("span");
        meaningSpan.className = "wrong-meaning";
        meaningSpan.textContent = item.word.meaning;

        infoDiv.appendChild(wordSpan);
        infoDiv.appendChild(meaningSpan);
        li.appendChild(infoDiv);

        if (speechSupported) {
          const spkBtn = document.createElement("button");
          spkBtn.type = "button";
          spkBtn.className = "speak-btn speak-btn-sm";
          spkBtn.textContent = "🔊";
          spkBtn.addEventListener("click", () => speakEnglish(item.word.word));
          li.appendChild(spkBtn);
        }

        els.statsWeakList.appendChild(li);
      });
    }
  }

  function renderChart(daysObj) {
    els.chartContainer.textContent = "";
    // 直近14日分の日付キーを生成
    const dates = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push({
        key: `${y}-${m}-${day}`,
        shortLabel: `${d.getDate()}日`
      });
    }

    let maxVal = 10;
    dates.forEach(d => {
      const c = daysObj[d.key]?.answered || 0;
      if (c > maxVal) maxVal = c;
    });

    dates.forEach(d => {
      const val = daysObj[d.key]?.answered || 0;
      const heightPercent = Math.max(2, Math.round((val / maxVal) * 85));

      const col = document.createElement("div");
      col.className = "chart-bar-col";

      const valSpan = document.createElement("span");
      valSpan.className = "chart-bar-val";
      valSpan.textContent = val > 0 ? val : "";

      const bar = document.createElement("div");
      bar.className = "chart-bar" + (val === 0 ? " is-zero" : "");
      bar.style.height = heightPercent + "%";

      const labelSpan = document.createElement("span");
      labelSpan.className = "chart-bar-label";
      labelSpan.textContent = d.shortLabel;

      col.appendChild(valSpan);
      col.appendChild(bar);
      col.appendChild(labelSpan);
      els.chartContainer.appendChild(col);
    });
  }

  // ==========================================
  // 11. 設定画面・バックアップ（エクスポート・インポート）
  // ==========================================
  function renderSettingsScreen() {
    const meta = loadJSON(STORAGE_KEYS.META, {});
    els.settingsLastBackup.textContent = meta.lastBackupDate
      ? `${meta.lastBackupDate} (${meta.lastBackupTime || ""})`
      : "未実行";

    els.settingsPersistStatus.textContent = persistStatus;

    // 元に戻すボタンの表示判定
    const prev = localStorage.getItem(STORAGE_KEYS.PROGRESS_PREV);
    if (prev) {
      els.undoWrap.classList.remove("hidden");
    } else {
      els.undoWrap.classList.add("hidden");
    }
  }

  // バックアップ書き出し
  function exportBackup() {
    const p = getProgress();
    const settings = loadJSON(STORAGE_KEYS.SETTINGS, {});
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");

    const backupData = {
      app: "toeic-trainer",
      type: "backup",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: `${y}-${m}-${d}T${hh}:${mm}:00`,
      progress: p,
      settings: settings
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toeic-backup-${y}${m}${d}-${hh}${mm}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // メタ情報更新
    const meta = loadJSON(STORAGE_KEYS.META, {});
    meta.lastBackupDate = `${y}-${m}-${d}`;
    meta.lastBackupTime = `${hh}:${mm}`;
    saveJSON(STORAGE_KEYS.META, meta);

    renderSettingsScreen();
    alert("バックアップファイルをダウンロードしました。\nファイルはスマホの「ダウンロード」フォルダ等に保存されています。");
  }

  // バックアップ復元
  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);

        // 整合性チェック
        if (data.app !== "toeic-trainer" || data.type !== "backup") {
          alert("エラー: TOEIC Trainer のバックアップファイルではありません。");
          return;
        }
        if (!data.progress || typeof data.progress !== "object") {
          alert("エラー: バックアップファイル内の学習記録データが破損しています。");
          return;
        }

        const daysCount = Object.keys(data.progress.days || {}).length;
        const wordsCount = Object.keys(data.progress.words || {}).length;

        const confirmMsg = `以下のバックアップを復元しますか？\n` +
          `・保存日時: ${data.exportedAt || "不明"}\n` +
          `・学習記録日数: ${daysCount}日分\n` +
          `・学習単語数: ${wordsCount}語\n\n` +
          `※現在の記録は退避され、直後であれば元に戻せます。`;

        if (!confirm(confirmMsg)) return;

        // 現在のデータを退避
        const currentData = localStorage.getItem(STORAGE_KEYS.PROGRESS);
        if (currentData) {
          localStorage.setItem(STORAGE_KEYS.PROGRESS_PREV, currentData);
        }

        // 復元保存
        saveJSON(STORAGE_KEYS.PROGRESS, data.progress);
        if (data.settings) {
          saveJSON(STORAGE_KEYS.SETTINGS, data.settings);
        }

        renderSettingsScreen();
        alert("学習記録を正常に復元しました！");
      } catch (err) {
        alert("エラー: JSONファイルの解析に失敗しました。正しいファイルを選択してください。");
      }
    };
    reader.readAsText(file);
  }

  // 復元の取り消し（Undo）
  function undoRestore() {
    const prev = localStorage.getItem(STORAGE_KEYS.PROGRESS_PREV);
    if (!prev) return;

    if (!confirm("復元を取り消し、復元前の学習記録に戻しますか？")) return;

    localStorage.setItem(STORAGE_KEYS.PROGRESS, prev);
    localStorage.removeItem(STORAGE_KEYS.PROGRESS_PREV);
    renderSettingsScreen();
    alert("復元を取り消し、以前の記録に戻しました。");
  }

  // ==========================================
  // 12. イベント登録と初期化
  // ==========================================
  function init() {
    const words = getDeckWords();
    els.deckInfo.textContent = `基礎サンプル（${words.length}語）`;

    if (!speechSupported) {
      els.btnSpeakWord.classList.add("hidden");
      els.btnSpeakPhrase.classList.add("hidden");
    }

    // ナビゲーション
    els.btnOpenStats.addEventListener("click", () => showScreen("stats"));
    els.btnOpenSettings.addEventListener("click", () => showScreen("settings"));
    els.btnAlertToSettings.addEventListener("click", () => showScreen("settings"));
    els.btnStatsBack.addEventListener("click", () => showScreen("home"));
    els.btnSettingsBack.addEventListener("click", () => showScreen("home"));

    // モード選択
    els.modeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedMode = btn.getAttribute("data-mode");
        els.modeBtns.forEach(b => b.classList.toggle("active", b === btn));
      });
    });

    // 出題数ボタン
    els.countBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedCount = parseInt(btn.getAttribute("data-count"), 10);
        els.countBtns.forEach(b => b.classList.toggle("active", b === btn));
      });
    });

    // クイズ制御
    els.btnStart.addEventListener("click", () => startQuiz(null));
    els.btnQuit.addEventListener("click", () => showScreen("home"));

    els.btnSpeakWord.addEventListener("click", () => {
      const currentWord = state.questions[state.currentIndex];
      if (currentWord) speakEnglish(currentWord.word);
    });

    els.btnSpeakPhrase.addEventListener("click", () => {
      const currentWord = state.questions[state.currentIndex];
      if (currentWord && currentWord.phrase) {
        speakEnglish(currentWord.phrase);
        if (state.answered) {
          clearAutoNextTimer();
          state.autoNextTimer = setTimeout(() => goNextQuestion(), 2200);
        }
      }
    });

    els.choiceBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => handleAnswer(idx));
    });

    els.btnDontKnow.addEventListener("click", () => handleAnswer(null));

    // 結果画面
    els.btnRetryWrong.addEventListener("click", () => {
      const retryPool = state.wrongWords.slice();
      startQuiz(retryPool);
    });
    els.btnRetryAll.addEventListener("click", () => startQuiz(null));
    els.btnBackHome.addEventListener("click", () => showScreen("home"));

    // バックアップ操作
    els.btnExportBackup.addEventListener("click", exportBackup);
    els.importBackupInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        importBackup(e.target.files[0]);
        e.target.value = ""; // リセット
      }
    });
    els.btnUndoRestore.addEventListener("click", undoRestore);

    // データ保護の要求
    checkAndRequestPersist();

    // 初回ホーム画面描画
    refreshHomeScreen();
  }

  init();
})();
