# wilyer-playwright
test

## MCP Server

This project includes a Model Context Protocol (MCP) server that exposes Playwright browser automation capabilities.

### Running the MCP Server

```bash
npm run mcp-server
```

### Playwright CLI

You can use the following commands to interact with Playwright:

- `npm run test`: Run all tests
- `npm run test:ui`: Open Playwright UI mode (interactive dashboard)
- `npm run test:debug`: Run tests in debug mode (opens Playwright Inspector)
- `npm run test:report`: View the latest HTML test report
- `npm run test:codegen`: Open the Test Generator to record new tests
- `npm run playwright:install`: Install browser dependencies

### Usage with AI Agents (Claude & MCP)

Your local MCP server now includes the `run_playwright_test` tool. This allows Claude to:

- **Run Tests**: "Claude, run the Groupcreate tests."
- **Filter Tests**: "Claude, run tests that mention 'login'."
- **Debug**: If a test fails, Claude can see the full output and help you fix the code.

To use this, ensure your `claude_desktop_config.json` points to the `mcp-server.js` (which is already configured) and restart Claude.

### Available MCP Tools

- `launch_browser`: Start a browser
- `navigate`: Go to a URL
- `click`, `type_text`, `select_option`: Interact with elements
- `get_page_content`, `take_screenshot`: Extract data
- `run_playwright_test`: Execute project CLI tests

