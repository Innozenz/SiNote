# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**SiNote** — a marketplace where students find music/singing teachers and book lessons with them. Built on a Next.js 16 (App Router) SaaS boilerplate: Better Auth, Prisma 7 + PostgreSQL, Stripe.

**Business model, because it drives the data model:** teachers subscribe to the platform (Stripe subscription on `TeacherProfile`). Students pay their teacher directly, offline — there is **no student-facing payment**, no Stripe Connect, no escrow. `priceCents` fields exist for display and history only and must never trigger a charge.

The UI under `app/` is still largely boilerplate demo code (`app/page.tsx` is a marketing page that doubles as the sign-in screen). The domain model in `prisma/schema.prisma` is the part that reflects the real product.

User-facing copy is in **French** (including `toLocaleDateString("fr-FR", …)` calls); match that when editing existing UI. Schema comments are in French too; code identifiers stay in English.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build (standalone output)
npm run start    # run production build
npm run lint     # eslint (flat config, eslint-config-next)
npm test         # vitest, single run
npm run test:watch

npx vitest run lib/availability            # one file
npx vitest run -t "heure d'été"            # one test / describe block by name

npx prisma generate        # regenerate Prisma client after schema changes
npx prisma migrate dev     # create + apply a migration (dev)
npx prisma migrate deploy  # apply pending migrations (CI/prod)
npx prisma migrate status  # what's applied vs pending
npx prisma db seed         # instrument catalogue (idempotent, upsert by slug)
```

**Do not use `prisma db push`.** This project is on `prisma migrate` because the schema depends on hand-written SQL that `db push` would silently drop (see *Integrity constraints* below).

**Read every generated migration before applying it.** Prisma does not know about the hand-written SQL and tries to undo it: the `reminders` migration was generated with a `DROP INDEX "instrument_aliases_idx"` on top, which would have killed alias search (« technique vocale » → chant) with no symptom but growing slowness. Generate with `--create-only`, strip what does not belong, then `migrate deploy`. This is not a one-off — `user_first_last_name` was generated with the very same `DROP INDEX` on top. Expect it on **every** migration, and verify the index is still there afterwards (`SELECT indexname FROM pg_indexes WHERE tablename='instrument'`).

**Restart the dev server after `prisma generate`.** The running server keeps the old client in its module graph, so a new column type-checks (`tsc` reads the freshly generated types from disk) while the page fails at runtime with "Unknown field … for select statement". The error names the schema, not the cause, which sends you looking at the migration you just verified.

Tests cover `lib/availability` only, and that's deliberate: it's the one piece of logic whose bugs are invisible by inspection (see below). Don't feel obliged to backfill tests for CRUD routes.

### Environment

`.env.example` lists every variable — `cp .env.example .env` and fill it in. Non-obvious consumers:

- `DATABASE_URL` — read by `prisma.config.ts`, not by `schema.prisma` (see Prisma 7 note below).
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` — read by Better Auth itself; they don't appear anywhere in the source.
- `NEXT_PUBLIC_APP_URL` — root for email links, `metadataBase` (canonical/OG), and the Stripe checkout success/cancel URLs. **In production it must be the real deployed URL**, or emails and canonicals point at localhost. Note it is a `NEXT_PUBLIC_*` var, so it's baked at build — changing it needs a redeploy. It is **no longer** the Better Auth client baseURL: `lib/auth-client.ts` calls `createAuthClient()` with no baseURL, so the browser client follows the current origin (the auth API is same-origin). That was deliberate — reading `NEXT_PUBLIC_APP_URL` there meant a prod build still holding `http://localhost:3000` made the public site fetch the visitor's localhost, which the browser blocks with a "wants to access other services on your device" warning. Separate from `BETTER_AUTH_URL` (read by Better Auth server-side); keep both pointed at the real URL in production.
- `NEXT_PUBLIC_STRIPE_PRICE_ID` — fallback read by `/api/stripe/checkout` when `STRIPE_PRICE_ID` is absent. Same **teacher** subscription price; keep them equal or drop this one. (`components/subscription-button.tsx`, its former consumer, went with the boilerplate dashboard.)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — only consumed by `lib/stripe-client.ts`, which nothing imports, so it's currently unused at runtime.

### Database setup

`DATABASE_URL` must point at a PostgreSQL instance — currently a hosted **Neon** database; `docker-compose.yml` also provides a local `postgres:16-alpine`. After changing `prisma/schema.prisma`, run `npx prisma generate` before TypeScript picks up the new client types, then `npx prisma migrate dev`.

Use **`sslmode=verify-full`**, not `sslmode=require`. With `require`, `pg` prints a security warning on every connection, and Next 16's dev overlay surfaces it as a "Console Error" on whatever page happened to open the connection — alarming and unrelated to the page. The warning is real: `pg` currently treats `require` as `verify-full` but will adopt libpq's weaker semantics in v9. Writing the intended mode pins today's behaviour, which is the strict one.

**Prisma 7 has two traps, both already worked around — don't undo them:**

1. **The datasource URL is not in `schema.prisma`.** `prisma.config.ts` is the CLI entrypoint: it declares the schema path, the migrations path, the datasource URL, and does the `import "dotenv/config"` that loads `.env` (Prisma 7 no longer auto-loads it). `datasource db` deliberately has no `url` field; don't "fix" it by adding one. Any script hitting the DB outside the CLI must load dotenv itself.
2. **The runtime client needs a driver adapter.** Prisma 7 dropped the Rust engine *and* the `datasourceUrl` constructor option, so `new PrismaClient()` with no argument throws at instantiation — the app cannot reach the database at all. `lib/prisma.ts` passes `new PrismaPg({ connectionString })` from `@prisma/adapter-pg`. That adapter works against both Neon and the local docker Postgres.

## Architecture

### Auth (Better Auth)

- `lib/auth.ts` — server-side Better Auth instance, wired to Prisma via `prismaAdapter`. Email/password only for now (Google OAuth was removed; re-adding it is a `socialProviders` block here plus a button in `auth-buttons.tsx`).
- `lib/auth-client.ts` — browser client (`createAuthClient` from `better-auth/react`); `authClient.useSession()` is how client components read the session.
- `app/api/auth/[...all]/route.ts` — catch-all that mounts Better Auth's handlers; all auth traffic (sign-in, session, password reset) flows through here. **Keep the segment name a valid JS identifier.** It used to be `[...better-auth]`, and the hyphen made Next 16 crash its dev render worker on *every* `/api/auth/*` request ("Jest worker encountered 2 child process exceptions") — a total auth outage that looked like a Better Auth bug rather than a routing one. Renaming a route directory also requires a dev-server restart; hot reload keeps serving 404s.
- Server-side session reads (API routes, server components) go through `auth.api.getSession({ headers: await headers() })` — see `app/api/stripe/checkout/route.ts` and `app/api/user/subscription/route.ts`.

Sign-in lives at **`/connexion`** (`AuthButtons`: Zod-validated email/password). It redirects an already-signed-in user to their own area, which needs the role — so that check is in the page, not the proxy. `authRoutes` in `proxy.ts` is consequently empty; unauthenticated hits on protected routes redirect to `/connexion?callbackUrl=…` (nothing consumes `callbackUrl` yet).

**After a successful sign-in/sign-up, `AuthButtons` does a full-page `window.location` to `/dashboard`, not `router.refresh()`.** `refresh()` relied on the `/connexion` Server Component then issuing its role-based `redirect()` — but refreshing the current route and having it answer with a `redirect()` loops the client router in production ("too many calls to the History API", the navigation never lands). It stayed hidden until the auth client became origin-relative: before that, prod sign-in hit localhost and never succeeded, so the redirect path was never reached. A hard navigation to `/dashboard` sidesteps the client router entirely — the server then routes by role (student/teacher area, or `/onboarding` when `role` is null).

`AuthButtons` is a client component reading the session via `authClient.useSession()`, so `/connexion` server-renders a spinner and fills in after hydration. Fine for a `noindex` page, but don't copy the pattern onto anything public. (Consequence: the "mot de passe oublié" link only exists in the client bundle, not the server HTML.)

**Password reset** is Better Auth's built-in flow, configured in `lib/auth.ts`:

- `POST /api/auth/request-password-reset` → `sendResetPassword` → `/mot-de-passe-oublie`
- the emailed link hits `/api/auth/reset-password/:token`, which validates and redirects to `/reinitialiser-mot-de-passe?token=…` (or `?error=INVALID_TOKEN`)
- `POST /api/auth/reset-password` with `{ newPassword, token }`

Three things to preserve:

- **Better Auth answers `status: true` whether or not the address exists**, and the UI must show the same message either way. Saying "unknown account" would turn the form into a way to learn who has signed up.
- `revokeSessionsOnPasswordReset: true` — a reset often means a compromised account, so sessions open elsewhere must fall. The UI tells the user this, so don't disable it without changing that text. Verified: a session opened before the reset is invalid after.
- `sendResetPassword` is **awaited**, unlike booking notifications. There the email is a side effect; here it *is* the feature — a user who never gets the link is stuck with no way to know.

Better Auth's rate limiter is explicitly enabled in `lib/auth.ts`, including in development: 100 auth requests/minute/IP globally, 5 email sign-in attempts/minute/IP, 3 password-reset requests/hour/IP and 5 reset submissions/hour/IP. Its current storage is in memory, which is suitable for one application instance only; move it to shared database or Redis storage before scaling horizontally, or every replica will enforce an independent quota.

Tokens are single-use and expire after an hour (`resetPasswordTokenExpiresIn`). Verified: replaying a token, inventing one, or posting a password under 8 characters all return 400.

