# wilyer-playwright
test

## MCP Server

This project includes a Model Context Protocol (MCP) server that exposes Playwright browser automation capabilities.

### Running the MCP Server

```bash
npm run mcp-server
```

### Available Tools

The MCP server provides the following tools:

- `launch_browser`: Launch a Chromium browser instance
- `navigate`: Navigate to a URL
- `click`: Click on an element by CSS selector
- `type_text`: Type text into an input field
- `get_page_content`: Get the current page HTML content
- `take_screenshot`: Take a screenshot of the current page
- `close_browser`: Close the browser instance

### Usage with AI Agents

Connect this MCP server to AI agents or chat interfaces that support the Model Context Protocol to enable browser automation through natural language commands.
