// js/api.js — ИСПРАВЛЕННАЯ ВЕРСИЯ (Адаптация под новые JSON-схемы)
// Автоматическое определение адреса бэкенда


const API_BASE_URL = 'http://localhost:8000'; 

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json"
    },
    timeout: 20000,
});

const api = {
    // === Управление токеном ===
    getToken() {
        return localStorage.getItem("auth_token");
    },
    setToken(token) {
        localStorage.setItem("auth_token", token);
    },
    clearToken() {
        localStorage.removeItem("auth_token");
    },

    // === Bypass токен ===
    getBypassToken() {
        const randomPart = Math.random().toString(36).slice(2, 10);
        const timePart = Date.now().toString(36);
        return `bypass-${timePart}-${randomPart}`;
    },

    // === Базовый запрос ===
    async request(endpoint, method = "GET", body = null) {
        const headers = {
            "Content-Type": "application/json",
            "X-Bypass-Token": this.getBypassToken(),
        };

        const token = this.getToken();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const debugId = localStorage.getItem("debug_user_id");
        if (debugId && !token) {
            headers["X-User-Id"] = debugId;
        }

        try {
            const response = await axiosInstance.request({
                url: endpoint,
                method,
                headers,
                data: body,
                validateStatus: status => status >= 200 && status < 500,
            });

            if (response.status === 204) return { success: true };

            const result = response.data;
            if (response.status >= 400) {
                if (response.status === 401) this.clearToken();
                const errMessage = result?.detail || result?.message || `Error ${response.status}`;
                throw new Error(errMessage);
            }

            return {
                success: result?.status === "success" || (response.status >= 200 && response.status < 300),
                message: result?.message,
                data: result?.data,
                raw: result,
            };
        } catch (error) {
            console.error(`API Error [${method} ${endpoint}]:`, error);
            throw error;
        }
    },

    // === Auth ===
    async login(email, password) {
        const res = await this.request("/auth/login", "POST", { email, password });
        if (res.success && res.data?.access_token) {
            this.setToken(res.data.access_token);
        }
        return res;
    },
    async getMe() { return await this.request("/auth/me"); },

    // ==========================================
    // 1. ПРОЕКТЫ И УЧАСТНИКИ
    // ==========================================
    getProjects: async () => {
        const response = await api.request("/projects");
        console.log("Ответ от сервера (проекты):", response);

        let rawProjects = [];
        const payload = response.data || response.raw || response;

        if (Array.isArray(payload)) {
            rawProjects = payload;
        } else if (payload && Array.isArray(payload.data)) {
            rawProjects = payload.data;
        } else if (payload && Array.isArray(payload.items)) {
            rawProjects = payload.items;
        } else {
            console.warn("Не удалось найти массив проектов", payload);
            return [];
        }
        return rawProjects.map(proj => ({
            id: proj.id,
            name: proj.project_name || 'Без названия',
            type: (proj.description?.includes('p2p')) ? 'p2p' : 'exam',
            code: proj.project_code || proj.code || '',

            status: proj.status || 'active',
            description: proj.description || '',
            created_at: proj.created_at,
        }));
    },

    createProject: (name, type, code) => {
        return api.request("/projects", "POST", {
            project_name: name,
            description: `Проект типа ${type}`,
            project_code: code
        });
    },

    async getProjectCode(projectId) {
        return await this.request(`/projects/${projectId}/code`);
    },

    async updateProjectCode(projectId, newCode) {
        return await this.request(`/projects/${projectId}/code`, "PATCH", {
            project_code: newCode
        });
    },

    async deleteProject(projectId) {
        return await this.request(`/projects/${projectId}`, "DELETE");
    },

    // Новое: Вступление в проект
    async joinProject(code) {
        return await this.request(`/projects/join`, "POST", { code });
    },

    async getProjectMembers(projectId) {
        return await this.request(`/projects/${projectId}/members`);
    },

    // Новое: Управление ролями участников
    async updateMember(projectId, userId, role, permissions = [], status = "active") {
        return await this.request(`/projects/${projectId}/members/${userId}`, "PATCH", {
            role: role,
            permissions: permissions,
            status: status
        });
    },

    // ==========================================
    // 2. РАБОТЫ (Works)
    // ==========================================
    async getProjectWorks(projectId) {
        const response = await this.request(`/projects/${projectId}/works`);
        console.log("Ответ от сервера (работы):", response);

        let rawWorks = [];
        const payload = response.data || response.raw || response;

        if (Array.isArray(payload)) {
            rawWorks = payload;
        } else if (payload && Array.isArray(payload.data)) {
            rawWorks = payload.data;
        } else if (payload && Array.isArray(payload.items)) {
            rawWorks = payload.items;
        }

        return rawWorks.map(work => ({
            id: work.id,
            title: work.title || 'Без названия',
            status: work.status || 'pending',
            author_id: work.author?.user_id,
            author_name: work.author?.name || 'Unknown',
            created_at: work.created_at,
            reviews: work.reviews || []
        }));
    },

    async submitWork(projectId, { title, file, iteration_id = null }) {
        const formData = new FormData();
        if (title) formData.append("title", title);
        if (iteration_id) formData.append("iteration_id", iteration_id);
        if (file) formData.append("file", file);

        const headers = {};
        const token = this.getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;

        try {
            const response = await fetch(`${API_BASE_URL}/projects/${projectId}/works`, {
                method: "POST",
                headers: headers,
                body: formData
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `Error ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Error submitting work:", error);
            throw error;
        }
    },

    // ==========================================
    // 3. ИТЕРАЦИИ (Сборы)
    // ==========================================
    async updateIterationStatus(projectId, iterationId, body) {
        // Поддерживает тело PATCH /projects/{id}/iterations/{it_id}
        const payload = typeof body === "string"
            ? { status: body }
            : body || {};
        const normalizedIterationId = Number.isInteger(iterationId)
            ? iterationId
            : parseInt(String(iterationId), 10);
        const endpointId = Number.isInteger(normalizedIterationId) ? normalizedIterationId : iterationId;
        return await this.request(`/projects/${projectId}/iterations/${endpointId}`, "PATCH", payload);
    },

    // ==========================================
    // 4. НАЗНАЧЕНИЯ (Assignments)
    // ==========================================
    async assignExpertsManual(projectId, assignments) {
        // assignments = [ { work_id: 1, reviewer_id: 2 }, ... ]
        return await this.request(`/projects/${projectId}/assignments`, "POST", {
            assignment_type: "manual",
            assignments: assignments
        });
    },

    async assignRandomExperts(projectId, assignments) {
        // Параметр 'assignments' не используется для автоматического распределения на бэкенде.
        return await this.request(`/projects/${projectId}/assignments`, "POST", {
            assignment_type: "auto"
        });
    },

    // ==========================================
    // 5. РЕЦЕНЗИИ И ОЦЕНКИ
    // ==========================================
    async submitReview(projectId, workId, { review, rating }) {
        return await this.request(`/projects/${projectId}/works/${workId}/reviews`, "POST", {
            review: review,
            rating: rating
        });
    },

    async resetWorkReviews(projectId, workId) {
        return await this.request(`/projects/${projectId}/works/${workId}/reset`, "POST");
    },

    async resetAllProjectReviews(projectId) {
        return await this.request(`/projects/${projectId}/reset-all`, "POST");
    }
};

if (typeof window !== "undefined") {
    window.api = api;
    console.log("✅ API loaded");
}