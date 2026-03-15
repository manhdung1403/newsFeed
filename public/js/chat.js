(() => {
    const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;
    const socket = io(baseUrl, { withCredentials: true });

    let currentUser = null;
    let currentConv = null;
    let allMessages = [];
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

    // ✅ Fix múi giờ: bỏ Z để JS không cộng thêm 7 tiếng
    function parseDate(str) {
        if (!str) return new Date();
        return new Date(String(str).replace('Z', '').replace(/\+\d{2}:\d{2}$/, ''));
    }

    // ✅ Hiển thị thời gian tương đối
    function formatRelative(dt) {
        if (!dt || isNaN(dt.getTime())) return 'không rõ';
        const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
        if (diff < 0) return 'vừa xong';
        if (diff < 60) return `${diff} giây trước`;
        const mins = Math.floor(diff / 60);
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        const days = Math.floor(hours / 24);
        return `${days} ngày trước`;
    }

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

        // ✅ Cập nhật trạng thái real-time khi user online/offline
        socket.on('user_status', (s) => {
            // Cập nhật header chat
            if (currentOtherId && String(s.userId) === String(currentOtherId)) {
                if (s.status === 'online') {
                    chatStatus.textContent = 'Đang hoạt động';
                } else {
                    chatStatus.textContent = s.lastSeen
                        ? 'Hoạt động ' + formatRelative(parseDate(s.lastSeen))
                        : 'Không hoạt động';
                }
            }
            // ✅ Cập nhật trạng thái trong sidebar
            Array.from(conversationsEl.children).forEach(el => {
                if (String(el.dataset.otherId) === String(s.userId)) {
                    const statusEl = el.querySelector('.other-status');
                    if (statusEl) {
                        if (s.status === 'online') {
                            statusEl.textContent = 'Đang hoạt động';
                            statusEl.style.color = '#34d399';
                        } else {
                            statusEl.textContent = s.lastSeen
                                ? 'Hoạt động ' + formatRelative(parseDate(s.lastSeen))
                                : 'Không hoạt động';
                            statusEl.style.color = '';
                        }
                    }
                }
            });
        });

        const convs = await loadConversations();

        const params = new URLSearchParams(window.location.search);
        const convParam = params.get('conv');
        if (convParam) {
            const convId = parseInt(convParam, 10);
            if (!isNaN(convId)) {
                const found = convs && convs.find && convs.find(c => c.id === convId);
                openConversation(convId, found ? (found.other_name || found.title || ('Hội thoại #' + convId)) : undefined);
                return;
            }
        }

        if (!currentConv) showNoConversationPlaceholder();
    }

    async function loadConversations() {
        const r = await fetch(`${baseUrl}/api/conversations`, { credentials: 'include' });
        const convs = await r.json();
        renderConversations(convs);
        return convs;
    }

    // ✅ Sidebar hiển thị tên + trạng thái hoạt động
    function renderConversations(convs) {
        conversationsEl.innerHTML = '';
        convs.forEach(c => {
            const el = document.createElement('div');
            el.className = 'conv';
            el.dataset.id = c.id;
            el.dataset.otherId = c.other_id || '';

            // Tính trạng thái
            let statusText = '';
            let statusColor = '#9ca3af';
            if (c.other_is_online) {
                statusText = 'Đang hoạt động';
                statusColor = '#34d399';
            } else if (c.other_last_seen) {
                statusText = 'Hoạt động ' + formatRelative(parseDate(c.other_last_seen));
            }

            const displayName = c.other_name || c.title || ('Hội thoại #' + c.id);

            el.innerHTML = `
                <div class="avatar">${displayName.charAt(0).toUpperCase()}</div>
                <div class="meta" style="flex:1;min-width:0">
                    <div class="name">${displayName}</div>
                    <div class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.last_message || ''}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div class="small other-status" style="color:${statusColor}">${statusText}</div>
                </div>`;

            el.addEventListener('click', () => openConversation(c.id, displayName));
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

        if (messageInput) messageInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (attachBtn) attachBtn.disabled = false;
        if (emojiBtn) emojiBtn.disabled = false;
        if (convMenuBtn) convMenuBtn.disabled = false;

        Array.from(conversationsEl.children).forEach(el => {
            el.style.background = (String(el.dataset.id) === String(currentConv)) ? '#0b1220' : '';
        });

        // ✅ Lấy participants, dùng is_online + last_seen để hiển thị trạng thái đúng
        try {
            const pr = await fetch(`${baseUrl}/api/conversations/${convId}/participants`, { credentials: 'include' });
            const parts = await pr.json();
            if (Array.isArray(parts)) {
                const other = parts.find(p => p.id !== currentUser.id);
                if (other) {
                    currentOtherId = other.id;
                    currentOtherName = other.username;
                    chatTitle.textContent = other.username || chatTitle.textContent;

                    if (other.is_online) {
                        chatStatus.textContent = 'Đang hoạt động';
                    } else if (other.last_seen) {
                        chatStatus.textContent = 'Hoạt động ' + formatRelative(parseDate(other.last_seen));
                    } else {
                        chatStatus.textContent = 'Chưa hoạt động';
                    }
                } else {
                    currentOtherId = null;
                    currentOtherName = null;
                    chatTitle.textContent = title || chatTitle.textContent;
                    chatStatus.textContent = 'Đã kết nối';
                }
            }
        } catch (err) {
            currentOtherId = null;
            currentOtherName = null;
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
        msgs.forEach(m => appendMessage(m));
    }

    function showNoConversationPlaceholder() {
        messagesEl.innerHTML = '';
        const p = document.createElement('div');
        p.className = 'no-conv-placeholder';
        p.textContent = 'Hãy chọn người mà bạn muốn chat → chọn một cuộc trò chuyện bên trái để bắt đầu.';
        messagesEl.appendChild(p);
        chatTitle.textContent = 'Chưa có cuộc trò chuyện được chọn';
        chatStatus.textContent = '—';
        if (messageInput) messageInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (attachBtn) attachBtn.disabled = true;
        if (emojiBtn) emojiBtn.disabled = true;
        if (convMenuBtn) convMenuBtn.disabled = true;
        currentOtherId = null;
        currentOtherName = null;
    }

    function appendMessage(m) {
        const senderId = m.sender_id || m.senderId || m.sender;
        const text = m.text || m.message_text || m.messageText || '';
        const created = m.created_at || m.createdAt || new Date();
        const seen = m.seen || m.is_read || false;

        const el = document.createElement('div');
        el.className = 'msg ' + (senderId === currentUser.id ? 'me' : '');
        el.dataset.id = m.id;

        const displayName = (senderId === currentUser.id) ? 'Bạn' : (currentOtherName || chatTitle.textContent || 'Người khác');
        let inner = `<div class="meta"><strong>${escapeHtml(displayName)}</strong> · <span class="small">${parseDate(created).toLocaleTimeString()}</span></div>`;
        if (text) inner += `<div class="text">${escapeHtml(text)}</div>`;

        const imageUrl = m.image_url || m.imageUrl || m.image || null;
        if (imageUrl) {
            inner += `<img src="${imageUrl}" class="inline-image" alt="img" />`;
        }
        if (seen) inner += '<div class="small">Đã xem</div>';
        el.innerHTML = inner;
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); showMessageOptions(m, el); });
        messagesEl.appendChild(el);

        if (imageUrl) {
            const imgEl = el.querySelector('img.inline-image');
            if (imgEl) imgEl.addEventListener('click', () => {
                if (imageModal && imageModalImg) {
                    imageModal.style.display = 'flex';
                    imageModalImg.src = imageUrl;
                    document.body.style.overflow = 'hidden';
                } else {
                    window.open(imageUrl, '_blank');
                }
            });
        }
    }

    function onIncomingMessage(msg) {
        const convId = msg.conversation_id || msg.conversationId || msg.convId || null;
        const senderId = msg.sender_id || msg.senderId || msg.sender || null;

        if (currentConv && convId && convId === currentConv) {
            appendMessage(msg);
            autoScroll();
            setTimeout(() => socket.emit('read_message', { messageId: msg.id, senderId: senderId, receiverId: currentUser.id }), 700);
        } else if (!currentConv && !convId) {
            console.log('Ignoring incoming direct message because no conversation is selected.', msg);
        } else {
            loadConversations();
        }
    }

    function onMessageSent(msg) {
        appendMessage(msg);
        autoScroll();
    }

    function onMessageSeen(info) {
        const el = messagesEl.querySelector(`[data-id="${info.messageId}"]`);
        if (el) {
            const s = document.createElement('div');
            s.className = 'small';
            s.textContent = 'Đã xem';
            el.appendChild(s);
        }
    }

    function onReaction(data) {
        const el = messagesEl.querySelector(`[data-id="${data.messageId}"]`);
        if (el) {
            const r = document.createElement('div');
            r.className = 'small';
            r.textContent = '❤ ' + data.emoji;
            el.appendChild(r);
        }
    }

    sendBtn.addEventListener('click', (e) => { e.preventDefault(); sendMessage(); });
    messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
    attachBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const fd = new FormData();
            fd.append('image', file);
            const up = await fetch(`${baseUrl}/api/upload-image`, { method: 'POST', credentials: 'include', body: fd });
            const data = await up.json();
            if (data && data.url) {
                sendMessage(data.url);
            } else {
                alert('Không upload được ảnh');
            }
        } catch (err) {
            console.error('Upload error', err);
            alert('Lỗi upload');
        }
    });

    // Emoji panel
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
            requestAnimationFrame(positionPanel);
        } else {
            hideEmojiPanel();
        }
    }

    function hideEmojiPanel() { if (emojiPanel) emojiPanel.style.display = 'none'; }

    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEmojiPanel(); });

    // Conversation menu
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

    // Image modal
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

    // Search
    searchConvs.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        Array.from(conversationsEl.children).forEach(el => {
            const text = el.textContent.toLowerCase();
            el.style.display = text.includes(q) ? 'flex' : 'none';
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
        const payload = {
            senderId: currentUser.id,
            receiverId: null,
            text: text,
            replyToId: null,
            imageUrl: overrideImage || null,
            conversationId: currentConv
        };
        socket.emit('send_message', payload);
        messageInput.value = '';
    }

    function autoScroll() { messagesEl.scrollTop = messagesEl.scrollHeight; }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;"
        }[c]));
    }

    function showMessageOptions(m, el) {
        const r = confirm('Trích dẫn tin nhắn này? (OK để reply)');
        if (r) {
            messageInput.value = '↪ "' + (m.text || '') + '" ';
            messageInput.focus();
        }
    }

    init();
})();