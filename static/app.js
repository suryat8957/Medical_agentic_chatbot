const $ = (id) => document.getElementById(id);

let history = [];
let imageData = null;
let recorder = null;
let audioChunks = [];
let cameraStream = null;
let lastAnswer = '';
let recognition = null;
let isRecognizing = false;

// Setup native browser Speech Recognition if available (100% free)
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRec();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecognizing = true;
    $('mic').textContent = '⏹ Stop recording';
  };

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    $('message').value = transcript;
  };

  recognition.onerror = (e) => {
    console.warn('Speech recognition error:', e.error);
    isRecognizing = false;
    $('mic').textContent = '🎤 Voice';
  };

  recognition.onend = () => {
    isRecognizing = false;
    $('mic').textContent = '🎤 Voice';
  };
}

const headers = () => {
  const h = {};
  const token = $('token').value.trim();
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
};

function renderMarkdown(md) {
  if (!md) return '';

  // Use marked.js if available
  if (window.marked && typeof window.marked.parse === 'function') {
    let parsed = window.marked.parse(md);
    parsed = parsed.replace(
      /(<p>.*?disclaimer:.*?<\/p>)/gis,
      '<div class="disclaimer-callout">$1</div>'
    );
    parsed = parsed.replace(
      /\[PDF p\.\s*(\d+)\]/gi,
      '<span class="cite-badge">PDF p. $1</span>'
    );
    return parsed;
  }

  // Built-in standalone fallback markdown parser
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Citations [PDF p. X]
  html = html.replace(/\[PDF p\.\s*(\d+)\]/gi, '<span class="cite-badge">PDF p. $1</span>');

  // Horizontal rules
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr class="bot-divider">');

  // Headings
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // Bold + Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*)
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // Bullet list items
  html = html.replace(/^\s*[\*\-]\s+(.*?)$/gm, '<li>$1</li>');

  // Numbered list items
  html = html.replace(/^\s*(\d+)\.\s+(.*?)$/gm, '<li class="numbered">$2</li>');

  // Wrap lists
  html = html.replace(/((?:<li(?: class="numbered")?>.*?<\/li>\s*)+)/gs, (match) => {
    if (match.includes('class="numbered"')) {
      return `<ol>${match}</ol>`;
    }
    return `<ul>${match}</ul>`;
  });

  // Paragraphs
  const blocks = html.split(/\n{2,}/);
  html = blocks
    .map((b) => {
      b = b.trim();
      if (!b) return '';
      if (
        b.startsWith('<h1') ||
        b.startsWith('<h2') ||
        b.startsWith('<h3') ||
        b.startsWith('<ul') ||
        b.startsWith('<ol') ||
        b.startsWith('<hr')
      ) {
        return b;
      }
      if (b.toLowerCase().includes('disclaimer:')) {
        return `<div class="disclaimer-callout"><p>${b}</p></div>`;
      }
      return `<p>${b.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return html;
}

function bubble(text, kind = 'bot', sources = []) {
  const el = document.createElement('article');
  el.className = kind;
  if (kind === 'bot') {
    el.innerHTML = renderMarkdown(text);
  } else {
    el.textContent = text;
  }
  if (sources.length) {
    const s = document.createElement('div');
    s.className = 'sources';
    s.innerHTML =
      '<span class="sources-title">Sources:</span> ' +
      sources
        .slice(0, 8)
        .map((x) =>
          x.type === 'pdf'
            ? `<span class="source-chip pdf"><span class="chip-icon">📄</span> PDF p. ${x.page}</span>`
            : `<a href="${x.url}" target="_blank" rel="noopener noreferrer" class="source-chip web"><span class="chip-icon">🔗</span> ${x.title || x.url}</a>`
        )
        .join(' ');
    el.appendChild(s);
  }
  $('messages').appendChild(el);
  $('messages').scrollTop = $('messages').scrollHeight;
  return el;
}

async function check() {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    $('status').textContent = d.configured
      ? '● Connected (' + (d.llm || 'Gemini') + ')'
      : '⚠ Configure GEMINI_API_KEY';
  } catch {
    $('status').textContent = '● Server offline';
  }
}
check();

function setImage(file) {
  if (!file) return;
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 5e6
  ) {
    alert('Use PNG/JPEG/WebP under 5MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageData = reader.result;
    $('thumbnail').src = imageData;
    $('preview').hidden = false;
  };
  reader.readAsDataURL(file);
}

$('image').addEventListener('change', (e) => setImage(e.target.files[0]));
$('remove').onclick = () => {
  imageData = null;
  $('preview').hidden = true;
  $('image').value = '';
};

$('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = $('message').value.trim();
  if (!message) return;
  const prior = history.slice(-8);
  bubble(message, 'user');
  $('message').value = '';
  $('send').disabled = true;
  const pending = bubble('Thinking…');
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        history: prior,
        image_data: imageData,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Request failed');
    pending.innerHTML = renderMarkdown(d.answer);
    lastAnswer = d.answer;
    if (d.sources?.length) {
      const src = document.createElement('div');
      src.className = 'sources';
      src.innerHTML =
        '<span class="sources-title">Sources:</span> ' +
        d.sources
          .slice(0, 8)
          .map((x) =>
            x.type === 'pdf'
              ? `<span class="source-chip pdf"><span class="chip-icon">📄</span> PDF p. ${x.page}</span>`
              : `<a href="${x.url}" target="_blank" rel="noopener noreferrer" class="source-chip web"><span class="chip-icon">🔗</span> ${x.title || x.url}</a>`
          )
          .join(' ');
      pending.appendChild(src);
    }
    history.push(
      { role: 'user', content: message },
      { role: 'assistant', content: d.answer }
    );
    $('remove').click();
  } catch (err) {
    pending.textContent = 'Error: ' + err.message;
  } finally {
    $('send').disabled = false;
    $('messages').scrollTop = $('messages').scrollHeight;
  }
});

$('mic').onclick = async () => {
  // Use native browser speech recognition if supported
  if (recognition) {
    if (isRecognizing) {
      recognition.stop();
    } else {
      recognition.start();
    }
    return;
  }

  // Fallback to MediaRecorder & backend transcribe
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    $('mic').textContent = '🎤 Voice';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => audioChunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunks, { type: recorder.mimeType });
      const data = new FormData();
      data.append('file', blob, 'voice.webm');
      $('mic').disabled = true;
      try {
        const r = await fetch('/api/transcribe', {
          method: 'POST',
          headers: headers(),
          body: data,
        });
        const out = await r.json();
        if (!r.ok) throw Error(out.detail);
        $('message').value = out.text;
      } catch (e) {
        alert(e.message);
      } finally {
        $('mic').disabled = false;
      }
    };
    recorder.start();
    $('mic').textContent = '⏹ Stop recording';
  } catch (e) {
    alert('Microphone unavailable: ' + e.message);
  }
};

$('listen').onclick = async () => {
  if (!lastAnswer) return alert('Ask a question first');

  // Try free native browser speech synthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const cleanText = lastAnswer
      .replace(/\[PDF p\.\d+\]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    return;
  }

  // Fallback to /api/speak
  $('listen').disabled = true;
  try {
    const r = await fetch('/api/speak', {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: lastAnswer }),
    });
    if (!r.ok) throw Error('Speech unavailable');
    const url = URL.createObjectURL(await r.blob());
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch (e) {
    alert(e.message);
  } finally {
    $('listen').disabled = false;
  }
};

$('camera').onclick = async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    $('video').srcObject = cameraStream;
    $('video').hidden = false;
    $('cameraActions').hidden = false;
  } catch (e) {
    alert('Camera unavailable: ' + e.message);
  }
};

$('closeCamera').onclick = () => {
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  $('video').hidden = true;
  $('cameraActions').hidden = true;
};

$('snap').onclick = () => {
  const v = $('video');
  const c = $('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(
    (b) => setImage(new File([b], 'camera.jpg', { type: 'image/jpeg' })),
    'image/jpeg',
    0.85
  );
  $('closeCamera').click();
};