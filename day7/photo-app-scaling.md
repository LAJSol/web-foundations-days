# SnapShare: Scaling Plan

SnapShare is a photo-sharing app. Users **upload photos** and scroll a **feed** of photos from people they follow. This plan estimates the load and designs a system that can handle it.

## 1. Assumptions

- **10 million** registered users
- **10%** of them are active each day
- Each active user uploads **1 photo** per day
- Each active user views **50 feed pages** per day
- An average photo is **2 MB**, and each photo also gets a **50 KB** thumbnail
- One day is about **100,000 seconds** (rounded for easy maths)
- Peak traffic is **5×** the average

**Daily active users (DAU):** 10,000,000 × 10% = **1,000,000 users per day**.

## 2. Estimates

### Uploads per second

- Uploads per day: 1,000,000 users × 1 photo = **1,000,000 uploads per day**
- Average: 1,000,000 ÷ 100,000 = **10 uploads per second**
- Peak (5×): **50 uploads per second**

### Feed views per second

- Feed views per day: 1,000,000 users × 50 pages = **50,000,000 per day**
- Average: 50,000,000 ÷ 100,000 = **500 feed views per second**
- Peak (5×): **2,500 feed views per second**

Each feed page shows about 10 thumbnails, so the thumbnails alone are about **5,000 image requests per second** on average. That is why the images must come from a CDN and not from our servers.

### Photo storage per year

| What                     | Per day                   | Per year                           |
| ------------------------ | ------------------------- | ---------------------------------- |
| Original photos          | 1,000,000 × 2 MB = 2 TB   | 2 TB × 365 = **730 TB**            |
| Thumbnails               | 1,000,000 × 50 KB = 50 GB | 50 GB × 365 ≈ **18 TB**            |
| **Photo files in total** | about 2.05 TB             | about **748 TB (roughly 0.75 PB)** |
| Database records         | 1,000,000 × 1 KB = 1 GB   | 1 GB × 365 ≈ **365 GB**            |

The photo files are about **2,000 times bigger** than the database records. This difference decides where we store them (see section 4).

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are **500 feed views** per second for every **10 uploads** per second, so reads outnumber writes about **50 to 1**.

What this means for the design:

- **Cache** feeds and hot data in memory, so most reads never reach the database.
- Use **read replicas**, so many servers can answer reads while one primary takes the writes.
- Serve photos and thumbnails from a **CDN**, close to the users.
- Writes (10 to 50 per second) are small enough for a single primary database, so we do not need sharding yet.

## 4. Why photos are not stored in the database

Photos should **not** be stored inside the database:

- They are **large files**. 748 TB per year would make the database enormous, slow to back up, and slow to copy to replicas.
- A database is built for **structured rows** that we search and filter. It is not built to store and stream large binary files.
- It is **expensive**. Database storage costs far more per terabyte than file storage.
- It **loads the wrong machines**. Every photo download would go through the database and the app servers instead of a CDN.

Instead, photos go into **object storage** (such as Amazon S3), which is cheap, grows without limit and works well with a CDN. The database keeps only the photo's **metadata** and a **link** (the storage key) to the file.

## 5. Architecture

```text
Browser / mobile app
   │
   ├─(1) DNS lookup ─────────────────────────> DNS
   │
   ├─(2) photos, thumbnails, static files ───> CDN ──(cache miss)──> Object storage
   │                                                                 (photos + thumbnails)
   │
   └─(3) API calls (HTTPS, JSON) ─────────────> Load balancer
                                                     │
                                  ┌──────────────────┴──────────────────┐
                                  v                                     v
                             ┌─────────┐                           ┌─────────┐
                             │  App 1  │                           │  App 2  │   (stateless, identical)
                             └────┬────┘                           └────┬────┘
                                  └───────────────┬─────────────────────┘
                     ┌────────────────────────────┼───────────────────────────┐
                     v                            v                           v
            ┌─────────────────┐        ┌─────────────────────┐       ┌────────────────┐
            │  Cache (Redis)  │        │ Primary database    │       │     Queue      │
            │  feeds, hot     │        │ (all writes)        │       │ (thumbnail     │
            │  data           │        └──────────┬──────────┘       │  jobs)         │
            └─────────────────┘                   │ copies           └───────┬────────┘
                                                  v                          │ jobs
                                       ┌─────────────────────┐               v
                                       │ Read replica        │        ┌────────────┐   saves thumbnail
                                       │ (feed reads)        │        │   Worker   │ ───────────────> Object storage
                                       └─────────────────────┘        └────────────┘
```

