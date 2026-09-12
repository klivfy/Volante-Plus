# Lighthouse PWA Audit Report

## Summary

This document captures PWA readiness metrics for the Volante+ application. Run these tests in your deployment environment to verify production-ready status.

## Audit Checklist

### ✅ Manifest Validation (Automated)
- [x] `manifest.json` is valid JSON
- [x] `name` field present: "Volante+"
- [x] `short_name` field present: "Volante+"
- [x] `start_url` set to "/" (or deployment root)
- [x] `display` mode is "standalone"
- [x] Theme color defined: #6750A4
- [x] Background color defined: #FFFBFE
- [x] Icons present in multiple sizes (144×144, 192×192, 512×512)
- [x] Maskable icon variant provided

### ✅ Service Worker (Automated)
- [x] Service Worker file present (sw.js)
- [x] Install event handler implemented
- [x] Activate event handler implemented
- [x] Fetch event handler (cache strategy) implemented
- [x] Service Worker registerable from main app

### ✅ Web Worker (Automated)
- [x] Custom Web Worker present for background tasks
- [x] Message handler implemented
- [x] Supports backtest computation without blocking UI

### ✅ Security & HTTPS (Manual Verification Required)
- [ ] Site is served over HTTPS (required for SW activation)
- [ ] CSP headers configured to allow Sentry and Plausible
- [ ] No mixed content warnings (all resources are HTTPS)
- [ ] Certificate is valid and not self-signed in production

## How to Run Lighthouse Audit

### Option 1: Local Testing (Before Deployment)

```bash
# Start Next.js server locally
npm start

# In another terminal, run Lighthouse
npx lighthouse http://localhost:3000 \
  --preset=mobile \
  --output=html \
  --output-path=lighthouse-report.html
```

### Option 2: Production Testing

```bash
npx lighthouse https://your-deployed-domain.com \
  --preset=mobile \
  --output=html \
  --output-path=lighthouse-report.html
```

### Option 3: GitHub Actions (CI/CD Integration)

Add to `.github/workflows/lighthouse-ci.yml`:

```yaml
name: Lighthouse CI

on: [push, pull_request]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci && npm run build
      - name: Run Lighthouse
        run: |
          npx lighthouse \
            http://localhost:3000 \
            --preset=mobile \
            --output-path=report.html
```

## Expected Audit Scores

| Category | Target | Priority |
|----------|--------|----------|
| **Performance** | 85+ | High |
| **Accessibility** | 90+ | Medium |
| **Best Practices** | 90+ | Medium |
| **SEO** | 90+ | Medium |
| **PWA** | 90+ | High |

## Performance Optimizations

### Already Implemented
- ✓ Next.js static optimization
- ✓ Service Worker caching (Workbox)
- ✓ Image optimization (Next.js Image component)
- ✓ Code splitting per route
- ✓ Web Worker for background computation

### Recommendations for Further Optimization
- [ ] Enable gzip compression (Vercel/Netlify auto-enable)
- [ ] Add cache headers to static assets (`Cache-Control: max-age=31536000`)
- [ ] Enable Brotli compression for text assets
- [ ] Reduce JavaScript bundle size with dynamic imports
- [ ] Lazy-load non-critical UI components

## Common PWA Issues & Fixes

### Issue 1: Service Worker Not Activating
**Symptoms:** Offline mode doesn't work, DevTools shows pending SW
**Solution:**
```bash
# Clear browser cache
# Hard refresh: Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
# Or in DevTools → Application → Service Workers → Unregister
```

### Issue 2: Manifest Not Found
**Symptoms:** No install prompt on mobile
**Solution:** Ensure `manifest.json` is in the `public/` directory and linked in `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
```

### Issue 3: Icons Not Loading
**Symptoms:** PWA displays generic icon on home screen
**Solution:**
- Verify icon files exist in `public/`
- Ensure manifest has correct `src` paths (absolute: `/icon-*.png`)
- Icons must be PNG format, at least 192×192

### Issue 4: Mixed Content Warning
**Symptoms:** Console shows "Mixed Content: The page was loaded over HTTPS, but requested an insecure resource"
**Solution:**
- Ensure all external URLs use `https://`
- Check analytics (Plausible) and error tracking (Sentry) domains
- Enable HSTS headers on server

## Monitoring & Maintenance

### Monthly Checks
- [ ] Run Lighthouse audit on production
- [ ] Review Sentry error reports
- [ ] Check Plausible analytics data
- [ ] Monitor Core Web Vitals (CWV)

### After Updates
- [ ] Re-run Lighthouse after major dependency updates
- [ ] Test offline mode in Safari (iOS PWA is different)
- [ ] Verify Service Worker version bump didn't break caching

## Resources

- [Web.dev PWA Checklist](https://web.dev/pwa-checklist/)
- [MDN Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Lighthouse Documentation](https://developers.google.com/web/tools/lighthouse)
- [PWA Manifest Spec](https://www.w3.org/TR/appmanifest/)

---

**Last Updated:** 2026-07-31
**Next Audit Recommended:** 2026-08-31 (Monthly)
