document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ И ПЕРЕМЕННЫХ
    // ==========================================
    let projects = [...mockData.projects];
    let activeProject = projects[0];
    let isSelectionMode = false;
    let selectedSubmissionIds = [];

    // Элементы интерфейса
    const workModal = document.getElementById("work-modal");
    const reviewPanel = document.getElementById("review-panel");
    const contextMenu = document.getElementById("context-menu");
    const participantMenu = document.getElementById("participant-context-menu");
    const controlModal = document.getElementById("control-panel-modal");
    const requestsModal = document.getElementById("requests-modal");
    const createProjectModal = document.getElementById("create-project-modal");
    const inviteModal = document.getElementById("invite-modal");

    // ==========================================
    // 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ==========================================
    function generateProjectCode(type) {
        const prefix = type === 'p2p' ? 'PTP' : 'EXM';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const randomBlock = () => {
            let block = '';
            for (let i = 0; i < 4; i++) block += chars.charAt(Math.floor(Math.random() * chars.length));
            return block;
        };
        return `${prefix}-${randomBlock()}-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
    }

    function calculateAverageScore(reviews) {
        if (!reviews || reviews.length === 0) return '—';
        const sum = reviews.reduce((acc, curr) => acc + curr.score, 0);
        return (sum / reviews.length).toFixed(1);
    }

    function getSubmissionStatus(sub) {
        if (sub.status === 'done') return { class: 'done', text: 'Проверено', icon: '✔️' };

        const reqReviews = activeProject.requiredReviews || 2;
        if (!sub.assignedExperts) {
            sub.assignedExperts = (sub.reviewer && sub.reviewer !== '—') ? [sub.reviewer] : [];
        }

        const assigned = sub.assignedExperts.length;
        const reviewsCount = sub.reviews ? sub.reviews.length : 0;

        if (assigned < reqReviews) return { class: 'no-expert', text: `Нужно экспертов: ${assigned}/${reqReviews}`, icon: '⚠️', needsRefresh: true };
        if (reviewsCount < reqReviews) return { class: 'checking', text: `На проверке (${reviewsCount}/${reqReviews})`, icon: '🕒' };

        return { class: 'waiting', text: 'Ожидание', icon: '⏳' };
    }

    window.updateDashboard = function () {
        renderSidebarProjects();
        renderHeader();
        updateStatsCounters();
        renderTable();
        renderExperts();
        updateRequestsBadge();
        if (reviewPanel) reviewPanel.style.display = 'none';
    };

    function updateStatsCounters() {
        if (!activeProject) return;
        const total = activeProject.submissions.length;
        const reviewed = activeProject.submissions.filter(sub => sub.status === 'done').length;
        const checking = activeProject.submissions.filter(sub => sub.status === 'checking').length;
        const waiting = activeProject.submissions.filter(sub => sub.status === 'waiting').length;

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setVal('stat-total', total);
        setVal('stat-reviewed', reviewed);
        setVal('stat-checking', checking);
        setVal('stat-waiting', waiting);
    }

    // ==========================================
    // 3. ФУНКЦИИ РЕНДЕРА (ОТРИСОВКИ ИНТЕРФЕЙСА)
    // ==========================================
    function renderSidebarProjects() {
        const container = document.querySelector(".projects-list");
        if (!container) return;

        Array.from(container.children).forEach(child => {
            if (!child.classList.contains('section-title')) child.remove();
        });

        projects.forEach(proj => {
            const div = document.createElement("div");
            div.className = `project-item ${proj.id === activeProject.id ? 'active' : ''}`;
            const badgeHTML = proj.joinRequests && proj.joinRequests.length > 0
                ? `<span class="badge orange" style="background: #ef4444; color:white;">${proj.joinRequests.length} заявки</span>`
                : `<span class="badge ${proj.type === 'p2p' ? 'orange' : 'yellow'}">${proj.type.toUpperCase()}</span>`;

            div.innerHTML = `
                <div class="project-icon ${proj.type === 'p2p' ? 'blue' : 'green'}">${proj.name.charAt(0)}</div>
                <div class="project-info" style="width: 100%;">
                    <div class="project-name">${proj.name.substring(0, 15)}... ${badgeHTML}</div>
                    <div class="project-meta">📄 ${proj.submissions.length} 👥 ${proj.experts.length}</div>
                </div>
            `;
            div.addEventListener('click', () => { activeProject = proj; updateDashboard(); });
            container.appendChild(div);
        });
    }

    let isCodeVisible = false;
    function renderHeader() {
        const statusDot = activeProject.isSystemRunning
            ? '<span class="status-indicator active"></span>Запущено'
            : '<span class="status-indicator paused"></span>На паузе';

        document.getElementById("header-title").innerHTML = `${activeProject.name} <span style="font-size: 12px; font-weight: normal; margin-left: 10px;">${statusDot}</span>`;
        document.getElementById("header-icon").innerText = activeProject.name.charAt(0);
        document.getElementById("header-icon").className = `project-icon large ${activeProject.type === 'p2p' ? 'blue' : 'green'}`;
        document.getElementById("header-type").innerText = activeProject.type === 'p2p' ? "Peer-to-Peer" : "Экзаменационный";
        document.getElementById("header-date").innerText = activeProject.date;

        isCodeVisible = false;
        const codeDisplay = document.getElementById("project-code-display");
        if (codeDisplay) {
            codeDisplay.innerText = "•••••••••••••••••••••••";
            codeDisplay.style.letterSpacing = "2px";
        }

        if (!activeProject.requiredReviews) activeProject.requiredReviews = 2;
        const reqInput = document.getElementById("req-reviews-input");
        if (reqInput) {
            reqInput.value = activeProject.requiredReviews;
            reqInput.onchange = (e) => {
                const val = parseInt(e.target.value);
                if (val > 0) { activeProject.requiredReviews = val; renderTable(); updateStatsCounters(); }
                else { e.target.value = activeProject.requiredReviews; }
            };
        }
    }

    // 1. Рендер главной таблицы (С поддержкой чекбоксов)
    function renderTable(searchQuery = "") {
        const tableBody = document.getElementById("table-body");
        if (!tableBody) return;
        tableBody.innerHTML = "";

        const filter = (typeof searchQuery === 'string') ? searchQuery.toLowerCase() : "";
        const filteredSubmissions = activeProject.submissions.filter(sub => {
            return (sub.name && sub.name.toLowerCase().includes(filter)) ||
                (sub.telegram && sub.telegram.toLowerCase().includes(filter));
        });

        if (filteredSubmissions.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Ничего не найдено</td></tr>`;
            return;
        }

        filteredSubmissions.forEach(sub => {
            const statusInfo = getSubmissionStatus(sub);
            const avgScore = calculateAverageScore(sub.reviews);
            const expertsText = (sub.assignedExperts && sub.assignedExperts.length > 0) ? sub.assignedExperts.join(', ') : '—';

            const tr = document.createElement("tr");

            // --- НОВОЕ: Отрисовка чекбокса, если включен режим выбора ---
            const checkboxHTML = isSelectionMode
                ? `<input type="checkbox" class="sub-checkbox" data-id="${sub.id}" ${selectedSubmissionIds.includes(sub.id) ? 'checked' : ''} style="margin-right: 10px; cursor: pointer; transform: scale(1.2);">`
                : '';

            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${checkboxHTML}
                        <span style="color: var(--text-muted); font-size: 12px;">${sub.studentInitials}</span>
                        ${sub.name}
                    </div>
                </td>
                <td style="color: var(--text-muted);">${sub.telegram}</td>
                <td>${sub.date}</td>
                <td>
                    <span class="status ${statusInfo.class}">${statusInfo.icon} ${statusInfo.text}</span>
                    ${statusInfo.needsRefresh ? `<span class="refresh-expert-btn" data-id="${sub.id}">🔄</span>` : ''}
                </td>
                <td style="font-weight: bold; color: ${sub.status === 'done' ? '#f59e0b' : 'inherit'}">⭐ ${avgScore}</td>
                <td style="color: var(--text-muted); font-size: 11px;">${expertsText}</td>
                <td class="action-cell">
                    <span class="action-icon btn-view" title="Посмотреть работу">👁️</span>
                    <span class="action-icon btn-reviews" title="Посмотреть проверки">💬</span>
                    <span class="action-icon btn-menu" title="Действия">⋮</span>
                </td>
            `;

            // --- НОВОЕ: Обработчик клика по чекбоксу ---
            const checkbox = tr.querySelector('.sub-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        selectedSubmissionIds.push(sub.id);
                    } else {
                        selectedSubmissionIds = selectedSubmissionIds.filter(id => id !== sub.id);
                    }
                });
            }

            // Старые обработчики кнопок
            const refreshBtn = tr.querySelector('.refresh-expert-btn');
            if (refreshBtn) refreshBtn.onclick = (e) => { e.stopPropagation(); assignRandomExpert(sub.id); };

            tr.querySelector('.btn-view').onclick = (e) => { e.stopPropagation(); openWorkModal(sub); };
            tr.querySelector('.btn-reviews').onclick = (e) => { e.stopPropagation(); showReviewsPanel(sub, avgScore); };
            tr.querySelector('.btn-menu').onclick = (e) => { e.stopPropagation(); showContextMenu(e, sub.id); };

            tableBody.appendChild(tr);
        });
    }

    function renderExperts() {
        const participantsList = document.getElementById("participants-list");
        if (!participantsList) return;
        participantsList.innerHTML = "";

        if (activeProject.experts.length === 0) {
            participantsList.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 20px;">Нет участников</p>`;
            return;
        }

        activeProject.experts.forEach(exp => {
            const div = document.createElement("div");
            div.className = "participant-item";
            div.innerHTML = `
                <div class="avatar">${exp.initials}</div>
                <div style="flex: 1;">
                    <div class="p-name">${exp.name}</div>
                    <div class="p-tg" style="display: flex; justify-content: space-between; align-items: center;">
                        ${exp.tg}
                        <span class="btn-participant-menu">⋮</span>
                    </div>
                    <div style="font-size: 11px; color: ${exp.role === 'Соорганизатор' ? '#3b82f6' : 'var(--text-muted)'}; font-weight: bold;">${exp.role}</div>
                </div>
            `;
            div.querySelector('.btn-participant-menu').onclick = (e) => { e.stopPropagation(); showParticipantMenu(e, exp.tg); };
            participantsList.appendChild(div);
        });
    }

    // ==========================================
    // 4. ЛОГИКА ЗАЯВОК (ИСПРАВЛЕННАЯ)
    // ==========================================
    function updateRequestsBadge() {
        const badge = document.getElementById("requests-badge");
        if (!badge) return;
        const count = Array.isArray(activeProject.joinRequests) ? activeProject.joinRequests.length : 0;
        if (count > 0) { badge.style.display = 'inline-block'; badge.innerText = count; }
        else { badge.style.display = 'none'; }
    }

    function renderRequestsModal() {
        const list = document.getElementById("requests-list");
        if (!list) return;
        list.innerHTML = "";

        if (!Array.isArray(activeProject.joinRequests) || activeProject.joinRequests.length === 0) {
            list.innerHTML = `<p style="color: var(--text-muted); text-align: center;">Новых заявок нет.</p>`;
            return;
        }

        const isExam = activeProject.type === 'exam';
        const roleOptions = `
            <option value="Эксперт">🎓 Эксперт</option>
            <option value="Соорганизатор">🛡️ Соорганизатор</option>
        `;

        activeProject.joinRequests.forEach(req => {
            if (!req) return;
            const div = document.createElement("div");
            div.className = "request-card";
            const reqId = req.id || Math.random().toString(36).substr(2, 9);
            const reqName = String(req.name || "Неизвестный пользователь");
            const reqTg = String(req.tg || "@unknown");

            div.innerHTML = `
                <div class="request-info">
                    <div class="req-name">${reqName}</div>
                    <div class="req-tg">${reqTg}</div>
                </div>
                <div class="request-actions">
                    <select class="role-select" id="role-${reqId}">${roleOptions}</select>
                    <button class="btn btn-accept" style="background: var(--status-green); color: white; padding: 5px 10px;">✔️</button>
                    <button class="btn btn-reject" style="background: #ef4444; color: white; padding: 5px 10px;">❌</button>
                </div>
            `;

            div.querySelector('.btn-accept').onclick = () => {
                const selectedRole = document.getElementById(`role-${reqId}`).value;
                if (!activeProject.experts) activeProject.experts = [];
                activeProject.experts.push({ initials: reqName.substring(0, 2).toUpperCase(), name: reqName, tg: reqTg, role: selectedRole });
                activeProject.joinRequests = activeProject.joinRequests.filter(r => r.id !== req.id);
                renderRequestsModal();
                updateDashboard();
            };

            div.querySelector('.btn-reject').onclick = () => {
                activeProject.joinRequests = activeProject.joinRequests.filter(r => r.id !== req.id);
                renderRequestsModal();
                updateDashboard();
            };
            list.appendChild(div);
        });
    }

    // ==========================================
    // 5. ДЕЙСТВИЯ (ACTION FUNCTIONS)
    // ==========================================
    function assignRandomExpert(submissionId) {
        const submission = activeProject.submissions.find(s => s.id === submissionId);
        if (!submission) return;
        if (!submission.assignedExperts) submission.assignedExperts = [];

        const reqReviews = activeProject.requiredReviews || 2;
        const pool = activeProject.experts.filter(e => e.role === 'Эксперт' || e.role === 'Соорганизатор');

        if (pool.length === 0) { alert("В проекте нет ни одного эксперта!"); return; }

        let assignedCount = 0;
        while (submission.assignedExperts.length < reqReviews) {
            const available = pool.filter(e => !submission.assignedExperts.includes(e.name));
            if (available.length === 0) break;
            const randomExpert = available[Math.floor(Math.random() * available.length)];
            submission.assignedExperts.push(randomExpert.name);
            assignedCount++;
        }
        if (assignedCount > 0) { renderTable(); updateStatsCounters(); }
    }

    function openWorkModal(submission) {
        const nameEl = document.getElementById("modal-student-name");
        if (nameEl && workModal) {
            nameEl.innerText = `Работа: ${submission.name} (${submission.telegram})`;
            workModal.style.display = 'flex';
        }
    }

    function showReviewsPanel(submission, avgScore) {
        const reviewContent = document.getElementById("review-content");
        if (!reviewPanel || !reviewContent) return;
        reviewPanel.style.display = 'block';

        let htmlContent = `
            <div style="margin-bottom: 15px;">
                <h4 style="color: var(--text-muted); margin-bottom: 5px;">Проверки работы: ${submission.name}</h4>
                <div style="font-size: 14px; color: var(--status-green);">Средняя оценка: <b>⭐ ${avgScore}</b></div>
            </div>
            <div class="reviews-list">
        `;

        if (submission.reviews && submission.reviews.length > 0) {
            submission.reviews.forEach((review) => {
                htmlContent += `
                    <div class="review-card" style="margin-bottom: 10px; border: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="avatar" style="width: 30px; height: 30px; font-size: 10px; background-color: #4b5563;">${review.reviewerName.substring(0, 2).toUpperCase()}</div>
                                <div><div style="font-weight: bold; color: white; font-size: 14px;">${review.reviewerName}</div><div style="font-size: 12px; color: var(--text-muted);">${review.reviewerTg}</div></div>
                            </div>
                            <div style="color: var(--status-orange); font-weight: bold;">Оценка: ⭐ ${review.score.toFixed(1)}</div>
                        </div>
                        <p style="color: var(--text-main); font-size: 14px; margin-top: 10px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px;">${review.comment}</p>
                    </div>`;
            });
        } else { htmlContent += `<p style="color: var(--text-muted);">Нет доступных проверок.</p>`; }

        htmlContent += `</div>
            <div style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">Итоговый вердикт организатора:</p>
                <div style="display: flex; gap: 15px; align-items: flex-start;">
                    <div style="flex: 1;"><textarea placeholder="Написать комментарий ученику..." style="width: 100%; padding: 10px; border-radius: 6px; background: var(--bg-dark); border: 1px solid var(--border-color); color: white; resize: vertical; min-height: 80px;"></textarea></div>
                    <div style="width: 140px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 8px;">Итоговая оценка:</label>
                        <input type="number" step="0.1" value="${(avgScore !== '—') ? avgScore : '0.0'}" style="width: 100%; padding: 8px; border-radius: 4px; background: var(--bg-dark); border: 1px solid var(--border-color); color: var(--status-orange); font-weight: bold; font-size: 16px; text-align: center;">
                    </div>
                </div>
                <div style="margin-top: 15px;">
                    <button id="btn-send-result" class="btn" style="background: var(--status-green); color: white;">Отправить ученику</button>
                    <button class="btn btn-outline" style="margin-left: 10px;">Вернуть на доп. проверку</button>
                </div>
            </div>`;

        reviewContent.innerHTML = htmlContent;
        reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'end' });

        const btnSend = document.getElementById("btn-send-result");
        if (btnSend) btnSend.onclick = () => {
            submission.status = 'done';
            alert('Результат успешно отправлен ученику!');
            reviewPanel.style.display = 'none';
            renderTable(); updateStatsCounters();
        };
    }

    // ==========================================
    // 6. КОНТЕКСТНЫЕ МЕНЮ И ОБРАБОТЧИКИ СОБЫТИЙ
    // ==========================================
    let currentSelectedSubmissionId = null;
    function showContextMenu(event, id) {
        currentSelectedSubmissionId = id;
        if (contextMenu) {
            contextMenu.style.display = 'block';
            contextMenu.style.left = `${event.pageX - 120}px`;
            contextMenu.style.top = `${event.pageY + 10}px`;
        }
    }

    let currentSelectedParticipantTg = null;
    function showParticipantMenu(event, tg) {
        currentSelectedParticipantTg = tg;
        if (participantMenu) {
            participantMenu.style.display = 'block';
            participantMenu.style.left = `${event.pageX - 160}px`;
            participantMenu.style.top = `${event.pageY}px`;
        }
    }

    // Привязка обработчиков для элементов, которые всегда на странице
    document.addEventListener('click', () => {
        if (contextMenu) contextMenu.style.display = 'none';
        if (participantMenu) participantMenu.style.display = 'none';
    });

    const closeReviewPanelBtn = document.getElementById("close-review-panel");
    if (closeReviewPanelBtn) closeReviewPanelBtn.onclick = () => reviewPanel.style.display = 'none';

    const closeModalBtn = document.getElementById("close-modal");
    if (closeModalBtn) closeModalBtn.onclick = () => workModal.style.display = 'none';

    // Удаление работы
    const btnDeleteAction = document.getElementById("delete-action");
    if (btnDeleteAction) btnDeleteAction.onclick = () => {
        if (confirm("Вы уверены, что хотите удалить эту работу?")) {
            activeProject.submissions = activeProject.submissions.filter(s => s.id !== currentSelectedSubmissionId);
            renderTable(); contextMenu.style.display = 'none'; updateStatsCounters();
        }
    };

    // Сброс результатов одной работы
    const btnResetSingle = document.getElementById("reset-single-action");
    if (btnResetSingle) btnResetSingle.onclick = () => {
        const sub = activeProject.submissions.find(s => s.id === currentSelectedSubmissionId);
        if (sub && confirm(`Сбросить результаты для ${sub.name}?`)) {
            sub.reviews = []; sub.status = 'checking';
            renderTable(); updateStatsCounters();
        }
    };

    // Изменение роли участника
    document.querySelectorAll('.role-option').forEach(option => {
        option.onclick = function () {
            const newRole = this.getAttribute('data-role');
            const participant = activeProject.experts.find(p => p.tg === currentSelectedParticipantTg);
            if (participant) { participant.role = newRole; renderExperts(); }
            if (participantMenu) participantMenu.style.display = 'none';
        };
    });

    const btnRemoveParticipant = document.getElementById("remove-participant");
    if (btnRemoveParticipant) btnRemoveParticipant.onclick = () => {
        if (confirm("Исключить участника из проекта?")) {
            activeProject.experts = activeProject.experts.filter(p => p.tg !== currentSelectedParticipantTg);
            renderExperts(); participantMenu.style.display = 'none';
        }
    };

    // Глазик и Рефреш кода
    const btnToggleCode = document.getElementById("toggle-code-btn");
    const codeDisplay = document.getElementById("project-code-display");
    if (btnToggleCode && codeDisplay) {
        btnToggleCode.onclick = () => {
            isCodeVisible = !isCodeVisible;
            if (isCodeVisible) { codeDisplay.innerText = activeProject.code; codeDisplay.style.letterSpacing = "normal"; }
            else { codeDisplay.innerText = "•••••••••••••••••••••••"; codeDisplay.style.letterSpacing = "2px"; }
        };
    }

    const btnRefreshCode = document.getElementById("refresh-code-btn");
    if (btnRefreshCode) btnRefreshCode.onclick = () => {
        if (confirm("Старый код перестанет работать. Продолжить?")) {
            activeProject.code = generateProjectCode(activeProject.type);
            if (isCodeVisible && codeDisplay) codeDisplay.innerText = activeProject.code;
        }
    };

    // Поиск
    const searchInput = document.querySelector('.table-actions input');
    if (searchInput) searchInput.oninput = (e) => renderTable(e.target.value);

    // Модалка: Панель Управления
    const btnOpenControl = document.getElementById("btn-open-control");
    if (btnOpenControl && controlModal) {
        btnOpenControl.onclick = () => {
            if (activeProject.isSystemRunning === undefined) activeProject.isSystemRunning = false;
            const reqInput = document.getElementById("panel-req-reviews");
            if (reqInput) reqInput.value = activeProject.requiredReviews || 2;
            controlModal.style.display = 'flex';
        };
    }
    const btnCloseControl = document.getElementById("close-control-modal");
    if (btnCloseControl) btnCloseControl.onclick = () => controlModal.style.display = 'none';

    document.getElementById("btn-start-grading").onclick = () => { activeProject.isSystemRunning = true; alert("Проверка запущена!"); updateDashboard(); };
    document.getElementById("btn-stop-grading").onclick = () => { activeProject.isSystemRunning = false; alert("Проверка остановлена."); updateDashboard(); };
    document.getElementById("btn-global-reset").onclick = () => {
        if (confirm("Очистить ВСЕ проверки в этом проекте?")) {
            activeProject.submissions.forEach(sub => { sub.reviews = []; sub.status = 'checking'; });
            renderTable(); updateStatsCounters(); alert("Все проверки сброшены.");
        }
    };
    document.getElementById("btn-global-refresh").onclick = () => {
        if (confirm("Переназначить экспертов для всех работ?")) {
            activeProject.submissions.forEach(sub => { sub.assignedExperts = []; assignRandomExpert(sub.id); });
            renderTable(); alert("Эксперты переназначены.");
        }
    };

    // Модалка: Заявки
    const btnRequests = document.getElementById("btn-requests");
    if (btnRequests && requestsModal) {
        btnRequests.onclick = (e) => { e.preventDefault(); renderRequestsModal(); requestsModal.style.display = 'flex'; };
    }
    const closeRequestsModal = document.getElementById("close-requests-modal");
    if (closeRequestsModal) closeRequestsModal.onclick = () => requestsModal.style.display = 'none';

    // Модалка: Создание проекта
    const btnAddProject = document.querySelector(".add-btn");
    if (btnAddProject && createProjectModal) btnAddProject.onclick = () => createProjectModal.style.display = 'flex';
    const closeCreateModal = document.getElementById("close-create-modal");
    if (closeCreateModal) closeCreateModal.onclick = () => createProjectModal.style.display = 'none';

    document.getElementById("btn-save-project").onclick = () => {
        const nameInput = document.getElementById("new-project-name").value;
        const typeInput = document.getElementById("new-project-type").value;
        if (!nameInput.trim()) return alert("Введите название проекта!");
        const newProject = { id: Date.now(), name: nameInput, type: typeInput, date: new Date().toISOString().split('T')[0], code: generateProjectCode(typeInput), submissions: [], experts: [], joinRequests: [] };
        projects.push(newProject); activeProject = newProject;
        document.getElementById("new-project-name").value = "";
        createProjectModal.style.display = 'none'; updateDashboard();
    };

    // Модалка: Приглашения
    const btnInvite = document.getElementById("btn-invite");
    if (btnInvite && inviteModal) {
        btnInvite.onclick = () => {
            document.getElementById("invite-tg-tag").value = '';
            document.getElementById("invite-role").innerHTML = `
                <option value="Эксперт">🎓 Эксперт</option>
                <option value="Соорганизатор">🛡️ Соорганизатор</option>
            `;
            inviteModal.style.display = 'flex';
        };
    }
    const closeInviteModal = document.getElementById("close-invite-modal");
    if (closeInviteModal) closeInviteModal.onclick = () => inviteModal.style.display = 'none';

    document.getElementById("btn-send-invite").onclick = () => {
        const tgTag = document.getElementById("invite-tg-tag").value.trim();
        const role = document.getElementById("invite-role").value;
        if (!tgTag || !tgTag.startsWith('@')) return alert("Введите корректный Telegram тег (с @)");
        const mockName = "Новый " + tgTag.substring(1);
        activeProject.experts.push({ initials: mockName.substring(0, 2).toUpperCase(), name: mockName, tg: tgTag, role: role });
        alert(`Приглашение отправлено ${tgTag}`);
        inviteModal.style.display = 'none'; renderExperts();
    };

    // ==========================================
    // 7. СТАРТ ПРИЛОЖЕНИЯ
    // ==========================================
    updateDashboard();
    setInterval(updateStatsCounters, 30000);
    // ==========================================
    // ЛОГИКА УДАЛЕНИЯ ПРОЕКТА
    // ==========================================
    const btnDeleteProject = document.getElementById("btn-delete-project");
    if (btnDeleteProject) {
        btnDeleteProject.onclick = () => {
            if (confirm(`Вы уверены, что хотите навсегда удалить проект "${activeProject.name}"? Это действие необратимо!`)) {
                // Удаляем проект из массива
                projects = projects.filter(p => p.id !== activeProject.id);

                // Если проектов больше не осталось, создаем пустую заглушку, чтобы не сломать интерфейс
                if (projects.length === 0) {
                    projects.push({
                        id: Date.now(),
                        name: "Пустой проект",
                        type: "p2p",
                        date: new Date().toISOString().split('T')[0],
                        code: "PTP-XXXX-XXXX-XXXX-XXXX",
                        submissions: [],
                        experts: [],
                        joinRequests: []
                    });
                }

                activeProject = projects[0];
                updateDashboard();
                document.getElementById("control-panel-modal").style.display = 'none';
            }
        };
    }

    // ==========================================
    // ЛОГИКА ГРУППОВЫХ ОПЕРАЦИЙ (МУЛЬТИ-ВЫБОР)
    // ==========================================
    const btnToggleSelection = document.getElementById("btn-toggle-selection");
    const batchToolbar = document.getElementById("batch-actions-toolbar");

    // Вкл/Выкл режима выбора
    if (btnToggleSelection) {
        btnToggleSelection.onclick = () => {
            isSelectionMode = !isSelectionMode;
            selectedSubmissionIds = []; // Сбрасываем выбранные элементы при переключении

            if (isSelectionMode) {
                btnToggleSelection.innerText = "❌ Отменить выбор";
                btnToggleSelection.style.borderColor = "#ef4444";
                btnToggleSelection.style.color = "#ef4444";
                batchToolbar.style.display = "flex";
            } else {
                btnToggleSelection.innerText = "☑️ Выбрать работы";
                btnToggleSelection.style.borderColor = "var(--border-color)";
                btnToggleSelection.style.color = "var(--text-main)";
                batchToolbar.style.display = "none";
                if (document.getElementById("btn-select-all")) document.getElementById("btn-select-all").innerText = "☑️ Выбрать все";
            }

            const searchVal = document.querySelector('.table-actions input')?.value || "";
            renderTable(searchVal);
        };
    }

    // 1. Удалить выделенные
    document.getElementById("btn-batch-delete").onclick = () => {
        if (selectedSubmissionIds.length === 0) return alert("Выберите хотя бы одну работу!");
        if (confirm(`Удалить ${selectedSubmissionIds.length} выделенных работ?`)) {
            activeProject.submissions = activeProject.submissions.filter(s => !selectedSubmissionIds.includes(s.id));
            selectedSubmissionIds = []; // Очищаем выбор
            const searchVal = document.querySelector('.table-actions input')?.value || "";
            renderTable(searchVal);
            updateStatsCounters();
        }
    };

    // 2. Переназначить выделенных
    document.getElementById("btn-batch-reassign").onclick = () => {
        if (selectedSubmissionIds.length === 0) return alert("Выберите хотя бы одну работу!");
        const pool = activeProject.experts.filter(e => e.role === 'Эксперт' || e.role === 'Соорганизатор');
        if (pool.length === 0) return alert("В проекте нет ни одного эксперта!");

        if (confirm(`Переназначить экспертов для ${selectedSubmissionIds.length} работ?`)) {
            const reqReviews = activeProject.requiredReviews || 2;

            activeProject.submissions.forEach(sub => {
                if (selectedSubmissionIds.includes(sub.id)) {
                    sub.assignedExperts = []; // Сбрасываем старых
                    // Назначаем новых тихим способом (без внутренних алертов)
                    while (sub.assignedExperts.length < reqReviews) {
                        const available = pool.filter(e => !sub.assignedExperts.includes(e.name));
                        if (available.length === 0) break;
                        const randomExpert = available[Math.floor(Math.random() * available.length)];
                        sub.assignedExperts.push(randomExpert.name);
                    }
                }
            });

            selectedSubmissionIds = [];
            const searchVal = document.querySelector('.table-actions input')?.value || "";
            renderTable(searchVal);
            updateStatsCounters();
            alert("Эксперты успешно переназначены.");
        }
    };

    // 3. Отправить без проверки организатора
    document.getElementById("btn-batch-send").onclick = () => {
        if (selectedSubmissionIds.length === 0) return alert("Выберите хотя бы одну работу!");
        if (confirm(`Отправить результаты ${selectedSubmissionIds.length} работ ученикам напрямую? (Будет отправлена средняя оценка без комментария)`)) {
            let sentCount = 0;
            activeProject.submissions.forEach(sub => {
                // Если работа выбрана И у нее есть отзывы И она еще не закрыта
                if (selectedSubmissionIds.includes(sub.id) && sub.reviews && sub.reviews.length > 0 && sub.status !== 'done') {
                    sub.status = 'done';
                    sentCount++;
                }
            });

            selectedSubmissionIds = [];
            const searchVal = document.querySelector('.table-actions input')?.value || "";
            renderTable(searchVal);
            updateStatsCounters();
            alert(`Успешно отправлено работ: ${sentCount}. (Работы без проверок экспертов были проигнорированы).`);
        }
    };
    // 4. Выбрать все / Снять выделение
    const btnSelectAll = document.getElementById("btn-select-all");
    if (btnSelectAll) {
        btnSelectAll.onclick = () => {
            // Находим все видимые чекбоксы на странице
            const checkboxes = document.querySelectorAll('.sub-checkbox');
            if (checkboxes.length === 0) return;

            // Проверяем, выбраны ли уже ВСЕ видимые работы
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);

            if (allChecked) {
                // Если выбраны все - снимаем выделение со всех
                checkboxes.forEach(cb => {
                    cb.checked = false;
                    const id = parseInt(cb.getAttribute('data-id'));
                    selectedSubmissionIds = selectedSubmissionIds.filter(sId => sId !== id);
                });
                btnSelectAll.innerText = "☑️ Выбрать все";
            } else {
                // Если выбраны не все - выделяем все видимые
                checkboxes.forEach(cb => {
                    cb.checked = true;
                    const id = parseInt(cb.getAttribute('data-id'));
                    if (!selectedSubmissionIds.includes(id)) {
                        selectedSubmissionIds.push(id);
                    }
                });
                btnSelectAll.innerText = "◻️ Снять выделение";
            }
        };
    }
});