# Running Pepper Pan without me

Every service this shop depends on, what breaks if one goes away, how to change
the code safely, and what actually happens when you press each thing. Written
for the person who owns the stall, not for a developer.

*A formatted copy of this document is published as a private page; this is the
copy that travels with the code.*

---

## 1. The three services

Pepper Pan is three accounts that talk to each other. **None of them is Claude,
and none of them stops working if you stop paying for an AI.**

| Service | Holds | Lose it and… |
|---|---|---|
| **GitHub** — github.com/heyrolddev/Pepper-Pan | The code and its entire history | The site keeps running; you can no longer change it |
| **Vercel** — vercel.com | Runs the website, rebuilds on every code change | The website goes dark. Nothing is destroyed |
| **Supabase** — supabase.com | Orders, menu, recipes, stock, shifts, customers, photos, logins | You lose the business records. **This is the one that matters** |

A customer opening the site goes: **their phone → Vercel → Supabase → back.**
Vercel holds none of your data; it only assembles pages.

> Your code can be rebuilt from GitHub. Your website can be redeployed in
> minutes. **The record of what you sold cannot be recreated from anywhere.**

---

## 2. Accounts you must keep

| Account | Controls | If you lose access |
|---|---|---|
| GitHub (`heyrolddev`) | The code, and who may change it | Recoverable by email. Turn on two-factor |
| Vercel (signed in with GitHub) | The live site, domain, secret keys | Recovered through GitHub |
| Supabase | Everything the shop knows | **Not recoverable by anyone else** |
| Your owner account on the site | HQ: prices, money, staff, promos, Ask HQ | Reset by email, or change the role directly in Supabase → Table Editor → `profiles` |

**Never share the service-role key.** It ignores every security rule in the
database. It belongs in exactly two places: Vercel's environment variables, and
your own `.env.local`, which is never committed. If it leaks, regenerate it in
Supabase → Settings → API the same day.

---

## 3. Every tool, and why

### The three services
- **GitHub** — code storage with full history. Matters when something breaks: it tells you what changed and when.
- **Vercel** — runs Next.js sites. Watch the Deployments tab after a change: green is live, red means the change was rejected and the old site is still up.
- **Supabase** — Postgres with logins, file storage and security rules on top. SQL Editor for migrations, Table Editor to look at rows, Storage for uploaded photos.

### What the code is built from
| Package | What it is | Why it's here |
|---|---|---|
| `next` 16.3.3 | The framework | Everything. This is the app |
| `react` 19.2.8 | Builds screens from reusable pieces | Every button and page |
| `tailwindcss` v4 | Styling as class names | Every colour and spacing. Palette in `src/app/globals.css` |
| `typescript` v5 | Checks the code before it runs | Catches mistakes at your desk, not in front of a customer |
| `@supabase/supabase-js`, `@supabase/ssr` | Talking to the database, keeping people logged in | Every read and write |
| `motion` 13.1.1 | Animation | Scroll reveals, count-ups, the scrolling strip |
| `leaflet` 1.9.4 | Maps | The delivery pin at checkout |
| `web-push` 3.6.7 | Notifications to a phone with the browser closed | New-order and ETA alerts. Free |

### On your own computer
- **Node.js** v20+ (nodejs.org, LTS) — `npm` comes with it
- **Git** (git-scm.com)
- **VS Code** (code.visualstudio.com)

### Optional, off by default
- **Web Push** — free. `npx web-push generate-vapid-keys`, paste both values into Vercel.
- **Resend** — email updates. Paid. The only line item that could ever cost money. Leave it off unless you want emailed receipts.

---

## 4. Editing it safely

### First time only
```bash
git clone https://github.com/heyrolddev/Pepper-Pan.git
cd Pepper-Pan
npm install
cp .env.example .env.local   # fill in from Supabase → Settings → API
```

### Every time after that
```bash
npm run dev          # 1. runs at localhost:3000

                     # 2. make the change, look at it

npx tsc --noEmit     # 3. check before anyone sees it
npm run lint
npm run build

git add -A           # 4. send it
git commit -m "Say what changed, and why"
git push
```

**Step 3 is not optional.** `npm run build` is the same check Vercel runs.

