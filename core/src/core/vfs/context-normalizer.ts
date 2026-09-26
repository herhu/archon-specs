/**
 * HandleArchon context normalizer.
 *
 * Guarantees a baseline of keys that code templates reference, so strict
 * rendering never throws on a legitimately-optional-but-defaultable value.
 * (It also fixes latent "silent empty" bugs — e.g. `{{projectName}}` rendering
 * blank in swagger.ts / `{{port}}` in config.schema.ts via the rule path.)
 *
 * User-fill placeholders that belong in leaf files (JWT issuer, token URL,
 * client id, etc.) are intentionally NOT defaulted here — those templates are
 * rendered in lenient mode.
 */
export function normalizeRenderContext(ctx: any): any {
  const c = ctx || {};
  // Flatten the nested auth/JWT contract into the flat keys the auth/env/script
  // templates reference (jwt.config.ts uses {{jwtIssuer}}/{{jwtAudience}}). The
  // V2 rule builder passes raw `spec`, so without this the auth config rendered
  // empty (silent) — now strict rendering would throw, so we provide them here.
  const jwt = (c.crossCutting && c.crossCutting.auth && c.crossCutting.auth.jwt) || {};
  const issuer = c.jwtIssuer ?? jwt.issuer ?? "";
  const defaults = {
    projectName: c.projectName ?? c.name ?? "app",
    apiPrefix: c.apiPrefix ?? "api/v1",
    port: c.port ?? 3000,
    jwtIssuer: issuer,
    jwtAudience: c.jwtAudience ?? jwt.audience ?? "",
    jwtJwksUri: c.jwtJwksUri ?? jwt.jwksUri ?? "",
    jwti: c.jwti ?? issuer,
    tokenUrl: c.tokenUrl ?? (issuer ? issuer.replace(/\/$/, "") + "/oauth/token" : ""),
    audience: c.audience ?? jwt.audience ?? "",
    defaultScopes: c.defaultScopes ?? jwt.defaultScopes ?? "openid profile",
  };
  return { ...c, ...defaults };
}
