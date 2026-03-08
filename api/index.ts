import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
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

      console.log(`[Server] Fetching data for Video ID: ${videoId}`);

      // Parallelize transcript and title fetching
      const [transcriptResponse, oEmbedResponse] = await Promise.all([
        fetch(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`, {
          headers: { 'x-api-key': SUPADATA_API_KEY }
        }),
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`).catch(() => null)
      ]);

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        throw new Error(`Supadata error: ${errorText}`);
      }

      const transcriptData = await transcriptResponse.json() as { content: { text: string }[] };
      
      if (!transcriptData || !transcriptData.content) {
        throw new Error("無法取得影片逐字稿，請確認影片是否有字幕。");
      }

      const fullText = transcriptData.content.map(item => item.text).join(' ').substring(0, 10000);
      
      let title = "YouTube Video";
      if (oEmbedResponse && oEmbedResponse.ok) {
        const oEmbedData = await oEmbedResponse.json() as { title: string };
        title = oEmbedData.title;
      }

      console.log(`[Server] Success. Transcript length: ${fullText.length}`);

      res.json({ 
        transcript: fullText,
        title: title,
        videoId: videoId
      });
    } catch (error: any) {
      console.error("Transcript error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch transcript." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    const distPath = path.resolve(__dirname, "../dist");
    app.use(express.static(distPath));
    
    app.get("(.*)", (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

const appPromise = createServer();

// For local development
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  appPromise.then(app => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  });
}

// Export for Vercel
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
