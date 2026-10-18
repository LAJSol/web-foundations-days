# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. On a normal day it is quiet. When a very popular concert goes on sale, a huge crowd arrives at once and fights over a limited number of seats. This document follows the six-part design framework: requirements, estimates, API, data model, architecture, and trade-offs. It also explains exactly how two people are prevented from buying the same seat.

## Context, goals and non-goals

**Context:** 2 million people have registered. On a normal day, 50,000 visit and about 5,000 tickets are sold. When a popular concert goes on sale, 200,000 people try to buy its 20,000 seats within the first 10 minutes.

**Goals:**

- Never sell the same seat twice.
- Stay online during the big-sale rush.
- Treat buyers fairly.

**Non-goals:** resale and ticket transfers, refunds, seat recommendations, and running in several countries at once. They can come later.

## 1. Requirements

### Functional requirements (what the system must do)

- Users can register and log in.
- Users can **browse** events and see the details of one event.
- Users can **view the seats** of an event and see which are available.
- Users can **hold** seats for a few minutes while they pay.
- Users can **pay** for held seats and receive their tickets.
- Users can **view their tickets** later.
- A user can release seats they no longer want.

### Non-functional requirements (how well it must do it)

- **Correctness:** a seat is never sold to two people. This matters more than anything else here, because a double-booking means two people turn up with the same ticket.
- **Fairness:** during a sale, people are served in the order they arrived, nobody can grab an unlimited number of seats, and bots are limited.
- **Speed:** browsing pages load in under 1 second, and a seat hold answers in under 1 second even during a rush.
- **Availability:** 99.9% uptime, and the site must not crash when the big sale starts.
- **Scalability:** survive a traffic spike of hundreds of times the normal load that lasts only minutes.
- **Durability:** a paid order is never lost.
- **Security:** HTTPS only, hashed passwords, token-based login, rate limiting, and card details handled only by a payment provider.

## 2. Estimates

One day is about 100,000 seconds (rounded), and peak traffic on a normal day is about 5× the average.

### Normal day

| What         | Working                                                 | Result                                                  |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| Page views   | 50,000 visitors × 10 pages = 500,000 per day, ÷ 100,000 | **about 5 per second** (about 25 at peak)               |
| Ticket sales | 5,000 tickets per day ÷ 100,000                         | **about 0.05 per second** (one ticket every 20 seconds) |
| Storage      | 5,000 tickets × about 500 bytes                         | **about 2.5 MB per day, under 1 GB per year**           |

A normal day is easy. One small server and one database could handle it.

### The big sale (200,000 people, 20,000 seats, 10 minutes)

**Assumptions I added:** each buyer loads the event page once, refreshes the seat map 4 times, and makes 2 attempts to hold seats, so about **7 requests per buyer** (before payment). The first seconds of the sale are about 3× busier than the average.

| What                        | Working                        | Result                                                                                               |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Buyers arriving             | 200,000 ÷ 600 seconds          | **about 333 new buyers per second**                                                                  |
| All requests                | 200,000 × 7 = 1,400,000, ÷ 600 | **about 2,300 per second** (about 7,000 in the first seconds)                                        |
| Seat-hold attempts (writes) | 200,000 × 2 = 400,000, ÷ 600   | **about 670 per second** (about 2,000 in the first seconds)                                          |
| Successful purchases        | at most 20,000 seats           | **33 per second** over the full 10 minutes, or **about 110 per second** if it sells out in 3 minutes |
| Storage                     | 20,000 tickets × 500 bytes     | **about 10 MB**                                                                                      |

### Comparing the two

|                               | Normal day                     | Big sale                        | Difference                        |
| ----------------------------- | ------------------------------ | ------------------------------- | --------------------------------- |
| Requests per second (average) | 5                              | about 2,300                     | **about 460 times more**          |
| Ticket sales per second       | 0.05                           | 33 to 110                       | **about 660 to 2,200 times more** |
| Demand compared to supply     | 5,000 tickets, plenty of seats | 200,000 buyers for 20,000 seats | **10 buyers for every seat**      |
| Storage                       | under 1 GB per year            | about 10 MB                     | tiny in both cases                |

**What this tells us:** TicketHub does not have a big-data problem. It has a **spike and contention problem**. The sale is short, extreme, and thousands of people go for the same 20,000 rows at the same time. That means we must design for correctness and fairness under a sudden rush, not for large storage. Nine out of ten buyers will not get a seat, so the system must also say "sold out" politely and quickly.

## 3. API

All endpoints use HTTPS and JSON. After logging in, the client sends `Authorization: Bearer <token>` on every request.

