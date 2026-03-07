import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { MetadataStore, UserMetadata } from "../store/metadataStore.js";

interface SessionTokenPayload {
  userId: string;
}

export function createSessionToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "30d" });
}

export function readSessionToken(req: Request): SessionTokenPayload | null {
  const token = req.cookies?.pc_session as string | undefined;
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as SessionTokenPayload;
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const session = readSessionToken(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const store = req.app.locals.metadataStore as MetadataStore;
  const user = await store.getUserByUserId(session.userId);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.user = user;
  next();
}

declare global {
  namespace Express {
    interface Request {
      user?: UserMetadata;
    }
  }
}
