// Lấy base URL (http://localhost:3000 hoặc origin hiện tại)
const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:'
    ? 'http://localhost:3000'
    : window.location.origin;

// Cập nhật link đăng ký
const registerLink = document.querySelector('.register-link a');
if (registerLink) {
    registerLink.href = `${baseUrl}/user/register.html`;
}

const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('errorMessage');
const submitBtn = document.getElementById('submitBtn');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Ẩn thông báo lỗi cũ
        errorMessage.classList.remove('show');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang xử lý...';

        try {
            const response = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                window.location.href = `${baseUrl}/post/post.html`;
            } else {
                errorMessage.textContent = data.error || 'Đăng nhập thất bại';
                errorMessage.classList.add('show');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Đăng nhập';
            }
        } catch (error) {
            console.error('Lỗi:', error);
            errorMessage.textContent = 'Không thể kết nối với server';
            errorMessage.classList.add('show');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng nhập';
        }
    });
}
