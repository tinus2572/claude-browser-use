# Point & Click Software Engineer  
## Take-Home Assignment  

---

## I. Introduction & Context  

### About This Assignment  
At **Point & Click**, we believe the best way to evaluate someone's ability is by seeing them work in real conditions.  
Our process includes a **take-home technical assignment** that requires non-negligible time investment, but reflects our philosophy: we prioritize evaluating actual job skills over theoretical, off-topic performance.  

This assignment focuses on building a **simplified version of what we do at Point & Click** — creating an **AI Agent that lives in your browser** to take care of menial tasks for you. It gives you space for deep thinking and technical work similar to what you would do with us.  

---

## II. The Challenge  

### Problem Statement  
Your goal is to build a **minimal version of the Claude Computer Use Agent** that can **pilot a Chrome Extension**.  

Your deliverable should take as input:  
- Natural language tasks such as:  
  - “Go through my recent Gmail and find email lists or promotional emails that I haven’t opened in the last 3 months”  
  - “Find the latest paper on Hugging Face Daily Paper about UI Agents”  

**Output:**  
- Nothing directly — the Chrome Extension should be manipulated to execute the task using the Claude Computer Use Agent.  

The focus of this assignment is **not** on the UX/UI, but on the ability to understand how **Computer Use** works, how **Chrome Extensions** work, and how to **combine both**.  

We suggest splitting the code into two parts:  
1. **Chrome adapter bridge** that can be piloted by a client  
2. **Client (e.g., Python)** that orchestrates the Computer Use logic and communicates with the Chrome adapter to pilot the browser  

You are free to use whatever language you are most comfortable with, as long as you respect the assignment requirements.  

#### Bonus  
If you finish early, you can add a custom tool to the Chrome adapter and adapt the Agent accordingly to support:  
- File downloads  
- File uploads  
- Tab switching  

---

### Technical Requirements  

- **Framework:** App built with your preferred stack but must be able to pilot a Chrome Extension  
- **Input:** Natural language query  
- **Expected behavior:** Pilots the browser to perform the task  
- **Execution model:** Client-only  
  - Any LLM calls happen from the Extension/Client with a user-supplied API key  
  - Store the key locally (do not ship your key)  

**Deliverable:**  
- Working application (**code + deployment instructions**)  
- **3–5 minute Loom video** demonstrating functionality  
- **Short README** explaining setup, how the API key is used, and any limitations  

---

## III. Evaluation Criteria  

Your deliverable will be judged:  
1. **First**, on its adherence to the provided instructions  
2. **Then**, if functional, on the code quality, organization, and architecture  

We’re not just evaluating the final result but also your **technical decision-making** and your **interactions with us** to iterate and solve the problem in the most elegant and functional way.  

---

## IV. Constraints & Guidelines  

- **Time:** 72 hours from receipt to submission  
- **Code Standards:**  
  - You **must** be able to explain and justify every line of code  
  - If using AI assistance, ensure full understanding — avoid unexplained or auto-generated code  
  - Keep the codebase **clean, readable, and documented** (comments where it matters, concise README)  

---

## V. Submission  

Send your deliverable to: **[contact@conception.dev](mailto:contact@conception.dev)**  

---

**Good luck!**