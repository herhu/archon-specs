export interface DesignSpec {
    version: string;
    projectId?: string;
    revisionId?: string;
    parentRevisionId?: string;
    name: string;
    platform?: PlatformConfig;
    modules?: ModuleConfig[];
    domains: Domain[];
    crossCutting?: {
        auth?: {
            jwt?: {
                issuer: string;
                audience: string;
                jwksUri?: string;
                defaultScopes?: string; // Space separated
            };
        };
    };
    lineage?: {
        blueprintId?: string;
        appliedMuscles?: string[];
    };
    handlebarsHelpers?: string[];
}

export interface PlatformConfig {
    cors?: boolean;
    cookieParser?: boolean;
    securityHeaders?: boolean;
    swagger?: boolean;
    throttling?: boolean;
    rateLimitTtl?: number;
    rateLimitMax?: number;
    maxBodySize?: string;

    // Additional Optional & Mandatory Features
    jenkins?: boolean;
    frogbot?: boolean;
    sonarQube?: boolean;
    terraform?: boolean;
    newRelic?: boolean;
    husky?: boolean; // True by default for mandatory hooks
    nginxProxy?: boolean;
}

export interface ModuleConfig {
    type: string; // 'redis', 'bullmq', etc.
    name: string;
    config?: Record<string, any>;
}

export interface Domain {
    name: string;
    key: string; // e.g., 'patient-notification'
    entities: Entity[];
    services: Service[];
}

export interface Entity {
    name: string; // e.g. 'PatientNotification'
    primaryKey?: string;
    fields: Field[];
    relationships?: Relationship[];
    indexes?: { name?: string; fields: string[]; unique?: boolean }[];
    partitionBy?: { type: 'LIST' | 'RANGE' | 'HASH'; field: string };
}

export interface Relationship {
    name: string; // property name in entity (e.g. 'user')
    type: 'manyToOne' | 'oneToMany' | 'oneToOne' | 'manyToMany';
    targetEntity: string;
    joinColumn?: string; // column name in THIS entity (for manyToOne/oneToOne)
    inverseProperty?: string; // property name in the OTHER entity
}

export interface Field {
    name: string;
    type: string; // 'string', 'boolean', 'uuid', 'int', 'float', 'timestamp', 'json'
    primary?: boolean;
    nullable?: boolean;
    references?: { entity: string; field: string };
    index?: boolean;
    unique?: boolean;
}

export interface Service {
    name: string; // e.g. 'PatientNotificationService'
    route: string; // e.g. 'notifications'
    entity?: string; // e.g. 'PatientNotification' (explicit reference)
    crud?: ('create' | 'findAll' | 'findOne' | 'update' | 'delete')[];
    operations?: Operation[];
}

export interface Operation {
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string; // e.g. '/settings'
    authz?: {
        required?: boolean;
        scopesAll?: string[];
    };
    request?: {
        schemaRef?: string;
    };
    // Behavioral Muscle Injection
    logic?: string;
    params?: string; // e.g. 'dto: CreateTransferDto'
    returnType?: string; // e.g. 'Promise<TransferResult>'
}
