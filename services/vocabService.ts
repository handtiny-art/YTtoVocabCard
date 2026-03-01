
import Groq from "groq-sdk";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string, supadataKey?: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 Groq API 金鑰。請點擊右上角「⚙️ 設定」並貼上正確的金鑰。");
  }

  const groq = new Groq({ 
    apiKey,
    dangerouslyAllowBrowser: true // Since we are calling from frontend as per user request pattern
  });

  // 1. 先從後端獲取字幕與標題
  let transcriptText = "";
  let detectedTitle = "YouTube Video";
  let videoId = "";
  let useFallback = false;

  try {
    const transcriptResponse = await fetch(`/api/transcript?url=${encodeURIComponent(url)}`, {
      headers: {
        'x-supadata-key': supadataKey || ''
      }
    });
    const data = await transcriptResponse.json();
    
    if (data.error) {
      if (data.error.includes("Supadata API Key")) {
        throw new Error(data.error);
      }
      console.warn("Transcript disabled or error, using fallback search.");
      useFallback = true;
      videoId = data.videoId || "";
    } else {
      // 截斷過長的逐字稿以確保穩定性
      transcriptText = data.transcript ? data.transcript.substring(0, 30000) : "";
      detectedTitle = data.title || "YouTube Video";
      videoId = data.videoId;
    }
  } catch (error: any) {
    console.warn("Transcript fetch error, falling back:", error.message);
    useFallback = true;
  }
  
  const systemInstruction = `你是一位專精於 CEFR 分級的資深英語老師。
請根據提供的逐字稿執行以下任務：
1. 篩選準則：僅挑選符合 CEFR B2 到 C2 難度的核心單詞或片語。
2. 數量：請找出所有符合等級的進階詞彙。
3. 內容摘要：產生一段約 150 字的繁體中文內容摘要 (summary)。
4. 每個單字必須包含：單字 (word)、CEFR 等級 (level: B2/C1/C2)、中文解釋 (definition)、影片原句參考 (sentence)。

輸出規範：必須嚴格遵守 JSON 格式，結構如下：
{
  "detectedTitle": "影片標題",
  "summary": "內容摘要",
  "vocabulary": [
    { "word": "...", "level": "...", "definition": "...", "sentence": "..." }
  ]
}`;

  const userPrompt = useFallback 
    ? `請針對此影片 ID (${videoId}) 進行深度分析並提取進階核心單字：https://www.youtube.com/watch?v=${videoId}。由於無法直接獲取逐字稿，請根據您的知識庫分析該影片內容。`
    : `這是逐字稿內容：\n---\n${transcriptText}\n---\n請執行任務並輸出 JSON。`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("AI 無法回傳內容。");

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
      transcript: result.summary,
      detectedTitle: result.detectedTitle || detectedTitle,
      cards,
      sources: [] // Groq doesn't have built-in grounding like Gemini
    };
  } catch (error: any) {
    console.error("Groq API Error:", error);
    const errorMsg = error.message || "";
    if (errorMsg.includes("401")) {
      throw new Error("Groq API 金鑰無效，請檢查是否複製正確。");
    } else if (errorMsg.includes("429")) {
      throw new Error("已達到 Groq API 使用限額，請稍後再試。");
    }
    throw new Error(`分析失敗: ${errorMsg || "請檢查網路或 API 設定"}`);
  }
};
