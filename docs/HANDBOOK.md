# What Pepper Pan does, and how to use it

The shop's own system: a website customers order from, and an HQ the shop runs
itself with. This is the *what and how*. For the services it runs on, what
breaks if one goes away, and how to change the code, see
[OPERATORS-MANUAL.md](./OPERATORS-MANUAL.md).

---

## 1. What it is for

One rule shapes the whole thing:

> **Record what actually happened, and say when something does not add up.**

Everything else follows from that. A sale takes real ingredients off a real
shelf. A discount is decided by the server, not the phone. A figure built from
half a recipe is marked as incomplete rather than quietly shown as a number.
When the shop sells food it did not have, a screen says so.

### The four kinds of people

| | Sees | Does |
|---|---|---|
| **Customer** | Menu, their own orders | Orders, pays, reviews |
| **Staff** | Counter, orders, what stock is left | Rings up sales, logs waste. **No prices, no costs, no takings** |
| **Manager** | The above, plus the kitchen | Restocks, cooks batches, marks a dish sold out, posts promos. **Cannot change a price or see what anything earns** |
| **Owner** | Everything | Prices, the books, staff, promos, backups |

Roles are set in **HQ → Staff**. Narrowing someone takes effect immediately,
on screen *and* in the database — hiding a menu item has never been a
permission here.

---

## 2. The customer's journey

```
Menu  →  tap a dish  →  choose size / add-ons  →  Cart  →  Checkout  →  Order placed
                                                              │
                                    pickup or delivery ───────┤
                                    cash or GCash     ───────┤
                                    promo code        ───────┘
                                                              ↓
                              Orders page: Pending → Preparing → Ready → Completed
```

**What the shop decides, not the browser.** Prices, the delivery fee, whether a
promo code applies and what it is worth are all recomputed on the server from
the shop's own settings. Whatever the phone thought is discarded.

**A customer may** change quantities or cancel while the order is still
*pending*. Once the kitchen confirms it, editing stops. If an edit means a
promo no longer applies, they are told in plain words rather than just seeing a
different total.

---

## 3. The shop's day

```
Clock in  →  Counter / Orders all day  →  Log what was used or wasted  →  Count the drawer  →  Clock out
```

**Clock in first.** Most writes are refused off-shift — that is what makes
"who did this" answerable later, and what makes a shift a payroll record
rather than a guess.

**Ringing up a walk-in** (HQ → Counter): tap dishes, pick add-ons, apply a
discount from the list if there is one, take payment. You see the receipt
**before** anything is recorded. Confirm, and four things happen at once:

1. The sale is recorded with its own cost
2. Ingredients come off the shelf, by recipe
3. The day's takings move
4. The dish may flip to sold out

Cancelling puts the ingredients back.

**At close**, count the drawer and enter the figure. The shift report checks it
against *opening + cash sales + money put in − money paid out* — not against
sales alone, which is why it no longer accuses an honest person of being short
after they bought gas from the till.

---

## 4. Every screen

### Every day
| Screen | What it is for |
|---|---|
| **Today** | The day at a glance: takings, orders in flight, anything broken |
| **Costs & cash** | Break-even, the drawer, what is still owed, what the shop spends |
| **Ask HQ** | Answers questions about the shop's own numbers, and shows its working |
| **Counter** | The till. Walk-in sales, receipts, discounts |
| **Orders** | The board. Move an order from Pending to Completed |
| **Menu** | Dishes, prices, photos, sold-out switches |
| **Inbox** | Chats the assistant handed over because a person was needed |
| **Promos & news** | Posts for the site, plus **promo codes and counter discounts** |

### The kitchen
| Screen | What it is for |
|---|---|
| **Dish costs** | What each dish costs to make and earns. Stars, plowhorses, puzzles, dogs |
| **Inventory** | Stock, restocking, batches, waste, and **every movement of an ingredient** |
| **Suppliers** | Who you buy from, their number — and **what they charge** |

