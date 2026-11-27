# Audit: Zine Next subscriptions state (2026-11-26)

> **Do not merge.** This is a read-only audit report. Nothing in production was changed:
> only `SELECT` and `PRAGMA` statements were run, no write API was called, nothing was
> deployed, and no application code was touched.

- **Data source:** live production Zine Next D1 database `zine-api-next`
  (`0e55836b-07de-426b-9977-b783b0ea6652`), queried with
  `wrangler d1 execute zine-api-next --remote`. Classic Zine (`zine-db-production`) was
  **not** queried and nothing in this report comes from it.
- **Snapshot time:** Thu Nov 26, 2026, 11:30–11:32 CST (17:30–17:32 UTC). Rolling windows
  are measured from then: **7 days** = since Nov 19 11:30 CST; **30 days** = since Oct 27
  11:30 CST.
- **Times:** all America/Chicago, **CST (UTC−6)**, unless marked UTC.
- **Owner:** only one account exists in Zine Next. It has 5,728 personal items
  (1,415 saved, 3,027 Inbox) and all 98 subscriptions. Its internal ID is redacted.

## 1. Executive summary

- **98 subscriptions: 90 active, 8 unsubscribed.** 51 YouTube, 25 Spotify, 18 web/blog
  feeds, 2 RSS podcasts, 1 Substack, 1 X. All 8 unsubscribed ones are blog feeds.
- **Only 5 have `auto_save` on** (Next Token, WVFRM Podcast, Dithering, Notes On Work,
  Practical AI). The other 93 deliver to **Inbox** (`status='received'`), not the library.
- **What Zine Next has delivered itself:** 224 items since its first poll on Nov 8.
  - **Last 7 days:** 88 items: **9 saved to the library, 79 to Inbox**.
  - **Last 30 days:** 224 items: **20 saved, 204 to Inbox**. That is everything Zine Next has
    delivered; it only started polling on Nov 8.
  - Nothing has been auto-dismissed or deleted. No YouTube Shorts URLs were delivered.
- **40 subscriptions (32 active) have never delivered anything in Zine Next.** 36 active
  subscriptions have delivered nothing in the last 14 days. For most of them the feed is
  polled successfully and simply has had nothing new since Nov 11.
- **3 active subscriptions are erroring right now:**
  1. **X: joel (`x.com/joelhooks`) is still failing with `provider_http_402`.** Its last
     success was **Nov 8 18:06 CST** (Nov 9 00:06 UTC). It has failed **4,111 times**
     since then, and the latest failure was today at 11:21 CST. It is still `active`,
     so it is retried about every 15 minutes indefinitely.
  2. **Huberman Lab** (`feeds.megaphone.fm/hubermanlab`) is failing with
     `source_too_large`. Its last success was **Nov 11 10:45 CST**. It has failed 3,305
     times and delivered nothing since moving to Zine Next.
  3. **Stories by Steve Yegge on Medium** has a transient `rate_limited` error. It last
     succeeded today at 10:36 CST, and a retry is queued.
- **Polling is working**, though slower than designed. 88 subscriptions had at least one
  successful poll in the last 24 hours. The average gap between successful polls was 19.1
  minutes, but 21% of gaps were over 30 minutes, and the longest was 76 minutes.
  No active subscription is more than an hour overdue except the two that keep failing
  (X and Huberman Lab).
- **Past incidents found in the data:**
  - Every YouTube subscription failed with `source_not_found` from Nov 11 19:50 CST to
    Nov 16 01:56 CST (about 4.25 days). This produced about 15,400 failed polls. All have
    recovered.
  - On Nov 12–16 there was no successful poll at all for 4–6.5 hours each afternoon or
    evening.
  - Gaps of 60–82 minutes happened on Nov 22, Nov 25 and Nov 26.

## 2. Overall counts

| Measure                                                                                                     |                                              Count |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------: |
| Subscriptions (all)                                                                                         |                                             **98** |
| Active / unsubscribed                                                                                       |                                         **90 / 8** |
| `auto_save` on / off                                                                                        |                      **5 / 93**. All 5 are active. |
| Delivered by Zine Next, last 7 days: saved / Inbox                                                          |                                    **9 / 79** (88) |
| Delivered by Zine Next, last 30 days: saved / Inbox                                                         |                                 **20 / 204** (224) |
| Delivered by Zine Next, all time                                                                            |               224 (first delivery Nov 8 09:45 CST) |
| Of the 20 saved: auto-saved (`decision_origin='automatic'`) / saved by hand from Inbox                      |                                             19 / 1 |
| Active and erroring now (`last_error_code` set)                                                             | **3**: X joel, Huberman Lab, Steve Yegge on Medium |
| Active and stale (last success or `next_poll_at` > 1 h old)                                                 |                        **2**: X joel, Huberman Lab |
| Active with no delivery in 14+ days                                                                         |                                             **36** |
| Never delivered in Zine Next: total / active                                                                |                                        **40 / 32** |
| Sync (poll) jobs ever: succeeded / failed / pending                                                         |                              111,845 / 22,869 / 32 |
| Subscription occurrences copied from classic Zine (`zine:legacy-import`), excluded from all delivery counts |                                              4,332 |

Deliveries by platform:

| Platform         | Subscriptions (active) | Delivered 7d |                   Delivered 30d |
| ---------------- | ---------------------: | -----------: | ------------------------------: |
| YouTube          |                51 (51) |           56 |                             130 |
| Spotify          |                25 (25) |           26 |                              55 |
| Web / blog feeds |                18 (10) |            5 |                               6 |
| RSS podcasts     |                  2 (2) |            1 |                               5 |
| Substack         |                  1 (1) |            0 |                               1 |
| X                |                  1 (1) |            0 | 27 (all Nov 8, before it broke) |

**How "delivered" is counted.** The Nov 11 migration copied 4,332 historical subscription
arrivals from classic Zine into `save_occurrences`. Those rows have
`contributor='zine:legacy-import'` and keep their original classic timestamps. 209 of them
fall inside the 30-day window (Oct 27 to Nov 11). They are **not** things Zine Next fetched,
so every delivery count in this report uses only `contributor='zine:subscription'`. If you
count them in, the per-subscription 30-day figures look larger. For example, Huberman Lab
would show 4 items, even though Zine Next has delivered none for it.

"Saved" and "Inbox" mean the item's **current** `personal_items.status`. One item delivered
to Inbox was later saved by hand; it is counted as saved.

## 3. Health findings

### 3.1 Erroring or stale active subscriptions

| Subscription                                          | Error               | Last success (CST)                |               Failed polls | Since                     | Next poll (CST) | Assessment                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------- | --------------------------------- | -------------------------: | ------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X: joel ⛈️ (`x_account`, x.com/joelhooks)             | `provider_http_402` | **Nov 8 18:06** (Nov 9 00:06 UTC) |                      4,111 | Nov 8 18:25 CST           | Nov 26 11:22    | **Broken for 17.7 days.** X's API returns 402 Payment Required. It had 215 successful polls on Nov 8 and delivered 27 items (all to Inbox) before failing. Each failure is a single attempt (`attempts=1`), so the error is treated as non-retryable. |
| Huberman Lab (`feed`, feeds.megaphone.fm/hubermanlab) | `source_too_large`  | **Nov 11 10:45** (16:45 UTC)      |                      3,305 | Nov 11 12:55 CST          | Nov 26 11:22    | **Broken for 15 days.** The feed is bigger than the fetch size limit. Zine Next has delivered nothing for it.                                                                                                                                         |
| Stories by Steve Yegge on Medium (`feed`)             | `rate_limited`      | Nov 26 10:36                      | 3 failed + 1 pending retry | intermittent since Nov 12 | Nov 26 11:23    | Transient. Medium rate-limits the feed now and then, and it keeps recovering. It has delivered nothing since Nov 11.                                                                                                                                  |

