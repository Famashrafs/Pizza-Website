# 🍽️ Restaurant System

> A modern restaurant web application built with React, designed to provide a complete digital experience for browsing menus, ordering food, and managing restaurant operations.

## 📋 Overview

**Restaurant System** is a React-based restaurant application focused on creating a smooth and modern online ordering experience.

The project includes user authentication and is being developed with the goal of supporting restaurant menus, online ordering, order management, and administrative functionality.

It was built as a practical project to explore how a real-world restaurant platform can be structured using modern frontend technologies and cloud services.

---

## ✨ Features

### 👤 Authentication

* User registration
* User login
* Firebase authentication
* Protected user functionality

### 🍔 Restaurant Experience

* Restaurant landing page
* Menu browsing
* Offers and promotions
* Restaurant information
* Contact section

### 🛒 Online Ordering

The application is designed around an online ordering workflow including:

* Browse menu items
* Select products
* Manage orders
* Checkout workflow
* Order confirmation

### 📄 Order & Billing

The planned ordering system includes:

* Restaurant order summary
* Customer order details
* Printable order/billing document
* Delivery information

### 📍 Location-Based Access

The application includes a location-checking mechanism that can verify whether the user is within the restaurant's supported area before accessing the application.

---

## 🛠️ Tech Stack

### Frontend

* React
* JavaScript
* HTML5
* CSS3

### Services

* Firebase
* Firebase Authentication

### Development Tools

* Git
* GitHub
* VS Code

---

## 🚀 Getting Started

### Prerequisites

Make sure you have installed:

* [Node.js](https://nodejs.org/)
* npm
* Git

### Installation

Clone the repository:

```bash
git clone https://github.com/Famashrafs/Pizza-Website.git
```

Navigate into the project:

```bash
cd restaurant-system
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm start
```

The application will normally be available at:

```text
http://localhost:3000
```

---

## 🔐 Firebase Configuration

The project uses Firebase for authentication.

To run Firebase functionality locally, configure your own Firebase project, then copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:

```text
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
```

Also enable **Email/Password** under Authentication → Sign-in method in the Firebase console. For **Continue with Google** on the login page, enable the **Google** provider there as well.

> Do not commit private credentials, API keys, or sensitive configuration files to the repository.

### Auth features

* Email/password login with "remember me" (session- vs local-persistence)
* Google sign-in (Sign-in method → Google)
* Password reset (`/forgot-password`) via Firebase reset email
* Central auth state (`AuthContext`) exposing the user, loading, and error states
* Protected routes (`/account`, `/orders`, `/addresses`, `/favorites`) and a checkout gate that prompts unauthenticated users to log in instead of redirecting
* Customer profile with name, email, phone, profile image URL, default address, and edit profile
* Favorites toggling on menu items, saved addresses, and local order history

---

## 🏢 Roles & Multi-Tenancy

The platform has a role system ready for multi-restaurant SaaS (`src/config/roles.js`):

| Role                 | Status     | Access                                  |
| -------------------- | ---------- | --------------------------------------- |
| `customer`           | Fully built | Customer store + `/account`            |
| `restaurant_owner`   | Fully built | `/admin` dashboard                      |
| `restaurant_admin`   | Reserved   | Future operational access               |
| `staff`              | Reserved   | Future restricted access                |
| `platform_admin`     | Reserved   | Future platform-wide access             |

Every restaurant-owned resource (orders, products) is tagged with a `restaurantId`,
and the owner → restaurant relationship lives on the user's profile (never a
hardcoded constant). Admin queries filter strictly by that `restaurantId`, so two
restaurants can never leak data to each other.

## 🍕 Restaurant Owner Dashboard (`/admin`)

* Admin auth entry points:
  * `/admin/login` — admin login (rejects non-admin accounts);
  * `/admin/register` — admin sign up (creates the `Owner → Restaurant`
    relationship);
  * `/owner/register` — legacy alias of the sign-up page.
  These live **outside** the guarded route so they remain reachable when signed out.
  You can also log in through the normal `/login`; admins are routed to `/admin`.
* The `/admin` route is protected by `RoleProtectedRoute`:
  * not logged in → redirected to `/login` (and returned to `/admin` after login);
  * logged in as a customer → redirected to `/account`;
  * `restaurant_owner` (or another admin role) → the dashboard;
  * while the session/profile is still loading, a **“Checking authentication…”**
    state is shown so no route redirects early.
* A logged-in admin gets a **Dashboard** entry in the navbar account area
  (next to *Account*); customers never see it.
* Professional SaaS layout: sticky sidebar, dashboard header with dropdown,
  stat cards, sales chart, recent orders and quick actions — all driven by real
  stored data (zeros and empty states when the store is empty — nothing is faked).
* Responsive: sidebar becomes an off-canvas drawer on tablets; order rows become
  cards on mobile.
* Built pages: `/admin/orders` (status-advance workflow), `/admin/menu`
  (products + categories), `/admin/customers`, `/admin/settings`
  (`/admin/coupons`, `/admin/reviews`, `/admin/analytics` stay reserved).

