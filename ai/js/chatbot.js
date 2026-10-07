const CHAT_API_ENDPOINT = window.STEVEGPT_API_ENDPOINT || "/api/chat";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatClear = document.getElementById("chatClear");
const chatEmptyState = document.getElementById("chatEmptyState");
const chatShell = document.querySelector(".chat-shell");
const chatAttach = document.getElementById("chatAttach");
const chatUpload = document.getElementById("chatUpload");
const attachmentTray = document.getElementById("attachmentTray");
const submitButton = document.getElementById("chatSubmit") || chatForm.querySelector("button[type='submit']");

const CHAT_HISTORY_KEY = "stevegptChatHistory";
const REQUEST_TIMEOUT_MS = 70 * 1000;
const MAX_ATTACHMENTS = 4;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_ATTACHMENT_CHARS = 12000;
const DEFAULT_PLACEHOLDER = "Talk to SteveGPT";

const conversation = [];
let activeRequestController = null;
let activeRequestId = 0;
let activeReplyMessage = null;
let pendingAttachments = [];

const localReplies = [
  {
    keywords: ["capstone", "project", "demo"],
    response: "its steve's capstone demo lol. basically a public chat page connected to a private ai endpoint."
  },
  {
    keywords: ["steve", "stevegpt", "who"],
    response: "im SteveGPT. basically a chatbot trying to talk like steve, not a full biography dump."
  },
  {
    keywords: ["hello", "hi", "hey"],
    response: "yo"
  },
  {
    keywords: ["help", "can you"],
    response: "yeah np. ask the actual thing tho."
  }
];

initWallpaperGlows();
setSubmitButtonMode("send");

function initWallpaperGlows() {
  const ambient = document.querySelector(".ambient");

  if (!ambient) {
    return;
  }

  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const glowCount = Math.floor(randomBetween(5, 8));
  const fragment = document.createDocumentFragment();

  ambient.replaceChildren();

  for (let index = 0; index < glowCount; index += 1) {
    const glow = document.createElement("div");
    const size = randomBetween(120, 310);
    const alpha = randomBetween(0.12, 0.28);
    const driftX = randomBetween(-90, 90);
    const driftY = randomBetween(-70, 70);

    glow.className = "wallpaper-glow";
    glow.style.setProperty("--x", `${randomBetween(4, 96)}vw`);
    glow.style.setProperty("--y", `${randomBetween(8, 94)}vh`);
    glow.style.setProperty("--size", `${size}px`);
    glow.style.setProperty("--blur", `${randomBetween(34, 72)}px`);
    glow.style.setProperty("--alpha", alpha.toFixed(3));
    glow.style.setProperty("--duration", `${randomBetween(18, 36)}s`);
    glow.style.setProperty("--delay", `${randomBetween(-18, 0)}s`);
    glow.style.setProperty("--drift-x", `${driftX.toFixed(1)}px`);
    glow.style.setProperty("--drift-y", `${driftY.toFixed(1)}px`);
    glow.style.setProperty("--scale-start", randomBetween(0.86, 1.08).toFixed(3));
    glow.style.setProperty("--scale-mid", randomBetween(1.02, 1.24).toFixed(3));
    glow.style.setProperty("--scale-end", randomBetween(0.8, 1.02).toFixed(3));
    glow.style.setProperty("--opacity-start", randomBetween(0.26, 0.52).toFixed(3));
    glow.style.setProperty("--opacity-mid", randomBetween(0.38, 0.72).toFixed(3));
    glow.style.setProperty("--opacity-end", randomBetween(0.2, 0.46).toFixed(3));

    fragment.appendChild(glow);
  }

  ambient.appendChild(fragment);
}

function sendIconSvg() {
  return [
    "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\">",
    "<path d=\"M12 19V5\"></path>",
    "<path d=\"m5 12 7-7 7 7\"></path>",
    "</svg>"
  ].join("");
}

function stopIconSvg() {
  return [
    "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\">",
    "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"></rect>",
    "</svg>"
  ].join("");
}

function copyIconSvg() {
  return [
    "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\">",
    "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"></rect>",
    "<path d=\"M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2\"></path>",
    "</svg>"
  ].join("");
}

function checkIconSvg() {
  return [
    "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\">",
    "<path d=\"m20 6-11 11-5-5\"></path>",
    "</svg>"
  ].join("");
}