No other active subscription has a `last_error_code`, and none is more than an hour
overdue. At the snapshot, the most overdue healthy subscriptions had `next_poll_at`
around 10:51 CST, about 40 minutes behind, with 32 poll jobs already queued.

### 3.2 X subscription and `provider_http_402`

**It is still failing. Nothing has changed since the Nov 9 evidence.**

| Field              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Source             | joel ⛈️, https://x.com/joelhooks, route `x_account`                    |
| Status / auto_save | `active` / off                                                         |
| Created            | Nov 8 11:26 CST (17:26 UTC)                                            |
| Last success       | Nov 8 18:06:28 CST (Nov 9 00:06:28 UTC)                                |
| `last_error_code`  | `provider_http_402`                                                    |
| First 402 failure  | Nov 8 18:25 CST (Nov 9 00:25 UTC)                                      |
| Latest 402 failure | Nov 26 11:21 CST (17:21 UTC)                                           |
| Poll jobs          | 215 succeeded, **4,111 failed** (all `provider_http_402`)              |
| Deliveries         | 27 total, all to Inbox, between Nov 8 11:47 and 18:05 CST. None since. |

### 3.3 Past outages visible in the job log

| Window (CST)                                                                                                      | What happened                                                                                          | Scope                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nov 11 19:50 to Nov 16 01:56                                                                                      | Every YouTube poll failed with `source_not_found`, about 15,400 failed jobs. Each job tried 2–4 times. | All 51 YouTube subscriptions. Fireship, the only YouTube subscription created in Zine Next itself, had started failing earlier: Nov 8 18:50 to Nov 10 01:55 CST, then again from Nov 10 18:45 CST. All have succeeded since Nov 16. |
| Nov 12 13:45 to 18:00, Nov 13 12:05 to 18:00, Nov 14 11:30 to 18:00, Nov 15 11:45 to 18:00, Nov 16 12:31 to 18:00 | No successful poll of any kind. Each gap ends at exactly 00:00 UTC.                                    | All subscriptions                                                                                                                                                                                                                   |
| Nov 22, 07:26 to 08:45 and 16:17 to 17:35                                                                         | Gaps of 79 and 78 minutes with no successful poll                                                      | All subscriptions                                                                                                                                                                                                                   |
| Nov 25, 10:48 to 12:10                                                                                            | 82-minute gap. The cron heartbeat records a failure at 14:45 CST (20:45 UTC) the same day.             | All subscriptions                                                                                                                                                                                                                   |
| Nov 25 23:57 to Nov 26 01:00                                                                                      | 63-minute gap                                                                                          | All subscriptions                                                                                                                                                                                                                   |

Only gaps over 30 minutes are listed. The previous report described a scheduler stall on
the evening of Nov 24 (CST). In this data, the gaps around then are 35–38 minutes long.

Gaps that end at exactly 00:00 UTC are consistent with a daily quota or limit resetting.
The data does not show the cause. Whether entries published during these gaps were missed
cannot be determined from D1: when a feed comes back, its recent entries are delivered,
and anything that has already dropped off the end of the feed is gone without a trace.

### 3.4 Scheduler heartbeat (`service_checks`, `name='cron'`)

| started_at          | succeeded_at        | failed_at           | error_category |
| ------------------- | ------------------- | ------------------- | -------------- |
| Nov 26 11:30:02 CST | Nov 26 11:21:03 CST | Nov 25 14:45:10 CST | —              |

The cron was running when the snapshot was taken. Its last completed run succeeded at
11:21 CST.

### 3.5 Poll cadence over the last 24 hours

| Measure                                                       |                              Value |
| ------------------------------------------------------------- | ---------------------------------: |
| Successful polls                                              |   6,312, covering 88 subscriptions |
| Failed polls                                                  | 320 (X joel and Huberman Lab only) |
| Average gap between successful polls of the same subscription |                           19.1 min |
| Gaps over 30 min / over 60 min                                |                   1,328 (21%) / 91 |
| Longest gap                                                   |                           75.9 min |

The design target is 15–20 minutes. The average meets it, but one gap in five is longer
than 30 minutes.

## 4. Subscriptions by platform

Columns:

- **Created**: the subscription's `created_at`. The 92 subscriptions migrated on Nov 11
  keep their original creation date from classic Zine. The six created natively in Zine
  Next all date from Nov 8.
- **Last success**: shown in **bold** when it is more than an hour old.
- **Poll jobs ok / failed**: counts of `jobs` rows with `kind='sync'`, all time.
- **Unsubscribed** rows stopped polling at the time of migration (Nov 11 CST), so their
  "Last success" is from classic Zine.
- **Filter**: `podcast_episode` means only podcast episodes are taken from that feed.
- **Initialized**: all 98 subscriptions are initialized.

### YouTube — 51 (51 active, 0 unsubscribed)

