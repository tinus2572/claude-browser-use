let socket = new WebSocket("ws://localhost:8765");
 
function connect() {

  socket.onopen = function(e) {
    console.log("[open] Connection established");
  };

  socket.onmessage = async function(event) {

    console.log(`[message] Data received from server: ${event.data}`);
    const data = JSON.parse(event.data);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const target = { tabId: tab.id };

    if (!tab) {
      console.log("No active tab found.");
      socket.send(JSON.stringify({ screenshot: null, error: "No active tab found." }));
      return;
    }

    if (data.action === "dimensions") {
      try {
        const [dims] = await chrome.scripting.executeScript({
          target: target,
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
      } catch (err) {
        console.error("[error] Could not get dimensions:", err);
        socket.send(JSON.stringify({ action: "dimensions", error: err.message }));
      }
    }
    
    else if (data.action === "screenshot") {
      const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
      socket.send(JSON.stringify({ screenshot: screenshotUrl }));
    }

    else if (data.action === "left_click") {
      const [x,y] = data.coordinate;
    
      if (typeof x !== "number" || typeof y !== "number") {
        console.log("Invalid click coordinates");
        socket.send(JSON.stringify({ action: "left_click", error: "Invalid or missing x/y" }));
        return;
      }
    
      try {
        const [result] = await chrome.scripting.executeScript({
          target: target,
          func: (x, y) => {
            
            // Find the element at that position
            const el = document.elementFromPoint(x, y);
            if (!el) return { success: false, error: "No element at coordinates" };
            
            // Optional: scroll element into view
            el.scrollIntoView({ block: "center", inline: "center" });
            
            // Dispatch a click event
            const evt = new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: x,
              clientY: y
            });
            el.dispatchEvent(evt);
            el.focus();

            const dot = document.createElement('div');
            dot.style.position = 'fixed';
            dot.style.left = `${x - 5}px`;
            dot.style.top = `${y - 5}px`;
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.background = 'red';
            dot.style.borderRadius = '50%';
            dot.style.zIndex = '999999';
            document.body.appendChild(dot);
            
            return { success: true, tag: el.tagName, id: el.id };
          },
          args: [x, y]
        });
    
        socket.send(JSON.stringify({ action: "left_click", data: result.result }));
      } catch (err) {
        console.error("Error executing click:", err);
        socket.send(JSON.stringify({ action: "left_click", error: err.message }));
      }
    }
    
    else if (data.action === "type") {
      await chrome.scripting.executeScript({
        target: target,
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
      const key = data.text;
    
      if (typeof key !== "string") {
        socket.send(JSON.stringify({ action: "key", error: "Invalid or missing key" }));
        return;
      }
        
      const keyMap = {
        ctrl: 2, control: 2,
        shift: 8,
        alt: 1,
        meta: 4, command: 4
      };
    
      function getVirtualKeyCode(key) {
        const specialKeys = {
          enter: 13,
          return: 13,
          escape: 27,
          ' ': 32,
          tab: 9,
          backspace: 8,
          delete: 46,
          arrowup: 38,
          arrowdown: 40,
          arrowleft: 37,
          arrowright: 39
        };
      
        if (specialKeys[key]) return specialKeys[key];
      
        // Letters A–Z
        if (key.length === 1 && key >= 'a' && key <= 'z')
          return key.toUpperCase().charCodeAt(0);
      
        // Digits 0–9
        if (key.length === 1 && key >= '0' && key <= '9')
          return key.charCodeAt(0);
      
        return 0; // Unknown key
      }

      try {
        await chrome.debugger.attach(target, "1.3");
    
        const keys = key.toLowerCase().split("+").map(k => k.trim());
        let modifiers = 0;
        let mainKey = "";
    
        for (const k of keys) {
          if (keyMap[k]) 
            modifiers |= keyMap[k];
          else mainKey = k;
        }
    
        const virtualKeyCode = getVirtualKeyCode(mainKey);
        if (!virtualKeyCode) {
          socket.send(JSON.stringify({ action: "key", error: `Unknown key: ${mainKey}` }));
          await chrome.debugger.detach(target);
          return;
        }
    
        const keyIdentifierMap = {
          enter: "Enter",
          escape: "Escape",
        };
        const keyIdentifier = keyIdentifierMap[mainKey] || mainKey;
    
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          modifiers,
          windowsVirtualKeyCode: virtualKeyCode,
          key: keyIdentifier
        });
    
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
          type: "keyUp",
          modifiers,
          windowsVirtualKeyCode: virtualKeyCode,
          key: keyIdentifier
        });
    
        await chrome.debugger.detach(target);
        socket.send(JSON.stringify({ action: "key", data: { success: true, key } }));

      } catch (err) {
        console.error("Key action failed:", err);
        socket.send(JSON.stringify({ action: "key", error: err.message }));
        try {
          await chrome.debugger.detach(target);
        } catch {}
      }
    }    

    else if (data.action === "mouse_move") {
      //////////////////////////////////:
    }

    else if (data.action === "wait") {
      await new Promise(resolve => setTimeout(resolve, data.duration));
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