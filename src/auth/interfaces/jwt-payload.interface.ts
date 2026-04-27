export interface JwtPayload {
  sub: number;
  email: string;
  companyId?: number | null;
  iat?: number;
  exp?: number;
}
