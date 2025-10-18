import asyncio
import anthropic
import google.generativeai as genai
import base64
import os
import json
from dotenv import load_dotenv
import websockets
from types import SimpleNamespace

load_dotenv()

# Set the desired LLM provider: "anthropic" or "gemini"
LLM_PROVIDER = "gemini"

class Agent:
    def __init__(self):
        self.llm_provider = LLM_PROVIDER
        if self.llm_provider == "anthropic":
            self.anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        elif self.llm_provider == "gemini":
            self.gemini_client = genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        self.websocket = None
        self.messages = []
        self.display_width = 2160
        self.display_height = 1440

    async def handle_connection(self, websocket):
        print("Chrome extension connected.")
        self.websocket = websocket
        try:
            await self.run_agent()
        except websockets.exceptions.ConnectionClosed:
            print("Connection with extension closed.")
        finally:
            self.websocket = None

    def _anthropic_to_gemini_messages(self, anthropic_messages):
        gemini_messages = []
        for message in anthropic_messages:
            role = message["role"]
            if role == "assistant":
                role = "model"
            
            content = message["content"]
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, SimpleNamespace):
                        if item.type == "text":
                            parts.append({"text": item.text})
                        elif item.type == "tool_use":
                            parts.append({'function_call': {'name': item.name, 'args': item.input}})
                    else: # dict
                        if item["type"] == "image":
                            parts.append({"inline_data": {"mime_type": item["source"]["media_type"], "data": item["source"]["data"]}})
                        elif item["type"] == "text":
                            parts.append({"text": item["text"]})
                        elif item["type"] == "tool_result":
                            # Gemini doesn't have a direct equivalent of tool_result in the same way.
                            # It's handled by sending a "tool" role message back.
                            # This is a simplification.
                            parts.append({"text": f"Tool result for {item['tool_use_id']}: {item['content']}"})

                gemini_messages.append({"role": role, "parts": parts})
            else:
                 gemini_messages.append({"role": role, "parts": [{"text": content}]})

        return gemini_messages

    async def run_agent(self):
        task = input("Please enter the task for the agent: ")
        print(f"Got task: {task}")

        print("Getting initial screenshot...")
        screenshot_json = None
        for i in range(5): # 5 attempts, 1 second apart
            await self.websocket.send(json.dumps({"action": "screenshot"}))
            print("Sent screenshot request")
            try:
                screenshot_data = await asyncio.wait_for(self.websocket.recv(), timeout=10.0)
                print("Received screenshot data")
                screenshot_json = json.loads(screenshot_data)
                if screenshot_json and 'screenshot' in screenshot_json and screenshot_json['screenshot']:
                    break # Got a valid screenshot
                else:
                    print("No active tab found, waiting...")
            except asyncio.TimeoutError:
                print("Screenshot request timed out, retrying...")
            screenshot_json = None # Reset if invalid or timed out

        if not screenshot_json:
            print("Error: Failed to get a screenshot after 5 seconds. No active tab?")
            return

        screenshot_b64 = screenshot_json['screenshot'].split(',')[1]

        self.messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": screenshot_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": f"""
                        You are an agent controlling a browser. You are given a screenshot of the current page.
                        The screen resolution is {self.display_width}x{self.display_height}.
                        Your goal is to complete the task by using the available tools.

                        Task: {task}

                        Think step-by-step and provide the reason for each action.
                        """
                    }
                ],
            }
        ]

        tools = [
            # {
            #     "name": "click",
            #     "description": "Clicks on a specific coordinate on the screen.",
            #     "input_schema": {
            #         "type": "object",
            #         "properties": {
            #             "x": {"type": "number", "description": "The x-coordinate to click."}, 
            #             "y": {"type": "number", "description": "The y-coordinate to click."}, 
            #             "reason": {"type": "string", "description": "The reason for clicking at this coordinate."} 
            #         },
            #         "required": ["x", "y", "reason"]
            #     }
            # },
            # {
            #     "name": "type",
            #     "description": "Types a string of text into a focused input field.",
            #     "input_schema": {
            #         "type": "object",
            #         "properties": {
            #             "text": {"type": "string", "description": "The text to type."}, 
            #             "reason": {"type": "string", "description": "The reason for typing this text."} 
            #         },
            #         "required": ["text", "reason"]
            #     }
            # },
            # {
            #     "name": "done",
            #     "description": "Use this tool to indicate that the task is complete.",
            #     "input_schema": {
            #         "type": "object",
            #         "properties": {
            #             "reason": {"type": "string", "description": "A summary of how the task was completed."} 
            #         },
            #         "required": ["reason"]
            #     }
            # }
        ]

        while True:
            print("\nThinking...")
            if self.llm_provider == "anthropic":
                response = self.anthropic_client.messages.create(
                    model="claude-3-opus-20240229",
                    max_tokens=4096,
                    messages=self.messages,
                    tools=tools,
                )
                self.messages.append({"role": "assistant", "content": response.content})
                content_blocks = response.content
            elif self.llm_provider == "gemini":
                gemini_tools = [{"function_declarations": [
                    {
                        "name": tool["name"],
                        "description": tool["description"],
                        "parameters": tool["input_schema"]
                    } for tool in tools
                ]}]
                gemini_messages = self._anthropic_to_gemini_messages(self.messages)
                model = genai.GenerativeModel(model_name="gemini-2.5-flash", tools=gemini_tools)
                response = model.generate_content(gemini_messages)
                
                response_part = response.candidates[0].content.parts[0]
                content_blocks = []
                if response_part.function_call:
                    content_blocks.append(SimpleNamespace(
                        type="tool_use",
                        name=response_part.function_call.name,
                        input=dict(response_part.function_call.args),
                        id=f"tool_call_{id(response_part.function_call)}"
                    ))
                else:
                    content_blocks.append(SimpleNamespace(type="text", text=response_part.text))
                
                self.messages.append({"role": "assistant", "content": content_blocks})


            tool_use_found = False
            for content_block in content_blocks:
                if content_block.type == "text":
                    print(f"Assistant: {content_block.text}")
                elif content_block.type == "tool_use":
                    tool_use_found = True
                    tool_name = content_block.name
                    tool_input = content_block.input
                    tool_use_id = content_block.id

                    print(f"Action: {tool_name}, Input: {tool_input}")

                    if tool_name == "done":
                        print(f"Task finished. Reason: {tool_input['reason']}")
                        return

                    await self.websocket.send(json.dumps({"action": tool_name, **tool_input}))
                    
                    screenshot_data = await self.websocket.recv()
                    screenshot_b64 = json.loads(screenshot_data)['screenshot'].split(',')[1]

                    self.messages.append({
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": tool_use_id,
                                "content": [
                                    {
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": "image/png",
                                            "data": screenshot_b64,
                                        },
                                    }, 
                                    {"type": "text", "text": "Action performed. Here is the new screenshot."} 
                                ], 
                            }
                        ],
                    })
            
            if not tool_use_found:
                print("No tool use found. Task may be complete or agent is stuck.")
                break

async def main():
    agent = Agent()
    start_server = websockets.serve(agent.handle_connection, "localhost", 8765)
    print("WebSocket server started at ws://localhost:8765. Waiting for Chrome extension to connect...")
    await start_server
    await asyncio.Future() # run forever

if __name__ == "__main__":
    asyncio.run(main())
