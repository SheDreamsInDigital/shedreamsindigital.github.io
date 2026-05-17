/*
 * Personal Goals Studio
 * Browser-only goal planning app that can learn from an uploaded tracker layout.
 */
window.addEventListener('DOMContentLoaded', () => {
    const sidebarWrapper = document.getElementById('sidebar-wrapper');
    const menuToggle = document.body.querySelector('.menu-toggle');
    let scrollToTopVisible = false;

    if (menuToggle && sidebarWrapper) {
        menuToggle.addEventListener('click', event => {
            event.preventDefault();
            sidebarWrapper.classList.toggle('active');
            toggleMenuIcon();
            menuToggle.classList.toggle('active');
        });
    }

    const scrollTriggerList = [].slice.call(document.querySelectorAll('#sidebar-wrapper .js-scroll-trigger'));
    scrollTriggerList.map(scrollTrigger => {
        scrollTrigger.addEventListener('click', () => {
            sidebarWrapper.classList.remove('active');
            menuToggle.classList.remove('active');
            toggleMenuIcon();
        });
    });

    function toggleMenuIcon() {
        const menuToggleBars = document.body.querySelector('.menu-toggle > .fa-bars');
        const menuToggleTimes = document.body.querySelector('.menu-toggle > .fa-xmark');
        if (menuToggleBars) {
            menuToggleBars.classList.remove('fa-bars');
            menuToggleBars.classList.add('fa-xmark');
        }
        if (menuToggleTimes) {
            menuToggleTimes.classList.remove('fa-xmark');
            menuToggleTimes.classList.add('fa-bars');
        }
    }

    document.addEventListener('scroll', () => {
        const scrollToTop = document.body.querySelector('.scroll-to-top');
        if (!scrollToTop) {
            return;
        }

        if (document.documentElement.scrollTop > 100) {
            if (!scrollToTopVisible) {
                fadeIn(scrollToTop);
                scrollToTopVisible = true;
            }
        } else if (scrollToTopVisible) {
            fadeOut(scrollToTop);
            scrollToTopVisible = false;
        }
    });

    initializeGoalsStudio();
});

const GOALS_KEY = 'personal-goals-studio-goals';
const IMPORT_KEY = 'personal-goals-studio-import';
const CHECKIN_KEY = 'personal-goals-studio-checkins';

function initializeGoalsStudio() {
    const goalForm = document.getElementById('goal-form');
    const fileInput = document.getElementById('tracker-upload');
    const pasteInput = document.getElementById('tracker-paste');
    const analyzeButton = document.getElementById('analyze-layout');
    const clearImportButton = document.getElementById('clear-import');
    const exportButton = document.getElementById('export-goals');
    const clearGoalsButton = document.getElementById('clear-goals');

    if (!goalForm) {
        return;
    }

    renderGoalBoard();
    renderLayoutPreview();
    updateHeroStats();

    document.querySelectorAll('[data-goal]').forEach(button => {
        button.addEventListener('click', () => {
            goalForm.elements.title.value = button.dataset.goal;
            goalForm.elements.area.value = button.dataset.area;
            goalForm.elements.title.focus();
        });
    });

    goalForm.addEventListener('submit', event => {
        event.preventDefault();
        const formData = new FormData(goalForm);
        const goal = createGoal({
            title: formData.get('title'),
            area: formData.get('area'),
            cadence: formData.get('cadence'),
            target: formData.get('target'),
            notes: formData.get('notes')
        });

        if (!goal.title) {
            setStatus('Please add a goal before saving.', 'error');
            return;
        }

        saveGoals([goal, ...getGoals()]);
        goalForm.reset();
        goalForm.elements.cadence.value = 'Daily';
        renderGoalBoard();
        updateHeroStats();
        setStatus(`Saved “${goal.title}” to your local goals board.`, 'success');
    });

    fileInput.addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const text = await file.text();
        pasteInput.value = text;
        analyzeTrackerText(text, file.name);
    });

    analyzeButton.addEventListener('click', () => {
        analyzeTrackerText(pasteInput.value, 'pasted tracker text');
    });

    clearImportButton.addEventListener('click', () => {
        localStorage.removeItem(IMPORT_KEY);
        pasteInput.value = '';
        fileInput.value = '';
        renderLayoutPreview();
        setStatus('Imported tracker layout cleared.', 'success');
    });

    exportButton.addEventListener('click', () => {
        downloadJson('personal-goals-studio-export.json', {
            exportedAt: new Date().toISOString(),
            goals: getGoals(),
            checkins: getStoredJson(CHECKIN_KEY, []),
            importedLayout: getStoredJson(IMPORT_KEY, null)
        });
        setStatus('Downloaded a JSON backup of your goals.', 'success');
    });

    clearGoalsButton.addEventListener('click', () => {
        localStorage.removeItem(GOALS_KEY);
        localStorage.removeItem(CHECKIN_KEY);
        renderGoalBoard();
        updateHeroStats();
        setStatus('Local goals and check-ins cleared for this browser.', 'success');
    });
}