| #   | Method   | Path                             | Description                                                  | Success status   |
| --- | -------- | -------------------------------- | ------------------------------------------------------------ | ---------------- |
| 1   | `GET`    | `/events`                        | Browse events (`?city=` and `?date=` filters)                | `200 OK`         |
| 2   | `GET`    | `/events/{eventId}`              | Get the details of one event                                 | `200 OK`         |
| 3   | `GET`    | `/events/{eventId}/seats`        | View the seats and which are available (`?status=available`) | `200 OK`         |
| 4   | `POST`   | `/events/{eventId}/holds`        | Hold one or more seats for 5 minutes                         | `201 Created`    |
| 5   | `DELETE` | `/events/{eventId}/holds`        | Release the seats the user is holding                        | `204 No Content` |
| 6   | `POST`   | `/orders`                        | Pay for held seats and create the order                      | `201 Created`    |
| 7   | `GET`    | `/me/tickets`                    | View the logged-in user's tickets                            | `200 OK`         |
| 8   | `POST`   | `/events/{eventId}/waiting-room` | Join the waiting room for a big sale                         | `202 Accepted`   |

### Example: hold seats

```http
POST /events/12/holds
```

```json
{ "seatIds": [4001, 4002] }
```

**Response: `201 Created`**

```json
{
  "eventId": 12,
  "seatIds": [4001, 4002],
  "expiresAt": "2026-10-20T19:05:00Z"
}
```

If another buyer already has one of those seats, the server replies `409 Conflict` and the user keeps nothing:

```json
{
  "error": "Conflict",
  "message": "Seat 4002 has just been taken. Please choose another seat."
}
```

### Example: pay for the held seats

```json
{
  "eventId": 12,
  "seatIds": [4001, 4002],
  "paymentToken": "tok_abc123"
}
```

Success returns `201 Created` with the order and its tickets. If the hold has expired, the server replies `409 Conflict` and does not charge the user.

Other error codes: `400` for an invalid request (for example more than 4 seats), `401` for a missing or invalid token, `404` for an event that does not exist, `429` for too many requests, and `503` when the waiting room asks the user to wait.

## 4. Data model

The tables are `users`, `events`, `seats`, `orders` and `tickets`.

| Table     | Important columns                                                                                                 | Keys                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `users`   | `id`, `name`, `email`, `password_hash`, `created_at`                                                              | PK `id`, `email` unique                                                                            |
| `events`  | `id`, `name`, `venue`, `starts_at`, `on_sale_at`                                                                  | PK `id`                                                                                            |
| `seats`   | `id`, `event_id`, `section`, `row_label`, `seat_number`, `price_cents`, `status`, `held_by_user_id`, `held_until` | PK `id`, FK `event_id`, FK `held_by_user_id`, unique `(event_id, section, row_label, seat_number)` |
| `orders`  | `id`, `user_id`, `event_id`, `total_cents`, `status`, `payment_ref`, `created_at`                                 | PK `id`, FK `user_id`, FK `event_id`, `payment_ref` unique                                         |
| `tickets` | `id`, `order_id`, `seat_id`, `ticket_code`                                                                        | PK `id`, FK `order_id`, FK `seat_id` **unique**, `ticket_code` unique                              |

### Relationships

- **One event has many seats** (one-to-many): `seats.event_id` points to `events.id`.
- **One user has many orders** (one-to-many): `orders.user_id` points to `users.id`.
- **One order has many tickets** (one-to-many): `tickets.order_id` points to `orders.id`, because one order can buy several seats.
- **One seat has at most one ticket** (one-to-one, optional): `tickets.seat_id` is unique, so a seat can appear on only one ticket, ever.
- A seat can also be **held** by one user at a time, through `held_by_user_id` and `held_until`.

### `CREATE TABLE` statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  venue      TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  on_sale_at TEXT NOT NULL
);

CREATE TABLE seats (
  id              INTEGER PRIMARY KEY,
  event_id        INTEGER NOT NULL,
  section         TEXT NOT NULL,
  row_label       TEXT NOT NULL,
  seat_number     INTEGER NOT NULL,
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'held', 'sold')),
  held_by_user_id INTEGER,
  held_until      TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (held_by_user_id) REFERENCES users(id),
  UNIQUE (event_id, section, row_label, seat_number)   -- the same seat cannot be listed twice
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  event_id    INTEGER NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status      TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  payment_ref TEXT NOT NULL UNIQUE,   -- one payment can create only one order
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE tickets (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL,
  seat_id     INTEGER NOT NULL UNIQUE,   -- LAST LINE OF DEFENCE: a seat can be on only one ticket
  ticket_code TEXT NOT NULL UNIQUE,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (seat_id)  REFERENCES seats(id)
);

