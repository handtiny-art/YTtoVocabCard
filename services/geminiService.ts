
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 API 金鑰。請點擊右上角「🔑 設定」並貼上正確的金鑰。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // 使用 Gemini 3 Flash：速度最快、對免費金鑰最寬容
  const model = 'gemini-3-flash-preview';
  
  const systemInstruction = `你是一位頂尖的英語教學 AI 專家。
你的特殊能力是能夠透過 Google Search 獲取 YouTube 影片的詳細逐字稿 (Transcript) 或分段摘要內容。
你必須確保提取的單字與影片實際內容高度相關。`;

  const prompt = `
    請分析此 YouTube 影片：${url}
    
    你的任務步驟：
    1. 首先，使用 Google Search 尋找該影片的完整逐字稿或詳細內容描述。
    2. 找出影片的正式標題 (detectedTitle)。
    3. 撰寫一段約 150 字的中文化內容摘要 (summary)。
    4. 從內容中挑選 10 個最適合中高階學習者的單字或片語。
    5. 為每個單字提供：單字、詞性、精確翻譯、以及一個「完全符合影片情境」的英文例句。
    
    請以 JSON 格式輸出。
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
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
                  partOfSpeech: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  example: { type: Type.STRING }
                },
                required: ["word", "partOfSpeech", "translation", "example"]
              }
            }
          },
          required: ["detectedTitle", "summary", "vocabulary"]
        }
      }
    });

    const responseText = response.text || "";
    let result;
    try {
      result = JSON.parse(responseText.trim());
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI 回傳格式不正確。");
      result = JSON.parse(jsonMatch[0]);
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
      partOfSpeech: v.partOfSpeech,
      translation: v.translation,
      example: v.example,
      status: 'new'
    }));

    return {
      transcript: result.summary,
      detectedTitle: result.detectedTitle || "影片學習集",
      cards,
      sources
    };
  } catch (error: any) {
    console.error("Gemini Failure:", error);
    throw new Error(error.message || "分析失敗，請檢查金鑰權限。");
  }
};
