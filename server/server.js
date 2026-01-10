const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://your-app-name.onrender.com/auth/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'chrome-extension://YOUR_EXTENSION_ID';

// Update CORS to allow your extension
app.use(cors({
  origin: '*', // In production, you might want to restrict this
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'LeetCode GitHub Sync Server Running' });
});

// Initiate GitHub OAuth flow
app.get('/auth/github', (req, res) => {
  const scope = 'repo';
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}`;
  res.redirect(authUrl);
});

// GitHub OAuth callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI
      },
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error('Failed to obtain access token');
    }

    // Get user information
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${access_token}`
      }
    });

    const { login: username } = userResponse.data;

    // Send success page with token (to be captured by extension)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitHub Authorization Success</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f8fafc;
            color: #1e3a8a;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          h1 { margin-bottom: 1rem; }
          p { margin-bottom: 1.5rem; opacity: 0.8; }
          .success { color: #10b981; font-size: 3rem; margin-bottom: 1rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✓</div>
          <h1>Authorization Successful!</h1>
          <p>You can close this window and return to the extension.</p>
        </div>
        <script>
          // Send auth data to extension
          if (window.opener) {
            window.opener.postMessage({
              type: 'GITHUB_AUTH_SUCCESS',
              token: '${access_token}',
              username: '${username}'
            }, '*');
            setTimeout(() => window.close(), 2000);
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Failed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f8fafc;
            color: #1e3a8a;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .error { color: #ef4444; font-size: 3rem; margin-bottom: 1rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">✗</div>
          <h1>Authorization Failed</h1>
          <p>Please try again.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Verify GitHub token
app.post('/api/verify-token', async (req, res) => {
  const { token } = req.body;

  try {
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`
      }
    });

    res.json({ valid: true, username: response.data.login });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

// Get user repositories
app.post('/api/repositories', async (req, res) => {
  const { token } = req.body;

  try {
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `token ${token}`
      },
      params: {
        sort: 'updated',
        per_page: 100
      }
    });

    const repos = response.data.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private
    }));

    res.json(repos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Make sure to set the following environment variables:');
  console.log('- GITHUB_CLIENT_ID');
  console.log('- GITHUB_CLIENT_SECRET');
  console.log('- REDIRECT_URI (optional, defaults to http://localhost:3000/auth/callback)');
});