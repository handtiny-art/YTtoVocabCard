
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 API 金鑰。請點擊右上角「🔑 設定」並貼上正確的金鑰。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // 強化指令：強制模型必須「鎖定」該特定的 URL 進行深度搜尋，而非僅靠標題關鍵字
  const systemInstruction = `你是一位專業的英文教育專家。
你的任務是「精確且唯一地」分析使用者提供的 YouTube 連結：${url}。

工作規範：
1. 嚴禁抓取標題相似但內容不同的影片。你必須利用 Google Search 驗證該 URL 的實際標題與內容摘要。
2. 產生一段約 150 字的繁體中文內容摘要 (summary)，內容必須與該影片百分之百相符。
3. 從影片的實際對話或主題中，挑選 10 個高品質單字/片語 (B2-C2 等級)。
4. 每個單字必須包含：詞性、精確的中文化翻譯、以及「完全符合該影片語境」的英文例句。

輸出規範：
- 必須嚴格遵守 JSON 格式。
- 語系：繁體中文 (台灣)。
- 若無法存取該特定連結，請明確回傳錯誤。`;

  const prompt = `請針對此特定影片連結進行深度分析並提取單字卡：${url}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 },
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
      detectedTitle: result.detectedTitle,
      cards,
      sources
    };
  } catch (error: any) {
    console.error("Gemini Failure:", error);
    throw new Error(error.message || "分析失敗，這可能是因為該影片受限或 AI 無法精確鎖定內容。");
  }
};
