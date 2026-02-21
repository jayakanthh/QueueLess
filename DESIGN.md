# QueueLess Design Document

## Overview
QueueLess is a digital canteen ordering system with three role-based portals:
- Students place orders and track status.
- Vendors manage live stock and availability.
- Admins manage menu items and order status.

The system ships as a React + Vite frontend and an Express backend with JSON file persistence.

## Goals
- Reduce canteen queues with pre-ordering and clear pickup status.
- Provide real-time stock visibility for students.
- Give vendors a focused stock dashboard.
- Give admins a single view for menu management and order status.

## Non-Goals
- Online payment integration beyond a simulated flag.
- Multi-tenant support for multiple canteens.
- Production-grade authentication or encrypted storage.

## Users and Roles
- Student: Browse menu, manage cart, place orders, view order status.
- Vendor: Update stock and availability for menu items.
- Admin: Create/update/delete menu items, update order status.

## System Architecture
### Frontend
- React SPA built with Vite.
- Entry point: [App.jsx](file:///Users/jaikanthkamisetti/Documents/GitHub/QueueLess/client/src/App.jsx)
- Styling: [App.css](file:///Users/jaikanthkamisetti/Documents/GitHub/QueueLess/client/src/App.css) and [index.css](file:///Users/jaikanthkamisetti/Documents/GitHub/QueueLess/client/src/index.css)
- API base URL: `VITE_API_URL` or `http://localhost:4000`.

### Backend
- Express server in [server/index.js](file:///Users/jaikanthkamisetti/Documents/GitHub/QueueLess/server/index.js)
- JSON file persistence in [server/data/db.json](file:///Users/jaikanthkamisetti/Documents/GitHub/QueueLess/server/data/db.json)
- Runs on `PORT` env var or `4000`.

### Legacy Static App
- The root `index.html`, `styles.css`, and `app.js` contain an older static version.
- Current product uses the React client in `/client`.

## Data Model
### User
- `id`, `name`, `email`, `password`, `role`

### Menu Item
- `id`, `name`, `category`, `price`, `prepTime`, `stock`, `available`

### Order
- `id`, `orderNumber`, `userId`, `customerName`
- `items[]` with `itemId`, `name`, `price`, `qty`
- `total`, `status`, `createdAt`, `etaMinutes`
- `paymentMethod`, `paymentMethodLabel`

### Session
- `token`, `userId`, `createdAt`

## Authentication and Authorization
- Login/Register returns a token stored in localStorage (`ql_token`).
- Backend validates tokens against stored sessions.
- Role checks enforced via middleware: admin-only, vendor-only, or student-only.

## API Surface
### Auth
- `POST /api/auth/register` → create student + session token
- `POST /api/auth/login` → session token
- `POST /api/auth/logout` → invalidate session
- `GET /api/me` → current user profile

### Menu
- `GET /api/menu` → public menu listing
- `POST /api/menu` → admin create
- `PUT /api/menu/:id` → admin update
- `PATCH /api/menu/:id/stock` → vendor/admin stock update
- `DELETE /api/menu/:id` → admin delete

### Orders
- `GET /api/orders` → admin/vendor sees all, student sees own
- `POST /api/orders` → student checkout
- `PATCH /api/orders/:id/status` → admin updates status

## Core Flows
### Welcome → Login → Role Portal
1. Welcome screen explains the product and routes to login/register.
2. Login/register stores token and user.
3. UI renders portal based on `user.role`.

### Student Ordering
1. Fetch menu.
2. Add items to cart.
3. Place order → stock decremented → order created with ETA.
4. Student sees status chips and order history.

### Vendor Stock Update
1. Vendor sees all menu items with live stock.
2. Update stock and availability.
3. Saves to backend and re-fetches menu.

### Admin Menu + Orders
1. Admin adds/edits/deletes menu.
2. Admin updates order status (Pending → Preparing → Ready → Completed).

## UI Structure
### Welcome Page
- Product overview and CTA buttons.
- Demo logins display.

### Login/Register
- Tabbed interface.
- Register limited to student role.

### Customer Portal
- Menu list, cart panel, and order status section.

### Vendor Portal
- Stock dashboard with availability toggles and low-stock highlight.

### Admin Portal
- Menu management form + list.
- Incoming orders list with status selector.

## Error Handling
- Backend returns JSON error messages with status codes.
- Frontend surfaces errors in banner/message sections.

## Operations
### Dev
- Server: `npm run dev` in `/server`
- Client: `npm run dev` in `/client`

### Persistence
- `server/data/db.json` is the single source of truth.
- Data is rewritten on each mutation.

## Risks and Limitations
- Plain-text passwords and token storage.
- No rate limiting, input sanitization, or audit logging.
- JSON file persistence is not concurrency-safe.

## Future Enhancements
- Replace JSON storage with a database.
- Secure auth with hashing + expiry.
- Payments integration and receipts.
- Multi-tenant canteen support.