**`User.role` is nullable on purpose.** Signup (Better Auth) creates the account before the user can say whether they're a teacher or a student — it only writes `name`, never the custom `role` column — so `POST /api/onboarding` fills it in and creates the matching profile in one transaction. This is why onboarding stays even without Google OAuth: any credentials signup lands with `role === null`. Treat `role === null` as "onboarding incomplete"; don't assume a role is present.

**The role gate is in `app/dashboard/layout.tsx`, not the proxy** — and it stays there by choice. Next 16's proxy runs on the Node runtime (no longer edge-only, unlike the old `middleware.ts`), so it *could* read a role — but that would mean a Prisma query on every request it intercepts, while the layout reads it once per navigation with proper redirect semantics. Any new signed-in area needs its own Server Component layout doing the same check, or it will be reachable with `role === null`.

`/onboarding` carries the logo and a sign-out link, and both are load-bearing. Every signed-in route redirects here while `role` is null, so without an exit someone who created an account by mistake was trapped with no way back.

Choosing a role is **one-way**: `/api/onboarding` answers 409 once `role` is set. A teacher profile carries a public slug, availability and lesson history that a switch to "student" would orphan. Teacher slugs come from `lib/slug.ts` (accent-stripped, reserved words avoided, `-2`/`-3` on collision) and are unit-tested — they end up in indexed public URLs, so they're painful to change later.

**Route gating is two-layer and both layers are shallow:**
1. `proxy.ts` checks only for the *presence* of the session cookie, via Better Auth's `getSessionCookie(request)` (no signature/expiry check, no DB read). **Never read the cookie by a hardcoded name here.** In HTTPS Better Auth prefixes it `__Secure-better-auth.session_token`, so a literal `better-auth.session_token` lookup works on localhost (HTTP, no prefix) but misses it in production — the proxy then thinks the user is logged out and bounces `/dashboard` → `/connexion`, while `/connexion`'s own `getSession` (which knows the prefix) still sees the session and bounces back: an infinite redirect loop that only appears in prod (`ERR_TOO_MANY_REDIRECTS`). `getSessionCookie` handles the prefix. Unauthenticated hits on `protectedRoutes` redirect to `/connexion` with a `callbackUrl` search param — note nothing currently consumes `callbackUrl`.
2. `app/dashboard/page.tsx` is a `"use client"` component that re-checks `authClient.useSession()` and `router.push("/")` if absent.

Real validation only happens server-side in API routes via `auth.api.getSession`. When adding a protected page, update `protectedRoutes` **and** the `matcher` in `proxy.ts`, and don't rely on either layer for authorization of data — guard in the route handler.

This matters more now than it did for the boilerplate: the data is multi-tenant. Every handler touching a booking, a calendar or a profile must check *this user owns this resource*, not merely *this user is logged in* — otherwise any student can read another's lessons through `/api/bookings/[id]`.

### Security hardening

`next.config.ts` applies `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy` to every response. There is deliberately no Content Security Policy yet: a useful CSP for Next needs per-request nonces in the proxy and an inventory of required origins; do not add an untested static policy that breaks hydration.

Security-sensitive routes fail closed. `/api/webhooks/stripe` returns 503 when `STRIPE_WEBHOOK_SECRET` is missing instead of crashing through a non-null assertion. `/api/cron/reminders` already did the same for `CRON_SECRET` and now compares a supplied secret with `crypto.timingSafeEqual`; preserve the equal-length check before calling it because Node throws when buffer lengths differ.

`meetingUrl` in `PATCH /api/bookings/[id]` accepts only `http:` and `https:` URLs. `z.string().url()` alone also accepts schemes such as `javascript:`, which becomes an XSS vector when the value is rendered as a student-facing link.

### Failures (`lib/http/failure.ts`, `app/error.tsx`)

**Every client fetch goes through `postJson`.** The pattern it replaced ended in `catch { setError("Impossible de contacter le serveur") }` — but that `catch` also caught `response.json()` on a **non-JSON** response (a 500 error page, a failing proxy). The server had answered, and the app said the opposite. A false diagnosis sends the user to check their wifi while the fault is elsewhere.

`describeFailure` is pure and unit-tested; `postJson` is the thin wrapper, tested against a closed port so the network branch is exercised for real. Three distinctions carry everything:

- **Retryable** (network, 5xx) versus not (validation, permission). Offering "réessayer" on a typo makes the user loop.
- **401 is the only case needing to leave the page**, so it gets a link — opening in a **new tab**, because redirecting would discard everything typed. The message says the input is still there, which is the first worry of anyone who just filled a long form. Never auto-redirect on 401 during a submit.
- **The server's message wins when it has one** ("Ce créneau vient d'être réservé" beats any generic phrasing) — *except on 5xx*, where the body often carries an internal trace that helps nobody and informs an attacker.

`localFailure()` gives client-side validation the same shape, so there is one render path (`FormFailure`).

**`authClient` rejects on network failure** — verified against a closed port, it throws `TypeError: fetch failed`. The password screens had no `try/catch`, so the `setIsLoading(false)` placed after the `await` was never reached and the button span forever with no message; the sign-in screen had a `finally` but no `catch`, so it unblocked and said nothing. `authFailure` (`lib/auth-errors.ts`) maps both a thrown error and Better Auth's `{ status, code }` onto the same `Failure` shape. It keys on the **`code`**, which is stable, never the message, which is English — users were reading "Invalid email or password". And a 401 there means *wrong credentials*, not an expired session: it must not offer "se reconnecter" to someone who is trying to.

**Validation errors name the field and the bound.** `describeIssues` (`lib/http/validation.ts`) turns Zod issues into a French sentence using the **labels shown on screen** — "Départs de cours toutes les (min) : 240 au maximum." A teacher who typed 1000 used to read "Paramètres invalides" and had ten fields to guess between, while the server knew exactly which one. Zod's own wording is never reused: it is English and speaks of types. A field missing from the route's label map falls back to the generic sentence rather than exposing a column name.

