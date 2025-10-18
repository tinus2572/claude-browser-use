let socket;

function connect() {
  socket = new WebSocket("ws://localhost:8765");

  socket.onopen = function(e) {
    console.log("[open] Connection established");
  };

  socket.onmessage = async function(event) {
    console.log(`[message] Data received from server: ${event.data}`);
    const data = JSON.parse(event.data);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.log("No active tab found.");
      socket.send(JSON.stringify({ screenshot: null, error: "No active tab found." }));
      return;
    }

    if (data.action === "screenshot") {
      const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
      socket.send(JSON.stringify({ screenshot: screenshotUrl }));
      console.log("[message] Sent screenshot back to server after action.");
    }
    // else if (data.action === "click") {
    //   await chrome.scripting.executeScript({
    //     target: { tabId: tab.id },
    //     func: (x, y) => {
    //       let el = document.elementFromPoint(x, y);
    //       for (let i = 0; i < 3 && el; i++) {
    //         const down = new MouseEvent('mousedown', {bubbles: true, cancelable: true, view: window});
    //         const up = new MouseEvent('mouseup', {bubbles: true, cancelable: true, view: window});
    //         el.dispatchEvent(down);
    //         el.dispatchEvent(up);
    //         el = el.parentElement;
    //       }
    //     },
    //     args: [data.x, data.y]
    //   });
    // } else if (data.action === "type") {
    //   await chrome.scripting.executeScript({
    //     target: { tabId: tab.id },
    //     func: (text) => {
    //       const activeElement = document.activeElement;
    //       if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
    //         activeElement.focus();
    //         for (const char of text) {
    //           const keydown = new KeyboardEvent('keydown', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true });
    //           const keypress = new KeyboardEvent('keypress', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true });
    //           const keyup = new KeyboardEvent('keyup', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true });
    //           activeElement.dispatchEvent(keydown);
    //           activeElement.dispatchEvent(keypress);
    //           activeElement.value += char;
    //           activeElement.dispatchEvent(keyup);
    //         }
    //       } else {
    //          console.error('No active input element found to type in.');
    //       }
    //     },
    //     args: [data.text]
    //   });
    // }
  };

  socket.onclose = function(event) {
    if (event.wasClean) {
      console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
    } else {
      console.log('[close] Connection died. Attempting to reconnect...');
      setTimeout(connect, 1000);
    }
  };

  socket.onerror = function(error) {
    console.error(`[error] ${error.message}`);
    socket.close();
  };
}

connect();