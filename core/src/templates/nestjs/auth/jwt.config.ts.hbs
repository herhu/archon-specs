export type JwtVerifyMode = 'jwks' | 'secret';

export type JwtConfig = {
issuer: string;
audience: string;
mode: JwtVerifyMode;
jwksUri?: string;
secret?: string;
};

export function loadJwtConfig(): JwtConfig {
const issuer = process.env.JWT_ISSUER ?? '{{jwtIssuer}}';
const audience = process.env.JWT_AUDIENCE ?? '{{jwtAudience}}';
const jwksUri = process.env.JWT_JWKS_URI;
const secret = process.env.JWT_SECRET;

if (jwksUri) {
return { issuer, audience, mode: 'jwks', jwksUri };
}

if (secret) {
return { issuer, audience, mode: 'secret', secret };
}

throw new Error('Invalid Auth Config: Set either JWT_JWKS_URI (for remote) or JWT_SECRET (for local/HS256) in .env');
}