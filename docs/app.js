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
      alert("端末の保存容量不足等のため、データの保存に失敗しました。");
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

  function getSettings() {
    const def = {
      schemaVersion: SCHEMA_VERSION,
      selectedDeckId: "sample",
      selectedMode: "smart",
      selectedCount: 10,
      timeLimit: 5,        // 5s standard (5 / 3 / 0)
      soundEffect: true,   // Web Audio API
      vibrate: true,       // Haptic feedback
      phraseHint: "masked",// "masked" | "full" | "off"
      theme: "light",      // "light" | "dark"
      autoSpeak: true,
      speechRate: 1.0
    };
    const s = loadJSON(STORAGE_KEYS.SETTINGS, def);
    return Object.assign({}, def, s);
  }

  function saveSettings(partial) {
    const current = getSettings();
    const updated = Object.assign({}, current, partial, { schemaVersion: SCHEMA_VERSION });
    saveJSON(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  }

  function getProgress() {
    const def = {
      schemaVersion: SCHEMA_VERSION,
      words: {}, // wordId: { correct: 0, wrong: 0, streak: 0, lastAt: "YYYY-MM-DD" }
      days: {},  // "YYYY-MM-DD": { answered: 0, correct: 0 }
      combo: { current: 0, max: 0 }
    };
    const p = loadJSON(STORAGE_KEYS.PROGRESS, def);
    if (!p.words) p.words = {};
    if (!p.days) p.days = {};
    if (!p.combo || typeof p.combo !== "object") {
      p.combo = { current: 0, max: 0 };
    }
    return p;
  }

  function saveCombo(current, max) {
    const p = getProgress();
    p.combo = {
      current: Math.min(999, Math.max(0, Number(current) || 0)),
      max: Math.min(999, Math.max(0, Number(max) || 0))
    };
    saveJSON(STORAGE_KEYS.PROGRESS, p);
  }

  function saveWordRecord(wordId, isCorrect) {
    const p = getProgress();
    const today = getTodayString();

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
      w.streak = 0;
    }

    if (!p.days[today]) {
      p.days[today] = { answered: 0, correct: 0 };
    }
    p.days[today].answered += 1;
    if (isCorrect) {
      p.days[today].correct += 1;
    }

    saveJSON(STORAGE_KEYS.PROGRESS, p);
  }

  function calculateStreak(daysObj) {
    if (!daysObj) return 0;
    let d = new Date();
    let currStr = getTodayString();
    let streak = 0;

    if (!daysObj[currStr] || daysObj[currStr].answered === 0) {
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      currStr = `${y}-${m}-${day}`;
      if (!daysObj[currStr] || daysObj[currStr].answered === 0) {
        return 0;
      }
    }

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
  // 4. 教材データ管理 & CSVパーサー (Phase 5)
  // ==========================================
  function getCustomDecks() {
    const def = {
      schemaVersion: SCHEMA_VERSION,
      decks: {} // deckId: { id, name, updatedAt, words: [...] }
    };
    const data = loadJSON(STORAGE_KEYS.DECKS, def);
    if (!data || typeof data.decks !== "object") return def;
    return data;
  }

  function saveCustomDeck(deckObj) {
    const store = getCustomDecks();
    store.decks[deckObj.id] = deckObj;
    return saveJSON(STORAGE_KEYS.DECKS, store);
  }

  function deleteCustomDeck(deckId) {
    const store = getCustomDecks();
    if (store.decks[deckId]) {
      delete store.decks[deckId];
      saveJSON(STORAGE_KEYS.DECKS, store);
    }
  }

  function getAllDeckList() {
    const sampleWords = Array.isArray(window.SAMPLE_WORDS) ? window.SAMPLE_WORDS : [];
    const list = [
      {
        id: "sample",
        name: "基礎サンプル",
        isBuiltIn: true,
        words: sampleWords
      }
    ];
    const customStore = getCustomDecks();
    Object.keys(customStore.decks).forEach(key => {
      const d = customStore.decks[key];
      if (d && Array.isArray(d.words)) {
        list.push({
          id: d.id,
          name: d.name,
          isBuiltIn: false,
          updatedAt: d.updatedAt,
          words: d.words
        });
      }
    });
    return list;
  }

  function getActiveDeck() {
    const list = getAllDeckList();
    const found = list.find(d => d.id === state.selectedDeckId);
    if (found) return found;
    state.selectedDeckId = "sample";
    saveSettings({ selectedDeckId: "sample" });
    return list[0];
  }

  function getDeckWords() {
    const deck = getActiveDeck();
    return deck ? deck.words : [];
  }

  // ArrayBufferからUTF-8優先・Shift_JISフォールバックで文字列にデコード
  function decodeCSVBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    // UTF-8 BOM (EF BB BF) チェック
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder("utf-8").decode(bytes.subarray(3));
    }
    try {
      const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
      return utf8Decoder.decode(bytes);
    } catch (e) {
      // Excelで保存されたShift_JIS（CP932）としてデコード
      const sjisDecoder = new TextDecoder("shift-jis");
      return sjisDecoder.decode(bytes);
    }
  }

  // RFC4180準拠のCSV行分割（ダブルクォート内のカンマ・改行・エスケープ対応）
  function parseCSVRows(text) {
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          currentField += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          currentField += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          currentRow.push(currentField.trim());
          currentField = "";
        } else if (ch === "\r" && next === "\n") {
          currentRow.push(currentField.trim());
          rows.push(currentRow);
          currentRow = [];
          currentField = "";
          i++;
        } else if (ch === "\n" || ch === "\r") {
          currentRow.push(currentField.trim());
          rows.push(currentRow);
          currentRow = [];
          currentField = "";
        } else {
          currentField += ch;
        }
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      rows.push(currentRow);
    }

    return rows;
  }

  // CSVテキストを検証し、単語リストとスキップ内訳を返す
  function parseAndValidateWordsCSV(csvText) {
    const rows = parseCSVRows(csvText);
    if (rows.length < 2) {
      return { ok: false, error: "CSVに見出し行またはデータ行がありません。" };
    }

    const header = rows[0].map(h => h.replace(/^\uFEFF/, "").trim().toLowerCase());
    const idxId = header.indexOf("id");
    const idxWord = header.indexOf("word");
    const idxMeaning = header.indexOf("meaning");
    const idxPos = header.indexOf("pos");
    const idxPhrase = header.indexOf("phrase");
    const idxPhraseJa = header.indexOf("phrase_ja");
    const idxChecked = header.indexOf("checked");

    if (idxId === -1 || idxWord === -1 || idxMeaning === -1) {
      return {
        ok: false,
        error: "必須の見出し列（id, word, meaning）が見つかりません。\n1行目に id,word,meaning,... があるか確認してください。"
      };
    }

    const words = [];
    const seenIds = new Set();
    const errors = [];
    let uncheckedSkipped = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const lineNum = r + 1;

      // 完全な空行は無視
      if (row.length === 1 && row[0] === "") continue;

      // checked列が存在する場合、値が "1" 以外はスキップ（OCR下書き用）
      if (idxChecked !== -1) {
        const checkedVal = (row[idxChecked] || "").trim();
        if (checkedVal !== "1") {
          uncheckedSkipped += 1;
          continue;
        }
      }

      const id = (row[idxId] || "").trim();
      const word = (row[idxWord] || "").trim();
      const meaning = (row[idxMeaning] || "").trim();

      if (!id || !word || !meaning) {
        const missing = [];
        if (!id) missing.push("id");
        if (!word) missing.push("word");
        if (!meaning) missing.push("meaning");
        errors.push(`${lineNum}行目: ${missing.join("・")} が空です`);
        continue;
      }

      if (seenIds.has(id)) {
        errors.push(`${lineNum}行目: id「${id}」が重複しているためスキップしました`);
        continue;
      }

      seenIds.add(id);
      words.push({
        id: id,
        word: word,
        meaning: meaning,
        pos: idxPos !== -1 ? (row[idxPos] || "").trim() : "",
        phrase: idxPhrase !== -1 ? (row[idxPhrase] || "").trim() : "",
        phrase_ja: idxPhraseJa !== -1 ? (row[idxPhraseJa] || "").trim() : ""
      });
    }

    if (words.length < 4) {
      return {
        ok: false,
        error: `有効な単語が ${words.length} 語しかありません（4択を作るため最低4語必要です）。\n` +
          (uncheckedSkipped > 0 ? `※checked列が「1」でない行が ${uncheckedSkipped} 件スキップされました。\n` : "") +
          (errors.slice(0, 5).join("\n"))
      };
    }

    return {
      ok: true,
      words: words,
      errors: errors,
      uncheckedSkipped: uncheckedSkipped
    };
  }

  // ==========================================
  // 5. 出題・シャッフルロジック
  // ==========================================
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

  function selectQuestions(allWords, mode, count) {
    if (allWords.length === 0) return [];
    const p = getProgress();

    if (mode === "random") {
      return shuffleArray(allWords).slice(0, Math.min(count, allWords.length));
    }

    const weakList = [];
    const unlearnedList = [];
    const learningList = [];
    const masteredList = [];

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
      if (weakList.length === 0) return [];
      return shuffleArray(weakList).slice(0, Math.min(count, weakList.length));
    }

    // おまかせモード (smart): 古く間違えた順・古い回答順を考慮
    weakList.sort((a, b) => (p.words[a.id]?.lastAt || "").localeCompare(p.words[b.id]?.lastAt || ""));
    learningList.sort((a, b) => (p.words[a.id]?.lastAt || "").localeCompare(p.words[b.id]?.lastAt || ""));
    masteredList.sort((a, b) => (p.words[a.id]?.lastAt || "").localeCompare(p.words[b.id]?.lastAt || ""));

    const targetWeakCount = Math.floor(count * 0.4);
    const targetUnlearnedCount = Math.floor(count * 0.4);

    const picked = [];
    const usedIds = new Set();

    function addOrderedFromPool(pool, maxNeeded) {
      for (const item of pool) {
        if (picked.length >= count || maxNeeded <= 0) break;
        if (!usedIds.has(item.id)) {
          picked.push(item);
          usedIds.add(item.id);
          maxNeeded--;
        }
      }
    }

    // 1. 苦手（最大40%）
    addOrderedFromPool(weakList, targetWeakCount);
    // 2. 未学習（最大40%・本の番号順）
    addOrderedFromPool(unlearnedList, targetUnlearnedCount);
    // 3. 学習中（残り枠）
    addOrderedFromPool(learningList, count - picked.length);
    // 4. まだ枠があれば苦手・未学習・覚えたから順次補填
    addOrderedFromPool(weakList, count - picked.length);
    addOrderedFromPool(unlearnedList, count - picked.length);
    addOrderedFromPool(masteredList, count - picked.length);

    return shuffleArray(picked);
  }

  // ==========================================
  // 6. 音声再生 (Web Speech API)
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
      utter.rate = state.speechRate || 1.0;
      if (!cachedEnglishVoice) loadEnglishVoice();
      if (cachedEnglishVoice) utter.voice = cachedEnglishVoice;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  // ==========================================
  // 6.5 効果音 (Web Audio API シンセサイザー方式 - 外部音声ファイルゼロ)
  // ==========================================
  let audioCtx = null;

  function getAudioContext() {
    if (typeof window === "undefined") return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      try {
        audioCtx = new AudioContextClass();
      } catch (e) {
        return null;
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTone({ frequency, type = "sine", duration = 0.1, startTime = 0, gain = 0.16 }) {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now + startTime);

      gainNode.gain.setValueAtTime(gain, now + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + startTime + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + startTime);
      osc.stop(now + startTime + duration);
    } catch (e) {
      console.warn("playTone error", e);
    }
  }

  function playCorrectSound(combo = 0) {
    if (!state.soundEffect) return;
    try {
      if (combo >= 5) {
        // 5コンボ以上の爽快チャイム (ド C5 -> ソ G5 -> 高いド C6)
        playTone({ frequency: 523, duration: 0.07, startTime: 0, gain: 0.16 });
        playTone({ frequency: 784, duration: 0.07, startTime: 0.06, gain: 0.18 });
        playTone({ frequency: 1046, duration: 0.14, startTime: 0.12, gain: 0.22 });
      } else {
        // 標準チャイム (ド C5 523Hz -> ミ E5 659Hz)
        playTone({ frequency: 523, duration: 0.08, startTime: 0, gain: 0.16 });
        playTone({ frequency: 659, duration: 0.13, startTime: 0.07, gain: 0.2 });
      }
    } catch (e) {}
  }

  function playWrongSound() {
    if (!state.soundEffect) return;
    try {
      // 柔らかいブザー音 (三角波 A3 220Hz -> F3 175Hz)
      playTone({ frequency: 220, type: "triangle", duration: 0.11, startTime: 0, gain: 0.16 });
      playTone({ frequency: 175, type: "triangle", duration: 0.18, startTime: 0.09, gain: 0.2 });
    } catch (e) {}
  }

  // ==========================================
  // 6.6 バイブレーション (Navigator.vibrate)
  // ==========================================
  function triggerVibrate(pattern) {
    if (!state.vibrate) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  function triggerMegaCombo(combo) {
    if (!els.megaComboBanner || !els.megaComboNum || combo < 2) return;
    if (state.megaComboTimer !== null) {
      clearTimeout(state.megaComboTimer);
      state.megaComboTimer = null;
    }

    els.megaComboNum.textContent = combo;
    els.megaComboBanner.className = "mega-combo-banner";

    if (combo >= 100) {
      els.megaComboBanner.classList.add("mega-combo-tier-4");
    } else if (combo >= 50) {
      els.megaComboBanner.classList.add("mega-combo-tier-3");
    } else if (combo >= 10) {
      els.megaComboBanner.classList.add("mega-combo-tier-2");
    } else {
      els.megaComboBanner.classList.add("mega-combo-tier-1");
    }

    // 強制リフローでアニメーションを即座に再起動
    void els.megaComboBanner.offsetWidth;
    els.megaComboBanner.classList.add("mega-combo-animate");

    state.megaComboTimer = setTimeout(() => {
      if (els.megaComboBanner) {
        els.megaComboBanner.classList.add("hidden");
        els.megaComboBanner.classList.remove("mega-combo-animate");
      }
      state.megaComboTimer = null;
    }, 650);
  }

  // ==========================================
  // 6.7 フレーズ穴埋め・強調用ヘルパー
  // ==========================================
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function maskWordInPhrase(word, phrase) {
    if (!phrase) return "";
    if (!word) return phrase;
    const trimmed = word.trim();
    const escaped = escapeRegex(trimmed);
    try {
      const reInflect = new RegExp("\\b" + escaped + "(?:s|es|ed|d|ing|er|est)?\\b", "i");
      if (reInflect.test(phrase)) {
        return phrase.replace(reInflect, '<span class="masked-blank">______</span>');
      }
      const reSimple = new RegExp(escaped, "i");
      if (reSimple.test(phrase)) {
        return phrase.replace(reSimple, '<span class="masked-blank">______</span>');
      }
    } catch (e) {}
    return phrase;
  }

  function highlightWordInPhrase(word, phrase) {
    if (!phrase) return "";
    if (!word) return phrase;
    const trimmed = word.trim();
    const escaped = escapeRegex(trimmed);
    try {
      const reInflect = new RegExp("\\b(" + escaped + "(?:s|es|ed|d|ing|er|est)?)\\b", "i");
      if (reInflect.test(phrase)) {
        return phrase.replace(reInflect, '<span class="phrase-target-word">$1</span>');
      }
      const reSimple = new RegExp("(" + escaped + ")", "i");
      if (reSimple.test(phrase)) {
        return phrase.replace(reSimple, '<span class="phrase-target-word">$1</span>');
      }
    } catch (e) {}
    return phrase;
  }

  // ==========================================
  // 7. アプリ状態管理
  // ==========================================
  const initialSettings = getSettings();
  if (initialSettings.timeLimit === 3) {
    initialSettings.timeLimit = 5;
    saveSettings({ timeLimit: 5 });
  }

  const initialProg = getProgress();
  const initialCurrentCombo = (initialProg.combo && initialProg.combo.current) || 0;
  const initialBestCombo = (initialProg.combo && initialProg.combo.max) || 0;

  const state = {
    selectedDeckId: initialSettings.selectedDeckId || "sample",
    selectedCount: initialSettings.selectedCount || 10,
    selectedMode: initialSettings.selectedMode || "smart",
    timeLimit: typeof initialSettings.timeLimit === "number" ? initialSettings.timeLimit : 5,
    soundEffect: initialSettings.soundEffect !== false,
    vibrate: initialSettings.vibrate !== false,
    phraseHint: initialSettings.phraseHint || "masked",
    theme: initialSettings.theme || "light",
    autoSpeak: initialSettings.autoSpeak !== false,
    speechRate: initialSettings.speechRate || 1.0,
    allWords: [],
    questions: [],
    currentIndex: 0,
    currentChoices: [],
    answered: false,
    correctCount: 0,
    wrongWords: [],
    autoNextTimer: null,
    // Phase 7 & COMBO 999
    combo: initialCurrentCombo,
    maxCombo: initialBestCombo,
    sessionMaxCombo: initialCurrentCombo,
    megaComboTimer: null,
    timerId: null
  };

  function clearAutoNextTimer() {
    if (state.autoNextTimer !== null) {
      clearTimeout(state.autoNextTimer);
      state.autoNextTimer = null;
    }
  }

  function clearCountdownTimer() {
    if (state.timerId !== null) {
      cancelAnimationFrame(state.timerId);
      state.timerId = null;
    }
  }

  // ==========================================
  // 8. DOM要素
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
    btnToggleTheme: document.getElementById("btn-toggle-theme"),
    btnOpenStats: document.getElementById("btn-open-stats"),
    btnOpenSettings: document.getElementById("btn-open-settings"),
    homeBackupAlert: document.getElementById("home-backup-alert"),
    btnAlertToSettings: document.getElementById("btn-alert-to-settings"),
    streakBadge: document.getElementById("streak-badge"),
    todayCount: document.getElementById("today-count"),
    todayRate: document.getElementById("today-rate"),
    deckSelect: document.getElementById("deck-select"),
    modeBtns: document.querySelectorAll(".mode-btn"),
    countBtns: document.querySelectorAll(".count-btn"),
    timerBtns: document.querySelectorAll(".timer-btn"),
    homeError: document.getElementById("home-error"),
    btnStart: document.getElementById("btn-start"),

    // クイズ
    btnQuit: document.getElementById("btn-quit"),
    quizComboBadge: document.getElementById("quiz-combo-badge"),
    megaComboBanner: document.getElementById("mega-combo-banner"),
    megaComboNum: document.getElementById("mega-combo-num"),
    progressText: document.getElementById("quiz-progress-text"),
    progressBar: document.getElementById("quiz-progress-bar"),
    quizTimerWrap: document.getElementById("quiz-timer-wrap"),
    quizTimerBar: document.getElementById("quiz-timer-bar"),
    quizWord: document.getElementById("quiz-word"),
    btnSpeakWord: document.getElementById("btn-speak-word"),
    quizPos: document.getElementById("quiz-pos"),
    phraseSlot: document.getElementById("phrase-slot"),
    phraseQuestionView: document.getElementById("phrase-question-view"),
    phraseAnswerView: document.getElementById("phrase-answer-view"),
    phraseSlotLabel: document.querySelector(".phrase-slot-label"),
    quizMaskedPhrase: document.getElementById("quiz-masked-phrase"),
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
    resultMaxCombo: document.getElementById("result-max-combo"),
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
    themeBtns: document.querySelectorAll(".theme-btn"),
    btnToggleSound: document.getElementById("btn-toggle-sound"),
    btnToggleVibrate: document.getElementById("btn-toggle-vibrate"),
    hintBtns: document.querySelectorAll(".hint-btn"),
    csvDeckName: document.getElementById("csv-deck-name"),
    importCsvInput: document.getElementById("import-csv-input"),
    csvImportReport: document.getElementById("csv-import-report"),
    settingsDeckList: document.getElementById("settings-deck-list"),
    btnToggleAutospeak: document.getElementById("btn-toggle-autospeak"),
    speedBtns: document.querySelectorAll(".speed-btn"),
    settingsLastBackup: document.getElementById("settings-last-backup"),
    btnExportBackup: document.getElementById("btn-export-backup"),
    importBackupInput: document.getElementById("import-backup-input"),
    undoWrap: document.getElementById("undo-wrap"),
    btnUndoRestore: document.getElementById("btn-undo-restore"),
    settingsPersistStatus: document.getElementById("settings-persist-status")
  };

  function applyTheme(themeName) {
    state.theme = themeName;
    document.documentElement.setAttribute("data-theme", themeName);
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (els.btnToggleTheme) {
      if (themeName === "dark") {
        els.btnToggleTheme.textContent = "☀️";
        els.btnToggleTheme.setAttribute("aria-label", "ライトモードに切替");
        els.btnToggleTheme.title = "ライトモードに切替";
        if (metaThemeColor) metaThemeColor.setAttribute("content", "#0f172a");
      } else {
        els.btnToggleTheme.textContent = "🌙";
        els.btnToggleTheme.setAttribute("aria-label", "ダークモードに切替");
        els.btnToggleTheme.title = "ダークモードに切替";
        if (metaThemeColor) metaThemeColor.setAttribute("content", "#2563eb");
      }
    }
  }

  function toggleTheme() {
    const next = state.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    saveSettings({ theme: next });
    renderSettingsScreen();
  }

  function startCountdownTimer() {
    clearCountdownTimer();
    if (!state.timeLimit || state.timeLimit <= 0) {
      if (els.quizTimerWrap) els.quizTimerWrap.classList.add("hidden");
      return;
    }
    if (els.quizTimerWrap) els.quizTimerWrap.classList.remove("hidden");
    if (els.quizTimerBar) {
      els.quizTimerBar.style.width = "100%";
      els.quizTimerBar.className = "timer-bar-fill";
    }

    const totalMs = state.timeLimit * 1000;
    const startMs = performance.now();

    function tick() {
      if (state.answered) return;
      const elapsed = performance.now() - startMs;
      const remaining = Math.max(0, totalMs - elapsed);
      const ratio = remaining / totalMs;

      if (els.quizTimerBar) {
        els.quizTimerBar.style.width = (ratio * 100) + "%";
        if (ratio <= 0.25) {
          els.quizTimerBar.className = "timer-bar-fill timer-danger";
        } else if (ratio <= 0.5) {
          els.quizTimerBar.className = "timer-bar-fill timer-warning";
        } else {
          els.quizTimerBar.className = "timer-bar-fill";
        }
      }

      if (remaining <= 0) {
        clearCountdownTimer();
        handleAnswer(null, { isTimeout: true });
      } else {
        state.timerId = requestAnimationFrame(tick);
      }
    }
    state.timerId = requestAnimationFrame(tick);
  }

  function showScreen(screenName) {
    clearAutoNextTimer();
    clearCountdownTimer();
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
  // 9. ホーム画面の更新 & 教材セレクトボックス
  // ==========================================
  function populateDeckSelect() {
    const decks = getAllDeckList();
    // 現在のselectedDeckIdが存在しなければsampleに戻す
    if (!decks.some(d => d.id === state.selectedDeckId)) {
      state.selectedDeckId = "sample";
      saveSettings({ selectedDeckId: "sample" });
    }

    els.deckSelect.textContent = "";
    decks.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = `${d.name}（${d.words.length}語）`;
      if (d.id === state.selectedDeckId) {
        opt.selected = true;
      }
      els.deckSelect.appendChild(opt);
    });
  }

  function refreshHomeScreen() {
    populateDeckSelect();
    els.homeError.classList.add("hidden");

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

    // モード・出題数・タイマーボタンのアクティブ状態を反映
    els.modeBtns.forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-mode") === state.selectedMode);
    });
    els.countBtns.forEach(b => {
      b.classList.toggle("active", parseInt(b.getAttribute("data-count"), 10) === state.selectedCount);
    });
    els.timerBtns.forEach(b => {
      b.classList.toggle("active", parseInt(b.getAttribute("data-timer"), 10) === state.timeLimit);
    });

    // バックアップ警告チェック
    const meta = loadJSON(STORAGE_KEYS.META, {});
    const lastBackup = meta.lastBackupDate;
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
  // 10. クイズ進行処理
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
        els.homeError.textContent = "現在、この教材に苦手な単語はありません！";
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
    // セッションをまたいでCOMBOを維持（最大999）
    state.sessionMaxCombo = state.combo;

    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    clearAutoNextTimer();
    clearCountdownTimer();
    state.answered = false;

    const total = state.questions.length;
    const currentWord = state.questions[state.currentIndex];
    state.currentChoices = buildChoices(currentWord, state.allWords);

    // リセット：シェイクアニメーション
    els.quizWord.classList.remove("shake");
    els.choiceBtns.forEach(btn => btn.classList.remove("shake"));

    // コンボバッジの表示制御
    if (state.combo >= 2) {
      els.quizComboBadge.textContent = `🔥 ${state.combo} COMBO!`;
      els.quizComboBadge.classList.remove("hidden");
      els.quizComboBadge.classList.remove("combo-tier-1", "combo-tier-2", "combo-tier-3");
      if (state.combo >= 10) {
        els.quizComboBadge.classList.add("combo-tier-3");
      } else if (state.combo >= 5) {
        els.quizComboBadge.classList.add("combo-tier-2");
      } else {
        els.quizComboBadge.classList.add("combo-tier-1");
      }
    } else {
      els.quizComboBadge.classList.add("hidden");
    }

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

    // 固定スロット：出題時は穴埋めフレーズを表示、回答後パネルは隠す
    els.phraseQuestionView.classList.remove("hidden");
    els.phraseAnswerView.classList.add("hidden");

    if (currentWord.phrase && state.phraseHint !== "off") {
      if (state.phraseHint === "masked") {
        els.phraseSlotLabel.textContent = "フレーズ穴埋め";
        els.quizMaskedPhrase.innerHTML = maskWordInPhrase(currentWord.word, currentWord.phrase);
      } else {
        els.phraseSlotLabel.textContent = "フレーズヒント";
        els.quizMaskedPhrase.textContent = currentWord.phrase;
      }
    } else {
      els.phraseSlotLabel.textContent = "出題";
      els.quizMaskedPhrase.textContent = currentWord.phrase || "4択から正しい意味を選択";
    }

    els.choiceBtns.forEach((btn, idx) => {
      const choice = state.currentChoices[idx];
      btn.disabled = false;
      btn.classList.remove("correct", "wrong", "is-selected", "shake");
      setChoiceButtonContent(btn, choice ? choice.meaning : "", "");
    });

    els.btnDontKnow.classList.remove("hidden");
    els.btnDontKnow.disabled = false;

    // タイマー開始
    startCountdownTimer();

    if (state.autoSpeak) {
      speakEnglish(currentWord.word);
    }
  }

  function handleAnswer(selectedIndex, options) {
    if (state.answered) return;
    state.answered = true;
    clearCountdownTimer();

    const isTimeout = !!(options && options.isTimeout);
    const isDontKnow = selectedIndex === null && !isTimeout;
    const currentWord = state.questions[state.currentIndex];
    const pickedChoice = selectedIndex !== null ? state.currentChoices[selectedIndex] : null;
    const isCorrect = pickedChoice !== null && pickedChoice.id === currentWord.id;

    if (isCorrect) {
      state.correctCount += 1;
      state.combo = Math.min(999, state.combo + 1);
      if (state.combo > state.maxCombo) {
        state.maxCombo = state.combo;
      }
      if (state.combo > state.sessionMaxCombo) {
        state.sessionMaxCombo = state.combo;
      }
      saveCombo(state.combo, state.maxCombo);

      playCorrectSound(state.combo);
      triggerVibrate(15);
      triggerMegaCombo(state.combo);

      if (state.combo >= 2) {
        els.quizComboBadge.textContent = `🔥 ${state.combo} COMBO!`;
        els.quizComboBadge.classList.remove("hidden");
        els.quizComboBadge.classList.remove("combo-tier-1", "combo-tier-2", "combo-tier-3");
        if (state.combo >= 10) {
          els.quizComboBadge.classList.add("combo-tier-3");
        } else if (state.combo >= 5) {
          els.quizComboBadge.classList.add("combo-tier-2");
        } else {
          els.quizComboBadge.classList.add("combo-tier-1");
        }
        els.quizComboBadge.classList.remove("combo-pop");
        void els.quizComboBadge.offsetWidth;
        els.quizComboBadge.classList.add("combo-pop");
      }
    } else {
      state.combo = 0;
      saveCombo(0, state.maxCombo);
      state.wrongWords.push(currentWord);
      playWrongSound();
      triggerVibrate([40, 50, 70]);
      els.quizComboBadge.classList.add("hidden");
      if (els.megaComboBanner) {
        els.megaComboBanner.classList.add("hidden");
      }

      if (selectedIndex !== null) {
        const pickedBtn = els.choiceBtns[selectedIndex];
        if (pickedBtn) pickedBtn.classList.add("shake");
      } else {
        els.quizWord.classList.add("shake");
      }
    }

    saveWordRecord(currentWord.id, isCorrect);

    els.choiceBtns.forEach((btn, idx) => {
      btn.disabled = true;
      btn.classList.remove("is-selected");
      const choice = state.currentChoices[idx];
      if (!choice) return;

      if (idx === selectedIndex) {
        btn.classList.add("is-selected");
      }

      if (choice.id === currentWord.id) {
        btn.classList.add("correct");
        setChoiceButtonContent(btn, choice.meaning, "⭕");
      } else if (idx === selectedIndex) {
        btn.classList.add("wrong");
        setChoiceButtonContent(btn, choice.meaning, "❌");
      }
    });

    els.btnDontKnow.classList.add("hidden");

    // 固定スロット：回答後ステートへ切り替え
    els.phraseQuestionView.classList.add("hidden");
    els.phraseAnswerView.classList.remove("hidden");

    if (isCorrect) {
      els.feedbackBadge.textContent = "⭕ 正解";
      els.feedbackBadge.className = "feedback-badge is-correct";
    } else if (isTimeout) {
      els.feedbackBadge.textContent = "⏰ 時間切れ";
      els.feedbackBadge.className = "feedback-badge is-wrong";
    } else if (isDontKnow) {
      els.feedbackBadge.textContent = "💡 未解答";
      els.feedbackBadge.className = "feedback-badge is-wrong";
    } else {
      els.feedbackBadge.textContent = "❌ 不正解";
      els.feedbackBadge.className = "feedback-badge is-wrong";
    }

    els.feedbackMeaning.textContent = currentWord.meaning;

    if (currentWord.phrase) {
      els.feedbackPhrase.innerHTML = highlightWordInPhrase(currentWord.word, currentWord.phrase);
      els.feedbackPhraseJa.textContent = currentWord.phrase_ja || "";
      els.feedbackPhraseRow.classList.remove("hidden");
    } else {
      els.feedbackPhraseRow.classList.add("hidden");
    }

    const delayMs = isCorrect ? 900 : 1800;
    state.autoNextTimer = setTimeout(function () {
      goNextQuestion();
    }, delayMs);
  }

  function goNextQuestion() {
    clearAutoNextTimer();
    clearCountdownTimer();
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
    if (els.resultMaxCombo) {
      if (state.combo > 0) {
        els.resultMaxCombo.textContent = `🔥 現在 ${state.combo} COMBO 継続中！ (最高: ${state.maxCombo})`;
      } else {
        els.resultMaxCombo.textContent = `🔥 最高 ${state.maxCombo} COMBO (今回最大: ${state.sessionMaxCombo})`;
      }
    }

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
  // 11. 記録画面の描画
  // ==========================================
  function renderStatsScreen() {
    const p = getProgress();
    const allWords = getDeckWords();
    const totalWordsCount = allWords.length || 1;

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

    renderChart(p.days);

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
  // 12. 設定画面・CSV読み込み・バックアップ
  // ==========================================
  function renderSettingsScreen() {
    // 1. 教材一覧の描画
    const decks = getAllDeckList();
    els.settingsDeckList.textContent = "";
    decks.forEach(d => {
      const li = document.createElement("li");
      li.className = "deck-list-item";

      const info = document.createElement("div");
      info.className = "deck-item-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "deck-item-name";
      nameSpan.textContent = `${d.name}（${d.words.length}語）`;

      const metaSpan = document.createElement("span");
      metaSpan.className = "deck-item-meta";
      metaSpan.textContent = d.isBuiltIn
        ? "初期内蔵データ"
        : `ID: ${d.id} / 更新: ${d.updatedAt || "-"}`;

      info.appendChild(nameSpan);
      info.appendChild(metaSpan);
      li.appendChild(info);

      if (!d.isBuiltIn) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "delete-deck-btn";
        delBtn.textContent = "削除";
        delBtn.addEventListener("click", () => {
          if (confirm(`教材「${d.name}」を削除しますか？\n（※単語の学習履歴自体は消えずに保持されます）`)) {
            deleteCustomDeck(d.id);
            if (state.selectedDeckId === d.id) {
              state.selectedDeckId = "sample";
              saveSettings({ selectedDeckId: "sample" });
            }
            renderSettingsScreen();
          }
        });
        li.appendChild(delBtn);
      }

      els.settingsDeckList.appendChild(li);
    });

    // 2. トレーニング演出設定（テーマ・効果音・振動・ヒント形式）
    els.themeBtns.forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-theme-val") === state.theme);
    });

    els.btnToggleSound.classList.toggle("active", state.soundEffect);
    els.btnToggleSound.setAttribute("aria-pressed", String(state.soundEffect));
    els.btnToggleSound.textContent = state.soundEffect ? "ON" : "OFF";

    els.btnToggleVibrate.classList.toggle("active", state.vibrate);
    els.btnToggleVibrate.setAttribute("aria-pressed", String(state.vibrate));
    els.btnToggleVibrate.textContent = state.vibrate ? "ON" : "OFF";

    els.hintBtns.forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-hint") === state.phraseHint);
    });

    // 3. 音声設定の反映
    els.btnToggleAutospeak.classList.toggle("active", state.autoSpeak);
    els.btnToggleAutospeak.setAttribute("aria-pressed", String(state.autoSpeak));
    els.btnToggleAutospeak.textContent = state.autoSpeak ? "ON" : "OFF";

    els.speedBtns.forEach(btn => {
      const rate = parseFloat(btn.getAttribute("data-rate"));
      btn.classList.toggle("active", Math.abs(rate - state.speechRate) < 0.05);
    });

    // 4. バックアップ情報の反映
    const meta = loadJSON(STORAGE_KEYS.META, {});
    els.settingsLastBackup.textContent = meta.lastBackupDate
      ? `${meta.lastBackupDate} (${meta.lastBackupTime || ""})`
      : "未実行";

    els.settingsPersistStatus.textContent = persistStatus;

    const prev = localStorage.getItem(STORAGE_KEYS.PROGRESS_PREV);
    if (prev) {
      els.undoWrap.classList.remove("hidden");
    } else {
      els.undoWrap.classList.add("hidden");
    }
  }

  // CSVファイルの取り込み処理
  function handleCSVFileImport(file) {
    if (!file) return;
    els.csvImportReport.classList.add("hidden");
    els.csvImportReport.classList.remove("is-error");

    const baseName = file.name.replace(/\.[^/.]+$/, "").trim() || "custom_deck";
    const deckId = "deck_" + baseName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const customNameInput = (els.csvDeckName.value || "").trim();
    const displayName = customNameInput || baseName;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const csvText = decodeCSVBuffer(e.target.result);
        const result = parseAndValidateWordsCSV(csvText);

        if (!result.ok) {
          els.csvImportReport.textContent = "【読み込みエラー】\n" + result.error;
          els.csvImportReport.classList.add("is-error");
          els.csvImportReport.classList.remove("hidden");
          return;
        }

        const existingDecks = getCustomDecks().decks;
        const isOverwrite = !!existingDecks[deckId];

        let confirmMsg =
          `教材「${displayName}」として ${result.words.length} 語を読み込みますか？\n` +
          (isOverwrite ? `※既存の「${existingDecks[deckId].name}」の単語リストを最新内容で上書きします（学習記録は維持されます）。\n` : "");

        if (result.uncheckedSkipped > 0) {
          confirmMsg += `・未確認スキップ (checked≠1): ${result.uncheckedSkipped}件\n`;
        }
        if (result.errors.length > 0) {
          confirmMsg += `・不備スキップ: ${result.errors.length}件\n`;
        }

        if (!confirm(confirmMsg)) return;

        const saved = saveCustomDeck({
          id: deckId,
          name: displayName,
          updatedAt: getTodayString(),
          words: result.words
        });

        if (saved) {
          state.selectedDeckId = deckId;
          saveSettings({ selectedDeckId: deckId });
          els.csvDeckName.value = "";

          let reportText = `✅ 教材「${displayName}」（${result.words.length}語）を登録し、使用教材に設定しました！`;
          if (result.uncheckedSkipped > 0) {
            reportText += `\n・checked列が1以外の行を ${result.uncheckedSkipped} 件スキップしました。`;
          }
          if (result.errors.length > 0) {
            reportText += `\n・不備によりスキップした行（${result.errors.length}件）:\n  ` +
              result.errors.slice(0, 5).join("\n  ");
          }
          els.csvImportReport.textContent = reportText;
          els.csvImportReport.classList.remove("is-error", "hidden");
          renderSettingsScreen();
        }
      } catch (err) {
        els.csvImportReport.textContent = "エラー: CSVファイルの読み取りに失敗しました。";
        els.csvImportReport.classList.add("is-error");
        els.csvImportReport.classList.remove("hidden");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportBackup() {
    const p = getProgress();
    const settings = getSettings();
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

    const meta = loadJSON(STORAGE_KEYS.META, {});
    meta.lastBackupDate = `${y}-${m}-${d}`;
    meta.lastBackupTime = `${hh}:${mm}`;
    saveJSON(STORAGE_KEYS.META, meta);

    renderSettingsScreen();
    alert("バックアップファイルをダウンロードしました。\nファイルはスマホの「ダウンロード」フォルダ等に保存されています。");
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);

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

        const currentData = localStorage.getItem(STORAGE_KEYS.PROGRESS);
        if (currentData) {
          localStorage.setItem(STORAGE_KEYS.PROGRESS_PREV, currentData);
        }

        saveJSON(STORAGE_KEYS.PROGRESS, data.progress);
        if (data.settings) {
          const merged = saveSettings(data.settings);
          state.selectedDeckId = merged.selectedDeckId;
          state.selectedMode = merged.selectedMode;
          state.selectedCount = merged.selectedCount;
          state.timeLimit = typeof merged.timeLimit === "number" ? merged.timeLimit : 5;
          state.soundEffect = merged.soundEffect !== false;
          state.vibrate = merged.vibrate !== false;
          state.phraseHint = merged.phraseHint || "masked";
          state.theme = merged.theme || "light";
          state.autoSpeak = merged.autoSpeak !== false;
          state.speechRate = merged.speechRate || 1.0;
          applyTheme(state.theme);
        }

        renderSettingsScreen();
        alert("学習記録を正常に復元しました！");
      } catch (err) {
        alert("エラー: JSONファイルの解析に失敗しました。正しいファイルを選択してください。");
      }
    };
    reader.readAsText(file);
  }

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
  // 13. イベント登録と初期化
  // ==========================================
  function init() {
    if (!speechSupported) {
      els.btnSpeakWord.classList.add("hidden");
      els.btnSpeakPhrase.classList.add("hidden");
    }

    // テーマ切り替え（ホーム右上）
    if (els.btnToggleTheme) {
      els.btnToggleTheme.addEventListener("click", toggleTheme);
    }

    // ナビゲーション
    els.btnOpenStats.addEventListener("click", () => showScreen("stats"));
    els.btnOpenSettings.addEventListener("click", () => showScreen("settings"));
    els.btnAlertToSettings.addEventListener("click", () => showScreen("settings"));
    els.btnStatsBack.addEventListener("click", () => showScreen("home"));
    els.btnSettingsBack.addEventListener("click", () => showScreen("home"));

    // 教材の選択（ホーム画面）
    els.deckSelect.addEventListener("change", () => {
      state.selectedDeckId = els.deckSelect.value;
      saveSettings({ selectedDeckId: state.selectedDeckId });
      els.homeError.classList.add("hidden");
    });

    // モード選択
    els.modeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedMode = btn.getAttribute("data-mode");
        saveSettings({ selectedMode: state.selectedMode });
        els.modeBtns.forEach(b => b.classList.toggle("active", b === btn));
        els.homeError.classList.add("hidden");
      });
    });

    // 出題数ボタン
    els.countBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedCount = parseInt(btn.getAttribute("data-count"), 10);
        saveSettings({ selectedCount: state.selectedCount });
        els.countBtns.forEach(b => b.classList.toggle("active", b === btn));
      });
    });

    // 制限時間選択ボタン（ホーム画面）
    els.timerBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.timeLimit = parseInt(btn.getAttribute("data-timer"), 10);
        saveSettings({ timeLimit: state.timeLimit });
        els.timerBtns.forEach(b => b.classList.toggle("active", b === btn));
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

    // CSV読み込み
    els.importCsvInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCSVFileImport(e.target.files[0]);
        e.target.value = "";
      }
    });

    // トレーニング演出設定（設定画面）
    els.themeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-theme-val");
        applyTheme(t);
        saveSettings({ theme: t });
        renderSettingsScreen();
      });
    });

    els.btnToggleSound.addEventListener("click", () => {
      state.soundEffect = !state.soundEffect;
      saveSettings({ soundEffect: state.soundEffect });
      renderSettingsScreen();
    });

    els.btnToggleVibrate.addEventListener("click", () => {
      state.vibrate = !state.vibrate;
      saveSettings({ vibrate: state.vibrate });
      renderSettingsScreen();
    });

    els.hintBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.phraseHint = btn.getAttribute("data-hint");
        saveSettings({ phraseHint: state.phraseHint });
        renderSettingsScreen();
      });
    });

    // 音声設定イベント
    els.btnToggleAutospeak.addEventListener("click", () => {
      state.autoSpeak = !state.autoSpeak;
      saveSettings({ autoSpeak: state.autoSpeak });
      renderSettingsScreen();
    });

    els.speedBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        state.speechRate = parseFloat(btn.getAttribute("data-rate"));
        saveSettings({ speechRate: state.speechRate });
        renderSettingsScreen();
      });
    });

    // バックアップ操作
    els.btnExportBackup.addEventListener("click", exportBackup);
    els.importBackupInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        importBackup(e.target.files[0]);
        e.target.value = "";
      }
    });
    els.btnUndoRestore.addEventListener("click", undoRestore);

    // データ保護の要求
    checkAndRequestPersist();

    // ユーザー操作による AudioContext のアンロック
    const unlockAudio = () => {
      getAudioContext();
      document.removeEventListener("pointerdown", unlockAudio);
    };
    document.addEventListener("pointerdown", unlockAudio, { once: true });

    // 初期テーマ適用
    applyTheme(state.theme || "light");

    // 初回ホーム画面描画
    refreshHomeScreen();
  }

  init();
})();
