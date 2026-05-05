// js/api.js — ИСПРАВЛЕННАЯ ВЕРСИЯ (Адаптация под новые JSON-схемы)
const API_BASE_URL = "http://localhost:8000";

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

    // === Базовый запрос ===
    async request(endpoint, method = "GET", body = null) {
        const headers = { "Content-Type": "application/json" };

        // 🔐 Добавляем токен из localStorage
        const token = this.getToken();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        // 🧪 Режим отладки: X-User-Id
        const debugId = localStorage.getItem("debug_user_id");
        if (debugId && !token) {
            headers["X-User-Id"] = debugId;
        }

        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

            // Если сервер возвращает 204 No Content, просто выходим без парсинга JSON
            if (response.status === 204) return { success: true };

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                if (response.status === 401) this.clearToken();

                // Детальная ошибка валидации
                if (response.status === 422 && err.detail) {
                    const msg = Array.isArray(err.detail)
                        ? err.detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join('; ')
                        : JSON.stringify(err.detail);
                    throw new Error(`Validation: ${msg}`);
                }
                throw new Error(err.detail || `Error ${response.status}`);
            }
            const result = await response.json();
            return {
                success: result.status === "success",
                message: result.message,
                data: result.data,
                raw: result
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
        console.log("Ответ от сервера:", response);

        // УМНАЯ РАСПАКОВКА (с учетом того, что api.request возвращает объект {success, data, raw})
        let rawProjects = [];
        const payload = response.data || response.raw || response;

        if (Array.isArray(payload)) {
            rawProjects = payload;
        } else if (payload && Array.isArray(payload.data)) {
            rawProjects = payload.data;
        } else if (payload && Array.isArray(payload.items)) {
            rawProjects = payload.items;
        } else {
            console.error("Не удалось найти массив проектов в ответе сервера!", payload);
            return [];
        }

        return rawProjects.map(proj => {
            let parsedType = 'unknown';
            if (proj.description && proj.description.includes('p2p')) {
                parsedType = 'p2p';
            } else if (proj.description && proj.description.includes('exam')) {
                parsedType = 'exam';
            }

            return {
                id: proj.id,
                name: proj.project_name,
                type: parsedType,
                code: proj.project_code,
                status: proj.status
            };
        });
    },

    createProject: (name, type) => {
        return api.request("/projects", "POST", {
            project_name: name,
            description: `Проект типа ${type}`
        });
    },

    async deleteProject(projectId) {
        return await this.request(`/projects/${projectId}`, "DELETE");
    },

    // Новое: Вступление в проект
    async joinProject(code) {
        return await this.request(`/projects/join`, "POST", { code });
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
        return await this.request(`/projects/${projectId}/works`);
    },

    async submitWork(projectId, { title, content, iteration_id = null }) {
        return await this.request(`/projects/${projectId}/works`, "POST", {
            title, content, iteration_id
        });
    },

    // ==========================================
    // 3. ИТЕРАЦИИ (Сборы)
    // ==========================================
    async updateIterationStatus(projectId, iterationId, status) {
        // Подстроено под PATCH /projects/{id}/iterations/{it_id}
        return await this.request(`/projects/${projectId}/iterations/${iterationId}`, "PATCH", {
            status: status
        });
    },

    // ==========================================
    // 4. НАЗНАЧЕНИЯ (Assignments)
    // ==========================================
    async assignRandomExperts(projectId, count) {
        // Изменено: теперь используется algorithm и reviews_per_work вместо assignment_type
        return await this.request(`/projects/${projectId}/assignments`, "POST", {
            algorithm: "random",
            reviews_per_work: count
        });
    },

    // ==========================================
    // 5. РЕЦЕНЗИИ И ОЦЕНКИ
    // ==========================================
    async submitReview(workId, iterationId, score, comment, criteriaScores = []) {
        // Изменено: URL теперь /works/{workId}/reviews, а поля отправляются согласно документации бэкенда
        return await this.request(`/works/${workId}/reviews`, "POST", {
            iteration_id: iterationId,
            score: score,
            comment: comment,
            criteria_scores: criteriaScores
        });
    }
};

if (typeof window !== "undefined") {
    window.api = api;
    console.log("✅ API loaded");
}