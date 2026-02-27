(() => {
    const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;
    const socket = io(baseUrl, { withCredentials: true });

    let currentUser = null;
    let currentConv = null;
    let allMessages = []; // messages for current conv
    let currentOtherId = null;
    let currentOtherName = null;

    const conversationsEl = document.getElementById('conversations');
    const messagesEl = document.getElementById('messages');
    const chatTitle = document.getElementById('chatTitle');
    const chatStatus = document.getElementById('chatStatus');
    const imageModal = document.getElementById('imageModal');
    const imageModalImg = document.getElementById('imageModalImg');
    const imageModalClose = document.getElementById('imageModalClose');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const attachBtn = document.getElementById('attachBtn');
    const imageInput = document.getElementById('imageInput');
    const emojiBtn = document.getElementById('emojiBtn');
    const convMenuBtn = document.getElementById('convMenuBtn');
    const convMenu = document.getElementById('convMenu');
    const deleteConvBtn = document.getElementById('deleteConvBtn');
    const searchConvs = document.getElementById('searchConvs');
    const searchInConv = document.getElementById('searchInConv');

    async function init() {
        const r = await fetch(`${baseUrl}/api/auth/status`, { credentials: 'include' });
        const data = await r.json();
        if (!data.loggedIn) {
            window.location.href = `${baseUrl}/user/login.html`;
            return;
        }
        currentUser = data.user;
        socket.emit('register', currentUser.id);
        socket.on('receive_message', onIncomingMessage);
        socket.on('message_sent', onMessageSent);
        socket.on('message_seen', onMessageSeen);
        socket.on('reaction', onReaction);
        // user online/offline updates
        socket.on('user_status', (s) => {
            if (!currentOtherId) return;
            if (String(s.userId) !== String(currentOtherId)) return;
            if (s.status === 'online') {
                chatStatus.textContent = 'Đang hoạt động';
            } else {
                chatStatus.textContent = s.lastSeen ? formatRelative(new Date(s.lastSeen)) : 'Không hoạt động';
            }
        });

        // Load convos first, then open conv param if present. This avoids timing issues
        // where placeholder or messages get overwritten when load/order is indeterminate.
        const convs = await loadConversations();

        // If URL contains ?conv=ID open it (after convs loaded)
        const params = new URLSearchParams(window.location.search);
        const convParam = params.get('conv');
        if (convParam) {
            const convId = parseInt(convParam, 10);
            if (!isNaN(convId)) {
                const found = convs && convs.find && convs.find(c => c.id === convId);
                openConversation(convId, found ? (found.title || ('Hội thoại #' + convId)) : undefined);
                return;
            }
        }

        // no conv selected -> show placeholder
        if (!currentConv) showNoConversationPlaceholder();
    }

    async function loadConversations() {
        const r = await fetch(`${baseUrl}/api/conversations`, { credentials: 'include' });
        const convs = await r.json();
        renderConversations(convs);
        return convs;
    }

    function renderConversations(convs) {
        conversationsEl.innerHTML = '';
        convs.forEach(c => {
            const el = document.createElement('div');
            el.className = 'conv';
            el.dataset.id = c.id;
            el.innerHTML = `<div class="avatar">C</div><div class="meta"><div class="name">${c.title || ('Hội thoại #' + c.id)}</div><div class="small">${c.last_message || ''}</div></div><div class="small">${c.last_updated ? new Date(c.last_updated).toLocaleString() : ''}</div>`;
            el.addEventListener('click', () => openConversation(c.id, c.title));
            conversationsEl.appendChild(el);
        });
    }

    async function openConversation(convId, title) {
        currentConv = convId;
        chatTitle.textContent = title || ('Hội thoại #' + convId);
        chatStatus.textContent = 'Đang tải...';
        socket.emit('join', convId);
        const r = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, { credentials: 'include' });
        const msgs = await r.json();
        allMessages = msgs;
        renderMessages(msgs);
        chatStatus.textContent = 'Đã kết nối';
        autoScroll();
        // enable input controls
        if (messageInput) messageInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (attachBtn) attachBtn.disabled = false;
        if (emojiBtn) emojiBtn.disabled = false;
        if (convMenuBtn) convMenuBtn.disabled = false;

        // highlight selected conv in sidebar
        Array.from(conversationsEl.children).forEach(el => {
            el.style.background = (String(el.dataset.id) === String(currentConv)) ? '#0b1220' : '';
        });

        // fetch participants to determine the other user's name
        try {
            const pr = await fetch(`${baseUrl}/api/conversations/${convId}/participants`, { credentials: 'include' });
            const parts = await pr.json();
            if (Array.isArray(parts)) {
                const other = parts.find(p => p.id !== currentUser.id);
                if (other) {
                    currentOtherId = other.id;
                    currentOtherName = other.username;
                    chatTitle.textContent = other.username || chatTitle.textContent;
                } else {
                    currentOtherId = null;
                    currentOtherName = null;
                    chatTitle.textContent = title || chatTitle.textContent;
                }
            }
        } catch (err) {
            currentOtherId = null; currentOtherName = null;
        }
    }

    function renderMessages(msgs) {
        messagesEl.innerHTML = '';
        if (!msgs || msgs.length === 0) {
            const p = document.createElement('div');
            p.className = 'no-conv-placeholder';
            p.textContent = 'Chưa có tin nhắn trong cuộc trò chuyện này.';
            messagesEl.appendChild(p);
            return;
        }
        msgs.forEach(m => {
            appendMessage(m);
        });
    }

    function showNoConversationPlaceholder() {
        messagesEl.innerHTML = '';
        const p = document.createElement('div');
        p.className = 'no-conv-placeholder';
        p.textContent = 'Hãy chọn người mà bạn muốn chat → chọn một cuộc trò chuyện bên trái để bắt đầu.';
        messagesEl.appendChild(p);
        chatTitle.textContent = 'Chưa có cuộc trò chuyện được chọn';
        chatStatus.textContent = '—';
        // disable input bar until a conversation is opened
        if (messageInput) messageInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (attachBtn) attachBtn.disabled = true;
        if (emojiBtn) emojiBtn.disabled = true;
        if (convMenuBtn) convMenuBtn.disabled = true;
        currentOtherId = null; currentOtherName = null;
    }

    function appendMessage(m) {
        // normalize fields (socket payloads may use camelCase or snake_case)
        const senderId = m.sender_id || m.senderId || m.sender;
        const text = m.text || m.message_text || m.messageText || '';
        const created = m.created_at || m.createdAt || new Date().toISOString();
        const seen = m.seen || m.is_read || false;

        const el = document.createElement('div');
        el.className = 'msg ' + (senderId === currentUser.id ? 'me' : '');
        el.dataset.id = m.id;
        // build inner HTML with optional image
        const displayName = (senderId === currentUser.id) ? 'Bạn' : (currentOtherName || chatTitle.textContent || 'Người khác');
        let inner = `<div class="meta"><strong>${escapeHtml(displayName)}</strong> · <span class="small">${new Date(created).toLocaleTimeString()}</span></div>`;
        if (text) inner += `<div class="text">${escapeHtml(text)}</div>`;
        // image fields may be image_url or imageUrl
        const imageUrl = m.image_url || m.imageUrl || m.image || null;
        if (imageUrl) {
            inner += `<img src="${imageUrl}" class="inline-image" alt="img" />`;
        }
        if (seen) inner += '<div class="small">Đã xem</div>';
        el.innerHTML = inner;
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); showMessageOptions(m, el); });
        messagesEl.appendChild(el);

        // add click to open image in new tab
        if (imageUrl) {
            const imgEl = el.querySelector('img.inline-image');
            if (imgEl) imgEl.addEventListener('click', () => {
                // open modal and show image at ~2/3 viewport width
                if (imageModal && imageModalImg) {
                    imageModal.style.display = 'flex';
                    imageModalImg.src = imageUrl;
                    // prevent background scroll
                    document.body.style.overflow = 'hidden';
                } else {
                    window.open(imageUrl, '_blank');
                }
            });
        }
    }

    function onIncomingMessage(msg) {
        // normalize conversation id which might be snake_case or camelCase
        const convId = msg.conversation_id || msg.conversationId || msg.convId || null;
        const senderId = msg.sender_id || msg.senderId || msg.sender || null;

        // If it's part of current conv, show; otherwise show badge by reloading conv list
        if (currentConv && convId && convId === currentConv) {
            appendMessage(msg);
            autoScroll();
            // send read receipt after short delay
            setTimeout(() => socket.emit('read_message', { messageId: msg.id, senderId: senderId, receiverId: currentUser.id }), 700);
        } else if (!currentConv && !convId) {
            // We have no conversation selected and server sent a message without conv id.
            // Do not append it into the UI because the user should explicitly pick a conversation first.
            console.log('Ignoring incoming direct message because no conversation is selected.', msg);
        } else {
            // reload conversations to update badges
            loadConversations();
            console.log('Tin nhắn mới từ hội thoại', convId || '(direct)');
        }
    }

    function onMessageSent(msg) {
        appendMessage(msg);
        autoScroll();
    }

    function onMessageSeen(info) {
        const el = messagesEl.querySelector(`[data-id="${info.messageId}"]`);
        if (el) {
            const s = document.createElement('div'); s.className = 'small'; s.textContent = 'Đã xem'; el.appendChild(s);
        }
    }

    function onReaction(data) {
        // show reaction inline (simple)
        const el = messagesEl.querySelector(`[data-id="${data.messageId}"]`);
        if (el) { const r = document.createElement('div'); r.className = 'small'; r.textContent = '❤ ' + data.emoji; el.appendChild(r); }
    }

    sendBtn.addEventListener('click', (e) => { e.preventDefault(); sendMessage(); });
    messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
    attachBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
            const fd = new FormData();
            fd.append('image', file);
            const up = await fetch(`${baseUrl}/api/upload-image`, { method: 'POST', credentials: 'include', body: fd });
            const data = await up.json();
            if (data && data.url) {
                // send message with imageUrl (relative URL)
                sendMessage(data.url);
            } else {
                alert('Không upload được ảnh');
            }
        } catch (err) {
            console.error('Upload error', err);
            alert('Lỗi upload');
        }
    });

    // Inline emoji picker (local) - simple grid to avoid CDN/library issues
    const emojiList = ['😊', '😂', '😍', '😅', '👍', '🙏', '🔥', '🥰', '😭', '😉', '😎', '🤔', '😴', '😡', '🎉', '🙌', '🤝', '🤩', '😬', '🤗'];
    let emojiPanel = null;

    function createEmojiPanel() {
        if (emojiPanel) return;
        emojiPanel = document.createElement('div');
        emojiPanel.style.position = 'absolute';
        emojiPanel.style.zIndex = '9999';
        emojiPanel.style.background = '#0b1220';
        emojiPanel.style.border = '1px solid #1f2937';
        emojiPanel.style.padding = '8px';
        emojiPanel.style.borderRadius = '8px';
        emojiPanel.style.display = 'grid';
        emojiPanel.style.gridTemplateColumns = 'repeat(6,28px)';
        emojiPanel.style.gap = '6px';
        emojiPanel.style.boxShadow = '0 8px 24px rgba(2,6,23,0.6)';

        emojiList.forEach(em => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = em;
            b.style.fontSize = '18px';
            b.style.width = '28px';
            b.style.height = '28px';
            b.style.borderRadius = '6px';
            b.style.border = 'none';
            b.style.background = 'transparent';
            b.style.cursor = 'pointer';
            b.addEventListener('click', () => {
                messageInput.value += em;
                messageInput.focus();
                hideEmojiPanel();
            });
            emojiPanel.appendChild(b);
        });

        document.body.appendChild(emojiPanel);

        // Click outside to close
        document.addEventListener('click', (ev) => {
            if (!emojiPanel) return;
            if (ev.target === emojiBtn || emojiBtn.contains(ev.target) || emojiPanel.contains(ev.target)) return;
            hideEmojiPanel();
        });
    }

    function positionPanel() {
        if (!emojiPanel) return;
        const rect = emojiBtn.getBoundingClientRect();
        const panelRect = emojiPanel.getBoundingClientRect();
        let left = rect.left;
        // keep inside viewport
        if (left + panelRect.width > window.innerWidth) left = window.innerWidth - panelRect.width - 8;
        let top = rect.top - panelRect.height - 8;
        if (top < 8) top = rect.bottom + 8;
        emojiPanel.style.left = left + 'px';
        emojiPanel.style.top = top + 'px';
    }

    function toggleEmojiPanel() {
        if (!emojiPanel || emojiPanel.style.display === 'none') {
            createEmojiPanel();
            emojiPanel.style.display = 'grid';
            // allow layout then position
            requestAnimationFrame(positionPanel);
        } else {
            hideEmojiPanel();
        }
    }

    function hideEmojiPanel() { if (emojiPanel) emojiPanel.style.display = 'none'; }

    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEmojiPanel(); });

    // Conversation header menu handlers
    if (convMenuBtn) {
        convMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!currentConv) return alert('Chưa chọn hội thoại');
            if (!convMenu) return;
            convMenu.style.display = (convMenu.style.display === 'flex') ? 'none' : 'flex';
        });
    }
    document.addEventListener('click', (ev) => {
        if (!convMenu) return;
        if (convMenu.style.display === 'none') return;
        if (ev.target === convMenuBtn || convMenu.contains(ev.target)) return;
        convMenu.style.display = 'none';
    });
    if (deleteConvBtn) {
        deleteConvBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentConv) return alert('Chưa chọn hội thoại');
            const ok = confirm('Bạn có chắc muốn xóa cuộc trò chuyện này?');
            if (!ok) return;
            try {
                const res = await fetch(`${baseUrl}/api/conversations/${currentConv}`, { method: 'DELETE', credentials: 'include' });
                if (res.ok) {
                    alert('Đã xóa cuộc trò chuyện');
                    currentConv = null;
                    allMessages = [];
                    showNoConversationPlaceholder();
                    await loadConversations();
                } else {
                    const t = await res.text();
                    alert('Không thể xóa: ' + t);
                }
            } catch (err) {
                console.error('Delete conv error', err);
                alert('Lỗi khi xóa');
            } finally {
                if (convMenu) convMenu.style.display = 'none';
            }
        });
    }

    // Modal close handlers
    function closeImageModal() {
        if (imageModal && imageModalImg) {
            imageModal.style.display = 'none';
            imageModalImg.src = '';
            document.body.style.overflow = '';
        }
    }
    if (imageModalClose) imageModalClose.addEventListener('click', closeImageModal);
    if (imageModal) imageModal.addEventListener('click', (ev) => { if (ev.target === imageModal) closeImageModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeImageModal(); });

    searchConvs.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        Array.from(conversationsEl.children).forEach(el => {
            const text = el.textContent.toLowerCase(); el.style.display = text.includes(q) ? 'flex' : 'none';
        });
    });

    searchInConv.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = allMessages.filter(m => (m.text || '').toLowerCase().includes(q));
        renderMessages(filtered);
    });

    function sendMessage(overrideImage) {
        if (!currentConv) return alert('Chưa chọn hội thoại');
        const text = messageInput.value.trim();
        if (!text && !overrideImage) return;
        const payload = { senderId: currentUser.id, receiverId: null, text: text, replyToId: null, imageUrl: overrideImage || null, conversationId: currentConv };
        socket.emit('send_message', payload);
        messageInput.value = '';
    }

    function autoScroll() { messagesEl.scrollTop = messagesEl.scrollHeight; }

    function formatRelative(dt) {
        const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
        if (diff < 60) return `${diff} giây trước`;
        const mins = Math.floor(diff / 60);
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        const days = Math.floor(hours / 24);
        return `${days} ngày trước`;
    }

    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c])); }

    function showMessageOptions(m, el) {
        const r = confirm('Trích dẫn tin nhắn này? (OK để reply)');
        if (r) { messageInput.value = '↪ "' + (m.text || '') + '" '; messageInput.focus(); }
    }

    init();
})();
