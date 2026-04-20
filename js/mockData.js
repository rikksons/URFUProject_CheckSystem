const projectData = {
    submissions: [
        {
            id: 1,
            studentInitials: "ИИИ",
            name: "Иванов Иван Иванович",
            telegram: "@ivanov",
            date: "2026-03-20",
            status: "done",
            statusText: "Проверено",
            // Теперь проверки — это массив
            reviews: [
                {
                    reviewerName: "Dr. Smith",
                    reviewerTg: "@dr_smith",
                    score: 5.0,
                    comment: "Отличная работа! Код структурирован верно, логика соблюдена."
                },
                {
                    reviewerName: "Prof. Johnson",
                    reviewerTg: "@prof_j",
                    score: 4.0,
                    comment: "В целом хорошо, но есть пара мелких недочетов в стилях."
                }
            ]
        },
        {
            id: 2,
            studentInitials: "ППП",
            name: "Петров Петр Петрович",
            telegram: "@petrov",
            date: "2026-03-21",
            status: "checking",
            statusText: "На проверке",
            reviews: [
                {
                    reviewerName: "Alice Wonderland",
                    reviewerTg: "@alice_w",
                    score: 3.5,
                    comment: "Не работает кнопка отправки формы. В остальном приемлемо."
                }
            ]
        },
        {
            id: 3,
            studentInitials: "САМ",
            name: "Сидорова Анна Михайловна",
            telegram: "@sidorova",
            date: "2026-03-22",
            status: "waiting",
            statusText: "Ожидание",
            reviews: [] // Пока никто не проверил
        }
    ],
    experts: [
        { initials: "DS", name: "Dr. Smith", tg: "@dr_smith", reviews: 5 },
        { initials: "PJ", name: "Prof. Johnson", tg: "@prof_j", reviews: 3 },
        { initials: "AW", name: "Alice Wonderland", tg: "@alice_w", reviews: 1 }
    ]
};

const mockData = {
    projects: [
        {
            id: 1,
            name: "Веб-разработка",
            type: "p2p", // p2p или exam
            date: "2026-03-15",
            code: "WEB-2026-XJ9",
            submissions: [
                {
                    id: 1, studentInitials: "ИИИ", name: "Иванов Иван", telegram: "@ivanov", date: "2026-03-20",
                    status: "done", statusText: "Проверено",
                    reviews: [{ reviewerName: "Dr. Smith", reviewerTg: "@dr_smith", score: 5.0, comment: "Отличная работа!" }]
                },
                {
                    id: 2, studentInitials: "ППП", name: "Петров Петр", telegram: "@petrov", date: "2026-03-21",
                    status: "checking", statusText: "На проверке",
                    reviews: []
                }
            ],
            experts: [
                { initials: "DS", name: "Dr. Smith", tg: "@dr_smith", role: "Преподаватель" }
            ],
            joinRequests: [
                { id: 101, name: "Смирнов Алексей", tg: "@alex_smirnov" },
                { id: 102, name: "Кузнецова Мария", tg: "@mary_kuz" }
            ]
        },
        {
            id: 2,
            name: "Машинное обучение",
            type: "exam",
            date: "2026-04-01",
            code: "ML-EXAM-404",
            submissions: [],
            experts: [],
            joinRequests: []
        }
    ]
};