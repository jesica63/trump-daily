import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  let cachedData: any = null;
  let lastFetchTime = 0;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  app.get("/api/truth-social", async (req, res) => {
    try {
      const now = Date.now();
      if (!cachedData || now - lastFetchTime > CACHE_DURATION) {
        console.log("Fetching fresh data from CNN...");
        const response = await axios.get("https://ix.cnn.io/data/truth-social/truth_archive.json", {
          timeout: 10000, // 10 seconds timeout
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        let data = response.data;
        
        // Handle potential large data or different structures
        if (Array.isArray(data)) {
          console.log(`Received array with ${data.length} items`);
          cachedData = data.slice(0, 200); // Limit to 200 for performance
        } else if (data && typeof data === 'object') {
          console.log("Received object with keys:", Object.keys(data));
          const posts = data.posts || data.archive || data.data || [];
          cachedData = Array.isArray(posts) ? posts.slice(0, 200) : [];
        } else {
          cachedData = [];
        }
        
        lastFetchTime = now;
      }
      res.json(cachedData);
    } catch (error) {
      console.error("Error fetching data:", error);
      res.status(500).json({ error: "Failed to fetch data from source" });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
