# Supabase Edge Functions Deployment Guide

## Prerequisites

1. Install Supabase CLI:
```bash
brew install supabase/tap/supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

## Deploy Edge Functions

Deploy all functions at once:

```bash
# Deploy create-user function
supabase functions deploy create-user

# Deploy reset-password function
supabase functions deploy reset-password

# Deploy update-user-profile function
supabase functions deploy update-user-profile

# Deploy seed-database function
supabase functions deploy seed-database
```

## Set Environment Secrets

The Edge Functions need access to the Service Role Key (not the anon key):

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

You can find your Service Role Key in:
Supabase Dashboard > Settings > API > service_role key (secret)

## Function URLs

After deployment, your functions will be available at:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-user
https://YOUR_PROJECT_REF.supabase.co/functions/v1/reset-password
https://YOUR_PROJECT_REF.supabase.co/functions/v1/update-user-profile
https://YOUR_PROJECT_REF.supabase.co/functions/v1/seed-database
```

## Usage Examples

### 1. Create User

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-user' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "newuser@example.com",
    "password": "password123",
    "employee_code": "EMP-011",
    "first_name": "New",
    "last_name": "User",
    "phone": "+63-917-1234567",
    "department": "IT Department",
    "position": "Developer",
    "role": "employee",
    "hired_date": "2026-03-01"
  }'
```

### 2. Reset Password

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/reset-password' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "new_password": "newpassword123"
  }'
```

### 3. Update User Profile

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/update-user-profile' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "phone": "+63-917-9999999",
    "position": "Senior Developer",
    "department": "IT Department"
  }'
```

### 4. Seed Database

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/seed-database' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

## Update Your .env File

Add the function URLs to your `.env` file:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## Test the Functions

You can test the functions directly from your Supabase Dashboard:
1. Go to Edge Functions in the sidebar
2. Select a function
3. Click "Invoke function"
4. Add request body and test

## Troubleshooting

If functions fail to deploy:
- Make sure you're logged in: `supabase login`
- Make sure project is linked: `supabase link`
- Check function logs: `supabase functions logs FUNCTION_NAME`

If functions return errors:
- Check that SUPABASE_SERVICE_ROLE_KEY is set
- Verify CORS headers are correct
- Check function logs in Supabase Dashboard
