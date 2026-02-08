
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  // 優先讀取 App.tsx 注入到全域的金鑰，這才是使用者在 UI 輸入的那把
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 API 金鑰。請點擊右上角「🔑 設定」並貼上正確的金鑰。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    I need you to perform a deep analysis of this YouTube video: ${url}
    
    SEARCH STRATEGY:
    1. Identify the YouTube Video ID from the URL.
    2. Search for the exact video title and channel name to understand the context.
    
    OUTPUT REQUIREMENTS:
    - detectedTitle: Official title of the video.
    - summary: A cohesive summary (around 150 words) in Traditional Chinese.
    - vocabulary: 10-12 practical or advanced English words/idioms found in the video.
    
    Provide everything in a structured JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 },
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
      detectedTitle: result.detectedTitle,
      cards,
      sources
    };
  } catch (error: any) {
    console.error("Gemini Failure:", error);
    throw new Error(error.message || "分析失敗，請檢查金鑰權限或網路連線。");
  }
};