function analyzeTrackerText(rawText, sourceName) {
    const cleanedText = stripHtml(rawText).trim();
    if (!cleanedText) {
        setStatus('Upload or paste your tracker layout first.', 'warning');
        return;
    }

    const detectedItems = detectGoalItems(cleanedText);
    const importedLayout = {
        sourceName,
        importedAt: new Date().toISOString(),
        detectedItems,
        sample: cleanedText.slice(0, 1200)
    };

    localStorage.setItem(IMPORT_KEY, JSON.stringify(importedLayout));

    if (detectedItems.length) {
        const existingTitles = new Set(getGoals().map(goal => goal.title.toLowerCase()));
        const importedGoals = detectedItems
            .filter(item => !existingTitles.has(item.title.toLowerCase()))
            .map(item => createGoal(item));
        saveGoals([...importedGoals, ...getGoals()]);
        setStatus(`Imported ${importedGoals.length} draft goal${importedGoals.length === 1 ? '' : 's'} from ${sourceName}.`, 'success');
    } else {
        setStatus('I saved the layout preview, but did not detect goal rows yet. Try pasting headings or table text.', 'warning');
    }

    renderLayoutPreview();
    renderGoalBoard();
    updateHeroStats();
}

function detectGoalItems(text) {
    const lines = text
        .split(/\r?\n|\t|•|\u2022/g)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(line => line.length >= 3 && line.length <= 120)
        .filter(line => !/^(created|updated|select|status|date|name|type|property)$/i.test(line));

    const candidates = [];
    for (const line of lines) {
        const cells = line.split(/,|\||;/).map(cell => cell.trim()).filter(Boolean);
        const title = cells.find(cell => /[a-zA-Z]/.test(cell)) || line;
        if (!title || candidates.some(candidate => candidate.title.toLowerCase() === title.toLowerCase())) {
            continue;
        }

        candidates.push({
            title: title.replace(/^[-*\d.)\s]+/, ''),
            area: inferArea(line),
            cadence: inferCadence(line),
            target: inferTarget(line),
            notes: cells.slice(1).join(' • ')
        });

        if (candidates.length >= 12) {
            break;
        }
    }

    return candidates;
}

function createGoal(values) {
    return {
        id: createEntryId(),
        title: String(values.title || '').trim(),
        area: String(values.area || 'Personal').trim() || 'Personal',
        cadence: String(values.cadence || 'Daily').trim() || 'Daily',
        target: String(values.target || '').trim(),
        notes: String(values.notes || '').trim(),
        progress: 0,
        createdAt: new Date().toISOString()
    };
}

function getGoals() {
    return getStoredJson(GOALS_KEY, []);
}

