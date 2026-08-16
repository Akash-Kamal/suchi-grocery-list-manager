# Supabase Setup Guide — Suchi Grocery App

This document walks you through the Supabase setup, including the Email + Password + Email OTP configuration.

---

## Step 1: Authentication Providers & Email OTP Settings

In the Supabase Dashboard:

1. Go to **Authentication → Providers → Email**
2. Ensure **Enable Email provider** is **ON**
3. Ensure **Confirm email** is **ON**
4. Under **Email Templates**:
   - Go to **Confirm signup**:
     - Subject: `Your Suchi Verification Code`
     - Body:
       ```html
       <h2>Confirm your Suchi account</h2>
       <p>Your verification code is:</p>
       <h1 style="font-size: 32px; letter-spacing: 4px; color: #059669;">{{ .Token }}</h1>
       <p>Enter this code in the Suchi app to complete your account setup.</p>
       ```
   - Go to **Reset Password**:
     - Subject: `Reset your Suchi Password`
     - Body:
       ```html
       <h2>Reset your Suchi password</h2>
       <p>Your password reset code is:</p>
       <h1 style="font-size: 32px; letter-spacing: 4px; color: #059669;">{{ .Token }}</h1>
       <p>Enter this code in the Suchi app to set your new password.</p>
       ```

---

## Step 2: Run Database Schema & RLS Migrations

1. Go to **SQL Editor → New query**
2. Paste and run [`supabase/migrations/001_initial_schema.sql`](./migrations/001_initial_schema.sql)
3. Paste and run [`supabase/migrations/002_rls_policies.sql`](./migrations/002_rls_policies.sql)
4. Paste and run [`supabase/migrations/003_fix_household_creation_rls.sql`](./migrations/003_fix_household_creation_rls.sql)

---

## Step 3: Enable Realtime on Grocery Tables

1. Go to **Table Editor**
2. Click `grocery_lists` table → **Replication** tab → toggle **Insert**, **Update**, **Delete** on
3. Click `list_items` table → **Replication** tab → toggle **Insert**, **Update**, **Delete** on

---

## Step 4: Environment Variables (`.env`)

In your project root `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=http://localhost:5174
```
