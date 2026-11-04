/* ─────────────────────────────────────────────────────────────
   Guides — interactive "Try a Spec" demo
   Pure client-side. No backend calls. No external libraries.

   Pipeline:
     1. Parse the textarea content into a tiny model
        ({ entities: [{ name, fields: [{name, type, primary, ref}] }] })
     2. Render a file tree on the right (one folder per entity)
     3. On click, render a preview of that file using JS templates.

   The DSL it understands is intentionally minimal:

     EntityName {
       fieldName: type [primary]
       authorId: OtherEntity
     }

   Types recognised: uuid, string, text, int, decimal, date,
   datetime, bool, json. Anything else is treated as a relation
   to another entity (e.g. `authorId: User`).
   ───────────────────────────────────────────────────────────── */
(function () {
  const $spec   = document.getElementById('demo-spec');
  const $tree   = document.getElementById('demo-tree');
  const $code   = document.getElementById('demo-code');
  const $file   = document.getElementById('demo-current-file');
  const $count  = document.getElementById('demo-file-count');
  const $reset  = document.getElementById('demo-reset');
  if (!$spec || !$tree) return;

  const DEFAULT_SPEC = $spec.value;
  let activeFilePath = null;

  // ─── Parser ─────────────────────────────────────────────────
  const PRIMITIVE_TYPES = new Set([
    'uuid','string','text','int','integer','decimal','float',
    'date','datetime','timestamp','bool','boolean','json'
  ]);

  function parseSpec(src) {
    const entities = [];
    const blockRe  = /(\w+)\s*\{([^}]*)\}/g;
    let m;
    while ((m = blockRe.exec(src)) !== null) {
      const name = m[1];
      const body = m[2];
      const fields = [];
      body.split('\n').forEach(raw => {
        const line = raw.trim();
        if (!line || line.startsWith('//') || line.startsWith('#')) return;
        const fm = line.match(/^(\w+)\s*:\s*([\w.]+)(.*)$/);
        if (!fm) return;
        const fname = fm[1];
        const ftype = fm[2];
        const flags = fm[3] || '';
        const isPrimary = /\bprimary\b/.test(flags);
        const isPrimitive = PRIMITIVE_TYPES.has(ftype.toLowerCase());
        fields.push({
          name: fname,
          type: ftype,
          primary: isPrimary,
          ref: isPrimitive ? null : ftype.split('.')[0]
        });
      });
      entities.push({ name, fields });
    }
    return { entities };
  }

  // ─── Helpers ────────────────────────────────────────────────
  function kebab(s)  { return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(); }
  function camel(s)  { return s.charAt(0).toLowerCase() + s.slice(1); }
  function plural(s) {
    if (/[sxz]$|sh$|ch$/.test(s)) return s + 'es';
    if (/[^aeiou]y$/.test(s))     return s.slice(0, -1) + 'ies';
    return s + 's';
  }

  function tsType(field) {
    if (field.ref) return 'string';
    switch (field.type.toLowerCase()) {
      case 'uuid':
      case 'string':
      case 'text':       return 'string';
      case 'int':
      case 'integer':
      case 'decimal':
      case 'float':      return 'number';
      case 'bool':
      case 'boolean':    return 'boolean';
      case 'date':
      case 'datetime':
      case 'timestamp':  return 'Date';
      case 'json':       return 'Record<string, any>';
      default:           return 'string';
    }
  }

  function ormColumnDecorator(field) {
    if (field.primary) return `@PrimaryGeneratedColumn('uuid')`;
    if (field.ref)     return `@Column({ type: 'uuid' })`;
    const map = {
      uuid:      `@Column({ type: 'uuid' })`,
      string:    `@Column({ length: 255 })`,
      text:      `@Column({ type: 'text' })`,
      int:       `@Column({ type: 'int' })`,
      integer:   `@Column({ type: 'int' })`,
      decimal:   `@Column({ type: 'decimal', precision: 10, scale: 2 })`,
      float:     `@Column({ type: 'float' })`,
      date:      `@Column({ type: 'date' })`,
      datetime:  `@Column({ type: 'timestamp' })`,
      timestamp: `@Column({ type: 'timestamp' })`,
      bool:      `@Column({ type: 'boolean', default: false })`,
      boolean:   `@Column({ type: 'boolean', default: false })`,
      json:      `@Column({ type: 'jsonb', nullable: true })`,
    };
    return map[field.type.toLowerCase()] || `@Column()`;
  }

  function classValidatorDecorator(field) {
    if (field.ref || field.type.toLowerCase() === 'uuid') return '@IsUUID()';
    switch (field.type.toLowerCase()) {
      case 'string':
      case 'text':      return '@IsString()';
      case 'int':
      case 'integer':
      case 'decimal':
      case 'float':     return '@IsNumber()';
      case 'bool':
      case 'boolean':   return '@IsBoolean()';
      case 'date':
      case 'datetime':
      case 'timestamp': return '@IsDateString()';
      case 'json':      return '@IsObject()';
      default:          return '@IsString()';
    }
  }

  // ─── Templates (one per file type) ──────────────────────────
  const T = {
    entity: (e) => {
      const importsRel = e.fields
        .filter(f => f.ref)
        .map(f => `import { ${f.ref} } from '../${kebab(f.ref)}/${kebab(f.ref)}.entity';`)
        .join('\n');
      const columns = e.fields.map(f => {
        const dec = ormColumnDecorator(f);
        const t   = tsType(f);
        return `  ${dec}\n  ${f.name}!: ${t};`;
      }).join('\n\n');
      const relations = e.fields
        .filter(f => f.ref)
        .map(f => {
          const refVar = camel(f.ref);
          return `  @ManyToOne(() => ${f.ref}, { onDelete: 'CASCADE' })\n  @JoinColumn({ name: '${f.name}' })\n  ${refVar}?: ${f.ref};`;
        })
        .join('\n\n');
      const ormImports = ['Entity', 'Column', 'PrimaryGeneratedColumn'];
      if (relations) ormImports.push('ManyToOne', 'JoinColumn');
      return [
        `import { ${ormImports.join(', ')} } from 'typeorm';`,
        importsRel,
        '',
        `@Entity({ name: '${plural(kebab(e.name))}' })`,
        `export class ${e.name} {`,
        columns,
        relations ? '\n' + relations : '',
        `}`,
      ].filter(Boolean).join('\n');
    },

    controller: (e) => {
      const n  = e.name;
      const cv = camel(n);
      const pl = plural(kebab(n));
      return `import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ${n}Service } from './${kebab(n)}.service';
import { Create${n}Dto } from './dto/create-${kebab(n)}.dto';
import { Update${n}Dto } from './dto/update-${kebab(n)}.dto';

@ApiTags('${pl}')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('${pl}')
export class ${n}Controller {
  constructor(private readonly ${cv}Service: ${n}Service) {}

  @Get()
  findAll() {
    return this.${cv}Service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.${cv}Service.findOne(id);
  }

  @Post()
  create(@Body() dto: Create${n}Dto) {
    return this.${cv}Service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Update${n}Dto) {
    return this.${cv}Service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.${cv}Service.remove(id);
  }
}`;
    },

    service: (e) => {
      const n  = e.name;
      const cv = camel(n);
      return `import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ${n} } from './${kebab(n)}.entity';
import { Create${n}Dto } from './dto/create-${kebab(n)}.dto';
import { Update${n}Dto } from './dto/update-${kebab(n)}.dto';

@Injectable()
export class ${n}Service {
  constructor(
    @InjectRepository(${n}) private readonly repo: Repository<${n}>,
  ) {}

  findAll() {
    return this.repo.find();
  }

  async findOne(id: string) {
    const ${cv} = await this.repo.findOne({ where: { id } });
    if (!${cv}) throw new NotFoundException(\`${n} \${id} not found\`);
    return ${cv};
  }

  create(dto: Create${n}Dto) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: string, dto: Update${n}Dto) {
    const existing = await this.findOne(id);
    Object.assign(existing, dto);
    return this.repo.save(existing);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    return this.repo.remove(existing);
  }
}`;
    },

    module: (e) => {
      const n = e.name;
      return `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${n} } from './${kebab(n)}.entity';
import { ${n}Service } from './${kebab(n)}.service';
import { ${n}Controller } from './${kebab(n)}.controller';

@Module({
  imports: [TypeOrmModule.forFeature([${n}])],
  controllers: [${n}Controller],
  providers: [${n}Service],
  exports: [${n}Service],
})
export class ${n}Module {}`;
    },

    createDto: (e) => {
      const n = e.name;
      const lines = e.fields
        .filter(f => !f.primary)
        .map(f => `  ${classValidatorDecorator(f)}\n  ${f.name}!: ${tsType(f)};`)
        .join('\n\n');
      return `import {
  IsString, IsNumber, IsBoolean, IsDateString, IsUUID, IsObject,
} from 'class-validator';

export class Create${n}Dto {
${lines}
}`;
    },

    updateDto: (e) => {
      const n = e.name;
      return `import { PartialType } from '@nestjs/swagger';
import { Create${n}Dto } from './create-${kebab(n)}.dto';

export class Update${n}Dto extends PartialType(Create${n}Dto) {}`;
    },

    appModule: (model) => {
      const imports = model.entities
        .map(e => `import { ${e.name}Module } from './${kebab(e.name)}/${kebab(e.name)}.module';`)
        .join('\n');
      const list = model.entities.map(e => `${e.name}Module`).join(', ');
      return `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
${imports}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
    ${list},
  ],
})
export class AppModule {}`;
    },

    main: () => `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Generated API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();`,

    dockerfile: () => `# Multi-stage build — Archon-generated, production-ready
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]`,

    dockerCompose: () => `version: "3.9"
services:
  api:
    build: .
    ports: ["3000:3000"]
    env_file: .env.docker
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10
volumes:
  pgdata:`,

    // ─── Auth ───────────────────────────────────────────
    authModule: () => `import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { jwtConfig } from './jwt.config';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtConfig,
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}`,

    jwtGuard: () => `import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Globally usable JWT guard. Reads the bearer token from the
 * Authorization header, verifies signature + issuer + audience
 * against the JWKS configured in jwt.config.ts.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or missing access token');
    }
    return user;
  }
}`,

    jwtConfig: () => `import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';
import { passportJwtSecret } from 'jwks-rsa';

/**
 * Async JWT module factory wired to a JWKS endpoint.
 * Never embeds a secret in the binary — keys come from the IDP.
 */
export const jwtConfig = (cfg: ConfigService): JwtModuleOptions => ({
  verifyOptions: {
    algorithms: ['RS256'],
    issuer: cfg.getOrThrow<string>('JWT_ISSUER'),
    audience: cfg.getOrThrow<string>('JWT_AUDIENCE'),
  },
  secretOrKeyProvider: passportJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    jwksUri: cfg.getOrThrow<string>('JWT_JWKS_URI'),
  }),
});`,

    scopesGuard: () => `import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = ctx.switchToHttp().getRequest();
    const granted: string[] = (user?.scope ?? '').split(' ').filter(Boolean);
    return required.every((s) => granted.includes(s));
  }
}`,

    scopesDecorator: () => `import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'archon:scopes';

/**
 * @Scopes('orders:write', 'admin')
 * Use together with @UseGuards(JwtAuthGuard, ScopesGuard) on a controller or handler.
 */
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);`,

    // ─── Shared / cross-cutting ─────────────────────────
    httpFilter: () => `import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Single point of conversion from any thrown error to a stable,
 * well-formed JSON error response. Includes correlation id, status,
 * timestamp, path, and a safe message.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const correlationId = (req as any).correlationId ?? null;

    if (status >= 500) this.logger.error({ correlationId, exception });

    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: req.url,
      correlationId,
      error: message,
    });
  }
}`,

    correlationMw: () => `import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Reads X-Correlation-ID from the incoming request or generates one,
 * attaches it to req.correlationId, and echoes it back on the response.
 * Logged on every span — invaluable for distributed debugging.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers['x-correlation-id'] as string) || randomUUID();
    (req as any).correlationId = id;
    res.setHeader('X-Correlation-ID', id);
    next();
  }
}`,

    transformInt: () => `import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

/**
 * Wraps every successful response body in a standard envelope:
 * { data, meta: { correlationId, timestamp } }
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(ctx: ExecutionContext, next: CallHandler<T>): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}`,

    swaggerSetup: () => `import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Generated API')
    .setDescription('Production API generated by Archon Specs.')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc, {
    swaggerOptions: { persistAuthorization: true },
  });
}`,

    configModule: () => `import { Module } from '@nestjs/common';
import { ConfigModule as Nest, ConfigService } from '@nestjs/config';
import { configSchema } from './config.schema';

@Module({
  imports: [
    Nest.forRoot({
      isGlobal: true,
      validate: (env) => configSchema.parse(env),
      cache: true,
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}`,

    configSchema: () => `import { z } from 'zod';

/**
 * Strict, fail-fast environment validation. The app refuses to boot
 * if any required variable is missing or malformed — no silent defaults.
 */
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  JWT_JWKS_URI: z.string().url(),
  LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace']).default('info'),
});

export type Config = z.infer<typeof configSchema>;`,

    healthModule: () => `import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}`,

    healthController: () => `import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck, HealthCheckService, TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
    ]);
  }
}`,

    healthService: () => `import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  uptime(): number { return process.uptime(); }
  version(): string { return process.env.APP_VERSION ?? 'dev'; }
}`,

    loggerModule: () => `import { Module } from '@nestjs/common';
import { LoggerModule as Pino } from 'nestjs-pino';
import { pinoOptions } from './pino.options';

@Module({
  imports: [Pino.forRoot(pinoOptions)],
  exports: [Pino],
})
export class LoggerModule {}`,

    pinoOptions: () => `import { Params } from 'nestjs-pino';

export const pinoOptions: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    autoLogging: true,
    customProps: (req: any) => ({ correlationId: req.correlationId }),
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
};`,

    archonManual: () => `/**
 * @ArchonManual — Mark blocks of code that Archon must preserve across
 * regenerations. Any method or class wearing this decorator will be
 * carried through into the new file via semantic hashing.
 *
 *   @ArchonManual()
 *   async customLogic() { ... }
 *
 * This is the contract that makes Archon safe for long-lived projects.
 */
export function ArchonManual(): MethodDecorator & ClassDecorator {
  return ((..._args: any[]) => {}) as any;
}`,

    // ─── Database ───────────────────────────────────────
    schemaSql: (model) => {
      const tables = model.entities.map(e => {
        const t = plural(kebab(e.name));
        const cols = e.fields.map(f => {
          if (f.primary) return `  ${f.name} uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
          const sqlType = f.ref ? 'uuid'
            : f.type === 'string' ? 'varchar(255)'
            : f.type === 'text' ? 'text'
            : f.type === 'int' || f.type === 'integer' ? 'integer'
            : f.type === 'decimal' ? 'numeric(10,2)'
            : f.type === 'bool' || f.type === 'boolean' ? 'boolean NOT NULL DEFAULT false'
            : f.type === 'date' ? 'date'
            : f.type === 'datetime' || f.type === 'timestamp' ? 'timestamptz'
            : f.type === 'json' ? 'jsonb'
            : 'varchar(255)';
          return `  ${f.name} ${sqlType}`;
        }).join(',\n');
        const fks = e.fields.filter(f => f.ref).map(f =>
          `  CONSTRAINT fk_${kebab(e.name)}_${f.name} FOREIGN KEY (${f.name}) REFERENCES ${plural(kebab(f.ref))}(id) ON DELETE CASCADE`
        ).join(',\n');
        const indexes = e.fields.filter(f => f.ref).map(f =>
          `CREATE INDEX idx_${kebab(e.name)}_${f.name} ON ${t}(${f.name});`
        ).join('\n');
        return `CREATE TABLE ${t} (\n${cols}${fks ? ',\n' + fks : ''}\n);\n${indexes}`;
      }).join('\n\n');
      return `-- Archon-generated schema. Idempotent. Foreign keys + indexes inferred from spec relations.\nCREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n${tables}`;
    },

    migrationSql: (model) => {
      const adds = model.entities.map(e => {
        const t = plural(kebab(e.name));
        return `-- + add ${e.name}\nCREATE TABLE IF NOT EXISTS ${t} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`;
      }).join('\n\n');
      const rollback = model.entities.map(e => `DROP TABLE IF EXISTS ${plural(kebab(e.name))} CASCADE;`).join('\n');
      return `-- Forward migration\n${adds}\n\n-- Rollback\n-- ${rollback.split('\n').join('\n-- ')}`;
    },

    // ─── Scripts / DevOps ───────────────────────────────
    archonSh: () => `#!/usr/bin/env bash
# ARCHON onboarding entrypoint. Runs after a fresh clone.
# Boots the local DB, applies migrations, seeds, and starts the API.
set -euo pipefail
./scripts/docker-up.sh
npx ts-node scripts/db-migrate.ts
npm run start:dev`,

    dockerUp: () => '#!/usr/bin/env bash\nset -euo pipefail\ndocker compose up -d postgres\ndocker compose run --rm api npm run migration:run',

    dockerDown: () => '#!/usr/bin/env bash\nset -euo pipefail\ndocker compose down -v',

    dbMigrate: () => `import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

(async () => {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    migrations: ['db/migrations/*.sql'],
    migrationsRun: true,
  });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  await ds.destroy();
})();`,

    getToken: () => `#!/usr/bin/env bash
# Quick helper to fetch a JWT from the local IDP for curl testing.
set -euo pipefail
curl -s -X POST "$JWT_ISSUER/oauth/token" \\\\
  -H "content-type: application/json" \\\\
  -d '{"client_id":"'"$CLIENT_ID"'","client_secret":"'"$CLIENT_SECRET"'","audience":"'"$JWT_AUDIENCE"'","grant_type":"client_credentials"}' \\\\
  | jq -r .access_token`,

    jenkinsfile: () => `pipeline {
  agent any
  options { timestamps(); ansiColor('xterm'); disableConcurrentBuilds() }
  environment { NODE_ENV = 'production' }
  stages {
    stage('Checkout')   { steps { checkout scm } }
    stage('Install')    { steps { sh 'npm ci' } }
    stage('Lint')       { steps { sh 'npm run lint' } }
    stage('Test')       { steps { sh 'npm run test -- --ci --coverage' } }
    stage('Build')      { steps { sh 'npm run build' } }
    stage('SonarQube')  { steps { withSonarQubeEnv('sq') { sh 'npx sonar-scanner' } } }
    stage('Docker')     { steps { sh 'docker build -t app:\${BUILD_NUMBER} .' } }
    stage('Frogbot')    { steps { sh 'jf frogbot scan-pr' } }
    stage('Deploy')     {
      when { branch 'main' }
      steps { sh 'terraform apply -auto-approve -var image_tag=\${BUILD_NUMBER}' }
    }
  }
  post {
    always  { junit 'reports/junit/*.xml'; cleanWs() }
    failure { mail to: 'devops@example.com', subject: "FAIL #\${BUILD_NUMBER}", body: '\${BUILD_URL}' }
  }
}`,

    frogbot: () => `name: "Frogbot Scan Pull Request"
on:
  pull_request:
    types: [opened, synchronize]
permissions: { pull-requests: write, contents: read }
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jfrog/frogbot@v2
        env:
          JF_URL: \${{ secrets.JF_URL }}
          JF_ACCESS_TOKEN: \${{ secrets.JF_ACCESS_TOKEN }}
          JF_GIT_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,

    terraform: () => `# Minimal AWS ECR + ECS Fargate scaffold
terraform { required_version = ">= 1.6" }
provider "aws" { region = var.region }

variable "region"    { default = "eu-west-1" }
variable "image_tag" { type = string }

resource "aws_ecr_repository" "app" { name = "archon-app" }
resource "aws_ecs_cluster"     "main" { name = "archon-cluster" }

# task + service blocks omitted in preview`,

    sonar: () => `sonar.projectKey=archon-app
sonar.projectName=Archon App
sonar.sources=src
sonar.tests=test
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.exclusions=**/node_modules/**,**/dist/**`,

    newrelic: () => `'use strict';
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'archon-app'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: { enabled: true },
  logging: { level: 'info' },
  allow_all_headers: true,
};`,

    openapi: () => `# Generated by Archon at build time. Sourced from controller decorators.
openapi: 3.1.0
info:
  title: Generated API
  version: 1.0.0
paths: {}
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
security:
  - bearerAuth: []`,

    // ─── Husky ──────────────────────────────────────────
    preCommit: () => `#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"
npm run lint --silent && npm run test --silent`,

    prepareCommit: () => `#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"
# Auto-prefix commit message with branch slug — see scripts/branch-to-commit-message.sh
./scripts/branch-to-commit-message.sh "$1"`,

    // ─── Repo-level config ──────────────────────────────
    packageJson: () => `{
  "name": "archon-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "lint": "eslint \\"src/**/*.ts\\" --fix",
    "test": "jest",
    "migration:run": "ts-node scripts/db-migrate.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/swagger": "^7.3.0",
    "@nestjs/terminus": "^10.2.0",
    "@nestjs/typeorm": "^10.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "jwks-rsa": "^3.1.0",
    "nestjs-pino": "^4.0.0",
    "passport-jwt": "^4.0.1",
    "pg": "^8.11.0",
    "pino-http": "^9.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.20",
    "zod": "^3.22.0"
  }
}`,

    tsconfig: () => `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}`,

    eslintrc: () => `{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
  ],
  "root": true,
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "error"
  }
}`,

    prettierrc: () => `{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}`,

    gitignore: () => `node_modules
dist
coverage
.env
.env.local
*.log
.DS_Store
.archon/state.local.json`,

    dockerignore: () => `node_modules
dist
coverage
.git
.env*
.archon`,

    envExample: () => `NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://app:app@localhost:5432/app

# Auth (JWKS-based, no static secret)
JWT_ISSUER=https://your-idp.example.com/
JWT_AUDIENCE=archon-app
JWT_JWKS_URI=https://your-idp.example.com/.well-known/jwks.json

LOG_LEVEL=info`,

    launchJson: () => `{
  "version": "0.2.0",
  "configurations": [{
    "type": "node",
    "request": "launch",
    "name": "Debug NestJS",
    "runtimeArgs": ["--inspect-brk", "node_modules/.bin/nest", "start"],
    "console": "integratedTerminal"
  }]
}`,

    readme: (model) => `# Generated by Archon Specs

This codebase was produced from a single spec. To rebuild it after a spec change, run \`archon generate\`.

## What's inside
- **${model.entities.length} domain module(s)**: ${model.entities.map(e => e.name).join(', ')}
- **JWT auth** wired to a JWKS endpoint (no static secrets)
- **Health checks**, **structured logging** (pino + correlation id), **error envelopes**, **Swagger** at \`/docs\`
- **PostgreSQL** schema + migrations + foreign keys
- **CI**: Jenkinsfile, Frogbot, SonarQube, NewRelic agent
- **Husky** hooks for lint + commit-message conventions
- **Terraform** scaffold for AWS ECR / ECS

## Run it
\`\`\`bash
cp .env.example .env
./scripts/docker-up.sh    # start postgres
npm install
npm run start:dev          # http://localhost:3000/docs
\`\`\`

## Edit it
Open any \`@ArchonManual()\`-decorated method and write your business logic there.
Archon will preserve it across every regeneration.`,

  };

  // ─── File tree builder ─────────────────────────────────────
  // Files are tagged with `tier`:
  //   "entity"     → generated per entity (CRUD scaffold)
  //   "platform"   → always generated (auth, shared, health, logging)
  //   "infra"      → ops/devops/CI/IaC
  //   "config"     → repo-level config files
  function buildFiles(model) {
    const files = [];

    // ─── Per-entity files ────────────────────────────────
    for (const e of model.entities) {
      const dir = kebab(e.name);
      files.push({ path: `src/${dir}/${dir}.entity.ts`,                    kind: 'entity',     tier: 'entity', entity: e });
      files.push({ path: `src/${dir}/${dir}.controller.ts`,                kind: 'controller', tier: 'entity', entity: e });
      files.push({ path: `src/${dir}/${dir}.service.ts`,                   kind: 'service',    tier: 'entity', entity: e });
      files.push({ path: `src/${dir}/${dir}.module.ts`,                    kind: 'module',     tier: 'entity', entity: e });
      files.push({ path: `src/${dir}/dto/create-${dir}.dto.ts`,            kind: 'createDto',  tier: 'entity', entity: e });
      files.push({ path: `src/${dir}/dto/update-${dir}.dto.ts`,            kind: 'updateDto',  tier: 'entity', entity: e });
    }

    // ─── Platform / always-generated NestJS files ────────
    files.push({ path: 'src/main.ts',                                            kind: 'main',              tier: 'platform' });
    files.push({ path: 'src/app.module.ts',                                      kind: 'appModule',         tier: 'platform', model });
    files.push({ path: 'src/archon-manual.decorator.ts',                         kind: 'archonManual',      tier: 'platform' });
    files.push({ path: 'src/auth/auth.module.ts',                                kind: 'authModule',        tier: 'platform' });
    files.push({ path: 'src/auth/jwt.guard.ts',                                  kind: 'jwtGuard',          tier: 'platform' });
    files.push({ path: 'src/auth/jwt.config.ts',                                 kind: 'jwtConfig',         tier: 'platform' });
    files.push({ path: 'src/auth/scopes.guard.ts',                               kind: 'scopesGuard',       tier: 'platform' });
    files.push({ path: 'src/auth/scopes.decorator.ts',                           kind: 'scopesDecorator',   tier: 'platform' });
    files.push({ path: 'src/shared/filters/http-exception.filter.ts',            kind: 'httpFilter',        tier: 'platform' });
    files.push({ path: 'src/shared/middleware/correlation-id.middleware.ts',     kind: 'correlationMw',     tier: 'platform' });
    files.push({ path: 'src/shared/interceptors/transform.interceptor.ts',       kind: 'transformInt',      tier: 'platform' });
    files.push({ path: 'src/shared/swagger/swagger.ts',                          kind: 'swaggerSetup',      tier: 'platform' });
    files.push({ path: 'src/shared/config/config.module.ts',                     kind: 'configModule',      tier: 'platform' });
    files.push({ path: 'src/shared/config/config.schema.ts',                     kind: 'configSchema',      tier: 'platform' });
    files.push({ path: 'src/shared/health/health.module.ts',                     kind: 'healthModule',      tier: 'platform' });
    files.push({ path: 'src/shared/health/health.controller.ts',                 kind: 'healthController',  tier: 'platform' });
    files.push({ path: 'src/shared/health/health.service.ts',                    kind: 'healthService',     tier: 'platform' });
    files.push({ path: 'src/shared/logging/logger.module.ts',                    kind: 'loggerModule',      tier: 'platform' });
    files.push({ path: 'src/shared/logging/pino.options.ts',                     kind: 'pinoOptions',       tier: 'platform' });

    // ─── Database / SQL ──────────────────────────────────
    files.push({ path: 'db/schema.sql',                                          kind: 'schemaSql',         tier: 'infra', model });
    files.push({ path: 'db/migration.sql',                                       kind: 'migrationSql',      tier: 'infra', model });

    // ─── Operational scripts ─────────────────────────────
    files.push({ path: 'scripts/ARCHON.sh',                                      kind: 'archonSh',          tier: 'infra' });
    files.push({ path: 'scripts/docker-up.sh',                                   kind: 'dockerUp',          tier: 'infra' });
    files.push({ path: 'scripts/docker-down.sh',                                 kind: 'dockerDown',        tier: 'infra' });
    files.push({ path: 'scripts/db-migrate.ts',                                  kind: 'dbMigrate',         tier: 'infra' });
    files.push({ path: 'scripts/get-token.sh',                                   kind: 'getToken',          tier: 'infra' });

    // ─── DevOps / CI / IaC ───────────────────────────────
    files.push({ path: 'Dockerfile',                                             kind: 'dockerfile',        tier: 'infra' });
    files.push({ path: 'docker-compose.yml',                                     kind: 'dockerCompose',     tier: 'infra' });
    files.push({ path: 'Jenkinsfile',                                            kind: 'jenkinsfile',       tier: 'infra' });
    files.push({ path: '.github/workflows/frogbot.yml',                          kind: 'frogbot',           tier: 'infra' });
    files.push({ path: 'infrastructure/main.tf',                                 kind: 'terraform',         tier: 'infra' });
    files.push({ path: 'sonar-project.properties',                               kind: 'sonar',             tier: 'infra' });
    files.push({ path: 'newrelic.js',                                            kind: 'newrelic',          tier: 'infra' });
    files.push({ path: 'specs/openapi.yaml',                                     kind: 'openapi',           tier: 'infra' });

    // ─── Husky ───────────────────────────────────────────
    files.push({ path: '.husky/pre-commit',                                      kind: 'preCommit',         tier: 'infra' });
    files.push({ path: '.husky/prepare-commit-msg',                              kind: 'prepareCommit',     tier: 'infra' });

    // ─── Repo-level config ───────────────────────────────
    files.push({ path: 'package.json',                                           kind: 'packageJson',       tier: 'config' });
    files.push({ path: 'tsconfig.json',                                          kind: 'tsconfig',          tier: 'config' });
    files.push({ path: '.eslintrc.json',                                         kind: 'eslintrc',          tier: 'config' });
    files.push({ path: '.prettierrc',                                            kind: 'prettierrc',        tier: 'config' });
    files.push({ path: '.gitignore',                                             kind: 'gitignore',         tier: 'config' });
    files.push({ path: '.dockerignore',                                          kind: 'dockerignore',      tier: 'config' });
    files.push({ path: '.env.example',                                           kind: 'envExample',        tier: 'config' });
    files.push({ path: '.vscode/launch.json',                                    kind: 'launchJson',        tier: 'config' });
    files.push({ path: 'README.md',                                              kind: 'readme',            tier: 'config', model });

    return files;
  }

  function renderFile(file) {
    const fn = T[file.kind];
    if (!fn) return '// (no preview available for this file kind)';
    return fn(file.entity || file.model || file);
  }

  // ─── Tree rendering ────────────────────────────────────────
  // Per-row chip is a single letter (E/P/I/C) with a tooltip; the header summary uses the longer label.
  const TIER_SHORT = { entity: 'E', platform: 'P', infra: 'I', config: 'C' };
  const TIER_LABEL = { entity: 'entity', platform: 'platform', infra: 'infra', config: 'config' };
  const TIER_TITLE = {
    entity:   'Entity — CRUD scaffold per domain',
    platform: 'Platform — auth, health, logging, error envelopes',
    infra:    'Infra — Docker, CI, IaC, husky, DB',
    config:   'Config — package.json, tsconfig, eslint, env',
  };

  function renderTree(files) {
    // Group by top-level folder, then by subfolder
    const root = {};
    for (const f of files) {
      const parts = f.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        node[parts[i]] = node[parts[i]] || { __folder: true, children: {} };
        node = node[parts[i]].children;
      }
      node[parts[parts.length - 1]] = { __file: true, file: f };
    }

    const out = [];
    function walk(node, indent) {
      const keys = Object.keys(node).sort((a, b) => {
        const af = node[a].__folder ? 0 : 1;
        const bf = node[b].__folder ? 0 : 1;
        return af - bf || a.localeCompare(b);
      });
      for (const key of keys) {
        const child = node[key];
        if (child.__folder) {
          out.push(`<div class="demo-tree-folder" style="padding-left:${indent + 8}px">
            <span class="demo-tree-icon">▾</span>${key}/
          </div>`);
          walk(child.children, indent + 18);
        } else {
          const file = child.file;
          const isActive = activeFilePath === file.path;
          const tier = file.tier || 'entity';
          out.push(`<div class="demo-tree-file tier-${tier}${isActive ? ' active' : ''}"
              data-path="${file.path}" title="${file.path}"
              style="padding-left:${indent + 8}px">
              <span class="demo-tree-icon">·</span><span class="demo-tree-name">${key}</span>
              <span class="demo-tree-tier tier-pill-${tier}" title="${TIER_TITLE[tier]}">${TIER_SHORT[tier]}</span>
          </div>`);
        }
      }
    }
    walk(root, 0);
    $tree.innerHTML = out.join('');

    // Wire clicks
    $tree.querySelectorAll('.demo-tree-file').forEach(el => {
      el.addEventListener('click', () => {
        const path = el.getAttribute('data-path');
        const file = files.find(f => f.path === path);
        if (file) showFile(file);
      });
    });
  }

  // Counts files by tier and returns a compact summary string for the header.
  function tierSummary(files) {
    const counts = files.reduce((acc, f) => {
      acc[f.tier] = (acc[f.tier] || 0) + 1;
      return acc;
    }, {});
    const total = files.length;
    const order = ['entity','platform','infra','config'];
    const parts = order
      .filter(t => counts[t])
      .map(t => `<span class="demo-summary-chip tier-pill-${t}">${counts[t]} ${TIER_LABEL[t]}</span>`);
    return `<strong>${total} files</strong> · ${parts.join(' ')}`;
  }

  // ─── Minimal syntax highlight ──────────────────────────────
  function highlight(src) {
    return src
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(\/\/[^\n]*)/g, '<span class="cm">$1</span>')
      .replace(/('[^']*'|"[^"]*"|`[^`]*`)/g, '<span class="st">$1</span>')
      .replace(/\b(import|from|export|class|extends|public|private|readonly|return|const|let|new|async|await|if|throw|default|enum)\b/g, '<span class="kw">$1</span>')
      .replace(/\b(string|number|boolean|Date|Repository|Promise|void|any|Record)\b/g, '<span class="ty">$1</span>')
      .replace(/(@\w+)/g, '<span class="dc">$1</span>');
  }

  function showFile(file) {
    activeFilePath = file.path;
    $file.textContent = file.path;
    const code = renderFile(file);
    $code.innerHTML = `<code>${highlight(code)}</code>`;
    // Update active class
    $tree.querySelectorAll('.demo-tree-file').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-path') === file.path);
    });
  }

  // ─── Main update loop ──────────────────────────────────────
  function update() {
    const model = parseSpec($spec.value);
    const files = buildFiles(model);
    $count.innerHTML = tierSummary(files);
    renderTree(files);

    // Re-select an active file (or default to the first entity controller)
    let pick = files.find(f => f.path === activeFilePath);
    if (!pick) {
      pick = files.find(f => f.kind === 'controller') || files[0];
    }
    if (pick) showFile(pick);
  }

  // ─── Wire events ───────────────────────────────────────────
  let pending = null;
  $spec.addEventListener('input', () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(update, 120);
  });
  $reset.addEventListener('click', () => {
    $spec.value = DEFAULT_SPEC;
    activeFilePath = null;
    update();
  });

  // ─── UML Class Diagram (Mermaid) ──────────────────────────
  // Mirrors the algorithm in servers/uml/src/transform/mermaid.ts so
  // what users see here matches what the Visualizer agent produces.
  const $umlPane   = document.getElementById('demo-uml');
  const $umlRender = document.getElementById('demo-uml-render');
  const $umlToggle = document.getElementById('demo-uml-toggle');

  function buildClassDiagram(model) {
    const lines = ['classDiagram'];

    for (const e of model.entities) {
      lines.push(`    class ${e.name}`);
      for (const f of e.fields) {
        const t = f.ref ? f.ref : f.type;
        const tag = f.primary ? ' PK' : (f.ref ? ' FK' : '');
        lines.push(`    ${e.name} : +${t} ${f.name}${tag}`);
      }
    }

    // Relationships drawn from `*: EntityName` field references → "many to one"
    const drawn = new Set();
    for (const e of model.entities) {
      for (const f of e.fields) {
        if (!f.ref) continue;
        if (!model.entities.find(x => x.name === f.ref)) continue;
        const key = `${e.name}-${f.ref}-${f.name}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        lines.push(`    ${e.name} "*" --> "1" ${f.ref} : ${f.name}`);
      }
    }

    return lines.join('\n');
  }

  let umlRenderSeq = 0;
  async function renderUml(model) {
    if (!$umlRender || !window.__archonMermaid) return;
    if (!model.entities.length) {
      $umlRender.innerHTML = '<div class="demo-uml-loading">add an entity to see the class diagram</div>';
      return;
    }
    const diagramText = buildClassDiagram(model);
    const id = 'archon-uml-' + (++umlRenderSeq);
    try {
      const { svg } = await window.__archonMermaid.render(id, diagramText);
      $umlRender.innerHTML = svg;
    } catch (err) {
      console.error('[uml] render failed', err);
      $umlRender.innerHTML = '<pre style="color: var(--muted); font-size: 11px; margin:0; white-space: pre-wrap;">' +
        diagramText.replace(/</g, '&lt;') + '</pre>';
    }
  }

  // Toggle collapse
  $umlToggle?.addEventListener('click', () => {
    $umlPane?.classList.toggle('collapsed');
  });

  // Wait for Mermaid to be ready before the first render
  let mermaidReady = !!window.__archonMermaid;
  if (!mermaidReady) {
    window.addEventListener('archon-mermaid-ready', () => {
      mermaidReady = true;
      const model = parseSpec($spec.value);
      renderUml(model);
    }, { once: true });
  }

  // ─── Auto-tour ─────────────────────────────────────────────
  // Cycles the preview pane through a curated list of files that
  // best showcase Archon's enterprise-grade output. The user can
  // pause, skip, or click any file in the tree to take over.
  const TOUR_PATHS = [
    'src/user/user.controller.ts',
    'src/user/user.entity.ts',
    'src/auth/jwt.guard.ts',
    'src/shared/filters/http-exception.filter.ts',
    'db/migration.sql',
    'Dockerfile',
    'Jenkinsfile',
    'README.md',
  ];
  const TOUR_INTERVAL_MS = 4000;

  const $tourPrev  = document.getElementById('demo-tour-prev');
  const $tourNext  = document.getElementById('demo-tour-next');
  const $tourPlay  = document.getElementById('demo-tour-play');
  const $tourMode  = document.getElementById('demo-tour-mode');
  const $tourProg  = document.getElementById('demo-tour-progress');
  const $fileSum   = document.getElementById('demo-file-summary');

  let tourIdx     = 0;       // current index into TOUR_PATHS
  let tourTimer   = null;
  let tourPlaying = true;
  let tourManual  = false;   // true once user clicks a tree file directly

  function tourCurrentPath() {
    return TOUR_PATHS[tourIdx];
  }

  function tourAdvance(step) {
    tourIdx = (tourIdx + step + TOUR_PATHS.length) % TOUR_PATHS.length;
    showByPath(tourCurrentPath());
    refreshTourUI();
  }

  function showByPath(path) {
    const model = parseSpec($spec.value);
    const files = buildFiles(model);
    const file  = files.find(f => f.path === path);
    if (file) showFile(file);
  }

  function refreshTourUI() {
    if ($tourProg) $tourProg.textContent = `${tourIdx + 1} / ${TOUR_PATHS.length}`;
    if ($tourMode) {
      $tourMode.textContent = tourManual ? 'manual' : (tourPlaying ? 'tour' : 'paused');
      $tourMode.classList.toggle('manual', tourManual || !tourPlaying);
    }
    if ($tourPlay) {
      $tourPlay.textContent = tourPlaying && !tourManual ? '⏸' : '▶';
      $tourPlay.title = tourPlaying && !tourManual ? 'Pause auto-tour' : 'Resume auto-tour';
    }
  }

  function tourStart() {
    tourStop();
    if (!tourPlaying || tourManual) return;
    tourTimer = setInterval(() => tourAdvance(1), TOUR_INTERVAL_MS);
  }

  function tourStop() {
    if (tourTimer) { clearInterval(tourTimer); tourTimer = null; }
  }

  function tourTakeManualControl() {
    tourManual = true;
    tourStop();
    refreshTourUI();
  }

  function tourResume() {
    tourManual = false;
    tourPlaying = true;
    refreshTourUI();
    tourStart();
  }

  $tourPrev?.addEventListener('click', () => {
    tourManual = false;
    tourAdvance(-1);
    if (tourPlaying) tourStart();   // reset timer so user gets a full beat
  });
  $tourNext?.addEventListener('click', () => {
    tourManual = false;
    tourAdvance(1);
    if (tourPlaying) tourStart();
  });
  $tourPlay?.addEventListener('click', () => {
    if (tourManual) { tourResume(); return; }
    tourPlaying = !tourPlaying;
    if (tourPlaying) tourStart(); else tourStop();
    refreshTourUI();
  });

  // Keyboard shortcuts: ← / → / space (only when the spec textarea isn't focused)
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === $spec) return;
    if (e.key === 'ArrowLeft')  { tourManual = false; tourAdvance(-1); if (tourPlaying) tourStart(); }
    if (e.key === 'ArrowRight') { tourManual = false; tourAdvance(1);  if (tourPlaying) tourStart(); }
    if (e.key === ' ' && (e.target === document.body || (e.target && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT'))) {
      e.preventDefault();
      $tourPlay?.click();
    }
  });

  // Hook into showFile so tree-clicks correctly switch the tour into manual mode.
  // We intercept by wrapping the click handler emitted in renderTree.
  // The wrapped version is applied at every renderTree via this delegated listener:
  document.getElementById('demo-tree')?.addEventListener('click', (e) => {
    const fileEl = e.target.closest('.demo-tree-file');
    if (fileEl) tourTakeManualControl();
  });

  // Editing the spec also pauses auto-tour so the user can see their change.
  $spec.addEventListener('input', () => { tourTakeManualControl(); });

  // Update the small tree-summary chip + live UML diagram on every render
  const _origUpdate = update;
  update = function () {
    _origUpdate();
    const model = parseSpec($spec.value);
    const files = buildFiles(model);
    if ($fileSum) $fileSum.textContent = `${files.length} files`;
    // If we're still in auto-tour mode (haven't taken manual control yet),
    // make sure the currently displayed file is the tour file.
    if (!tourManual && tourCurrentPath()) showByPath(tourCurrentPath());
    // Re-render the class diagram (debounced via the input handler upstream)
    if (mermaidReady) renderUml(model);
  };

  // Initial render → set the tour cursor on the first file
  update();
  refreshTourUI();
  tourStart();
})();