function saveGoals(goals) {
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

function renderGoalBoard() {
    const goalBoard = document.getElementById('goal-board');
    if (!goalBoard) {
        return;
    }

    const goals = getGoals();
    if (!goals.length) {
        goalBoard.innerHTML = '<p class="empty-state">No goals yet. Add one manually or upload your tracker layout to create a draft board.</p>';
        return;
    }

    goalBoard.innerHTML = goals.map(goal => `
        <article class="goal-card" data-goal-id="${goal.id}">
            <div class="goal-card__header">
                <span class="area-pill">${escapeHtml(goal.area)}</span>
                <button type="button" class="goal-card__remove" data-remove-goal="${goal.id}" aria-label="Remove ${escapeHtml(goal.title)}">&times;</button>
            </div>
            <h4>${escapeHtml(goal.title)}</h4>
            <p>${escapeHtml(goal.target || goal.notes || 'Define a target or next action when you are ready.')}</p>
            <div class="progress goal-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.progress}">
                <div class="progress-bar" style="width: ${goal.progress}%"></div>
            </div>
            <div class="goal-card__footer">
                <span>${escapeHtml(goal.cadence)}</span>
                <button type="button" class="btn btn-sm btn-primary" data-checkin-goal="${goal.id}">${goal.progress >= 100 ? 'Reset' : 'Check in'}</button>
            </div>
        </article>
    `).join('');

    goalBoard.querySelectorAll('[data-checkin-goal]').forEach(button => {
        button.addEventListener('click', () => checkInGoal(button.dataset.checkinGoal));
    });

    goalBoard.querySelectorAll('[data-remove-goal]').forEach(button => {
        button.addEventListener('click', () => removeGoal(button.dataset.removeGoal));
    });
}

function checkInGoal(goalId) {
    const goals = getGoals().map(goal => {
        if (goal.id !== goalId) {
            return goal;
        }

        return {
            ...goal,
            progress: goal.progress >= 100 ? 0 : Math.min(goal.progress + 25, 100),
            lastCheckIn: new Date().toISOString()
        };
    });

    const checkedGoal = goals.find(goal => goal.id === goalId);
    const checkins = getStoredJson(CHECKIN_KEY, []);
    checkins.unshift({ goalId, title: checkedGoal.title, checkedAt: new Date().toISOString() });
    localStorage.setItem(CHECKIN_KEY, JSON.stringify(checkins.slice(0, 100)));

    saveGoals(goals);
    renderGoalBoard();
    updateHeroStats();
    setStatus(`Updated progress for “${checkedGoal.title}.”`, 'success');
}

function removeGoal(goalId) {
    saveGoals(getGoals().filter(goal => goal.id !== goalId));
    renderGoalBoard();
    updateHeroStats();
    setStatus('Goal removed from this browser.', 'success');
}

function renderLayoutPreview() {
    const layoutPreview = document.getElementById('layout-preview');
    if (!layoutPreview) {
        return;
    }

    const importedLayout = getStoredJson(IMPORT_KEY, null);
    if (!importedLayout) {
        layoutPreview.innerHTML = '<p class="empty-state">No tracker layout imported yet.</p>';
        return;
    }

    const detectedMarkup = importedLayout.detectedItems.length
        ? importedLayout.detectedItems.map(item => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.area)} • ${escapeHtml(item.cadence)}</span></li>`).join('')
        : '<li><strong>No goal rows detected yet</strong><span>Try a CSV, HTML export, or pasted headings.</span></li>';

    layoutPreview.innerHTML = `
        <div class="import-meta">
            <strong>${escapeHtml(importedLayout.sourceName)}</strong>
            <span>${new Date(importedLayout.importedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        <ul class="import-list">${detectedMarkup}</ul>
        <details>
            <summary>View text sample</summary>
            <pre>${escapeHtml(importedLayout.sample)}</pre>
        </details>
    `;
}

function updateHeroStats() {
    const goals = getGoals();
    const today = new Date().toISOString().slice(0, 10);
    const doneToday = goals.filter(goal => goal.lastCheckIn && goal.lastCheckIn.slice(0, 10) === today).length;
    const areas = new Set(goals.map(goal => goal.area));
    setText('hero-goal-count', goals.length);
    setText('hero-done-count', doneToday);
    setText('hero-area-count', areas.size);
}

function inferArea(value) {
    const lowerValue = value.toLowerCase();
    const areaMap = [
        ['Health', ['health', 'walk', 'workout', 'water', 'sleep', 'meditat', 'body']],
        ['Creative', ['write', 'draw', 'design', 'music', 'creative', 'project']],
        ['Career', ['work', 'career', 'business', 'learn', 'study', 'client']],
        ['Home', ['home', 'clean', 'reset', 'cook', 'organize']],
        ['Relationships', ['friend', 'family', 'partner', 'call', 'community']]
    ];
    const match = areaMap.find(([, keywords]) => keywords.some(keyword => lowerValue.includes(keyword)));
    return match ? match[0] : 'Personal';
}

function inferCadence(value) {
    const lowerValue = value.toLowerCase();
    if (lowerValue.includes('week')) {
        return 'Weekly';
    }
    if (lowerValue.includes('month')) {
        return 'Monthly';
    }
    if (lowerValue.includes('daily') || lowerValue.includes('day')) {
        return 'Daily';
    }
    return 'Daily';
}

function inferTarget(value) {
    const targetMatch = value.match(/\b(\d+\s?(?:min|minutes|hours|hrs|x|times|pages|steps|oz))\b/i);
    return targetMatch ? targetMatch[1] : '';
}

function stripHtml(value) {
    return value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

function setStatus(message, type = 'info') {
    const statusBanner = document.getElementById('status-banner');
    if (!statusBanner) {
        return;
    }

    statusBanner.textContent = message;
    statusBanner.dataset.status = type;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function getStoredJson(key, fallback) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
        console.warn(`Unable to parse ${key} from localStorage.`, error);
        return fallback;
    }
}

function createEntryId() {
    if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#039;',
        '"': '&quot;'
    }[character]));
}

function fadeOut(el) {
    el.style.opacity = 1;
    (function fade() {
        if ((el.style.opacity -= .1) < 0) {
            el.style.display = 'none';
        } else {
            requestAnimationFrame(fade);
        }
    })();
}

function fadeIn(el, display) {
    el.style.opacity = 0;
    el.style.display = display || 'block';
    (function fade() {
        let val = parseFloat(el.style.opacity);
        if (!((val += .1) > 1)) {
            el.style.opacity = val;
            requestAnimationFrame(fade);
        }
    })();
}
