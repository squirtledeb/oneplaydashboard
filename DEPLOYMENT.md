# OnePlay Cloud Dashboard Deployment Guide

## Local Development

There are two ways to run the application locally:

### Option 1: Static Server (Simplest)

This is best for frontend development without backend functionality:

```bash
# Install dependencies
npm install

# Start a live reload server
npm run static
```

This will start a server at http://localhost:8080 that automatically reloads when you make changes to any HTML, CSS or JavaScript file.

### Option 2: Node.js Server (Full Stack)

This will run the full application with backend functionality:

```bash
# Install dependencies
npm install

# Start the development server with auto-reload
npm run dev
```

This will start the server at http://localhost:3000 with the backend API accessible.

## Deploying to Production

### Option 1: Static Hosting (Netlify, GitHub Pages, etc.)

If you only need the frontend:

1. Remove server-side authentication and use the client-side approach (already implemented)
2. Deploy to any static hosting service

**Example: Netlify Deployment**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy to Netlify
netlify deploy
```

### Option 2: Full Stack Hosting (Heroku, Railway, Render, etc.)

For the complete application with backend:

**Example: Heroku Deployment**

```bash
# Install Heroku CLI
brew install heroku/brew/heroku

# Login to Heroku
heroku login

# Create a new Heroku app
heroku create oneplay-dashboard

# Deploy to Heroku
git push heroku main
```

## Making Live Changes

### For Local Development

1. Make changes to your files
2. If using `npm run static` or `npm run dev`, the page will automatically reload

### For Production

Set up Continuous Deployment:

1. Connect your repository to GitHub
2. Set up GitHub Actions, Netlify, or Heroku to automatically deploy when you push to main

**Example GitHub Action for Netlify deployment:**

Create a file at `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Netlify

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Deploy to Netlify
      uses: netlify/actions/cli@master
      with:
        args: deploy --dir=. --prod
      env:
        NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
        NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

## Managing User Accounts

With the server running, you can manage user accounts using the provided scripts:

```bash
# Add a user
node server/add-user.js username password

# Remove a user
node server/remove-user.js username

# List all users
node server/list-users.js
```

Alternatively, you can directly edit `/server/users.json`.