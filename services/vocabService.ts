
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
    console.log("[VocabService] 正在從後端獲取逐字稿...");
    
    // 確保在 Vercel 上使用正確的 API 路徑
    const apiUrl = `/api/transcript?url=${encodeURIComponent(url)}`;
    
    const transcriptResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-supadata-key': supadataKey || ''
      }
    });

    if (!transcriptResponse.ok) {
      const errorData = await transcriptResponse.json().catch(() => ({ error: "Unknown server error" }));
      throw new Error(errorData.error || `伺服器回應錯誤: ${transcriptResponse.status}`);
    }

    const data = await transcriptResponse.json();
    
    if (data.error) {
      if (data.error.includes("尚未設定 Supadata API Key")) {
        throw new Error("❌ 尚未設定 Supadata API Key。請點擊右上角「⚙️ 設定」填寫，否則無法獲取影片內容。");
      }
      throw new Error(`❌ 無法獲取影片逐字稿：${data.error}`);
    }

    if (!data.transcript || data.transcript.length < 50) {
      throw new Error("❌ 影片逐字稿內容過短或不存在。請確認該影片是否有提供英文字幕，或嘗試其他影片。");
    }

    // 縮減長度至 20,000 字以提升 AI 處理速度 (約 15-20 分鐘影片量)
    transcriptText = data.transcript.substring(0, 20000);
    detectedTitle = data.title || "YouTube Video";
    videoId = data.videoId;
    console.log(`[VocabService] 逐字稿獲取成功，長度: ${transcriptText.length} 字。`);
  } catch (error: any) {
    console.error("Transcript fetch error:", error.message);
    throw new Error(`獲取影片內容失敗: ${error.message}`);
  }
  
  const systemInstruction = `你是一位專精於 CEFR 分級的資深英語老師。
請根據提供的逐字稿執行以下任務：
1. 篩選準則：僅挑選符合 CEFR B2 到 C2 難度的核心單詞或片語。
2. 數量限制：請精選出「最重要」且「最具代表性」的 15-20 個進階詞彙即可，不要全部列出，以確保分析速度。
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

  const userPrompt = `這是逐字稿內容：\n---\n${transcriptText}\n---\n請執行任務並輸出 JSON。`;

  try {
    console.log("[VocabService] 正在呼叫 Groq API (Llama 3.3 70B) 進行 AI 分析...");
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
    console.log("[VocabService] 收到 AI 回傳數據。");

    const result = JSON.parse(content);
    console.log(`[VocabService] 分析完成，共提取 ${result.vocabulary?.length || 0} 個單字。`);
    
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
