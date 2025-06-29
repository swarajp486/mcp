
import { GoogleGenAI} from '@google/genai';
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from 'dotenv';
import readline from 'readline/promises'
config()

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

class MCPClient {
   mcp
   google
   transport
   tools
   chatHistory
  constructor() {
    this.google = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    this.tools=[]
    this.chatHistory=[]
  }
  // methods will go here
  async connectToServer(serverScriptPath) {
    try {
      // const isJs = serverScriptPath.endsWith(".js");
      // const isPy = serverScriptPath.endsWith(".py");
      // if (!isJs && !isPy) {
      //   throw new Error("Server script must be a .js or .py file");
      // }
      // const command = isPy
      //   ? process.platform === "win32"
      //     ? "python"
      //     : "python3"
      //   : process.execPath;
console.log(serverScriptPath,"server path")
      this.transport = new StreamableHTTPClientTransport(
        new URL(serverScriptPath),
      );
      await this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: tool.inputSchema.type,
            properties: tool.inputSchema.properties,
            required: tool.inputSchema.required
          }
        }
      });

      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name)
      );

    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(query) {
    let newMessage =[
    {
      role: "user",
      parts: [
        {
          text: query,
        }
      ],
    }]
    let messages =
    {
      role: "user",
      parts: [
        {
          text: query,
        }
      ],
    }
    this.chatHistory.push(messages)
    


    const response = await this.google.models.generateContent({
      model: "gemini-2.0-flash",
      contents: this.chatHistory,
      config: {
        tools: [
          {
            functionDeclarations: [...this.tools],
          }
        ]
      }
    })

    // //console.log(JSON.stringify(response, null, 2));
    const finalText = [];
    const modelResponseContent = response.candidates[0].content;

    for (const part of modelResponseContent.parts) {
      // //console.log("inside for")
      if (part.text) {
        // //console.log("inside for if")

        finalText.push(part.text);
      } else if (part.functionCall) {
        // //console.log("inside for else")

        const functionCall = part.functionCall;
        const toolName = functionCall.name || '';

        const toolArgs = functionCall.args
        // //console.log(toolName,toolArgs,"tool preaper")
        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
         //console.log(JSON.stringify(result, null, 2),"tool response");

        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
        );

        newMessage.push({
          role: "user",
          parts:[
            {
                text:result.content[0].text
            }
          ]
        });

        const response = await this.google.models.generateContent({
          model: "gemini-2.0-flash",
          contents: newMessage,
        })
        //console.log(JSON.stringify(response, null, 2),"final response",this.chatHistory.length);

          finalText.push(response.candidates[0].content.parts[0].text)

      }
    }

    return finalText.join("\n");
  }


  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}


async function main() {
    console.log(process.argv[2])
  if (process.argv.length < 3) {
    console.log("Provide server path");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(process.argv[2]);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();