# Point & Click Software Engineer - Take-Home Assignment

This project is a minimal implementation of the Claude Computer Use Agent that can pilot a Chrome Extension, as per the take-home assignment.

## Architecture

The system is split into two main components:

1.  **Python Client (`python_client/`)**: A Python application that serves as the "brain" of the agent. It runs a WebSocket server, takes natural language commands, and communicates with the Anthropic API to decide on actions.
2.  **Chrome Extension (`chrome_extension/`)**: This extension connects to the Python client's WebSocket server. It acts as the "hands" of the agent, executing actions in the browser (like taking screenshots, clicking, and typing) based on commands it receives.

The flow is as follows:
1. The user runs the Python client and loads the Chrome Extension.
2. The extension connects to the Python client's WebSocket.
3. The user provides a natural language task to the Python client.
4. The client sends the task and the current screenshot to the Claude API.
5. Claude responds with a specific action (e.g., "click at coordinates [x, y]").
6. The client sends this action to the Chrome Extension via WebSocket.
7. The extension executes the action in the browser.
8. The extension takes a new screenshot and sends it back to the client.
9. The loop continues until the task is complete.

## Setup and Usage

### Prerequisites

- Python 3.8+
- `uv` installed (`pip install uv`)
- Google Chrome
- An Anthropic API key

### 1. Setup the Python Environment

First, set up the virtual environment and install the required dependencies.

```bash
# Navigate to the python_client directory
cd python_client

# Create a virtual environment using uv
uv venv

# Activate the virtual environment
source .venv/bin/activate

# Install dependencies
uv pip install .
```

### 2. Configure API Key

Create a `.env` file inside the `python_client` directory and add your Anthropic API key:

```
ANTHROPIC_API_KEY="your_api_key_here"
```
The application uses the `python-dotenv` library to load this key, ensuring it is not hardcoded.

### 3. Load the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode" using the toggle in the top-right corner.
3. Click on "Load unpacked".
4. Select the `chrome_extension` directory from this project.
5. The extension should now be loaded and active.

### 4. Run the Application

1. Make sure the Python virtual environment is activated.
2. Run the main client script:

```bash
python python_client/main.py
```

3. The script will start the WebSocket server and wait for the Chrome Extension to connect. Once connected, it will prompt you to enter a task.

### Limitations

- This is a minimal implementation. Error handling is basic.
- The agent only interacts with the currently active tab in Chrome.
- The performance depends on the latency of the Claude API and the complexity of the task.
- The coordinate system is based on the visible part of the browser window.