**Know its limit:** build *compiles* pages, it does not *open* them. A page can
build perfectly and still fail when someone loads it. Always click through what
you changed in `npm run dev`.

### Work on a branch
The branch Vercel publishes is `claude/analysis-ryrmqm`. Push straight to it and
it goes live in about a minute, mistake and all.

```bash
git checkout -b my-change
# …edit, check, commit…
git push -u origin my-change
```

GitHub then offers a pull request, and Vercel builds a **preview** at its own URL
so you can see the change on a real site before it becomes the real site.

*Worth doing once:* rename the default branch to `main` in GitHub → Settings →
Branches. `claude/analysis-ryrmqm` is an accident of how this was built, and
every guide you'll read assumes `main`.

### Where things live
| Folder | What's in it |
|---|---|
| `src/app/` | One folder per page. The URL is the path — `src/app/menu/page.tsx` is `/menu` |
| `src/app/admin/` | HQ. 20 screens |
| `src/components/` | 94 reusable pieces of screen |
| `src/lib/` | 45 files of logic with no screen — costing, permissions, hours, the assistant |
| `supabase/migrations/` | 27 numbered SQL files. The database's whole history |
| `src/app/globals.css` | Palette and fonts. Change a colour once, it changes everywhere |

**Read the comments.** Where something looks strange there is usually a comment
saying why, often naming the bug the obvious approach caused. Before you
"simplify" something odd-looking, read the paragraph above it.

---

## 5. The database rule

> **Never edit a migration that has already been run. Add a new one.**

Editing an applied migration does nothing to your live database — it already ran
— but it makes the file lie about what the database contains. The next person
who rebuilds from these files gets a different database from yours, with no
warning.

### Running one
1. Supabase → **SQL Editor** → New query
2. Paste the whole file
3. Run — you should see "Success"
4. Reload the HQ screen it was for

Every migration here is safe to run twice (`if not exists`, `drop policy if
exists`, guarded inserts). If unsure whether one ran, running it again is
harmless.

### Adding your own
```sql
-- supabase/migrations/0028_whatever_you_are_adding.sql
alter table meals add column if not exists chef_note text;
```
Next number, a name that says what it does, written so a second run changes
nothing. Commit it — it belongs with the code.

**Do you need to save queries in Supabase?** No. The files in
`supabase/migrations/` are the saved copy, in git, with their reasoning.

### Security lives in the database, not the screen
Hiding a button is not a permission. Every table has **Row Level Security**
policies deciding who may read and write each row — a staff account cannot read
your costs even if someone queried the database directly.

Two things if you ever touch them:
- Policies are **permissive and they add up**. A new policy only ever grants
  more access; removing access means dropping the old one **by its exact name**.
- A column-level `revoke` **cannot** carve a hole in a whole-table `grant`. The
  table grant has to be dropped and the columns granted back.

Both are why migrations 0021 and 0024 exist.

---

## 6. What happens when you…

| You do this | Risk | What actually happens |
|---|---|---|
| **Change a dish's price** | reversible | Website updates at once. Orders already placed keep the price they were sold at. Margins recalculate; the dish may reclassify between star/plowhorse/puzzle/dog |
| **Ring up an order at the Counter** | reversible | Four things: the sale is recorded with its own cost, ingredients come off the shelf by recipe, the day's takings move, and the dish may flip to sold out. Cancelling puts the ingredients back |
| **Record a restock** | reversible | Stock rises; the price you paid becomes the cost from then on. Every dish using it gets a new margin. Break-even moves. Past sales keep their old cost |
| **Save a promo with an end date** | reversible | Live within a minute; takes itself off at the end of that date. Dates are read in Manila time |
| **Push code to the live branch** | check first | Vercel builds within seconds. Pass → live in a minute. Fail → **the old site stays up**. To undo: `git revert` and push again |
| **Run a migration** | back up first | The database changes shape immediately. Adding a column or policy is safe; anything with `drop` or `delete` is not and cannot be undone |
| **Change someone's role to Staff** | reversible | Access narrows immediately, in HQ and in the database. Past shifts and orders untouched |
| **Delete a dish** | **cannot be undone** | Past orders keep their record, but the recipe goes. **Marking it unavailable does everything you usually want** |
| **Use Start fresh** | **cannot be undone** | Clears practice orders and messages. No undo — that's why it's behind a password. Back up first |
| **Regenerate the service-role key** | **breaks the site until you finish** | The old key dies instantly. Every HQ screen reading costs or stock breaks until the new key is in Vercel **and** the site is redeployed |

