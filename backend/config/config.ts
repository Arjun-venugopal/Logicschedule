import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.MONGO_URI) {
    throw new Error('FATAL: MONGO_URI environment variable is missing in production mode!');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'secret') {
    throw new Error('FATAL: JWT_SECRET environment variable is missing or insecure in production mode!');
  }
}

export const config = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/teacher_schedule',
  JWT_SECRET: process.env.JWT_SECRET || 'secret',
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@gmail.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@12345',
};
