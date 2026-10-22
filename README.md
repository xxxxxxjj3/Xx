# xxx Video — Professional runnable website

A responsive video website with public video playback, search, categories, admin-only uploads, thumbnail support, persistent server-side files, and admin deletion.

## Important: the site stores uploads on the server disk

Uploaded video files are stored under `uploads/videos/`, thumbnails under `uploads/thumbnails/`, and the video catalog under `data/videos.json`. Sessions are stored in SQLite under `data/`. The uploaded files remain after a normal server restart **as long as the server's disk is persistent**.

For a public production site, deploy to a server/host with persistent disk storage. Some free hosting services erase local files when the app restarts or redeploys. For a larger public audience, use object storage (for example S3-compatible storage) and a database.

## Requirements

- Node.js 20 or newer
- A computer or server where you can run Node.js

## 1. Configure admin login

1. Copy `.env.example` to a file named `.env`.
2. Create a bcrypt password hash. In the project folder run:

   ```bash
   node -e "console.log(require('bcryptjs').hashSync('PUT_A_NEW_LONG_UNIQUE_PASSWORD_HERE', 12))"
   ```

3. Put the generated hash into `ADMIN_PASSWORD_HASH` in `.env`.
4. Set `ADMIN_EMAIL` to your admin Gmail. **Do not put your plain password in `.env`, HTML, or JavaScript.**
5. Set `SESSION_SECRET` to a long random secret (at least 32 characters). Example generator:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

Do not reuse a password that was previously posted in a chat. Use a new, unique password.

## 2. Install and run

From this project folder:

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Visit **Admin Login**, sign in, then upload a video and optional thumbnail.

## 3. Publish online

Upload this whole project to a Node.js host that supports persistent disk storage, set the environment variables in the host's dashboard, use `npm install` as the install command and `npm start` as the start command, and attach persistent storage for the project directory (especially `uploads/` and `data/`). Use HTTPS in production.

Do not commit `.env` to GitHub or share it. The included `.gitignore` excludes it.

## Limits and supported files

- Default maximum video size: 500 MB; change `MAX_VIDEO_MB` in `.env`.
- Video MIME types accepted: MP4, WebM, Ogg, MOV, MKV, AVI, MPEG (browser playback depends on codec).
- Thumbnails: JPEG, PNG, WebP, GIF.
- Anyone can watch public videos; only the authenticated admin can upload or delete.
- Admin login is rate-limited. Session cookie is HttpOnly and SameSite=Lax.

## Backup

Back up `data/videos.json`, `data/sessions.sqlite` if desired, and both `uploads/` directories. Keep backups private. The app does not automatically back up media.
