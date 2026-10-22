// 自作サンプル単語データ（全30語）
// すべてオリジナルの作成データであり、市販書籍の文章は含みません。
window.SAMPLE_WORDS = [
  // 動詞 (10語)
  {
    id: "sample-001",
    word: "confirm",
    meaning: "〜を確認する",
    pos: "動詞",
    phrase: "confirm the schedule",
    phrase_ja: "日程を確認する"
  },
  {
    id: "sample-002",
    word: "postpone",
    meaning: "〜を延期する",
    pos: "動詞",
    phrase: "postpone the seminar",
    phrase_ja: "セミナーを延期する"
  },
  {
    id: "sample-003",
    word: "submit",
    meaning: "〜を提出する",
    pos: "動詞",
    phrase: "submit an application",
    phrase_ja: "申請書を提出する"
  },
  {
    id: "sample-004",
    word: "approve",
    meaning: "〜を承認する",
    pos: "動詞",
    phrase: "approve the budget",
    phrase_ja: "予算を承認する"
  },
  {
    id: "sample-005",
    word: "attend",
    meaning: "〜に出席する",
    pos: "動詞",
    phrase: "attend the conference",
    phrase_ja: "会議に出席する"
  },
  {
    id: "sample-006",
    word: "replace",
    meaning: "〜を交換する",
    pos: "動詞",
    phrase: "replace the old battery",
    phrase_ja: "古いバッテリーを交換する"
  },
  {
    id: "sample-007",
    word: "notify",
    meaning: "〜に通知する",
    pos: "動詞",
    phrase: "notify all staff members",
    phrase_ja: "全スタッフに通知する"
  },
  {
    id: "sample-008",
    word: "purchase",
    meaning: "〜を購入する",
    pos: "動詞",
    phrase: "purchase office supplies",
    phrase_ja: "事務用品を購入する"
  },
  {
    id: "sample-009",
    word: "hire",
    meaning: "〜を雇う",
    pos: "動詞",
    phrase: "hire a new engineer",
    phrase_ja: "新しい技術者を雇う"
  },
  {
    id: "sample-010",
    word: "expand",
    meaning: "〜を拡大する",
    pos: "動詞",
    phrase: "expand the business",
    phrase_ja: "事業を拡大する"
  },

  // 名詞 (10語)
  {
    id: "sample-011",
    word: "itinerary",
    meaning: "旅程表",
    pos: "名詞",
    phrase: "check the travel itinerary",
    phrase_ja: "旅行の旅程表を確認する"
  },
  {
    id: "sample-012",
    word: "receipt",
    meaning: "領収書",
    pos: "名詞",
    phrase: "keep the receipt",
    phrase_ja: "領収書を保管する"
  },
  {
    id: "sample-013",
    word: "deadline",
    meaning: "締め切り",
    pos: "名詞",
    phrase: "meet the deadline",
    phrase_ja: "締め切りに間に合わせる"
  },
  {
    id: "sample-014",
    word: "facility",
    meaning: "施設・設備",
    pos: "名詞",
    phrase: "tour the sports facility",
    phrase_ja: "スポーツ施設を見学する"
  },
  {
    id: "sample-015",
    word: "warranty",
    meaning: "保証（書）",
    pos: "名詞",
    phrase: "under a one-year warranty",
    phrase_ja: "1年間の保証期間中で"
  },
  {
    id: "sample-016",
    word: "candidate",
    meaning: "候補者・志願者",
    pos: "名詞",
    phrase: "interview a job candidate",
    phrase_ja: "採用候補者と面接する"
  },
  {
    id: "sample-017",
    word: "banquet",
    meaning: "晩餐会・宴会",
    pos: "名詞",
    phrase: "hold an annual banquet",
    phrase_ja: "年次晩餐会を開く"
  },
  {
    id: "sample-018",
    word: "invoice",
    meaning: "請求書",
    pos: "名詞",
    phrase: "send an invoice by email",
    phrase_ja: "メールで請求書を送る"
  },
  {
    id: "sample-019",
    word: "agenda",
    meaning: "議題・協議事項",
    pos: "名詞",
    phrase: "the next item on the agenda",
    phrase_ja: "議題の次の項目"
  },
  {
    id: "sample-020",
    word: "colleague",
    meaning: "同僚",
    pos: "名詞",
    phrase: "ask a colleague for help",
    phrase_ja: "同僚に助けを求める"
  },

  // 形容詞 (6語)
  {
    id: "sample-021",
    word: "available",
    meaning: "利用できる・手が空いている",
    pos: "形容詞",
    phrase: "available at the front desk",
    phrase_ja: "フロントで利用できる"
  },
  {
    id: "sample-022",
    word: "mandatory",
    meaning: "義務的な・必須の",
    pos: "形容詞",
    phrase: "a mandatory training session",
    phrase_ja: "参加必須の研修"
  },
  {
    id: "sample-023",
    word: "eligible",
    meaning: "資格がある・適格な",
    pos: "形容詞",
    phrase: "eligible for a discount",
    phrase_ja: "割引を受ける資格がある"
  },
  {
    id: "sample-024",
    word: "confidential",
    meaning: "機密の・内密の",
    pos: "形容詞",
    phrase: "confidential documents",
    phrase_ja: "機密書類"
  },
  {
    id: "sample-025",
    word: "complimentary",
    meaning: "無料の・優待の",
    pos: "形容詞",
    phrase: "complimentary breakfast",
    phrase_ja: "無料の朝食"
  },
  {
    id: "sample-026",
    word: "tentative",
    meaning: "仮の・暫定的な",
    pos: "形容詞",
    phrase: "a tentative schedule",
    phrase_ja: "仮のスケジュール"
  },

  // 副詞 (4語)
  {
    id: "sample-027",
    word: "promptly",
    meaning: "迅速に・直ちに",
    pos: "副詞",
    phrase: "reply to the email promptly",
    phrase_ja: "メールに迅速に返信する"
  },
  {
    id: "sample-028",
    word: "approximately",
    meaning: "おおよそ・約",
    pos: "副詞",
    phrase: "approximately two hours",
    phrase_ja: "約2時間"
  },
  {
    id: "sample-029",
    word: "frequently",
    meaning: "頻繁に",
    pos: "副詞",
    phrase: "frequently asked questions",
    phrase_ja: "よくある質問"
  },
  {
    id: "sample-030",
    word: "temporarily",
    meaning: "一時的に",
    pos: "副詞",
    phrase: "temporarily closed for renovation",
    phrase_ja: "改装のため一時的に休業中"
  }
];