### Getting an owner account (Firestore)

User profiles (including `role` and restaurant identity) live in Firestore
(`users/{uid}`), and owner status is only ever restored from a `restaurants`
document that lists `ownerId == uid`. There are two ways to get a working owner
account:

1. **Register one (recommended):** go to `/owner/register` (or `/admin/register`),
   create an account and a restaurant. This claims the deployment restaurant
   (`restaurant-pizza-demo`), writes the profile + identity, and seeds the menu
   categories/products automatically. That account is a `restaurant_owner` and
   lands straight on `/admin`.
2. **Restore an existing account:** if an account authenticated before the
   Firestore migration exists in the Firebase console, create the restaurant
   record it owns in the console:

   ```text
   restaurants/restaurant-pizza-demo  →  { ownerId: "<that account's UID>" }
   ```

   When that account signs in, the app detects the missing/repairable profile,
   grants the verified identity, and seeds the menu for it.

If a `restaurants/*` document already exists with a **different** owner, that
storefront is considered taken — onboarding fails with `restaurant/already-owned`
instead of silently creating a second identity the storefront never reads.

## 🔐 Deploying Firestore (rules + indexes)

The app reads/writes Firestore through `src/services/db.js` and the security
rules in `firestore.rules`. To go live you must deploy those rules (and the
indexes below) to the project referenced by `.env.local`.

```bash
# one-time: authenticate the Firebase CLI with the Google account that owns the project
npx firebase login

# deploy security rules AND the composite index together
npx firebase deploy --only firestore
```

What gets deployed:

1. **`firestore.rules`** — multi-tenant isolation:
   * `products` reads are public (`allow read: if true`) so the menu works for
     anonymous visitors; writes require membership of the product's restaurant.
   * `users/{uid}` are readable/writable only by their owner. A create may never
     claim a restaurant identity (`isSafeProfileCreate`); identity is attached
     only through `isOwnershipGrant`, which re-verifies the target
     `restaurants/<id>.ownerId == auth.uid`.
   * `orders` are created by their `customerId`, read by that customer or the
     restaurant's members, and only status fields may change afterwards.
2. **`firestore.indexes.json`** — the composite index
   `products(restaurantId ASC, sortOrder ASC)`. The app already falls back to a
   client-side sort when the index is missing, but creating it removes the
   `FAILED_PRECONDITION` errors (and makes the realtime listeners clean).

### First-run bootstrap

The code never seeds the store from a read path. The catalog and the owner
identity are created when **an owner registers** at `/owner/register` (which
claims `restaurant-pizza-demo` and seeds categories + products). After deploying
rules, just register the owner once and the customer menu will populate.

### Checklist after deploying

- [ ] `npx firebase deploy --only firestore` succeeds for the `resturent-system` project
- [ ] Register an owner at `/owner/register` → lands on `/admin`, menu seeds
- [ ] Signed-out visit to `/menu` shows the seeded products (public read works)
- [ ] The deployment host (e.g. Vercel) has the `REACT_APP_FIREBASE_*` variables
      from `.env.local` set in its environment settings — otherwise the app
      throws the missing-configuration error at startup

> The main collections are `users`, `restaurants`, `products`, `orders`, with
> `restaurants/{id}/categories` as a subcollection. Do not weaken the rules
> (no `allow write: if true`, no broad signed-in grants) and never store passwords
> or raw card data — cards are only ever provider tokens.

---

## 🗺️ Planned Architecture

The project is being developed toward a more complete restaurant platform with areas such as:

```text
Customer
   │
   ├── Browse Menu
   ├── View Offers
   ├── Add Items
   ├── Place Order
   └── Track Order
          │
          ▼
      Restaurant
          │
          ├── Manage Menu
          ├── Manage Orders
          ├── Manage Offers
          └── Admin Dashboard
```

---

## 🔮 Future Improvements

Planned improvements include:

* 🧑‍💼 Restaurant admin dashboard
* 🍕 Complete menu management
* 🛒 Full shopping cart
* 💳 Online payment integration
* 📦 Order management
* 🧾 Automated printable bills
* 📱 Mobile application
* 🔔 Order status notifications
* 📊 Restaurant analytics
* 🤖 AI-powered recommendations

---

## 🎯 What I Learned

This project has helped me practice:

* React application architecture
* Component-based development
* Authentication workflows
* Firebase integration
* Form handling
* Location-based functionality
* Building real-world ordering workflows
* Designing scalable application features

---

## 👨‍💻 Author

**Fam Ashraf**

Frontend Developer focused on React, JavaScript, and modern web development.

* 🌐 Portfolio: https://portfolio-famashraf.vercel.app/
* 🐙 GitHub: https://github.com/Famashrafs

---

## ⭐ Support

If you find this project interesting, consider giving the repository a ⭐.

> **From menu to order — a complete digital restaurant experience.** 🍽️
