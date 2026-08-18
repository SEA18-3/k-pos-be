import type { Response } from 'express';

export const REFRESH_COOKIE_NAME = 'kpos_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function readRefreshCookie(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = pair.trim().split('=');
    if (rawName === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return undefined;
}

export function setRefreshCookie(response: Response, token: string): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  });
}
