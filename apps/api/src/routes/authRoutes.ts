import { Router } from "express";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { encryptText } from "../lib/crypto.js";
import { createSessionToken } from "../middleware/auth.js";
import { GOOGLE_SCOPES, createOAuthClient } from "../services/googleOAuth.js";
import { SheetsService } from "../services/sheetsService.js";
import type { MetadataStore } from "../store/metadataStore.js";

export function createAuthRoutes(
  metadataStore: MetadataStore,
  sheetsService: SheetsService
) {
  const router = Router();

  router.get("/google/start", async (_req, res) => {
    if (!env.hasGoogleOAuth) {
      res.status(500).json({
        error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI."
      });
      return;
    }

    const client = createOAuthClient();
    const state = uuidv4();
    const url = client.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      prompt: "consent",
      state
    });
    res.redirect(url);
  });

  router.get("/google/callback", async (req, res) => {
    try {
      const code = String(req.query.code ?? "");
      if (!code) {
        res.status(400).json({ error: "Missing OAuth code." });
        return;
      }

      const client = createOAuthClient();
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) {
        res.status(400).json({
          error:
            "Google did not provide a refresh token. Revoke app access and retry consent."
        });
        return;
      }
      client.setCredentials(tokens);

      const oauth = google.oauth2({ version: "v2", auth: client });
      const profile = await oauth.userinfo.get();
      const googleSub = profile.data.id;
      const email = profile.data.email;
      const name = profile.data.name;

      if (!googleSub || !email || !name) {
        res.status(400).json({ error: "Google profile did not include required fields." });
        return;
      }

      const userId = googleSub;
      const encryptedToken = encryptText(tokens.refresh_token, env.ENCRYPTION_KEY);
      const user = await metadataStore.upsertUser({
        userId,
        googleSub,
        email,
        name,
        encryptedRefreshToken: encryptedToken
      });
      const spreadsheetId = await sheetsService.ensureSpreadsheetForUser(
        user,
        tokens.refresh_token
      );
      await metadataStore.updateSpreadsheetId(userId, spreadsheetId);

      const session = createSessionToken(userId);
      res.cookie("pc_session", session, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30
      });
      res.redirect(`${env.WEB_ORIGIN}/auth/success`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth callback failed";
      res.status(500).json({ error: message });
    }
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie("pc_session");
    res.status(204).send();
  });

  return router;
}
