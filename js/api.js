// js/api.js — ИСПРАВЛЕННАЯ ВЕРСИЯ
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

    // 1. ПОЛУЧЕНИЕ ПРОЕКТОВ (Переводим из БД во фронтенд)
    getProjects: async () => {
        const response = await api.request("/projects");
        
        // Выводим ответ сервера в консоль, чтобы подглядеть структуру
        console.log("Ответ от сервера:", response); 

        // УМНАЯ РАСПАКОВКА: Ищем массив внутри ответа
        let rawProjects = [];
        if (Array.isArray(response)) {
            rawProjects = response; // Если сервер прислал чистый массив
        } else if (response && Array.isArray(response.data)) {
            rawProjects = response.data; // Если массив лежит в поле .data
        } else if (response && Array.isArray(response.items)) {
            rawProjects = response.items; // Если массив лежит в поле .items
        } else {
            console.error("Не удалось найти массив проектов в ответе сервера!");
            return [];
        }
        
        // Перебираем каждый проект из базы и меняем названия полей
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

    // 2. СОЗДАНИЕ ПРОЕКТА (Переводим с фронтенда в БД)
    createProject: (name, type) => {
        // Отправляем данные так, как их ждет таблица в БД
        return api.request("/projects", "POST", {
            project_name: name,
            description: `Проект типа ${type}` // Склеиваем обратно в строку для БД
        });
    },

    async deleteProject(projectId) {
        return await this.request(`/projects/${projectId}`, "DELETE");
    },

    // === Работы ===
    async getProjectWorks(projectId) {
        return await this.request(`/projects/${projectId}/works`);
    },
    async submitWork(projectId, { title, content, iteration_id = null }) {
        return await this.request(`/projects/${projectId}/works`, "POST", {
            title, content, iteration_id
        });
    },

    // === Итерации ===
    async updateIterationStatus(projectId, iterationId, status) {
        return await this.request(`/projects/${projectId}/iterations/${iterationId}`, "PATCH", { status });
    },

    // === Назначения ===
    async assignRandomExperts(projectId, count) {
        return await this.request(`/projects/${projectId}/assignments`, "POST", {
            assignment_type: "auto",
            reviews_per_work: count
        });
    },

    // === Рецензии ===
    async submitReview(projectId, workId, { review, rating }) {
        return await this.request(`/projects/${projectId}/works/${workId}/reviews`, "POST", {
            review, rating
        });
    }
};

if (typeof window !== "undefined") {
    window.api = api;
    console.log("✅ API loaded");
}