**Boundaries**: `app/error.tsx` (a runtime error used to show Next's default page — an unstyled English "Application error" with no way back), `app/not-found.tsx` (only the teacher-profile route had one), and `app/global-error.tsx` for a failure in the root layout — that one imports nothing and styles inline, because if the stylesheet never loaded a `className` would render nothing.

Two silent failures were fixed along the way: deleting a time-off entry did nothing visible when it failed, and a failed slot load rendered "Aucun créneau disponible cette semaine" — a lie that sends a student away from an available teacher.

### Signed-in chrome

`app/dashboard/layout.tsx` renders `AppHeader` — logo, link to the public search, account menu. It replaced an unstyled band reading "Compte prof" that carried no identity, no way back to the site and no sign-out; the teacher area then stacked a second bar under it, so the app looked like two products glued together. `UserNav` is now **the only** place to sign out: the red button on the old demo dashboard went with it, and an app you cannot leave is not an app.

Anything new behind the login wall goes under this layout. Do not add a second header.

**`UserNav` takes its identity from the layout, not from `authClient.useSession()`.** Better Auth caches the session client-side, so after a name change the header kept showing the old one directly above a form that had just said "enregistré" — the app contradicting itself. The layout already reads the user for its role gate, so widening that `select` costs no query, and a `router.refresh()` now updates the header. Same reasoning that makes `SiteHeader` a Server Component. `UserNav` stays a Client Component for the dropdown and sign-out only. Note that `authClient.getSession({ query: { disableCookieCache: true } })` does **not** fix this — it does not feed the `useSession` store.

`/dashboard/compte` edits the person's identity (given name, surname) and is **shared by all three roles**, reached from `UserNav`. It sits under `/dashboard`, so the layout's role gate already covers it and `proxy.ts` needs no change — `protectedRoutes` matches on `startsWith("/dashboard")` and the matcher is `/dashboard/:path*`. Putting these fields inside the teacher and student profile screens instead would have meant writing them twice, with two routes updating one column: a name belongs to the person, not to either profile.

`TeacherTabs` is a Client Component for one reason — marking the current tab needs `usePathname`. Its tab list lives **in the client component**, not in the layout: Lucide icons are components, and a component cannot cross the server→client boundary ("Only plain objects can be passed to Client Components"). The layout passes `pendingCount`, a number.

Sticky save bars (`teacher-profile-form`, `student-profile-form`) are full-width bars with a border and an opaque background, not floating buttons. A bare sticky button sits on top of the content it overlaps and hides the last rows of the form.

**Empty states name the cause and offer the next step.** A new teacher gets no requests because their profile is a draft, incomplete, or unsubscribed — "Aucune demande en attente" alone let them conclude that nobody is looking for lessons. `visibilityBlocker()` in `components/teacher-visibility-notice.tsx` returns what is actually blocking, and the notice appears on `/dashboard` and on an **empty** request inbox only: repeating it to a teacher who already has lessons would be noise. Its order — complete, publish, subscribe — follows the teacher's path and is unit-tested; asking someone with a blank profile to subscribe would make them pay for a page nobody can read. An empty weekly grid says so too: it is publishable but never bookable.

### Teacher area (`/dashboard/prof`)

Self-service profile editing and availability, behind a second Server Component gate (`app/dashboard/prof/layout.tsx`) that checks for a `TeacherProfile`. Every `/api/teacher/*` route acts on **"my" profile** via `requireTeacher()` and accepts no profile id — there is no other profile to reach by mistake, so authorization stays trivial.

- **The booking-rule fields are free numbers, not a dropdown, and that is deliberate.** A 33-minute step works — the engine steps by 33 and yields 9:00, 9:33, 10:06 — it is simply unreadable for a student. But 20 (children's lessons) and 45 are legitimate, and a fixed list would exclude them to prevent a mistake nobody makes on purpose. So the fields stay open and are *accompanied*: bounds written under each one and set on the input, and `previewStarts` (`lib/teacher/slot-preview.ts`) renders the resulting departure times live, before saving. Showing the consequence beats closing the input. The preview works in minutes-since-midnight and ignores DST, which only changes slot counts two days a year — it illustrates, it does not enumerate.

The preview also surfaces a silence found while checking: a lesson longer than the opening yields zero slots, and nothing said why.

`checkPublishable()` in `lib/teacher/publishable.ts` is the **single** publish rule, feeding both the form's "what's missing" list and the `POST /api/teacher/profile/publish` guard. Duplicating it guarantees drift. It only covers completeness — visibility adds the subscription on top.
- `PUT /api/teacher/availability` **replaces the whole weekly grid** rather than exposing per-slot CRUD: the editor manipulates a week as a unit, and an atomic replace avoids incoherent intermediate states.
- Overlapping ranges are **merged, not rejected** (`normalizeWeeklyGrid`). "9am–12pm" then "11am–2pm" is a clear intention; a form that refuses it is just annoying. The editor re-renders what the server kept, not what was typed.
- Exceptions take a bare civil date (`AAAA-MM-JJ`), never an instant — `@db.Date` is stored at UTC midnight, so an instant would shift a teacher west of Greenwich onto the wrong day.

`/dashboard/prof/demandes` is the request inbox. `groupBookings()` in `lib/bookings/grouping.ts` decides the ordering, and the ordering *is* the point: a `PENDING` request holds its slot, so leaving one untreated blocks the teacher's own calendar. Hence pending first, soonest first, and a count badge in the tab. A `PENDING` booking whose time has passed drops to history — it is no longer confirmable.

`/dashboard/prof/agenda` is the week view, and it answers a different question from the inbox: not "what must I treat" but "what does my week look like". Bookings are drawn as blocks over the teacher's own openings, so the empty space between them is readable as *bookable* rather than merely blank — which is the whole reason it isn't another sorted list.

- **The layout is a pure module**, `lib/teacher/agenda.ts`, tested like the slot engine and for the same reason: a booking is an **instant** while the grid is **wall-clock**, and that conversion is invisible by inspection. `localMinutesInZone` reads the clock rather than subtracting local midnight — the subtraction is off by an hour on the two DST days, which would draw a 14:00 lesson under a `13:00` label. Consequence, pinned by a test: a one-hour lesson straddling the spring-forward jump occupies **two hours of grid**. That is correct — it really does run from the 01:30 line to the 03:30 line.
- **The timezone helpers moved to `lib/availability/zone.ts`** and the engine now imports them. Two copies of a wall-clock conversion would diverge, and only two days a year would show it. `dayOpenings()` is shared for the same reason: the agenda's background *is* what the engine considers open, so it cannot drift from what students can actually book. It returns `closed` alongside `open` — the agenda must distinguish "closed on purpose" from "never open", or a posted day off reads as a data-entry mistake.
- **Only slot-occupying statuses are drawn** (`PENDING`, `CONFIRMED`) plus the closed ones (`COMPLETED`, `NO_SHOW`) for history. Cancelled and declined released their slot, so they are not on the calendar any more; cancelling from the agenda removes the block and the opening reappears underneath. Their trace stays in the inbox.
- Blocks are laid out in **columns per overlap cluster**, not per day: `booking_teacher_no_overlap` only covers `PENDING`/`CONFIRMED`, so a completed lesson and a fresh request can share an hour, and without columns one would hide the other. Clustering keeps an isolated 17:00 lesson full-width when two lessons collide at 09:00.
- The vertical bounds include the **bookings**, not just the openings. A lesson accepted before the teacher narrowed their hours falls outside every opening, and a grid fitted to openings alone would make it invisible — the worst possible defect in an agenda.
- The displayed week lives in `?semaine=AAAA-MM-JJ`, never in React state, on the same reasoning as the `/profs` filters: shareable, bookmarkable, back-button-correct. An unparseable value falls back to the current week rather than erroring.
- Actions reuse `checkTransition` from `lib/bookings/transitions.ts` to decide which buttons to show, so this screen cannot offer what `PATCH /api/bookings/[id]` would refuse. As everywhere else, it reimplements no lifecycle rule.
- **The background carries the meaning, so it has to be legible.** Closed hours are `surface-strong`, openings are painted white on top, and a day off is hatched *over white* — it reads as "this was open and I closed it", where grey reads as "never open". The first attempt used `surface`, and against a white card the distinction was invisible without zooming, which defeats the entire point of drawing openings at all. Hour lines are an overlay above the bands, not a background under them, or the white openings would erase them exactly where they are most needed.
- **Neutrals belong to the grid, hues belong to the lessons**, and nothing may cross. White/grey/hatching say what a *time slot* is; blue/amber/green/red say what a *booking* is. The rule was learned backwards: a finished lesson shared `surface-strong` with closed hours, so every closed hour in the week read as "Passé" in the legend — on dates in the future. Repainting it plain white then collided with "Ouvert". A green `Terminé` collides with nothing, and the general rule is what stops the next such collision.
- **The legend must name whatever covers the screen.** It listed the lesson states plus "Ouvert", leaving the dominant grey and the hatching unnamed, so a reader mapped that grey onto the only grey entry offered. It now names the grid states too, in a separate group, and uses the same word as the status badge (`Terminé`, not `Passé` — a temporal word invited exactly the misreading).
- The horizontal scroller is `overflow-x-auto overflow-y-clip`. Per spec, as soon as one axis stops being `visible` the other is coerced to `auto`, which gave the grid its own vertical scrollbar and let the day-header row slide out of line with its columns. `clip` is not `visible`, so it blocks the coercion, and it clips nothing: the body height is set explicitly.
- The hour gutter is `sticky left-0` inside the horizontal scroller. On a phone the grid scrolls sideways, and a gutter that scrolls with it leaves blocks floating with no way to tell what time they are.

Dates in the teacher area are always rendered with `timeZone: teacher.timezone`, not the browser's — a teacher travelling must still read their own schedule. Civil date keys (`AAAA-MM-JJ`) are the exception: they are *already* expressed in that timezone, so they are formatted in UTC — passing them through a zone a second time shifts them a day.

### Student area (`/dashboard/cours`)

The mirror of the teacher inbox, sharing `groupBookings()` — the groups are the same, only their meaning differs (`toReview` is a to-do for the teacher, a wait for the student). Both screens reimplement **no** lifecycle rule: every action goes through `PATCH /api/bookings/[id]` and the state machine decides. The student UI simply doesn't offer what the server would refuse — cancel is their only action, and only before the lesson ends.

A cancellation inside the teacher's `cancellationWindowHours` comes back with `lateCancellation: true`. Nothing is charged (no online payment), so it's surfaced as a notice, not a block.

`/dashboard/cours/profil` edits the student profile, and `lib/student/profile.ts` holds the one rule that matters: **a minor must have a guardian contact**. `checkStudentProfile` feeds both the form's "what's missing" list and the API — same implementation, no drift. Details:

- Age is computed with `getUTC*` because `birthDate` is `@db.Date` (UTC midnight); reading it in server-local time would shift the date a day and flip the age for anyone born on their birthday.
- A missing `birthDate` does **not** presume a minor — defaulting to blocked would stop every adult who skipped the field.
- One contact suffices (email *or* phone): demanding both is excessive for a parent who doesn't read email, demanding neither makes the name useless.

The teacher's inbox card shows a **targeted summary** — the level for the *requested* instrument only (`StudentInstrument` is per pair — advanced at piano, beginner at singing), plus goals and, for a minor, the guardian contact — so a request can be judged at a glance. The **full profile** the student filled in (all instruments, city, background, voice type, online preference, genres, guardian details) is one click away, in a **"Voir le profil"** modal on each request (`StudentProfileDetail` in `components/teacher-bookings.tsx`). Only fields the student actually filled are shown.

`/dashboard` routes each role to its own area from a single banner. Adding a role-specific area means adding it there too, or it stays URL-only.

### Public pages must be Server Components

Search discovery is how a marketplace lives, so the public surface needs Server Components with `generateMetadata`. A page that reads the session via `authClient.useSession()` renders nothing crawlable — that pattern belongs behind the login wall only, and only where interactivity demands it. Public = RSC.

`app/layout.tsx` sets `metadataBase` (from `NEXT_PUBLIC_APP_URL`) and a title template — without `metadataBase` every canonical and OG image stays relative and unusable to crawlers.

`app/page.tsx` is the landing page and is server-rendered. It lists **only instruments and cities that actually have visible teachers**, queried live, each linking to `/profs?instrument=…` / `?ville=…`. That's what makes those searches crawlable at all, and it's why they're the combinations `isIndexableSearch` allows; linking to empty searches would waste crawl budget and disappoint visitors. `SiteHeader` (a Server Component, so no session flicker) carries navigation on all three public pages.

**Its visual direction is editorial — a stave, oversized display type, hairlines instead of cards.** The five-line stave is a `repeating-linear-gradient` in an inline `style` (commas, see the Tailwind trap below) sized to `4 × gap + 1` so it renders exactly five lines and not six; nothing is loaded, nothing is animated, and it prints. Three things about it are load-bearing rather than cosmetic:

- **The stave carries a real engraved phrase** — clef, 4/4, four bars of beamed quavers, bar lines — and **every notehead is a family actually taught**, in that family's colour. `lib/instruments/score.ts` lays it out as a pure module (fractions of width, half-spaces of pitch; the page multiplies by its own geometry) and is unit-tested. The phrase fills by *repeating* the taught families and transposing each bar, which is what makes it a phrase rather than a frieze; a platform teaching only guitar therefore plays twelve notes of one colour — many notes, one family, which is exactly the truth. Inventing families to pad the motif would make the répertoire below stop being its legend, and the stave would revert to decoration.

  Engraving rules worth keeping, because breaking them is what makes a fake score look fake: stem direction is decided **per bar** (a beam cannot join an up-stem to a down-stem), the beam sits past the outermost notehead so it never slices one, and pitches are clamped to the stave so no note needs a ledger line. The clef is deliberately **monoline** — a real one is a filled shape with modulated stroke, invisible at this size and out of step with the hairlines around it — and is drawn in the stave's own coordinate space, so its spiral lands on the G line without hand-tuning.

  A down-stem beam reaches six half-spaces below the bottom line, i.e. 41px outside the stave's own box. The clearance under it is set from that number, not by eye.
- **The instrument list is grouped by family**, which is what gives the colour a referent: the reader learns the mapping walking down the page, with no legend.
- The counts in the eyebrow (`N professeurs · M instruments · V villes`) come from the same queries, so the instrument query's `take` is set **above the catalogue size** — a truncated query would silently print a wrong number.

Sizes use `clamp()` in an inline `style` for the same comma reason. The gap under the `h1` is generous on purpose: the leg of the *Q* in MUSIQUE descends far enough to touch the line beneath it — and where a title line is revealed from behind an `overflow: hidden` mask, that mask needs a `padding-bottom` (cancelled by a negative margin) or it slices the *Q* off.

**The motion is a sequencer, and it is one idea rather than a pile of effects.** A playhead sweeps the stave on a loop and each note ignites as it passes. Everything lives in the *Mouvement* block of `globals.css`; `app/page.tsx` only supplies positions and delays. Four properties hold it up:

- **Sync is a negative `animation-delay`, not a timer.** Playhead and notes share one `--sequence` duration declared on the stave; a note at fraction *p* of the width starts its cycle at `-(1 - p) × duration`, which puts its hit exactly under the playhead. Nothing counts, nothing polls, and the two animations cannot drift because they read the same variable.
- **The playhead translates a full-width container by 100%**, so it never animates `left` and never needs to know the stave's pixel width. It lives inside the *music* area rather than spanning the whole stave — it reads the notes, not the clef — which is also what keeps `buildScore`'s fractions and the sweep in one coordinate space.
- **Tailwind 4 drives `rotate`, `scale` and `translate` as separate properties.** The note keyframes therefore animate `scale` alone — written as `transform: scale(…)` they would clobber the utility's `rotate` and the notes would straighten as they fire.
- **Every animation sits inside `prefers-reduced-motion: no-preference`, so the page's default state is its final state.** Nothing is hidden by a static rule. That is also why scroll reveals use `animation-timeline: view()` inside an `@supports`: where the property is missing the whole rule is dropped and the content is simply there. Reveal-on-scroll implemented the other way round — hide in CSS, reveal in JS — leaves the page blank for anything that doesn't run the script, which on a page that exists for crawlers is the one unacceptable failure. A reduced-motion reader also loses the playhead entirely (`display: none`): frozen, it is just a line lying across the stave at random.

Staggering a scroll reveal shifts the **range**, not the delay: on a view timeline progress follows position, so `animation-delay` means nothing there.

`components/spotlight.tsx` is the page's **only client island**, because no stylesheet knows where the pointer is. It renders no text of its own — the content passes through as `children` and stays server-rendered, which is how a public page gains interaction without losing what makes it indexable. It writes CSS variables directly to the node instead of going through React state, and does so **once per frame**: a `getBoundingClientRect` per `pointermove` forces a layout pass far more often than the screen refreshes, and measuring inside the frame (rather than caching the rect) also keeps the light aligned when the page scrolls under a still cursor.

`/profs/[slug]` is the reference implementation: server-rendered profile with `generateMetadata`, canonical, OpenGraph and `Service` JSON-LD, plus one client island (`BookingWidget`) for slot selection. Slots can't be prerendered — they change on every booking — so the island fetches them on mount while the rest stays crawlable.

**Slots are grouped by day and then by period** — matin / après-midi / soir, cut at 12:00 and 18:00 — because a student shops for a *slot of the day* ("after work", "before school"), not for an hour, and twenty chips in a row make them read the whole list to find out. `lib/bookings/day-period.ts` is the pure, tested module behind it, and the reason it is a module rather than four lines in the widget is that its bug is invisible to whoever writes it: the period must be read in the **teacher's** timezone via `localMinutesInZone`, so a student in Montréal sees "Soir" on the slot the teacher calls evening, and a DST day doesn't file 12:05 under the morning. A developer in Paris testing a Paris teacher would never see either. An empty period is not rendered — an "Après-midi" heading followed by nothing makes a morning-only teacher look booked solid — but a period heading *is* shown even when it's the day's only one, since "Matin" alone is exactly the information being looked for.

French date labels use `first-letter:uppercase`, never `capitalize`: `capitalize` uppercases every word and wrote « Lundi 3 Août », where French keeps the month lowercase.

**It is rendered on demand, with no cache, deliberately.** Visibility depends on subscription expiry, so a cached page would stay online after it lapses; recomputing per request is the only way a profile disappears exactly when it should. Note that `export const revalidate` alone does **not** make a dynamic route ISR — without `generateStaticParams` it stays `ƒ` (server-rendered on demand), which the build output will tell you. Moving to ISR would mean accepting a staleness window on visibility and driving invalidation from the publish and subscription routes; the `revalidatePath` calls already sitting in `/api/teacher/profile*` are there for that day and are inert until then.

`getPublicTeacher` is wrapped in React `cache()` because `generateMetadata` and the page component both need the profile — without it the query runs twice per render.

### Search (`/profs`)

Server-rendered results with a client island (`SearchFilters`) that holds **no results** — it only rewrites the URL. Filters therefore live in `searchParams`, which makes every search a shareable, crawlable, back-button-correct address. Keep it that way; moving filter state into React would silently kill the SEO rationale for the whole page.

- `visibleTeacherWhere()` sits next to `isTeacherVisible()` in `lib/teacher/visibility.ts` on purpose: search filters in SQL, the profile page checks in JS, and a search returning profiles that then 404 would be worse than no search. Change one, change the other. Verified: expiring a subscription or unpublishing removes the teacher from both at once.
- `buildQueryString` omits defaults so one search has exactly one URL.

**Results are ranked by a Bayesian mean** (`lib/reviews/ranking.ts`), never by the raw average: one 5★ review would otherwise outrank forty averaging 4.8. Each teacher is pulled toward the site mean in inverse proportion to their review count — `(n·avg + m·siteMean) / (n + m)`, with `m = PRIOR_WEIGHT = 5` phantom reviews. Consequence worth knowing: **a teacher with no reviews scores exactly the site mean**, so they land mid-pack — neither promoted nor buried, which is the only honest treatment while nothing is known about them. The previous ordering put them first. Ties break on `publishedAt`, then on id: without a total order, teachers sharing a score (every newcomer) could appear twice across pages and others never.

**This is why the page can no longer paginate in SQL.** The ranking depends on an aggregate the `where` clause knows nothing about, and it must apply to the whole result set — ranking only the current page would give a different order depending on which page you open. So `searchTeachers` loads the ids of every matching teacher (a two-column projection), ranks and slices in memory, then fetches the full rows for that page alone. Fine into the thousands; beyond that it needs ranking in SQL, at the cost of duplicating the filters that today live in one `where`.
- `isIndexableSearch` decides `robots`: instrument and city are indexed (`cours de chant à Lyon` is a real query and there are few such pages), while mode/price/trial/pagination are `noindex` — they multiply near-identical pages.
- An unrecognised instrument term returns **no results** rather than silently dropping the filter, which would bury the student in irrelevant teachers. The page says so explicitly — the term wasn't understood — instead of implying the offer is missing.

**Zero results is three different situations, and they get three different answers** (`hasActiveFilters`, unit-tested): filters applied and nothing matched → suggest widening, with a "voir tous les profs" escape; **no filters at all** → the platform is empty, so telling the student to widen a search they never narrowed blames them for a supply problem, and the call to action addresses teachers instead; term not recognised → name the term. Pagination doesn't count as a filter: page 2 of an unfiltered search is still unfiltered.

The instrument chips only list instruments that are actually taught, so the block is **not rendered at all** when empty — it used to leave an "Instrument" heading followed by nothing.

**Known limitation:** instruments are flat. Searching `guitare` matches the `guitare` instrument only — a teacher listed under `guitare-electrique` will not appear. Defensible (they are distinct instruments) but probably not what a student expects; fixing it means a parent/family relation in the schema, not fuzzier matching, which would wreck precision elsewhere.

### Domain model (Prisma)

`User`/`Session`/`Account`/`Verification` match Better Auth's expected shape and are `@@map`ped to lowercase tables — don't rename fields or mappings without adjusting the adapter config in `lib/auth.ts`. Everything else is SiNote's domain.

**`User` carries three name columns and one invariant.** `name` is Better Auth's display name — signup writes it, and every read site in the app uses it. `firstName`/`lastName` are what the user actually typed, and **every write of the pair recomposes `name` in the same statement** (`PATCH /api/user/identity`). That is what let the pair be added without touching a single read site: there is never a second truth about the full name, and nothing to resynchronise, so nothing can drift.

Two fields rather than one because the split cannot be guessed. "Jean Baptiste Moreau" divides as plausibly into Jean / Baptiste Moreau as into Jean Baptiste / Moreau, and "Dupont Jean" — surname first, which plenty of people type — yields the wrong given name. That mattered because **reviews are signed with the given name alone**: derived at read time it was re-guessed on every render, with no way for the person concerned to correct it. `lib/user/name.ts` is the single implementation (`fullName`, `givenName`, `composeName`, `splitFullName`), and it replaced **four** copies of the same `split(/\s+/)[0]` heuristic — four copies being a guarantee that they would eventually disagree. The split survives only as the seed for accounts that have never filled the pair in, since Better Auth sets `name` alone.

Email is deliberately **not** editable there: changing it requires re-verifying the address, and a field writing the column directly would be an account-takeover path. Better Auth has its own flow for it. `lib/prisma.ts` exports a singleton `PrismaClient` cached on `globalThis` outside production to survive dev hot-reload.

**Two conventions hold the whole booking model together. Read them before touching availability or bookings:**

**1. Availability is rules, never materialized slots.** A teacher's availability is `AvailabilityRule` (weekly recurrence) plus `AvailabilityException` (`BLOCKED` for time off, `EXTRA` for one-off openings). Free slots are computed at read time from `rules − exceptions − bookings`. Never write a slots table: it explodes in size and drifts out of sync.

**2. Wall-clock time vs instants.** `AvailabilityRule.startMinute`/`endMinute` are minutes-since-midnight (0–1440) **in the teacher's own timezone** (`User.timezone`, IANA). This is what makes "available Mondays at 9am" survive DST. `Booking.startsAt`/`endsAt` are absolute instants in `@db.Timestamptz(3)` — the `timestamptz` mapping is **required**, not stylistic: the overlap constraint builds a `tstzrange` from those columns. `weekday` is ISO-8601 (1 = Monday … 7 = Sunday).

Other decisions worth knowing:

- `Instrument` is a table, not a `String[]`, because search filters and facets on it; `aliases[]` (GIN-indexed) lets "technique vocale" match "chant".
- Skill level lives on the **pair**, in `StudentInstrument` — a student can be advanced at piano and a beginner at singing. `TeacherInstrument.levelsTaught` is the mirror image.
- `StudentProfile` carries `birthDate` plus guardian contacts: a lot of music students are minors, and the app layer must require guardian details when `birthDate` implies under 18.
- `Booking.status` starts at `PENDING` — with no online payment there's nothing to lock commitment, so the teacher confirms explicitly.
- `Review` hangs off a `bookingId` (unique) so only a real lesson can be reviewed, and `publishedAt` is null until moderated.

### Slot engine (`lib/availability`)

`computeAvailableSlots(input)` is a **pure function**: no Prisma import, no DB access, and it never reads the clock — `now` is passed in. Load the rules, exceptions and bookings in the caller, then hand them over. Keep it that way; that property is what makes the DST tests possible.

The pipeline is: expand weekly rules per local civil day → union with `EXTRA` exceptions → subtract `BLOCKED` → project each local interval to instants → subtract bookings widened by `bufferMin` → clamp to the request window, the `minNoticeHours` floor and the `bookingHorizonDays` ceiling → slice into slots.

Things that will bite you:

- **`range` is in instants, not civil dates.** A `Date` built from `"2026-10-25T00:00:00Z"` is 2am in Paris and will silently clip the start of the local day. Pass real wall-clock boundaries.
- **Slicing happens in instant space**, so a local 1am–4am window yields 2 slots on the spring-forward day and 4 on the fall-back day. That's correct: a lesson is a real duration, not a wall-clock one. Both cases are pinned by tests.
- **The grid is anchored on the teacher's *openings*, and stepped by `TeacherProfile.slotGranularityMin`** — never on the free intervals, and never on the lesson duration. Bookings, buffer, minimum notice and horizon *remove* candidates; they never move the grid. This is the load-bearing property, and it was learned from a real report: anchored on the free interval, Monday 9–13 with 60-min lessons, a 30-min buffer and one booking at 9:00 offered 10:30 and 11:30 — the whole day shifted, and 11:00 was free but never offered. Worse, the anchor depended on `now` through the minimum-notice clamp, so two calls seconds apart could return different start times and a slot could go stale between the student's click and their request landing.
  Because the grid no longer moves, it is reproducible — which is what lets the **booking route enforce it**. `/api/bookings` re-derives with the same `granularityMin`, so a hand-crafted `POST` at 10:47 is refused with 409 even though that minute is free. Before, the re-derivation clamped the window to the requested slot exactly, so any free instant produced a slot and passed. Verified end to end: 10:47 and 9:30 refused, 10:00 accepted, 14:00 (outside the opening) refused.
- `@db.Date` columns come back from Prisma as **UTC-midnight** `Date`s. Rule validity bounds and exception dates are therefore read with `getUTC*` — reading them in server-local time shifts them a day for any zone behind UTC.
- Intervals are half-open `[start, end)` throughout, matching the `tstzrange('[)')` in the DB constraint, so a lesson may start exactly when another ends.

The engine narrows candidates; it is **not** the booking guarantee. Two requests can pass through it concurrently for the same slot — the exclusion constraint below is what actually prevents the double booking.

Its one caller is `app/api/teachers/[slug]/availability/route.ts` (`GET ?from=&to=&duration=`), which is **public** — discovery is the point of a marketplace, so a student can browse a calendar before signing up. It returns slots only, never student identities or the teacher's private notes.

Two things that route establishes and new code should follow:

- **Teacher visibility is derived, never stored:** `status === "PUBLISHED" && stripeCurrentPeriodEnd > now()`. A lapsed subscription hides the profile with no webhook writing a `SUSPENDED` state. It answers **404, not 403**, for an invisible teacher, so the endpoint doesn't confirm that an unpublished profile exists.
- The booking query filters on `status IN (PENDING, CONFIRMED)` — the same set as `booking_teacher_no_overlap`. If you change one, change the other, or the UI will offer slots the database then refuses.

#### Integrity constraints (hand-written SQL)

The tail of `prisma/migrations/20260722120000_init_noteva/migration.sql`, below the generated section, is written by hand and **`prisma migrate diff` will not regenerate it**. If you ever rebuild the migration from scratch, port that block over.

The important one is anti-double-booking. An application-level "is this slot free?" check followed by an `INSERT` leaves a race window where two students take the same slot, so the guarantee is a Postgres exclusion constraint (needs the `btree_gist` extension):

- `booking_teacher_no_overlap` — no overlapping `PENDING` or `CONFIRMED` booking per teacher. Pending requests **do** hold the slot, otherwise a teacher gets several competing requests for one hour.
- `booking_student_no_overlap` — `CONFIRMED` only, so a student can legitimately have pending requests with several teachers for the same slot while shopping around.
- Ranges are half-open `[)`: a 11:00 lesson right after a 10:00–11:00 one is allowed. Cancelled/declined bookings release the slot.
- Plus `CHECK`s: `booking_time_order`, minute ranges on availability rows, `review_rating_range` (1–5).

A booking conflict surfaces as an exclusion violation. **The driver adapter does not expose SQLSTATE `23P01` on the error object** — the constraint *name* is what survives into the serialized error, so `overlapConflict()` in `app/api/bookings/route.ts` matches on `booking_teacher_no_overlap` / `booking_student_no_overlap`. Rename a constraint and you must update that function, or conflicts start returning 500.

### Booking lifecycle

The state machine lives in `lib/bookings/transitions.ts`, deliberately apart from the handler and free of Prisma or HTTP so the rules read at a glance and are unit-tested. `app/api/bookings/[id]/route.ts` applies it.

`PENDING` and `CONFIRMED` hold a slot; every other status releases it. That's why decline and cancel matter as much as confirm — an untreated request would otherwise block the teacher's calendar forever. Verified end to end: cancelling a booking makes the slot reappear in the availability endpoint and become bookable again.

- `confirm` / `decline` — teacher, from `PENDING`.
- `cancel` — either party, from `PENDING` or `CONFIRMED`. Returns `lateCancellation` when inside the teacher's `cancellationWindowHours`; with no online payment there's nothing to charge, so it informs rather than blocks.
- `complete` / `no_show` — teacher, from `CONFIRMED`, and only once the lesson has ended (resp. started). `complete` is what gates reviews.
- Terminal statuses accept no further action.

Two conventions the handler establishes:

- **Non-participants get 404, never 403**, on both `GET` and `PATCH`. A 403 would confirm that an id exists and let someone probe other people's calendars.
- Transitions are applied with a **conditional `updateMany` on the current status**, not a plain `update`. Concurrent requests can't apply the same transition twice — the loser sees `count === 0` and gets a 409.

`PATCH` also accepts `teacherNote`/`meetingUrl` **without** an `action`. Don't remove that path: when those fields could only ride along with a transition, a rejected transition silently discarded them.

### Reviews (`lib/reviews`)

**A review hangs off a booking, never off a teacher.** `Review.bookingId` is unique, so a review can only exist where a lesson was booked, confirmed, and closed by the teacher. A free-form rating on a profile could be bought or fabricated; this one cannot. That single foreign key is the whole trust model — don't add a path that creates a review without one.

`checkReviewable` in `lib/reviews/eligibility.ts` is the **single** rule, feeding the student's screen and `POST /api/reviews` alike. Pure, `now` injected. Order matters and is asserted by a test: **ownership is checked first**, because answering "that lesson isn't finished" to a stranger already confirms the id exists. The route turns `not_participant` into 404, everything else into 409.

- `COMPLETED` only. `NO_SHOW` is excluded on purpose — rating a lesson nobody attended measures nothing.
- **Reviews close 60 days after the lesson** (`REVIEW_WINDOW_DAYS`). Not a technical limit: a year-old review says little about today's teacher, and a window that never shuts turns history into permanent leverage.
- The unique constraint on `bookingId` is what actually arbitrates two simultaneous submissions; the application check has a race window, exactly like the booking overlap constraint. `isUniqueViolation()` matches on the message for the same reason `overlapConflict()` does — the driver adapter exposes no usable error code.

**Averages are derived, never stored**, by the same reasoning as teacher visibility: a denormalised column must be resynchronised on every write, and the day one resync is missed a profile shows a wrong rating with nothing to signal it. `lib/reviews/queries.ts` filters on `publishedAt: { not: null }` everywhere — a pending review that still counted toward the average would make moderation look active while being inert. `getRatingSummaries` takes a page of teacher ids in **one** `groupBy`; per-teacher aggregates in search would be twenty queries.

**The teacher can reply, never edit or delete.** `PATCH /api/reviews/[id]` writes `teacherRepl` only, through a `updateMany` conditioned on ownership so that "not yours" and "doesn't exist" are the same 404. A platform where the rated party can erase the rating is worthless to the student reading it; the public reply is the honest counterweight, and the `review_received` email is what makes it usable — without it a teacher would discover the review by chance.

**Moderation is a posteriori** (`/admin/avis`): reviews are published on creation and the admin screen exists to *take one down*, not to let it through. A queue on a platform run by one person would mean no review appears while they sleep — and a student who writes into the void does not write twice. Switching to a-priori moderation is one line (the `publishedAt` set in `/api/reviews`) but commits someone to holding the queue.

Hiding reuses `publishedAt: null`, so every public read already filters it out — no second state to keep consistent, hence none that can drift. Since reviews are born published, a null can only mean "taken down". A moderator can hide and restore, **never edit**: rewriting someone's words while leaving them signed with their first name would be worse than removing them. Hidden reviews stay listed in the queue — moderation whose decisions cannot be re-read is not moderation, it is disappearance. And the student is told on `/dashboard/cours`, otherwise they would believe a removed review is still online.

**Reporting is the teacher's only recourse, and it takes nothing down.** `POST /api/reviews/[id]/report` records a `ReviewReport` and bumps the review to the top of the moderation queue; the review stays online throughout. That separation is the point — the rated party must never arbitrate their own rating, so the report is a request for a decision, not the decision. Only the review's own teacher can file one (`requireTeacher` plus a `teacherId` filter), and "not yours" and "doesn't exist" are the same **404**. `Review.report` is unique on `reviewId`, so two simultaneous clicks are settled by the database, exactly like `Review.bookingId` and `booking_teacher_no_overlap`; the second gets 409.

**A report is closed, never deleted.** `resolvedAt` dated takes it out of the queue's "awaiting a decision" rank without erasing the fact that a teacher objected — same reasoning as keeping hidden reviews listed. Two closures, both real answers: hiding the review closes it in passing, and `dismissReport` closes it while leaving the review online. Without the second, the only way to empty the queue would be to hide, which would make dismissal cost more than agreement.

The queue's order lives in `lib/reviews/report.ts` (`sortForModeration`, unit-tested) and not in SQL, because it ranks on a computed bucket rather than a column: open reports first (**oldest first** — a report left to age is the one that stops being seen), then hidden reviews, then the rest, newest first. A reported review outranks a hidden one even when it is already hidden, or its report would sit open where nothing draws the eye. The queue is capped at 200 rows, so sorting in memory costs nothing.

`buildReportNotifications` (`lib/notifications/report.ts`) is pure and tested; the orchestration that resolves who the admins are and sends lives in `lib/reviews/report-notify.ts` — the same split as `buildReminders` versus `lib/reminders/run.ts`, and the reason for it is concrete: importing Prisma into the builder made the builder untestable without a database, which is how the split got found. Recipients are every `isAdmin` user, so this notification has neither an actor to exclude nor a fixed recipient count — hence a list of messages, like reminders returning two. **With no admin promoted yet it sends nothing and says so in the log**, rather than looking like a lost email. Failures are logged, never propagated: the report is filed and visible in the queue whether or not the mail leaves.

**Admin is the third gate**, `lib/admin/session.ts`, same shape as `requireTeacher`. It answers **404, never 403** — and `app/admin/layout.tsx` calls `notFound()` — so the area does not exist for anyone else. Nothing in the app grants it: promotion is a manual `UPDATE "user" SET "isAdmin" = true`. An interface that hands out admin rights is a permanent attack surface for something that happens once.

**Admin is a capability (`User.isAdmin`), not a role.** It was a `Role` enum value (`ADMIN`) until it forced a false exclusivity — an admin could be neither teacher nor student, so the founder couldn't run the platform *and* have a teacher profile. Now `isAdmin` is orthogonal: a teacher-admin has `role = TEACHER` **and** `isAdmin = true`, uses `/dashboard` normally, and reaches `/admin` from the account menu; a pure operator has `role = null` + `isAdmin`, and the dashboard layout sends a role-null admin to `/admin/utilisateurs` rather than `/onboarding` (which would force them to pick a marketplace role). The `ADMIN` enum value is **kept but deprecated and never written** — removing a Postgres enum member is surgery not worth its risk (option (a)); `requireAdmin`, `report-notify` and the chrome all key on `isAdmin`. Because it's dead, code that maps `role` narrows `ADMIN → null` defensively. Consequence: `"Mon compte"` (`/dashboard/compte`) needs a marketplace role, so a pure operator can't edit their identity there — acceptable, since being an admin *and* a teacher/student is the expected case.

`/admin/utilisateurs` lists every user with their role, `isAdmin`, profile and activity, searchable and filterable by role (the "Admin" chip filters `isAdmin`, not the enum). It's read-only **except** a teacher's platform access: an admin can grant/extend/revoke a date via `PATCH /api/admin/users/[id]/subscription`, which writes **only** `stripeCurrentPeriodEnd` — never a Stripe call, the admin has no access to a teacher's billing. Two limits are surfaced in the UI: the date only makes a **published** profile visible, and a real Stripe subscription (`stripeSubscriptionId` present) will overwrite a manual grant on its next webhook, so comping is mainly for teachers **without** Stripe. **The role itself is shown, never editable** — same reasoning as admin promotion: no UI distributes a role. Like review moderation, these access changes carry no audit trail — tolerable with one admin.

`aggregateRating` is emitted in the profile's JSON-LD **only when reviews exist**. An `aggregateRating` with no reviews is a manual-action risk with search engines, not a cosmetic detail.

### Lesson reports (comptes rendus)

A `LessonReport` hangs off a booking (unique `bookingId`), written by the teacher and read by the student on their dashboard. It carries a `content` text plus attachments (images, PDF scores, audio notes recorded at the mic). `canDocument` in `lib/reports/eligibility.ts` is the single rule — `CONFIRMED` or `COMPLETED` **and** started — feeding the write route, the teacher's workshop (`/dashboard/prof/comptes-rendus`), the per-student sheet (`/dashboard/prof/eleves/[id]`), and the agenda modal's "Compte rendu" button. Attachments are grouped by type (images / audio / scores) in both the editor and the read view, not dumped in one mixed row.

**The text is a rich-text WYSIWYG editor (TipTap v3), and `content` is HTML.** `components/rich-text-editor.tsx` is the editor (client, `"use client"`) — a clickable toolbar (bold, italic, strike, H2/H3, bullet/ordered list, blockquote) over a TipTap `StarterKit`, chosen so non-technical teachers click rather than type syntax. It emits HTML via `getHTML()`. `immediatelyRender: false` is required — Next server-renders first, and without it the editor draws on the first pass and throws a hydration mismatch. An "empty" TipTap doc serializes to `<p></p>`, not `""`, so the editor's `onChange` normalizes blank HTML back to `""` (`htmlIsBlank`) or `dirty`/`documented`/the stored value all go wrong.

**The editor is not always on.** Once saved, the teacher sees the rendered report — exactly what the student sees — with a **"Modifier"** button; the textarea is not permanent. Editing offers **"Annuler"** (restores the saved value). A blank report opens straight in edit mode (nothing to read). After a save, the client adopts the **server's returned (sanitized) value**, not its local draft — the server's is the stored truth.

**Sanitization is the load-bearing decision, and it is server-only.** The teacher's HTML is rendered to the student, so rendering it raw is a **stored-XSS vector** — a `<script>` POSTed straight to the write route, bypassing the editor. `sanitizeReportHtml` (`lib/reports/sanitize.ts`) keeps a **strict allowlist** — exactly the tags the toolbar produces (`p br strong em s h2 h3 ul ol li blockquote`), no attributes, **no links** (a `javascript:` href would itself be a vector). It runs in **two** places:

- **the write route** (`PUT /api/bookings/[id]/report`), so the DB only ever stores clean HTML going forward;
- **every server boundary where `content` crosses into a render component** — the four pages that build render props (`comptes-rendus`, `eleves/[id]`, `(student)/cours`, `(student)/dossiers/[teacherId]`). This is the real XSS guard (render is where it matters) and it also neutralizes **legacy** plain-text content that predates the editor.

**`sanitize-html` must never reach the client bundle.** It is a Node library, and the render components receive **already-clean** HTML — so `ReportViewer` (`components/report-view.tsx`) and `RichTextContent` (`components/rich-text-content.tsx`) do a bare `dangerouslySetInnerHTML` with **no sanitizer import**. This is not optional tidiness: `ReportViewer` is imported by `student-bookings.tsx`, which is `"use client"`, so a sanitizer inside it would ship `sanitize-html` to the browser. Sanitize at the server boundary, render the trusted result.

`RichTextContent` is the one renderer, used by the student view and the teacher's read mode alike — so what the teacher writes is what the student reads. Its `.rich-text` class in `globals.css` rebuilds the list markers and heading sizes that the Tailwind reset strips, on the theme tokens, and is shared by the editable area too. `whitespace-pre-line` on it preserves newlines in **legacy** plain text (TipTap HTML has no inter-tag newlines, so it is unaffected). Search filters run through `reportPlainText` (also in `sanitize.ts`) so a term matches across formatting tags — "la gamme" still hits when "gamme" is bold.

### Notifications (`lib/notifications`)

All the logic — who gets told, of what, in what words — lives in `templates.ts` as pure functions, so it's tested without a provider. `send.ts` is a thin adapter: one hand-rolled `fetch` to Resend, no SDK for a single call.

- **Never notify the actor.** `buildNotification` takes who performed the action and returns `null` when the only candidate recipient is that same person. A test asserts this across every event × actor combination.
- **Times are always the teacher's timezone**, for both recipients. A lesson happens at one hour; showing each party a different one produces missed lessons.
- `notifyInBackground` is deliberately **not awaited** and never throws: a booking is valid whether or not the email goes out, and an HTTP response shouldn't wait on a third party. Failures are logged, not propagated.
- `complete`/`no_show` send nothing — both parties were at the lesson.
- `review_received` goes to the teacher. It is the one notification whose absence would break a feature rather than merely inconvenience: the right of reply is worthless if the teacher never learns a review exists.
- Without `RESEND_API_KEY` + `NOTIFICATIONS_FROM`, messages go to the console. Dev works with no provider account, and you see exactly what would have been sent.
- Links are built from `NEXT_PUBLIC_APP_URL`; in production it must be the real public URL or every email links to localhost.

Reminders live apart, in `lib/notifications/reminders.ts`, and that separation is deliberate. Everywhere else a notification follows an action and the invariant is *never notify the actor*. A reminder has **no actor** — the clock fires it, and both parties must be told. Folding it into `buildNotification` would mean inventing a fake actor and weakening an invariant a test asserts across every other event. Hence a different signature: `buildReminders` returns **two** notifications, not one.

### Lesson reminders (`lib/reminders`, `/api/cron/reminders`)

Nothing in a Next app survives between requests, so there is no in-process scheduler: `/api/cron/reminders` is an HTTP entry point that any scheduler can hit (Vercel Cron, a GitHub Action, `curl` in a crontab). Accepts `GET` as well as `POST` — several schedulers only emit the former.

**Authentication is `CRON_SECRET`, and the route refuses to run without it** (503, logged). A quietly-open cron route is worse than a broken one, because nothing about it looks wrong. Both `Authorization: Bearer` (Vercel's format) and `x-cron-secret` are accepted.

**The window is open at the bottom** — every `CONFIRMED` lesson starting in `(now, now + 24h]` that has no reminder yet, not "lessons starting in 24h ± a few minutes". Targeting the instant assumes the job always runs on time; one twenty-minute outage and the lessons that fell in the gap are never reminded, with nothing having failed. With an open window a job that missed six hours catches up on its next pass, so **the frequency only affects freshness** — fifteen minutes or one hour give the same result.

**Claim first, send second.** `BookingReminder` has `@@unique([bookingId, kind])`, and inserting the row *is* the claim — the database arbitrates the race between overlapping passes, not an application check with a window (same reasoning as `booking_teacher_no_overlap` and `Review.bookingId`). If both sends then fail, the claim is **deleted** so the next pass retries. A partial failure keeps the claim: re-sending to the party who did receive it is worse than leaving the other without. The residual risk is a duplicate if the process dies between a successful send and returning — accepted, and the cheaper of the two failure modes. Verified: five simultaneous passes over one lesson produce one claim and two emails, not ten.

Unlike booking notifications, sends here are **awaited** — the job's return value (`sent`/`failed`/`skipped`) is how an operator knows it works, and `notifyInBackground` would discard it.

Reminders never say "demain": a lesson confirmed three hours ahead also falls inside the window, and the word would be false. The date and time always are true.

`ReminderKind` is an enum with a single value (`H24`) so a second deadline needs no migration.

### Two guards on writes

Writing a booking needs **two** guards, and neither replaces the other: re-derive availability server-side (a client can POST any timestamp — the constraint stops overlaps, not 3am on a Sunday, and not 10:47 on a teacher who only teaches on the hour), then let the constraint arbitrate the race that re-derivation cannot see. Verified: six concurrent requests for one slot produce exactly one booking, one constraint-driven 409, and four re-validation 409s.

The re-derivation only checks the grid because the grid is stable — see the slot engine above. Pass the teacher's `slotGranularityMin` here and in the public availability route, or the two disagree and the UI offers slots the API then refuses.

### Payments (Stripe) — teachers only

The Stripe integration bills **teachers** for platform access. All four `stripe*` fields live on `TeacherProfile`, not `User`. Students never touch Stripe.

Teacher visibility is **derived at read time**, never stored: `lib/teacher/visibility.ts` (`isTeacherVisible`) is the single implementation, used by the public availability route, booking creation and the teacher area. A lapsed subscription hides the profile with no webhook writing a `SUSPENDED` state — nothing to resynchronize. Don't reinline the check; it drifts.

Publishing and being visible are **separate**: a teacher without a subscription can complete and publish a profile, and it appears the moment they subscribe.

- `app/api/stripe/checkout/route.ts` — subscription Checkout for the signed-in teacher. **The price comes from `STRIPE_PRICE_ID` server-side.** It used to be read from the request body, which let anyone subscribe at a price of their choosing; don't reintroduce a client-supplied price. Reuses `stripeCustomerId` when present — passing `customer_email` every time creates a fresh Stripe customer per attempt and scatters the billing history. 409s if a subscription is already active.
- `app/api/stripe/portal/route.ts` — Billing Portal session. Cancellation, card changes and invoices are delegated to Stripe rather than rebuilt; the portal never writes to the DB, the resulting webhook does.
- `app/api/webhooks/stripe/route.ts` — state is tracked from `customer.subscription.created/updated/deleted`, which carry the whole subscription in the payload. No `subscriptions.retrieve()` round-trip, so one less failure mode, and the handler is testable with locally signed events. `checkout.session.completed` does one job only: attach `stripeCustomerId` to the profile via `metadata.userId`. It deliberately does *not* write subscription state — `subscription.created` can arrive first, and writing in both places risks an out-of-order overwrite. Unhandled events return 200; a 4xx/5xx would make Stripe retry forever.
- `lib/stripe/subscription.ts` — pure mapping from a `Stripe.Subscription` to the profile columns, unit-tested. Two traps it encodes: the period end lives on `items.data[0]` in API v20, not on the subscription; and a `canceled`/`unpaid` subscription must **null out** `stripeCurrentPeriodEnd`, or the profile stays visible until an already-paid period expires. `past_due` deliberately keeps access — Stripe retries for days and cutting a teacher off on the first card failure would be brutal.
- `app/api/user/subscription/route.ts` — read-only endpoint deriving `isActive`. Returns `isActive: false` rather than 404 for a user with no teacher profile (i.e. every student).
- `lib/stripe.ts` — the client, keyed on **`STRIPE_SECRET_KEY`**. The boilerplate read `STRIPE_API_KEY`, a name present in no `.env`; the `new Stripe(undefined!)` then threw *at module evaluation*, i.e. before the `try` in every route, so `/api/stripe/*` answered a 500 HTML error page instead of their JSON. Nothing caught it because no Stripe call had ever run. The module now fails fast with a message naming the variable.
- `lib/stripe-client.ts` (`loadStripe`) and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are **unused** boilerplate leftovers — checkout is a plain redirect to the URL the server returns.

**Verified against real Stripe in test mode**, with `stripe listen` relaying genuine events — not hand-written payloads, which is what makes it worth something: a payload I shape myself has the shape I expect by construction, so it cannot catch a mapping error. A real subscription on a real customer produced `stripeCurrentPeriodEnd` exactly one month out, confirming the `items.data[0].current_period_end` reading against an actual API v20 response. Also verified: `checkout.sessions.create` returns a real `cs_test_…` session, `billingPortal.sessions.create` a real portal URL, `/api/stripe/portal` 409s while no customer exists, a published+subscribed profile answers 200 and **the same profile answers 404 within seconds of the subscription being cancelled** — the derived-visibility rule closing the loop. Fifteen live webhook deliveries, all 200, none unmatched. A forged signature is rejected with 400.

**Still unexercised: the hosted Checkout page itself** — completing it requires entering a card, so the only simulated step is `checkout.session.completed` attaching `stripeCustomerId` (locally-signed events cover that handler). Local webhooks need `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, whose `whsec_` differs from a Dashboard endpoint's; `STRIPE_WEBHOOK_SECRET` must match whichever one is actually delivering, and the dev server must be restarted after changing it.

### State management convention

- **Server state** (anything backed by an API/DB — subscription status, user data) → TanStack Query. `components/providers.tsx` creates one `QueryClient` (1 min `staleTime`, no refetch-on-focus) wrapping the app in `app/layout.tsx`.
- **UI-only state** (not persisted, not fetched) → Zustand. `lib/store.ts` holds only sidebar-open state; keep it scoped to ephemeral UI concerns rather than mirroring server data.

### Design system

`app/globals.css` holds every colour, radius and shadow as a **semantic token** (`--surface`, `--primary`, `--muted`…), exposed to Tailwind through `@theme inline`. Components say `bg-surface`, never `bg-zinc-50` — changing the identity means editing the tokens, not the components.

**The palette is "Bleu conservatoire": warm cream neutrals, a Prussian-blue primary, an antique-gold accent.** It replaced the earlier "ink on paper" (spruce primary, bronze accent on warm ivory) — a whole-app identity swap done the way the token system is built for: **edit the tokens in `globals.css`, not the components.** Never apply it with `shadcn add` (that command rewrites `globals.css` with shadcn's own vocabulary — `--card`, `--secondary`, `--chart-*`, `--sidebar-*` — and adds a `.dark` block, which would silently drop our `--surface*`/`--family-*`/status tokens and break light-only). **The neutrals carry no brand hue** — warm cream (`--background: #f5efe1`, elevated cards `#fdfaf2`, ink `--foreground: #1f2b33` a deep blue-slate, borders and muted greys all warm), not a cool generic grey. **The primary is Prussian blue `#123551`** — the brand's voice, chic and institutional; it dresses buttons, links and the dark sidebar panel (`--sidebar: #10293f`). **The accent is antique gold `#a97f38`**, the one warm counterpoint to the blue, and it stays rare (eyebrows, the hero underline, the section notehead dot). **The eight instrument-family tokens are left untouched**, as they were through every refonte: the most finished part of the palette, and still content-category colours that read on the cream ground. Status tokens (`success`/`warning`/`danger`) are kept too — green `success` stays legible as a distinct meaning next to the blue primary.

Because a token can only reach code that reads CSS variables, the primary and accent are also **hardcoded in four places that cannot read tokens, and every palette change must track them**: the favicon (`app/icon.svg` fill `#123551`, plus the generated `app/favicon.ico` and `app/apple-icon.png` regenerated from it with `sharp` — a static SVG/ICO has no access to `var()`), the landing-page aurora and spotlight gradients (inline `rgb(...)` in `app/page.tsx` — primary `rgb(18 53 81)`, accent `rgb(169 127 56)`), and `app/global-error.tsx` (`background: "#123551"`), whose styles are inline **because the stylesheet may not have loaded** when it renders. The `brand/` logo assets (mark SVG/PNG) carry the primary hex too. Grep for the old hex before assuming a colour change is complete.

**Light theme only, by decision.** There is no `prefers-color-scheme` block and there are **no `dark:` variants anywhere** — adding one would be dead code. `:root` sets `color-scheme: light`, which is what stops a browser in dark mode from tinting native controls (date pickers, selects, checkboxes) into something that clashes with the page.

Typography: **Inter for body, Cormorant (a high-contrast display serif) for `h1`–`h3` only**, wired through `--font-sans-custom` / `--font-display` (both `next/font/google`; Cormorant loads weights 500–700 + italic for gold accents). The heading `letter-spacing` is slightly **positive** (`0.005em`) and the weight `600`: a garalde/Didone must not be tightened — its thick/thin strokes would collide — where the earlier Fraunces wanted a light negative tracking. Note the boilerplate had a bug worth not reintroducing — `globals.css` hardcoded `font-family: Arial` on `body`, silently overriding the font `next/font` had loaded.

**Instrument families own the colour** (`--family-*`, eight pairs of tokens; `lib/instruments/family.ts` maps them to labels and class strings). This generalises the rule the agenda arrived at the hard way — *neutrals belong to the grid, hues belong to the content* — into the one rule the whole palette follows: **a hue names something.** Family tokens name a family, status tokens (`success`/`warning`/`danger`) name a state, greys are layout, and gold `--accent` is editorial emphasis. Nothing may take a hue merely because it looks better in colour; that is what makes the colours readable as information rather than decoration.

Two consequences worth keeping:

- The eight hues are **spaced around the wheel before being chosen by analogy**. They have to be told apart first — "brass is golden" only settles which of the remaining slots it takes. `THEORY` is deliberately neutral graphite: solfège is the page itself.
- The class strings in `FAMILY_STYLES` are written **out in full and literally**. Tailwind scans source as text, so a class assembled at runtime from a family name is never generated, and the colour vanishes in production with no error and no build failure.

Two Tailwind 4 traps this codebase already hit:

- **A bare custom property in an arbitrary value is invalid.** `rounded-` followed by `[--radius]` compiles to `border-radius: --radius` and silently yields square corners; wrap it in `var()`.
- **Never put a comma-bearing value in an arbitrary class.** A `bg-` arbitrary value holding a `radial-gradient(...)` with commas makes the scanner split at the commas and invent a bogus utility from the fragment, which then emits unparseable CSS. Use an inline `style` for gradients.
- **Tailwind scans this file too.** Writing one of those broken class names verbatim in any non-ignored file — source, comment, or Markdown — is enough for the scanner to pick it up and regenerate the invalid rule. That is why the examples above are described rather than quoted.
- Native checkbox/radio tint uses the hand-written `.accent-primary` class in `globals.css` for the same reason.

**Don't add a configurable `distDir`.** It looks like an easy way to run a second dev server alongside the first, and it was tried: an alternate build directory is ignored by neither Tailwind's scanner nor eslint, so both start reading compiled artifacts — Tailwind emits invalid CSS from hallucinated class names, eslint reports hundreds of errors in generated chunks. To run a second server, stop the first. `/.next-*/` stays in `.gitignore` as a safety net.

### Editorial layout (`components/editorial.tsx`)

The landing page had a voice — oversized display type, small tracked eyebrows, hairline-separated rows instead of boxed cards, asymmetry — but it **stopped at the landing page**: every inner route fell back to default shadcn card grids, which is what made the app read "standard". `components/editorial.tsx` extracts that voice into shared, server-safe primitives so every page speaks it: `Eyebrow`, `PageTitle` (Cormorant, `size: "display"` for public/discovery pages, `"page"` for in-app screens under a nav bar), `PageHeader` (eyebrow + title + asymmetric right-aligned meta, closed by a hairline), `SectionTitle` (notehead dot + tracked-caps label + rule to the edge, with an optional `trailing` slot for counts), and `RowList`/`Row` (the landing "répertoire" pattern — `divide-y divide-border border-y`, hover washes the background instead of drawing a box).

**The rule the whole thing enforces: hairlines and rows, not cards.** A card is reserved for a genuine action surface (the booking widget/price aside, a booking or review *item* that carries its own action buttons); everything else — search results, dashboard navigation, form sections, list groupings — is a hairline-separated row or section on the paper background. Consequently `app/dashboard/prof/layout.tsx` sets the teacher area on `bg-background` (paper), not the old `bg-surface` grey that only existed to make white cards float; sticky save bars are `bg-background/95`, not `bg-white`. When adding a page, compose these primitives — do not reintroduce a `Card` grid for content that is really a list.

### UI components

`components/ui/*` are shadcn/ui-style primitives (Radix + `class-variance-authority` + `tailwind-merge`, composed via `cn()` in `lib/utils.ts`). Extend these rather than adding another component library. They have been **rewritten onto the tokens** and carry non-stock variants — `success` and `accent` on `Button`, `success`/`warning`/`accent` on `Badge` — so read the `cva` config before assuming upstream shadcn behaviour. Badges are soft-tinted on purpose: they annotate, they don't compete with buttons.

The gold `--accent` is deliberately **scarce and load-bearing** — it names the *editorial label*: the hero underline, every page/section `Eyebrow`, and the notehead dot on every `SectionTitle` (`components/editorial.tsx`). That is its whole job — the one warm counterpoint to the blue palette, and the recurring warm note that stops the neutrals-plus-primary from reading all-blue. It names no product category, so it must stay on labels and emphasis; spend it on anything else and it stops meaning "look here".

### Path aliases

`@/*` maps to the repo root (`tsconfig.json`), e.g. `@/lib/auth`, `@/components/ui/button`.

## Current state

The schema is migrated and applied, but the app on top of it is still the boilerplate. Concretely:

- `prisma/seed.ts` (run via `tsx`, declared in `prisma.config.ts`) holds 37 instruments across the 8 families, with search aliases. Seeded and idempotent.
**Both loops are closed end to end through the UI**, verified against the database: a teacher onboards → fills the profile → sets a weekly grid → publishes → receives requests → confirms/declines/closes; a student searches → books → follows the status → cancels.

What is missing:

- **Only the hosted Checkout page is untested**, because completing it requires entering a card. Everything around it now runs against real Stripe in test mode — see the Payments section.
- The signed-in area, the empty states and the failure paths were reviewed on screen — the last against a fabricated expired session, with the typed form content verified intact afterwards. `/onboarding` and the two password screens were reviewed **from the code and the served HTML only**, the browser being unavailable: content and states are verified, layout is not.
- No dedicated instrument/city landing pages, but `/profs?instrument=…` is now linked from the home page and indexable, which covers the need for now.
- `StudentProfile.preferredGenres` and `prefersOnline` are stored but never read; `postalCode` has no UI.
- Email notifications fire on request/confirm/decline/cancel/review and 24h before a lesson. `RESEND_API_KEY` is set, but **the Resend account has no verified domain**, so delivery is restricted to the account owner's own address and every other recipient comes back 403. Verify a domain before this counts as working in production.
- **Nothing schedules `/api/cron/reminders` yet.** The endpoint, the claim table and the retry path are built and verified; wiring an actual scheduler to it is a deployment step, not a code one.
- Reviews are moderated **a posteriori** at `/admin/avis`, and **nobody is an admin yet**: promotion is a manual `UPDATE "user" SET "isAdmin" = true WHERE email = '…'` (a capability, not a role — see *Admin is the third gate*). Until you run it, the admin screens exist but nobody can open them, and a teacher's report is filed with nobody notified. See the Reviews section.
- **Moderation decisions carry no audit trail.** Hiding a review or closing a report records neither who did it nor why. With a single admin that is tolerable; with two it stops being. The report itself is dated and attributed, so only the decision side is missing.
- **Only teachers can report.** A student who reads an abusive review, or one whose own review was taken down, has no way to say so. Defensible while reports exist to protect the rated party, but it is the obvious next widening.
- Search ranking is Bayesian (see *Search* above). `PRIOR_WEIGHT = 5` is an editorial setting, not a mathematical constant: raising it makes the ranking more conservative.
- `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` are all clean. Keep them that way.

## Docker

`Dockerfile` is a multi-stage build producing Next.js `standalone` output (`next.config.ts` sets `output: "standalone"`); it runs `prisma generate` at build time and copies `prisma/` into the final image so migrations can run at runtime. `docker-compose.yml` wires the app container to a local `postgres` service — it overrides `DATABASE_URL` to the `db` service host, so that value wins over whatever is in `.env`.
