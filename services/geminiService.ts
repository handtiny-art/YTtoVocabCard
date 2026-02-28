
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string, supadataKey?: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 API 金鑰。請點擊右上角「⚙️ 設定」並貼上正確的金鑰。");
  }

  const ai = new GoogleGenAI({ apiKey });

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
    
    if (data.error === "TRANSCRIPT_DISABLED" || !data.transcript) {
      console.warn("Transcript disabled, using fallback search.");
      useFallback = true;
      videoId = data.videoId || "";
    } else {
      transcriptText = data.transcript;
      detectedTitle = data.title;
      videoId = data.videoId;
    }
  } catch (error: any) {
    console.warn("Transcript fetch error, falling back:", error.message);
    useFallback = true;
  }
  
  // 強化指令：根據是否有字幕調整策略
  const modelName = useFallback ? 'gemini-3-flash-preview' : 'gemini-flash-latest';

  const systemInstruction = useFallback 
    ? `你是一位專精於 CEFR 分級的資深英語老師。
使用者提供的影片無法直接抓取逐字稿，請你利用 Google Search 搜尋該影片 ID (${videoId}) 的標題與實際內容。
注意：
1. 你必須確保分析的是該特定影片 (ID: ${videoId})。
2. 嚴禁產生幻覺，如果無法確定內容，請在摘要中說明。

工作規範：
1. 產生一段約 150 字的繁體中文內容摘要 (summary)。
2. 篩選準則：僅挑選符合 CEFR B2 (Upper-Intermediate) 到 C2 難度的核心單詞或片語。
3. 嚴格排除：不要包含 A1/A2/B1 等級的簡單詞彙（如: take, decide, important, think）。
4. 數量：請找出所有符合等級的進階詞彙，不要只限制在 5 個。
5. 每個單字必須包含：單字 (word)、CEFR 等級 (level: B2/C1/C2)、中文解釋 (definition)、影片原句參考 (sentence)。

輸出規範：
- 必須嚴格遵守 JSON 格式。
- 語系：繁體中文 (台灣)。`
    : `你是一位專精於 CEFR 分級的資深英語老師。
以下是從 YouTube 影片中提取的真實逐字稿：
---
${transcriptText}
---
請根據這段文字執行以下任務：
1. 篩選準則：僅挑選符合 CEFR B2 (Upper-Intermediate) 到 C2 難度的核心單詞或片語。
2. 嚴格排除：不要包含 A1/A2/B1 等級的簡單詞彙（如: take, decide, important, think）。
3. 數量：請找出所有符合等級的進階詞彙，不要只限制在 5 個。
4. 內容摘要：產生一段約 150 字的繁體中文內容摘要 (summary)，必須 100% 基於提供的逐字稿。
5. 每個單字必須包含：單字 (word)、CEFR 等級 (level: B2/C1/C2)、中文解釋 (definition)、影片原句參考 (sentence)。

輸出規範：
- 必須嚴格遵守 JSON 格式。
- 語系：繁體中文 (台灣)。`;

  const prompt = useFallback 
    ? `請針對此影片 ID (${videoId}) 進行深度分析並提取進階核心單字：https://www.youtube.com/watch?v=${videoId}`
    : `你是一位專精於 CEFR 分級的資深英語老師。請根據提供的逐字稿執行任務：篩選 B2 以上單字、產生摘要並輸出 JSON。`;

  try {
    const response = await ai.models.generateContent({
      model: modelName, 
      contents: prompt,
      config: {
        systemInstruction,
        // 只有在 fallback 模式下才開啟搜尋工具
        tools: useFallback ? [{ googleSearch: {} }] : undefined,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedTitle: { type: Type.STRING, description: "影片的正確完整標題" },
            summary: { type: Type.STRING, description: "與該影片完全相符的內容摘要" },
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  level: { type: Type.STRING, description: "CEFR 等級 (B2/C1/C2)" },
                  definition: { type: Type.STRING, description: "中文解釋" },
                  sentence: { type: Type.STRING, description: "影片中的原句" }
                },
                required: ["word", "level", "definition", "sentence"]
              }
            }
          },
          required: ["detectedTitle", "summary", "vocabulary"]
        }
      }
    });

    let result;
    try {
      // 優先嘗試直接解析
      result = JSON.parse(response.text.trim());
    } catch (e) {
      // 如果失敗，嘗試正則提取 JSON 區塊
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (innerE) {
          console.error("JSON parse failed even with regex:", response.text);
          throw new Error("AI 回傳格式不正確，請再試一次。");
        }
      } else {
        console.error("No JSON found in response:", response.text);
        throw new Error("AI 無法產生正確的格式，請稍後再試。");
      }
    }
    
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({ title: chunk.web.title || "驗證來源", url: chunk.web.uri });
        }
      });
    }

    const cards: Flashcard[] = result.vocabulary.map((v: any, index: number) => ({
      id: `card-${Date.now()}-${index}`,
      word: v.word,
      cefrLevel: v.level,
      translation: v.definition,
      example: v.sentence,
      partOfSpeech: 'n/a', // AI didn't provide this in the new format, but we keep it for type compatibility
      status: 'new'
    }));

    return {
      transcript: result.summary,
      detectedTitle: result.detectedTitle,
      cards,
      sources
    };
  } catch (error: any) {
    console.error("Gemini Failure:", error);
    throw new Error(error.message || "分析失敗，這可能是因為該影片受限或 AI 無法精確鎖定內容。");
  }
};
