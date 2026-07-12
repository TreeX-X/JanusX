# JanusX Knowledge MCP

Build JanusX, then point an MCP client directly at the generated stdio entry:

```powershell
npm run build
node out/main/knowledge-mcp.js
```

Example client configuration (use absolute paths):

```json
{
  "mcpServers": {
    "janusx-knowledge": {
      "command": "node",
      "args": ["C:/absolute/path/to/JanusX/out/main/knowledge-mcp.js"],
      "env": {
        "JANUSX_KNOWLEDGE_ROOT": "C:/path/to/JanusX/knowledge/root"
      }
    }
  }
}
```

The server exposes only `knowledge_search` and `knowledge_context`. Both are read-only and require `workspaceId` or `workspacePath` unless `allowGlobal` is explicitly set to `true`.
