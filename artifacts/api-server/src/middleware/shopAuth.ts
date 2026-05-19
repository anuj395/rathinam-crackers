import type { Request, Response, NextFunction } from "express";
import { verifyShopToken } from "../lib/auth.js";

export interface ShopAuthRequest extends Request {
  customer?: { id: string };
}

export function shopAuthenticate(req: ShopAuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Login required" } });
    return;
  }
  try {
    const payload = verifyShopToken(auth.slice(7));
    req.customer = { id: payload.id };
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
  }
}