### Understand
| Screen | What it is for |
|---|---|
| **Analytics** | Trends, best sellers, quiet days — **and a report for each month** |
| **History** | Past days, and backfilling a day from the notebook |
| **Reviews** | What customers said, and relaying one that came by Messenger |
| **Customers** | Who orders, and how often |
| **Staff** | Roles, shifts, and the drawer count for each |
| **Answers** | What the assistant says to common questions |

### Set up once
**Hours**, **Delivery** (radius and fees), **Payments** (cash/GCash),
**Alerts** (which phones the shop may ring), **My account**.

### Your data
**Backup** — download everything. **Start fresh** — clears practice data, no
undo, behind a password.

---

## 5. How to do the ten things you will actually do

### Add a dish
HQ → Menu → **Add a dish**. Name, price, category.

It starts **off** the menu on purpose, so you can cost it before anybody can
order it. Give it a recipe in **Inventory → the dish → Recipe** — what one
serving uses — then put it live once the margin looks right.

> Without a recipe a sale moves no stock and costs nothing — the order reads as
> pure profit and a shelf never goes down. The system posts a warning when this
> happens, but the recipe is the fix.

### Record a delivery
Inventory → the ingredient → **Restock**. Quantity, what you paid, which
supplier, which pot the money came from.

Stock rises, the price you paid becomes the cost from then on, every dish using
it is re-costed, and break-even moves. **Past sales keep their old cost.**

### Write down what a supplier charges
Suppliers → Edit → **What they charge** → *Add a price*.

> Example: Chicken, ₱230, for 1, kg. If Chicken is in your inventory in grams,
> the screen works out ₱0.23/g and tells you whether that beats what you pay
> now. A unit it does not know — a sack — is shown as quoted and **not**
> compared, rather than guessed at.

### Make a promo code
Promos & news → the promo editor. Percent or pesos, whole order or one dish,
minimum spend, a cap, how many uses in total and per customer, dates, and
whether it works online, at the counter, or both.

- **With a code** → a customer types it at checkout.
- **Without a code** → a discount the cashier picks from a list at the till.

Staff can never type an amount. A free-text discount box is how money leaves a
drawer without a story.

### Log waste
Inventory → **Log waste**. An ingredient, a batch, **or a whole dish** — a staff
meal, or something dropped during service. A wasted dish is costed at what it
*cost to make*, never at what it sells for.

### Know when to buy more
Two places, and they answer different questions:

- **Inventory → How long things last** — from the day you bought something and
  the day you tapped *Naubos na?*. Tells you a bottle of Joy lasts 24 days and
  the open one is on day 19.
- **Suppliers → Prices & history** — what you actually paid over time, and
  whether somebody else is cheaper.

### Read the month
Analytics → **Month by month** → open a month.

What it came to, a bar for every day, what sold, who came back, what went well,
what did not, and a numbered list of what to do about next month — ranked by
what it is worth, each one tied to a figure above it.

> An unfinished month **says so**, and compares itself against the *same number
> of days* of the month before. Nine days of October against thirty-one of
> September is a shop that looks like it is collapsing, and every number in
> that comparison is real — which is what makes it convincing and what makes it
> dangerous.

Two figures are worked out differently, and the screen says which. The month's
own totals come from what each order actually cost at the time. **Per-dish**
profit uses today's recipe prices, because the cost of one line was never
stored — so if chicken went up mid-month, a chicken dish looks slightly worse
than it was.

### Take your own pay
Money → **Your pay**. Tap **Take pay**, say how much and out of which pot.

It comes out of the drawer (or GCash, or the bank) so your count still
agrees, and shows in that pot's history as **Owner's pay** — so whoever
counts the drawer tonight is not left short with no explanation.

**It is never counted as a cost of the shop.** Your own pay is not an expense
the business carries; it is profit you already planned to take. Logging it as
gastos would make profit read lower than it is and push break-even up.

