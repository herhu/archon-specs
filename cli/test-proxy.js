
import { setupMcpProxy } from './lib/mcp-proxy.js';
// Mock config
process.env.ARCHON_API_KEY = "archon_mock_token_sample";
process.env.ARCHON_REMOTE_URL = "http://localhost:3001";

setupMcpProxy();

const mockRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
};

process.stdin.push(JSON.stringify(mockRequest) + "\n");
