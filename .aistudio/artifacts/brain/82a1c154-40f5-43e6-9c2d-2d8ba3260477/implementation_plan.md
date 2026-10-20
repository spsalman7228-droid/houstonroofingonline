# Houston Roofing & Construction — Web Platform Architecture & Implementation Plan

A production-grade, multi-page web platform and customer portal concept for Houston Roofing & Construction, featuring customer authentication, transactional appointment booking, real-time project milestone tracking, storm alerts/notices, and a staff/admin operational console.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed and integrated into this architecture:
> - **Dual-Mode Persistence (Confirmed)**: The backend provides full instant interactive previewing in development out of the box using an in-memory/JSON mock store matching Firebase Firestore and Auth contracts, while switching automatically to live Firebase Admin SDK whenever `FIREBASE_SERVICE_ACCOUNT_B64` is supplied.
> - **Color Direction & 80/15/5 Rule (Confirmed)**: Clean high-contrast slate gray (`#0F172A`, `#1E293B`, `#334155`), crisp white (`#FFFFFF`) / soft warm base (`#F8FAFC`), safety amber (`#F59E0B`, `#D97706`), deep navy ink, and teal milestone accents.
> - **Strict 3-Service Boundary**: Strictly GitHub + Vercel + Firebase (Auth + Firestore). No third-party email, SMS, analytics, or paid services; communications are exclusively in-app notifications and downloadable `.ics` calendar files.
> - **Texas Statutory Compliance**: Strict compliance with Texas Department of Insurance (TDI) guidance—prominently featuring the statutory deductible disclosure (Tex. Bus. & Com. Code § 27.02), roofer/adjuster role boundary, and marking all concept metrics/reviews with clear sample labels and TODO flags.

***

## 1. Overview & Core Concept

- **What It Does**: Provides Houston property owners with an honest, transparent roofing experience. Customers can inspect service capabilities across residential, commercial, and multi-family categories, book inspections into real capacity slots, track project phases step-by-step from estimate to warranty completion, and receive storm alerts. Staff and admins manage appointments, advance project stages, add internal/customer notes, and broadcast announcements.
- **Target Audience**: Houston-area homeowners, commercial property managers, and multi-family community operators seeking transparent assessments without sales pressure.
- **Key Value**: Replaces opaque phone tags and lead-gen forms with guaranteed slot-booked appointments, real-time stage tracking with photo documentation, and clear separation of Texas contractor vs adjuster roles.

***

## 2. User Experience & Visual Design

### 80 / 15 / 5 Design System Ratio
- **80% Soft Minimal Flat**: High-contrast slate and crisp white surfaces, generous padding, 1px subtle borders (`border-slate-200`), clean typography, unboxed metadata text without static pill capsules.
- **15% Glassmorphism**: Reserved exclusively for surfaces overlaid on photography—sticky navigation header, hero booking overlay card, floating stat highlights, modal dialogs, and slide-out notification drawer (`backdrop-filter: blur(14px) saturate(140%)`, translucent white with subtle border).
- **5% Claymorphism**: Reserved exclusively for hero action moments—primary CTA buttons (`#F59E0B` safety amber), active progress milestone badges, and tactile service category tiles with subtle dual-depth inner/outer box shadows and active press states.

### Visual Identity & Theme Tokens
- **Backgrounds**: Canvas `#F8FAFC` (Slate-50) and `#FFFFFF`; Dark slate sections `#0F172A`.
- **Typography**: `Fraunces` for editorial headlines and display accents; `Plus Jakarta Sans` for clean, highly legible UI copy, forms, and data tables.
- **Color Accents**:
  - Primary Brand & CTA: Safety Amber (`#F59E0B` / hover `#D97706`)
  - Structural Slate: Deep Navy/Slate (`#0F172A`, `#1E293B`)
  - Progress / Verification: Spruce Teal (`#0D9488` / `#14B8A6`)
  - Notice Severities: Storm (Indigo/Violet), Schedule (Amber), Info (Sky Blue), Promo (Emerald)

