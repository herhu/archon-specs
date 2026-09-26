# Archon Specs (archonspecs)

🚀 Live: https://archonspecs.dev

A completely silent, standards-compliant [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) client bridge that natively proxies Claude Desktop `stdio` requests directly into an Archon Specs `SSE` remote backend over HTTPS.

Unlike other public MCP proxies, this package guarantees complete `stdout` JSON-RPC hygiene, preventing log pollution that crashes Claude Desktop's strict parsers.

## 🛠️ Setup & Authentication

To use Archon Specs, you need an API token.

1. **Install the package**:
   ```bash
   npm install -g archonspecs
   ```
2. **Get your Token**: Log in to your dashboard at [https://archonspecs.dev/](https://archonspecs.dev/) to retrieve your secret token.
3. **Install Token**: Run the following command to save your token locally:
   ```bash
   archonspecs -token YOUR_SECRET_TOKEN
   ```

## 🚀 Usage

Once your token is installed, you can configure your `mcp_config.json` to use the remote bridge.

### Claude Desktop Configuration

Add the following to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "archon-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "archonspecs",
        "https://archonspecs.dev/mcp/sse?apiKey=your_api_key_here"
      ]
    }
  }
}
```

## Archon Specs  — AI Backend Architecture Compiler

🌐 Website: https://archonspecs.dev  
📚 Docs: https://archonspecs.dev/docs.html  
📦 Library: https://archonspecs.dev/library.html