| Source                                                                                      | Route          | Status | auto_save | Filter | Created (CST) | Last success (CST) | last_error_code | Poll jobs ok / failed        |
| ------------------------------------------------------------------------------------------- | -------------- | ------ | --------- | ------ | ------------- | ------------------ | --------------- | ---------------------------- |
| [0xSero](https://www.youtube.com/channel/UCeNLqAes-kUMjWksPA6d-BA)                          | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:20       | —               | 766 / 355 (source_not_found) |
| [368](https://www.youtube.com/channel/UC8H50KowIQWcT73BMIe4Uzw)                             | `youtube_feed` | active | off       | —      | 2026-07-01    | Nov 26 10:36       | —               | 764 / 289 (source_not_found) |
| [A Life Engineered](https://www.youtube.com/channel/UCEHFikgnRuLd1HYKTLrae9Q)               | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 767 / 303 (source_not_found) |
| [Aaron Francis](https://www.youtube.com/channel/UCbixkBITOOa2XNviJLxMh2w)                   | `youtube_feed` | active | off       | —      | 2026-03-26    | Nov 26 11:21       | —               | 764 / 313 (source_not_found) |
| [Acquired](https://www.youtube.com/channel/UCyFqFYfTW2VoIQKylJ04Rtw)                        | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:36       | —               | 777 / 282 (source_not_found) |
| [adamdotdev](https://www.youtube.com/channel/UCbhaVsMxGb1iStytgB0w9Wg)                      | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 764 / 304 (source_not_found) |
| [All-In Podcast](https://www.youtube.com/channel/UCESLZhusAkFfsNsApnjF_Cg)                  | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 790 / 317 (source_not_found) |
| [Amp, Inc.](https://www.youtube.com/channel/UCTBO4_LccT2C8THAOS_W-kQ)                       | `youtube_feed` | active | off       | —      | 2026-01-22    | Nov 26 10:36       | —               | 764 / 307 (source_not_found) |
| [Armin Ronacher](https://www.youtube.com/channel/UC-mexo-76-J1MlQM8NkWCYw)                  | `youtube_feed` | active | off       | —      | 2026-04-11    | Nov 26 11:21       | —               | 769 / 302 (source_not_found) |
| [Book Overflow](https://www.youtube.com/channel/UC1U09Fb_5oEBo0mutiNYh5w)                   | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 768 / 372 (source_not_found) |
| [Boundary](https://www.youtube.com/channel/UCt9WqM6o0y5YGqQm1nffFWQ)                        | `youtube_feed` | active | off       | —      | 2026-10-23    | Nov 26 11:21       | —               | 769 / 324 (source_not_found) |
| [CaseyNeistat](https://www.youtube.com/channel/UCtinbF-Q-fVthA0qrFQTgXQ)                    | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 781 / 338 (source_not_found) |
| [Channel 5 with Andrew Callaghan](https://www.youtube.com/channel/UC-AQKm7HUNMmxjdS371MSwg) | `youtube_feed` | active | off       | —      | 2026-03-01    | Nov 26 11:21       | —               | 786 / 325 (source_not_found) |
| [Chris Williamson](https://www.youtube.com/channel/UCIaH-gZIVC432YRjNVvnyCA)                | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 771 / 249 (source_not_found) |
| [David Dobrik](https://www.youtube.com/channel/UCmh5gdwCx6lN7gEC20leNVA)                    | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:36       | —               | 770 / 274 (source_not_found) |
| [David Senra](https://www.youtube.com/channel/UCy2FPslt0LLPsIV0iukvHpQ)                     | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 764 / 264 (source_not_found) |
| [Diggnation](https://www.youtube.com/channel/UC24RSoLcjiNZbQcT54j5l7Q)                      | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 763 / 277 (source_not_found) |
| [Dwarkesh Patel](https://www.youtube.com/channel/UCXl4i9dYBrFOabk0xGmbkRA)                  | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 774 / 236 (source_not_found) |
| [Fireship](https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA)                        | `youtube_feed` | active | off       | —      | 2026-11-08    | Nov 26 11:21       | —               | 962 / 381 (source_not_found) |
| [Founders Podcast](https://www.youtube.com/channel/UCQ-rrUCsJLNjFdPtKq0YOfA)                | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 764 / 351 (source_not_found) |
| [Friends Keep Secrets](https://www.youtube.com/channel/UCHG7ZKVHfuZ_aQ_J-y4Mm0g)            | `youtube_feed` | active | off       | —      | 2026-04-09    | Nov 26 10:40       | —               | 778 / 385 (source_not_found) |
| [HumanLayer](https://www.youtube.com/channel/UCXbKJbY84LOVJ78HmYfs0pg)                      | `youtube_feed` | active | off       | —      | 2026-10-23    | Nov 26 10:40       | —               | 778 / 385 (source_not_found) |
| [Intelligence Snacks](https://www.youtube.com/channel/UCGVpiP_odkzPHkX0x1GMX1w)             | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 768 / 325 (source_not_found) |
| [Johnny Harris](https://www.youtube.com/channel/UCmGSJVG3mCRXVOP4yZrU1Dw)                   | `youtube_feed` | active | off       | —      | 2026-01-26    | Nov 26 10:40       | —               | 778 / 241 (source_not_found) |
| [Kevin Rose](https://www.youtube.com/channel/UCSYG0DaTjEpo9LlE-f_1L1g)                      | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 766 / 310 (source_not_found) |
| [Latent Space](https://www.youtube.com/channel/UCxBcwypKK-W3GHd_RZ9FZrQ)                    | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 779 / 279 (source_not_found) |
| [Lenny's Podcast](https://www.youtube.com/channel/UC6t1O76G0jYXOAoYCm153dA)                 | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 776 / 249 (source_not_found) |
| [Lex Fridman](https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA)                     | `youtube_feed` | active | off       | —      | 2026-01-31    | Nov 26 11:21       | —               | 789 / 273 (source_not_found) |
| [Marques Brownlee](https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ)                | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 803 / 273 (source_not_found) |
| [Mostly Technical](https://www.youtube.com/channel/UCR0cr-kQrZBrb6KXhZw0LcQ)                | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 765 / 285 (source_not_found) |
| [Nerd Snipe](https://www.youtube.com/channel/UC2mPtIOYm1XihpmfrJKXjMw)                      | `youtube_feed` | active | off       | —      | 2026-04-30    | Nov 26 11:20       | —               | 768 / 272 (source_not_found) |
| [Next Token](https://www.youtube.com/channel/UCGT0936F0OdWPDs0NTWsGcA)                      | `youtube_feed` | active | **on**    | —      | 2026-06-29    | Nov 26 11:21       | —               | 760 / 269 (source_not_found) |
| [Out Of Office Podcast](https://www.youtube.com/channel/UCbBKrunbELcj5firUyU3jag)           | `youtube_feed` | active | off       | —      | 2026-02-10    | Nov 26 10:36       | —               | 767 / 266 (source_not_found) |
| [Pitstop](https://www.youtube.com/channel/UCejM7PwJ9KYq54mTpZu5TqA)                         | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 775 / 325 (source_not_found) |
| [PowerfulJRE](https://www.youtube.com/channel/UCzQUP1qoWDoEbmsQxvdjxgQ)                     | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 783 / 229 (source_not_found) |
| [Ryan Peterman](https://www.youtube.com/channel/UCzB7YGrrxDC_POenf86H3_Q)                   | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 781 / 369 (source_not_found) |
| [Sharp Tech Podcast](https://www.youtube.com/channel/UCbGy2YOZaQ2ZqCkixSokTKQ)              | `youtube_feed` | active | off       | —      | 2026-10-23    | Nov 26 11:22       | —               | 773 / 349 (source_not_found) |
| [Sources Podcast](https://www.youtube.com/channel/UCzQhJdDA5JBy_-EX5ZG88oQ)                 | `youtube_feed` | active | off       | —      | 2026-01-21    | Nov 26 11:22       | —               | 768 / 312 (source_not_found) |
| [Stripe](https://www.youtube.com/channel/UCM1guA1E-RHLO2OyfQPOkEQ)                          | `youtube_feed` | active | off       | —      | 2026-02-17    | Nov 26 11:21       | —               | 771 / 267 (source_not_found) |
| [TerminalDotShop](https://www.youtube.com/channel/UC4E2FSKc5czySVKqdsoR26A)                 | `youtube_feed` | active | off       | —      | 2026-02-14    | Nov 26 11:21       | —               | 767 / 311 (source_not_found) |
| [The Nine Club](https://www.youtube.com/channel/UCw7EwvJ6--_ML2ilnopcG8A)                   | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 769 / 327 (source_not_found) |
| [The Pragmatic Engineer](https://www.youtube.com/channel/UCPbwhExawYrn9xxI21TFfyw)          | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 776 / 321 (source_not_found) |
| [The PrimeTime](https://www.youtube.com/channel/UCUyeluBRhGPCW4rPe_UvBZQ)                   | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 788 / 337 (source_not_found) |
| [The Red Flags Podcast](https://www.youtube.com/channel/UCu11ZT61enZS0WfuFG3vRKQ)           | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 762 / 277 (source_not_found) |
| [The Studio](https://www.youtube.com/channel/UCG7J20LhUeLl6y_Emi7OJrA)                      | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 781 / 241 (source_not_found) |
| [The Top Shelf Podcast](https://www.youtube.com/channel/UCSVd1s6uK8lzmPjaQXc2yqQ)           | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 763 / 289 (source_not_found) |
| [The Verge](https://www.youtube.com/channel/UCddiUEpeqJcYeBxX1IVBKvQ)                       | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 781 / 314 (source_not_found) |
| [Theo - t3․gg](https://www.youtube.com/channel/UCbRP3c757lWg9M-U7TyEkXA)                    | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 10:40       | —               | 777 / 258 (source_not_found) |
| [TheStandupPod](https://www.youtube.com/channel/UC1Qs8NS1cGoJFm4xGgaCs5A)                   | `youtube_feed` | active | off       | —      | 2026-08-28    | Nov 26 11:20       | —               | 766 / 316 (source_not_found) |
| [typecraft](https://www.youtube.com/channel/UCo71RUe6DX4w-Vd47rFLXPg)                       | `youtube_feed` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 771 / 268 (source_not_found) |
| [WVFRM Podcast](https://www.youtube.com/channel/UCEcrRXW3oEYfUctetZTAWLw)                   | `youtube_feed` | active | **on**    | —      | 2026-01-19    | Nov 26 10:40       | —               | 780 / 353 (source_not_found) |

### Spotify — 25 (25 active, 0 unsubscribed)

| Source                                                                                                                  | Route          | Status | auto_save | Filter | Created (CST) | Last success (CST) | last_error_code | Poll jobs ok / failed |
| ----------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | --------- | ------ | ------------- | ------------------ | --------------- | --------------------- |
| [Accidental Tech Podcast](https://open.spotify.com/show/76h8fh9KK3boiMrQ340lV4)                                         | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:36       | —               | 2583 / 0              |
| [Acquired](https://open.spotify.com/show/7Fj0XEuUQLUqoMZQdsLXqp)                                                        | `spotify_show` | active | off       | —      | 2026-03-03    | Nov 26 10:37       | —               | 2582 / 0              |
| [Age of Miracles](https://open.spotify.com/show/6k1YLBvORRMyosKy3x1xIl)                                                 | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2580 / 0              |
| [Artificially Unintelligent](https://open.spotify.com/show/63dpZtcfcfAC3CMn08u8IO)                                      | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2598 / 0              |
| [Asianometry](https://open.spotify.com/show/4dzR3d4gnz5N4piz1TPo8M)                                                     | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 2601 / 0              |
| [Changelog Master Feed](https://open.spotify.com/show/0S1h5K7jm2YvOcM7y1ZMXY)                                           | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 2582 / 0              |
| [CoRecursive: Coding Stories](https://open.spotify.com/show/6XU1MRwzCfAXD07YHbpjNv)                                     | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:36       | —               | 2597 / 0              |
| [Cortex](https://open.spotify.com/show/4Lw4qmTGLzoTnM0Vris3fO)                                                          | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2583 / 0              |
| [Dan Carlin's Hardcore History](https://open.spotify.com/show/72qiPaoDRf8HkGKEChvG5q)                                   | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:36       | —               | 2583 / 0              |
| [Dan Carlin's Hardcore History: Addendum](https://open.spotify.com/show/4LKZNYgHWlQe7jOIbgkVMz)                         | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 1732 / 0              |
| [Dev Interrupted](https://open.spotify.com/show/7icMkauSvLflWCpQrfafIv)                                                 | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2580 / 0              |
| [devtools.fm: Developer Tools, Open Source, Software Development](https://open.spotify.com/show/142I2b9HGjWhRgPXhOYUnN) | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2598 / 0              |
| [Dithering](https://open.spotify.com/show/2qrjQTO7wFlkAs6juz1w1W)                                                       | `spotify_show` | active | **on**    | —      | 2026-01-19    | Nov 26 10:37       | —               | 2589 / 0              |
| [Micro-Frontends in the trenches](https://open.spotify.com/show/0W5YEY5T3ApuYS8H9I3DzL)                                 | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 869 / 0               |
| [Notes On Work - by Caleb Porzio](https://open.spotify.com/show/3bjXYor6EEeBOhLNfj7W3q)                                 | `spotify_show` | active | **on**    | —      | 2026-01-19    | Nov 26 11:22       | —               | 2595 / 0              |
| [Oxide and Friends](https://open.spotify.com/show/1OIFxTivR0D9clY3sZi4rA)                                               | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 2576 / 0              |
| [Sharp Tech with Ben Thompson](https://open.spotify.com/show/4vk2MfVMEAuOnTWUOz6lnE)                                    | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:22       | —               | 2604 / 0              |
| [Software Huddle](https://open.spotify.com/show/5Zn3RXvUx1425hhfr5FnUC)                                                 | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2592 / 0              |
| [StaffEng](https://open.spotify.com/show/4GUCKSlaFqQiShJBOP4nEe)                                                        | `spotify_show` | active | off       | —      | 2026-04-10    | Nov 26 11:21       | —               | 1738 / 0              |
| [Stratechery](https://open.spotify.com/show/1jRACH7L8EQCYKc5uW7aPk)                                                     | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:36       | —               | 2607 / 0              |
| [The Builders](https://open.spotify.com/show/6xwNdR1L1jtB5XP8SRx0v3)                                                    | `spotify_show` | active | off       | —      | 2026-11-08    | Nov 26 10:37       | —               | 1094 / 0              |
| [The Important Thing](https://open.spotify.com/show/2n0X530af12ZgdZrWnSsvU)                                             | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2583 / 0              |
| [The Talk Show With John Gruber](https://open.spotify.com/show/0zMjZN2RsNmOz21tpjpA78)                                  | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 10:37       | —               | 2595 / 0              |
| [Two's Complement](https://open.spotify.com/show/52irDllU36Y3mOBbBIxyNd)                                                | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 2592 / 0              |
| [Whiskey Web and Whatnot](https://open.spotify.com/show/19jiuHAqzeKnkleQUpZxDf)                                         | `spotify_show` | active | off       | —      | 2026-01-19    | Nov 26 11:21       | —               | 2597 / 0              |

### RSS (podcast feeds) — 2 (2 active, 0 unsubscribed)

| Source                                                                      | Route  | Status | auto_save | Filter          | Created (CST) | Last success (CST) | last_error_code | Poll jobs ok / failed |
| --------------------------------------------------------------------------- | ------ | ------ | --------- | --------------- | ------------- | ------------------ | --------------- | --------------------- |
| [JS Party: JavaScript, CSS, Web Development](https://changelog.com/jsparty) | `feed` | active | off       | podcast_episode | 2026-11-08    | Nov 26 11:21       | —               | 1111 / 0              |
| [Practical AI](https://practicalai.show/)                                   | `feed` | active | **on**    | podcast_episode | 2026-11-08    | Nov 26 11:21       | —               | 1302 / 0              |

### Substack — 1 (1 active, 0 unsubscribed)

| Source                                                                   | Route  | Status | auto_save | Filter | Created (CST) | Last success (CST) | last_error_code | Poll jobs ok / failed |
| ------------------------------------------------------------------------ | ------ | ------ | --------- | ------ | ------------- | ------------------ | --------------- | --------------------- |
| [Building Healthier by Ben Hsu](https://buildinghealthier.substack.com/) | `feed` | active | off       | —      | 2026-11-08    | Nov 26 10:40       | —               | 1090 / 0              |

### Web / blog feeds (migrated RSS) — 18 (10 active, 8 unsubscribed)

| Source                                                              | Route  | Status           | auto_save | Filter | Created (CST) | Last success (CST) | last_error_code        | Poll jobs ok / failed                                    |
| ------------------------------------------------------------------- | ------ | ---------------- | --------- | ------ | ------------- | ------------------ | ---------------------- | -------------------------------------------------------- |
| [Ajey Gore](https://ajeygore.in/)                                   | `feed` | active           | off       | —      | 2026-05-26    | Nov 26 11:21       | —                      | 875 / 12 (source_access_restricted,source_dns_not_found) |
| [Armin Ronacher's Thoughts and Writings](https://lucumr.pocoo.org/) | `feed` | active           | off       | —      | 2026-03-22    | Nov 26 11:21       | —                      | 879 / 0                                                  |
| [Boris Tane](https://boristane.com/)                                | `feed` | active           | off       | —      | 2026-03-15    | Nov 26 10:40       | —                      | 1740 / 0                                                 |
| [Huberman Lab](https://www.hubermanlab.com/)                        | `feed` | active           | off       | —      | 2026-09-17    | **Nov 11 10:45**   | **`source_too_large`** | 0 / 3305 (source_too_large)                              |
| [Mitchell Hashimoto](https://mitchellh.com/)                        | `feed` | active           | off       | —      | 2026-04-29    | Nov 26 11:21       | —                      | 874 / 0                                                  |
| [Peter Steinberger](https://steipete.me/)                           | `feed` | active           | off       | —      | 2026-02-28    | Nov 26 10:40       | —                      | 881 / 0                                                  |
| [seangoedecke.com RSS feed](https://seangoedecke.com/)              | `feed` | active           | off       | —      | 2026-02-23    | Nov 26 10:40       | —                      | 894 / 0                                                  |
| [Solving the decision problem](https://sunilpai.dev/)               | `feed` | active           | off       | —      | 2026-05-28    | Nov 26 10:40       | —                      | 881 / 0                                                  |
| [Stories by Steve Yegge on Medium](https://medium.com/@steve-yegge) | `feed` | active           | off       | —      | 2026-02-22    | Nov 26 10:36       | **`rate_limited`**     | 797 / 3 (rate_limited)                                   |
| [The Shape of the System](https://shapeofthesystem.com/posts)       | `feed` | active           | off       | —      | 2026-07-01    | Nov 26 10:40       | —                      | 872 / 0                                                  |
| [Jamie Tanna \| Software Engineer](https://www.jvt.me/)             | `feed` | **unsubscribed** | off       | —      | 2026-07-24    | Aug 14 12:46       | —                      | 0 / 0                                                    |
| [Julia Evans](https://jvns.ca/)                                     | `feed` | **unsubscribed** | off       | —      | 2026-07-24    | Aug 14 11:46       | —                      | 0 / 0                                                    |
| [Rands in Repose](https://randsinrepose.com/)                       | `feed` | **unsubscribed** | off       | —      | 2026-03-29    | Sep 15 02:45       | —                      | 0 / 0                                                    |
| [Rands in Repose](https://randsinrepose.com/)                       | `feed` | **unsubscribed** | off       | —      | 2026-04-19    | Sep 15 02:45       | —                      | 0 / 0                                                    |
| [Simon Willison's Weblog](http://simonwillison.net/)                | `feed` | **unsubscribed** | off       | —      | 2026-02-25    | Sep 15 02:45       | —                      | 0 / 0                                                    |
| [Stratechery by Ben Thompson](https://stratechery.com/)             | `feed` | **unsubscribed** | off       | —      | 2026-03-16    | Sep 15 02:45       | —                      | 0 / 0                                                    |
| [Web Directions](https://webdirections.org/)                        | `feed` | **unsubscribed** | off       | —      | 2026-03-17    | Sep 15 02:45       | —                      | 0 / 0                                                    |
| [Westenberg.](https://www.joanwestenberg.com/)                      | `feed` | **unsubscribed** | off       | —      | 2026-04-06    | Jun 6 23:45        | —                      | 0 / 0                                                    |

### X — 1 (1 active, 0 unsubscribed)

| Source                             | Route       | Status | auto_save | Filter | Created (CST) | Last success (CST) | last_error_code         | Poll jobs ok / failed          |
| ---------------------------------- | ----------- | ------ | --------- | ------ | ------------- | ------------------ | ----------------------- | ------------------------------ |
| [joel ⛈️](https://x.com/joelhooks) | `x_account` | active | off       | —      | 2026-11-08    | **Nov 8 18:06**    | **`provider_http_402`** | 215 / 4111 (provider_http_402) |

**Duplicates and oddities.** _Rands in Repose_ appears twice (feeds `/feed` and `/rss`),
and both are unsubscribed. _Acquired_ has both a YouTube and a Spotify subscription, and
neither has delivered anything in Zine Next. _Stratechery_ is followed on Spotify
(active); the _Stratechery by Ben Thompson_ blog feed is unsubscribed.

## 5. What the subscriptions produced

Counts include only items that Zine Next fetched itself (`contributor='zine:subscription'`):

- **saved**: the item is now `status='saved'` (library).
- **Inbox**: the item is now `status='received'`.
- **Most recent delivery**: the `save_occurrences.created_at` of the newest delivery, the
  item's current status, and its title.
- **none** in bold: the subscription has never delivered anything in Zine Next.

### YouTube

| Source                          | 7d saved | 7d Inbox | 30d saved | 30d Inbox | Most recent delivery (CST) | Status   | Title                                                                                                                                    |
| ------------------------------- | -------: | -------: | --------: | --------: | -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0xSero                          |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| 368                             |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| A Life Engineered               |        0 |        2 |         0 |         4 | Nov 23 07:26               | received | [How To Build Your Chief Of Staff \| Peter Yang](https://www.youtube.com/watch?v=OE4lIN235EQ)                                            |
| Aaron Francis                   |        0 |        0 |         0 |         1 | Nov 11 16:12               | received | [I built a private Google Docs for me and Claude](https://www.youtube.com/watch?v=yxFf4P3GOAM)                                           |
| Acquired                        |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| adamdotdev                      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| All-In Podcast                  |        0 |        2 |         0 |         4 | Nov 24 06:45               | received | [Crowdstrike CEO: AI Cyberattack Wave, Hyperspeed Hacks, & The Patching Problem](https://www.youtube.com/watch?v=o6KIjtkRdOI)            |
| Amp, Inc.                       |        0 |        0 |         0 |         1 | Nov 18 08:07               | received | [Raising an Agent - Features Are Meaningless Now (Season 2, Episode 8)](https://www.youtube.com/watch?v=LAofDfe5s_Q)                     |
| Armin Ronacher                  |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| Book Overflow                   |        0 |        1 |         0 |         3 | Nov 24 06:36               | received | [Genius Doesn't Grind - A Mind at Play by Jimmy Soni and Rob Goodman](https://www.youtube.com/watch?v=Nh4fPJoYt-Y)                       |
| Boundary                        |        0 |        1 |         0 |         2 | Nov 25 14:56               | received | [AI Can Write Code. But Can It Build GOOD Software?](https://www.youtube.com/watch?v=3WSxv4vzLhM)                                        |
| CaseyNeistat                    |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| Channel 5 with Andrew Callaghan |        0 |        0 |         0 |         2 | Nov 19 11:20               | received | [The Dark Reality of Memecoins & U.S. Government Corruption - 5CAST (#27) Ft. Ben McKenzie](https://www.youtube.com/watch?v=wWidJf6XNlc) |
| Chris Williamson                |        0 |        7 |         0 |        15 | Nov 26 10:20               | received | [Q&A: Age Gaps, Sexual Frustration & Performance Anxiety](https://www.youtube.com/watch?v=kIQPEWLfp5Y)                                   |
| David Dobrik                    |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| David Senra                     |        0 |        2 |         0 |         4 | Nov 25 07:26               | received | [A Deep Dive Into Palmer Luckey’s Bank \| Jacob Hirshman, Erebor](https://www.youtube.com/watch?v=O_dAi5KlVO0)                           |
| Diggnation                      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| Dwarkesh Patel                  |        0 |        1 |         0 |         3 | Nov 24 16:02               | received | [Responding to objections to recursive self-improvement](https://www.youtube.com/watch?v=Em6tbhj9o6A)                                    |
| Fireship                        |        0 |        4 |         0 |         9 | Nov 25 12:12               | received | [Math's million dollar problem is solved... and nobody knows how](https://www.youtube.com/watch?v=Jatwf_XOncE)                           |
| Founders Podcast                |        0 |        0 |         0 |         1 | Nov 19 07:31               | received | [The Most Inspiring Autobiography I've Ever Read: Born of This Land: Chung Ju yung](https://www.youtube.com/watch?v=_DSOxu2tLVY)         |
| Friends Keep Secrets            |        0 |        1 |         0 |         2 | Nov 24 08:25               | received | [The Friendsgiving Episode \| Friends Keep Secrets](https://www.youtube.com/watch?v=PYjY7jtfvNk)                                         |
| HumanLayer                      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| Intelligence Snacks             |        0 |        1 |         0 |         3 | Nov 25 19:10               | received | [Intelligence Snacks 82 - The Slop Horizon](https://www.youtube.com/watch?v=cExHta2phT4)                                                 |
| Johnny Harris                   |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| Kevin Rose                      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| Latent Space                    |        0 |        2 |         0 |         4 | Nov 25 16:36               | received | [The Revolution vs The Renaissance — Thariq Shihipar, OpenAI](https://www.youtube.com/watch?v=Qe9d9dWyED0)                               |
| Lenny's Podcast                 |        0 |        1 |         0 |         2 | Nov 22 08:51               | received | [The new rules of product management in the AI era \| Sherif Mansour (Head of AI, Atlass…](https://www.youtube.com/watch?v=hRtmV1mCBSE)  |
| Lex Fridman                     |        0 |        0 |         0 |         1 | Nov 18 21:36               | received | [GTA 6, Crime, Jewel Heists, Prison, Corrupt Cops, Mafia, Miami & Money \| Lex Fridman P…](https://www.youtube.com/watch?v=v1X9Fqs5a14)  |
| Marques Brownlee                |        0 |        2 |         0 |         4 | Nov 25 13:20               | received | [I've Been Keeping This A Secret](https://www.youtube.com/watch?v=-Cd_JmKG1SM)                                                           |
| Mostly Technical                |        0 |        1 |         0 |         2 | Nov 24 05:26               | received | [159: Biggest Week In Laravel History](https://www.youtube.com/watch?v=EJTOlfElIHY)                                                      |
| Nerd Snipe                      |        0 |        0 |         0 |         1 | Nov 17 16:45               | received | [Astra 6.2 Is A Step Back](https://www.youtube.com/watch?v=3nXqsK1xVU8)                                                                  |
| Next Token                      |        1 |        0 |         1 |         0 | Nov 25 17:16               | saved    | [I've Seen Slop the Likes of Which You Couldn't Even Fathom" - Ep 09](https://www.youtube.com/watch?v=uqL_q7vUcHQ)                       |
| Out Of Office Podcast           |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| Pitstop                         |        0 |        1 |         0 |         1 | Nov 26 08:20               | received | [How We Filmed the Casino Royale Crane Jump \| Adam Kirley on Pitstop](https://www.youtube.com/watch?v=sqoUpxxEEq0)                      |
| PowerfulJRE                     |        0 |        4 |         0 |         9 | Nov 25 12:51               | received | [Joe Rogan Experience #2586 - Jocko Willink](https://www.youtube.com/watch?v=4XjqOxsqjLk)                                                |
| Ryan Peterman                   |        0 |        2 |         0 |         5 | Nov 25 08:45               | received | [Ex-Meta Staff Eng By 25: What You Don't Learn In Big Tech \| Evan King](https://www.youtube.com/watch?v=TXZXwlXKkwY)                    |
| Sharp Tech Podcast              |        0 |        1 |         0 |         2 | Nov 20 04:15               | received | [Jensen’s Not Coming Back, AI Shopping, The iPhone Duo \| Sharp Tech with Ben Thompson](https://www.youtube.com/watch?v=fnwlxGbZZsY)     |
| Sources Podcast                 |        0 |        0 |         0 |         1 | Nov 17 08:51               | received | [Why Airtable’s founder is betting on teams of AI agents](https://www.youtube.com/watch?v=DFf6t9Q4yss)                                   |
| Stripe                          |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| TerminalDotShop                 |        0 |        1 |         0 |         2 | Nov 20 10:30               | received | [Fish On! \| MFF](https://www.youtube.com/watch?v=W7ceSO0bd2Y)                                                                           |
| The Nine Club                   |        0 |        2 |         0 |         3 | Nov 23 08:16               | received | [Steve Rocco \| The Nine Club #415](https://www.youtube.com/watch?v=IuejksQXFOQ)                                                         |
| The Pragmatic Engineer          |        0 |        1 |         0 |         3 | Nov 25 12:10               | received | [How Anthropic builds software in 2026 with Katelyn Lesse](https://www.youtube.com/watch?v=9oNvKMd7xJo)                                  |
| The PrimeTime                   |        0 |        3 |         0 |         7 | Nov 24 13:31               | received | [No AI Slop Manifesto](https://www.youtube.com/watch?v=i1IbHVstmH4)                                                                      |
| The Red Flags Podcast           |        0 |        2 |         0 |         4 | Nov 25 08:47               | received | [MAX VERSTAPPEN HITS THE JACKPOT - 2026 Las Vegas GP Recap \| The Red Flags Podcast](https://www.youtube.com/watch?v=tJIYUkTBH58)        |
| The Studio                      |        0 |        1 |         0 |         1 | Nov 24 15:46               | received | [Best Gifts Under $50 \| MKBHD Holiday Gift Guide](https://www.youtube.com/watch?v=oUsHRECFnEo)                                          |
| The Top Shelf Podcast           |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                        |
| The Verge                       |        0 |        4 |         0 |        11 | Nov 25 07:25               | received | [Big Tech is ready to spend even bigger to win in 2028 \| The Vergecast](https://www.youtube.com/watch?v=Dhc46v0rZfQ)                    |
| Theo - t3․gg                    |        0 |        3 |         0 |         8 | Nov 22 09:51               | received | [If you like Open Models, I'm sorry](https://www.youtube.com/watch?v=B2rFx4Fy1us)                                                        |
| TheStandupPod                   |        0 |        1 |         0 |         1 | Nov 20 08:16               | received | [Mitchell Hashimoto Reinvents the Terminal... Again \| Standup #80](https://www.youtube.com/watch?v=PEuGhjZnScI)                         |
| typecraft                       |        0 |        0 |         0 |         1 | Nov 18 13:21               | received | [!tts to swear at me. Also, is AI inherently theft?](https://www.youtube.com/watch?v=eOMFSTwHslw)                                        |
| WVFRM Podcast                   |        1 |        0 |         2 |         0 | Nov 20 09:25               | saved    | [You Can Now Order a Cybercab\*\*\*](https://www.youtube.com/watch?v=0HdrplAYXOM)                                                        |

### Spotify

| Source                                                          | 7d saved | 7d Inbox | 30d saved | 30d Inbox | Most recent delivery (CST) | Status   | Title                                                                                                                                               |
| --------------------------------------------------------------- | -------: | -------: | --------: | --------: | -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accidental Tech Podcast                                         |        0 |        2 |         0 |         3 | Nov 24 09:22               | received | [719: Mutually Assured Decompilation](https://open.spotify.com/episode/5fLMZB0tQla4J4Na5YFCsn)                                                      |
| Acquired                                                        |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Age of Miracles                                                 |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Artificially Unintelligent                                      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Asianometry                                                     |        0 |        2 |         0 |         4 | Nov 22 17:52               | received | [Why the Soviet GitHub Failed](https://open.spotify.com/episode/45rCGaCQ9YKVvlOL0VVJhi)                                                             |
| Changelog Master Feed                                           |        0 |        2 |         0 |         4 | Nov 24 21:40               | received | [Warp bets on the software factory (Changelog Interviews #693)](https://open.spotify.com/episode/6ngsawdBEw2sEEKpPUxq5I)                            |
| CoRecursive: Coding Stories                                     |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Cortex                                                          |        0 |        0 |         0 |         1 | Nov 16 08:10               | received | [185: Writing a Bestseller in the Notes App, with Patrick McGee](https://open.spotify.com/episode/3HDjW2IV134kGaHWcIlpAn)                           |
| Dan Carlin's Hardcore History                                   |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Dan Carlin's Hardcore History: Addendum                         |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Dev Interrupted                                                 |        0 |        2 |         0 |         4 | Nov 24 05:32               | received | [Deterministic logic and humans belong in your AI stack \| n8n’s Jan Oberhauser](https://open.spotify.com/episode/7g8xy9XDYiWefbJTrfNPWt)           |
| devtools.fm: Developer Tools, Open Source, Software Development |        0 |        0 |         0 |         2 | Nov 15 19:25               | received | [Josh Hobson - AG Studio](https://open.spotify.com/episode/5ijqX6SDSj5WxbZjEv4Pb9)                                                                  |
| Dithering                                                       |        2 |        0 |         4 |         0 | Nov 24 04:16               | saved    | [Jensen’s Back](https://open.spotify.com/episode/0XL2OhMb3AMz47HWtgtPen)                                                                            |
| Micro-Frontends in the trenches                                 |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Notes On Work - by Caleb Porzio                                 |        4 |        0 |         8 |         0 | Nov 24 09:51               | saved    | [Making apps feel effortless and natural](https://open.spotify.com/episode/7gazHwRzqY4xP4B6J0OW73)                                                  |
| Oxide and Friends                                               |        0 |        1 |         0 |         1 | Nov 20 09:21               | received | [The Power of the Purse with Libby Cantrill](https://open.spotify.com/episode/72bROJr8RULC0QLmRiuTX9)                                               |
| Sharp Tech with Ben Thompson                                    |        0 |        3 |         0 |         5 | Nov 25 04:30               | received | [Jensen’s Resurrection and Thanksgiving Mail on Android, Music, Muse, Parenting, and More](https://open.spotify.com/episode/2RnexcbbYVU9RoYoUlLv5Z) |
| Software Huddle                                                 |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| StaffEng                                                        |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| Stratechery                                                     |        0 |        2 |         0 |         7 | Nov 24 05:30               | received | [The Individual Exception](https://open.spotify.com/episode/3qo44rAtSFu7TdQMqNrsxi)                                                                 |
| The Builders                                                    |        0 |        4 |         0 |         7 | Nov 25 02:10               | received | [Episode 3: The Friends We Made Along the Way](https://open.spotify.com/episode/2qNFm8Y97rJff0Um0XnMPR)                                             |
| The Important Thing                                             |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                                                                   |
| The Talk Show With John Gruber                                  |        0 |        1 |         0 |         1 | Nov 20 17:41               | received | [457: ‘A  Whoopsie Treason’, With Christina Warren](https://open.spotify.com/episode/2dxVQDn4gNJnX0AgL5InZT)                                        |
| Two's Complement                                                |        0 |        0 |         0 |         1 | Nov 14 18:21               | received | [Pay Up, Nerds](https://open.spotify.com/episode/7zMK24MMAF1FFvhptQiRhM)                                                                            |
| Whiskey Web and Whatnot                                         |        0 |        1 |         0 |         3 | Nov 24 05:30               | received | [Bot vs Dot: The AI Agent Wars Begin](https://open.spotify.com/episode/4ImtXh5ax8YkVsoH9K4EVM)                                                      |

### RSS (podcast feeds)

| Source                                     | 7d saved | 7d Inbox | 30d saved | 30d Inbox | Most recent delivery (CST) | Status   | Title                                                                  |
| ------------------------------------------ | -------: | -------: | --------: | --------: | -------------------------- | -------- | ---------------------------------------------------------------------- |
| JS Party: JavaScript, CSS, Web Development |        0 |        0 |         0 |         1 | Nov 8 11:34                | received | [One last party](https://changelog.com/jsparty/350)                    |
| Practical AI                               |        1 |        0 |         4 |         0 | Nov 26 04:21               | saved    | [Humans in a Post-Human World](https://share.transistor.fm/s/45701c1a) |

### Substack

| Source                        | 7d saved | 7d Inbox | 30d saved | 30d Inbox | Most recent delivery (CST) | Status | Title                                                                                                                      |
| ----------------------------- | -------: | -------: | --------: | --------: | -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Building Healthier by Ben Hsu |        0 |        0 |         1 |         0 | Nov 8 12:06                | saved  | [Reflections on -1 to 0 and Exploring Ideas](https://buildinghealthier.substack.com/p/reflections-on-1-to-0-and-exploring) |

### Web / blog feeds (migrated RSS)

| Source                                      | 7d saved | 7d Inbox | 30d saved | 30d Inbox | Most recent delivery (CST) | Status   | Title                                                                                               |
| ------------------------------------------- | -------: | -------: | --------: | --------: | -------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Ajey Gore                                   |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Armin Ronacher's Thoughts and Writings      |        0 |        1 |         0 |         1 | Nov 24 17:16               | received | [Abolish Lock Poisoning](https://lucumr.pocoo.org/2026/11/25/poisoning/)                            |
| Boris Tane                                  |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Huberman Lab                                |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Mitchell Hashimoto                          |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Peter Steinberger                           |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| seangoedecke.com RSS feed                   |        0 |        4 |         0 |         5 | Nov 23 01:50               | received | [Notes on OpenAI's perplexity reveal](https://seangoedecke.com/notes-on-openais-perplexity-reveal/) |
| Solving the decision problem                |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Stories by Steve Yegge on Medium            |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| The Shape of the System                     |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Jamie Tanna \| Software Engineer _(unsub.)_ |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Julia Evans _(unsub.)_                      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Rands in Repose _(unsub.)_                  |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Rands in Repose _(unsub.)_                  |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Simon Willison's Weblog _(unsub.)_          |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Stratechery by Ben Thompson _(unsub.)_      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Web Directions _(unsub.)_                   |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |
| Westenberg. _(unsub.)_                      |        0 |        0 |         0 |         0 | **none**                   | —        | —                                                                                                   |

### X

| Source  | 7d saved | 7d Inbox | 30d saved | 30d Inbox | Most recent delivery (CST) | Status   | Title                                                             |
| ------- | -------: | -------: | --------: | --------: | -------------------------- | -------- | ----------------------------------------------------------------- |
| joel ⛈️ |        0 |        0 |         0 |        27 | Nov 8 18:05                | received | [@sean_j_roberts yes](https://x.com/i/status/2119577478729715819) |

### Never delivered in Zine Next (40)

Active (32):

- **YouTube (14):** 0xSero, 368, Acquired, adamdotdev, Armin Ronacher, CaseyNeistat,
  David Dobrik, Diggnation, HumanLayer, Johnny Harris, Kevin Rose, Out Of Office Podcast,
  Stripe, The Top Shelf Podcast.
- **Spotify (10):** Acquired, Age of Miracles, Artificially Unintelligent, CoRecursive,
  Dan Carlin's Hardcore History, Hardcore History: Addendum, Micro-Frontends in the
  trenches, Software Huddle, StaffEng, The Important Thing.
- **Web (8):** Ajey Gore, Boris Tane, Huberman Lab (erroring), Mitchell Hashimoto, Peter
  Steinberger, Solving the decision problem, Steve Yegge on Medium, The Shape of the System.

Apart from Huberman Lab, all of these are polling successfully. This fits sources that have
published nothing new since their start date (`intake_since_at`, Nov 11 for migrated
subscriptions). Feed contents were not fetched to confirm it.
Classic Zine's records back this up: the last legacy arrival for most of them is weeks or
months old. For example, adamdotdev's is from Feb 5, Peter Steinberger's from Mar 23, and
Diggnation's from Aug 13.

Unsubscribed (8): all blog feeds. They have not been polled in Zine Next.

Four more active subscriptions delivered something, but nothing in the last 14 days:

| Subscription                  | Last delivery  |
| ----------------------------- | -------------- |
| JS Party                      | Nov 8          |
| Building Healthier (Substack) | Nov 8          |
| X: joel                       | Nov 8 (broken) |
| Aaron Francis                 | Nov 11         |

### Daily deliveries (CST)

| Day            | Nov 8 |   9 |  10 |  11 |  12 |  13 |  14 |  15 |  16 |  17 |  18 |  19 |  20 |  21 |  22 |  23 |  24 |  25 | 26 (to 11:30) |
| -------------- | ----: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | ------------: |
| Delivered      |    32 |   1 |   2 |   5 |  17 |  14 |   7 |   8 |  10 |  16 |  16 |  14 |  23 |   2 |   9 |  11 |  19 |  15 |             3 |
| of which saved |     2 |   0 |   0 |   0 |   2 |   4 |   0 |   0 |   0 |   2 |   0 |   1 |   4 |   0 |   0 |   1 |   2 |   1 |             1 |

Nov 8 includes the first-poll entries for the newly created subscriptions and the X
deliveries. Nov 21 is unusually low (2) even though polling ran normally that day.

## 6. Automatic versus manual saves, last 30 days

These are all `save_occurrences` rows in Zine Next, from any route, since Oct 27 11:30 CST.

| route            | contributor                   | Rows | First (CST)  | Last (CST)   |
| ---------------- | ----------------------------- | ---: | ------------ | ------------ |
| `explicit`       | `https://api-next.myzine.app` |  459 | Nov 8 09:12  | Nov 8 17:35  |
| `subscription`   | `zine:subscription`           |  224 | Nov 8 09:45  | Nov 26 10:20 |
| `subscription`   | `zine:legacy-import`          |  209 | Oct 27 14:00 | Nov 11 11:00 |
| `legacy-arrival` | `zine:legacy-import`          |  183 | Oct 27 14:00 | Nov 11 11:00 |
| `explicit`       | `zine:legacy-import`          |   75 | Oct 27 18:26 | Nov 11 11:42 |

All 459 manual saves through the Zine Next API happened on Nov 8, the day of the cutover
import. None have been recorded since. Only one item has both a subscription delivery and
a later non-subscription occurrence.

## 7. Method, and what still could not be verified

**Method.** The SQL drafted in the previous version of this report was run against
production, adapted to the live schema:

- Delivery counts are restricted to `contributor='zine:subscription'` and split by
  `personal_items.status`.
- The newest delivery per subscription comes from `save_occurrences`, with the title taken
  from the highest-priority `contributions` row where `field='title'`.
- Poll history comes from `jobs` (`kind='sync'`) joined on `payload_json.subscriptionId`.
- Gaps were measured between successful sync jobs at one-minute resolution.

Every statement was a `SELECT` or a `PRAGMA` (table and column listing). The helper used
for these queries rejected any other statement.

**Not verified or not determinable from D1:**

- **Why the failures happen.** That includes the cause of the Nov 11–16 YouTube
  `source_not_found` outage and the daily gaps ending at 00:00 UTC. D1 stores only error
  codes, not response bodies or logs.
- **Whether entries were missed** during those outages.
- **What the web UI shows.** This report reflects database state. Whether Inbox and the
  library display these items was not checked.
- **Classic Zine is still polling the same sources independently**, according to
  `docs/STATUS.md`. It was deliberately not queried.
- **Snapshot timing.** Data was read between 11:30 and 11:32 CST. The cron run that started
  at 11:30:02 had not finished.

## 8. Appendix: how it works

### Databases: Zine Next and classic Zine do not share one

| System                                           | Worker / config                                            | D1 binding → database                                                |
| ------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| **Zine Next production** (`api-next.myzine.app`) | `zine-api-next`, `apps/api/wrangler.jsonc`                 | `DB` → `zine-api-next` (`0e55836b-07de-426b-9977-b783b0ea6652`)      |
| Zine Next staging                                | `zine-api-next-staging`, `apps/api/wrangler.staging.jsonc` | `DB` → `zine-api-next-staging`                                       |
| Classic Zine production                          | `apps/worker/wrangler.toml`, `[env.production]`            | `DB` → `zine-db-production` (`82911dea-5a6b-411b-ab4b-4145cb0c191d`) |

Zine Next has its own D1, R2 bucket, queue and vector index. Classic data was **copied**
in on Nov 11 by one-off scripts (`apps/api/scripts/migrate-legacy-subscriptions.ts`);
nothing is shared at runtime. `STATUS.md` says the classic system "remains live", so
classic Zine still polls its own copy of the same subscriptions on its own schedule.

### Tables (`apps/api/migrations`)

| Table                   | Role                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sources`               | One creator/feed/channel per owner: `platform` (`youtube`, `spotify`, `x`, `substack`, `rss`, and `web` for feeds migrated from classic Zine), `name`, `url`.                              |
| `source_routes`         | How a source is polled: `kind` is `feed`, `youtube_feed`, `youtube_playlist`, `spotify_show` (and other `spotify_*`), `x_account`, `x_list`.                                               |
| `subscriptions`         | `status` (`active`/`unsubscribed`), `auto_save`, `filters_json`, `initialized`, `next_poll_at`, `last_success_at`, `last_error_code`, `intake_since_at`, lease columns, feed ETag columns. |
| `subscription_seen`     | Every entry key already handled, per subscription. This is what prevents duplicates.                                                                                                       |
| `save_occurrences`      | One row per reason an item is in the account. Subscription deliveries have `route='subscription'`, `contributor='zine:subscription'` and a `subscription_id`.                              |
| `personal_items`        | The item itself: `status` (`received`, `saved`, `dismissed`, `deleted`), `saved_at`, `decision_origin` (`automatic` or `explicit`).                                                        |
| `jobs`                  | Work log. `kind='sync'` rows are subscription polls, with `status`, `attempts`, `last_error_code`.                                                                                         |
| `service_checks`        | The cron heartbeat (`name='cron'`): last start, success, failure.                                                                                                                          |
| `legacy_import_records` | Receipts for items copied from classic Zine.                                                                                                                                               |

Automatic versus manual: a subscription delivery is a `save_occurrences` row with
`route='subscription'`; a manual save has `route='explicit'`. One item can have both. If
you had already saved or dismissed something, a later subscription delivery records the
occurrence but does not change your decision.

### Polling (`apps/api/src/jobs.ts`, `apps/api/src/subscriptions.ts`)

- **Cadence.** One Cloudflare cron, every 5 minutes. Each run picks up to 50 active
  subscriptions whose `next_poll_at` has passed and queues one `sync` job each. After a
  successful poll `next_poll_at` is set 15 minutes ahead, so the real interval is 15–20
  minutes when nothing is delayed. All platforms share this one schedule.
- **Per-platform fetch.** YouTube channels use the public channel feed (`youtube_feed`) or
  the Data API for playlists; Spotify and X use their APIs; Substack, RSS and websites use
  the feed. Feeds are fetched conditionally; an unchanged feed counts as a success.
- **What becomes an item.** On the first poll only the single newest existing entry is
  delivered; everything older is marked seen. After that, an entry is delivered only if
  it is unseen, was published after the subscription's start (`intake_since_at`, else
  `created_at`), and matches `filters.types`. Shorts are skipped unless the filter names
  them. Migrated subscriptions were created already initialised with the start set to
  Nov 11, so they never backfill.
- **Saved or Inbox.** `auto_save=1` creates the item as `saved`; otherwise as `received`.
- **Idempotency.** Job IDs are derived from the subscription and the 5-minute window, a
  subscription cannot have two pending polls, a 5-minute lease guards each poll, and the
  item, occurrence and seen-marker are written in one transaction with IDs derived from
  the subscription and entry.
- **Failures.** A failed poll writes the error code to `last_error_code` and pushes
  `next_poll_at` out by a short backoff (at most one hour). Retryable errors retry the
  same job up to six attempts. The subscription is never switched off automatically, so
  a permanently broken source is re-polled indefinitely and `last_success_at` simply
  stops moving. `last_error_code` clears on the next success.
- **"Stale".** `/v1/ops/status` reports `subscriptions_stale` when an active subscription
  is more than one hour past `next_poll_at`, and counts subscriptions with an error. The
  scheduled monitor (`apps/api/scripts/monitor.ts`) ignores both.
