# CORS Configuration for Vercel

## Problem
You're seeing CORS errors when your frontend tries to connect to the backend API.

## Solution

### Step 1: Update CORS_ORIGIN in Vercel

Go to your Vercel backend project settings:

1. Navigate to **Settings** → **Environment Variables**
2. Find the `CORS_ORIGIN` variable
3. Update it with your frontend URL(s)

#### For Single Origin (Production Only)
```
CORS_ORIGIN=https://your-frontend-app.vercel.app
```

#### For Multiple Origins (Development + Production)
```
CORS_ORIGIN=http://localhost:5173,https://your-frontend-app.vercel.app
```

#### For Testing (Allow All - NOT RECOMMENDED FOR PRODUCTION)
```
CORS_ORIGIN=*
```

### Step 2: Redeploy Backend

After updating the environment variable:
1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click **Redeploy** button

OR simply push a new commit to trigger a deployment:
```bash
git add .
git commit -m "Update CORS configuration"
git push origin master
```

### Step 3: Verify CORS Headers

After redeployment, test your API endpoint:

```bash
curl -I -X OPTIONS https://backend-ccrf.vercel.app/api/v1/auth/login \
  -H "Origin: https://your-frontend-app.vercel.app" \
  -H "Access-Control-Request-Method: POST"
```

You should see these headers in the response:
```
Access-Control-Allow-Origin: https://your-frontend-app.vercel.app
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Cookie
```

## Common Issues

### Issue 1: "CORS blocked origin" in logs
**Cause**: The frontend URL is not in the allowed origins list
**Solution**: Add the frontend URL to `CORS_ORIGIN` environment variable

### Issue 2: Credentials not being sent
**Cause**: Frontend not configured to send credentials
**Solution**: Ensure your frontend API client has `withCredentials: true`

### Issue 3: Preflight requests failing
**Cause**: OPTIONS requests not handled properly
**Solution**: The updated CORS configuration now handles OPTIONS requests automatically

## Testing CORS Locally

To test CORS locally before deploying:

1. Update your local `.env` file:
```env
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

2. Start your backend:
```bash
npm run dev
```

3. Test from your frontend running on `http://localhost:5173`

## Security Best Practices

1. **Never use `*` in production** - Always specify exact origins
2. **Use HTTPS in production** - HTTP origins are less secure
3. **Limit origins** - Only add origins you control
4. **Monitor logs** - Check for blocked CORS attempts in Vercel logs

## Current Configuration

The backend now supports:
- ✅ Multiple origins (comma-separated)
- ✅ Credentials (cookies, authorization headers)
- ✅ Preflight requests (OPTIONS)
- ✅ Custom headers (Content-Type, Authorization, Cookie)
- ✅ Exposed headers (Set-Cookie)

## Example Environment Variables for Vercel

```env
# Production only
CORS_ORIGIN=https://dynatrace-frontend.vercel.app

# Development + Production
CORS_ORIGIN=http://localhost:5173,https://dynatrace-frontend.vercel.app

# Multiple production environments
CORS_ORIGIN=https://dynatrace-frontend.vercel.app,https://dynatrace-frontend-staging.vercel.app
```
