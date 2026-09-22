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
git clone https://github.com/Famashrafs/restaurant-system.git
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
* Placeholder pages for `/admin/orders`, `/admin/menu`, `/admin/customers`,
  `/admin/coupons`, `/admin/reviews`, `/admin/analytics`, `/admin/settings`.

### Testing the owner dashboard

User profiles (including `role` and `restaurantId`) are stored **in the browser**
(`localStorage`, key `profile-<uid>`) in this phase — the app does not read
Firestore yet. There are two ways to get an owner account:

1. **Register one (recommended):** go to `/admin/register` (or the `/owner/register`
   alias), create an account and a restaurant. That account is a
   `restaurant_owner` and lands straight on `/admin`. Returning admins sign in at
   `/admin/login`.
2. **Promote an existing account (development only):** sign in normally, then run
   this in the browser DevTools console. It targets whatever profile is on this
   device, so no UID is ever hardcoded, and it changes nothing in production code:

   ```js
   (() => {
     const key = Object.keys(localStorage).find((k) => k.startsWith('profile-'));
     if (!key) return console.warn('Log in first.');
     const profile = JSON.parse(localStorage.getItem(key));
     profile.role = 'restaurant_owner';
     localStorage.setItem(key, JSON.stringify(profile));
     console.log('Promoted this account to restaurant_owner. Reload the page.');
   })();
   ```

   Reload, then open `/admin`. (The owner has no restaurant record yet, so the
   dashboard renders its empty state until one is created.)

To go back to a customer, repeat the snippet with `profile.role = 'customer'`.

## 🔐 Required backend configuration

The client currently persists to the browser (localStorage). Before this grows
into a production multi-tenant platform, wire it to Firestore and deploy the
rules in `firestore.rules` at the repository root:

```bash
firebase deploy --only firestore:rules
```

Create the collections **`users`**, **`restaurants`**, **`orders`**, **`products`**
matching the models in this repo (each with `restaurantId`), and:

1. **Roles must exist server-side.** Store `role` on each `users/{uid}` document.
   Assign elevated/platform roles only via Firebase Custom Claims through a Cloud
   Function or Admin SDK — never trust a client-supplied role.
2. **Multi-tenancy.** The rules in `firestore.rules` restrict restaurant data to
   members of that restaurant (`request.auth.uid` + the `restaurantId` on each
   document). Do not weaken them.
3. **Never store passwords or raw card data.** This project has no payment
   provider configured; cards are only ever represented by provider tokens.

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
