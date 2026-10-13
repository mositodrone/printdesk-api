# PrintDesk API

Order-tracking REST API for small custom-print shops.
Backend Development track, BuildLab Stage 1.

## Stack
Node.js, Express, MongoDB (Atlas), Mongoose, Zod

## Run locally
1. `git clone <repo-url> && cd printdesk-api`
2. `npm install`
3. `cp .env.example .env` and set `MONGODB_URI`
4. `npm run seed` (loads dummy data)
5. `npm run dev`

API runs at http://localhost:3000

## Live API
<url once deployed>
Note: hosted on a free tier, so the first request after idle may take ~30-60s.

## Docs
See `/docs` for the idea one-pager, work plan, ERD and API spec.

## Sample requests
See `/requests/orders.http`