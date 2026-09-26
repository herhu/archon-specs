import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
constructor(private reflector: Reflector) {}

canActivate(context: ExecutionContext): boolean {
const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
    context.getHandler(),
    context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
    return true;
    }

    const { user } = context.switchToHttp().getRequest();
    // user.scopes is set by JwtAuthGuard
    if (!user || !user.scopes) {
    throw new ForbiddenException('No scopes found on user');
    }

    const hasScope = requiredScopes.every((scope) => user.scopes.includes(scope));
    if (!hasScope) {
    throw new ForbiddenException('Missing required scope');
    }

    return true;
    }
    }