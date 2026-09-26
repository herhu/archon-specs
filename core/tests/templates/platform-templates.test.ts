import { describe, it, expect } from "vitest";
import { renderTemplate, expectToContain, expectNotToContain } from "../helpers/test-runner.js";

describe("Platform Templates", () => {
  const mockContext = {
    projectName: "TestProject",
    platformConfig: {
      jenkins: true,
      sonarQube: true,
      frogbot: true,
    },
    hasRedis: true,
    hasQueue: false,
    platform: { husky: true }
  };

  describe("Dockerfile.hbs", () => {
    it("should render a Dockerfile", async () => {
      const output = await renderTemplate("nestjs/Dockerfile.hbs", mockContext);
      expectToContain(output, ["WORKDIR /app", "FROM node:20-alpine AS build"]);
    });
  });

  describe("Jenkinsfile.hbs", () => {
    it("should render a Jenkinsfile with platform steps", async () => {
      const output = await renderTemplate("nestjs/Jenkinsfile.hbs", mockContext);
      expectToContain(output, [
        "pipeline {",
        "stage('SonarQube Static Analysis')",
        "sh 'sonar-scanner'",
      ]);
    });
  });

  describe("package.json.hbs", () => {
    it("should render package.json with dependencies", async () => {
      const output = await renderTemplate("nestjs/package.json.hbs", mockContext);
      expectToContain(output, [
        `"name": "${"test-project"}"`,
        `"@nestjs/common"`,
        `"ioredis"`,
      ]);
    });

    it("should not contain bullmq if hasQueue is false", async () => {
        const output = await renderTemplate("nestjs/package.json.hbs", mockContext);
        expectNotToContain(output, ["bullmq"]);
    });

    it("should contain bullmq if hasQueue is true", async () => {
        const output = await renderTemplate("nestjs/package.json.hbs", { ...mockContext, hasQueue: true });
        expectToContain(output, ["bullmq", "@nestjs/bullmq"]);
    });
  });
});
