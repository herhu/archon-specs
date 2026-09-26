# Project Conventions

<!-- This file is updated by `ag refresh` with project-specific conventions. -->
<!-- You can also edit it manually to add team agreements. -->

## Language & Framework
- Backend is generated via the Archon Engine.

## Code Style
- Use the `@ArchonManual()` decorator to lock down custom typescript methods and classes from AST mutation.
- Follow strict Domain-Driven Design (DDD) encapsulation.

## Architecture
- `DesignSpec.json` holds the schema.
- Models must be strictly ACID compliant.
