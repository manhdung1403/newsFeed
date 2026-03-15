let isLoggedIn = false;
let currentUser = null;

const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:'
    ? 'http://localhost:3000'
    : window.location.origin;

// Kiểm tra trạng thái đăng nhập
async function checkAuthStatus() {
    try {
        const response = await fetch(`${baseUrl}/api/auth/status`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (data.loggedIn) {
            isLoggedIn = true;
            currentUser = data.user;
            updateUIForLoggedIn();
        } else {
            isLoggedIn = false;
            updateUIForLoggedOut();
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra đăng nhập:", error);
        updateUIForLoggedOut();
    }
}

function updateUIForLoggedIn() {
    const userInfo = document.getElementById('userInfo');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const mainForm = document.getElementById('mainForm');
    const loginPrompt = document.getElementById('loginPrompt');

    userInfo.style.display = 'flex';
    usernameDisplay.textContent = currentUser.username;
    mainForm.style.display = 'block';
    loginPrompt.style.display = 'none';
}

function updateUIForLoggedOut() {
    const userInfo = document.getElementById('userInfo');
    const mainForm = document.getElementById('mainForm');
    const loginPrompt = document.getElementById('loginPrompt');

    userInfo.style.display = 'none';
    mainForm.style.display = 'none';
    loginPrompt.style.display = 'block';
}

// Xem trước ảnh khi chọn file từ máy tính
function setupImagePreviewHandlers() {
    document.getElementById('imageFile')?.addEventListener('change', function () {
        const preview = document.getElementById('imagePreview');
        const file = this.files[0];

        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                preview.src = event.target.result;
                preview.style.display = 'block';
                document.getElementById('imageUrl').value = '';
            };
            reader.readAsDataURL(file);
        } else {
            preview.style.display = 'none';
        }
    });

    document.getElementById('imageUrl')?.addEventListener('change', function () {
        const preview = document.getElementById('imagePreview');
        const imageFileInput = document.getElementById('imageFile');

        if (this.value) {
            imageFileInput.value = '';
            preview.src = this.value;
            preview.style.display = 'block';
            preview.onerror = function () {
                preview.style.display = 'none';
                showError('Không thể tải ảnh. Kiểm tra lại URL.');
            };
        } else if (!imageFileInput.files.length) {
            preview.style.display = 'none';
        }
    });
}

function setupFormHandler() {
    document.getElementById('addPostForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();

        const imageFileInput = document.getElementById('imageFile');
        let imageUrl = document.getElementById('imageUrl').value.trim();
        const caption = document.getElementById('caption').value.trim();

        if (imageFileInput.files.length > 0) {
            const file = imageFileInput.files[0];
            if (file.size > 5 * 1024 * 1024) { // 5MB
                showError('Kích thước ảnh quá lớn (tối đa 5MB). Vui lòng giảm kích thước ảnh hoặc chọn ảnh khác.');
                return;
            }
            const preview = document.getElementById('imagePreview');
            imageUrl = preview.src;

            if (!imageUrl.startsWith('data:image/')) {
                showError('Không thể xử lý ảnh đã chọn. Vui lòng chọn ảnh khác.');
                return;
            }
        }

        if (!imageUrl) {
            showError('Vui lòng chọn ảnh từ máy tính hoặc nhập URL ảnh');
            return;
        }

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng...';

        try {
            const response = await fetch(`${baseUrl}/api/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    image_url: imageUrl,
                    caption: caption
                })
            });

            let data;
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                console.error('Không parse được JSON, trả về text:', text);
                const rawPreview = text.length > 500 ? text.substr(0, 500) + '...' : text;
                showError('Lỗi server không hợp lệ: ' + parseError.message + ' | ' + rawPreview);
                return;
            }

            if (response.ok && data.success) {
                showSuccess('Bài đăng đã được tạo thành công!');
                setTimeout(() => {
                    goToFeed();
                }, 1500);
            } else {
                showError(data.error || 'Không thể tạo bài đăng');
            }
        } catch (error) {
            console.error("Lỗi khi đăng bài:", error);
            showError('Lỗi server: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng bài';
        }
    });
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    successDiv.style.display = 'none';
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    const errorDiv = document.getElementById('errorMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    errorDiv.style.display = 'none';
}

function goToFeed() {
    window.location.href = `${baseUrl}/post/post.html`;
}

// Xử lý đăng xuất
async function handleLogout() {
    try {
        const response = await fetch(`${baseUrl}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            isLoggedIn = false;
            currentUser = null;
            updateUIForLoggedOut();
        }
    } catch (error) {
        console.error("Lỗi khi đăng xuất:", error);
    }
}

// Khởi tạo
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupImagePreviewHandlers();
    setupFormHandler();

    document.addEventListener('click', (e) => {
        if (e.target.id === 'logoutBtn') {
            handleLogout();
        }
    });
});