## 6. What each component does

- **DNS:** turns `snapshare.com` into the IP addresses of our system, so users can find it by name.
- **CDN:** keeps copies of photos, thumbnails and the web files on servers around the world, so users download them from a nearby server and our servers are not overloaded by about 5,000 image requests per second.
- **Load balancer:** spreads incoming API requests across the app servers and skips any that fail a health check, so no single server is overloaded or becomes a single point of failure.
- **App servers (2 or more):** run the API code (checking logins, validating uploads, building feeds), and because they are stateless, we can add more whenever traffic grows.
- **Cache (Redis):** keeps recent feeds in memory so repeated feed requests are answered in about 1 ms without touching the database, which solves the problem of 500 to 2,500 feed reads per second.
- **Primary database:** the one place that accepts writes (photo records, follows, accounts), so the data has a single correct copy.
- **Read replica:** a copy of the primary that answers feed reads, so reads do not slow down writes, and it can take over if the primary fails.
- **Object storage:** stores the 2 MB originals and 50 KB thumbnails cheaply and without a size limit, which solves the problem of 748 TB per year not fitting in a database.
- **Queue:** holds thumbnail jobs, so the upload can finish immediately instead of making the user wait for the image to be resized.
- **Worker:** takes jobs from the queue and creates thumbnails in the background, so a busy period only makes the queue longer instead of slowing the app.

## 7. Flow: uploading a photo

1. The user picks a photo and the app sends `POST /photos` with the file and the login token. The request goes through **DNS** and reaches the **load balancer**.
2. The load balancer sends it to a healthy **app server**.
3. The app server checks the token to see who the user is, then checks that the file is a real image and not too large.
4. The app server saves the **original photo** (2 MB) in **object storage** and gets back its storage key.
5. The app server writes a new row to the **primary database**: the owner, the caption, the time, the storage key and a status of `processing`.
6. The app server adds a **thumbnail job** to the **queue**, containing the photo id.
7. The app server replies **`201 Created`** straight away. The user does not wait for the thumbnail.
8. In the background, a **worker** takes the job from the queue, reads the original from object storage, makes the 50 KB **thumbnail**, saves it in object storage and updates the database row to `ready`.
9. The **cache** entries for the feeds that should include the new photo are removed or left to expire in a minute, so the next feed request loads fresh data from a replica.
10. When followers open their feeds, the thumbnail and the photo are served by the **CDN**.

## 8. Trade-offs

1. **Speed versus freshness.** We cache feeds for a short time (for example 60 seconds) and read from replicas that can lag by a few milliseconds. This makes feeds very fast, but a new photo might take up to a minute to appear in a follower's feed. For a photo feed that delay is acceptable. For something like a bank balance it would not be.
2. **Fast uploads versus instant thumbnails.** Creating thumbnails in a background queue keeps uploads quick and protects the app during busy periods. The cost is that the thumbnail is not ready for a moment, so the app may briefly show a placeholder.
3. **Cost versus reliability.** Extra app servers, a read replica and a second copy of the data cost more money, but they remove single points of failure. Keeping several copies of 748 TB of photos is expensive, so it is a trade-off made on purpose, because losing users' photos would be far worse.
4. **Simplicity versus scalability.** We keep one primary database and one codebase (a monolith) instead of sharding and microservices. This is simpler to build and run, but it limits how far writes can scale. At 50 uploads per second at peak, that limit is far away.
