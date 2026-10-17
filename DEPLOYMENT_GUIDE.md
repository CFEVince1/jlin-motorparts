# 🚀 Deployment & Demo Guide: GitHub, Vercel, Render & Aiven

This guide provides step-by-step instructions for deploying the **JLIN Motorcycle Parts Inventory & POS System** to the cloud using industry-standard platforms:

```
┌─────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│      Vercel (Frontend)  │ ----> │    Render (Backend)    │ ----> │    Aiven (Database)    │
│  React + Vite SPA       │       │    Node.js + Express   │       │    Cloud Managed MySQL │
│  ⚡ In-Browser Mock/Demo│       │    REST API + JWT Auth │       │    SSL Encrypted       │
└─────────────────────────┘       └────────────────────────┘       └────────────────────────┘
```

---

## ⚠️ Production Configuration: Live Backend & Cold Starts

- **Live Backend & Cloud Database Architecture:** The frontend connects directly to the authenticated Express REST API on Render and the Aiven MySQL cloud database. Mock mode and synthetic bypasses have been completely excised from the application to guarantee that all transactions, logins, and inventory records are genuine and fully audited.
- **Render Backend Cold Starts:** On Render's free tier, the web service spins down after 15 minutes of inactivity. To ensure the backend is immediately responsive during the defense or grading, send a warm-up ping (e.g. `curl https://jlin-motorparts.onrender.com/api/products`) 2–3 minutes before the presentation.

---

## Step 1: Cloud Database Setup on Aiven (MySQL)

1. Go to [https://aiven.io](https://aiven.io) and sign up / log in.
2. Click **Create Service**:
   - **Service**: Select **MySQL**
   - **Cloud Provider**: AWS or Google Cloud
   - **Region**: Singapore (`ap-southeast-1`) or closest to the Philippines
   - **Plan**: Free Tier / Startup Plan
   - **Service Name**: `jlin-inventory-db`
3. Once provisioned (approx. 2 minutes), go to **Service Overview**:
   - Note the **Service URI** (e.g., `mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:PORT/defaultdb?ssl-mode=REQUIRED`)
   - Or note the individual credentials:
     - **Host**: `mysql-xxxx.aivencloud.com`
     - **Port**: `12345`
     - **User**: `avnadmin`
     - **Password**: *(Click copy password)*
     - **Database**: `defaultdb`
4. **Initialize Tables & Seed Data**:
   From your local terminal, run the automated Aiven setup script:
   ```bash
   cd c:\Inventory\backend
   
   # Set your Aiven database URI in backend/.env:
   # DATABASE_URL=mysql://avnadmin:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/defaultdb?ssl-mode=REQUIRED
   
   npm run db:setup
   ```
   *This creates all tables (`users`, `products`, `motorcycle_units`, `motorcycle_models`, `product_compatibilities`, `suppliers`, `receiving_records`, `sales`, `inventory_transactions`) and initializes `admin` and `staff` accounts using `INITIAL_ADMIN_PASSWORD` / `INITIAL_STAFF_PASSWORD` (or securely generated keys).*

---

## Step 2: Backend API Deployment on Render

1. Go to [https://render.com](https://render.com) and log in with your GitHub account.
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository: `your-username/jlin-inventory`.
4. Configure the Web Service settings:
   - **Name**: `jlin-inventory-api`
   - **Region**: Singapore (matching Aiven for ultra-low latency)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Scroll down to **Environment Variables** and add:
   | Key | Value | Description |
   |---|---|---|
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `5000` | Server listening port |
   | `JWT_SECRET` | *(64-character random hex key)* | Token signing secret (generate with `openssl rand -hex 32` or node crypto) |
   | `DATABASE_URL` | `mysql://avnadmin:...@.../defaultdb?ssl-mode=REQUIRED` | Aiven connection URI |
   | `FRONTEND_URL` | `https://your-app.vercel.app` | Your Vercel frontend URL |
6. Click **Create Web Service**.
7. Once deployed, test the health check in your browser:
   `https://jlin-inventory-api.onrender.com/health`
   *(Should return `{"status":"ok","service":"jlin-inventory-api"}`)*.

---

## Step 3: Frontend Deployment on Vercel

1. Go to [https://vercel.com](https://vercel.com) and log in with GitHub.
2. Click **Add New...** > **Project**.
3. Select your GitHub repository: `jlin-inventory`.
4. Configure Project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand **Environment Variables**:
   | Key | Value | Notes |
   |---|---|---|
   | `VITE_API_URL` | `https://jlin-motorparts.onrender.com/api` | Live Render backend endpoint |
6. Click **Deploy**.
7. Vercel will build and launch your site at `https://jlin-inventory.vercel.app`.
   - The included [`vercel.json`](file:///c:/Inventory/frontend/vercel.json) handles SPA routing so refreshing `/inventory`, `/pos`, etc., will never result in a 404 error.

---

## Step 4: Pushing Your Project to GitHub

Run these commands from `c:\Inventory`:

```bash
# 1. Verify git status and ensure secrets are ignored
git status

# 2. Add all files
git add .

# 3. Commit changes
git commit -m "feat: production cloud deployment configs for Vercel, Render, Aiven, and in-browser mock engine"

# 4. If creating a new repository on GitHub:
# git remote add origin https://github.com/your-username/jlin-inventory.git
# git branch -M main

# 5. Push to GitHub
git push -u origin main
```

---

## Summary of Deployment Credentials & Roles

| Role | Username | Password | Access Level |
|---|---|---|---|
| **Administrator** | `admin` | *(Set in `.env` / Initial setup)* | Full Access: POS, Inventory, Products Directory, Suppliers, Stock Receive, Sales Reports, Compatibility Rules, Users |
| **Sales Staff** | `staff` | *(Set in `.env` / Initial setup)* | POS Sales, Inventory View, Transaction History, Compatibility Search |
