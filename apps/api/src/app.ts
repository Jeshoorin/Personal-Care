import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createDietRoutes } from "./routes/dietRoutes.js";
import { createExerciseRoutes } from "./routes/exerciseRoutes.js";
import { createHabitRoutes } from "./routes/habitRoutes.js";
import { createMeRoutes } from "./routes/meRoutes.js";
import { createProfileRoutes } from "./routes/profileRoutes.js";
import { createReminderRoutes } from "./routes/reminderRoutes.js";
import { GamificationService } from "./services/gamificationService.js";
import { SheetsService } from "./services/sheetsService.js";
import { getMetadataStore } from "./store/index.js";

export async function createApp() {
  const app = express();
  const metadataStore = await getMetadataStore();
  const sheetsService = new SheetsService();
  const gamificationService = new GamificationService(sheetsService);

  app.locals.metadataStore = metadataStore;

  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", createAuthRoutes(metadataStore, sheetsService));
  app.use("/me", createMeRoutes());
  app.use("/diet", createDietRoutes(sheetsService, gamificationService));
  app.use("/exercise", createExerciseRoutes(sheetsService, gamificationService));
  app.use("/", createHabitRoutes(sheetsService, gamificationService));
  app.use("/profile", createProfileRoutes(sheetsService, gamificationService));
  app.use("/", createReminderRoutes(metadataStore, sheetsService, gamificationService));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ error: message });
  });

  return app;
}
