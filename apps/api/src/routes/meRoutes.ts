import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export function createMeRoutes() {
  const router = Router();
  router.get("/", requireAuth, (req, res) => {
    const user = req.user!;
    res.json({
      userId: user.userId,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      spreadsheetId: user.spreadsheetId
    });
  });
  return router;
}
