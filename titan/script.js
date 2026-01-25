// Wait for libraries to load
const waitForXTerm = setInterval(() => {
    if (window.Terminal && window.FitAddon) {
        clearInterval(waitForXTerm);
        initTerminal();
    }
}, 100);

let term;
let fitAddon;
let currentLine = "";
let ghostTextLength = 0; // Track length of ghost text
let user = "guest";
let commandHistory = [];
let historyIndex = -1;
let isTyping = false; // Block input while typing system messages
let skipAnimation = false; // Flag to skip typing animation

// File System Data - Now populated via fetch
let fileSystem = {};

const modal = document.getElementById('doc-modal');
const docContainer = document.getElementById('doc-container');
const closeBtn = document.getElementById('close-btn');
const modalFooter = document.getElementById('modal-footer-status');

// Modal Logic
closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    term.focus();
});

// Helper to obfuscate string (keep first 10%, block rest)
function getRedactedText(text, isDesc = false) {
    if (user === 'admin' || user === 'builder') return text;
    
    // For description, "use the █ letter... for the whole description"
    if (isDesc) {
        return '█'.repeat(text.length);
    }

    // For filename: "name at the last %90" (keep first 10%)
    const visibleLen = Math.ceil(text.length * 0.1);
    const visiblePart = text.substring(0, visibleLen);
    const hiddenPart = '█'.repeat(text.length - visibleLen);
    return visiblePart + hiddenPart;
}

// Terminal Initialization
function initTerminal() {
    term = new window.Terminal({
        cursorBlink: true,
        // Reverting to VT323 as requested for retro feel
        fontFamily: "'VT323', monospace", 
        fontSize: 16, 
        lineHeight: 1.2,
        letterSpacing: 0,
        theme: {
            background: '#080500',
            foreground: '#ffb86c', // Warm Amber
            cursor: '#ffb000',
            selectionBackground: 'rgba(255, 176, 0, 0.3)',
            black: '#000000',
            red: '#ff3333',
            green: '#33ff33', // Keep green for success
            yellow: '#ffaa00',
            blue: '#ffb000', // Shift blue to amber for this theme
            magenta: '#ff5500',
            cyan: '#ffcc99',
            white: '#ffffff',
            brightBlack: '#808080',
            brightRed: '#ff9999',
            brightGreen: '#99ff99',
            brightYellow: '#ffff99',
            brightBlue: '#ffdd99',
            brightMagenta: '#ff9966',
            brightCyan: '#ffeebb',
            brightWhite: '#ffffff'
        }
    });

    fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(document.getElementById('terminal-container'));
    fitAddon.fit();

    window.addEventListener('resize', () => fitAddon.fit());

    // Boot up
    fetchFileSystem().then(() => {
        runBootSequence();
    });

    term.onData(e => {
        if (!modal.classList.contains('hidden')) return;

        // Handle animation skipping
        if (isTyping) {
            if (e === '\r') { // Enter key skips animation
                skipAnimation = true;
            }
            return;
        }

        // Clear existing ghost text before any input processing
        clearGhostText();

        switch (e) {
            case '\r': // Enter
                term.write('\r\n');
                processCommand(currentLine);
                currentLine = "";
                break;
            case '\u007F': // Backspace
                if (currentLine.length > 0) {
                    currentLine = currentLine.slice(0, -1);
                    term.write('\b \b');
                }
                updateGhostText(); // Update suggestion after backspace
                break;
            case '\t': // Tab Completion
                handleTabCompletion();
                break;
            case '\u001b[A': // Up Arrow
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    const cmd = commandHistory[commandHistory.length - 1 - historyIndex];
                    clearCurrentLine();
                    currentLine = cmd;
                    term.write(currentLine);
                }
                break;
            case '\u001b[B': // Down Arrow
                if (historyIndex > -1) {
                    historyIndex--;
                    const cmd = historyIndex === -1 ? "" : commandHistory[commandHistory.length - 1 - historyIndex];
                    clearCurrentLine();
                    currentLine = cmd;
                    term.write(currentLine);
                }
                break;
            default:
                if (e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7e)) {
                    currentLine += e;
                    term.write(e);
                    updateGhostText(); // Check for suggestion after typing
                }
        }
    });
}

async function fetchFileSystem() {
    try {
        const response = await fetch('./documents.json');
        if (response.ok) {
            fileSystem = await response.json();
        } else {
            console.error("Failed to load file system");
        }
    } catch (e) {
        console.error("Critical System Failure: ", e);
    }
}

