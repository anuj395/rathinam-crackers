import { Router, type IRouter } from "express";
import multer from "multer";
import sharp from "sharp";
import { customAlphabet } from "nanoid";
import { promises as fs } from "node:fs";
import path from "node:path";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { db, mediaTable } from "@workspace/db";
import { uploadToS3, deleteFromS3, s3PublicUrl, REGION as S3_REGION, getPresignedGetUrl } from "../../lib/s3.js";
import { desc, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

/**
 * UPLOAD_DIR resolution:
 *   - In production we set this to /opt/rathinam/uploads (see deploy/install.sh).
 *   - In dev we fall back to artifacts/api-server/.local/uploads so the same
 *     code path works without root permissions.
 * The directory is created on first import — failure here would crash the
 * server early, which is exactly what we want.
 */
const UPLOAD_DIR =
  process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.length > 0
    ? process.env.UPLOAD_DIR
    : path.resolve(process.cwd(), ".local/uploads");

/**
 * Lazy directory bootstrap. We do NOT `await fs.mkdir` at module top-level
 * because that would block the entire ESM import graph — if /opt/rathinam/
 * uploads is missing or read-only the server would refuse to start, taking
 * down all 30+ unrelated routes with it. Instead we ensure the directory
 * exists on the first upload (cached after the first success) and surface
 * any failure as a clean 500 to that one request.
 */
let uploadDirReady = false;
async function ensureUploadDir(): Promise<void> {
  if (uploadDirReady) return;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  uploadDirReady = true;
}

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

// Optional base URL for public S3/CloudFront usage. If set, this value
// will be used to construct public object URLs (useful for custom domains
// or CloudFront fronting the S3 bucket). Trailing slash is removed.
const S3_BASE_URL = (process.env.AWS_S3_BASE_URL ?? "").replace(/\/$/, "");

// Anything bigger than 8 MB is almost certainly an unoptimised camera dump —
// reject early so we don't bloat the disk. Sharp will further re-encode and
// usually shrink the on-disk copy by 50-70 % anyway.
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_TYPE"));
      return;
    }
    cb(null, true);
  },
});

// Roles allowed to manage the media library. Cashiers can VIEW (so the POS can
// render product images) but only managers/admins can upload or delete.
const READERS = ["SUPER_ADMIN", "ADMIN", "ERP_MANAGER", "MANAGER", "ACCOUNTANT", "WH_MANAGER", "CASHIER"] as const;
const WRITERS = ["SUPER_ADMIN", "ADMIN", "ERP_MANAGER", "MANAGER", "WH_MANAGER"] as const;

