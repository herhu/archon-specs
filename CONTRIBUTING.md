# Contributing to Archon Specs

Thank you for your interest in contributing to **Archon Specs**! 

We are building the open-source standard for AI architecture compilation and deterministic system materialization.

## Code of Conduct

Please maintain a welcoming, respectful, and collaborative environment for all contributors.

## How to Contribute

### 1. Reporting Bugs
- Search existing issues to ensure the bug hasn't already been reported.
- Provide clear reproduction steps, including any sample `DesignSpec` or CLI parameters.

### 2. Proposing Features & Templates
- Archon Specs welcomes new architecture templates (NestJS modules, alternative frameworks, database providers, message queues).
- For large architectural proposals, please open an issue to discuss the design before submitting a PR.

### 3. Submitting Pull Requests
1. Fork the repository.
2. Create a clean branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. Ensure all tests pass:
   ```bash
   cd core && npm test
   ```
4. Commit your changes with clear, descriptive commit messages.
5. Push to your fork and submit a PR against `main`.

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/archon-specs.git
cd archon-specs

# Install dependencies in packages
cd core && npm install
cd ../desktop && npm install
cd ../cli && npm install
```

## License

By contributing to Archon Specs, you agree that your contributions will be licensed under its [MIT License](LICENSE).