**To see how much is left**, first tell it which standing cost is your wage:
**Change the budget** → pick it. Add it under Break-even first if you have
not. The panel then reads "₱12,000 left of ₱15,000" and warns you before the
month's pay runs out, not after. Going over is allowed and says so — the
extra is profit taken early, not wages.

Every entry can be edited or removed. Removing one puts the money back in the
pot it came from.

### Check the drawer
Staff → the shift. The sum is written out so it can be argued with, and the
money paid out of the till is listed underneath.

**A cancelled order is listed, but it moved nothing.** It shows with its
amount struck through and the words *not collected*, and the day's In / Out
columns do not include it — nothing was ever taken for a cancelled order, so
there is nothing to pay back. The day says how many were cancelled so a quiet
day reads as quiet rather than as a shortfall.

### Back up
HQ → Backup → download. Keep it somewhere that is not this computer.

> **Do this on the first of the month.** A backup nobody has restored is a
> guess — test one once, on a throwaway project, before you need it.

### Answer a customer
Inbox, for anything the assistant handed over. Messenger and the website land
in the same place.

### A shelf that stopped adding up
Inventory, orange band at the top. It means more was sold than the shop
recorded as made, so every cost on that page is out by the same amount until
it is fixed. Two ways out, and the band now names both: **log the batch**
somebody made without logging it (Inventory → the batch → Make), or
**recount the shelf** and enter what is actually there.

It only ever lists real shortfalls. Making a batch and counting a shelf are
ordinary work and are filed under Inventory in History, not here.

### Find out why a number looks wrong
**Ask HQ.** It explains the shop's own figures by calling the same function the
screen did, so the two cannot disagree. It says when it does not know rather
than inventing something.

---

## 6. What the system will refuse

Worth knowing, so a refusal reads as the system working rather than breaking:

| It refuses | Because |
|---|---|
| A sale marked paid when the cash is short | A payment that does not add up is not a payment |
| A customer changing their own price, discount, or payment status | The bill is the shop's to set |
| Staff writing anything while clocked out | "Who did this" has to have an answer |
| Staff changing a price, or seeing what a dish earns | That is the owner's screen |
| A promo code that expired, is used up, or does not apply | And it says **which** of those, not "invalid" |
| A stock count or delivery with a negative figure | |
| An end date before its start date | |

And two things it does **not** refuse but tells you about: a shelf that went
below zero (Inventory shows it that day), and a dish sold with no recipe.

---

## 7. What it cannot do

Said plainly, so nobody discovers it at the wrong moment:

- **The receipt is not a BIR receipt.** It says so on the paper.
- **Bluetooth printing does not work on iPhone or iPad** — Safari has no Web
  Bluetooth, and every iOS browser is Safari underneath. Android phones and
  Windows or Mac laptops are fine; the control is **Connect a printer & print**
  on the receipt.
- **Two customers can order the last serving at the same time.** Stock goes
  negative and the shop is told; it is not prevented.
- **Deleting a dish cannot be undone.** Marking it unavailable does everything
  you usually want.
- **A website cannot turn your phone from a browser tab.** That is a browser
  rule, not a setting we can change. **My account → Screen layout →
  Landscape** always gives you the wide layout, and it turns the screen too
  once Pepper Pan is added to your home screen — on Android. On an iPhone no
  website can ever turn the screen; turn it by hand and the page fits itself
  to it. The setting says which of these you are getting instead of guessing.

---

## 8. How it is kept honest

- **71 migrations**, each with checks that run against a real Postgres. Security
  rules are tested by acting as a customer and confirming the write is refused.
- **74 test files** covering the money, the stock, the discounts and the
  conversions — the parts where a wrong number looks exactly like a right one.
- **Costs live in one place.** Net profit is calculated in exactly one function,
  and Ask HQ explains it by calling that function. A second copy of a formula
  drifts within a month, and then two screens disagree with no way to tell which
  is right.

---

*Written for the person who runs the stall. Keep it with the code — if a
feature changes, this file changes in the same commit.*