router.get(
  "/media",
  authenticate,
  requireRole(...READERS),
  async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const folder = typeof req.query.folder === "string" ? req.query.folder : null;
    const [rows, totalRow] = await Promise.all([
      folder
        ? db.select().from(mediaTable).where(eq(mediaTable.folder, folder)).orderBy(desc(mediaTable.createdAt)).limit(limit).offset(offset)
        : db.select().from(mediaTable).orderBy(desc(mediaTable.createdAt)).limit(limit).offset(offset),
      db.select({ n: sql<number>`count(*)::int` }).from(mediaTable),
    ]);

    // If uploads are stored in S3, return URLs the frontend can fetch.
    // Behavior controlled by `AWS_S3_PUBLIC` env var:
    //  - if `AWS_S3_PUBLIC=true` return the public S3 object URL
    //  - otherwise return presigned GET URLs (default, secure)
    const USE_S3 = Boolean(process.env.AWS_S3_BUCKET && process.env.AWS_S3_BUCKET.length > 0);
    const S3_PUBLIC = String(process.env.AWS_S3_PUBLIC ?? "false").toLowerCase() === "true";
    let outRows = rows;
    if (USE_S3 && rows.length > 0) {
      const bucket = process.env.AWS_S3_BUCKET!;
      outRows = await Promise.all(
        rows.map(async (r: any) => {
          try {
            // If the DB already contains an absolute URL (http/https), respect it.
            if (typeof r.url === "string" && /^https?:\/\//.test(r.url)) {
              return r;
            }

            // If an explicit base URL is provided, prefer it for returned URLs
            if (S3_BASE_URL.length > 0) {
              const pub = `${S3_BASE_URL}/${r.filename}`;
              const thumb = `${S3_BASE_URL}/${r.filename.replace(/\.webp$/, "_thumb.webp")}`;
              return { ...r, url: pub, thumbnailUrl: thumb };
            }
            if (S3_PUBLIC) {
              const pub = s3PublicUrl(bucket, S3_REGION, r.filename);
              const thumb = s3PublicUrl(bucket, S3_REGION, r.filename.replace(/\.webp$/, "_thumb.webp"));
              return { ...r, url: pub, thumbnailUrl: thumb };
            }

            // Private bucket: presign the stored logical path (we use filename)
            const presigned = await getPresignedGetUrl(bucket, r.filename, 3600);
            const thumb = await getPresignedGetUrl(bucket, r.filename.replace(/\.webp$/, "_thumb.webp"), 3600);
            return { ...r, url: presigned, thumbnailUrl: thumb };
          } catch (err) {
            req.log.warn({ err, key: r.filename }, "presign/public URL failed, falling back to stored urls");
            return r;
          }
        }),
      );
    }

    res.json({ success: true, data: outRows, total: totalRow[0]?.n ?? 0, limit, offset });
  },
);

