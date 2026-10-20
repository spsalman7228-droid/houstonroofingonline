# Houston Roofing & Construction — Web Platform & Customer Portal (Concept)

A multi-page roofing platform and customer portal built with Node.js 24, Express, static vanilla ES modules, and dual-mode Firebase Auth & Firestore architecture.

> **Disclaimer**: This is an unsolicited portfolio design concept and is not the official website of Houston Roofing & Construction. All pages carry `<meta name="robots" content="noindex,nofollow">` and statutory Texas insurance disclosures (Tex. Bus. & Com. Code § 27.02).

***

## 80 / 15 / 5 Design System Ratio Documentation

To eliminate generic "AI slop" and deliver an intentional, domain-appropriate aesthetic for Houston property owners:

1. **80% Soft Minimal Flat**:
   - **Locations**: All standard content sections, service cards, FAQ accordions, pricing tiers, audit logs, and customer dashboard data panels.
   - **Characteristics**: High-contrast slate canvas (`#F8FAFC`), crisp white cards (`#FFFFFF`), dark slate headers (`#0F172A`), 1px soft borders (`#E2E8F0`), and clean unboxed metadata with typographic dot separators (`·`).

2. **15% Glassmorphism**:
   - **Locations**: Surfaces overlaid directly on photography and interactive overlay layers:
     - Sticky top navigation header (`.site-header`)
     - Reschedule and appointment modal dialogs (`.modal-overlay`)
     - Hero booking overlay cards
     - Sticky mobile bottom action bar (`.mobile-action-bar`)
   - **Characteristics**: `backdrop-filter: blur(14px) saturate(140%)`, `background: rgba(255, 255, 255, 0.72)`, and subtle translucent white borders (`rgba(255, 255, 255, 0.4)`).

3. **5% Claymorphism**:
   - **Locations**: Reserved strictly for high-impact decision moments:
     - Marquee primary CTA buttons (`.btn-clay-primary` in Safety Amber `#F59E0B`)
     - Active progress milestone circles (`.clay-milestone.active` in Spruce Teal `#0D9488`)
     - Tactile 3D-style service category cards
   - **Characteristics**: 28px outer radius, dual inner light/dark highlight shadows (`inset 2px 2px 4px rgba(255,255,255,0.6)` and `inset -2px -2px 5px rgba(180,83,9,0.4)`), plus tactile pressed state on active click.

***

## Allowed Services Boundary

Strictly limited to:
- **GitHub**: Code repository and continuous automated testing (`.github/workflows/test.yml`).
- **Vercel**: Serverless Express backend and static asset hosting from `/public` via `vercel.json`.
- **Firebase**: Authentication (Google + Phone OTP) and Cloud Firestore for persistence.
- **Zero Third-Party Communication Services**: No Twilio, Resend, SendGrid, or Stripe. Notifications are exclusively delivered in-app, and calendar events are exported via Google Calendar links and RFC 5545 `.ics` downloads.

***

## Environment Variables (Only 2)

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_B64` | Base64-encoded string of the Firebase service account private key JSON. Decoded once in `lib/firebase.js`. If omitted in preview, dual-mode mock persistence is used automatically. |
| `ADMIN_EMAILS` | Comma-separated list of authorized email addresses that automatically receive the `admin` custom claim role on verified Google sign-in. |

Firebase client configuration is stored publicly in `public/js/firebase-config.js`.

***

## Production Deployment Guide

1. **GitHub Setup**:
   - Create a GitHub repository and push code to the `main` branch.
   - The included workflow `.github/workflows/test.yml` automatically executes `npm test` on every pull request.

2. **Firebase Setup**:
   - Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
   - Navigate to **Authentication** -> **Sign-in method** -> Enable **Google** and **Phone**.
   - Under **Authorized domains**, add your Vercel deployment domain (e.g. `your-app.vercel.app`).
   - Create a **Cloud Firestore** database in production mode.
   - Go to **Project Settings** -> **Service accounts** -> **Generate new private key**.
   - Base64 encode the downloaded JSON key:
     ```bash
     base64 -w 0 service-account.json > service-account-b64.txt
     ```

3. **Vercel Deployment**:
   - Import your GitHub repository in the Vercel dashboard.
   - Configure the 2 environment variables:
     - `FIREBASE_SERVICE_ACCOUNT_B64`: paste the base64 string.
     - `ADMIN_EMAILS`: e.g. `admin@houstonroofingonline.com,spsalman7228@gmail.com`
   - Deploy.

4. **Deploy Rules and Indexes**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   npm run seed
   ```

***

## Automated Testing & Verification

Run the test suite locally:
```bash
npm test
```
This runs:
- `test/booking.test.js`: Verifies double-booking prevention in concurrent transactions, blackout date handling, and 24-hour cancellation cutoffs.
- `test/rules.test.js`: Verifies Firestore default-deny rules, customer data isolation, and role-escalation blocks.

***

## Definition of Done Verification Checklist

- [x] All 14+ pages render cleanly across mobile (360px, 390px) and desktop (768px, 1024px, 1440px) without console errors.
- [x] Online 4-step booking wizard reserves open capacity slots with transactional double-booking prevention.
- [x] Dual-mode authentication supports instant 1-click preview accounts and live Firebase Google/Phone sign-in.
- [x] Customer dashboard features upcoming appointments, cancellation/rescheduling, live project tracker, and in-app alerts.
- [x] In-app notices system broadcasts storm watches and weather delays site-wide.
- [x] Admin console provides appointment confirmation, project creation, stage advancement, user search, and CSV export.
- [x] Texas statutory insurance disclosures and deductible notices (Tex. Bus. & Com. Code § 27.02) displayed prominently.
- [x] 80/15/5 design system documented and verified.
