import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/recommend-worker", async (req, res) => {
    try {
      const { task, workers, existingTasks, apiKey: customApiKey } = req.body;
      
      const apiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key is not set. Please configure it in System Maintenance." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `
You are an expert dispatcher and project manager. Your job is to recommend the best worker for a new task based on their skills, current schedule, and availability.

Task to assign:
Title: ${task.title}
Type: ${task.type}
Description: ${task.description}
Location: ${JSON.stringify(task.location)}

Available Workers:
${JSON.stringify(workers, null, 2)}

Existing Tasks (to check schedule conflicts):
${JSON.stringify(existingTasks, null, 2)}

Analyze the workers and find the one whose skills match the task type (${task.type}), and who has the fewest scheduling conflicts or is most available.

Return your recommendation as a JSON object with this schema:
{
  "recommendedWorkerId": "worker id string",
  "reasoning": "A short, professional explanation of why this worker was chosen (e.g. 'John has the required installer skills and his schedule is completely free today.')"
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendedWorkerId: { type: Type.STRING },
              reasoning: { type: Type.STRING }
            },
            required: ["recommendedWorkerId", "reasoning"]
          }
        }
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);

      res.json(result);
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/test-gemini-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: "API Key is required" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Quick test prompt
      await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: "Hello",
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Gemini Validation Error:", error);
      res.status(500).json({ error: error.message });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
