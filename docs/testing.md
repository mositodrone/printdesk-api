# Testing

## Run the tests

```bash
npm test              # runs everything once (unit + integration)
npm run test:watch    # re-runs as you edit
npm run coverage      # same, with a coverage table
```

Requirements: Node 20 or newer, and an internet connection the FIRST time only. The tests start a throwaway
in-memory MongoDB (`mongodb-memory-server`), which downloads a MongoDB binary on the first run (several hundred MB,
then cached). The tests never connect to Atlas or to anything in your `.env`: they set their own fake environment
in `vitest.config.js`, and each test starts with empty collections.

## What is in the suite

160 tests in 7 files (as of Week 3).

| File | Kind | Tests | What it covers |
|---|---|---|---|
| `src/test/unit.test.js` | Unit (no HTTP, no database) | 53 | The input checker (`validate`), URL id checks, the error handler (every branch), token checks (`authenticate`: 7 ways to be refused, deleted account, success), role check (`authorize`), the ownership rule (`orderAccess`), and model rules (JSON hides the password hash, status values, quantity limits) |
| `src/test/auth.test.js` | Integration (HTTP + in-memory MongoDB) | 13 | Sign-up, login, hashing, duplicate email, case handling, no email discovery |
| `src/test/orders.test.js` | Integration | 36 | List (filters, sorting, paging), create, get, edit, status, delete, ownership |
| `src/test/items.test.js` | Integration | 29 | Add, list and delete items, catalog checks, duplicates, ownership |
| `src/test/customers.test.js` | Integration | 17 | Create, get, a customer's orders, owner-only delete and the 409 rule |
| `src/test/garmentTypes.test.js` | Integration | 4 | Read-only catalog |
| `src/test/public.test.js` | Integration | 8 | Public routes and errors that can happen anywhere (bad JSON, oversized body, unknown route) |

Failure cases covered: 400 (bad body, query, id), 401 (no, bad, expired or unsigned token; wrong credentials),
403 (not the handler, not an owner), 404 (order, item, customer, route), 409 (duplicate email, phone, item; customer
with orders), 413 (oversized body) and `INVALID_JSON`. Several tests pin down the ORDER of checks, for example that
bad JSON is reported before login, and that permission is decided before the body is validated.

How the tests are built: data is created straight in the database with small factory functions
(`src/test/helpers.js`), not through the API, so a bug in one endpoint can't break a test about another.

The unit tests were also checked for usefulness: I deliberately broke the code in seven ways (for example making a
duplicate return 400, leaking the real error message in a 500, letting the wrong role through) and every one made at
least one test fail.

## What is NOT tested, and why

- `src/server.js` and `src/seed.js` are excluded from coverage. `server.js` only starts the listener and connects to
  Atlas; `seed.js` is a developer tool that wipes and reloads data. Both are checked by running them.
- The startup check in `src/config.js` (the server exits if `JWT_SECRET` is missing or short) would end the test
  process itself. Checked by hand by starting the server without the variable.
- The Swagger UI page at `/docs` is a third-party library. I checked it by hand in a browser (log in, Authorize,
  call a route); there is no automated test.
- Real Atlas behaviour: the tests use an in-memory MongoDB, so network failures, latency and index builds on
  existing live data are not exercised.
- Concurrency: two simultaneous requests that both try to create the same duplicate, or an order deleted while its
  items are being added. The duplicate-email and duplicate-phone rules are enforced by the database's unique
  indexes, but the race itself is not tested. The cascade delete is not atomic (see design decisions, section 17).
- Time: nothing waits an hour for a token to expire. Expiry is covered by checking that an already-expired token
  is refused.
- Performance and load: not tested (see the performance notes).
- Email format rules beyond what the validation library provides are trusted, not re-tested.

## Coverage numbers

`npm run coverage` prints a table. As a guide, the unit tests alone cover 100% of `auth.js`, `errors.js`,
`models.js` and `validate.js` (the shared checks); the route files are covered by the integration tests, which
exercise them through HTTP. Quote the numbers from your own run, and treat them as a guide to gaps, not a goal.
