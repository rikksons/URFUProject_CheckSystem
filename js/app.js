document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ И ПЕРЕМЕННЫХ
    // ==========================================
    let projects = [];
    let activeProject = null;
    let currentUser = null;
    let activeIterationId = "it_1";
    let currentRole = 'organizer';
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
        const sum = reviews.reduce((acc, curr) => acc + (curr.score || 0), 0);
        return (sum / reviews.length).toFixed(1);
    }

    function getSubmissionStatus(sub) {
        if (!sub) return { class: 'waiting', text: 'Нет данных', icon: '⚠️' };
        if (sub.status === 'done') return { class: 'done', text: 'Проверено', icon: '✔️' };

        const reqReviews = activeProject?.requiredReviews || 2;
        if (!sub.assignedExperts) {
            sub.assignedExperts = (sub.reviewer && sub.reviewer !== '—') ? [sub.reviewer] : [];
        }

        const assigned = sub.assignedExperts?.length || 0;
        const reviewsCount = sub.reviews?.length || 0;

        if (assigned < reqReviews) return { class: 'no-expert', text: `Нужно экспертов: ${assigned}/${reqReviews}`, icon: '⚠️', needsRefresh: true };
        if (reviewsCount < reqReviews) return { class: 'checking', text: `На проверке (${reviewsCount}/${reqReviews})`, icon: '🕒' };

        return { class: 'waiting', text: 'Ожидание', icon: '⏳' };
    }

    function updateStatsCounters() {
        if (!activeProject) return;
        const total = activeProject.submissions?.length || 0;
        const reviewed = activeProject.submissions?.filter(sub => sub.status === 'done').length || 0;
        const checking = activeProject.submissions?.filter(sub => sub.status === 'checking').length || 0;
        const waiting = activeProject.submissions?.filter(sub => sub.status === 'waiting').length || 0;

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setVal('stat-total', total);
        setVal('stat-reviewed', reviewed);
        setVal('stat-checking', checking);
        setVal('stat-waiting', waiting);
    }

    // ==========================================
    // 3. ФУНКЦИИ РЕНДЕРА
    // ==========================================
    function renderSidebarProjects() {
        const container = document.querySelector(".projects-list");
        if (!container) return;

        Array.from(container.children).forEach(child => {
            if (!child.classList || !child.classList.contains('section-title')) child.remove();
        });

        if (!Array.isArray(projects)) projects = [];

        projects.forEach(proj => {
            if (!proj) return;

            const div = document.createElement("div");
            div.className = `project-item ${proj.id === activeProject?.id ? 'active' : ''}`;
            const badgeHTML = proj.joinRequests && proj.joinRequests.length > 0
                ? `<span class="badge orange" style="background: #ef4444; color:white;">${proj.joinRequests.length} заявки</span>`
                : `<span class="badge ${proj.type === 'p2p' ? 'orange' : 'yellow'}">${(proj.type || 'unknown').toUpperCase()}</span>`;

            const firstChar = proj.name ? proj.name.charAt(0) : '?';
            const projectName = (proj.name || 'Без названия').substring(0, 15);

            div.innerHTML = `
                <div class="project-icon ${proj.type === 'p2p' ? 'blue' : 'green'}">${firstChar}</div>
                <div class="project-info" style="width: 100%;">
                    <div class="project-name">${projectName}... ${badgeHTML}</div>
                    <div class="project-meta">📄 ${proj.submissions?.length || 0} 👥 ${proj.experts?.length || 0}</div>
                </div>
            `;
            div.addEventListener('click', () => { activeProject = proj; updateDashboard(); });
            container.appendChild(div);
        });
    }

    let isCodeVisible = false;

    function renderHeader() {
        if (!activeProject) return;

        const statusDot = activeProject.isSystemRunning
            ? '<span class="status-indicator active"></span>Запущено'
            : '<span class="status-indicator paused"></span>На паузе';

        const titleEl = document.getElementById("header-title");
        if (titleEl) {
            titleEl.innerHTML = `${activeProject.name || 'Проект'} <span style="font-size: 12px; font-weight: normal; margin-left: 10px;">${statusDot}</span>`;
        }

        const iconEl = document.getElementById("header-icon");
        if (iconEl) {
            iconEl.innerText = activeProject.name ? activeProject.name.charAt(0) : '?';
            iconEl.className = `project-icon large ${activeProject.type === 'p2p' ? 'blue' : 'green'}`;
        }

        const typeEl = document.getElementById("header-type");
        if (typeEl) typeEl.innerText = activeProject.type === 'p2p' ? "Peer-to-Peer" : "Экзаменационный";

        const dateEl = document.getElementById("header-date");
        if (dateEl) dateEl.innerText = activeProject.date || '—';

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

    function renderTable(searchQuery = "") {
        const tableBody = document.getElementById("table-body");
        if (!tableBody || !activeProject) return;
        tableBody.innerHTML = "";

        const filter = (typeof searchQuery === 'string') ? searchQuery.toLowerCase() : "";
        const submissions = activeProject.submissions || [];
        const filteredSubmissions = submissions.filter(sub => {
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

            const checkboxHTML = isSelectionMode
                ? `<input type="checkbox" class="sub-checkbox" data-id="${sub.id}" ${selectedSubmissionIds.includes(sub.id) ? 'checked' : ''} style="margin-right: 10px; cursor: pointer; transform: scale(1.2);">`
                : '';

            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${checkboxHTML}
                        <span style="color: var(--text-muted); font-size: 12px;">${sub.studentInitials || ''}</span>
                        ${sub.name || 'Без названия'}
                    </div>
                </td>
                <td style="color: var(--text-muted);">${sub.telegram || '—'}</td>
                <td>${sub.date || '—'}</td>
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

            const checkbox = tr.querySelector('.sub-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        if (!selectedSubmissionIds.includes(sub.id)) selectedSubmissionIds.push(sub.id);
                    } else {
                        selectedSubmissionIds = selectedSubmissionIds.filter(id => id !== sub.id);
                    }
                });
            }

            const refreshBtn = tr.querySelector('.refresh-expert-btn');
            if (refreshBtn) refreshBtn.onclick = (e) => { e.stopPropagation(); assignRandomExpert(sub.id); };

            const viewBtn = tr.querySelector('.btn-view');
            if (viewBtn) viewBtn.onclick = (e) => { e.stopPropagation(); openWorkModal(sub); };

            const reviewsBtn = tr.querySelector('.btn-reviews');
            if (reviewsBtn) reviewsBtn.onclick = (e) => { e.stopPropagation(); showReviewsPanel(sub, avgScore); };

            const menuBtn = tr.querySelector('.btn-menu');
            if (menuBtn) menuBtn.onclick = (e) => { e.stopPropagation(); showContextMenu(e, sub.id); };

            tableBody.appendChild(tr);
        });
    }

    function renderExperts() {
        const participantsList = document.getElementById("participants-list");
        if (!participantsList) return;
        participantsList.innerHTML = "";

        if (!activeProject || !activeProject.experts || activeProject.experts.length === 0) {
            participantsList.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 20px;">Нет участников</p>`;
            return;
        }

        activeProject.experts.forEach(exp => {
            if (!exp) return;

            const div = document.createElement("div");
            div.className = "participant-item";
            div.innerHTML = `
                <div class="avatar">${exp.initials || '??'}</div>
                <div style="flex: 1;">
                    <div class="p-name">${exp.name || 'Unknown'}</div>
                    <div class="p-tg" style="display: flex; justify-content: space-between; align-items: center;">
                        ${exp.tg || '@unknown'}
                        <span class="btn-participant-menu">⋮</span>
                    </div>
                    <div style="font-size: 11px; color: ${exp.role === 'Соорганизатор' ? '#3b82f6' : 'var(--text-muted)'}; font-weight: bold;">${exp.role || 'Участник'}</div>
                </div>
            `;
            const menuBtn = div.querySelector('.btn-participant-menu');
            if (menuBtn && exp.tg) {
                menuBtn.onclick = (e) => { e.stopPropagation(); showParticipantMenu(e, exp.tg); };
            }
            participantsList.appendChild(div);
        });
    }

    // ==========================================
    // 4. ЛОГИКА ЗАЯВОК
    // ==========================================
    function updateRequestsBadge() {
        const badge = document.getElementById("requests-badge");
        if (!badge || !activeProject) return;
        const count = Array.isArray(activeProject.joinRequests) ? activeProject.joinRequests.length : 0;
        if (count > 0) { badge.style.display = 'inline-block'; badge.innerText = count; }
        else { badge.style.display = 'none'; }
    }

    function renderRequestsModal() {
        const list = document.getElementById("requests-list");
        if (!list || !activeProject) return;
        list.innerHTML = "";

        if (!Array.isArray(activeProject.joinRequests) || activeProject.joinRequests.length === 0) {
            list.innerHTML = `<p style="color: var(--text-muted); text-align: center;">Новых заявок нет.</p>`;
            return;
        }

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

            const acceptBtn = div.querySelector('.btn-accept');
            if (acceptBtn) {
                acceptBtn.onclick = () => {
                    const selectedRole = document.getElementById(`role-${reqId}`).value;
                    if (!activeProject.experts) activeProject.experts = [];
                    activeProject.experts.push({ initials: reqName.substring(0, 2).toUpperCase(), name: reqName, tg: reqTg, role: selectedRole });
                    activeProject.joinRequests = activeProject.joinRequests.filter(r => r.id !== req.id);
                    renderRequestsModal();
                    updateDashboard();
                };
            }

            const rejectBtn = div.querySelector('.btn-reject');
            if (rejectBtn) {
                rejectBtn.onclick = () => {
                    activeProject.joinRequests = activeProject.joinRequests.filter(r => r.id !== req.id);
                    renderRequestsModal();
                    updateDashboard();
                };
            }
            list.appendChild(div);
        });
    }

    // ==========================================
    // 5. ДЕЙСТВИЯ
    // ==========================================
    function assignRandomExpert(submissionId) {
        if (!activeProject) return;
        const submission = activeProject.submissions?.find(s => s.id === submissionId);
        if (!submission) return;
        if (!submission.assignedExperts) submission.assignedExperts = [];

        const reqReviews = activeProject.requiredReviews || 2;
        const pool = activeProject.experts?.filter(e => e.role === 'Эксперт' || e.role === 'Соорганизатор') || [];

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
        if (nameEl && workModal && submission) {
            nameEl.innerText = `Работа: ${submission.name || 'Без названия'} (${submission.telegram || '—'})`;
            workModal.style.display = 'flex';
        }
    }

    function showReviewsPanel(submission, avgScore) {
        const reviewContent = document.getElementById("review-content");
        if (!reviewPanel || !reviewContent || !submission) return;
        reviewPanel.style.display = 'block';

        let htmlContent = `
            <div style="margin-bottom: 15px;">
                <h4 style="color: var(--text-muted); margin-bottom: 5px;">Проверки работы: ${submission.name || 'Без названия'}</h4>
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
                                <div class="avatar" style="width: 30px; height: 30px; font-size: 10px; background-color: #4b5563;">${(review.reviewerName || '??').substring(0, 2).toUpperCase()}</div>
                                <div><div style="font-weight: bold; color: white; font-size: 14px;">${review.reviewerName || 'Unknown'}</div><div style="font-size: 12px; color: var(--text-muted);">${review.reviewerTg || '—'}</div></div>
                            </div>
                            <div style="color: var(--status-orange); font-weight: bold;">Оценка: ⭐ ${(review.score || 0).toFixed(1)}</div>
                        </div>
                        <p style="color: var(--text-main); font-size: 14px; margin-top: 10px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px;">${review.comment || 'Нет комментария'}</p>
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
    // 6. КОНТЕКСТНЫЕ МЕНЮ
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

    // ==========================================
    // 7. ИНИЦИАЛИЗАЦИЯ API
    // ==========================================
    async function initApp() {
        try {
            const meResponse = await api.getMe();
            currentUser = meResponse.data || meResponse;

            const projectsResponse = await api.getProjects();
            projects = projectsResponse.data || projectsResponse;

            if (!Array.isArray(projects)) projects = [];

            if (projects.length > 0) {
                activeProject = projects[0];
                await loadProjectData(activeProject.id);
            }

            updateDashboard();
        } catch (error) {
            console.error("Ошибка инициализации:", error);
            alert("Не удалось загрузить данные с сервера.");
        }
    }

    async function loadProjectData(projectId) {
        try {
            const worksResponse = await api.getProjectWorks(projectId);
            const works = worksResponse.data || worksResponse;
            if (activeProject) {
                activeProject.submissions = Array.isArray(works) ? works : [];
            }
        } catch (e) {
            console.error("Ошибка загрузки работ:", e);
            if (activeProject) activeProject.submissions = [];
        }
    }

    // ==========================================
    // 8. ЭКСПЕРТНАЯ ЧАСТЬ
    // ==========================================
    function renderExpertView() {
        const workspace = document.getElementById("expert-workspace");
        if (!workspace || !activeProject || !currentUser) return;

        workspace.innerHTML = "";

        if (activeProject.type === 'p2p') {
            const myWork = activeProject.submissions?.find(s => s.telegram === currentUser.tg);

            if (!myWork) {
                workspace.innerHTML = `
                    <div style="text-align: center; padding: 60px; background: rgba(255,255,255,0.02); border: 2px dashed var(--border-color); border-radius: 12px;">
                        <h2 style="margin-bottom: 15px;">Добро пожаловать в P2P проект!</h2>
                        <p style="color: var(--text-muted); margin-bottom: 25px;">Сначала загрузите свою работу в систему.</p>
                        <button class="btn" style="background: var(--accent-blue); color: white; padding: 12px 24px;" onclick="simulateP2PUpload()">📤 Загрузить мою работу</button>
                    </div>
                `;
            } else {
                const workToReview = activeProject.submissions?.find(sub =>
                    sub.assignedExperts && sub.assignedExperts.includes(currentUser.name) && sub.telegram !== currentUser.tg
                );

                if (!workToReview) {
                    workspace.innerHTML = `
                        <div style="text-align: center; padding: 40px;">
                            <h3>✅ Ваша работа принята!</h3>
                            <p style="color: var(--text-muted); margin-top: 10px;">Ожидайте, пока система назначит вам чужую работу для проверки.</p>
                        </div>
                    `;
                } else {
                    workspace.innerHTML = `
                        <div style="display: flex; gap: 30px; align-items: flex-start;">
                            <div style="flex: 2; background: var(--bg-dark); border: 1px solid var(--border-color); padding: 20px; border-radius: 8px;">
                                <h4 style="color: var(--text-muted); margin-bottom: 15px;">Анонимная работа для проверки:</h4>
                                <div style="width: 100%; height: 500px; background: #374151; display: flex; align-items: center; justify-content: center; color: #9ca3af; border: 1px dashed #4b5563; border-radius: 8px;">
                                    [Скан или скриншот работы]
                                </div>
                            </div>
                            <div style="flex: 1; background: var(--bg-dark); border: 1px solid var(--border-color); padding: 25px; border-radius: 8px;">
                                <h3>Ваша оценка</h3>
                                <div style="margin-top: 20px;">
                                    <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Комментарий:</label>
                                    <textarea id="exp-comment" style="width: 100%; height: 150px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: white; border-radius: 6px; padding: 10px;"></textarea>
                                    
                                    <label style="display: block; font-size: 13px; color: var(--text-muted); margin-top: 20px; margin-bottom: 8px;">Оценка (0-10):</label>
                                    <input type="number" id="exp-score" step="0.1" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--status-orange); font-weight: bold; font-size: 20px; text-align: center; border-radius: 6px;">
                                    
                                    <button class="btn" style="width: 100%; background: var(--status-green); color: white; margin-top: 25px;" onclick="saveExpertReview(${workToReview.id})">💾 Сохранить</button>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
        } else {
            const myAssignedWorks = activeProject.submissions?.filter(sub =>
                sub.assignedExperts && sub.assignedExperts.includes(currentUser.name)
            ) || [];

            workspace.innerHTML = `
                <h3 style="margin-bottom: 20px;">Работы на проверку:</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Название работы</th>
                                <th>Дата сдачи</th>
                                <th>Ваш статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody id="expert-exam-body"></tbody>
                    </table>
                </div>
            `;

            const tbody = document.getElementById("expert-exam-body");
            if (myAssignedWorks.length === 0) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 30px; color: var(--text-muted);">У вас нет назначенных работ.</td></tr>`;
            } else {
                myAssignedWorks.forEach(sub => {
                    const myReview = sub.reviews?.find(r => r.reviewerTg === currentUser.tg);
                    const statusText = myReview ? `<span style="color: var(--status-green);">✅ Оценено (${myReview.score})</span>` : `<span style="color: var(--status-orange);">⏳ Ожидает проверки</span>`;

                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>${sub.name || 'Без названия'}</td>
                        <td>${sub.date || '—'}</td>
                        <td>${statusText}</td>
                        <td class="action-cell">
                            <span class="action-icon" onclick="openWorkModalById(${sub.id})" title="Просмотр">👁️</span>
                            <span class="action-icon" onclick="openExpertEvaluateModal(${sub.id})" title="Оценить">💬</span>
                        </td>
                    `;
                    if (tbody) tbody.appendChild(tr);
                });
            }
        }
    }

    // Глобальные функции для экспертной части
    window.simulateP2PUpload = async function () {
        if (!activeProject) return;
        try {
            await api.submitWork(activeProject.id, { title: "Моя работа", content: "https://storage.link/dummy_file.pdf", iteration_id: null });
            alert("Ваша работа успешно отправлена на бэкенд!");
            await loadProjectData(activeProject.id);
            updateDashboard();
        } catch (e) {
            console.error(e);
            alert("Ошибка при отправке работы.");
        }
    };

    window.saveExpertReview = async function (workId) {
        const comment = document.getElementById("exp-comment")?.value || document.getElementById("exam-comment")?.value;
        const score = parseFloat(document.getElementById("exp-score")?.value || document.getElementById("exam-score")?.value);

        if (!comment || isNaN(score)) return alert("Заполните все поля!");

        try {
            await api.submitReview(activeProject?.id, workId, { review: comment, rating: score });
            alert("Проверка сохранена на сервере!");

            const modal = document.getElementById("exam-review-modal");
            if (modal) modal.style.display = 'none';

            await loadProjectData(activeProject.id);
            updateDashboard();
        } catch (error) {
            console.error(error);
            alert("Ошибка при сохранении оценки на сервере.");
        }
    };

    window.openExpertEvaluateModal = function (id) {
        if (!activeProject) return;
        const sub = activeProject.submissions?.find(s => s.id === id);
        if (!sub) return;

        const myReview = sub.reviews?.find(r => r.reviewerTg === currentUser?.tg);

        let modal = document.getElementById("exam-review-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "exam-review-modal";
            modal.className = "modal";
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <span class="close-modal" onclick="document.getElementById('exam-review-modal').style.display='none'">&times;</span>
                <h3>Оценка работы</h3>
                <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 20px;">Проект: ${activeProject?.name || '—'}</p>
                <textarea id="exam-comment" style="width: 100%; height: 120px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: white; border-radius: 6px; padding: 10px;">${myReview ? myReview.comment : ''}</textarea>
                <input type="number" id="exam-score" step="0.1" value="${myReview ? myReview.score : ''}" style="width: 100px; padding: 10px; margin-top: 15px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--status-orange); font-weight: bold; font-size: 16px; border-radius: 6px;">
                <button class="btn" style="width: 100%; background: var(--status-green); color: white; margin-top: 20px;" onclick="saveExpertReview(${id})">💾 Сохранить проверку</button>
            </div>
        `;
        modal.style.display = 'flex';
    };

    window.openWorkModalById = function (id) {
        if (!activeProject) return;
        const sub = activeProject.submissions?.find(s => s.id === id);
        if (sub && typeof openWorkModal === 'function') openWorkModal(sub);
    };

    // ==========================================
    // 9. ОСНОВНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ
    // ==========================================
    function updateDashboard() {
        try {
            if (!activeProject) {
                console.warn("activeProject is null, skipping updateDashboard");
                return;
            }

            if (typeof renderSidebarProjects === 'function') renderSidebarProjects();
            if (typeof renderHeader === 'function') renderHeader();
            if (typeof renderExperts === 'function') renderExperts();
            if (typeof updateRequestsBadge === 'function') updateRequestsBadge();

            const orgWorkspace = document.getElementById("organizer-workspace");
            const expWorkspace = document.getElementById("expert-workspace");
            const btnRequests = document.getElementById("btn-requests");
            const btnOpenControl = document.getElementById("btn-open-control");
            const reviewPanelEl = document.getElementById("review-panel");

            const statsGrid = document.querySelector('.stats-grid');
            const tableContainer = document.querySelector('.table-container');
            const tableActions = document.querySelector('.table-actions');

            if (currentRole === 'organizer') {
                // ПОКАЗЫВАЕМ ОРГАНИЗАТОРА
                if (orgWorkspace) orgWorkspace.style.display = 'block';

                // 1. Гарантированно показываем таблицы и статистику
                if (statsGrid) statsGrid.style.display = 'grid';
                if (tableContainer) tableContainer.style.display = 'block';
                if (tableActions) tableActions.style.display = 'flex';

                // 2. Умная проверка типа проекта (даже если бэкенд спрятал type в description)
                const btnAddExamWork = document.getElementById("btn-add-exam-work");
                if (btnAddExamWork) {
                    const isExam = activeProject && (
                        activeProject.type === 'exam' ||
                        (activeProject.description && activeProject.description.includes('exam'))
                    );

                    if (isExam) {
                        btnAddExamWork.style.display = 'inline-block';
                    } else {
                        btnAddExamWork.style.display = 'none';
                    }
                }

                // 3. Скрываем инструменты эксперта
                if (expWorkspace) expWorkspace.style.display = 'none';
                if (btnRequests) btnRequests.style.display = 'flex';
                if (btnOpenControl) btnOpenControl.style.display = 'flex';
                if (reviewPanelEl) reviewPanelEl.style.display = 'none';

                if (typeof updateStatsCounters === 'function') updateStatsCounters();
                if (typeof renderTable === 'function') renderTable();

            } else {
                if (orgWorkspace) orgWorkspace.style.display = 'none';
                else {
                    if (statsGrid) statsGrid.style.display = 'none';
                    if (tableContainer) tableContainer.style.display = 'none';
                    if (tableActions) tableActions.style.display = 'none';
                }

                if (expWorkspace) expWorkspace.style.display = 'block';
                if (btnRequests) btnRequests.style.display = 'none';
                if (btnOpenControl) btnOpenControl.style.display = 'none';
                if (reviewPanelEl) reviewPanelEl.style.display = 'none';

                if (typeof renderExpertView === 'function') renderExpertView();
            }

            console.log("✅ Интерфейс успешно обновлен!");
        } catch (error) {
            console.error("❌ ОШИБКА В updateDashboard:", error);
        }
    }

    // ==========================================
    // 10. ПРИВЯЗКА ОБРАБОТЧИКОВ
    // ==========================================
    document.addEventListener('click', () => {
        if (contextMenu) contextMenu.style.display = 'none';
        if (participantMenu) participantMenu.style.display = 'none';
    });

    const closeReviewPanelBtn = document.getElementById("close-review-panel");
    if (closeReviewPanelBtn) closeReviewPanelBtn.onclick = () => {
        if (reviewPanel) reviewPanel.style.display = 'none';
    };

    const closeModalBtn = document.getElementById("close-modal");
    if (closeModalBtn) closeModalBtn.onclick = () => {
        if (workModal) workModal.style.display = 'none';
    };

    const btnDeleteAction = document.getElementById("delete-action");
    if (btnDeleteAction) {
        btnDeleteAction.onclick = () => {
            if (!activeProject) return;
            if (confirm("Вы уверены, что хотите удалить эту работу?")) {
                activeProject.submissions = activeProject.submissions?.filter(s => s.id !== currentSelectedSubmissionId) || [];
                renderTable();
                if (contextMenu) contextMenu.style.display = 'none';
                updateStatsCounters();
            }
        };
    }

    const btnResetSingle = document.getElementById("reset-single-action");
    if (btnResetSingle) {
        btnResetSingle.onclick = () => {
            if (!activeProject) return;
            const sub = activeProject.submissions?.find(s => s.id === currentSelectedSubmissionId);
            if (sub && confirm(`Сбросить результаты для ${sub.name}?`)) {
                sub.reviews = [];
                sub.status = 'checking';
                renderTable();
                updateStatsCounters();
            }
        };
    }

    document.querySelectorAll('.role-option').forEach(option => {
        option.onclick = function () {
            if (!activeProject) return;
            const newRole = this.getAttribute('data-role');
            const participant = activeProject.experts?.find(p => p.tg === currentSelectedParticipantTg);
            if (participant) { participant.role = newRole; renderExperts(); }
            if (participantMenu) participantMenu.style.display = 'none';
        };
    });

    const btnRemoveParticipant = document.getElementById("remove-participant");
    if (btnRemoveParticipant) {
        btnRemoveParticipant.onclick = () => {
            if (!activeProject) return;
            if (confirm("Исключить участника из проекта?")) {
                activeProject.experts = activeProject.experts?.filter(p => p.tg !== currentSelectedParticipantTg) || [];
                renderExperts();
                if (participantMenu) participantMenu.style.display = 'none';
            }
        };
    }

    const btnToggleCode = document.getElementById("toggle-code-btn");
    const codeDisplay = document.getElementById("project-code-display");
    if (btnToggleCode && codeDisplay && activeProject) {
        btnToggleCode.onclick = () => {
            isCodeVisible = !isCodeVisible;
            if (isCodeVisible) {
                codeDisplay.innerText = activeProject.code || '•••••';
                codeDisplay.style.letterSpacing = "normal";
            }
            else {
                codeDisplay.innerText = "•••••••••••••••••••••••";
                codeDisplay.style.letterSpacing = "2px";
            }
        };
    }

    const btnRefreshCode = document.getElementById("refresh-code-btn");
    if (btnRefreshCode && activeProject) {
        btnRefreshCode.onclick = () => {
            if (confirm("Старый код перестанет работать. Продолжить?")) {
                if (activeProject) {
                    activeProject.code = generateProjectCode(activeProject.type);
                    if (isCodeVisible && codeDisplay) codeDisplay.innerText = activeProject.code;
                }
            }
        };
    }

    const searchInput = document.querySelector('.table-actions input');
    if (searchInput) searchInput.oninput = (e) => renderTable(e.target.value);

    const btnOpenControl = document.getElementById("btn-open-control");
    if (btnOpenControl && controlModal) {
        btnOpenControl.onclick = () => {
            if (!activeProject) return;
            if (activeProject.isSystemRunning === undefined) activeProject.isSystemRunning = false;
            const reqInput = document.getElementById("panel-req-reviews");
            if (reqInput) reqInput.value = activeProject.requiredReviews || 2;
            controlModal.style.display = 'flex';
        };
    }

    const btnCloseControl = document.getElementById("close-control-modal");
    if (btnCloseControl) btnCloseControl.onclick = () => {
        if (controlModal) controlModal.style.display = 'none';
    };

    const btnStartGrading = document.getElementById("btn-start-grading");
    if (btnStartGrading) {
        btnStartGrading.onclick = async () => {
            if (!activeProject) return;
            try {
                await api.updateIterationStatus(activeProject.id, activeIterationId, "reviewing");
                activeProject.isSystemRunning = true;
                alert("Проверка запущена на сервере!");
                updateDashboard();
            } catch (e) {
                console.error(e);
                alert("Ошибка запуска на сервере!");
            }
        };
    }

    const btnStopGrading = document.getElementById("btn-stop-grading");
    if (btnStopGrading) {
        btnStopGrading.onclick = async () => {
            if (!activeProject) return;
            try {
                await api.updateIterationStatus(activeProject.id, activeIterationId, "closed");
                activeProject.isSystemRunning = false;
                alert("Проверка остановлена на сервере.");
                updateDashboard();
            } catch (e) {
                console.error(e);
                alert("Ошибка остановки на сервере!");
            }
        };
    }

    const btnGlobalRefresh = document.getElementById("btn-global-refresh");
    if (btnGlobalRefresh) {
        btnGlobalRefresh.onclick = async () => {
            if (!activeProject) return;
            if (confirm("Запустить алгоритм распределения на сервере?")) {
                try {
                    await api.assignRandomExperts(activeProject.id, 2);
                    alert("Эксперты успешно распределены сервером!");
                    await loadProjectData(activeProject.id);
                    renderTable();
                } catch (e) {
                    console.error(e);
                    alert("Ошибка распределения на сервере.");
                }
            }
        };
    }

    const btnRequestsEl = document.getElementById("btn-requests");
    if (btnRequestsEl && requestsModal) {
        btnRequestsEl.onclick = (e) => {
            e.preventDefault();
            renderRequestsModal();
            if (requestsModal) requestsModal.style.display = 'flex';
        };
    }

    const closeRequestsModal = document.getElementById("close-requests-modal");
    if (closeRequestsModal) closeRequestsModal.onclick = () => {
        if (requestsModal) requestsModal.style.display = 'none';
    };

    const btnAddProject = document.querySelector(".add-btn");
    if (btnAddProject && createProjectModal) {
        btnAddProject.onclick = () => {
            if (createProjectModal) createProjectModal.style.display = 'flex';
        };
    }

    const closeCreateModal = document.getElementById("close-create-modal");
    if (closeCreateModal) closeCreateModal.onclick = () => {
        if (createProjectModal) createProjectModal.style.display = 'none';
    };

    const btnSaveProject = document.getElementById("btn-save-project");
    if (btnSaveProject) {
        btnSaveProject.onclick = async () => {
            const nameInput = document.getElementById("new-project-name")?.value;
            const typeInput = document.getElementById("new-project-type")?.value;

            if (!nameInput?.trim()) return alert("Введите название проекта!");

            try {
                await api.createProject({
                    project_name: nameInput,
                    description: `Проект типа ${typeInput}`,
                    status: "active"
                });

                const nameInputField = document.getElementById("new-project-name");
                if (nameInputField) nameInputField.value = "";

                if (createProjectModal) createProjectModal.style.display = 'none';

                alert("✅ Проект успешно создан!");
                await initApp();
            } catch (error) {
                console.error(error);
                alert("❌ Ошибка при создании проекта на сервере.");
            }
        };
    }

    const btnInvite = document.getElementById("btn-invite");
    if (btnInvite && inviteModal) {
        btnInvite.onclick = () => {
            const tgInput = document.getElementById("invite-tg-tag");
            if (tgInput) tgInput.value = '';

            const roleSelect = document.getElementById("invite-role");
            if (roleSelect) {
                roleSelect.innerHTML = `
                    <option value="Эксперт">🎓 Эксперт</option>
                    <option value="Соорганизатор">🛡️ Соорганизатор</option>
                `;
            }
            inviteModal.style.display = 'flex';
        };
    }

    const closeInviteModal = document.getElementById("close-invite-modal");
    if (closeInviteModal) closeInviteModal.onclick = () => {
        if (inviteModal) inviteModal.style.display = 'none';
    };

    const btnSendInvite = document.getElementById("btn-send-invite");
    if (btnSendInvite) {
        btnSendInvite.onclick = () => {
            if (!activeProject) return;
            const tgTag = document.getElementById("invite-tg-tag")?.value.trim();
            const role = document.getElementById("invite-role")?.value;
            if (!tgTag || !tgTag.startsWith('@')) return alert("Введите корректный Telegram тег (с @)");
            const mockName = "Новый " + tgTag.substring(1);
            if (!activeProject.experts) activeProject.experts = [];
            activeProject.experts.push({ initials: mockName.substring(0, 2).toUpperCase(), name: mockName, tg: tgTag, role: role });
            alert(`Приглашение отправлено ${tgTag}`);
            if (inviteModal) inviteModal.style.display = 'none';
            renderExperts();
        };
    }

    const btnDeleteProject = document.getElementById("btn-delete-project");
    if (btnDeleteProject) {
        btnDeleteProject.onclick = async () => {
            if (!activeProject) return;
            if (confirm(`Вы уверены, что хотите навсегда удалить проект "${activeProject.name}"? Это действие необратимо!`)) {
                try {
                    await api.deleteProject(activeProject.id);
                    const controlModalEl = document.getElementById("control-panel-modal");
                    if (controlModalEl) controlModalEl.style.display = 'none';
                    alert("✅ Проект удален!");
                    await initApp();
                } catch (error) {
                    console.error(error);
                    alert("❌ Ошибка при удалении проекта на сервере.");
                }
            }
        };
    }

    // ==========================================
    // 11. ГРУППОВЫЕ ОПЕРАЦИИ
    // ==========================================
    const btnToggleSelection = document.getElementById("btn-toggle-selection");
    const batchToolbar = document.getElementById("batch-actions-toolbar");

    if (btnToggleSelection) {
        btnToggleSelection.onclick = () => {
            isSelectionMode = !isSelectionMode;
            selectedSubmissionIds = [];

            if (isSelectionMode) {
                btnToggleSelection.innerText = "❌ Отменить выбор";
                btnToggleSelection.style.borderColor = "#ef4444";
                btnToggleSelection.style.color = "#ef4444";
                if (batchToolbar) batchToolbar.style.display = "flex";
            } else {
                btnToggleSelection.innerText = "☑️ Выбрать работы";
                btnToggleSelection.style.borderColor = "var(--border-color)";
                btnToggleSelection.style.color = "var(--text-main)";
                if (batchToolbar) batchToolbar.style.display = "none";
                const selectAllBtn = document.getElementById("btn-select-all");
                if (selectAllBtn) selectAllBtn.innerText = "☑️ Выбрать все";
            }

            const searchVal = document.querySelector('.table-actions input')?.value || "";
            renderTable(searchVal);
        };
    }

    const btnBatchDelete = document.getElementById("btn-batch-delete");
    if (btnBatchDelete) {
        btnBatchDelete.onclick = () => {
            if (!activeProject) return;
            if (selectedSubmissionIds.length === 0) return alert("Выберите хотя бы одну работу!");
            if (confirm(`Удалить ${selectedSubmissionIds.length} выделенных работ?`)) {
                activeProject.submissions = activeProject.submissions?.filter(s => !selectedSubmissionIds.includes(s.id)) || [];
                selectedSubmissionIds = [];
                const searchVal = document.querySelector('.table-actions input')?.value || "";
                renderTable(searchVal);
                updateStatsCounters();
            }
        };
    }

    const btnBatchReassign = document.getElementById("btn-batch-reassign");
    if (btnBatchReassign) {
        btnBatchReassign.onclick = () => {
            if (!activeProject) return;
            if (selectedSubmissionIds.length === 0) return alert("Выберите хотя бы одну работу!");
            const pool = activeProject.experts?.filter(e => e.role === 'Эксперт' || e.role === 'Соорганизатор') || [];
            if (pool.length === 0) return alert("В проекте нет ни одного эксперта!");

            if (confirm(`Переназначить экспертов для ${selectedSubmissionIds.length} работ?`)) {
                const reqReviews = activeProject.requiredReviews || 2;

                activeProject.submissions?.forEach(sub => {
                    if (selectedSubmissionIds.includes(sub.id)) {
                        sub.assignedExperts = [];
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
    }

    const btnBatchSend = document.getElementById("btn-batch-send");
    if (btnBatchSend) {
        btnBatchSend.onclick = () => {
            if (!activeProject) return;
            if (selectedSubmissionIds.length === 0) return alert("Выберите хотя бы одну работу!");
            if (confirm(`Отправить результаты ${selectedSubmissionIds.length} работ ученикам напрямую?`)) {
                let sentCount = 0;
                activeProject.submissions?.forEach(sub => {
                    if (selectedSubmissionIds.includes(sub.id) && sub.reviews && sub.reviews.length > 0 && sub.status !== 'done') {
                        sub.status = 'done';
                        sentCount++;
                    }
                });

                selectedSubmissionIds = [];
                const searchVal = document.querySelector('.table-actions input')?.value || "";
                renderTable(searchVal);
                updateStatsCounters();
                alert(`Успешно отправлено работ: ${sentCount}.`);
            }
        };
    }

    const btnSelectAll = document.getElementById("btn-select-all");
    if (btnSelectAll) {
        btnSelectAll.onclick = () => {
            const checkboxes = document.querySelectorAll('.sub-checkbox');
            if (checkboxes.length === 0) return;

            const allChecked = Array.from(checkboxes).every(cb => cb.checked);

            if (allChecked) {
                checkboxes.forEach(cb => {
                    cb.checked = false;
                    const id = parseInt(cb.getAttribute('data-id'));
                    selectedSubmissionIds = selectedSubmissionIds.filter(sId => sId !== id);
                });
                btnSelectAll.innerText = "☑️ Выбрать все";
            } else {
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

    // ==========================================
    // 12. РОЛЕВОЙ ПЕРЕКЛЮЧАТЕЛЬ
    // ==========================================
    const roleSelector = document.getElementById("global-role-selector");
    if (roleSelector) {
        roleSelector.onchange = (e) => {
            currentRole = e.target.value;
            console.log("🔄 Переключение роли на:", currentRole);
            updateDashboard();
        };
    }
    // ==========================================
    // ЛОГИКА ЗАГРУЗКИ РАБОТЫ (ЭКЗАМЕН) - API READY
    // ==========================================

    // Открытие модалки
    const btnAddExamWork = document.getElementById("btn-add-exam-work");
    const uploadExamModal = document.getElementById("upload-exam-modal");

    if (btnAddExamWork && uploadExamModal) {
        btnAddExamWork.onclick = () => {
            document.getElementById("exam-file-url").value = ""; // Очищаем поле
            uploadExamModal.style.display = "flex";
        };
    }

    // Закрытие модалки
    const closeUploadExam = document.getElementById("close-upload-exam");
    if (closeUploadExam) {
        closeUploadExam.onclick = () => {
            uploadExamModal.style.display = "none";
        };
    }

    // Отправка на бэкенд
    const btnSubmitExamWork = document.getElementById("btn-submit-exam-work");
    if (btnSubmitExamWork) {
        btnSubmitExamWork.onclick = async () => {
            const fileUrl = document.getElementById("exam-file-url").value.trim();

            if (!fileUrl) return alert("Пожалуйста, введите ссылку на файл!");

            try {
                // Отправляем POST /projects/{id}/works
                await api.submitWork(activeProject.id, fileUrl);

                alert("✅ Работа успешно добавлена!");
                uploadExamModal.style.display = "none";

                // Подтягиваем свежий список работ с бэкенда
                if (typeof loadProjectData === 'function') {
                    await loadProjectData(activeProject.id);
                }

                // Перерисовываем интерфейс (таблицу)
                updateDashboard();

            } catch (error) {
                console.error("Ошибка загрузки работы:", error);
                alert("❌ Ошибка при отправке работы на сервер.");
            }
        };
    }
    // ==========================================
    // 13. ЗАПУСК
    // ==========================================
    setInterval(updateStatsCounters, 30000);
    initApp();
});