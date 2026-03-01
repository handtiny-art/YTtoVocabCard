
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string, supadataKey?: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 Gemini API 金鑰。請點擊右上角「⚙️ 設定」並貼上正確的金鑰。");
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
  
  // 強化指令：根據是否有字幕調整策略
  const systemInstruction = useFallback 
    ? `你是一位專精於 CEFR 分級的資深英語老師。
使用者提供的影片無法直接抓取逐字稿，請你利用 Google Search 搜尋該影片 ID (${videoId}) 的標題與實際內容。
注意：
1. 你必須確保分析的是該特定影片 (ID: ${videoId})。
2. 嚴禁產生幻覺，如果無法確定內容，請在摘要中說明。

工作規範：
1. 產生一段約 150 字的繁體中文內容摘要 (summary)。
2. 篩選準則：僅挑選符合 CEFR B2 到 C2 難度的核心單詞或片語。
3. 數量：請找出所有符合等級的進階詞彙。
4. 每個單字必須包含：單字 (word)、CEFR 等級 (level: B2/C1/C2)、中文解釋 (definition)、影片原句參考 (sentence)。

輸出規範：必須嚴格遵守 JSON 格式。`
    : `你是一位專精於 CEFR 分級的資深英語老師。
以下是從 YouTube 影片中提取的真實逐字稿：
---
${transcriptText}
---
請根據這段文字執行以下任務：
1. 篩選準則：僅挑選符合 CEFR B2 到 C2 難度的核心單詞或片語。
2. 數量：請找出所有符合等級的進階詞彙。
3. 內容摘要：產生一段約 150 字的繁體中文內容摘要 (summary)，必須 100% 基於提供的逐字稿。
4. 每個單字必須包含：單字 (word)、CEFR 等級 (level: B2/C1/C2)、中文解釋 (definition)、影片原句參考 (sentence)。

輸出規範：必須嚴格遵守 JSON 格式。`;

  const prompt = useFallback 
    ? `請針對此影片 ID (${videoId}) 進行深度分析並提取進階核心單字：https://www.youtube.com/watch?v=${videoId}`
    : `請根據提供的逐字稿執行任務：篩選 B2 以上單字、產生摘要並輸出 JSON。`;

  // 嘗試多個可能的模型名稱以解決 404 問題，優先使用最新的 Gemini 3 系列
  const modelsToTry = ['gemini-3-flash-preview', 'gemini-flash-latest'];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Gemini] Attempting analysis with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName, 
        contents: prompt,
        config: {
          systemInstruction,
          tools: useFallback ? [{ googleSearch: {} }] : undefined,
          responseMimeType: "application/json",
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedTitle: { type: Type.STRING },
              summary: { type: Type.STRING },
              vocabulary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    level: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    sentence: { type: Type.STRING }
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
        result = JSON.parse(response.text.trim());
      } catch (e) {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("AI 回傳格式錯誤。");
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
        partOfSpeech: 'n/a',
        status: 'new'
      }));

      return {
        transcript: result.summary,
        detectedTitle: result.detectedTitle || detectedTitle,
        cards,
        sources
      };
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || "";
      // 如果不是 404 錯誤，就沒必要嘗試下一個模型，直接拋出
      if (!errorMsg.includes("404") && !errorMsg.includes("not found")) {
        break;
      }
      console.warn(`[Gemini] Model ${modelName} failed with 404, trying next...`);
    }
  }

  // 如果走到這，代表所有嘗試都失敗了
  console.error("Gemini API Final Error:", lastError);
  const finalErrorMsg = lastError?.message || "";
  if (finalErrorMsg.includes("API_KEY_INVALID")) {
    throw new Error("Gemini API 金鑰無效，請檢查是否複製正確。");
  } else if (finalErrorMsg.includes("QUOTA_EXCEEDED")) {
    throw new Error("已達到免費版 API 使用限額，請稍後再試。");
  } else if (finalErrorMsg.includes("SAFETY")) {
    throw new Error("影片內容觸發了安全過濾器，AI 拒絕分析。");
  }
  throw new Error(`分析失敗: ${finalErrorMsg || "所有模型嘗試均失敗，請檢查 API 設定"}`);
};
