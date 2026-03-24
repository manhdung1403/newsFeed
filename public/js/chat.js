(() => {
    const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:'
        ? 'http://localhost:3000'
        : window.location.origin;

    const socket = io(baseUrl, { withCredentials: true });

    let currentUser = null;
    let currentConv = null;
    let currentIsGroup = false;
    let allMessages = [];
    let currentOtherId = null;
    let currentOtherName = null;
    let replyTo = null;           // { id, senderName, text }
    let currentContacts = [];     // list of { id, username } from conversations
    const REPLY_DRAFTS_KEY = 'chat_reply_drafts_v1';
    let replyDrafts = {};
    try {
        replyDrafts = JSON.parse(localStorage.getItem(REPLY_DRAFTS_KEY) || '{}');
    } catch { /* localStorage might be blocked */ }

    // Quick emoji choices for reactions
    const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

    // Input-bar emojis
    const EMOJI_LIST = ['😊','😂','😍','😅','👍','🙏','🔥','🥰','😭','😉','😎','🤔','😴','😡','🎉','🙌','🤝','🤩','😬','🤗'];

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const conversationsEl   = document.getElementById('conversations');
    const messagesEl        = document.getElementById('messages');
    const chatTitle         = document.getElementById('chatTitle');
    const chatStatus        = document.getElementById('chatStatus');
    const imageModal        = document.getElementById('imageModal');
    const imageModalImg     = document.getElementById('imageModalImg');
    const imageModalClose   = document.getElementById('imageModalClose');
    const messageInput      = document.getElementById('messageInput');
    const sendBtn           = document.getElementById('sendBtn');
    const attachBtn         = document.getElementById('attachBtn');
    const imageInput        = document.getElementById('imageInput');
    const emojiBtn          = document.getElementById('emojiBtn');
    const convMenuBtn       = document.getElementById('convMenuBtn');
    const convMenu          = document.getElementById('convMenu');
    const deleteConvBtn     = document.getElementById('deleteConvBtn');
    const searchConvs       = document.getElementById('searchConvs');
    const searchInConv      = document.getElementById('searchInConv');
    const replyBar          = document.getElementById('replyBar');
    const replyToName       = document.getElementById('replyToName');
    const replyToText       = document.getElementById('replyToText');
    const cancelReplyBtn    = document.getElementById('cancelReplyBtn');
    const createGroupModal  = document.getElementById('createGroupModal');
    const createGroupOpenBtn= document.getElementById('createGroupOpenBtn');
    const cancelGroupBtn    = document.getElementById('cancelGroupBtn');
    const createGroupBtn    = document.getElementById('createGroupBtn');
    const groupNameInput    = document.getElementById('groupNameInput');
    const groupContactList  = document.getElementById('groupContactList');
    const selectedTags      = document.getElementById('selectedTags');

    // ── Utilities ─────────────────────────────────────────────────────────────
    function parseDate(str) {
        if (!str) return new Date();
        return new Date(String(str).replace('Z','').replace(/\+\d{2}:\d{2}$/, ''));
    }

    function formatRelative(dt) {
        if (!dt || isNaN(dt.getTime())) return 'không rõ';
        const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
        if (diff < 0) return 'vừa xong';
        if (diff < 60) return `${diff} giây trước`;
        const mins = Math.floor(diff / 60);
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        return `${Math.floor(hours / 24)} ngày trước`;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function autoScroll() { messagesEl.scrollTop = messagesEl.scrollHeight; }

    function saveReplyDrafts() {
        try {
            localStorage.setItem(REPLY_DRAFTS_KEY, JSON.stringify(replyDrafts));
        } catch { /* ignore */ }
    }

    function setReplyDraft(convId, info) {
        if (convId == null) return;
        replyDrafts[String(convId)] = info;
        saveReplyDrafts();
    }

    function removeReplyDraft(convId) {
        if (convId == null) return;
        delete replyDrafts[String(convId)];
        saveReplyDrafts();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    async function init() {
        const r = await fetch(`${baseUrl}/api/auth/status`, { credentials: 'include' });
        const data = await r.json();
        if (!data.loggedIn) { window.location.href = `${baseUrl}/user/login.html`; return; }
        currentUser = data.user;

        socket.emit('register', currentUser.id);
        socket.on('receive_message',  onIncomingMessage);
        socket.on('message_sent',     onMessageSent);
        socket.on('message_seen',     onMessageSeen);
        socket.on('reaction',         onReaction);
        socket.on('user_status', s => {
            if (currentOtherId && String(s.userId) === String(currentOtherId)) {
                chatStatus.textContent = s.status === 'online'
                    ? 'Đang hoạt động'
                    : (s.lastSeen ? 'Hoạt động ' + formatRelative(parseDate(s.lastSeen)) : 'Không hoạt động');
            }
            Array.from(conversationsEl.children).forEach(el => {
                if (String(el.dataset.otherId) === String(s.userId)) {
                    const statusEl = el.querySelector('.other-status');
                    if (statusEl) {
                        statusEl.textContent = s.status === 'online' ? 'Đang hoạt động'
                            : (s.lastSeen ? 'Hoạt động ' + formatRelative(parseDate(s.lastSeen)) : 'Không hoạt động');
                        statusEl.style.color = s.status === 'online' ? '#34d399' : '';
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
                const found = convs && convs.find(c => c.id === convId);
                const isGroup = found && !!found.is_group;
                const dispName = found ? (isGroup ? (found.title || found.other_name || 'Nhóm') : (found.other_name || found.title || ('Hội thoại #' + convId))) : undefined;
                openConversation(convId, dispName, isGroup);
                return;
            }
        }
        if (!currentConv) showNoConversationPlaceholder();
    }

    // ── Conversations ─────────────────────────────────────────────────────────
    async function loadConversations() {
        const r = await fetch(`${baseUrl}/api/conversations`, { credentials: 'include' });
        const convs = await r.json();
        renderConversations(convs);

        // Extract unique contacts for group creation
        currentContacts = [];
        const seen = new Set();
        convs.forEach(c => {
            if (c.other_id && !seen.has(c.other_id)) {
                seen.add(c.other_id);
                currentContacts.push({ id: c.other_id, username: c.other_name || ('User #' + c.other_id) });
            }
        });
        return convs;
    }

    function renderConversations(convs) {
        conversationsEl.innerHTML = '';
        convs.forEach(c => {
            const el = document.createElement('div');
            el.className = 'conv';
            el.dataset.id = c.id;
            el.dataset.otherId = c.other_id || '';

            let statusText = '', statusColor = '#9ca3af';
            if (c.other_is_online) { statusText = 'Đang hoạt động'; statusColor = '#34d399'; }
            else if (c.other_last_seen) { statusText = 'Hoạt động ' + formatRelative(parseDate(c.other_last_seen)); }

            const isGroup = c.is_group;
            // Với group: ưu tiên tên nhóm (title) khi tạo, không dùng tên 1 thành viên.
            // Với chat 1-1: hiển thị tên người còn lại.
            const displayName = isGroup ? (c.title || c.other_name || 'Nhóm') : (c.other_name || c.title || ('Hội thoại #' + c.id));

            el.innerHTML = `
                <div class="avatar ${isGroup ? 'group' : ''}">${isGroup ? '<i class="fa-solid fa-users" style="font-size:16px"></i>' : escapeHtml(displayName.charAt(0).toUpperCase())}</div>
                <div class="meta" style="flex:1;min-width:0">
                    <div class="name">${escapeHtml(displayName)}</div>
                    <div class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.last_message || '')}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div class="small other-status" style="color:${statusColor}">${statusText}</div>
                </div>`;
            el.addEventListener('click', () => openConversation(c.id, displayName, !!isGroup));
            conversationsEl.appendChild(el);
        });
    }

    async function openConversation(convId, title, isGroup = false) {
        currentConv = convId;
        currentIsGroup = !!isGroup;
        chatTitle.textContent = title || ('Hội thoại #' + convId);
        chatStatus.textContent = 'Đang tải...';
        // Khi đổi hội thoại, chỉ ẩn reply bar hiện tại,
        // không xoá draft để khi quay lại vẫn thấy lại.
        clearReply({ removeDraft: false });
        const draft = replyDrafts[String(convId)];
        if (draft) setReply(draft, { focus: false });
        socket.emit('join', convId);

        const r = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, { credentials: 'include' });
        const msgs = await r.json();
        allMessages = msgs;
        renderMessages(msgs);
        chatStatus.textContent = 'Đã kết nối';
        autoScroll();

        // Đánh dấu tất cả tin nhắn trong hội thoại là đã đọc (reset badge ngoài trang post)
        fetch(`${baseUrl}/api/conversations/${convId}/mark-read`, { method: 'POST', credentials: 'include' }).catch(() => {});

        [messageInput, sendBtn, attachBtn, emojiBtn, convMenuBtn].forEach(el => { if (el) el.disabled = false; });

        Array.from(conversationsEl.children).forEach(el => {
            el.style.background = String(el.dataset.id) === String(currentConv) ? '#0b1220' : '';
        });

        try {
            const pr = await fetch(`${baseUrl}/api/conversations/${convId}/participants`, { credentials: 'include' });
            const parts = await pr.json();
            if (Array.isArray(parts)) {
                const other = parts.find(p => p.id !== currentUser.id);
                if (other) {
                    currentOtherId = other.id;
                    currentOtherName = other.username;
                    // Với group: giữ tên nhóm (title), không ghi đè bằng tên 1 thành viên
                    if (!currentIsGroup) chatTitle.textContent = other.username || chatTitle.textContent;
                    chatStatus.textContent = other.is_online ? 'Đang hoạt động'
                        : (other.last_seen ? 'Hoạt động ' + formatRelative(parseDate(other.last_seen)) : 'Chưa hoạt động');
                } else {
                    currentOtherId = null;
                    currentOtherName = null;
                    chatStatus.textContent = 'Đã kết nối';
                }
            }
        } catch { currentOtherId = null; currentOtherName = null; }
    }

    // ── Messages ──────────────────────────────────────────────────────────────
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
        p.textContent = 'Hãy chọn một cuộc trò chuyện bên trái để bắt đầu.';
        messagesEl.appendChild(p);
        chatTitle.textContent = 'Chưa có cuộc trò chuyện được chọn';
        chatStatus.textContent = '—';
        [messageInput, sendBtn, attachBtn, emojiBtn, convMenuBtn].forEach(el => { if (el) el.disabled = true; });
        currentOtherId = null; currentOtherName = null;
        // Ẩn reply bar nếu đang mở nhưng không xoá draft (không có conv đang chọn)
        clearReply({ removeDraft: false });
    }

    /**
     * Build and append a message row with:
     *  - Reply quote (if replyTo info present)
     *  - Text / image
     *  - Emoji reactions
     *  - Hover action bar (reply + react)
     */
    function appendMessage(m) {
        const senderId = m.sender_id || m.senderId || m.sender;
        const text     = m.text || m.message_text || m.messageText || '';
        const created  = m.created_at || m.createdAt || new Date();
        const seen     = m.seen || m.is_read || false;
        const imageUrl = m.image_url || m.imageUrl || m.image || null;
        // API hiện đang lưu reaction kiểu "emoji đơn lẻ" trong `m.reaction`.
        // UI lại render theo dạng map `m.reactions` để có thể hiển thị count.
        let reactions = m.reactions || {};  // { "❤️": 2, "👍": 1 }
        const singleReaction = m.reaction || m.Reaction || null;
        if (singleReaction) {
            reactions = { ...reactions, [singleReaction]: reactions[singleReaction] ? reactions[singleReaction] : 1 };
        }
        // Reply quote:
        // - backend socket có thể trả `reply_to` dạng object: { id, sender_id, text }
        // - backend REST đôi khi chỉ trả `reply_to` là ID (number)
        // - một số biến thể khác: `reply_to_id`, `reply_text`...
        let replyToMsg = m.reply_to || m.replyTo || null;
        if (replyToMsg && typeof replyToMsg !== 'object') {
            const replyId = replyToMsg;
            replyToMsg = {
                id: replyId,
                sender_id: m.reply_sender_id ?? m.reply_senderId ?? null,
                text: (m.reply_text ?? m.reply_text) || m.replied_text || '' // fallback placeholder
            };
        }
        if (!replyToMsg && (m.reply_to_id != null || m.replyToId != null)) {
            const replyId = m.reply_to_id ?? m.replyToId;
            replyToMsg = {
                id: replyId,
                sender_id: m.reply_sender_id ?? null,
                text: m.reply_text ?? m.replied_text ?? ''
            };
        }

        const isMe = senderId === currentUser.id;
        const displayName = isMe ? 'Bạn' : (currentOtherName || chatTitle.textContent || 'Người khác');

        // Row wrapper
        const row = document.createElement('div');
        row.className = 'msg-row' + (isMe ? ' me' : '');
        row.dataset.id = m.id;

        // ── Quick emoji picker (hidden, shown on emoji act btn click) ──
        const qep = document.createElement('div');
        qep.className = 'quick-emoji-picker';
        QUICK_EMOJIS.forEach(em => {
            const b = document.createElement('button');
            b.className = 'qe-btn';
            b.textContent = em;
            b.title = em;
            b.addEventListener('click', e => {
                e.stopPropagation();
                sendReaction(m.id, em);
                qep.classList.remove('open');
            });
            qep.appendChild(b);
        });

        // ── Hover action bar ──
        const actBar = document.createElement('div');
        actBar.className = 'msg-actions';

        // React button
        const reactBtn = document.createElement('button');
        reactBtn.className = 'act-btn';
        reactBtn.title = 'Thêm cảm xúc';
        reactBtn.innerHTML = '<i class="fa-regular fa-face-smile"></i>';
        reactBtn.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = qep.classList.contains('open');
            // close all other pickers
            document.querySelectorAll('.quick-emoji-picker.open').forEach(el => el.classList.remove('open'));
            if (!isOpen) qep.classList.add('open');
        });

        // Reply button
        const repBtn = document.createElement('button');
        repBtn.className = 'act-btn';
        repBtn.title = 'Trả lời';
        repBtn.innerHTML = '<i class="fa-solid fa-reply"></i>';
        repBtn.addEventListener('click', e => {
            e.stopPropagation();
            setReply({ id: m.id, senderName: displayName, text });
        });

        // More (quote text — keep existing context-menu behaviour via a button)
        const moreBtn = document.createElement('button');
        moreBtn.className = 'act-btn';
        moreBtn.title = 'Tuỳ chọn';
        moreBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
        moreBtn.addEventListener('click', e => {
            e.stopPropagation();
            showMessageOptions(m);
        });

        actBar.appendChild(reactBtn);
        actBar.appendChild(repBtn);
        actBar.appendChild(moreBtn);

        // ── Bubble ──
        const bubble = document.createElement('div');
        bubble.className = 'msg';

        // Sender name + time
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.innerHTML = `<strong>${escapeHtml(displayName)}</strong> · <span class="small">${parseDate(created).toLocaleTimeString()}</span>`;
        bubble.appendChild(meta);

        // Reply quote
        if (replyToMsg) {
            const quoteName = replyToMsg.sender_id === currentUser.id ? 'Bạn' : (currentOtherName || 'Người khác');
            const quoteEl = document.createElement('div');
            quoteEl.className = 'reply-quote';
            quoteEl.innerHTML = `<div class="rq-name"><i class="fa-solid fa-reply"></i> ${escapeHtml(quoteName)}</div><div>${escapeHtml(replyToMsg.text || '[Ảnh]')}</div>`;
            quoteEl.addEventListener('click', () => {
                const target = messagesEl.querySelector(`[data-id="${replyToMsg.id}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.querySelector('.msg').style.outline = '2px solid var(--accent)';
                    setTimeout(() => { target.querySelector('.msg').style.outline = ''; }, 1200);
                }
            });
            bubble.appendChild(quoteEl);
        }

        // Text
        if (text) {
            const textEl = document.createElement('div');
            textEl.className = 'text';
            textEl.textContent = text;
            bubble.appendChild(textEl);
        }

        // Image
        if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.className = 'inline-image';
            img.alt = 'img';
            img.addEventListener('click', () => {
                imageModal.style.display = 'flex';
                imageModalImg.src = imageUrl;
                document.body.style.overflow = 'hidden';
            });
            bubble.appendChild(img);
        }

        // Seen indicator
        if (seen && isMe) {
            const s = document.createElement('div');
            s.className = 'small';
            s.textContent = 'Đã xem';
            bubble.appendChild(s);
        }

        // Reactions display
        const reactionsEl = document.createElement('div');
        reactionsEl.className = 'msg-reactions';
        renderReactionsInto(reactionsEl, reactions, m.id);
        bubble.appendChild(reactionsEl);

        // ── Assemble row ──
        row.appendChild(qep);
        row.appendChild(actBar);
        row.appendChild(bubble);

        // Close picker on outside click
        document.addEventListener('click', () => qep.classList.remove('open'), { capture: false });

        messagesEl.appendChild(row);
        return row;
    }

    function renderReactionsInto(container, reactions, msgId) {
        container.innerHTML = '';
        Object.entries(reactions).forEach(([emoji, count]) => {
            if (!count) return;
            const chip = document.createElement('button');
            chip.className = 'reaction-chip';
            chip.innerHTML = `${emoji} <span class="rc-count">${count > 1 ? count : ''}</span>`;
            chip.title = `${count} người`;
            chip.addEventListener('click', () => sendReaction(msgId, emoji));
            container.appendChild(chip);
        });
    }

    function sendReaction(msgId, emoji) {
        // Phải emit đúng event mà server lắng nghe: 'reaction'
        socket.emit('reaction', { messageId: msgId, emoji, userId: currentUser.id });
        // Optimistic update
        const row = messagesEl.querySelector(`[data-id="${msgId}"]`);
        if (row) {
            const msg = allMessages.find(m => String(m.id) === String(msgId));
            if (msg) {
                // Backend hiện lưu 1 reaction emoji duy nhất trong Messages.reaction,
                // nên UI nên set "đúng 1" để tránh cộng dồn sai.
                msg.reactions = { [emoji]: 1 };
                const container = row.querySelector('.msg-reactions');
                if (container) renderReactionsInto(container, msg.reactions, msgId);
            }
        }
    }

    // ── Reply ─────────────────────────────────────────────────────────────────
    function setReply(info, { focus = true } = {}) {
        replyTo = info;
        replyToName.textContent = info.senderName;
        replyToText.textContent = info.text || '[Ảnh]';
        replyBar.style.display = 'flex';
        if (focus) messageInput.focus();
        setReplyDraft(currentConv, info);
    }

    function clearReply({ removeDraft = true } = {}) {
        const convId = currentConv;
        replyTo = null;
        replyBar.style.display = 'none';
        replyToName.textContent = '';
        replyToText.textContent = '';
        if (removeDraft) removeReplyDraft(convId);
    }

    cancelReplyBtn.addEventListener('click', clearReply);

    // ── Socket events ─────────────────────────────────────────────────────────
    function onIncomingMessage(msg) {
        const convId = msg.conversation_id || msg.conversationId || msg.convId || null;
        if (currentConv && convId && convId === currentConv) {
            // Bỏ qua nếu là tin mình gửi — đã xử lý qua message_sent, tránh hiển thị 2 lần
            const isFromMe = (msg.sender_id || msg.senderId) === currentUser.id;
            if (isFromMe) return;
            allMessages.push(msg);
            appendMessage(msg);
            autoScroll();
            setTimeout(() => socket.emit('read_message', {
                messageId: msg.id, senderId: msg.sender_id, receiverId: currentUser.id
            }), 700);
        } else {
            loadConversations();
        }
    }

    function onMessageSent(msg) {
        allMessages.push(msg);
        appendMessage(msg);
        autoScroll();
    }

    function onMessageSeen(info) {
        const row = messagesEl.querySelector(`[data-id="${info.messageId}"]`);
        if (row) {
            const bubble = row.querySelector('.msg');
            if (bubble && !bubble.querySelector('.seen-tick')) {
                const s = document.createElement('div');
                s.className = 'small seen-tick';
                s.textContent = 'Đã xem';
                bubble.appendChild(s);
            }
        }
    }

    function onReaction(data) {
        const row = messagesEl.querySelector(`[data-id="${data.messageId}"]`);
        if (row) {
            const msg = allMessages.find(m => String(m.id) === String(data.messageId));
            if (msg) {
                // Backend hiện lưu 1 reaction emoji duy nhất trong Messages.reaction,
                // nên UI nên set "đúng 1" để tránh cộng dồn sai.
                msg.reactions = { [data.emoji]: 1 };
                const container = row.querySelector('.msg-reactions');
                if (container) renderReactionsInto(container, msg.reactions, data.messageId);
            }
        }
    }

    // ── Send message ──────────────────────────────────────────────────────────
    function sendMessage(overrideImage) {
        if (!currentConv) return alert('Chưa chọn hội thoại');
        const text = messageInput.value.trim();
        if (!text && !overrideImage) return;
        socket.emit('send_message', {
            senderId:       currentUser.id,
            receiverId:     null,
            text:           text,
            replyToId:      replyTo ? replyTo.id : null,
            imageUrl:       overrideImage || null,
            conversationId: currentConv
        });
        messageInput.value = '';
        clearReply();
    }

    sendBtn.addEventListener('click', e => { e.preventDefault(); sendMessage(); });
    messageInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

    // ── Image upload ──────────────────────────────────────────────────────────
    attachBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const fd = new FormData();
            fd.append('image', file);
            const up = await fetch(`${baseUrl}/api/upload-image`, { method: 'POST', credentials: 'include', body: fd });
            const data = await up.json();
            if (data && data.url) sendMessage(data.url);
            else alert('Không upload được ảnh');
        } catch { alert('Lỗi upload'); }
        imageInput.value = '';
    });

    // ── Input-bar emoji panel ─────────────────────────────────────────────────
    let emojiPanel = null;
    function createEmojiPanel() {
        if (emojiPanel) return;
        emojiPanel = document.createElement('div');
        Object.assign(emojiPanel.style, {
            position: 'fixed', zIndex: '9999', background: '#0b1220',
            border: '1px solid #1f2937', padding: '8px', borderRadius: '8px',
            display: 'grid', gridTemplateColumns: 'repeat(6,28px)', gap: '6px',
            boxShadow: '0 8px 24px rgba(2,6,23,0.6)'
        });
        EMOJI_LIST.forEach(em => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = em;
            Object.assign(b.style, { fontSize:'18px', width:'28px', height:'28px', borderRadius:'6px', border:'none', background:'transparent', cursor:'pointer' });
            b.addEventListener('click', () => { messageInput.value += em; messageInput.focus(); hideEmojiPanel(); });
            emojiPanel.appendChild(b);
        });
        document.body.appendChild(emojiPanel);
        document.addEventListener('click', ev => {
            if (!emojiPanel) return;
            if (ev.target === emojiBtn || emojiBtn.contains(ev.target) || emojiPanel.contains(ev.target)) return;
            hideEmojiPanel();
        });
    }
    function positionPanel() {
        if (!emojiPanel) return;
        const rect = emojiBtn.getBoundingClientRect();
        const pw = emojiPanel.offsetWidth || 200;
        const ph = emojiPanel.offsetHeight || 140;
        let left = rect.left;
        if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
        let top = rect.top - ph - 8;
        if (top < 8) top = rect.bottom + 8;
        emojiPanel.style.left = left + 'px';
        emojiPanel.style.top = top + 'px';
    }
    function toggleEmojiPanel() {
        if (!emojiPanel || emojiPanel.style.display === 'none') {
            createEmojiPanel();
            emojiPanel.style.display = 'grid';
            requestAnimationFrame(positionPanel);
        } else { hideEmojiPanel(); }
    }
    function hideEmojiPanel() { if (emojiPanel) emojiPanel.style.display = 'none'; }
    emojiBtn.addEventListener('click', e => { e.stopPropagation(); toggleEmojiPanel(); });

    // ── Conversation menu ─────────────────────────────────────────────────────
    convMenuBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!currentConv) return alert('Chưa chọn hội thoại');
        convMenu.style.display = convMenu.style.display === 'flex' ? 'none' : 'flex';
    });
    document.addEventListener('click', ev => {
        if (!convMenu || convMenu.style.display === 'none') return;
        if (ev.target === convMenuBtn || convMenu.contains(ev.target)) return;
        convMenu.style.display = 'none';
    });
    deleteConvBtn.addEventListener('click', async e => {
        e.preventDefault();
        if (!currentConv) return;
        if (!confirm('Bạn có chắc muốn xóa cuộc trò chuyện này?')) return;
        const res = await fetch(`${baseUrl}/api/conversations/${currentConv}`, { method: 'DELETE', credentials: 'include' });
        if (res.ok) {
            alert('Đã xóa cuộc trò chuyện');
            currentConv = null; allMessages = [];
            showNoConversationPlaceholder();
            await loadConversations();
        } else { alert('Không thể xóa: ' + await res.text()); }
        convMenu.style.display = 'none';
    });

    // ── Image modal ───────────────────────────────────────────────────────────
    function closeImageModal() {
        imageModal.style.display = 'none';
        imageModalImg.src = '';
        document.body.style.overflow = '';
    }
    imageModalClose.addEventListener('click', closeImageModal);
    imageModal.addEventListener('click', ev => { if (ev.target === imageModal) closeImageModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeImageModal(); });

    // ── Search ────────────────────────────────────────────────────────────────
    searchConvs.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        Array.from(conversationsEl.children).forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
        });
    });
    searchInConv.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        renderMessages(allMessages.filter(m => (m.text || '').toLowerCase().includes(q)));
    });

    // ── Message options (right-click / more btn) ───────────────────────────────
    function showMessageOptions(m) {
        const r = confirm('Trích dẫn tin nhắn này? (OK để reply)');
        if (r) {
            const senderId = m.sender_id || m.senderId;
            const name = senderId === currentUser.id ? 'Bạn' : (currentOtherName || 'Người khác');
            setReply({ id: m.id, senderName: name, text: m.text || '' });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP CREATION
    // ─────────────────────────────────────────────────────────────────────────
    let selectedMembers = new Set();   // set of user IDs

    function openGroupModal() {
        selectedMembers.clear();
        groupNameInput.value = '';
        selectedTags.innerHTML = '';
        renderGroupContacts();
        createGroupModal.style.display = 'flex';
    }

    function closeGroupModal() {
        createGroupModal.style.display = 'none';
    }

    function renderGroupContacts() {
        groupContactList.innerHTML = '';
        if (currentContacts.length === 0) {
            groupContactList.innerHTML = '<div class="small" style="padding:8px;text-align:center">Chưa có liên hệ nào. Hãy bắt đầu chat riêng trước.</div>';
            return;
        }
        currentContacts.forEach(contact => {
            const item = document.createElement('label');
            item.className = 'contact-item';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = contact.id;
            cb.checked = selectedMembers.has(String(contact.id));
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selectedMembers.add(String(contact.id));
                    addTag(contact);
                } else {
                    selectedMembers.delete(String(contact.id));
                    removeTag(contact.id);
                }
            });

            const avatar = document.createElement('div');
            avatar.className = 'c-avatar';
            avatar.textContent = contact.username.charAt(0).toUpperCase();

            const name = document.createElement('div');
            name.className = 'c-name';
            name.textContent = contact.username;

            item.appendChild(cb);
            item.appendChild(avatar);
            item.appendChild(name);
            groupContactList.appendChild(item);
        });
    }

    function addTag(contact) {
        if (selectedTags.querySelector(`[data-id="${contact.id}"]`)) return;
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.dataset.id = contact.id;
        tag.innerHTML = `${escapeHtml(contact.username)} <span class="tag-x" data-id="${contact.id}">×</span>`;
        tag.querySelector('.tag-x').addEventListener('click', () => {
            selectedMembers.delete(String(contact.id));
            tag.remove();
            // uncheck checkbox
            const cb = groupContactList.querySelector(`input[value="${contact.id}"]`);
            if (cb) cb.checked = false;
        });
        selectedTags.appendChild(tag);
    }

    function removeTag(id) {
        const tag = selectedTags.querySelector(`[data-id="${id}"]`);
        if (tag) tag.remove();
    }

    createGroupOpenBtn.addEventListener('click', async () => {
        await loadConversations();   // refresh contacts
        openGroupModal();
    });

    cancelGroupBtn.addEventListener('click', closeGroupModal);
    createGroupModal.addEventListener('click', e => { if (e.target === createGroupModal) closeGroupModal(); });

    createGroupBtn.addEventListener('click', async () => {
        const name = groupNameInput.value.trim();
        if (!name) { groupNameInput.focus(); return alert('Vui lòng nhập tên nhóm'); }
        if (selectedMembers.size < 1) return alert('Chọn ít nhất 1 người để tạo nhóm');

        const memberIds = Array.from(selectedMembers).map(id => parseInt(id, 10));

        try {
            createGroupBtn.disabled = true;
            createGroupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';

            const res = await fetch(`${baseUrl}/api/conversations`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participantIds: memberIds, title: name, isGroup: true })
            });

            if (res.ok) {
                const group = await res.json();
                closeGroupModal();
                await loadConversations();
                openConversation(group.id, name, true);
            } else {
                const t = await res.text();
                alert('Không tạo được nhóm: ' + t);
            }
        } catch (err) {
            console.error('Create group error', err);
            alert('Lỗi khi tạo nhóm');
        } finally {
            createGroupBtn.disabled = false;
            createGroupBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Tạo nhóm';
        }
    });

    init();
})();