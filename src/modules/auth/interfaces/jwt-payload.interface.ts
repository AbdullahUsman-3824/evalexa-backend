export interface JwtPayload {
  sub: string;
  email: string;
  companyId?: string | null;
  iat?: number;
  exp?: number;
}
