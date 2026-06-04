document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ И ПЕРЕМЕННЫХ
    // ==========================================
    let projects = [];
    let activeProject = null;
    let currentUser = null;

    const isMobile = window.innerWidth <= 900;

    // === ДОБАВЛЕННЫЙ БЛОК: Кнопка сворачивания проектов ===
    const sidebarLeft = document.querySelector('.sidebar-left');
    if (sidebarLeft) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'sidebar-toggle-btn';
        toggleBtn.innerHTML = '📁';
        toggleBtn.title = 'Свернуть/Развернуть панель проектов';
        document.body.appendChild(toggleBtn);

        if (isMobile) {
            sidebarLeft.classList.add('collapsed');
            toggleBtn.classList.add('collapsed');
        }

        toggleBtn.onclick = () => {
            sidebarLeft.classList.toggle('collapsed');
            toggleBtn.classList.toggle('collapsed');
        };
    }

    // === ДОБАВЛЕННЫЙ БЛОК: Кнопка сворачивания участников ===
    const sidebarRight = document.querySelector('.sidebar-right');
    if (sidebarRight) {
        if (isMobile) {
            sidebarRight.classList.add('collapsed');
        } else {
            sidebarRight.classList.remove('collapsed');
        }

        const toggleRightBtn = document.createElement('button');
        toggleRightBtn.className = 'sidebar-right-toggle-btn' + (isMobile ? ' collapsed' : '');
        toggleRightBtn.innerHTML = '👥';
        toggleRightBtn.title = 'Свернуть/Развернуть панель участников';
        document.body.appendChild(toggleRightBtn);

        toggleRightBtn.onclick = () => {
            sidebarRight.classList.toggle('collapsed');
            toggleRightBtn.classList.toggle('collapsed');
        };
    }

    // === ДОБАВЛЕННЫЙ БЛОК: Логотип проекта в правый верхний угол ===
    const topHeader = document.querySelector('.top-header');
    const roleSelectorEl = document.getElementById("global-role-selector");

    if (topHeader) {
        const logoImg = document.createElement('img');
        logoImg.src = 'logoTrans.png';
        logoImg.alt = 'Project Logo';
        logoImg.style.height = '80px';
        logoImg.style.objectFit = 'contain';
        logoImg.style.userSelect = 'none';

        if (roleSelectorEl) {
            const parent = roleSelectorEl.parentElement;
            if (parent && parent.classList.contains('top-header')) {
                const rightWrapper = document.createElement('div');
                rightWrapper.style.display = 'flex';
                rightWrapper.style.alignItems = 'center';
                rightWrapper.style.gap = '20px';
                parent.insertBefore(rightWrapper, roleSelectorEl);
                rightWrapper.appendChild(roleSelectorEl);
                rightWrapper.appendChild(logoImg); // Логотип встает правее
            } else if (parent) {

                parent.style.display = 'flex';
                parent.style.alignItems = 'center';
                parent.style.gap = '20px';
                parent.appendChild(logoImg);
            }
        } else {
            topHeader.appendChild(logoImg);
        }
    }

    // Проверяет, назначена ли работа текущему пользователю
    function isAssignedToCurrentUser(sub) {
        if (!sub || !sub.assignedExperts) return false;
        const candidates = (sub.assignedExperts || []).map(a => (a && typeof a === 'object') ? (a.name || String(a.user_id || '')) : String(a || ''));
        const userIdentifiers = [String(currentUser?.name || ''), String(currentUser?.id || ''), String(currentUser?.tg || ''), String(currentUser?.telegramtag || '')].filter(Boolean);
        return candidates.some(c => userIdentifiers.includes(c));
    }
    let activeIterationId = 1;
    let currentRole = 'organizer';
    let isSelectionMode = false;
    let selectedSubmissionIds = [];

    function getSavedIterationId() {
        if (!activeProject) return 1;
        const idFromProject = activeProject.iterationId || activeProject.iteration_id || activeProject.iterationButtonId;
        if (idFromProject) {
            const numeric = Number(idFromProject);
            if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) return numeric;
        }

        const statusValue = String(activeProject.iterationStatus || activeProject.iteration_status || activeProject.status || '').toLowerCase();
        if (statusValue) {
            const found = Object.entries(iterationButtonConfig).find(([, cfg]) => cfg.status === statusValue);
            if (found) return Number(found[0]);
        }

        return 1;
    }

    function saveIterationState(iterationId, status) {
        activeIterationId = iterationId;
        if (!activeProject) return;
        activeProject.iterationId = iterationId;
        activeProject.iterationStatus = status;
    }

    // Элементы интерфейса
    const workModal = document.getElementById("work-modal");
    const reviewPanel = document.getElementById("review-panel");
    const contextMenu = document.getElementById("context-menu");
    const participantMenu = document.getElementById("participant-context-menu");
    const controlModal = document.getElementById("control-panel-modal");
    const requestsModal = document.getElementById("requests-modal");
    const iterationButtonsContainer = document.getElementById("iteration-buttons");
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
    function renderSidebarProjects(searchQuery = "") {
        const container = document.querySelector(".projects-list");
        if (!container) return;

        Array.from(container.children).forEach(child => {
            if (!child.classList || !child.classList.contains('section-title')) child.remove();
        });

        if (!Array.isArray(projects)) projects = [];

        const filter = (typeof searchQuery === 'string') ? searchQuery.toLowerCase() : "";

        projects.forEach(proj => {
            if (!proj) return;
            if (filter && (!proj.name || !proj.name.toLowerCase().includes(filter))) return;

            const div = document.createElement("div");
            div.className = `project-item ${proj.id === activeProject?.id ? 'active' : ''}`;
            const badgeHTML = `<span class="badge ${proj.type === 'p2p' ? 'orange' : 'yellow'}">${(proj.type || 'unknown').toUpperCase()}</span>`;

            const firstChar = proj.name ? proj.name.charAt(0) : '?';
            const fullName = proj.name || 'Без названия';
            const projectName = fullName.length > 20 ? fullName.substring(0, 20) + '...' : fullName;

            div.innerHTML = `
                <div class="project-icon ${proj.type === 'p2p' ? 'blue' : 'green'}">${firstChar}</div>
                <div class="project-info" style="width: 100%;">
                    <div class="project-name">${projectName} ${badgeHTML}</div>
                    <div class="project-meta">📄 ${proj.submissions?.length || 0} 👥 ${proj.experts?.length || 0}</div>
                </div>
            `;
            div.addEventListener('click', async () => {
                activeProject = proj;
                await loadProjectData(proj.id);
                updateDashboard();
            });
            container.appendChild(div);
        });

        // Добавляем кнопку "Вступить" в левое меню
        const joinBtnContainer = document.createElement("div");
        joinBtnContainer.style.marginTop = "20px";
        joinBtnContainer.style.paddingTop = "15px";
        joinBtnContainer.style.borderTop = "1px solid var(--border-color)";
        joinBtnContainer.innerHTML = `<button id="btn-join-project" class="btn btn-outline" style="width: 100%; text-align: center;">➕ Вступить в проект</button>`;
        container.appendChild(joinBtnContainer);

        const btnJoin = document.getElementById("btn-join-project");
        if (btnJoin) {
            btnJoin.onclick = () => {
                let joinModal = document.getElementById("join-project-modal");
                if (!joinModal) {
                    joinModal = document.createElement("div");
                    joinModal.id = "join-project-modal";
                    joinModal.className = "modal";
                    joinModal.innerHTML = `
                        <div class="modal-content" style="max-width: 400px; min-height: 200px;">
                            <span class="close-modal" onclick="document.getElementById('join-project-modal').style.display='none'">&times;</span>
                            <h3 style="margin-bottom: 20px;">Вступление в проект</h3>
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label>Код проекта</label>
                                <input type="text" id="join-project-code" class="input-field" placeholder="Например: EXM-ABCD-1234-WXYZ">
                            </div>
                            <button id="btn-submit-join" class="btn" style="width: 100%; background: var(--accent-blue); color: white;">Отправить заявку</button>
                        </div>
                    `;
                    document.body.appendChild(joinModal);

                    document.getElementById("btn-submit-join").onclick = async () => {
                        const code = document.getElementById("join-project-code").value.trim();
                        if (!code) return alert("Введите код проекта!");
                        try {
                            await api.joinProject(code);
                            alert("Заявка на вступление отправлена! Ожидайте подтверждения организатора.");
                            joinModal.style.display = 'none';
                        } catch (e) {
                            alert("Ошибка при отправке заявки: " + (e.message || ""));
                        }
                    };
                }
                document.getElementById("join-project-code").value = "";
                joinModal.style.display = 'flex';
            };
        }
    }

    let isCodeVisible = false;

    function renderHeader() {
        if (!activeProject) return;

        const iterIdForHeader = (typeof getSavedIterationId === 'function') ? getSavedIterationId() : (activeProject.iterationId || activeProject.iteration_id || 1);
        const iterLabel = (iterationButtonConfig && iterationButtonConfig[iterIdForHeader]) ? iterationButtonConfig[iterIdForHeader].label : (activeProject.iterationTitle || '—');
        const statusDot = activeProject.isSystemRunning
            ? '<span class="status-indicator active"></span>Запущено'
            : `<span class="status-indicator paused"></span>${iterLabel}`;

        const titleEl = document.getElementById("header-title");
        if (titleEl) {
            titleEl.innerHTML = `${activeProject.name || 'Проект'} <span style="font-size: 12px; font-weight: normal; margin-left: 10px;">${statusDot}</span>`;
        }

        const iconEl = document.getElementById("header-icon");
        if (iconEl) {
            iconEl.innerText = activeProject.name ? activeProject.name.charAt(0) : '?';
            iconEl.className = `project-icon large ${activeProject.type === 'p2p' ? 'blue' : 'green'}`;
        }

        let displayType = "Неизвестный тип";
        if (activeProject.type === 'p2p') {
            displayType = "Peer-to-Peer";
        } else if (activeProject.type === 'exam') {
            displayType = "Экзаменационный";
        } else {
            // Если пришла какая-то дичь (например, 'unknown'), покажем её как есть
            displayType = String(activeProject.type).toUpperCase();
        }
        document.getElementById("header-type").innerText = displayType;

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
        const filteredSubmissions = submissions.filter(sub => (sub.name && sub.name.toLowerCase().includes(filter)) || (sub.telegram && sub.telegram.toLowerCase().includes(filter)));

        console.log("📊 Рендер таблицы:", filteredSubmissions.length, "работ найдено");

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

        const experts = activeProject?.experts || [];
        if (experts.length === 0) {
            participantsList.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 20px;">Нет участников</p>`;
            return;
        }

        experts.forEach(exp => {
            if (!exp) return;

            const roleNames = { "reviewer": "Эксперт", "leader": "Организатор", "Эксперт": "Эксперт", "Соорганизатор": "Организатор" };
            const roleName = roleNames[exp.role] || exp.role || "Эксперт";

            const div = document.createElement("div");
            div.className = "participant-item";
            div.innerHTML = `
                <div class="avatar">${(exp.name || '??').substring(0, 2).toUpperCase()}</div>
                <div style="flex: 1;">
                    <div class="p-name">${exp.name || 'Unknown'}</div>
                    <div class="p-tg" style="font-size: 11px; color: var(--text-muted);">${exp.tg || ''} • ${roleName}</div>
                </div>
            `;
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
            <option value="reviewer">🎓 Эксперт</option>
            <option value="leader">🛡️ Организатор</option>
        `;

        activeProject.joinRequests.forEach(req => {
            if (!req) return;
            const div = document.createElement("div");
            div.className = "request-card";
            const reqId = req.user_id;
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
                acceptBtn.onclick = async () => {
                    const selectedRole = document.getElementById(`role-${reqId}`).value;
                    try {
                        await api.updateMember(activeProject.id, reqId, selectedRole, [], "active");
                        alert("Заявка принята!");
                        await loadProjectData(activeProject.id);
                        renderRequestsModal();
                        updateDashboard();
                    } catch (e) {
                        alert("Ошибка: " + e.message);
                    }
                };
            }

            const rejectBtn = div.querySelector('.btn-reject');
            if (rejectBtn) {
                rejectBtn.onclick = async () => {
                    try {
                        await api.updateMember(activeProject.id, reqId, "reviewer", [], "deleted");
                        alert("Заявка отклонена!");
                        await loadProjectData(activeProject.id);
                        renderRequestsModal();
                        updateDashboard();
                    } catch (e) {
                        alert("Ошибка: " + e.message);
                    }
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
        const placeholder = document.querySelector("#work-modal .work-placeholder");
        if (nameEl && workModal && submission && placeholder) {
            nameEl.innerText = `Работа: ${submission.name || 'Без названия'} (${submission.telegram || '—'})`;

            let url = submission.contentUrl;
            if (url) {
                if (url.startsWith('/')) {
                    url = `http://localhost:8000${url}`;
                }
                const extension = url.split('?')[0].split('.').pop().toLowerCase();
                const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
                if (imageExtensions.includes(extension)) {
                    placeholder.innerHTML = `<img src="${url}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;">`;
                    placeholder.style.border = 'none';
                } else {
                    placeholder.innerHTML = `
                        <div style="text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 15px;">📁</div>
                            <a href="${url}" target="_blank" class="btn" style="background: var(--accent-blue); color: white; text-decoration: none; display: inline-block;">Скачать / Открыть файл</a>
                        </div>
                    `;
                    placeholder.style.border = '2px dashed var(--border-color)';
                }
            } else {
                placeholder.innerHTML = `<p>Файл не прикреплен.</p>`;
                placeholder.style.border = '2px dashed var(--border-color)';
            }
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
                const reviewerName = review.reviewer?.name || review.reviewer_name || 'Unknown';
                const score = review.rating !== undefined ? review.rating : review.score;
                const comment = review.review || review.comment;

                htmlContent += `
                    <div class="review-card" style="margin-bottom: 10px; border: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="avatar" style="width: 30px; height: 30px; font-size: 10px; background-color: #4b5563;">${(reviewerName || '??').substring(0, 2).toUpperCase()}</div>
                                <div><div style="font-weight: bold; color: white; font-size: 14px;">${reviewerName}</div><div style="font-size: 12px; color: var(--text-muted);">Рецензент</div></div>
                            </div>
                            <div style="color: var(--status-orange); font-weight: bold;">Оценка: ⭐ ${(score || 0).toFixed(1)}</div>
                        </div>
                        <p style="color: var(--text-main); font-size: 14px; margin-top: 10px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px;">${comment || 'Нет комментария'}</p>
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
            console.log("👤 Текущий пользователь:", currentUser);

            const projectsResponse = await api.getProjects();
            projects = projectsResponse.data || projectsResponse;

            if (!Array.isArray(projects)) projects = [];
            console.log("📁 Загруженные проекты:", projects);

            if (projects.length > 0) {
                activeProject = projects[0];
                await loadProjectData(activeProject.id);
            }

            updateDashboard();
        } catch (error) {
            console.error("❌ Ошибка инициализации:", error);
            alert("Не удалось загрузить данные с сервера.");
        }
    }

    async function loadProjectData(projectId) {
        try {
            // Отдельно подтягиваем код напрямую из БД (обходит ограничения серверных моделей)
            try {
                const codeRes = await api.getProjectCode(projectId);
                if (codeRes && codeRes.data && typeof codeRes.data.code !== 'undefined') {
                    if (activeProject) activeProject.code = codeRes.data.code;
                }
            } catch (e) {
                console.warn("Не удалось подтянуть код проекта:", e);
            }

            try {
                const membersRes = await api.getProjectMembers(projectId);
                const allMembers = membersRes.data || [];
                if (activeProject) {
                    activeProject.experts = allMembers.filter(m => m.status === 'active');
                    activeProject.joinRequests = allMembers.filter(m => m.status === 'pending');
                }
            } catch (e) {
                console.warn("Не удалось подтянуть участников:", e);
                if (activeProject) { activeProject.experts = []; activeProject.joinRequests = []; }
            }

            const response = await api.getProjectWorks(projectId);
            console.log("📦 Ответ сервера по работам:", response);

            let rawWorks = response.data || response.raw || response;
            if (!Array.isArray(rawWorks)) rawWorks = [];

            console.log("✅ Распакованный массив работ:", rawWorks);

            if (activeProject) {
                activeProject.submissions = rawWorks.map(work => ({
                    id: work.id,
                    name: work.title || 'Без названия',
                    telegram: work.author_name || work.author?.name || 'Unknown',
                    date: work.created_at ? new Date(work.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
                    status: ['approved', 'success'].includes(work.status) ? 'done' : 'waiting',
                    reviews: work.reviews || [],
                    assignedExperts: (work.assigned_experts || []).map(a => (a && typeof a === 'object') ? (a.name || String(a.user_id || '')) : String(a || '')),
                    contentUrl: work.content || '',
                    author_id: work.author_id
                }));
            }
        } catch (e) {
            console.error("❌ Ошибка загрузки работ:", e);
            if (activeProject) activeProject.submissions = [];
        }
    }

    // ==========================================
    // 8. ЭКСПЕРТНАЯ ЧАСТЬ
    // ==========================================
    // ==========================================
    // 8. ЭКСПЕРТНАЯ ЧАСТЬ
    // ==========================================
    function renderExpertView() {
        const workspace = document.getElementById("expert-workspace");
        if (!workspace || !activeProject || !currentUser) return;

        workspace.innerHTML = "";
        const stageConfig = iterationButtonConfig[getSavedIterationId()] || iterationButtonConfig[1];
        const currentStage = stageConfig.status;
        const isExpert = currentRole !== 'organizer';
        const myWork = activeProject.type === 'p2p'
            ? activeProject.submissions?.find(s => s.author_id === currentUser.id)
            : null;

        const renderP2PCollection = () => {
            if (!myWork) {
                return `
                    <h3 style="margin-bottom: 20px;">Моя работа (Peer-to-Peer)</h3>
                    <div style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px; border: 1px dashed var(--border-color); margin-bottom: 20px;">
                        <p style="color: var(--text-muted); margin-bottom: 15px;">Чтобы участвовать в проверке, загрузите свою работу.</p>
                        <button id="btn-upload-my-work" class="btn" style="background: var(--accent-blue); color: white;">📥 Загрузить мою работу</button>
                    </div>
                `;
            }
            return `
                <h3 style="margin-bottom: 20px;">Моя работа (Peer-to-Peer)</h3>
                <div style="background: rgba(16, 185, 129, 0.1); padding: 20px; border-radius: 8px; border: 1px dashed var(--status-green); margin-bottom: 20px;">
                    <h4 style="color: var(--status-green); margin-bottom: 10px;">✅ Ваша работа загружена</h4>
                    <p style="color: var(--text-muted); margin: 0;">Сбор работ продолжается. Проверки пока недоступны.</p>
                </div>
            `;
        };

        const renderP2PReviewing = () => {
            if (!myWork) {
                return `
                    <h3 style="margin-bottom: 20px;">Проверка работ</h3>
                    <div style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px; border: 1px dashed var(--border-color); margin-bottom: 20px;">
                        <p style="color: var(--text-muted); margin-bottom: 15px;">Чтобы участвовать в проверке, загрузите свою работу.</p>
                        <button id="btn-upload-my-work" class="btn" style="background: var(--accent-blue); color: white;">📥 Загрузить мою работу</button>
                    </div>
                `;
            }
            const otherWorks = activeProject.submissions?.filter(sub =>
                sub.id !== myWork.id && sub.author_id !== currentUser.id &&
                !sub.reviews?.some(r => r.reviewer?.user_id === currentUser?.id || r.reviewer_id === currentUser?.id || r.reviewerTg === currentUser?.tg)
            ) || [];
            if (otherWorks.length === 0) {
                return `
                    <h3 style="margin-bottom: 20px;">Проверка работ</h3>
                    <div style="background: rgba(16, 185, 129, 0.1); padding: 20px; border-radius: 8px; border: 1px dashed var(--status-green); text-align: center;">
                        <h4 style="color: var(--status-green); margin-bottom: 10px;">⏳ Нечего проверять</h4>
                        <p style="color: var(--text-muted); margin: 0;">Ожидайте новых работ от участников.</p>
                    </div>
                `;
            }
            const randomWork = otherWorks[Math.floor(Math.random() * otherWorks.length)];
            return `
                <h3 style="margin-bottom: 20px;">Проверка работ</h3>
                <div id="p2p-review-card" style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                        <div>
                            <h4 style="color: white; margin: 0 0 5px 0;">${randomWork.name || 'Без названия'}</h4>
                            <p style="color: var(--text-muted); font-size: 13px; margin: 0;">Автор: <strong>${randomWork.telegram || 'Unknown'}</strong> • Загружена: ${randomWork.date}</p>
                        </div>
                        <div style="text-align: right;">
                            <p style="color: var(--status-orange); font-weight: bold; margin: 0;">⭐ Ожидает проверки</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-outline" onclick="openWorkModalById(${randomWork.id})" style="border-color: var(--accent-blue); color: var(--accent-blue);">👁️ Просмотреть</button>
                        <button class="btn" onclick="openExpertEvaluateModal(${randomWork.id})" style="background: var(--status-green); color: white; flex: 1;">💬 Оценить работу</button>
                    </div>
                </div>
            `;
        };

        const renderP2PPublished = () => {
            const myReviewItems = activeProject.submissions?.flatMap(sub =>
                (sub.reviews || []).filter(r =>
                    r?.reviewer?.user_id === currentUser?.id || r?.reviewer_id === currentUser?.id || String(r?.reviewerTg || '').toLowerCase() === String(currentUser?.tg || '').toLowerCase()
                ).map(review => ({ ...review, workTitle: sub.name, workDate: sub.date, workAuthor: sub.telegram }))
            ) || [];
            const reviewsHtml = myReviewItems.length > 0
                ? myReviewItems.map(review => `
                    <div class="review-card" style="margin-bottom: 12px; border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.04);">
                        <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 8px;">
                            <div>
                                <div style="font-weight: 600; color: white;">${review.workTitle || 'Работа'}</div>
                                <div style="font-size: 12px; color: var(--text-muted);">Автор: ${review.workAuthor || '—'} • ${review.workDate || '—'}</div>
                            </div>
                            <div style="color: var(--status-orange); font-weight: bold;">Оценка: ⭐ ${(review.rating ?? review.score ?? 0).toFixed(1)}</div>
                        </div>
                        <div style="color: var(--text-main); font-size: 14px;">${review.review || review.comment || 'Без комментария'}</div>
                    </div>
                `).join('')
                : `<p style="color: var(--text-muted);">Пока нет доступных комментариев.</p>`;
            return `
                <h3 style="margin-bottom: 20px;">Публикация результатов</h3>
                <div style="background: rgba(16, 185, 129, 0.08); padding: 20px; border-radius: 8px; border: 1px dashed var(--status-green); margin-bottom: 20px;">
                    <p style="color: var(--text-muted); margin: 0;">Вы больше не можете проверять чужие работы, но видите результаты своих проверок.</p>
                </div>
                <div class="reviews-list">${reviewsHtml}</div>
            `;
        };

        const renderP2PClosed = () => `
            <div style="background: rgba(239, 68, 68, 0.12); padding: 30px; border-radius: 10px; border: 1px solid rgba(239, 68, 68, 0.35); text-align: center;">
                <h3 style="margin-bottom: 15px; color: #f87171;">Доступ ограничен</h3>
                <p style="color: var(--text-muted);">Организатор временно ограничил доступ к данному проекту для участников.</p>
            </div>
        `;

        const renderExamUpload = () => `
            <h3 style="margin-bottom: 20px;">Сбор работ</h3>
            <div style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px; border: 1px dashed var(--border-color); margin-bottom: 20px;">
                <p style="color: var(--text-muted); margin-bottom: 15px;">Загрузите работу для участия в проверке.</p>
                <button id="btn-open-exam-upload" class="btn" style="background: var(--accent-blue); color: white;">📥 Загрузить работу</button>
            </div>
        `;

        const renderExamReviewTable = (canEvaluate) => {
            let myAssignedWorks = activeProject.submissions?.filter(sub =>
                isAssignedToCurrentUser(sub)
            ) || [];
            if ((!myAssignedWorks || myAssignedWorks.length === 0) && activeProject.submissions && activeProject.submissions.length > 0) {
                const reqReviews = activeProject.requiredReviews || 2;
                const candidate = activeProject.submissions.find(s =>
                    s.author_id !== currentUser.id &&
                    !s.reviews?.some(r => r.reviewer?.user_id === currentUser?.id || r.reviewer_id === currentUser?.id) &&
                    (s.assignedExperts?.length || 0) < reqReviews
                );
                if (candidate) {
                    if (!candidate.assignedExperts) candidate.assignedExperts = [];
                    candidate.assignedExperts.push(String(currentUser.name || currentUser.id));
                    myAssignedWorks = [candidate];
                }
            }

            workspace.innerHTML = `
                <h3 style="margin-bottom: 20px;">Работы на проверку (Экзамен)</h3>
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
            if (!tbody) return;
            if (myAssignedWorks.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 30px; color: var(--text-muted);">У вас нет назначенных работ.</td></tr>`;
                return;
            }
            tbody.innerHTML = "";
            myAssignedWorks.forEach(sub => {
                const myReview = sub.reviews?.find(r => r.reviewer?.user_id === currentUser?.id || r.reviewer_id === currentUser?.id || r.reviewerTg === currentUser?.tg);
                const reviewScore = myReview ? (myReview.rating ?? myReview.score ?? 0) : null;
                const statusText = myReview ? `<span style="color: var(--status-green);">✅ Оценено (${reviewScore})</span>` : `<span style="color: var(--status-orange);">⏳ Ожидает проверки</span>`;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${sub.name || 'Без названия'}</td>
                    <td>${sub.date || '—'}</td>
                    <td>${statusText}</td>
                    <td class="action-cell">
                        <span class="action-icon" onclick="openWorkModalById(${sub.id})" title="Просмотр">👁️</span>
                        ${canEvaluate && !myReview ? `<span class="action-icon" onclick="openExpertEvaluateModal(${sub.id})" title="Оценить">💬</span>` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        };

        if (currentStage === 'closed') {
            workspace.innerHTML = renderP2PClosed();
            return;
        }

        if (activeProject.type === 'p2p') {
            if (currentStage === 'collection') {
                workspace.innerHTML = renderP2PCollection();
            } else if (currentStage === 'reviewing') {
                workspace.innerHTML = renderP2PReviewing();
            } else if (currentStage === 'published') {
                workspace.innerHTML = renderP2PPublished();
            } else {
                workspace.innerHTML = renderP2PCollection();
            }
            const btnUploadMyWork = document.getElementById("btn-upload-my-work");
            const uploadMyWorkModal = document.getElementById("upload-my-work-modal");
            if (btnUploadMyWork && uploadMyWorkModal) {
                btnUploadMyWork.onclick = () => {
                    const fileInput = document.getElementById("my-work-file");
                    if (fileInput) fileInput.value = "";
                    uploadMyWorkModal.style.display = "flex";
                };
            }
            const closeUploadMyWork = document.getElementById("close-upload-my-work");
            if (closeUploadMyWork) closeUploadMyWork.onclick = () => uploadMyWorkModal.style.display = "none";
            const btnSubmitMyWork = document.getElementById("btn-submit-my-work");
            if (btnSubmitMyWork) {
                btnSubmitMyWork.onclick = async () => {
                    const title = document.getElementById("my-work-title").value.trim() || "P2P Работа";
                    const fileInput = document.getElementById("my-work-file");
                    const file = fileInput ? fileInput.files[0] : null;
                    if (!file) return alert("Пожалуйста, прикрепите файл!");
                    try {
                        await api.submitWork(activeProject.id, { title, file });
                        alert("✅ Ваша работа успешно отправлена!");
                        uploadMyWorkModal.style.display = "none";
                        if (typeof loadProjectData === 'function') await loadProjectData(activeProject.id);
                        updateDashboard();
                    } catch (error) {
                        console.error("Ошибка загрузки работы:", error);
                        alert("❌ Ошибка при отправке работы. Проверьте консоль.");
                    }
                };
            }
            return;
        }

        if (currentStage === 'collection') {
            workspace.innerHTML = renderExamUpload();
            const btnOpenExamUpload = document.getElementById("btn-open-exam-upload");
            const uploadExamModal = document.getElementById("upload-exam-modal");
            if (btnOpenExamUpload && uploadExamModal) {
                btnOpenExamUpload.onclick = () => {
                    const fileInput = document.getElementById("exam-file");
                    if (fileInput) fileInput.value = "";
                    uploadExamModal.style.display = "flex";
                };
            }
            return;
        }

        if (currentStage === 'reviewing') {
            renderExamReviewTable(true);
            return;
        }

        if (currentStage === 'published') {
            renderExamReviewTable(false);
            return;
        }
    }

    // Глобальные функции для экспертной части
    window.simulateP2PUpload = async function () {
        if (!activeProject) return;
        try {
            await api.submitWork(activeProject.id, { title: "Моя работа", iteration_id: null });
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
            console.log(`📝 Отправляем рецензию на работу #${workId}:`, { review: comment, rating: score });
            await api.submitReview(activeProject.id, workId, { review: comment, rating: score });
            alert("✅ Проверка сохранена на сервере!");

            const modal = document.getElementById("exam-review-modal");
            if (modal) modal.style.display = 'none';

            console.log("🔄 Перезагружаем данные проекта...");
            await loadProjectData(activeProject.id);
            updateDashboard();

            console.log("✅ Интерфейс обновлен!");
        } catch (error) {
            console.error("❌ Ошибка при сохранении оценки:", error);
            alert("❌ Ошибка при сохранении оценки на сервере.");
        }
    };

    window.openExpertEvaluateModal = function (id) {
        if (!activeProject) return;
        const sub = activeProject.submissions?.find(s => s.id === id);
        if (!sub) return;

        const myReview = sub.reviews?.find(r => r.reviewer?.user_id === currentUser?.id || r.reviewer_id === currentUser?.id || r.reviewerTg === currentUser?.tg);
        const reviewComment = myReview ? (myReview.review || myReview.comment) : '';
        const reviewScore = myReview ? (myReview.rating ?? myReview.score ?? '') : '';
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
                <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Комментарий:</label>
                <textarea id="exam-comment" placeholder="Введите комментарий к работе..." style="width: 100%; height: 120px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: white; border-radius: 6px; padding: 10px;">${reviewComment}</textarea>
                <label style="display: block; font-size: 12px; color: var(--text-muted); margin: 15px 0 8px 0;">Оценка (1-10):</label>
                <input type="number" id="exam-score" step="0.1" min="1" max="10" value="${reviewScore}" placeholder="Оценка" style="width: 100px; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--status-orange); font-weight: bold; font-size: 16px; border-radius: 6px;">
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

            const projectSearchInput = document.querySelector('.sidebar-left .search-bar input');
            const projectSearchVal = projectSearchInput ? projectSearchInput.value : "";
            if (typeof renderSidebarProjects === 'function') renderSidebarProjects(projectSearchVal);
            if (typeof renderHeader === 'function') renderHeader();
            if (typeof renderExperts === 'function') renderExperts();

            const orgWorkspace = document.getElementById("organizer-workspace");
            const expWorkspace = document.getElementById("expert-workspace");
            const btnOpenControl = document.getElementById("btn-open-control");
            const reviewPanelEl = document.getElementById("review-panel");
            const btnRefreshCode = document.getElementById("refresh-code-btn");

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

                // 2. Умная проверка типа проекта
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
                if (btnOpenControl) btnOpenControl.style.display = 'flex';
                if (btnRefreshCode) btnRefreshCode.style.display = 'inline-block';
                if (reviewPanelEl) reviewPanelEl.style.display = 'none';

                if (typeof updateStatsCounters === 'function') updateStatsCounters();
                if (typeof updateRequestsBadge === 'function') updateRequestsBadge();
                if (typeof renderTable === 'function') renderTable();

            } else {
                if (orgWorkspace) orgWorkspace.style.display = 'none';
                else {
                    if (statsGrid) statsGrid.style.display = 'none';
                    if (tableContainer) tableContainer.style.display = 'none';
                    if (tableActions) tableActions.style.display = 'none';
                }

                if (expWorkspace) expWorkspace.style.display = 'block';
                if (btnOpenControl) btnOpenControl.style.display = 'none';
                if (btnRefreshCode) btnRefreshCode.style.display = 'none';
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
        btnResetSingle.onclick = async () => {
            if (!activeProject) return;
            const sub = activeProject.submissions?.find(s => s.id === currentSelectedSubmissionId);
            if (sub && confirm(`Сбросить все проверки для работы "${sub.name}"? Это действие удалит существующие оценки и переоткроет задания для экспертов.`)) {
                try {
                    await api.resetWorkReviews(activeProject.id, sub.id);
                    alert('Проверки для работы успешно сброшены.');

                    if (contextMenu) contextMenu.style.display = 'none';

                    await loadProjectData(activeProject.id);
                    updateDashboard();

                } catch (error) {
                    console.error("Ошибка при сбросе проверок:", error);
                    alert(`Не удалось сбросить проверки: ${error.message || 'Проверьте консоль для деталей.'}`);
                }
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
    if (btnToggleCode && codeDisplay) {
        btnToggleCode.onclick = () => {
            if (!activeProject) return;
            isCodeVisible = !isCodeVisible;
            if (isCodeVisible) {
                codeDisplay.innerText = activeProject.code ? activeProject.code : 'Код не задан';
                codeDisplay.style.letterSpacing = "normal";
            }
            else {
                codeDisplay.innerText = "•••••••••••••••••••••••";
                codeDisplay.style.letterSpacing = "2px";
            }
        };
    }

    const btnRefreshCode = document.getElementById("refresh-code-btn");
    if (btnRefreshCode) {
        btnRefreshCode.onclick = async () => {
            if (!activeProject) return;
            if (confirm("Старый код перестанет работать. Продолжить?")) {
                const newCode = generateProjectCode(activeProject.type);
                try {
                    // Если на бэкенде есть поддержка PATCH /projects/{id}
                    if (api.updateProjectCode) await api.updateProjectCode(activeProject.id, newCode);
                    activeProject.code = newCode;
                    if (isCodeVisible && codeDisplay) codeDisplay.innerText = activeProject.code;
                    alert("Код проекта успешно обновлен!");
                } catch (e) {
                    console.warn("Бэкенд не поддерживает обновление кода или произошла ошибка:", e);
                    activeProject.code = newCode;
                    if (isCodeVisible && codeDisplay) codeDisplay.innerText = activeProject.code;
                    alert("Код проекта обновлен локально (для сохранения на сервере может потребоваться доработка бэкенда).");
                }
            }
        };
    }

    const searchInput = document.querySelector('.table-actions input');
    if (searchInput) searchInput.oninput = (e) => renderTable(e.target.value);

    // Обработчик для поиска по проектам
    const projectSearchInput = document.querySelector('.sidebar-left .search-bar input');
    if (projectSearchInput) {
        projectSearchInput.oninput = (e) => {
            if (typeof renderSidebarProjects === 'function') renderSidebarProjects(e.target.value);
        };
    }

    const btnOpenControl = document.getElementById("btn-open-control");
    if (btnOpenControl && controlModal) {
        btnOpenControl.onclick = () => {
            if (!activeProject) return;
            if (activeProject.isSystemRunning === undefined) activeProject.isSystemRunning = false;

            const titleInput = document.getElementById("panel-iteration-title");
            const deadlineInput = document.getElementById("panel-iteration-deadline");
            const reqInput = document.getElementById("panel-req-reviews");

            if (titleInput) titleInput.value = activeProject.iterationTitle || `Сборы: ${activeProject.name || 'этап'}`;

            if (deadlineInput) {
                if (activeProject.iterationDeadline) {
                    const parsed = new Date(activeProject.iterationDeadline);
                    if (!isNaN(parsed)) deadlineInput.value = parsed.toISOString().slice(0, 16);
                } else {
                    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                    deadlineInput.value = defaultDate.toISOString().slice(0, 16);
                }
            }

            if (reqInput) reqInput.value = activeProject.requiredReviews || 2;
            renderIterationButtons();
            controlModal.style.display = 'flex';
        };
    }

    const btnCloseControl = document.getElementById("close-control-modal");
    if (btnCloseControl) btnCloseControl.onclick = () => {
        if (controlModal) controlModal.style.display = 'none';
    };

    function getIterationPayload(status) {
        const titleInput = document.getElementById("panel-iteration-title");
        const deadlineInput = document.getElementById("panel-iteration-deadline");
        const reqInput = document.getElementById("panel-req-reviews");

        const iterationTitle = titleInput?.value.trim() || activeProject?.iterationTitle || `Сборы: ${activeProject?.name || 'этап'}`;
        const minReviews = parseInt(reqInput?.value, 10) || activeProject?.requiredReviews || 2;
        let deadline = deadlineInput?.value ? new Date(deadlineInput.value) : null;
        if (deadline && !isNaN(deadline)) {
            deadline = deadline.toISOString();
        } else {
            deadline = activeProject?.iterationDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }

        if (activeProject) {
            activeProject.iterationTitle = iterationTitle;
            activeProject.iterationDeadline = deadline;
            activeProject.requiredReviews = minReviews;
        }

        return {
            title: iterationTitle,
            status,
            settings: {
                min_reviews_per_work: minReviews,
                deadline
            }
        };
    }

    const iterationButtonConfig = {
        1: { label: "Отправка работ", status: "collection" },
        2: { label: "Проверка", status: "reviewing" },
        3: { label: "Просмотр результатов", status: "published" },
        4: { label: "Закрыто для просмотра", status: "closed" }
    };

    async function sendIterationPatch(iterationId, status) {
        if (!activeProject) return;
        const projectId = activeProject.project_id || activeProject.id;
        if (!projectId) return alert("Проект не выбран.");

        try {
            await api.updateIterationStatus(projectId, iterationId, getIterationPayload(status));
            saveIterationState(iterationId, status);
            renderIterationButtons();
            alert(`Итерация ${iterationId} отправлена с статусом ${status}.`);
            updateDashboard();
        } catch (e) {
            console.error(e);
            alert(`Не удалось отправить итерацию ${iterationId}: ${e.message || 'Ошибка сервера.'}`);
        }
    }

    function renderIterationButtons() {
        if (!iterationButtonsContainer) return;
        iterationButtonsContainer.innerHTML = "";
        activeIterationId = getSavedIterationId();

        [1, 2, 3, 4].forEach((iterationId) => {
            const config = iterationButtonConfig[iterationId];
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn iteration-btn";
            button.dataset.iterationId = iterationId;
            button.innerText = config.label;
            button.style.flex = "1";
            button.style.minWidth = "100px";
            button.style.border = "1px solid var(--border-color)";
            button.style.padding = "10px 12px";
            button.style.fontWeight = "600";
            button.style.cursor = "pointer";
            button.style.transition = "background 0.2s, color 0.2s, border-color 0.2s";

            if (activeIterationId === iterationId) {
                button.style.background = "rgba(34,197,94,0.14)";
                button.style.color = "var(--text-main)";
                button.style.borderColor = "var(--status-green)";
            } else {
                button.style.background = "rgba(255,255,255,0.04)";
                button.style.color = "var(--text-main)";
            }

            button.onclick = async () => {
                await sendIterationPatch(iterationId, config.status);
            };

            iterationButtonsContainer.appendChild(button);
        });
    }

    const btnGlobalRefresh = document.getElementById("btn-global-refresh");
    if (btnGlobalRefresh) {
        btnGlobalRefresh.onclick = async () => {
            if (!activeProject) return;
            if (confirm("Запустить автоматическое перераспределение экспертов для всех работ в проекте?")) {
                try {
                    await api.assignRandomExperts(activeProject.id, 2); // '2' игнорируется, но оставлено для консистентности
                    alert("Эксперты успешно перераспределены сервером!");

                    const controlModalEl = document.getElementById("control-panel-modal");
                    if (controlModalEl) controlModalEl.style.display = 'none';

                    await loadProjectData(activeProject.id);
                    updateDashboard();
                } catch (e) {
                    console.error("Ошибка перераспределения на сервере:", e);
                    alert(`Ошибка перераспределения на сервере: ${e.message || 'Проверьте консоль для деталей.'}`);
                }
            }
        };
    }

    // Логика для кнопки "Сбросить все проверки"
    const btnResetAll = document.getElementById("btn-global-reset");
    if (btnResetAll) {
        btnResetAll.onclick = async () => {
            if (!activeProject) return;
            if (confirm(`Вы уверены, что хотите сбросить ВСЕ проверки в проекте "${activeProject.name}"? Это действие удалит все оценки и переназначит задания экспертам.`)) {
                try {
                    await api.resetAllProjectReviews(activeProject.id);
                    alert('Все проверки в проекте были успешно сброшены.');
                    const controlModalEl = document.getElementById("control-panel-modal");
                    if (controlModalEl) controlModalEl.style.display = 'none';
                    await loadProjectData(activeProject.id);
                    updateDashboard();
                } catch (e) {
                    console.error("Ошибка при сбросе всех проверок:", e);
                    alert(`Не удалось сбросить проверки: ${e.message || 'Проверьте консоль для деталей.'}`);
                }
            }
        };
    }

    const btnRequestsEl = document.getElementById("btn-requests");
    if (btnRequestsEl) {
        btnRequestsEl.style.display = 'inline-flex';
        btnRequestsEl.onclick = () => {
            if (requestsModal) {
                renderRequestsModal();
                requestsModal.style.display = 'flex';
            }
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
                const newCode = generateProjectCode(typeInput);
                await api.createProject(nameInput, typeInput, newCode);

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
        btnInvite.style.display = 'inline-block'; // Возвращаем видимость кнопки
        btnInvite.onclick = () => {
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
            const role = document.getElementById("invite-role")?.value || "Эксперт";
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
            const fileInput = document.getElementById("exam-file");
            if (fileInput) fileInput.value = ""; // Очищаем поле
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
            const fileInput = document.getElementById("exam-file");
            const file = fileInput ? fileInput.files[0] : null;

            if (!file) return alert("Пожалуйста, прикрепите файл!");

            try {
                // Отправляем POST /projects/{id}/works
                await api.submitWork(activeProject.id, {
                    title: "Экзаменационная работа",
                    file: file
                });

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
}); initApp();