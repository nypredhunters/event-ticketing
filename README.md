# Event Ticketing for Netlify

A complete, self-hosted ticketing system you deploy on **Netlify**. Tickets are released
**only after payment is confirmed** — there's no way to get a valid ticket without paying.

**What you get**

- **Purchase page** — buyers pick a quantity, pay with **PayPal, card, or Venmo**, and instantly
  receive a **PDF ticket with a scannable QR code** by email.
- **Inventory control** — seats are decremented atomically, so you can never oversell. The page
  shows live "seats remaining" and blocks sales when sold out.
- **Admin dashboard** (`/admin.html`) — tickets sold, who bought them, revenue, seats remaining,
  and how many have checked in.
- **Door scanner** (`/scan.html`) — open it on any phone, scan a ticket's QR at the door; it shows
  ADMIT / ALREADY SCANNED / INVALID and prevents the same ticket being reused.

---

## How "paid only" is enforced

The browser never decides whether someone paid. The flow is:

1. Buyer approves payment in PayPal/Venmo.
2. The server **captures** the payment and verifies PayPal returned `COMPLETED`.
3. Only then does it decrement inventory (atomically) and create + email the ticket.
4. If the event sold out in the meantime, the payment is **automatically refunded**.

The amount is always computed server-side from the price in your database, so a buyer can't change
the price from their browser.

---

## A note on Cash App

Cash App was on your wish list. Unlike PayPal/Venmo, a plain Cash App `$cashtag` gives your server
**no way to verify a payment cleared**, so it can't safely auto-release a ticket. To accept Cash App
*with* automatic ticketing you'd add **Square (Cash App Pay)** or Stripe as a second processor — the
code is structured so you can drop that in later as an extra payment button. For now, PayPal + Venmo
cover the automated flow. (Venmo is included free — it rides on the PayPal integration.)

---

## Setup (about 30–45 minutes, no prior backend experience needed)

### 1. Create the database (Supabase — free)
1. Go to <https://supabase.com>, create a project.
2. Open **SQL Editor → New query**, paste everything from `db/schema.sql`, and **Run**.
3. Edit the `insert into events …` line at the bottom of that file with your real event name, date,
   venue, price (in **cents** — `2500` = $25.00), and seat count, then run that block. Keep the
   `slug` (e.g. `my-event`) — you'll reuse it.
4. From **Project Settings → API**, copy the **Project URL** and the **service_role** key.

### 2. Create a PayPal app
1. Go to <https://developer.paypal.com> → **Apps & Credentials**.
2. Start in **Sandbox** to test. Create an app, copy the **Client ID** and **Secret**.
3. (Venmo shows automatically for eligible US accounts — no extra setup.)

### 3. Set up email (Resend — free tier)
1. Sign up at <https://resend.com>, verify a sending domain (or use their test sender to start).
2. Create an **API key**. Set `EMAIL_FROM` to an address on your verified domain.

### 4. Configure the project
- Edit `public/config.js`: set `EVENT_SLUG`, your **PayPal Client ID** (public — fine to expose), and currency.
- Copy `.env.example`'s variables into **Netlify → Site settings → Environment variables**
  (these are the secret server-side values). Set a long random `ADMIN_TOKEN`.

### 5. Deploy to Netlify
**Option A — drag & drop won't work here** (this site has serverless functions), so use Git:
1. Put this `event-ticketing` folder in a GitHub repo.
2. In Netlify: **Add new site → Import from Git**, pick the repo.
3. Netlify auto-detects `netlify.toml` (publish `public/`, functions in `netlify/functions`).
4. Add the environment variables from step 4, then **Deploy**.

**Option B — Netlify CLI:**
```bash
npm install
npm install -g netlify-cli
netlify deploy --build --prod
```

### 6. Test before going live
1. With `PAYPAL_ENV=sandbox`, buy a ticket using a PayPal **sandbox** test account.
2. Confirm the email + PDF arrive and the QR scans on `/scan.html` (use your `ADMIN_TOKEN`).
3. Check `/admin.html` shows the sale and the seat count dropped.
4. When happy: switch `PAYPAL_ENV=live`, swap in **live** PayPal credentials, redeploy.

---

## Connecting it to your existing site

Your purchase page lives at `https://your-site.netlify.app/index.html` (or set it as a Netlify
subpath/subdomain). From your current website, just **link a "Buy Tickets" button** to that URL.
The admin dashboard and scanner are separate pages — bookmark them; they're protected by your
`ADMIN_TOKEN`.

## Files
```
event-ticketing/
├─ public/                 # the website (static)
│  ├─ index.html           #   buyer purchase page (PayPal/Venmo)
│  ├─ admin.html           #   sales + inventory dashboard
│  ├─ scan.html            #   door QR scanner
│  └─ config.js            #   public front-end config (edit me)
├─ netlify/functions/      # the backend (serverless)
│  ├─ inventory.js         #   seats remaining
│  ├─ create-order.js      #   start PayPal checkout (server-priced)
│  ├─ capture-order.js     #   verify payment → issue + email ticket
│  ├─ validate-ticket.js   #   door check-in
│  ├─ admin-data.js        #   dashboard data
│  └─ _lib/                #   shared: supabase, paypal, ticket(PDF/QR/email), http
├─ db/schema.sql           # run this in Supabase
├─ netlify.toml            # build config
├─ package.json            # dependencies
└─ .env.example            # environment variables to set in Netlify
```

## Running more than one event
Add another row to `events` (a new `slug`), duplicate `index.html` with a different
`EVENT_SLUG` in its config, or pass `?slug=other-event` — the functions accept a `slug`
parameter everywhere.
