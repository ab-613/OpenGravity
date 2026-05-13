/* ==========================================================================
   INTERACTIVE AGENT MANAGER (GEMINI API)
   Uses the Gemini Developer API (generativelanguage.googleapis.com).
   Authentication: API Key (BYOK — stored in localStorage).
   To change the model, update the `model` field below.
   ========================================================================== */

const AgentManager = {
    apiKey: localStorage.getItem('gemini_api_key'),
    model: 'gemini-3.1-pro-preview', // User requested specific model
    internalHistory: [],

    ensureApiKey() {
        if (!this.apiKey) {
            if (typeof appState !== 'undefined') {
                appState.isSettingsModalOpen = true;
                if (typeof updateUI === 'function') updateUI();
            }
            return false;
        }
        return true;
    },

    getTools() {
        return [{
            functionDeclarations: [
                { name: "run_command", description: "Execute a CLI/bash command.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
                { name: "send_terminal_input", description: "Send keystrokes (like 'y\\n' or 'n\\n') to the currently running background command.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
                { name: "wait", description: "Wait a specified number of milliseconds, then check the terminal output again.", parameters: { type: "object", properties: { milliseconds: { type: "number" } }, required: ["milliseconds"] } },
                { name: "write_file", description: "Create or overwrite a file.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
                { name: "read_file", description: "Read a specific file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
                { name: "list_files", description: "List all files in workspace.", parameters: { type: "object", properties: {} } }
            ]
        }];
    },

    async processUserQuery(query, uiCallback) {
        if (!this.ensureApiKey()) return uiCallback("**Error:** No API Key provided.", false);

        const systemInstruction = `
<identity>
You are Antigravity, a relentless, proactive, and interactive autonomous AI software engineer. 
You live inside a browser-based IDE with a real WebContainer Linux environment.
</identity>

- **PROACTIVE REASONING**: You are a reasoning-enabled model. Use your internal reasoning capability to plan your actions. Explain your plan, what files you will read/write, and why.
- **SILENT EXECUTION**: Do not output any conversational text during your reasoning. Use tools immediately after you have formulated your plan.
- **ZERO HESITATION**: Execute tasks immediately. Do not ask for permission.
- **MAKE ASSUMPTIONS**: Choose frameworks and styling (React, Vite, Tailwind, etc.) autonomously.
</execution_mandate>

# TOOL OUTPUT FORMAT
- Your reasoning will be captured and displayed separately.
- If you are finished, you may provide a brief final summary.

<react_vite_playbook>
CRITICAL: WebContainers NPM is very slow. You MUST use \`pnpm\` and Vite 5 to ensure fast installation. 
Use this EXACT sequence of commands:
1. \`rm -rf my-app && pnpm create vite@5 my-app --template react\`
2. \`cd my-app && pnpm install\` (This is 10x faster than npm).
3. If you need tailwind: \`cd my-app && pnpm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p\`
4. If you used ANY extra libraries (like framer-motion, lucide-react, etc), you MUST run \`cd my-app && pnpm install <packages>\` BEFORE running the dev server!
5. Use \`write_file\` to build the actual code in \`my-app/src/...\`.
6. \`cd my-app && pnpm run dev --host\` (the --host flag is required to expose the port).
</react_vite_playbook>

<interactive_terminal_rules>
1. **Handling Prompts**: If output ends with \`Ok to proceed? (y)\`, use \`send_terminal_input\` to send \`y\\n\`.
2. **Waiting**: If \`pnpm install\` returns \`[Process running in background]\`, use the \`wait\` tool with \`15000\` ms to give it plenty of time to finish. Keep waiting until it succeeds.
3. **Web Servers**: When you run \`pnpm run dev\`, it runs forever. Once output says "ready in" or "Local: http", YOU ARE DONE. Tell the user to click the Preview port.
</interactive_terminal_rules>

# CRITICAL RULES
- Always provide complete, working code.
- If a command fails, READ the output. If it needs input, send input! If it needs time, wait!
`;

        this.internalHistory.push({ role: 'user', parts: [{ text: query }] });

        let iterations = 40;

        while (iterations > 0) {
            iterations--;
            try {
                // Show that the agent is working/thinking
                uiCallback(`[tool_use: thinking {}]`, true, true);

                // Gemini Developer API — authenticates with a plain API key.
                // NOTE: Do NOT use aiplatform.googleapis.com here; that endpoint
                // requires OAuth2 / service-account credentials, not an API key.
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemInstruction }] },
                        contents: this.internalHistory,
                        tools: this.getTools(),
                        generationConfig: {
                            thinkingConfig: {
                                includeThoughts: true,
                                thinkingBudget: -1  // -1 = dynamic (model decides)
                            }
                        }
                    })
                });

                const responseText = await response.text();
                // generateContent returns a single JSON object; wrap it in an array
                // so the aggregation loop below works uniformly.
                let dataArray;
                try {
                    const parsed = JSON.parse(responseText);
                    // Surface API-level errors (e.g. invalid key, quota exceeded)
                    if (parsed.error) throw new Error(`Gemini API Error: ${parsed.error.message}`);
                    dataArray = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    if (e.message.startsWith('Gemini API Error:')) throw e;
                    throw new Error("Failed to parse Gemini API response. Check your API key and model name.");
                }

                // Aggregate content and thoughts from all parts of the stream
                let fullResponse = { role: 'model', parts: [] };

                for (const chunk of dataArray) {
                    if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content) {
                        fullResponse.parts.push(...chunk.candidates[0].content.parts);
                    }
                }

                if (fullResponse.parts.length === 0) throw new Error("No candidates returned from Vertex AI.");

                this.internalHistory.push(fullResponse);
                const responseMessage = fullResponse;

                let currentText = "";
                let aggregatedThoughts = "";
                let outputGiven = false;
                let isThinking = true; // Started at line 85
                let functionResponses = [];

                const flushText = () => {
                    if (currentText.trim()) {
                        outputGiven = true;
                        uiCallback(currentText.trim(), false);
                        currentText = "";
                    }
                };

                const flushThoughts = () => {
                    if (isThinking && aggregatedThoughts.trim()) {
                        uiCallback(`[tool_use: thinking ${JSON.stringify({ text: aggregatedThoughts.trim() })}]`, true, false);
                        aggregatedThoughts = "";
                        isThinking = false;
                    } else if (isThinking) {
                        // If we hit text/tools but have no thoughts, we still need to stop the UI timer
                        // Sending empty thoughts to the current block to stop its setInterval
                        uiCallback(`[tool_use: thinking {"text": ""}]`, true, false);
                        isThinking = false;
                    }
                };

                for (const part of fullResponse.parts) {
                    // 1. Thought Parts
                    if (part.thought || part.role === 'thought') {
                        if (!isThinking) {
                            flushText();
                            uiCallback(`[tool_use: thinking {}]`, true, true);
                            isThinking = true;
                        }
                        aggregatedThoughts += part.text + "\n\n";
                    }
                    // 2. Tool Calls
                    else if (part.functionCall) {
                        flushText();
                        flushThoughts();
                        
                        const call = part.functionCall;
                        let resultData = "";

                        if (call.name === 'run_command') {
                            uiCallback(`[tool_use: run_command ${JSON.stringify({ command: call.args.command })}]`, true, true);
                            resultData = await TerminalManager.executeAgentCommand(call.args.command);
                            const escapedOutput = resultData.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
                            uiCallback(`[tool_result: "${escapedOutput}"]`, true, false);
                        }
                        else if (call.name === 'send_terminal_input') {
                            uiCallback(`[tool_use: run_command ${JSON.stringify({ command: "Sent Input: " + call.args.text })}]`, true, true);
                            resultData = await TerminalManager.sendAgentInput(call.args.text);
                            const escapedOutput = resultData.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
                            uiCallback(`[tool_result: "${escapedOutput}"]`, true, false);
                        }
                        else if (call.name === 'wait') {
                            uiCallback(`[tool_use: command_status ${JSON.stringify({ text: "Waiting " + call.args.milliseconds + "ms..." })}]`, true, true);
                            resultData = await TerminalManager.waitAgent(call.args.milliseconds);
                            uiCallback('', true, false); // Clear status
                        }
                        else if (call.name === 'write_file') {
                            const lines = call.args.content.split('\n').length;
                            const type = call.args.path.includes('.') ? call.args.path.split('.').pop() : 'txt';
                            uiCallback(`[tool_use: write_to_file ${JSON.stringify({ name: call.args.path, type: type, add: "+" + lines, rem: "-0" })}]`, true, true);
                            await FSManager.writeFile(call.args.path, call.args.content, 'ai');
                            resultData = "File written successfully.";
                            uiCallback('', true, false);
                        }
                        else if (call.name === 'read_file') {
                            uiCallback(`[tool_use: command_status ${JSON.stringify({ text: "Analyzed " + call.args.path })}]`, true, true);
                            const file = appState.files[call.args.path];
                            resultData = file ? file.content : "Error: File not found.";
                            uiCallback('', true, false);
                        }
                        else if (call.name === 'list_files') {
                            uiCallback(`[tool_use: command_status ${JSON.stringify({ text: "Scanned workspace directory" })}]`, true, true);
                            resultData = Object.keys(appState.files).join('\n') || "Workspace is empty.";
                            uiCallback('', true, false);
                        }

                        functionResponses.push({
                            functionResponse: { name: call.name, response: { result: resultData.substring(0, 6000) } }
                        });
                        
                        isThinking = false; 
                    }
                    // 3. Text Parts (including mixed tags)
                    else if (part.text) {
                        const t = part.text;
                        const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/g;
                        
                        if (t.includes('<thought>')) {
                            let match, lastIdx = 0;
                            while ((match = thoughtRegex.exec(t)) !== null) {
                                currentText += t.substring(lastIdx, match.index);
                                flushText();
                                if (!isThinking) {
                                    uiCallback(`[tool_use: thinking {}]`, true, true);
                                    isThinking = true;
                                }
                                aggregatedThoughts += match[1].trim() + "\n\n";
                                lastIdx = thoughtRegex.lastIndex;
                            }
                            currentText += t.substring(lastIdx);
                        } else {
                            if (isThinking) {
                                flushThoughts();
                            }
                            currentText += t;
                        }
                    }
                }
                flushText();
                flushThoughts();

                // Push all function responses together as ONE user message
                if (functionResponses.length > 0) {
                    this.internalHistory.push({
                        role: 'user',
                        parts: functionResponses
                    });
                }

                // If we gave a final text output, we are done with this turn
                if (outputGiven) return;
            } catch (e) {
                console.error("Agent Error:", e);
                return uiCallback(`**Agent Crashed:** ${e.message}`, false);
            }
        }
        return uiCallback("Agent stopped (Reached maximum actions).", false);
    }
};