router.post(
  "/media",
  authenticate,
  requireRole(...WRITERS),
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const e = err as { code?: string; message?: string };
        const code =
          e.code === "LIMIT_FILE_SIZE"
            ? "FILE_TOO_LARGE"
            : e.message === "UNSUPPORTED_TYPE"
              ? "UNSUPPORTED_TYPE"
              : "UPLOAD_ERROR";
        const status = code === "FILE_TOO_LARGE" ? 413 : code === "UNSUPPORTED_TYPE" ? 415 : 400;
        res.status(status).json({ success: false, error: { code, message: e.message ?? "Upload failed" } });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res) => {
    const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ success: false, error: { code: "NO_FILE", message: "Attach a file in the 'file' field" } });
      return;
    }

    try {
      await ensureUploadDir();
    } catch (err) {
      req.log.error({ err, dir: UPLOAD_DIR }, "upload directory not writable");
      res.status(500).json({ success: false, error: { code: "STORAGE_UNAVAILABLE", message: "Media storage is not configured. Ask an administrator to check UPLOAD_DIR permissions." } });
      return;
    }

    // `folder` is a LOGICAL bucket only — it's stored in the DB so the
    // library UI can filter (e.g. "products" vs "banners") but it never
    // touches the filesystem. The on-disk layout is intentionally flat
    // with nanoid(12) filenames so we never have to think about path
    // traversal, case sensitivity, or directory-scan cost.
    const folder = (typeof req.body?.folder === "string" && req.body.folder) || "uploads";
    const altText = typeof req.body?.altText === "string" ? req.body.altText : null;

    // Re-encode to webp for the canonical copy + a 400px wide thumb. This
    // strips EXIF, normalises orientation, and shrinks file size dramatically.
    const baseName = nanoid();
    const fullName = `${baseName}.webp`;
    const thumbName = `${baseName}_thumb.webp`;
    const fullPath = path.join(UPLOAD_DIR, fullName);
    const thumbPath = path.join(UPLOAD_DIR, thumbName);

    let width = 0;
    let height = 0;
    let fullBytes = 0;
    try {
      const pipeline = sharp(file.buffer, { failOn: "none" }).rotate();
      const meta = await pipeline.metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;

      // Cap full-size at 2000px on the long edge — anything larger is wasted
      // bandwidth for product photos in a web/POS context.
      const fullBuf = await pipeline.clone().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const thumbBuf = await pipeline.clone().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();

      const USE_S3 = Boolean(process.env.AWS_S3_BUCKET && process.env.AWS_S3_BUCKET.length > 0);
      const S3_PUBLIC = String(process.env.AWS_S3_PUBLIC ?? "false").toLowerCase() === "true";
      if (USE_S3) {
        const bucket = process.env.AWS_S3_BUCKET!;
        await uploadToS3(bucket, fullName, fullBuf, "image/webp");
        await uploadToS3(bucket, thumbName, thumbBuf, "image/webp");
        fullBytes = fullBuf.length;
      } else {
        await fs.writeFile(fullPath, fullBuf);
        await fs.writeFile(thumbPath, thumbBuf);
        fullBytes = fullBuf.length;
      }
    } catch (err) {
      req.log.error({ err }, "media upload encode failed");
      res.status(400).json({ success: false, error: { code: "ENCODE_FAILED", message: "Could not process image — is it corrupt?" } });
      return;
    }

    const USE_S3 = Boolean(process.env.AWS_S3_BUCKET && process.env.AWS_S3_BUCKET.length > 0);
    const S3_PUBLIC = String(process.env.AWS_S3_PUBLIC ?? "false").toLowerCase() === "true";
    let url: string;
    let thumbnailUrl: string;
    if (USE_S3) {
      const bucket = process.env.AWS_S3_BUCKET!;
      // Prefer an explicit S3 base URL when provided. This allows using
      // a custom domain or the S3 bucket URL from env (e.g. https://rathinam-media.s3....)
      if (S3_BASE_URL.length > 0) {
        url = `${S3_BASE_URL}/${fullName}`;
        thumbnailUrl = `${S3_BASE_URL}/${thumbName}`;
      } else if (S3_PUBLIC) {
        // If the bucket is public and no base URL provided, construct the S3 URL
        url = s3PublicUrl(bucket, S3_REGION, fullName);
        thumbnailUrl = s3PublicUrl(bucket, S3_REGION, thumbName);
      } else {
        // private bucket: store a stable logical path and presign on read
        url = `/uploads/${fullName}`;
        thumbnailUrl = `/uploads/${thumbName}`;
      }
    } else {
      url = `/uploads/${fullName}`;
      thumbnailUrl = `/uploads/${thumbName}`;
    }

    const [row] = await db
      .insert(mediaTable)
      .values({
        filename: fullName,
        originalName: file.originalname,
        mimeType: "image/webp",
        sizeBytes: fullBytes,
        width,
        height,
        url,
        thumbnailUrl,
        folder,
        altText,
        createdBy: req.user?.id ?? null,
      })
      .returning();

    res.status(201).json({ success: true, data: row });
  },
);

router.delete(
  "/media/:id",
  authenticate,
  requireRole(...WRITERS),
  async (req: AuthRequest, res) => {
    const id = String(req.params.id);
    const [row] = await db.select().from(mediaTable).where(eq(mediaTable.id, id)).limit(1);
    if (!row) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Media not found" } });
      return;
    }

    // Best-effort unlink — if the file is already gone (manual cleanup, disk
    // wipe, etc.) we still want the row deletion to succeed.
    const USE_S3 = Boolean(process.env.AWS_S3_BUCKET && process.env.AWS_S3_BUCKET.length > 0);
    for (const name of [row.filename, row.filename.replace(/\.webp$/, "_thumb.webp")]) {
      if (USE_S3) {
        try {
          await deleteFromS3(process.env.AWS_S3_BUCKET!, name);
        } catch (err) {
          req.log.warn({ err, key: name }, "s3 delete skipped");
        }
      } else {
        const p = path.join(UPLOAD_DIR, name);
        try {
          await fs.unlink(p);
        } catch (err) {
          req.log.warn({ err, path: p }, "media file unlink skipped");
        }
      }
    }

    await db.delete(mediaTable).where(eq(mediaTable.id, String(id)));
    res.json({ success: true, data: { id } });
  },
);

export default router;
export { UPLOAD_DIR };
