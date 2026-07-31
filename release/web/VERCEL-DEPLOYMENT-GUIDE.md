# Vercel Deployment Guide - Volante+ PWA v2.0.0

**Date**: 2026-07-31
**App Version**: 2.0.0
**Status**: ✅ Ready for Vercel deployment

---

## Overview

Volante+ is a Next.js 16 PWA (Progressive Web App) with:
- ✅ Manifest V3 compatible service worker
- ✅ Offline-first architecture with IndexedDB cache
- ✅ Automatic lottery updates (every 60 minutes)
- ✅ Web Push notifications (optional)
- ✅ Plausible Analytics integration (optional)
- ✅ Sentry error tracking (optional)
- ✅ i18n support (Portuguese Brazil)

---

## Prerequisites

### Local Requirements
- Node.js 20.x or later
- npm or yarn package manager
- Git (for version control)
- Vercel account (https://vercel.com)

### Environment Variables Needed

#### Required
- `NEXT_PUBLIC_CAIXA_API_BASE_URL` — Lottery API endpoint
  - Default: `https://loteriascaixa-api.herokuapp.com/api`

#### Optional (Features)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — Web Push notifications
- `VAPID_PRIVATE_KEY` — Web Push (server-side)
- `PUSH_SEND_SECRET` — API authorization for push
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` — Analytics tracking
- `NEXT_PUBLIC_SENTRY_DSN` — Error tracking
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — Sentry config

---

## Deployment Methods

### Method 1: Vercel Dashboard (Recommended for First-Time)

#### Step 1: Connect Repository
1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Import GitHub repository `mestrys/volante-plus`
4. Select "Next.js" framework
5. Click "Deploy"

#### Step 2: Configure Environment Variables
1. In Vercel dashboard, go to project settings
2. Navigate to "Environment Variables"
3. Add required variables:
   - `NEXT_PUBLIC_CAIXA_API_BASE_URL` = `https://loteriascaixa-api.herokuapp.com/api`
4. Add optional variables (if using features):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (for push notifications)
   - `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (for analytics)
   - `NEXT_PUBLIC_SENTRY_DSN` (for error tracking)

#### Step 3: Configure Build Settings
1. Root Directory: `.` (repository root)
2. Build Command: `cd web && npm run build`
3. Output Directory: `web/.next`
4. Install Command: `npm install`

#### Step 4: Deploy
1. Click "Deploy" button
2. Vercel will automatically:
   - Clone the repository
   - Install dependencies
   - Run the build command
   - Deploy to global edge network
   - Assign a vercel.app domain

#### Step 5: Monitor Deployment
1. Wait for build to complete (typically 3-5 minutes)
2. Check logs for any errors
3. Once complete, click "Visit" to see live app

---

### Method 2: Vercel CLI (For Advanced Users)

#### Step 1: Install Vercel CLI
```bash
npm i -g vercel
```

#### Step 2: Authenticate
```bash
vercel login
```
Follow the browser prompt to authenticate with GitHub.

#### Step 3: Deploy
```bash
cd /home/user/Volante-Plus
vercel --prod
```

#### Step 4: Configure Prompts
When prompted:
- Project name: `volante-plus`
- Framework preset: `Next.js`
- Root directory: `./` (it will detect the web folder)
- Modify build settings? `Yes`
  - Build Command: `cd web && npm run build`
  - Output directory: `web/.next`

#### Step 5: Add Environment Variables
```bash
vercel env add NEXT_PUBLIC_CAIXA_API_BASE_URL
# Enter: https://loteriascaixa-api.herokuapp.com/api

vercel env add NEXT_PUBLIC_PLAUSIBLE_DOMAIN
# Enter: your.domain.com (if using analytics)

vercel env add NEXT_PUBLIC_SENTRY_DSN
# Enter: your-sentry-dsn (if using error tracking)
```

#### Step 6: Redeploy with Environment
```bash
vercel --prod
```

---

### Method 3: GitHub Integration (Recommended for Production)

#### Step 1: Connect GitHub to Vercel
1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Import GitHub repository
4. Vercel will automatically create webhooks

#### Step 2: Deploy on Push
- Every push to `main` branch triggers automatic deployment
- Vercel builds and deploys your app in ~3-5 minutes
- Check deployment status at https://vercel.com/dashboard

#### Step 3: Preview Deployments
- Each pull request gets a preview deployment
- Share preview URL with team for testing
- Merge to `main` only after approval

---

## Build Process

### Local Build
```bash
cd /home/user/Volante-Plus/web
npm run build
```

**Build artifacts**:
- `.next/` directory (~616 MB including cache)
- `public/` includes `sw.js` (service worker)
- `public/worker-*.js` (custom worker)

### Vercel Build
Vercel automatically:
1. Installs dependencies
2. Runs `npm run build` in web directory
3. Optimizes assets for edge network
4. Generates sourcemaps (if Sentry enabled)
5. Deploys to edge functions

**Build time**: ~3-5 minutes
**Output size**: ~50-100 MB (optimized)

---

## Configuration Details

### vercel.json (Root Directory)
```json
{
  "framework": "nextjs",
  "buildCommand": "cd web && npm run build",
  "outputDirectory": "web/.next",
  "regions": ["sfo1", "iad1", "gru1"],
  "nodeVersion": "20.x"
}
```

**Regions**:
- `sfo1` — San Francisco (US West)
- `iad1` — Northern Virginia (US East)
- `gru1` — São Paulo, Brazil ← Recommended for Portuguese users

### next.config.ts (web Directory)
- **PWA Support**: `@ducanh2912/next-pwa` plugin
- **Service Worker**: Custom worker at `src/worker/index.ts`
- **Sentry Integration**: Automatic error tracking
- **Webpack**: Used instead of Turbopack for PWA compatibility

---

## Environment Setup

### Development Environment (.env.local)
```env
NEXT_PUBLIC_CAIXA_API_BASE_URL=https://loteriascaixa-api.herokuapp.com/api
```

### Production Environment (Vercel Dashboard)
Set in Vercel dashboard → Settings → Environment Variables:

```
NEXT_PUBLIC_CAIXA_API_BASE_URL=https://loteriascaixa-api.herokuapp.com/api
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your-public-key>
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=<your-domain>
NEXT_PUBLIC_SENTRY_DSN=<your-sentry-dsn>
```

---

## Features Configuration

### Web Push Notifications (Optional)

#### Generate VAPID Keys
```bash
npx web-push generate-vapid-keys
```

This outputs:
```
Public Key: ...
Private Key: ...
```

#### Configure in Vercel
1. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Environment Variables
2. Set `VAPID_PRIVATE_KEY` in Environment Variables
3. Set `VAPID_SUBJECT` (mailto: address for Vercel Cron)
4. Set `PUSH_SEND_SECRET` (random token for API security)

#### Enable Notifications
- Users see opt-in prompt when visiting the app
- Notifications sent when new lottery results available
- Can schedule via Vercel Cron Jobs

### Analytics (Optional)

#### Plausible Analytics
1. Create account at https://plausible.io
2. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to your domain
3. Analytics starts automatically

#### Sentry Error Tracking (Optional)
1. Create account at https://sentry.io
2. Create Next.js project
3. Get DSN from project settings
4. Set environment variables:
   - `NEXT_PUBLIC_SENTRY_DSN`
   - `SENTRY_ORG`
   - `SENTRY_PROJECT`
   - `SENTRY_AUTH_TOKEN`
5. Source maps automatically uploaded to Sentry

---

## Deployment Checklist

### Before Deployment
- [ ] Verify all environment variables are set
- [ ] Check that build succeeds locally (`npm run build`)
- [ ] Test PWA offline functionality
- [ ] Verify service worker registration (F12 → Application)
- [ ] Test on mobile device
- [ ] Verify analytics integration (if enabled)
- [ ] Check Sentry configuration (if enabled)

### During Deployment
- [ ] Monitor Vercel build logs for errors
- [ ] Wait for deployment to complete (~3-5 min)
- [ ] Test live app in production environment
- [ ] Verify service worker is served with correct cache headers
- [ ] Test offline functionality in production
- [ ] Check console for any errors (F12 → Console)

### After Deployment
- [ ] Share deployment URL with team
- [ ] Test on various devices/browsers
- [ ] Monitor Sentry for error spikes
- [ ] Check Plausible analytics dashboard
- [ ] Verify push notifications work (if enabled)
- [ ] Monitor Vercel analytics for performance

---

## Performance Optimization

### Vercel Deployment Best Practices

1. **Enable Automatic Caching**
   - Service worker caches static assets (fonts, CSS)
   - API responses cached for offline use
   - Cache updated in background

2. **Regional Edge Network**
   - `gru1` region recommended for Brazil
   - Content served from nearest edge location
   - Reduces latency for users

3. **Image Optimization**
   - Vercel automatically optimizes images
   - WebP format for modern browsers
   - Responsive images for different devices

4. **Bundle Analysis**
   - Check Vercel Analytics for performance metrics
   - Monitor Core Web Vitals
   - Identify slow pages/components

### Monitoring

**Vercel Analytics Dashboard**:
- Response time
- Server-side errors (5xx)
- Client-side errors (via Sentry)
- Traffic patterns
- Deployment history

**Logs**:
- Access Vercel logs: https://vercel.com/dashboard/project/volante-plus/logs
- Stream logs with CLI: `vercel logs`
- Filter by environment, status code, etc.

---

## Troubleshooting

### Build Fails
**Error**: `Command "npm run build" exited with 1`
- Check web/package.json scripts exist
- Verify Node.js version compatibility
- Review build logs for TypeScript errors
- Solution: Fix errors locally, push to git, redeploy

### Service Worker Issues
**Error**: `Service worker failed to register`
- Check public/sw.js is being served
- Verify HTTPS is enabled (required for service workers)
- Check browser console for CSP errors
- Solution: Clear browser cache, hard refresh (Ctrl+Shift+R)

### Environment Variables Not Loaded
**Error**: `process.env.NEXT_PUBLIC_X is undefined`
- Verify variables set in Vercel dashboard (not .env)
- Variables must start with `NEXT_PUBLIC_` to be accessible in browser
- Redeploy after adding variables
- Solution: Add variable in Vercel → Redeploy

### Push Notifications Not Working
**Error**: `Push not sending to subscribers`
- Check VAPID keys are set correctly
- Verify Vercel Cron job is configured
- Check `PUSH_SEND_SECRET` is set and secure
- Solution: Regenerate keys, update Vercel config

### Offline Functionality Not Working
**Error**: `Cannot load page offline`
- Service worker may not be registered
- Cache may be empty (needs first visit online)
- Check IndexedDB for cached data
- Solution: Visit app online first, then try offline

---

## Custom Domain Setup

### Add Custom Domain
1. In Vercel dashboard, go to project settings
2. Click "Domains"
3. Enter your domain (e.g., volante.plus)
4. Choose DNS provider (or add DNS records manually)
5. Verify domain ownership

### DNS Configuration
Add these records to your DNS provider:

```
Type: A
Name: @
Value: 76.76.19.165

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

Or let Vercel auto-configure DNS if using Vercel Nameservers.

### SSL/HTTPS
- Automatically enabled by Vercel
- Free SSL certificate from Let's Encrypt
- Auto-renewal handled by Vercel

---

## Monitoring & Alerts

### Vercel Analytics
- Real User Monitoring (RUM)
- Core Web Vitals tracking
- Performance insights
- Traffic analysis

### Sentry Integration
- Real-time error alerts
- Source map support
- Performance monitoring
- Release tracking

### Uptime Monitoring
- Consider StatusPage.io for public status
- Set up monitoring alerts for downtime
- Monitor API dependencies (Caixa API)

---

## Rollback & Updates

### Rollback to Previous Deployment
1. In Vercel dashboard, go to Deployments tab
2. Find previous successful deployment
3. Click "..." → "Promote to Production"
4. Select "Production"
5. Confirm rollback

### Automatic Deployments
Each push to `main` automatically triggers deployment.

### Manual Redeployment
```bash
vercel --prod
```

Or use Vercel dashboard → Deployments → Redeploy

---

## Security Best Practices

### Secrets Management
- Never commit `.env.local` with secrets
- Use Vercel Environment Variables for production secrets
- Rotate `PUSH_SEND_SECRET` regularly
- Keep VAPID keys secure

### CORS Configuration
- Verify API endpoint CORS headers
- Ensure service worker can fetch from API
- Test with different origins

### CSP (Content Security Policy)
- Verify CSP headers don't block service worker
- Allow Plausible and Sentry domains if enabled
- Test in production environment

### Data Privacy
- Ensure privacy policy is accessible
- Collect minimal user data
- No tracking without consent
- GDPR/LGPD compliance

---

## Success Criteria

✅ Deployment is successful when:
- Build completes without errors
- App loads and renders correctly
- Service worker registers (check DevTools → Application)
- Can navigate between pages
- Works offline (after initial load)
- PWA installable (installable banner appears)
- No console errors (F12 → Console)
- Performance metrics acceptable (LCP < 2.5s, CLS < 0.1)

---

## Next Steps

### Immediate (After Deployment)
1. Test app on production domain
2. Verify PWA installation works
3. Test offline functionality
4. Monitor error logs (Sentry)
5. Check analytics (Plausible)

### Post-Launch (First Week)
1. Gather user feedback
2. Monitor performance metrics
3. Fix any bugs found
4. Plan v2.0.1 patch release
5. Setup monitoring/alerts

### Future Enhancements
1. Add custom domain (volante.plus)
2. Configure email for support
3. Setup Cron jobs for notifications
4. Integrate with CMS for content
5. Plan v2.1.0 features

---

## Support & Resources

### Documentation
- Vercel Docs: https://vercel.com/docs
- Next.js Docs: https://nextjs.org/docs
- Next.js PWA: https://github.com/ducanh2912/next-pwa
- Sentry Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

### Help
- GitHub Issues: https://github.com/mestrys/volante-plus/issues
- Email: support@volante-plus.app
- Vercel Support: https://vercel.com/support

---

## Deployment History

| Date | Version | Environment | URL | Status |
|------|---------|-------------|-----|--------|
| 2026-07-31 | 2.0.0 | Staging | TBD | 🔄 Ready |

---

**Generated**: 2026-07-31
**Status**: ✅ Ready for Vercel Deployment
**Version**: 2.0.0

---
