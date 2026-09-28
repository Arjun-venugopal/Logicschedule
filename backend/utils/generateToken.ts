import jwt from 'jsonwebtoken';
import { config } from '../config/config';

export interface TokenPayload {
  id: string;
  role: string;
  type?: 'access' | 'refresh';
}

/**
 * Access Token: short-lived (e.g. 24h or configurable via ACCESS_TOKEN_EXPIRES_IN)
 */
export const generateAccessToken = (id: string, role: string): string => {
  const expiresIn = (process.env.ACCESS_TOKEN_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'];
  return jwt.sign({ id, role, type: 'access' }, config.JWT_SECRET, {
    expiresIn,
  });
};

/**
 * Refresh Token: long-lived (7 days) for session maintenance
 */
export const generateRefreshToken = (id: string, role: string): string => {
  const expiresIn = (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign({ id, role, type: 'refresh' }, config.JWT_SECRET, {
    expiresIn,
  });
};

/**
 * Generate Access + Refresh Token pair
 */
export const generateTokens = (id: string, role: string) => {
  return {
    accessToken: generateAccessToken(id, role),
    refreshToken: generateRefreshToken(id, role),
  };
};

/**
 * Standard cookie configuration for HttpOnly Refresh Tokens
 */
export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};

/**
 * Zero-dependency cookie parser helper
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Default export maintained for existing codebase callers
 */
const generateToken = (id: string, role: string): string => {
  return generateAccessToken(id, role);
};

export default generateToken;
