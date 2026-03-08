
import Groq from "groq-sdk";
import { Flashcard, GroundingSource } from "../types";

/**
 * 第一階段：僅從後端獲取逐字稿與標題
 */
export const fetchTranscript = async (url: string, supadataKey?: string): Promise<{ transcript: string, detectedTitle: string, videoId: string }> => {
  console.log("[VocabService] 階段 1: 正在獲取逐字稿...");
  
  const apiUrl = `/api/transcript?url=${encodeURIComponent(url)}`;
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'x-supadata-key': supadataKey || ''
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "伺服器無回應" }));
    throw new Error(errorData.error || `連線失敗 (${response.status})`);
  }

  const data = await response.json();
  
  if (data.error) throw new Error(data.error);
  if (!data.transcript) throw new Error("影片沒有可用的逐字稿內容。");

  return {
    transcript: data.transcript,
    detectedTitle: data.title || "YouTube Video",
    videoId: data.videoId
  };
};

/**
 * 第二階段：將逐字稿傳給 AI 進行分析
 */
export const analyzeTranscript = async (transcript: string, title: string): Promise<{ summary: string, cards: Flashcard[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined") {
    throw new Error("請先設定 Groq API Key。");
  }

  const groq = new Groq({ 
    apiKey,
    dangerouslyAllowBrowser: true 
  });

  console.log("[VocabService] 階段 2: 正在進行 AI 分析...");

  // 縮減長度以確保 AI 處理速度 (優化：僅取前 5000 字)
  const truncatedTranscript = transcript.substring(0, 5000);

  const systemInstruction = `你是一位專精於 CEFR 分級的資深英語老師。
請根據提供的逐字稿執行以下任務：
1. 篩選準則：僅挑選符合 CEFR B2 到 C2 難度的核心單詞或片語。
2. 數量限制：精選 5-10 個最具代表性的進階詞彙。
3. 內容摘要：產生一段約 80 字的繁體中文內容摘要 (summary)。
4. 每個單字包含：word, level (B2/C1/C2), definition (繁中), sentence (影片原句)。

輸出規範：嚴格 JSON 格式。
{
  "summary": "...",
  "vocabulary": [
    { "word": "...", "level": "...", "definition": "...", "sentence": "..." }
  ]
}`;

  const userPrompt = `影片標題：${title}\n逐字稿內容：\n---\n${truncatedTranscript}\n---`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("AI 分析失敗。");

  const result = JSON.parse(content);
  
  const cards: Flashcard[] = result.vocabulary.map((v: any, index: number) => ({
    id: `card-${Date.now()}-${index}`,
    word: v.word,
    cefrLevel: v.level,
    translation: v.definition,
    example: v.sentence,
    partOfSpeech: 'n/a',
    status: 'new'
  }));

  return {
    summary: result.summary,
    cards
  };
};
