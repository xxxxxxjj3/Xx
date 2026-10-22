require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const VIDEO_DIR = path.join(ROOT, "uploads", "videos");
const THUMB_DIR = path.join(ROOT, "uploads", "thumbnails");
for (const dir of [DATA_DIR, VIDEO_DIR, THUMB_DIR]) fs.mkdirSync(dir, { recursive: true });

const DB_FILE = path.join(DATA_DIR, "videos.json");
function readVideos() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return []; }
}
function writeVideos(videos) {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(videos, null, 2));
  fs.renameSync(temp, DB_FILE);
}
const safeName = (name) => path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
const videoMimeExt = {
  "video/mp4": ".mp4", "video/webm": ".webm", "video/ogg": ".ogv",
  "video/quicktime": ".mov", "video/x-matroska": ".mkv",
  "video/x-msvideo": ".avi", "video/mpeg": ".mpeg"
};
const imageMimeExt = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

app.disable("x-powered-by");
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.warn("WARNING: Set SESSION_SECRET to a random value of at least 32 characters in .env.");
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH.startsWith("replace-")) {
  console.warn("WARNING: Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in .env before admin login will work.");
}
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
  name: "xxxvideo.sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) return next();
  return res.status(401).json({ error: "Please log in as admin first." });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === "video" ? VIDEO_DIR : THUMB_DIR),
  filename: (req, file, cb) => {
    const ext = (file.fieldname === "video" ? videoMimeExt : imageMimeExt)[file.mimetype];
    if (!ext) return cb(new Error("Unsupported file type."));
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: Math.max(1, Number(process.env.MAX_VIDEO_MB || 500)) * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const ok = file.fieldname === "video" ? Boolean(videoMimeExt[file.mimetype]) :
      file.fieldname === "thumbnail" ? Boolean(imageMimeExt[file.mimetype]) : false;
    cb(ok ? null : new Error("Unsupported file type. Use a supported video and image format."), ok);
  }
});

app.get("/api/config", (req, res) => res.json({ siteName: process.env.SITE_NAME || "xxx Video" }));
app.get("/api/me", (req, res) => res.json({ loggedIn: req.session?.isAdmin === true, email: req.session?.isAdmin ? process.env.ADMIN_EMAIL : null }));
app.get("/api/videos", (req, res) => {
  const videos = readVideos().map(({ id, title, description, category, thumbnail, filename, createdAt, size }) => ({
    id, title, description, category, thumbnail: thumbnail ? `/uploads/thumbnails/${encodeURIComponent(thumbnail)}` : null,
    url: `/uploads/videos/${encodeURIComponent(filename)}`, createdAt, size
  }));
  res.json(videos);
});
app.post("/api/login", loginLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!adminEmail || !hash || hash.startsWith("replace-") || email !== adminEmail || !(await bcrypt.compare(password, hash))) {
    return res.status(401).json({ error: "Gmail বা পাসওয়ার্ড সঠিক নয়।" });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not create secure session." });
    req.session.isAdmin = true;
    req.session.save(saveErr => saveErr ? res.status(500).json({ error: "Could not save session." }) : res.json({ ok: true }));
  });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => {
  res.clearCookie("xxxvideo.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  res.json({ ok: true });
}));
app.post("/api/videos", requireAdmin, upload.fields([{ name: "video", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), (req, res) => {
  const video = req.files?.video?.[0];
  const thumbnail = req.files?.thumbnail?.[0];
  if (!video) return res.status(400).json({ error: "ভিডিও ফাইল নির্বাচন করুন।" });
  const title = String(req.body.title || "").trim().slice(0, 120);
  if (!title) {
    fs.unlink(video.path, () => {});
    if (thumbnail) fs.unlink(thumbnail.path, () => {});
    return res.status(400).json({ error: "ভিডিওর নাম লিখুন।" });
  }
  const item = {
    id: crypto.randomUUID(), title, description: String(req.body.description || "").trim().slice(0, 5000),
    category: ["Cartoon", "Entertainment", "Education", "Gaming", "Sports", "Music", "Other"].includes(req.body.category) ? req.body.category : "Other",
    filename: safeName(video.filename), thumbnail: thumbnail ? safeName(thumbnail.filename) : null,
    size: video.size, createdAt: new Date().toISOString()
  };
  const videos = readVideos();
  videos.unshift(item);
  writeVideos(videos);
  res.status(201).json({ ok: true, video: item });
});
app.delete("/api/videos/:id", requireAdmin, (req, res) => {
  const videos = readVideos();
  const item = videos.find(v => v.id === req.params.id);
  if (!item) return res.status(404).json({ error: "ভিডিও পাওয়া যায়নি।" });
  writeVideos(videos.filter(v => v.id !== item.id));
  for (const file of [item.filename && path.join(VIDEO_DIR, safeName(item.filename)), item.thumbnail && path.join(THUMB_DIR, safeName(item.thumbnail))]) {
    if (file && fs.existsSync(file)) fs.unlink(file, () => {});
  }
  res.json({ ok: true });
});
app.use("/uploads/videos", express.static(VIDEO_DIR, { fallthrough: false, maxAge: "1h", setHeaders: res => res.setHeader("X-Content-Type-Options", "nosniff") }));
app.use("/uploads/thumbnails", express.static(THUMB_DIR, { fallthrough: false, maxAge: "1d" }));
app.use(express.static(path.join(ROOT, "public")));
app.get("*", (req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err.message);
  if (res.headersSent) return next(err);
  const status = err instanceof multer.MulterError ? (err.code === "LIMIT_FILE_SIZE" ? 413 : 400) : 400;
  res.status(status).json({ error: err.message || "Something went wrong." });
});
app.listen(PORT, () => console.log(`xxx Video running at http://localhost:${PORT}`));