function closeIconSvg() {
  return [
    "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\">",
    "<path d=\"M18 6 6 18\"></path>",
    "<path d=\"m6 6 12 12\"></path>",
    "</svg>"
  ].join("");
}

function regenerateIconSvg() {
  return [
    "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\">",
    "<path d=\"M21 12a9 9 0 1 1-3-6.7\"></path>",
    "<path d=\"M21 3v6h-6\"></path>",
    "</svg>"
  ].join("");
}

function setSubmitButtonMode(mode) {
  const isStop = mode === "stop";

  submitButton.dataset.mode = mode;
  submitButton.innerHTML = isStop ? stopIconSvg() : sendIconSvg();
  submitButton.disabled = false;
  submitButton.setAttribute("aria-label", isStop ? "Stop response" : "Send message");
  submitButton.title = isStop ? "Stop response" : "Send message";
}

function updateEmptyState() {
  if (!chatEmptyState) {
    return;
  }

  if (!chatMessages.contains(chatEmptyState)) {
    chatMessages.prepend(chatEmptyState);
  }

  const hasMessages = Boolean(chatMessages.querySelector(".chat-message"));

  chatEmptyState.textContent = "Where should we begin?";
  chatEmptyState.hidden = hasMessages;
  document.body.classList.toggle("chat-is-empty", !hasMessages);
}

function saveConversationHistory() {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversation.slice(-40)));
  } catch (error) {
    console.warn("Chat history could not be saved; this conversation remains available until reload.", error);
  }
}

function scrollChatToBottom() {
  const scroller = chatShell || document.scrollingElement || document.documentElement;

  requestAnimationFrame(() => {
    scroller.scrollTop = scroller.scrollHeight;
  });
}

function appendConversation(role, content, sourcePrompt = "") {
  conversation.push({
    role,
    content,
    ...(sourcePrompt ? { sourcePrompt } : {})
  });
  saveConversationHistory();
}

function replaceConversationReply(sourcePrompt, content) {
  let replyIndex = -1;

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index].role === "assistant" && conversation[index].sourcePrompt === sourcePrompt) {
      replyIndex = index;
      break;
    }
  }

  const nextReply = { role: "assistant", content, sourcePrompt };

  if (replyIndex >= 0) {
    conversation[replyIndex] = nextReply;
  } else {
    conversation.push(nextReply);
  }

  saveConversationHistory();
}

function pruneChatAfterMessage(messageElement) {
  const messages = [...chatMessages.querySelectorAll(".chat-message")];
  const targetIndex = messages.indexOf(messageElement);

  if (targetIndex < 0) {
    return;
  }

  messages.slice(targetIndex + 1).forEach((message) => {
    message.remove();
  });

  conversation.length = 0;

  messages.slice(0, targetIndex).forEach((message) => {
    if (message.classList.contains("user")) {
      conversation.push({
        role: "user",
        content: message.querySelector(".chat-bubble")?.textContent || ""
      });
      return;
    }

    if (message.classList.contains("bot") && message.dataset.reply) {
      conversation.push({
        role: "assistant",
        content: message.dataset.reply,
        ...(message.dataset.sourcePrompt ? { sourcePrompt: message.dataset.sourcePrompt } : {})
      });
    }
  });

  saveConversationHistory();
  updateEmptyState();
}

function isTextAttachment(file) {
  return /^text\//.test(file.type)
    || /\.(txt|md|markdown|mdown|tex|latex|csv|json|js|html|css|py|java)$/i.test(file.name);
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsText(file);
  });
}

