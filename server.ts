import express from "express";
import { createServer as createViteServer } from "vite";
import { YoutubeTranscript } from 'youtube-transcript';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route to fetch YouTube transcript and title
  app.get("/api/transcript", async (req, res) => {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      return res.status(400).json({ error: "Missing URL parameter" });
    }

    const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    const videoId = videoIdMatch ? videoIdMatch[1] : videoUrl;
    
    console.log(`[Server] Processing Video ID: ${videoId}`);

    try {
      const SUPADATA_API_KEY = (req.headers['x-supadata-key'] as string) || process.env.SUPADATA_API_KEY;
      
      if (!SUPADATA_API_KEY) {
        throw new Error("尚未設定 Supadata API Key。請在設定頁面中填入。");
      }

      // Fetch transcript using Supadata
      const transcriptResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`, {
        headers: { 'x-api-key': SUPADATA_API_KEY }
      });

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        throw new Error(`Supadata error: ${errorText}`);
      }

      const transcriptData = await transcriptResponse.json() as { content: { text: string }[] };
      
      if (!transcriptData || !transcriptData.content) {
        throw new Error("無法取得影片逐字稿，請確認影片是否有字幕。");
      }

      const fullText = transcriptData.content.map(item => item.text).join(' ');
      console.log(`[Server] Transcript fetched successfully via Supadata. Length: ${fullText.length}`);

      // Try to fetch video title via oEmbed (no API key needed)
      let title = "YouTube Video";
      try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const oEmbedResponse = await fetch(oEmbedUrl);
        if (oEmbedResponse.ok) {
          const oEmbedData = await oEmbedResponse.json() as { title: string };
          title = oEmbedData.title;
        }
      } catch (e) {
        console.warn("Failed to fetch title via oEmbed", e);
      }

      res.json({ 
        transcript: fullText,
        title: title,
        videoId: videoId
      });
    } catch (error: any) {
      if (error.message?.includes('Transcript is disabled') || error.message?.includes('No transcript found')) {
        return res.json({ 
          transcript: null, 
          title: "YouTube Video (No Transcript)", 
          videoId: videoId,
          error: "TRANSCRIPT_DISABLED"
        });
      }
      console.error("Transcript error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch transcript." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