// Function to simulate slow typing (Teletype effect)
async function typeText(text, delayMs = 15) {
    isTyping = true;
    for (let char of text) {
        if (skipAnimation) {
            term.write(char);
            continue; // Skip delay
        }
        
        term.write(char);
        // Randomize delay slightly for realism
        if (delayMs > 0) {
            await delay(delayMs + Math.random() * 10);
        }
    }
    isTyping = false;
}

function clearCurrentLine() {
    term.write('\r' + getPrompt()); 
    term.write('\x1b[K');
}

// Draw faint ghost text suggestion
function updateGhostText() {
    if (!currentLine.startsWith('access ')) return;

    const parts = currentLine.split(' ');
    const partial = parts[1] || "";
    
    if (partial.length === 0) return;

    // Filter available files based on user access
    const availableFiles = Object.keys(fileSystem).filter(key => {
        if (user === 'admin' || user === 'builder') return true;
        return fileSystem[key].access === 'public';
    });

    const matches = availableFiles.filter(f => f.startsWith(partial));

    if (matches.length === 1) {
        const remaining = matches[0].substring(partial.length);
        if (remaining.length > 0) {
            // Write ghost text in dim color (ANSI 90 is bright black/dark gray)
            term.write(`\x1b[90m${remaining}\x1b[0m`);
            term.write(`\x1b[${remaining.length}D`);
            ghostTextLength = remaining.length;
        }
    }
}

// Clear the ghost text visually
function clearGhostText() {
    if (ghostTextLength > 0) {
        term.write(' '.repeat(ghostTextLength));
        term.write(`\x1b[${ghostTextLength}D`);
        ghostTextLength = 0;
    }
}

function handleTabCompletion() {
    if (currentLine.startsWith('access ')) {
        const parts = currentLine.split(' ');
        const partial = parts[1] || "";
        
        const availableFiles = Object.keys(fileSystem).filter(key => {
            if (user === 'admin' || user === 'builder') return true;
            return fileSystem[key].access === 'public';
        });

        const matches = availableFiles.filter(f => f.startsWith(partial));

        if (matches.length === 1) {
            const completion = matches[0].substring(partial.length);
            currentLine += completion;
            term.write(completion);
        }
    }
}

async function runBootSequence() {
    skipAnimation = false;
    await typeText('\x1b[33m[SYSTEM]\x1b[0m INITIALIZING TITAN-1 SECURE UPLINK...\r\n', 20);
    await delay(300);
    if(skipAnimation) term.write('VERIFYING BIOMETRICS...'); else await typeText('\x1b[33m[SYSTEM]\x1b[0m VERIFYING BIOMETRICS', 20);
    if(!skipAnimation) { await delay(300); term.write('.'); await delay(300); term.write('.'); await delay(300); term.write('.\r\n'); } else { term.write('...\r\n'); }
    await typeText('\x1b[32m[OK]\x1b[0m RETINAL SCAN MATCH: GUEST\r\n', 10);
    if(!skipAnimation) await delay(200);
    await typeText('\x1b[32m[OK]\x1b[0m ESTABLISHING ENCRYPTED TUNNEL TO R.A.I.S.A....\r\n', 10);
    if(!skipAnimation) await delay(600);
    await typeText('\x1b[32m[OK]\x1b[0m CONNECTION ESTABLISHED.\r\n', 5);
    term.write('\r\n');
    await typeText('Welcome to the Titan-1 Alpha Detachment External Interface.\r\n');
    await typeText('Type \x1b[1;33mhelp\x1b[0m for available commands.\r\n');
    term.write('\r\n');
    prompt();
}

function prompt() {
    term.write(getPrompt());
    skipAnimation = false; // Reset skip flag on new prompt
}

function getPrompt() {
    if (user === 'admin') {
        return '\x1b[1;31madmin@TITAN-1\x1b[0m:\x1b[33m~\x1b[0m$ ';
    }
    if (user === 'builder') {
        return '\x1b[1;36mbuilder@TITAN-1\x1b[0m:\x1b[33m~\x1b[0m$ ';
    }
    return '\x1b[1;32mguest@TITAN-1\x1b[0m:\x1b[33m~\x1b[0m$ ';
}