async function createAttachment(file) {
  const base = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name || "attachment",
    type: file.type || "application/octet-stream",
    size: file.size || 0
  };

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${base.name} is too large. Files need to be under ${formatFileSize(MAX_FILE_BYTES)}.`);
  }

  if (file.type.startsWith("image/")) {
    return {
      ...base,
      kind: "image",
      dataUrl: await readFileAsDataUrl(file)
    };
  }

  if (isTextAttachment(file)) {
    return {
      ...base,
      kind: "text",
      dataUrl: await readFileAsDataUrl(file),
      text: (await readFileAsText(file)).slice(0, MAX_TEXT_ATTACHMENT_CHARS)
    };
  }

  return {
    ...base,
    kind: "file",
    dataUrl: await readFileAsDataUrl(file)
  };
}

function renderAttachmentPreview(attachment, removable = false) {
  const chip = document.createElement("div");
  chip.className = removable ? "attachment-chip" : "message-attachment-chip";

  if (attachment.kind === "image" && attachment.dataUrl) {
    const image = document.createElement("img");
    image.src = attachment.dataUrl;
    image.alt = "";

    if (!removable) {
      chip.className = "message-image-attachment";
      chip.appendChild(image);
      return chip;
    }

    chip.classList.add("is-image");
    chip.appendChild(image);
  } else {
    const label = document.createElement("span");
    label.textContent = `${attachment.name} ${attachment.size ? `(${formatFileSize(attachment.size)})` : ""}`.trim();
    chip.appendChild(label);
  }

  if (removable) {
    const remove = document.createElement("button");
    remove.className = "attachment-remove";
    remove.type = "button";
    remove.dataset.attachmentId = attachment.id;
    remove.setAttribute("aria-label", `Remove ${attachment.name}`);
    remove.title = "Remove";
    remove.innerHTML = closeIconSvg();
    chip.appendChild(remove);
  }

  return chip;
}

function renderAttachmentTray() {
  if (!attachmentTray) {
    return;
  }

  attachmentTray.replaceChildren(...pendingAttachments.map((attachment) => (
    renderAttachmentPreview(attachment, true)
  )));
  attachmentTray.hidden = pendingAttachments.length === 0;
}

async function handleSelectedFiles(files) {
  const slots = MAX_ATTACHMENTS - pendingAttachments.length;

  if (slots <= 0) {
    return;
  }

  const selectedFiles = [...files].slice(0, slots);

  for (const file of selectedFiles) {
    try {
      pendingAttachments.push(await createAttachment(file));
    } catch (error) {
      addMessage(error.message || "couldnt attach that file", "bot");
    }
  }

  renderAttachmentTray();
}

async function handlePastedFiles(event) {
  const clipboard = event.clipboardData;

  if (!clipboard) {
    return;
  }

  const files = [
    ...[...clipboard.files],
    ...[...clipboard.items]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean)
  ];
  const uniqueFiles = files.filter((file, index, list) => (
    list.findIndex((candidate) => (
      candidate.name === file.name
      && candidate.size === file.size
      && candidate.type === file.type
    )) === index
  ));

  if (!uniqueFiles.length) {
    return;
  }

  event.preventDefault();
  await handleSelectedFiles(uniqueFiles);
}

function getAttachmentSummary(attachments) {
  return attachments
    .map((attachment) => `[${attachment.kind === "image" ? "Image" : "File"}: ${attachment.name}]`)
    .join(" ");
}

function serializeAttachments(attachments) {
  return attachments.map((attachment) => ({
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    kind: attachment.kind,
    ...(attachment.dataUrl ? { dataUrl: attachment.dataUrl } : {}),
    ...(attachment.text ? { text: attachment.text.slice(0, MAX_TEXT_ATTACHMENT_CHARS) } : {})
  }));
}

function addMessage(text, sender, extraClass = "", attachments = []) {
  const message = document.createElement("div");
  message.className = `chat-message ${sender} ${extraClass}`.trim();

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  if (sender === "bot" && !extraClass.includes("typing")) {
    bubble.appendChild(formatBotReply(text));
  } else {
    bubble.textContent = text;
  }

  message.appendChild(bubble);

  if (sender === "user" && attachments.length) {
    const attachmentList = document.createElement("div");
    attachmentList.className = "message-attachments";
    attachmentList.replaceChildren(...attachments.map((attachment) => renderAttachmentPreview(attachment)));
    bubble.appendChild(attachmentList);
  }

  chatMessages.appendChild(message);
  scrollChatToBottom();
  updateEmptyState();
  return message;
}

function updateBotMessage(message, text, options = {}) {
  const bubble = message.querySelector(".chat-bubble");

  if (!bubble) {
    return;
  }

  bubble.replaceChildren(formatBotReply(text));
  message.dataset.reply = text;

  if (options.sourcePrompt) {
    message.dataset.sourcePrompt = options.sourcePrompt;
  }

  if (options.actions) {
    addReplyActions(message);
  }

  scrollChatToBottom();
  updateEmptyState();
}

function addReplyActions(message) {
  const bubble = message.querySelector(".chat-bubble");

  if (!bubble) {
    return;
  }

  message.querySelectorAll(".chat-reply-actions").forEach((actions) => actions.remove());

  const actions = document.createElement("div");
  actions.className = "chat-reply-actions";
  actions.replaceChildren(
    createActionButton("Copy", "copy", copyIconSvg()),
    createActionButton("Regenerate", "regenerate", regenerateIconSvg())
  );
  bubble.appendChild(actions);
}

function createActionButton(label, action, icon) {
  const button = document.createElement("button");
  button.className = "chat-reply-action";
  button.type = "button";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = icon;
  return button;
}

function formatBotReply(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-rendered";

  const rawText = String(text || "").replace(/\r\n?/g, "\n");
  const { source, mathBlocks } = extractMathBlocks(rawText);
  const html = window.marked
    ? window.marked.parse(source, { breaks: true, gfm: true })
    : fallbackMarkdown(source);

  wrapper.innerHTML = window.DOMPurify
    ? window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "a", "blockquote", "br", "code", "del", "div", "em", "h1", "h2", "h3",
        "h4", "hr", "li", "ol", "p", "pre", "span", "strong", "table", "tbody",
        "td", "th", "thead", "tr", "ul", "input", "h5", "h6"
      ],
      ALLOWED_ATTR: ["class", "href", "rel", "target", "type", "checked", "disabled", "start", "align"]
    })
    : fallbackMarkdown(source);

  wrapper.querySelectorAll("input").forEach((input) => {
    if (input.type !== "checkbox") {
      input.remove();
    } else {
      input.disabled = true;
    }
  });

  restoreMathBlocks(wrapper, mathBlocks);
  highlightCodeBlocks(wrapper);
  addCodeCopyButtons(wrapper);
  polishRenderedLinks(wrapper);
  return wrapper;
}

function highlightCodeBlocks(container) {
  container.querySelectorAll("pre code").forEach((code) => {
    if (window.hljs) {
      try {
        window.hljs.highlightElement(code);
      } catch {
        // Unknown language labels should not prevent the reply from rendering.
      }

      if (code.querySelector(".hljs-keyword, .hljs-string, .hljs-number, .hljs-title, .hljs-built_in")) {
        return;
      }
    }

    fallbackHighlightCode(code);
  });
}

function fallbackHighlightCode(code) {
  const source = code.textContent;
  const language = [...code.classList].find((className) => className.startsWith("language-"))?.slice(9) || "";

  if (!/python|py/i.test(language) && !/\b(def|return|import|for|while|if|elif|else|class|print)\b/.test(source)) {
    return;
  }

  const protectedPieces = [];
  const protect = (html) => {
    const token = `%%STEVEGPT_SYNTAX_${protectedPieces.length}%%`;
    protectedPieces.push(html);
    return token;
  };

  let highlighted = escapeHtml(source)
    .replace(/(&quot;.*?&quot;|&#039;.*?&#039;)/g, (match) => protect(`<span class="syntax-string">${match}</span>`))
    .replace(/(#.*)$/gm, (match) => protect(`<span class="syntax-comment">${match}</span>`));

  highlighted = highlighted
    .replace(/\b(def|return|import|from|as|for|while|if|elif|else|class|in|not|and|or|None|True|False)\b/g, "<span class=\"syntax-keyword\">$1</span>")
    .replace(/\b([A-Za-z_]\w*)(?=\()/g, "<span class=\"syntax-function\">$1</span>")
    .replace(/\b(\d+(?:\.\d+)?)\b/g, "<span class=\"syntax-number\">$1</span>");

  code.innerHTML = highlighted.replace(/%%STEVEGPT_SYNTAX_(\d+)%%/g, (_, index) => protectedPieces[Number(index)] || "");
}

function addCodeCopyButtons(container) {
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.closest(".code-frame")) {
      return;
    }

    const code = pre.querySelector("code");

    if (!code) {
      return;
    }

    const button = document.createElement("button");
    button.className = "code-copy";
    button.type = "button";
    button.setAttribute("aria-label", "Copy code");
    button.title = "Copy code";
    button.innerHTML = copyIconSvg();
    button.addEventListener("click", async () => {
      try {
        await copyText(code.textContent || "");
        button.classList.add("is-done");
        button.innerHTML = checkIconSvg();
        setTimeout(() => {
          button.classList.remove("is-done");
          button.innerHTML = copyIconSvg();
        }, 900);
      } catch {
        button.classList.remove("is-done");
      }
    });

    const frame = document.createElement("div");
    frame.className = "code-frame";
    pre.parentNode.insertBefore(frame, pre);
    frame.append(pre, button);

    updateCodeFrameScrollState(frame, pre);
    requestAnimationFrame(() => updateCodeFrameScrollState(frame, pre));
    pre.addEventListener("scroll", () => updateCodeFrameScrollState(frame, pre), { passive: true });
  });
}

function updateCodeFrameScrollState(frame, pre) {
  const maxScroll = pre.scrollWidth - pre.clientWidth;
  const scrollLeft = pre.scrollLeft;
  frame.classList.toggle("can-scroll-left", scrollLeft > 1);
  frame.classList.toggle("can-scroll-right", maxScroll - scrollLeft > 1);
}


function extractMathBlocks(text) {
  const mathBlocks = [];
  const tokenPrefix = "STEVEGPTMATH" + crypto.randomUUID().replaceAll("-", "");
  // Match code first so dollar signs and LaTeX examples stay literal there.
  const source = text.replace(/^[ \t]{0,3}(\x60{3,}|~{3,})[^\n]*(?:\n[\s\S]*?^[ \t]{0,3}\1[ \t]*(?=\n|$)|[\s\S]*$)|(?:^(?: {4}|\t)[^\n]*(?:\n|$))+|(\x60+)[\s\S]*?\2|(?<!\\)\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<![\\$])\$[^\n$]+?\$(?!\$)/gm, (match) => {
    if (/^[ \t]*[\x60~]|^(?: {4}|\t)/.test(match)) {
      return match;
    }
    const token = tokenPrefix + mathBlocks.length + "END";
    let formula = match;
    let display = false;

    if (match.startsWith("$$")) {
      display = true;
      formula = match.slice(2, -2);
    } else if (match.startsWith("\\[")) {
      display = true;
      formula = match.slice(2, -2);
    } else if (match.startsWith("\\(")) {
      formula = match.slice(2, -2);
    } else if (match.startsWith("$")) {
      formula = match.slice(1, -1);
      if (/^\s|\s$/.test(formula)) {
        return match;
      }
    }

    mathBlocks.push({ token, formula: formula.trim(), display });
    return display ? "\n\n" + token + "\n\n" : token;
  });

  return { source, mathBlocks };
}

function restoreMathBlocks(container, mathBlocks) {
  mathBlocks.forEach(({ token, formula, display }) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const matches = [];

    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement.closest("pre, code") && walker.currentNode.nodeValue.includes(token)) {
        matches.push(walker.currentNode);
      }
    }

    matches.forEach((node) => {
      const pieces = node.nodeValue.split(token);
      const fragment = document.createDocumentFragment();

      pieces.forEach((piece, index) => {
        if (piece) {
          fragment.appendChild(document.createTextNode(piece));
        }

        if (index < pieces.length - 1) {
          fragment.appendChild(renderMath(formula, display));
        }
      });

      node.parentNode.replaceChild(fragment, node);
    });
  });
}

function renderMath(formula, display) {
  const element = document.createElement("span");
  element.className = display ? "math-block" : "math-inline";

  if (window.katex) {
    try {
      window.katex.render(formula, element, {
        displayMode: display,
        throwOnError: true,
        strict: "ignore",
        trust: false,
        maxExpand: 1000,
        maxSize: 20
      });
      return element;
    } catch {
      // Keep a readable fallback if KaTeX rejects the input.
    }
  }

  element.textContent = display ? `$$${formula}$$` : `$${formula}$`;
  return element;
}

function polishRenderedLinks(container) {
  container.querySelectorAll("a").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
}

function fallbackMarkdown(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getLocalReply(message) {
  const normalized = message.toLowerCase();
  const match = localReplies.find((reply) => (
    reply.keywords.some((keyword) => normalized.includes(keyword))
  ));

  return match?.response || "That is interesting. Tell me a little more, and I will try to keep up.";
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function getBotReply(message, onChunk = () => {}, attachments = []) {
  if (!CHAT_API_ENDPOINT) {
    const localReply = getLocalReply(message);
    onChunk(localReply);
    return { reply: localReply };
  }

  const timeoutId = setTimeout(() => activeRequestController?.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CHAT_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        messages: conversation,
        attachments: serializeAttachments(attachments)
      }),
      signal: activeRequestController?.signal
    });

    if (!response.ok) {
      throw new Error("Chat request failed.");
    }

    if (response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
      return await readReplyStream(response, onChunk);
    }

    const data = await response.json();
    const reply = data.reply || getLocalReply(message);
    onChunk(reply);
    return {
      reply
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readReplyStream(response, onChunk = () => {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullReply = "";

  function handlePayload(payload) {
    if (!payload || payload === "[DONE]") {
      return;
    }

    try {
      const data = JSON.parse(payload);

      const chunk = data.delta || data.reply || "";

      if (chunk) {
        fullReply += chunk;
        onChunk(fullReply);
      }
    } catch {
      fullReply += payload;
      onChunk(fullReply);
    }
  }

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      handlePayload(payload);
    }
  }

  if (buffer.trim().startsWith("data:")) {
    handlePayload(buffer.trim().slice(5).trim());
  }

  return {
    reply: fullReply.trim()
  };
}

function stopActiveResponse() {
  if (!activeRequestController) {
    return;
  }

  activeRequestController.abort();
  activeRequestController = null;
  activeRequestId += 1;

  activeReplyMessage?.classList.remove("streaming");
  activeReplyMessage = null;

  chatInput.disabled = false;
  if (chatAttach) {
    chatAttach.disabled = false;
  }
  setSubmitButtonMode("send");
  chatInput.focus();
}

async function runReply(prompt, messageElement, replaceExisting = false, attachments = []) {
  activeRequestController?.abort();
  activeRequestController = new AbortController();
  const requestId = ++activeRequestId;

  chatInput.disabled = true;
  if (chatAttach) {
    chatAttach.disabled = true;
  }
  setSubmitButtonMode("stop");
  activeReplyMessage = messageElement;
  messageElement.classList.add("streaming");

  if (replaceExisting) {
    updateBotMessage(messageElement, "");
  }

  try {
    const { reply } = await getBotReply(prompt, (partialReply) => {
      if (requestId === activeRequestId) {
        updateBotMessage(messageElement, partialReply, { sourcePrompt: prompt });
      }
    }, attachments);

    if (requestId !== activeRequestId) {
      return;
    }

    const finalReply = reply || getLocalReply(prompt);

    updateBotMessage(messageElement, finalReply, {
      sourcePrompt: prompt,
      actions: true
    });
    replaceExisting
      ? replaceConversationReply(prompt, finalReply)
      : appendConversation("assistant", finalReply, prompt);
  } catch (error) {
    if (error.name === "AbortError") {
      const hasReplyText = Boolean((messageElement.dataset.reply || messageElement.textContent || "").trim());

      if (!hasReplyText) {
        messageElement.remove();
        updateEmptyState();
      }

      return;
    }

    const localReply = getLocalReply(prompt);
    updateBotMessage(messageElement, localReply, {
      sourcePrompt: prompt,
      actions: true
    });
    replaceExisting
      ? replaceConversationReply(prompt, localReply)
      : appendConversation("assistant", localReply, prompt);
  } finally {
    if (requestId === activeRequestId) {
      activeRequestController = null;
      activeReplyMessage = null;
      messageElement.classList.remove("streaming");

      chatInput.disabled = false;
      if (chatAttach) {
        chatAttach.disabled = false;
      }
      setSubmitButtonMode("send");
      chatInput.focus();
    }
  }
}

function loadConversationHistory() {
  let savedHistory = [];

  try {
    savedHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
  } catch {
    savedHistory = [];
  }

  if (!Array.isArray(savedHistory) || !savedHistory.length) {
    updateEmptyState();
    return;
  }

  conversation.length = 0;
  chatMessages.replaceChildren();

  savedHistory
    .filter((item) => ["user", "assistant"].includes(item?.role) && item.content)
    .forEach((item) => {
      const role = item.role === "user" ? "user" : "assistant";
      const message = addMessage(String(item.content), role === "user" ? "user" : "bot");

      if (role === "assistant") {
        updateBotMessage(message, String(item.content), {
          sourcePrompt: item.sourcePrompt || "",
          actions: Boolean(item.sourcePrompt)
        });
      }

      conversation.push({
        role,
        content: String(item.content),
        ...(item.sourcePrompt ? { sourcePrompt: String(item.sourcePrompt) } : {})
      });
    });

  updateEmptyState();
}

chatAttach?.addEventListener("click", () => {
  chatUpload?.click();
});

chatUpload?.addEventListener("change", async () => {
  await handleSelectedFiles(chatUpload.files || []);
  chatUpload.value = "";
});

chatInput.addEventListener("paste", handlePastedFiles);

function resizeComposer() {
  const scrollTop = chatInput.scrollTop;
  chatInput.style.height = "auto";
  const style = getComputedStyle(chatInput);
  const minHeight = parseFloat(style.minHeight);
  const maxHeight = parseFloat(style.maxHeight);
  chatInput.style.height = Math.min(maxHeight, Math.max(minHeight, chatInput.scrollHeight)) + "px";
  chatInput.scrollTop = scrollTop;
  const bottomSpace = chatForm.offsetHeight + 24;
  chatMessages.style.paddingBottom = bottomSpace + "px";
  chatShell.style.scrollPaddingBottom = bottomSpace + "px";
}

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    chatForm.requestSubmit(submitButton);
  }
});

window.addEventListener("resize", () => {
  resizeComposer();
  chatMessages.querySelectorAll(".code-frame").forEach((frame) => {
    updateCodeFrameScrollState(frame, frame.querySelector("pre"));
  });
}, { passive: true });

new ResizeObserver(resizeComposer).observe(chatForm);

attachmentTray?.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".attachment-remove");

  if (!removeButton) {
    return;
  }

  pendingAttachments = pendingAttachments.filter((attachment) => (
    attachment.id !== removeButton.dataset.attachmentId
  ));
  renderAttachmentTray();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (activeRequestController) {
    stopActiveResponse();
    return;
  }

  const message = chatInput.value.trim();
  const attachments = pendingAttachments.slice();

  if (!message && !attachments.length) {
    return;
  }

  const attachmentSummary = getAttachmentSummary(attachments);
  const imageOnlyMessage = !message && attachments.length && attachments.every((attachment) => attachment.kind === "image");
  const displayMessage = message || (imageOnlyMessage ? "" : `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`);
  const historyMessage = [message, attachmentSummary].filter(Boolean).join("\n");
  const prompt = message || `Please look at the attached file(s): ${attachmentSummary}`;

  chatInput.value = "";
  resizeComposer();
  pendingAttachments = [];
  renderAttachmentTray();
  updateEmptyState();
  addMessage(displayMessage, "user", "", attachments);
  appendConversation("user", historyMessage);

  await runReply(prompt, addMessage("", "bot", "streaming"), false, attachments);
});

chatClear?.addEventListener("click", () => {
  activeRequestController?.abort();
  activeRequestController = null;
  activeReplyMessage = null;
  activeRequestId += 1;
  conversation.length = 0;
  localStorage.removeItem(CHAT_HISTORY_KEY);
  chatMessages.replaceChildren();
  chatMessages.appendChild(chatEmptyState);
  pendingAttachments = [];
  renderAttachmentTray();
  updateEmptyState();

  chatInput.disabled = false;
  if (chatAttach) {
    chatAttach.disabled = false;
  }
  setSubmitButtonMode("send");
  chatInput.focus();
});

chatMessages.addEventListener("click", async (event) => {
  const button = event.target.closest(".chat-reply-action");

  if (!button) {
    return;
  }

  const message = button.closest(".chat-message.bot");

  if (!message) {
    return;
  }

  if (button.dataset.action === "copy") {
    try {
      await copyText(message.dataset.reply || "");
      button.classList.add("is-done");
      setTimeout(() => button.classList.remove("is-done"), 900);
    } catch {
      button.classList.remove("is-done");
    }
  }

  if (button.dataset.action === "regenerate") {
    const prompt = message.dataset.sourcePrompt;

    if (prompt) {
      pruneChatAfterMessage(message);
      await runReply(prompt, message, true);
    }
  }
});

chatInput.addEventListener("input", () => {
  resizeComposer();
  updateEmptyState();
});

// Retire legacy restriction state without deleting conversation history.
try {
  localStorage.removeItem("stevegptAntiSteveWarnings");
  localStorage.removeItem("stevegptBannedUntil");
  localStorage.removeItem("stevegptBanSeen");
} catch {
  // Storage may be unavailable; restrictions are no longer enforced regardless.
}

loadConversationHistory();
setSubmitButtonMode("send");
updateEmptyState();
resizeComposer();