---

## 7. Rules worth keeping

1. **Back up on the first of the month.** HQ → Backup → download. All 36 tables in one file. Keep it somewhere that is not this computer. `scripts/restore.mjs` puts one back — test that once, on a throwaway project, before you need it. A backup nobody has restored is a guess.
2. **Never commit `.env.local`.** Already in `.gitignore`. If a key reaches GitHub, treat it as public forever and regenerate it that day.
3. **One number, one place.** Net profit is calculated in exactly one function; Ask HQ explains it by calling *that* function. A second copy of a formula drifts within a month, and then two screens disagree with no way to tell which is right.
4. **Change one thing at a time.** Small commits, honest messages. `git log` is only useful if it is.
5. **Run it, don't just read it.** Most real bugs here were found by loading the page. The news bug is the one to remember: the homepage showed the three *oldest* posts while the comment directly above said "newest first". It read correctly and behaved backwards for weeks.
6. **If in doubt, ask HQ.** It knows every screen and shows the working on money figures — and says when it doesn't know rather than inventing something.

---

## 8. When something breaks

| What you see | Usually means | What to do |
|---|---|---|
| "Run migration NNNN" | The code expects a table the database hasn't got | Run that file in the SQL Editor |
| "A server error occurred" on one page | Something failed while building that page | Vercel → Deployments → latest → Runtime Logs |
| A change doesn't appear on the homepage | The homepage caches for a minute, on purpose | Wait, hard-refresh, check the deploy went green |
| The whole site is the old version | The build failed; Vercel kept the last good one | Read the red deploy's log, then `npm run build` locally |
| HQ loads but every figure is zero | Service-role key missing or wrong in Vercel | Fix it, then **redeploy** — changing a variable alone does nothing |
| Nobody can sign in | The site URL isn't in Supabase's redirect list | Supabase → Authentication → URL Configuration |
| Slow, or reads return nothing | A free Supabase project can pause after inactivity | The dashboard will say so and offer to restore |

---

## 9. What it costs

As built, nothing — and that is a design decision, not an accident. There is no
API key anywhere in this system that bills you.

- **GitHub** — free, unlimited private repos
- **Vercel** — free at this size
- **Supabase** — free tier covers a stall comfortably. Watch database size and file storage; promo videos are most likely to fill storage, which is why uploads cap at 25MB
- **Push notifications** — free, no vendor
- **Ask Pepper Pan and Ask HQ** — free. Both answer from your own data. No model, no API key

The only paid thing wired in is **Resend**, and it is off.

A **custom domain** is the one thing worth paying for — roughly ₱500–1,500 a
year. Buy it anywhere, point it at Vercel in Settings → Domains.

---

## 10. Handing it to a developer

- **Stack:** Next.js 16 App Router, React 19, Tailwind v4, TypeScript, Supabase (Postgres + Auth + Storage), on Vercel.
- **Read `AGENTS.md` first.** This is Next 16 — several APIs differ from what they'll remember, and the real docs are in `node_modules/next/dist/docs/`.
- **Permissions are a table, not scattered checks** — `src/lib/permissions.ts`. Every call site names a capability, never a role.
- **Row Level Security is the real gate.** Hiding a button is not a permission. Test as an actual role with rows present; testing as the table owner proves nothing, because RLS is bypassed for them.
- **Migrations are append-only.**
- **Money is calculated in one place** — `src/lib/money-server.ts` and `src/lib/costing.ts`. Don't reimplement a formula to display it.
- **The comments explain the why.** Many name a specific bug the obvious approach caused.

Ask for four things in return: small commits, honest messages, work on a branch,
and `npm run build` passing before every push.

---

*Pepper Pan — in front of Palengkeni, beside Osave!, Apalit, Pampanga.*
