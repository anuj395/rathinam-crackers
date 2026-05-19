import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const RAW_SECRET = process.env["SESSION_SECRET"];
if (!RAW_SECRET || RAW_SECRET === "rathinam-secret" || RAW_SECRET.length < 16) {
  throw new Error(
    "SESSION_SECRET environment variable must be set to a strong, non-default value (>= 16 chars). Refusing to start with an insecure JWT signing secret.",
  );
}
const JWT_SECRET: string = RAW_SECRET;
const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: { id: string; role: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(payload: { id: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { id: string; role: string };
}

export function signShopToken(payload: { id: string }) {
  return jwt.sign({ ...payload, kind: "customer" }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyShopToken(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET) as { id: string; kind?: string };
  if (decoded.kind !== "customer") throw new Error("not a customer token");
  return decoded;
}
