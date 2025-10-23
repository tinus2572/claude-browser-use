import asyncio
import anthropic
import google.generativeai as genai
import os
import json
from dotenv import load_dotenv
import websockets
from types import SimpleNamespace
import time

load_dotenv()

class Agent:
    def __init__(self):
        self.anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.websocket = None
        self.messages = []

    async def wait_for_action(self, action, timeout=5.0):
        """Wait for a specific action in the WebSocket messages."""
        while True:
            try:
                msg = await asyncio.wait_for(self.websocket.recv(), timeout)
            except asyncio.TimeoutError:
                raise asyncio.TimeoutError(f"Timeout waiting for action {action}")

            data = json.loads(msg)
            # Only return if this is the message we want
            if data.get("action") == action or "screenshot" in data:
                return data
            
    async def perform_tool_action(self, tool_name, tool_input, tool_use_id):
        print(f"Performing action: {tool_name} with input: {tool_input}")
        
        # Send the action
        await self.websocket.send(json.dumps({"action": tool_name, **tool_input}))

        # Screenshot of the situation after the action
        await self.websocket.send(json.dumps({"action": "screenshot"}))
        print("Sent screenshot request")
        try:
            screenshot_json = await self.wait_for_action("screenshot", timeout=5.0)
            print("Received screenshot data")
            screenshot_b64 = screenshot_json['screenshot'].split(',')[1]
        except asyncio.TimeoutError:
            print("Screenshot request timed out, retrying...")
            return

        # Add the tool result + screenshot to messages
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
                        {   "type": "text", 
                            "text": "Action performed. Here is the new screenshot."
                        }
                    ]
                }
            ]
        })

    async def handle_connection(self, websocket):
        print("Chrome extension connected.")
        self.websocket = websocket
        try:
            await self.run_agent()
        except websockets.exceptions.ConnectionClosed:
            print("Connection with extension closed.")
        finally:
            self.websocket = None

    async def run_agent(self):
        task = input("Please enter the task for the agent: ")
        print(f"Got task: {task}")

        # Dimensions (after screenshot finishes)
        print("Requesting tab dimensions...")
        await self.websocket.send(json.dumps({"action": "dimensions"}))
        print("Sent dimensions request")
        try:
            dimensions_json = await self.wait_for_action("dimensions", timeout=5.0)
            print("Received dimensions data:", dimensions_json)
        except asyncio.TimeoutError:
            print("Dimensions request timed out")
            return

        self.messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""
                        You are an agent controlling a browser. You are given a screenshot of the current page.
                        Think step-by-step and provide the reason for each action.
                        Task: {task}
                        """
                    }
                ],
            }
        ]

        tools=[{
            "type": "computer_20250124",
            "name": "computer",
            "display_width_px": dimensions_json["data"]["innerWidth"],
            "display_height_px": dimensions_json["data"]["innerHeight"]
        }]

        while True:
            time.sleep(1)   
            print("\nThinking...")
            response = self.anthropic_client.beta.messages.create(
                model="claude-sonnet-4-5",  
                max_tokens=4096,
                messages=self.messages,
                tools=tools,
                betas=["computer-use-2025-01-24"]
            )
            self.messages.append({"role": "assistant", "content": response.content})
            content_blocks = response.content
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

                    await self.perform_tool_action(tool_name, tool_input, tool_use_id)
            
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
