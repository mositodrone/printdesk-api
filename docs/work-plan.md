# Work plan: PrintDesk

## Week 1: Design and build
- Idea one-pager, work plan, public repo with starter README and `.env.example`
- ERD, design decisions and OpenAPI spec (written before coding)
- Full CRUD on Order (create, list, get, update, delete) plus a dedicated status endpoint
- Input validation, correct status codes (201, 200, 400, 404), clean JSON errors
- Seed script with dummy customers, garment types and orders
- Sample requests (`requests/orders.http`), live deployment, tag `week-1`
- 5-minute presentation: ERD, spec, live request to each endpoint

## Week 2: Auth and robustness
- Staff authentication (hashed passwords, tokens) and role-based access (owner vs staff)
- Relationships: order items inside orders, customer endpoints, garment lookups
- Stronger validation and consistent error handling across all endpoints
- Response to Week 1 mentor feedback and an issue log
- Tag `week-2`, updated sample requests

## Week 3: Quality and delivery
- Automated tests runnable with one command
- API documentation (Swagger UI from the spec), setup guide, security and performance notes
- Final deployment check, walkthrough video, reflection and declaration
- Tag `week-3`, exported collection or OpenAPI file

## Top 3 risks

| Risk | Mitigation |
|---|---|
| Scope creep into payments or file uploads | Both are out of scope in writing (one-pager). Design notes stay plain text. |
| Week 2 auth forces schema changes | Staff entity with `role` and `passwordHash` is in the data model from Week 1; `Order.handledBy` is optional until auth exists. |
| Deployment problems (Atlas network access, free-host cold starts) | Deploy before the last day, test from a fresh client, and note the cold-start delay in the README. |