### Key Pages & User Flows
1. **Public Marketing**:
   - `index.html`: Hero with SVG roofline draw, 1-click CTA + tap-to-call, trust strip (BBB A+, GAF Master Elite, RCAT, FORTIFIED), 4-step process (Inspect, Show, Explain, Install), Good/Better/Best comparison, active notice banner, sample review carousel, service area county chips, and Texas insurance disclosure.
   - `services.html`, `residential.html`, `commercial.html`: Detailed service breakdowns for asphalt shingles, standing seam metal, storm/hail assessment, TPO/flat commercial roofs, and multi-family phased schedules.
   - `why-us.html`: Plain-English explanation of voluntary RCAT licensing, GAF Master Elite standards, warranty realities, and in-house project managers.
   - `reviews.html`: Rating breakdown (4.9 Google rating note), verified customer badges (only for completed project reviews), and clearly labeled concept samples.
   - `updates.html`: Public feed of storm alerts, weather delays, and notices.
   - `faq.html`, `contact.html`, `privacy.html`, `terms.html`, `404.html`.
2. **Booking Wizard (`book.html`)**:
   - Step 1: Select appointment type (Free Inspection, Free Estimate, Storm Assessment, Repair Visit, Commercial Walkthrough, Phone Consult).
   - Step 2: Live date and time selection from calculated open slots (minimum 12h lead time, 60 days max, respecting working hours and capacity).
   - Step 3: Contact details (name, phone, email, address, property type, notes, contact consent checkbox with version timestamp).
   - Step 4: Authentication check (sign in with Google or Phone OTP, or instant demo login) and atomic slot booking confirmation with `.ics` download & Google Calendar link.
3. **Customer Portal (`dashboard.html` & `project.html`)**:
   - Active & past appointments with cancel/reschedule actions (enforcing the 24-hour cutoff).
   - Live project progress tracker displaying current stage out of 11 standardized milestones, event timeline, inspector notes, and photos.
   - In-app notification center with unread count and real-time alerts.
4. **Admin Console (`admin.html`)**:
   - Calendar & appointment management (confirm, reschedule, decline, convert to project).
   - Project lifecycle management (advance stage, publish customer update, attach internal notes).
   - Announcement management (create/expire storm warnings, schedule alerts, notices).
   - Customer directory with search and CSV export.
   - Audit log recorder and key metrics (bookings this week, conversion rate, average days per stage).

***

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Mode Backend (Local Mock + Firebase Admin SDK)**:
  - *Chosen Approach*: The Express backend boots with an adaptive database adapter (`lib/firebase.js`). If `FIREBASE_SERVICE_ACCOUNT_B64` is provided, it initializes Firebase Admin SDK; otherwise, it boots an in-memory/JSON persistence layer that fully emulates Firestore transactions and collection queries.
  - *Why*: Enables immediate zero-config testing and end-to-end evaluation in any preview environment without requiring pre-provisioned cloud credentials, while remaining 100% plug-and-play for live Firebase deployments.
- **Decision 2: Transactional Double-Booking Prevention**:
  - *Chosen Approach*: Slot documents are keyed by `slots/${date}_${time}_${type}_${slotIndex}`. Booking creates or checks this document in an atomic Firestore transaction.
  - *Why*: Eliminates race conditions and guarantees two customers cannot reserve the same slot even under simultaneous requests.
- **Decision 3: Serverless Express with Static Multi-Page Architecture**:
  - *Chosen Approach*: Multi-page vanilla JS ES modules in `/public`, Express router in `index.js` and `admin.js`, clean URLs in `vercel.json`.
  - *Why*: Fast static asset delivery, sub-second LCP, zero client bundle overhead, and complete compatibility with standard Vercel serverless functions.

