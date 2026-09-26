# Archon Testing Guide

This document describes how to run the automated persistence and evolution tests for the Archon generator.

## Prerequisites

- Node.js (v18+)
- `ts-node` installed: `npm install -g ts-node`
- An existing `x-spec.json` in the parent directory of `archon`.

## Available Tests

### 1. End-to-End Spec Evolution (`scripts/e2e-test.ts`)
Validates the basic loop of generation -> manual code addition -> spec mutation -> re-generation.
- **Goal**: Verify manual code preservation and architectural growth.
- **Run**: `npx ts-node scripts/e2e-test.ts`
- **Output**: `e2e-lab/` directory.

### 2. Chaos & Stress Testing (`scripts/chaos-test.ts`)
Tries to break the `RegionManager` and `SpecMutator` with malformed inputs.
- **Goal**: Ensure the system throws clear errors on mismatched markers or duplicate IDs.
- **Run**: `npx ts-node scripts/chaos-test.ts`

### 3. Full Pipeline Integration (`scripts/pipeline-test.ts`)
The most comprehensive test. It uses the enterprise-scale `x-spec.json` to simulate a real social network project lifecycle.
- **Flow**:
  1. Bootstraps a full social network.
  2. Runs `ARCHON.sh` onboarding.
  3. Injects "Premium Logic" into the `User` entity.
  4. Verifies linege.
  5. Performs a remote-style spec mutation (Adds Billing domain).
  6. Final Sync & Verification.
- **Run**: `npx ts-node scripts/pipeline-test.ts`
- **Output**: `x-social-persistent-lab/` directory.

## Maintenance
These scripts are persistent and do not clean up their output directories upon success. This allows you to inspect the generated code at `e2e-lab/` and `x-social-persistent-lab/`.

> [!IMPORTANT]
> To reset a lab environment, simply run the corresponding script again; it will clean the directory at the start of the run.
