(function () {
  "use strict";

  // ==========================================
  // 1. データ管理
  // ==========================================
  function getDeckWords() {
    if (Array.isArray(window.SAMPLE_WORDS)) {
      return window.SAMPLE_WORDS;
    }
    return [];
  }

  // ==========================================
  // 2. 出題・シャッフルロジック
  // ==========================================
  // 偏りのないシャッフル（Fisher-Yates法）
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

  // 1問分の4択（正解1＋誤答3）を生成する
  function buildChoices(targetWord, allWords) {
    // 正解と異なるIDかつ異なる意味を持つ候補
    const candidates = allWords.filter(function (w) {
      return w.id !== targetWord.id && w.meaning !== targetWord.meaning;
    });

    // 同じ品詞を優先
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

  // ==========================================
  // 3. 音声再生（Web Speech API）
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
      voices.find(function (v) {
        return v.lang === "en-US";
      }) ||
      voices.find(function (v) {
        return v.lang && v.lang.toLowerCase().startsWith("en");
      }) ||
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
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // 音声停止エラーは無視して学習を継続
    }
  }

  function speakEnglish(text) {
    if (!speechSupported || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      if (!cachedEnglishVoice) {
        loadEnglishVoice();
      }
      if (cachedEnglishVoice) {
        utter.voice = cachedEnglishVoice;
      }
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // 音声再生エラーが起きても学習自体は止めない
    }
  }

  // ==========================================
  // 4. 学習中の状態（セッション管理）
  // ==========================================
  const state = {
    selectedCount: 10,
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
  // 5. DOM要素の参照と画面切り替え
  // ==========================================
  const screens = {
    home: document.getElementById("screen-home"),
    quiz: document.getElementById("screen-quiz"),
    result: document.getElementById("screen-result")
  };

  const els = {
    deckInfo: document.getElementById("deck-info"),
    countBtns: document.querySelectorAll(".count-btn"),
    homeError: document.getElementById("home-error"),
    btnStart: document.getElementById("btn-start"),

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

    resultRate: document.getElementById("result-rate"),
    resultDetail: document.getElementById("result-detail"),
    wrongListTitle: document.getElementById("wrong-list-title"),
    noWrongMsg: document.getElementById("no-wrong-msg"),
    wrongList: document.getElementById("wrong-list"),
    btnRetryWrong: document.getElementById("btn-retry-wrong"),
    btnRetryAll: document.getElementById("btn-retry-all"),
    btnBackHome: document.getElementById("btn-back-home")
  };

  function showScreen(screenName) {
    clearAutoNextTimer();
    stopSpeech();
    Object.keys(screens).forEach(function (key) {
      if (key === screenName) {
        screens[key].classList.add("active");
      } else {
        screens[key].classList.remove("active");
      }
    });
  }

  // 選択肢ボタンの中身を安全なテキストとして設定する
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
  // 6. クイズ進行処理
  // ==========================================
  function startQuiz(targetPool) {
    const allWords = getDeckWords();
    state.allWords = allWords;

    if (allWords.length < 4) {
      els.homeError.textContent = "単語が4語以上必要です。";
      els.homeError.classList.remove("hidden");
      return;
    }
    els.homeError.classList.add("hidden");

    const sourceList = Array.isArray(targetPool) && targetPool.length > 0
      ? targetPool
      : shuffleArray(allWords).slice(0, Math.min(state.selectedCount, allWords.length));

    state.questions = shuffleArray(sourceList);
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

    // 進捗表示
    els.progressText.textContent = (state.currentIndex + 1) + " / " + total;
    const progressPercent = ((state.currentIndex + 1) / total) * 100;
    els.progressBar.style.width = progressPercent + "%";

    // 単語・品詞表示
    els.quizWord.textContent = currentWord.word;
    if (currentWord.pos) {
      els.quizPos.textContent = currentWord.pos;
      els.quizPos.classList.remove("hidden");
    } else {
      els.quizPos.classList.add("hidden");
    }

    // フィードバック非表示
    els.feedbackPanel.classList.add("hidden");

    // 4択ボタン初期化
    els.choiceBtns.forEach(function (btn, idx) {
      const choice = state.currentChoices[idx];
      btn.disabled = false;
      btn.classList.remove("correct", "wrong");
      setChoiceButtonContent(btn, choice ? choice.meaning : "", "");
    });

    // 下部ボタン切り替え
    els.btnDontKnow.classList.remove("hidden");
    els.btnDontKnow.disabled = false;

    // 出題時の自動読み上げ
    speakEnglish(currentWord.word);
  }

  function handleAnswer(selectedIndex) {
    // すでに回答済みなら連打を無視（二重記録防止）
    if (state.answered) return;
    state.answered = true;

    const currentWord = state.questions[state.currentIndex];
    const pickedChoice =
      selectedIndex !== null ? state.currentChoices[selectedIndex] : null;
    const isCorrect =
      pickedChoice !== null && pickedChoice.id === currentWord.id;

    if (isCorrect) {
      state.correctCount += 1;
    } else {
      state.wrongWords.push(currentWord);
    }

    // 選択肢のロックと色・記号の更新
    els.choiceBtns.forEach(function (btn, idx) {
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

    // フィードバックパネル表示
    els.feedbackBadge.textContent = isCorrect ? "⭕ 正解" : "❌ 不正解";
    els.feedbackBadge.className =
      "feedback-badge " + (isCorrect ? "is-correct" : "is-wrong");
    els.feedbackMeaning.textContent = currentWord.meaning;

    if (currentWord.phrase) {
      els.feedbackPhrase.textContent = currentWord.phrase;
      els.feedbackPhraseJa.textContent = currentWord.phrase_ja || "";
      els.feedbackPhraseRow.classList.remove("hidden");
    } else {
      els.feedbackPhraseRow.classList.add("hidden");
    }
    els.feedbackPanel.classList.remove("hidden");

    // 回答後（正解・不正解・わからないすべて）は「次へ」ボタンを押さずに自動で次の問題へ進む
    // 正解時はテンポ重視で約0.9秒、不正解・わからない時は正解とフレーズを確認できるよう約1.8秒待つ
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

      state.wrongWords.forEach(function (item) {
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
          spkBtn.addEventListener("click", function () {
            speakEnglish(item.word);
          });
          li.appendChild(spkBtn);
        }

        els.wrongList.appendChild(li);
      });
    }
  }

  // ==========================================
  // 7. イベント登録と初期化
  // ==========================================
  function init() {
    const words = getDeckWords();
    els.deckInfo.textContent = "基礎サンプル（" + words.length + "語）";

    if (!speechSupported) {
      els.btnSpeakWord.classList.add("hidden");
      els.btnSpeakPhrase.classList.add("hidden");
    }

    // 出題数ボタン
    els.countBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const count = parseInt(btn.getAttribute("data-count"), 10);
        state.selectedCount = count;
        els.countBtns.forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    // スタートボタン
    els.btnStart.addEventListener("click", function () {
      startQuiz(null);
    });

    // 中断ボタン
    els.btnQuit.addEventListener("click", function () {
      showScreen("home");
    });

    // 音声ボタン
    els.btnSpeakWord.addEventListener("click", function () {
      const currentWord = state.questions[state.currentIndex];
      if (currentWord) speakEnglish(currentWord.word);
    });

    els.btnSpeakPhrase.addEventListener("click", function () {
      const currentWord = state.questions[state.currentIndex];
      if (currentWord && currentWord.phrase) {
        speakEnglish(currentWord.phrase);
        // フレーズを聞いている最中に画面が切り替わらないよう自動遷移タイマーを延長する
        if (state.answered) {
          clearAutoNextTimer();
          state.autoNextTimer = setTimeout(function () {
            goNextQuestion();
          }, 2200);
        }
      }
    });

    // 4択ボタン
    els.choiceBtns.forEach(function (btn, idx) {
      btn.addEventListener("click", function () {
        handleAnswer(idx);
      });
    });

    // わからないボタン
    els.btnDontKnow.addEventListener("click", function () {
      handleAnswer(null);
    });

    // 結果画面のボタン
    els.btnRetryWrong.addEventListener("click", function () {
      const retryPool = state.wrongWords.slice();
      startQuiz(retryPool);
    });

    els.btnRetryAll.addEventListener("click", function () {
      startQuiz(null);
    });

    els.btnBackHome.addEventListener("click", function () {
      showScreen("home");
    });
  }

  init();
})();
