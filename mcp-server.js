import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';

class PlaywrightMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'playwright-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.browser = null;
    this.page = null;

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'launch_browser',
            description: 'Launch a Chromium browser instance',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'navigate',
            description: 'Navigate to a URL',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'The URL to navigate to',
                },
              },
              required: ['url'],
            },
          },
          {
            name: 'click',
            description: 'Click on an element by selector',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of the element to click',
                },
              },
              required: ['selector'],
            },
          },
          {
            name: 'type_text',
            description: 'Type text into an input field',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of the input element',
                },
                text: {
                  type: 'string',
                  description: 'Text to type',
                },
              },
              required: ['selector', 'text'],
            },
          },
          {
            name: 'get_page_content',
            description: 'Get the current page content',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'take_screenshot',
            description: 'Take a screenshot of the current page',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Path to save the screenshot',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'wait_for_selector',
            description: 'Wait for an element to appear on the page',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of the element to wait for',
                },
                timeout: {
                  type: 'number',
                  description: 'Timeout in milliseconds (default: 30000)',
                },
              },
              required: ['selector'],
            },
          },
          {
            name: 'get_text',
            description: 'Get text content from an element',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of the element',
                },
              },
              required: ['selector'],
            },
          },
          {
            name: 'select_option',
            description: 'Select an option from a dropdown',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of the select element',
                },
                value: {
                  type: 'string',
                  description: 'Value to select',
                },
              },
              required: ['selector', 'value'],
            },
          },
          {
            name: 'get_current_url',
            description: 'Get the current page URL',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'scroll',
            description: 'Scroll the page or element',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of element to scroll (optional, scrolls page if not provided)',
                },
                direction: {
                  type: 'string',
                  enum: ['up', 'down', 'left', 'right'],
                  description: 'Scroll direction',
                },
                distance: {
                  type: 'number',
                  description: 'Distance to scroll in pixels (default: 100)',
                },
              },
              required: ['direction'],
            },
          },
          {
            name: 'go_back',
            description: 'Navigate back in browser history',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'go_forward',
            description: 'Navigate forward in browser history',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'launch_browser':
            return await this.launchBrowser();
          case 'navigate':
            return await this.navigate(args.url);
          case 'click':
            return await this.click(args.selector);
          case 'type_text':
            return await this.typeText(args.selector, args.text);
          case 'get_page_content':
            return await this.getPageContent();
          case 'take_screenshot':
            return await this.takeScreenshot(args.path);
          case 'close_browser':
            return await this.closeBrowser();
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, error.message);
      }
    });
  }

  async launchBrowser() {
    if (this.browser) {
      return { content: [{ type: 'text', text: 'Browser already launched' }] };
    }

    this.browser = await chromium.launch({ headless: false });
    this.page = await this.browser.newPage();

    return { content: [{ type: 'text', text: 'Browser launched successfully' }] };
  }

  async navigate(url) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch_browser first.');
    }

    await this.page.goto(url);
    return { content: [{ type: 'text', text: `Navigated to ${url}` }] };
  }

  async click(selector) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch_browser first.');
    }

    await this.page.click(selector);
    return { content: [{ type: 'text', text: `Clicked element: ${selector}` }] };
  }

  async typeText(selector, text) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch_browser first.');
    }

    await this.page.fill(selector, text);
    return { content: [{ type: 'text', text: `Typed "${text}" into ${selector}` }] };
  }

  async getPageContent() {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch_browser first.');
    }

    const content = await this.page.content();
    return { content: [{ type: 'text', text: content }] };
  }

  async takeScreenshot(path) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch_browser first.');
    }

    await this.page.screenshot({ path });
    return { content: [{ type: 'text', text: `Screenshot saved to ${path}` }] };
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      return { content: [{ type: 'text', text: 'Browser closed' }] };
    }
    return { content: [{ type: 'text', text: 'No browser to close' }] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Playwright MCP Server running on stdio');
  }
}

// Run the server
const server = new PlaywrightMCPServer();
server.run().catch(console.error);