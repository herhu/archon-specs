import pino from 'pino';

// 🛡️ ARCHON TELEMETRY HARDENING:
// We use destination: 2 (stderr) directly to ensure no logs ever hit stdout,
// which would break the MCP protocol. We also set base: undefined to remove
// pid and hostname, which were appearing in ZodError validation failures.
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: undefined, // Remove pid and hostname from the root for cleaner logs
  },
  pino.destination(2)
);

export default logger;
