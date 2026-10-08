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

## ⚡ Feature: In-Browser Demo / Mock Mode

The system includes a built-in **In-Browser Demo / Mock Data Engine** (`frontend/src/services/mockEngine.js`):
- **Why it matters**: If the cloud backend on Render is sleeping (Render free tier sleeps after 15 min of inactivity) or if you want to demonstrate the app on Vercel without setting up databases, the app automatically serves realistic mock data!
- **Fast-fill credentials** are available on the Login screen:
  - **Admin**: `admin` / `admin123`
  - **Staff**: `staff` / `staff123`
- **Forced Mock Mode**: Set `VITE_USE_MOCK=true` in Vercel environment variables to run completely standalone with zero backend dependencies.

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
   *This creates all tables (`users`, `products`, `motorcycle_units`, `product_compatibility`, `suppliers`, `sales_orders`) and seeds default `admin` and `staff` accounts.*

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
   | `JWT_SECRET` | `your_custom_secret_key_123` | Token signing secret |
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
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://jlin-inventory-api.onrender.com/api` |
   | `VITE_USE_MOCK` | `false` *(or `true` if you want instant demo mode without backend)* |
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
| **Administrator** | `admin` | `admin123` | Full Access: POS, Inventory, Products Directory, Suppliers, Stock Receive, Sales Reports, Compatibility Rules, Users |
| **Sales Staff** | `staff` | `staff123` | POS Sales, Inventory View, Transaction History, Compatibility Search |