async function processCommand(cmdRaw) {
    skipAnimation = false; // Start fresh for command output
    const trimmed = cmdRaw.trim();
    if (trimmed.length > 0) {
        commandHistory.push(trimmed);
        historyIndex = -1;
    }

    const args = trimmed.split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (trimmed === "") {
        prompt();
        return;
    }

    switch (cmd) {
        case 'help':
            term.write('\r\n');
            await typeText('  \x1b[1;33mlogin [pass]\x1b[0m  Elevate privileges\r\n', 5);
            await typeText('  \x1b[1;33mlist\x1b[0m          Show file index\r\n', 5);
            await typeText('  \x1b[1;33maccess [code]\x1b[0m Open specific document\r\n', 5);
            if (user === 'builder' || user === 'admin') {
                await typeText('  \x1b[1;36mbuild\x1b[0m         Launch Document Builder\r\n', 5);
            }
            await typeText('  \x1b[1;33mclear\x1b[0m         Clear viewport\r\n', 5);
            term.write('\r\n');
            break;

        case 'clear':
            term.clear();
            break;

        case 'login':
            if (args[1] === 'titan') {
                user = 'admin';
                term.write('\r\n\x1b[1;32mAUTHENTICATION SUCCESSFUL.\x1b[0m\r\n');
                await typeText('WELCOME BACK, COMMANDER.\r\n');
                if (fileSystem['alpha-roster']) fileSystem['alpha-roster'].desc = 'Active personnel list.';
                if (fileSystem['containment-procedures']) fileSystem['containment-procedures'].desc = 'Standard operating procedures.';
                if (fileSystem['incident-log-09']) fileSystem['incident-log-09'].desc = 'After action report: Sector 7 breach.';
            } else if (args[1] === 'builder') {
                user = 'builder';
                term.write('\r\n\x1b[1;36mBUILDER TOOLS AUTHORIZED.\x1b[0m\r\n');
                await typeText('Type \x1b[1;33mbuild\x1b[0m to access the construction matrix.\r\n');
            } else {
                term.write('\r\n\x1b[1;31mAUTHENTICATION FAILED.\x1b[0m ACCESS DENIED.\r\n');
            }
            break;

        case 'build':
            if (user === 'builder' || user === 'admin') {
                term.write('\r\nINITIALIZING BUILDER PROTOCOLS...\r\n');
                term.write('Redirecting to secure construction environment...\r\n');
                setTimeout(() => {
                    window.location.href = './builder.html';
                }, 1000);
            } else {
                term.write('\r\n\x1b[31mERROR:\x1b[0m UNAUTHORIZED. BUILDER CLEARANCE REQUIRED.\r\n');
            }
            break;

        case 'list':
            term.write('\r\n\x1b[1;37m--- TITAN-1 DATABASE INDEX ---\x1b[0m\r\n');
            
            // SORTING LOGIC: Public/Open first, then Restricted/Locked. Then Alphabetical.
            const sortedKeys = Object.keys(fileSystem).sort((a, b) => {
                const fileA = fileSystem[a];
                const fileB = fileSystem[b];
                
                // If one is public and other is restricted, public comes first
                const isPublicA = fileA.access === 'public';
                const isPublicB = fileB.access === 'public';

                if (isPublicA && !isPublicB) return -1;
                if (!isPublicA && isPublicB) return 1;

                // Otherwise alphabetical
                return a.localeCompare(b);
            });

            // Prepare Lines
            const lines = [];
            let totalLength = 0;

            for (const code of sortedKeys) {
                const file = fileSystem[code];
                let status = '\x1b[32m[OPEN]\x1b[0m  ';
                let displayName = code;
                let displayDesc = file.desc;

                if (file.access === 'restricted' && user !== 'admin' && user !== 'builder') {
                    status = '\x1b[31m[LOCK]\x1b[0m  ';
                    displayName = getRedactedText(code, false); 
                    displayDesc = getRedactedText(file.desc, true); 
                }
                
                const paddedCode = displayName.padEnd(25, ' ');
                const lineStr = `${status} ${paddedCode} : ${displayDesc}\r\n`;
                lines.push(lineStr);
                
                // Estimate stripped length roughly for timing calculation
                totalLength += lineStr.length; 
            }

            // Fixed Duration Logic: 3 seconds total
            const targetDuration = 3000;
            isTyping = true;
            
            if (lines.length > 0) {
                // If we have a huge amount of text, character-by-character typing (even with 0 delay) 
                // is limited by the browser's execution speed / render loop.
                // Threshold: If we need to print faster than 1 char every 5ms, switch to line-by-line mode.
                
                const estimatedDelayPerChar = targetDuration / totalLength;

                if (estimatedDelayPerChar < 5) {
                    // Fast Mode: Line by Line
                    const delayPerLine = targetDuration / lines.length;
                    for (const line of lines) {
                        if (skipAnimation) { term.write(line); continue; }
                        term.write(line);
                        // Ensure we don't delay less than 1ms effectively
                        await delay(delayPerLine);
                    }
                } else {
                    // Detailed Mode: Character by Character (Custom loop to ensure timing)
                    for (const line of lines) {
                        if (skipAnimation) { term.write(line); continue; }
                        for (const char of line) {
                            if (skipAnimation) { term.write(char); continue; }
                            term.write(char);
                            await delay(estimatedDelayPerChar);
                        }
                    }
                }
            }
            
            isTyping = false;
            term.write('------------------------------\r\n');
            break;

        case 'access':
            const code = args[1];
            if (!code) {
                term.write('\r\n\x1b[31mERROR:\x1b[0m Usage: access [codename]\r\n');
            } else {
                let targetCode = code;
                if (code.includes('█')) {
                     const match = Object.keys(fileSystem).find(k => getRedactedText(k, false) === code);
                     if (match) targetCode = match;
                }

                if (!fileSystem[targetCode]) {
                    term.write(`\r\n\x1b[31mERROR:\x1b[0m File '${code}' not found.\r\n`);
                } else {
                    const file = fileSystem[targetCode];
                    
                    if (file.access === 'restricted' && user !== 'admin' && user !== 'builder') {
                        term.write(`\r\n\x1b[33mWARNING:\x1b[0m RESTRICTED FILE. DISPLAYING PARTIAL DECRYPTION...\r\n`);
                        await delay(500);
                        await openDocumentSimulated(file, true); 
                    } else if (file.content) {
                        term.write(`\r\nOPENING FILE: ${targetCode}...\r\n`);
                        await openDocument(targetCode, file.content, file.access);
                    } else {
                         term.write(`\r\nOPENING FILE: ${targetCode}...\r\n`);
                         await openDocumentSimulated(file, false);
                    }
                }
            }
            break;

        default:
            term.write(`\r\nCommand not found: ${cmd}\r\n`);
    }

    prompt();
}

