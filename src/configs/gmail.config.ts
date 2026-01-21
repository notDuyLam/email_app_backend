import { registerAs } from '@nestjs/config';

export default registerAs('gmail', () => {
  const port = process.env.PORT || '3000';
  const defaultRedirectUri = `http://localhost:${port}/api/auth/google/callback`;

  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    scopes: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
  };
});