-- "Show me the available seats of an event" is the most common query
CREATE INDEX idx_seats_event_status ON seats(event_id, status);
```

## 5. How the design prevents two people buying the same seat

Two buyers can click the same seat at the same moment, so the protection must live in the **database**, which is the only part that sees every request. The design has three layers.

### Layer 1: an atomic hold

A hold is a single `UPDATE` that **only succeeds if the seat is still free**. The database decides in one step, so there is no gap between "checking" and "taking" where a second buyer could sneak in.

```sql
UPDATE seats
SET status = 'held',
    held_by_user_id = :user_id,
    held_until = datetime('now', '+5 minutes')
WHERE id = :seat_id
  AND (status = 'available'
       OR (status = 'held' AND held_until < datetime('now')));
```

The server then checks **how many rows changed**:

- **1 row changed:** this buyer got the seat.
- **0 rows changed:** someone else got it first, so the server replies `409 Conflict`.

If two buyers run this at the same time, the database handles one `UPDATE` first, and that one changes the status. When the second `UPDATE` runs, the `WHERE` condition is no longer true, so it changes nothing. Only one buyer can win. A hold that was never paid for expires after 5 minutes, and the condition `held_until < datetime('now')` lets someone else take the seat, so we do not depend on a background job for correctness.

When a buyer holds several seats, all the holds run inside **one transaction**. If any seat is already taken, the whole transaction is rolled back, so a buyer never ends up with half of the seats they asked for.

### Layer 2: a transaction for the purchase

Buying turns the hold into a sale. The payment provider is charged first, using the order's `payment_ref` as an idempotency key, so a retried request cannot charge the user twice. Then everything is saved **together or not at all**:

```sql
BEGIN;

-- Turn the hold into a sale, but only if this user still holds the seat
UPDATE seats
SET status = 'sold', held_by_user_id = NULL, held_until = NULL
WHERE id = :seat_id
  AND status = 'held'
  AND held_by_user_id = :user_id
  AND held_until >= datetime('now');
-- If this changed 0 rows (the hold expired), run ROLLBACK and refund the payment.

INSERT INTO orders (user_id, event_id, total_cents, payment_ref)
VALUES (:user_id, :event_id, :total_cents, :payment_ref);

INSERT INTO tickets (order_id, seat_id, ticket_code)
VALUES (last_insert_rowid(), :seat_id, :ticket_code);

COMMIT;
```

This is the **all or nothing** rule from Day 6. Either the seat is marked sold, the order exists and the ticket exists, or none of them happen. If the hold expired while the buyer was paying, the update changes 0 rows, the transaction is rolled back and the payment is refunded automatically.

### Layer 3: a constraint as the last line of defence

Even if a bug in the application code skipped Layers 1 and 2, the database itself would refuse the sale. `tickets.seat_id` is `UNIQUE`, so inserting a second ticket for the same seat fails with an error and the whole transaction rolls back. `orders.payment_ref` is also `UNIQUE`, so one payment cannot create two orders. This is why rules are enforced in the database and not only in the server's code: they apply to every change, whoever makes it.

### What the cache is allowed to do

The seat map is cached for browsing, so it can briefly show a seat as available after it was taken. That is harmless, because **the cache never decides who gets a seat. The database does.** A buyer who clicks a seat that has just gone simply receives a `409` and chooses another.

## 6. Architecture

```text
Client (browser / mobile app)
   │
   ├─(1) DNS lookup ───────────────────────────> DNS
   │
   ├─(2) pages, images, seat-map picture ──────> CDN ──(cache miss)──> Origin
   │
   └─(3) API calls (HTTPS, JSON) ──> Rate limiter + Load balancer
                                              │
                                              v
                                    ┌───────────────────┐
                                    │   Waiting room    │   lets in only as many buyers
                                    │ (virtual queue)   │   as the database can handle
                                    └─────────┬─────────┘
                           ┌──────────────────┴──────────────────┐
                           v                                     v
                      ┌─────────┐                           ┌─────────┐
                      │  App 1  │       ... App N           │  App 2  │   (stateless, auto-scaled)
                      └────┬────┘                           └────┬────┘
                           └───────────────┬─────────────────────┘
        ┌──────────────────────────────────┼───────────────────────────────┐
        v                                  v                               v
 ┌───────────────┐                ┌─────────────────────┐        ┌─────────────────┐
 │ Cache (Redis) │                │ Primary database    │        │  Message queue  │
 │ seat map,     │                │ (holds, purchases)  │        └────────┬────────┘
 │ event pages   │                └──────────┬──────────┘                 │ jobs
 └───────────────┘                           │ copies                     v
                                             v                     ┌────────────┐
                                  ┌─────────────────────┐          │   Worker   │ ──> tickets, emails,
                                  │ Read replica        │          └────────────┘     refunds
                                  │ (browsing events)   │
                                  └─────────────────────┘
        App servers also call the external Payment provider (card details never touch our servers).