***

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (/public)                          │
│                                                                        │
│  [Marketing Pages]     [Booking Wizard]     [Customer Dashboard]       │
│  index, services,      book.html (4 steps)  dashboard.html             │
│  residential, etc.     ui.js / booking.js   project.html (tracker)     │
│           │                    │                     │                 │
│           ▼                    ▼                     ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Firebase Web SDK CDN / Auth / Session Bridge (public/js/auth.js) │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTP (Session Cookie / API)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND LAYER (Express)                         │
│                                                                        │
│  index.js (Express server, Helmet, Rate Limiter, Compression)          │
│  ├── /api/session     -> Session cookie minting and verification       │
│  ├── /api/slots       -> Live slot availability & capacity calculator  │
│  ├── /api/bookings    -> Atomic slot booking, cancel, reschedule, .ics │
│  ├── /api/projects    -> Customer project progress & event history     │
│  ├── /api/notices     -> Public announcements and in-app notifications │
│  └── /api/admin/*     -> Role-protected (custom claims) admin actions  │
│                                                                        │
│  Data Layer Adapter (lib/firebase.js)                                  │
│  ├── Mode A: Firebase Admin SDK (FIREBASE_SERVICE_ACCOUNT_B64)         │
│  └── Mode B: Embedded High-Fidelity Mock Store (Immediate Dev Preview) │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA MODEL (Firestore)                          │
│                                                                        │
│  ├── users/{uid}               -> Profile, role, addresses, consent    │
│  ├── appointments/{id}         -> Status, type, slot time, user details│
│  ├── slots/{key}               -> Atomic reservation lock              │
│  ├── projects/{id}             -> Stage index, title, customer ref     │
│  │    └── events/{eid}         -> Stage notes, photo URLs, visibility  │
│  ├── users/{uid}/notifications -> In-app alerts, read status           │
│  ├── announcements/{id}        -> Public storm/schedule notices        │
│  ├── settings/{booking|stages} -> Working hours, blackout dates        │
│  └── auditLogs/{id}            -> Staff action history                 │
└────────────────────────────────────────────────────────────────────────┘
```

***

## 5. Implementation Sequence & Deliverables

1. **Scaffold & Configuration**:
   - `package.json` with Node 24.x engine, scripts (`dev`, `start`, `test`, `seed`).
   - `vercel.json` with cleanUrls, security headers, `/api` rewrites, and static routing.
   - `.env.example`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`.
2. **Backend & Core Libraries**:
   - `lib/firebase.js` (dual-mode Firestore & Auth adapter).
   - `lib/auth.js` (session middleware, role verification).
   - `lib/validators.js` (Zod schemas for bookings, projects, notices).
   - `lib/slots.js` (availability calculation across schedule & blackouts).
   - `lib/ics.js` (standard iCalendar generation).
   - Express routes: `session.js`, `bookings.js`, `projects.js`, `notices.js`, `me.js`, `public.js`, `admin.js`.
3. **Seed Data & Content**:
   - Extract and populate `content/site.json`, `content/services.json`, `content/faqs.json`, `content/settings.json`, and `scripts/seed.js`.
4. **Frontend Core & Design System**:
   - `public/css/tokens.css` (high-contrast slate & safety amber theme).
   - `public/css/base.css`, `components.css`, `animations.css`.
   - SVG visual assets and optimized imagery placeholders in `public/img/`.
5. **Interactive Client Modules**:
   - `public/js/firebase-config.js`, `auth.js`, `ui.js`, `booking.js`, `dashboard.js`, `admin.js`.
6. **Full Page Suite**:
   - Complete 14+ HTML pages with robots meta, Texas disclosures, and schema.org markup.
7. **Automated Testing & CI**:
   - `test/rules.test.js` (permission boundaries, no double booking).
   - `test/booking.test.js` (slot generation, validation, concurrency).
   - `.github/workflows/test.yml` (automated CI pipeline).
8. **Verification**:
   - Applet compilation, verification of all flows, and documentation in `README.md` and `CREDITS.md`.
