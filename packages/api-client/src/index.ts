export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:8080';

export type AccountType = 'ADMIN';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}