```

### What each component does

- **Client:** shows events and the seat map and sends the buyer's requests.
- **DNS:** turns `tickethub.com` into the addresses of our system, so people can find it.
- **CDN:** serves the event pages, images and the seat-map picture from servers near the buyer, so almost all of the rush for static content never reaches our servers.
- **Rate limiter:** caps how many requests one user or IP address can send, which slows down bots and scripts that try to grab seats.
- **Load balancer:** spreads requests across the app servers and skips any that fail a health check, so no single server is overloaded.
- **Waiting room (virtual queue):** admits buyers to the purchase flow at a controlled pace, in the order they arrived, so the database sees a steady flow instead of 200,000 people at once. This is what makes the sale fair and keeps the system standing.
- **App servers:** run the API code (login checks, holds, orders). They are stateless, so we can add many more before a sale and remove them afterwards.
- **Cache (Redis):** keeps the seat map and event pages in memory for 1 to 2 seconds, so thousands of "which seats are free?" requests are answered without touching the database.
- **Primary database:** the only place that accepts writes, so it can enforce the atomic holds, the transactions and the unique constraints that prevent double-booking.
- **Read replica:** serves event browsing and ticket history so reads never slow down the primary. It is **not** used for deciding seats, because it can lag slightly behind.
- **Message queue:** holds slow jobs such as sending tickets and emails, so a purchase can finish quickly.
- **Worker:** takes jobs from the queue, creates the ticket and sends the email in the background, and processes refunds when a hold expired during payment.
- **Payment provider:** an external service that handles card payments, so we never store card details.

### How it survives the big sale

1. **Prepare in advance.** Before the sale starts, add app servers and warm the cache, because we know exactly when it begins.
2. **Keep static content away from our servers.** The CDN absorbs the page loads, images and seat-map picture.
3. **Cache the seat map for a second or two.** Thousands of repeated seat-map requests turn into one database read per interval.
4. **Control the entrance.** The waiting room admits, for example, about 2,000 buyers at a time. The hold queries are single-row updates by primary key, which a well-configured primary database can usually handle several thousand times per second, so about 670 holds per second on average (about 2,000 in the first seconds) fits within that. Everyone else waits in line and is told their position.
5. **Limit abuse.** Rate limiting, a cap of 4 seats per order, and holds that expire after 5 minutes stop one person or bot from locking up the inventory.
6. **Move slow work out of the way.** Tickets and emails go through the queue, so the buyer's request is not waiting for them.
7. **Fail politely.** If the system is full, the waiting room shows a clear "you are in line" page, and a sold-out event returns "sold out" at once, instead of letting requests pile up.

## 7. Bottlenecks and trade-offs

**What breaks first?** The **primary database**, because every hold and every purchase has to go through it, and thousands of buyers compete for the same set of seat rows. That is why the waiting room, the cache and the CDN exist: they stop the rush from reaching the database all at once.

### Trade-offs

1. **Correctness versus speed.** The hold and purchase transactions go to the primary database and make buyers wait a moment, but this is what guarantees no double-booking. We could answer faster from the cache, but a fast wrong answer means two people with the same seat, which is far worse.
2. **Fairness versus convenience.** The waiting room puts buyers in a line instead of letting everyone in at once. People must wait, but the system stays up, nobody is thrown out by an error, and the order is fair. Without it, whoever has the fastest connection or a bot would win.
3. **Freshness versus load.** The cached seat map can be one or two seconds old, so a buyer sometimes clicks a seat that has just gone and gets a `409`. In exchange, the database is spared from thousands of repeated reads.
4. **Hold length.** A 5-minute hold gives people time to pay, but while a seat is held nobody else can buy it. A longer hold wastes seats when buyers abandon payment, and a shorter hold makes honest buyers lose their seat while typing their card number.
5. **Cost versus reliability.** Adding many servers for a spike that lasts 10 minutes costs money, but crashing during the most important sale of the year costs far more, so we scale up before the sale and back down afterwards.
6. **Simplicity versus scalability.** One primary database is simple and easy to keep correct. If a single database ever became the limit, we could split the data by event (each event's seats on its own database), because buyers of one event never need seats from another.

### Alternatives considered

- **No waiting room, first come first served.** Simpler, but the rush hits the database all at once, which risks a crash and rewards bots.
- **Locking the whole event while someone buys.** It would prevent double-booking but let only one buyer at a time through, so 200,000 buyers would never finish. A single-row `UPDATE` locks only one seat.
- **A NoSQL database.** It scales across servers, but it gives weaker guarantees for transactions and constraints, and correctness is the most important requirement here.

### Risks and open questions

- Bots may still get through the rate limiter, so we may need a human check such as a CAPTCHA at the waiting room.
- The payment provider could be slow or down during the sale. We would need a timeout, a retry with back-off, and a clear message to the user.
- How long should the hold last? It should be tested with real buyers.
