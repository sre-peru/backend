# Deployment Guide for Vercel

## Prerequisites

1. Install dependencies locally first:
```bash
npm install
```

## Vercel Deployment Steps

### 1. Install Vercel CLI (optional, for local testing)
```bash
npm install -g vercel
```

### 2. Configure Environment Variables in Vercel Dashboard

Go to your Vercel project settings and add these environment variables:

```
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB_NAME=problemas-dynatrace-uno
MONGODB_COLLECTION_NAME=problems
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters
JWT_EXPIRES_IN=30m
CORS_ORIGIN=https://your-frontend-app.vercel.app
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Deploy to Vercel

#### Option A: Deploy via GitHub (Recommended)
1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Vercel will automatically deploy on every push to master

```bash
git add .
git commit -m "Configure Vercel serverless deployment"
git push origin master
```

#### Option B: Deploy via Vercel CLI
```bash
vercel --prod
```

### 4. Test Your Deployment

After deployment, test these endpoints:

- Health check: `https://your-backend.vercel.app/api/v1/health`
- Root: `https://your-backend.vercel.app/`
- Login: `https://your-backend.vercel.app/api/v1/auth/login`

## Project Structure for Vercel

```
backend/
├── api/
│   └── index.ts          # Vercel serverless entry point
├── src/
│   ├── app.ts            # Express app configuration
│   ├── server.ts         # Local development server (not used in Vercel)
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── services/
│   └── utils/
├── vercel.json           # Vercel configuration
├── package.json
└── tsconfig.json
```

## Important Notes

- The `api/index.ts` file is the entry point for Vercel serverless functions
- The `src/server.ts` file is only used for local development
- Vercel automatically compiles TypeScript files
- Database connections are cached across function invocations for better performance
- Environment variables must be configured in Vercel dashboard, not in `.env` files

## Troubleshooting

### 404 Errors
- Ensure `api/index.ts` exists and exports a default function
- Check that `vercel.json` routes are configured correctly
- Verify that all dependencies are listed in `package.json`

### Database Connection Errors
- Verify MongoDB URI is correct in Vercel environment variables
- Ensure MongoDB allows connections from Vercel's IP addresses (use 0.0.0.0/0 for testing)
- Check MongoDB Atlas network access settings

### CORS Errors
- Update `CORS_ORIGIN` environment variable with your frontend URL
- Ensure frontend URL matches exactly (including https://)
