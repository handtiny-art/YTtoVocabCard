
import { GoogleGenAI } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("找不到 API_KEY。請確保 Vercel 環境變數已設定且已重新部署。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    I need you to analyze this specific YouTube video: ${url}
    
    STEP 1: Use Google Search to find the EXACT content, transcript, or detailed summary of this video.
    STEP 2: Based on the video content, identify 10-12 advanced English vocabulary words used in it.
    STEP 3: Format your ENTIRE response as a valid JSON object ONLY. Do not add markdown backticks like \`\`\`json.
    
    JSON Structure:
    {
      "detectedTitle": "Full Video Title",
      "summary": "A detailed 150-word summary of the video content in English.",
      "vocabulary": [
        {
          "word": "word",
          "partOfSpeech": "n/v/adj/adv",
          "translation": "Traditional Chinese translation",
          "example": "The specific sentence from the video containing this word"
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
        // We avoid responseMimeType: "application/json" here because it often conflicts with grounding tools
      }
    });

    const responseText = response.text || "";
    
    // Attempt to find JSON in the response (sometimes models wrap it in markdown)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Raw response:", responseText);
      throw new Error("AI 回傳格式不正確，無法解析單字資訊。");
    }

    const result = JSON.parse(jsonMatch[0]);
    
    // Extract Grounding Sources as required by rules
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            title: chunk.web.title || "參考來源",
            url: chunk.web.uri
          });
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
    console.error("Gemini Service Error:", error);
    throw error;
  }
};
