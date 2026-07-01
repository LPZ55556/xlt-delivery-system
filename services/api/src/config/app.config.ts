import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 3000),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://127.0.0.1:3000',
  webAdminUrl: process.env.WEB_ADMIN_URL ?? 'http://127.0.0.1:3001',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  firstRunSetupEnabled: process.env.FIRST_RUN_SETUP_ENABLED !== 'false',
}));
