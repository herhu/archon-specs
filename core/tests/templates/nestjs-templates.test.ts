import { describe, it, expect } from "vitest";
import { renderTemplate, expectToContain, expectNotToContain } from "../helpers/test-runner.js";
import { toKebabCase } from "../../src/core/template-engine.js";

describe("NestJS Templates", () => {
  const mockEntity = {
    name: "PatientNotification",
    primaryKey: "notificationId",
    fields: [
      { name: "notificationId", type: "uuid", primary: true },
      { name: "message", type: "string" },
      { name: "read", type: "boolean", nullable: true },
    ],
  };

  const mockService = {
    name: "PatientNotificationService",
    route: "notifications",
    entity: "PatientNotification",
    crud: ["create", "findAll", "findOne", "update", "delete"],
    operations: [
      {
        name: "markAsRead",
        method: "PATCH",
        path: "/:id/read",
        authz: { required: true },
      },
    ],
  };

  const domainKey = "patient-notification";

  describe("controller.ts.hbs", () => {
    it("should render an enterprise CRUD controller with Swagger + typed DTOs", async () => {
      const context = {
        crossCutting: { auth: true },
        service: mockService,
        controllerClassName: "PatientNotificationController",
        serviceClassName: "PatientNotificationService",
        serviceImportPath: "../services/patient-notification.service.js",
        entity: mockEntity,
        entityImportPath: "../entities/patient-notification.entity.js",
        domainKey,
        crud: {
          create: true,
          findAll: true,
          findOne: true,
          update: true,
          delete: true,
        },
        crudScopes: {
          create: [`${domainKey}:write`],
          findAll: [`${domainKey}:read`],
          findOne: [`${domainKey}:read`],
          update: [`${domainKey}:write`],
          delete: [`${domainKey}:write`],
        },
        operations: [
          {
            name: "markAsRead",
            method: "PATCH",
            path: "/:id/read",
            authRequired: true,
            effectiveScopes: [`${domainKey}:write`],
            controllerParams: "@Param('id') id: string, @Body() dto: UpdatePatientNotificationDto",
            serviceCallParams: "{ id, ...dto }",
            useCaseClass: "MarkAsReadUseCase",
            useCaseProp: "markAsReadUseCase",
          },
        ],
        useCases: [
          { className: "MarkAsReadUseCase", prop: "markAsReadUseCase", importPath: "../use-cases/mark-as-read.use-case" },
        ],
        idType: "string",
      };

      const output = await renderTemplate("nestjs/controller.ts.hbs", context);

      expectToContain(output, [
        "@Controller('notifications')",
        "export class PatientNotificationController",
        "private readonly service: PatientNotificationService,",
        "private readonly markAsReadUseCase: MarkAsReadUseCase,",
        "import { MarkAsReadUseCase }",
        "import { CreatePatientNotificationDto }",
        "import { UpdatePatientNotificationDto }",
        "import { PatientNotification }",
        "@Post()",
        "@ApiCreatedResponse({ description: 'The PatientNotification was created', type: PatientNotification })",
        "async create(@Body() dto: CreatePatientNotificationDto): Promise<PatientNotification>",
        "@ApiOAuth2(['patient-notification:write'])",
        "@Get()",
        "@ApiOkResponse({ description: 'List of PatientNotification', type: PatientNotification, isArray: true })",
        "@Get(':id')",
        "@ApiParam({ name: 'id'",
        "async update(@Param('id') id: string, @Body() dto: UpdatePatientNotificationDto): Promise<PatientNotification>",
        "@Delete(':id')",
        "@Patch('/:id/read')",
        "async markAsRead(@Param('id') id: string, @Body() dto: UpdatePatientNotificationDto)",
        "return this.markAsReadUseCase.execute({ id, ...dto });",
      ]);
    });

    it("should render a controller with fewer CRUD operations", async () => {
      const context = {
        crossCutting: { auth: true },
        service: { ...mockService, crud: ["findAll"] },
        controllerClassName: "PatientNotificationController",
        serviceClassName: "PatientNotificationService",
        serviceImportPath: "../services/patient-notification.service.js",
        entity: mockEntity,
        entityImportPath: "../entities/patient-notification.entity.js",
        domainKey,
        crud: {
          create: false,
          findAll: true,
          findOne: false,
          update: false,
          delete: false,
        },
        crudScopes: {
          findAll: [`${domainKey}:read`],
        },
        operations: [],
        idType: "string",
      };

      const output = await renderTemplate("nestjs/controller.ts.hbs", context);

      expectToContain(output, ["@Get()", "@ApiOAuth2(['patient-notification:read'])"]);
      expectNotToContain(output, ["@Post()", "@Get(':id')", "@Patch(':id')", "@Delete(':id')"]);
    });
  });

  describe("service.ts.hbs", () => {
    it("should render a typed CRUD service with NotFoundException", async () => {
      const context = {
        service: { ...mockService, operations: [] },
        serviceClassName: "PatientNotificationService",
        entity: mockEntity,
        entityImportPath: "../entities/patient-notification.entity.js",
        relatedEntities: [],
        repoPort: "PatientNotificationRepository",
        repoToken: "PATIENT_NOTIFICATION_REPOSITORY",
        repoPortImport: "../repositories/patient-notification.repository",
        crud: { create: true, findAll: true, findOne: true, update: true, delete: true },
        idType: "string",
        idName: "notificationId",
      };

      const output = await renderTemplate("nestjs/service.ts.hbs", context);

      expectToContain(output, [
        "import { Injectable, Inject, NotFoundException }",
        "import { CreatePatientNotificationDto }",
        "import { UpdatePatientNotificationDto }",
        "import { PatientNotificationRepository, PATIENT_NOTIFICATION_REPOSITORY }",
        "@Injectable()",
        "export class PatientNotificationService",
        "@Inject(PATIENT_NOTIFICATION_REPOSITORY)",
        "private readonly repo: PatientNotificationRepository",
        "async create(dto: CreatePatientNotificationDto): Promise<PatientNotification>",
        "this.repo.save(this.repo.create(",
        "async findAll(): Promise<PatientNotification[]>",
        "async findOne(notificationId: string): Promise<PatientNotification>",
        "this.repo.findById(notificationId)",
        "throw new NotFoundException(",
        "async update(notificationId: string, dto: UpdatePatientNotificationDto)",
        "async delete(notificationId: string): Promise<void>",
      ]);
    });
  });

  describe("entity.ts.hbs", () => {
    it("should render an entity with Swagger, typed columns and timestamps", async () => {
      const context = { entity: mockEntity };
      const output = await renderTemplate("nestjs/entity.ts.hbs", context);

      expectToContain(output, [
        "import { ApiProperty } from '@nestjs/swagger';",
        "@Entity('patient_notification')",
        "export class PatientNotification",
        "@PrimaryGeneratedColumn('uuid')",
        "notificationId!: string;",
        "@Column({ nullable: false })",
        "message!: string;",
        "@Column({ nullable: true })",
        "read?: boolean;",
        "@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })",
        "createdAt!: Date;",
        "@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })",
        "updatedAt!: Date;",
      ]);
    });
  });

  describe("dto.ts.hbs", () => {
    it("should render a create DTO with @ApiProperty + validation", async () => {
      const context = { entity: mockEntity };
      const output = await renderTemplate("nestjs/dto.ts.hbs", context);

      expectToContain(output, [
        "import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';",
        "from 'class-validator';",
        "export class CreatePatientNotificationDto",
        "@ApiProperty({",
        "@IsNotEmpty({ message: 'message is required' })",
        "@IsString()",
        "message!: string;",
        "@ApiPropertyOptional({",
        "@IsBoolean()",
        "@IsOptional()",
        "read?: boolean;",
      ]);
      // Should not contain primary key
      expectNotToContain(output, ["notificationId!: string;", "notificationId?: string;"]);
    });

    it("should render an update DTO via PartialType", async () => {
      const context = { entity: mockEntity };
      const output = await renderTemplate("nestjs/update-dto.ts.hbs", context);

      expectToContain(output, [
        "import { PartialType } from '@nestjs/swagger';",
        "import { CreatePatientNotificationDto } from './create-patient-notification.dto';",
        "export class UpdatePatientNotificationDto extends PartialType(CreatePatientNotificationDto) {}",
      ]);
    });
  });
});
