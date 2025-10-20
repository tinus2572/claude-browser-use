let socket = new WebSocket("ws://localhost:8765");
 
function connect() {

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

    if (data.action === "dimensions") {
      try {
        const [dims] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            outerWidth: window.outerWidth,
            outerHeight: window.outerHeight,
            devicePixelRatio: window.devicePixelRatio,
            visualViewport: {
              width: window.visualViewport?.width ?? window.innerWidth,
              height: window.visualViewport?.height ?? window.innerHeight,
              scale: window.visualViewport?.scale ?? 1,
              offsetLeft: window.visualViewport?.offsetLeft ?? 0,
              offsetTop: window.visualViewport?.offsetTop ?? 0
            },
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            locationHref: window.location.href
          })
        });
        const result = dims?.result || null;
        socket.send(JSON.stringify({ action: "dimensions", data: result }));
        console.log("[message] Sent detailed dimensions to server:", result);
      } catch (err) {
        console.error("[error] Could not get dimensions:", err);
        socket.send(JSON.stringify({ action: "dimensions", error: err.message }));
      }
    }
    
    else if (data.action === "screenshot") {
      const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
      socket.send(JSON.stringify({ screenshot: screenshotUrl }));
      console.log("[message] Sent screenshot back to server after action.");
    }

    else if (data.action === "click") {
      const x_ratio = data.x;
      const y_ratio = data.y;
    
      if (typeof x_ratio !== "number" || typeof y_ratio !== "number") {
        console.log("Invalid click coordinates");
        socket.send(JSON.stringify({ action: "click", error: "Invalid or missing x_ratio/y_ratio" }));
        return;
      }
    
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (x_ratio, y_ratio) => {
            // Compute CSS pixel coordinates based on normalized ratios
            const cssX = x_ratio * window.innerWidth;
            const cssY = y_ratio * window.innerHeight;
    
            // Adjust for current scroll
            const pageX = cssX + window.scrollX;
            const pageY = cssY + window.scrollY;

            
            // Find the element at that position
            const el = document.elementFromPoint(cssX, cssY);
            if (!el) return { success: false, error: "No element at coordinates" };
            
            // Optional: scroll element into view
            el.scrollIntoView({ block: "center", inline: "center" });
            
            // Dispatch a click event
            const evt = new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: cssX,
              clientY: cssY
            });
            el.dispatchEvent(evt);
            el.focus();

            const dot = document.createElement('div');
            dot.style.position = 'fixed';
            dot.style.left = `${cssX - 5}px`;
            dot.style.top = `${cssY - 5}px`;
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.background = 'red';
            dot.style.borderRadius = '50%';
            dot.style.zIndex = '999999';
            document.body.appendChild(dot);
            
            return { success: true, tag: el.tagName, id: el.id };
          },
          args: [x_ratio, y_ratio]
        });
    
        socket.send(JSON.stringify({ action: "click", data: result.result }));
        console.log("[message] Click action executed:", result.result);
      } catch (err) {
        console.error("Error executing click:", err);
        socket.send(JSON.stringify({ action: "click", error: err.message }));
      }
    }
    
    else if (data.action === "click_type") {
      const x_ratio = data.x;
      const y_ratio = data.y;
      const text = data.text;
    
      if (typeof text !== "string") {
        socket.send(JSON.stringify({ action: "type", error: "Missing text to type" }));
        return;
      }
    
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (x_ratio, y_ratio, text) => {
            // Convert normalized ratios to CSS pixels
            const cssX = x_ratio * window.innerWidth;
            const cssY = y_ratio * window.innerHeight;
     
            // Find the element at that position
            const el = document.elementFromPoint(cssX, cssY);
            if (!el) return { success: false, error: "No element at coordinates" };
    
            // Scroll into view and focus
            el.scrollIntoView({ block: "center", inline: "center" });
            el.focus();
         
            // Only allow typing into editable elements
            if (!(el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
              return { success: false, error: "Target element is not editable" };
            }
    
            // Insert text at the cursor position
            const start = el.selectionStart ?? 0;
            const end = el.selectionEnd ?? 0;
            const value = el.value ?? el.textContent ?? "";
            const newValue = value.slice(0, start) + text + value.slice(end);
    
            if ("value" in el) {
              el.value = newValue;
            } else {
              el.textContent = newValue;
            }
    
            // Move cursor to end of inserted text
            if (typeof el.setSelectionRange === "function") {
              const cursorPos = start + text.length;
              el.setSelectionRange(cursorPos, cursorPos);
            }
            
            // Dispatch input event so frameworks detect change
            el.dispatchEvent(new Event("input", { bubbles: true }));

            const dot = document.createElement('div');
            dot.style.position = 'fixed';
            dot.style.left = `${cssX - 5}px`;
            dot.style.top = `${cssY - 5}px`;
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.background = 'red';
            dot.style.borderRadius = '50%';
            dot.style.zIndex = '999999';
            document.body.appendChild(dot);
    
            return { success: true, tag: el.tagName, id: el.id, textInserted: text };
          },
          args: [x_ratio, y_ratio, text]
        });
    
        socket.send(JSON.stringify({ action: "type", data: result.result }));
        console.log("[message] Type action executed:", result.result);
      } catch (err) {
        console.error("Error executing type action:", err);
        socket.send(JSON.stringify({ action: "type", error: err.message }));
      }
    }
    
    else if (data.action === "type") {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text) => {
          const active = document.activeElement;
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            const start = active.selectionStart ?? 0;
            const end = active.selectionEnd ?? 0;
            const value = active.value ?? active.textContent ?? '';

            const newValue = value.slice(0, start) + text + value.slice(end);

            if ('value' in active) {
              active.value = newValue;
            } else {
              active.textContent = newValue;
            }

            if (typeof active.setSelectionRange === 'function') {
              const cursorPos = start + text.length;
              active.setSelectionRange(cursorPos, cursorPos);
            }

            active.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            console.warn('No editable element focused to type into.');
          }
        },
        args: [data.text]
      });

      console.log(`[message] Typed text into active element: ${data.text}`);
    }

    else if (data.action === "key") {
      const key = data.key;

      if (typeof key !== "string") {
        console.log("Invalid key");
        socket.send(JSON.stringify({ action: "key", error: "Invalid or missing key" }));
        return;
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab.id;
      const debuggee = { tabId: tabId };

      try {
        await chrome.debugger.attach(debuggee, "1.3");
        console.log("Debugger attached");

        const keys = key.split('+').map(k => k.trim().toLowerCase());
        let modifiers = 0;
        let mainKey = '';
        const keyMap = {
          'ctrl': 2, 'control': 2,
          'shift': 8,
          'alt': 1,
          'meta': 4, 'command': 4
        };
        const vkMap = {
          'a': 65, 'b': 66, 'c': 67, 'd': 68, 'e': 69, 'f': 70, 'g': 71, 'h': 72, 'i': 73, 'j': 74, 'k': 75, 'l': 76, 'm': 77, 'n': 78, 'o': 79, 'p': 80, 'q': 81, 'r': 82, 's': 83, 't': 84, 'u': 85, 'v': 86, 'w': 87, 'x': 88, 'y': 89, 'z': 90,
          '0': 48, '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57,
          'enter': 13, 'escape': 27, ' ': 32
        };

        for (const k of keys) {
          if (keyMap[k]) {
            modifiers |= keyMap[k];
          } else {
            if (mainKey) {
              console.log("Invalid key combination: multiple main keys");
              socket.send(JSON.stringify({ action: "key", error: "Invalid key combination: multiple main keys" }));
              await chrome.debugger.detach(debuggee);
              return;
            }
            mainKey = k;
          }
        }

        if (!mainKey) {
          console.log("Invalid key combination: no main key");
          socket.send(JSON.stringify({ action: "key", error: "Invalid key combination: no main key" }));
          await chrome.debugger.detach(debuggee);
          return;
        }

        const virtualKeyCode = vkMap[mainKey];
        if (!virtualKeyCode) {
            console.log("Unknown key:", mainKey);
            socket.send(JSON.stringify({ action: "key", error: "Unknown key" }));
            await chrome.debugger.detach(debuggee);
            return;
        }

        const keyIdentifierMap = {
            'enter': 'Enter',
            'escape': 'Escape',
            ' ': 'Space'
        };
        const keyIdentifier = keyIdentifierMap[mainKey] || mainKey;

        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          modifiers: modifiers,
          windowsVirtualKeyCode: virtualKeyCode,
          key: keyIdentifier
        });

        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
          type: "keyUp",
          modifiers: modifiers,
          windowsVirtualKeyCode: virtualKeyCode,
          key: keyIdentifier
        });

        await chrome.debugger.detach(debuggee);
        console.log("Debugger detached");

        socket.send(JSON.stringify({ action: "key", data: { success: true, key: key } }));
        console.log("[message] Key action executed:", { success: true, key: key });

      } catch (err) {
        console.error("Error executing key action:", err);
        socket.send(JSON.stringify({ action: "key", error: err.message }));
        try {
          await chrome.debugger.detach(debuggee);
        } catch (detachErr) {
          console.error("Error detaching debugger:", detachErr);
        }
      }
    }
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