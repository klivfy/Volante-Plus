# Volante+ Web/PWA Release

This directory contains the production-ready build of the Volante+ PWA (Progressive Web App) for lottery analysis and game generation.

## Build Contents

- `.next/` — Next.js server-side and static builds
- `manifest.json` — PWA manifest for app metadata, icons, and display mode
- `sw.js` — Service Worker for offline functionality and caching
- `worker-*.js` — Custom Web Worker for background computations (backtesting)
- `icon-*.png` — App icons (144x144, 192x192, 512x512 with maskable support)
- `workbox-*.js` — Workbox libraries for advanced caching strategies

## Deployment Options

### 1. Vercel (Recommended for Next.js)

```bash
npm install -g vercel
vercel --prod
```

**Setup:**
- Connect your GitHub repository to Vercel
- Vercel auto-detects Next.js and configures environment variables
- Environment variables (`.env.production`):
  - `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` — Plausible Analytics domain
  - `NEXT_PUBLIC_SENTRY_DSN` — Sentry crash reporting endpoint
  - `NEXT_PUBLIC_APP_VERSION` — Semantic version (e.g., 2.0.0)

### 2. Netlify

```bash
npm install -g netlify-cli
netlify deploy --prod
```

**Configuration (`netlify.toml`):**
```toml
[build]
  command = "npm run build"
  publish = ".next"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 3. Docker (Custom Deployment)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY .next ./
COPY public ./public
COPY package.json ./
RUN npm install --production
EXPOSE 3000
CMD ["npm", "start"]
```

### 4. Traditional Static Hosting (GitHub Pages, Cloudflare Pages)

For static export, configure `next.config.ts`:
```typescript
export default {
  output: 'export',
  // ... other config
}
```

Then deploy the `out/` directory.

## PWA Features

- **Offline Mode** — Service Worker caches critical assets for offline gameplay
- **Install Prompt** — Users can "Add to Home Screen" on mobile and desktop
- **Custom Worker** — Background backtest analysis without blocking UI
- **Responsive Design** — Adapts to mobile (portrait), tablet, and desktop screens
- **Push Notifications** — Opt-in notifications for new lottery draws

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Analytics tracking domain | `app.volante.com.br` |
| `NEXT_PUBLIC_PLAUSIBLE_API_HOST` | Custom Plausible endpoint | `https://plausible.io/js/script.js` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking | `https://key@sentry.io/project` |
| `NEXT_PUBLIC_APP_VERSION` | Semantic version for Sentry releases | `2.0.0` |

## Performance & Compliance

- **PWA Audit** — Run Lighthouse: `npx lighthouse https://app.volante.com.br --preset=mobile`
- **GDPR Compliance** — Plausible Analytics is GDPR-compliant (no cookies required)
- **CSP Headers** — Configure Content Security Policy to allow:
  - `plausible.io` (analytics)
  - `sentry.io` (error tracking)
  - `https:` for Web Worker communication

## Security Recommendations

1. Set `NODE_ENV=production` on deployment
2. Enable HTTPS (required for PWA service worker)
3. Use environment variables for secrets (never commit `.env.local`)
4. Enable source map upload to Sentry for debugging (requires `SENTRY_AUTH_TOKEN`)
5. Configure CORS headers if API calls cross origins

## Testing Before Deploy

```bash
# Build locally
npm run build

# Run production server locally
npm start

# Open http://localhost:3000 in browser
# Test: offline mode (DevTools → Network → Offline)
# Test: install prompt (DevTools → Application → Manifest)
# Test: Web Worker (DevTools → Sources → worker-*.js)
```

## Troubleshooting

### Service Worker Not Activating
- Clear browser cache (`Ctrl+Shift+Delete`)
- Force refresh (`Ctrl+F5`)
- Check DevTools → Application → Service Workers

### Analytics Not Recording
- Verify `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` matches your domain
- Check browser DevTools → Network for `plausible.io` requests

### Errors Not Reporting to Sentry
- Verify `NEXT_PUBLIC_SENTRY_DSN` is set
- Check that source maps are uploaded (requires `SENTRY_AUTH_TOKEN`)
- Check Sentry project settings for allowed origins

## Support

For deployment questions or PWA issues, refer to:
- Next.js Deployment: https://nextjs.org/docs/deployment
- PWA Documentation: https://web.dev/progressive-web-apps/
- Service Worker Debugging: https://web.dev/service-workers/

---

**Built with Next.js 16 + PWA + TypeScript + Material-UI**

Release Date: 2026-07-31
Version: 2.0.0