async function openDocument(docKey, content, accessLevel) {
    try {
        let html = content;
        
        if (user !== 'admin' && user !== 'builder') {
            html = html.replace(/Director Hollender/g, 'Director █████');
            html = html.replace(/O5 Council/g, '█████ Council');
            html = html.replace(/MTF Alpha-1/g, 'MTF █████');
            html = html.replace(/Red Right Hand/g, '██████████');
        }

        docContainer.innerHTML = html;
        
        // Update Footer Status per request
        if (accessLevel === 'public') {
            modalFooter.innerHTML = '<span style="color: var(--accent-green);">Declassified [SC-5] Material</span>';
        } else {
            modalFooter.innerHTML = '<span style="color: var(--accent-red);">Classified [SC-5] Material</span>';
        }

        modal.classList.remove('hidden');
    } catch (e) {
        term.write(`\r\n\x1b[31mSYSTEM ERROR:\x1b[0m ${e.message}\r\n`);
    }
}

async function openDocumentSimulated(file, redacted) {
    let content = `
        <div style="font-family: 'Georgia', serif; padding: 20px;">
            <h1>${file.desc.replace(/\[ENCRYPTED\]/g, '')}</h1>
            <hr>
            <p>
                DATE: 2026-01-24<br>
                REF: ALPHA-SEC-99
            </p>
            <br>
            <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
                Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
        </div>
    `;

    if (redacted) {
        const textOnly = "RESTRICTED CONTENT. ENCRYPTION KEY REQUIRED. UNAUTHORIZED ACCESS ATTEMPT LOGGED.";
        const visible = textOnly.substring(0, Math.floor(textOnly.length * 0.1));
        const blocks = '█'.repeat(800);
        
        content = `
            <div style="font-family: 'Georgia', serif; padding: 20px; color: #ff3333; overflow-wrap: break-word;">
                <h1>RESTRICTED ACCESS</h1>
                <hr style="border-color: #ff3333;">
                <p>${visible}${blocks}</p>
            </div>
        `;
        
        modalFooter.innerHTML = '<span style="color: var(--accent-red);">CLEARANCE LEVEL: UNAUTHORIZED</span>';
    } else {
         modalFooter.innerHTML = '<span style="color: var(--accent-red);">Classified [SC-5] Material</span>';
    }

    docContainer.innerHTML = content;
    modal.classList.remove('hidden');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
