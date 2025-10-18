let socket = new WebSocket("ws://localhost:8765");
setInterval(() => {}, 25000); // prevents sleep during debugging

function connect() {

  socket.onopen = function(e) {
    console.log("[open] Connection established");
  };

  socket.onmessage = async function(event) {

    // console.log(`[message] Data received from server: ${event.data}`);
    console.log(event);
    const data = JSON.parse(event.data);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.log("No active tab found.");
      socket.send(JSON.stringify({ screenshot: null, error: "No active tab found." }));
      return;
    }

    if (data.action === "dimensions") {
      const [dims] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ width: window.innerWidth, height: window.innerHeight })
      });
      socket.send(JSON.stringify({ action: "dimensions", data: dims?.result || null }));
      console.log("[message] Sent dimensions back to server after action.");
    }
    
    else if (data.action === "screenshot") {
      const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
      socket.send(JSON.stringify({ screenshot: screenshotUrl }));
      console.log("[message] Sent screenshot back to server after action.");
    }

    else if (data.action === "click") {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (x, y) => {
          // Convert to client coordinates if needed (assuming x/y are page coords)
          const clientX = x - window.scrollX;
          const clientY = y - window.scrollY;
    
          const el = document.elementFromPoint(clientX, clientY);
          if (!el) {
            console.warn("No element found at", clientX, clientY);
            return;
          }
    
          // Create a helper for consistent event options
          const opts = (type) => ({
            bubbles: true,
            cancelable: true,
            view: window,
            clientX,
            clientY,
            screenX: window.screenX + clientX,
            screenY: window.screenY + clientY,
            button: 0,
          });
    
          // Dispatch a realistic click sequence
          el.dispatchEvent(new MouseEvent("mousemove", opts("mousemove")));
          el.dispatchEvent(new MouseEvent("mousedown", opts("mousedown")));
          el.dispatchEvent(new MouseEvent("mouseup", opts("mouseup")));
          el.dispatchEvent(new MouseEvent("click", opts("click")));
    
          console.log("Clicked element at", x, y, el);
        },
        args: [data.x, data.y],
      });
    }
    //  else if (data.action === "type") {
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