'use strict';

// Simple state management with localStorage persistence
const STORAGE_KEY = 'health-tracker-state-v1';

const DEFAULT_STATE = () => ({
	goals: {
		calories: 2000,
		protein: 150, // grams
		carbs: 200, // grams
		fat: 65, // grams
		hydrationMl: 2500,
		weeklyWorkoutsGoal: 4,
	},
	day: {
		isoDate: todayIsoDate(),
		supplements: {
			'Vitamin D3': { dose: '2000 IU', taken: true },
			'Omega-3': { dose: '1000mg', taken: false },
			'Magnesium': { dose: '400mg', taken: false },
		},
		meals: [
			{ id: uid(), name: 'Oatmeal with Berries', when: 'Breakfast', calories: 300, protein: 10, carbs: 55, fat: 5 },
			{ id: uid(), name: 'Grilled Chicken Salad', when: 'Lunch', calories: 450, protein: 35, carbs: 20, fat: 15 },
		],
		hydrationMl: 1500,
		waterEvents: [1500],
	},
	week: {
		isoWeekKey: isoWeekKey(new Date()),
		completedWorkouts: [
			{ id: uid(), name: 'Pull Day', minutes: 70, date: formatDateLabel(offsetDays(new Date(), -1)) },
			{ id: uid(), name: 'Push Day', minutes: 65, date: formatDateLabel(new Date()) },
		],
	},
});

function loadState() {
	let saved;
	try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { saved = null; }
	let state = saved || DEFAULT_STATE();
	// Daily reset if date changed
	if (state.day.isoDate !== todayIsoDate()) {
		state.day = {
			isoDate: todayIsoDate(),
			supplements: state.day && state.day.supplements ? Object.fromEntries(Object.entries(state.day.supplements).map(([k, v]) => [k, { ...v, taken: false }])) : DEFAULT_STATE().day.supplements,
			meals: [],
			hydrationMl: 0,
			waterEvents: [],
		};
	}
	// Weekly key maintenance
	if (!state.week || state.week.isoWeekKey !== isoWeekKey(new Date())) {
		state.week = { isoWeekKey: isoWeekKey(new Date()), completedWorkouts: [] };
	}
	persist(state);
	return state;
}

function persist(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();

// Tab handling
const tabButtons = Array.from(document.querySelectorAll('.tab'));
const panels = Array.from(document.querySelectorAll('.panel'));

tabButtons.forEach(btn => {
	btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});

function selectTab(name) {
	tabButtons.forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));
	panels.forEach(p => {
		const isActive = p.id === name;
		p.classList.toggle('is-hidden', !isActive);
		p.setAttribute('aria-hidden', String(!isActive));
	});
	// render related section when switching
	renderAll();
}

// Nutrition rendering and actions
const mealList = document.getElementById('meal-list');
const addMealBtn = document.getElementById('add-meal-btn');
addMealBtn.addEventListener('click', () => openAddMealDialog());

function openAddMealDialog() {
	const name = prompt('Meal name');
	if (!name) return;
	const when = prompt('When (Breakfast/Lunch/Dinner/Snack)', 'Lunch') || 'Lunch';
	const calories = clamp(parseInt(prompt('Calories', '400') || '0', 10), 0, 3000);
	const protein = clamp(parseInt(prompt('Protein grams (optional)', '25') || '0', 10), 0, 200);
	const carbs = clamp(parseInt(prompt('Carbs grams (optional)', '40') || '0', 10), 0, 400);
	const fat = clamp(parseInt(prompt('Fat grams (optional)', '12') || '0', 10), 0, 200);
	state.day.meals.push({ id: uid(), name, when, calories, protein, carbs, fat });
	persist(state);
	renderMeals();
	renderNutritionBars();
	renderDashboardBars();
}

function renderMeals() {
	mealList.innerHTML = '';
	if (state.day.meals.length === 0) {
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = '<div class="muted">No meals yet. Click "Add Meal" to log one.</div>';
		mealList.appendChild(li);
		return;
	}
	state.day.meals.forEach(meal => {
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = `
			<div>
				<div class="title">${escapeHtml(meal.name)}</div>
				<div class="meal-meta">${escapeHtml(meal.when)} • ${meal.calories} cal</div>
			</div>
			<div class="row gap-s center">
				<span class="meal-cal">${meal.calories} cal</span>
				<button class="btn ghost" data-delete="${meal.id}">Remove</button>
			</div>`;
		mealList.appendChild(li);
	});
	mealList.querySelectorAll('[data-delete]').forEach(btn => {
		btn.addEventListener('click', () => {
			const id = btn.getAttribute('data-delete');
			state.day.meals = state.day.meals.filter(m => m.id !== id);
			persist(state);
			renderMeals();
			renderNutritionBars();
			renderDashboardBars();
		});
	});
}

function sumMeals() {
	return state.day.meals.reduce((acc, m) => ({
		calories: acc.calories + (m.calories || 0),
		protein: acc.protein + (m.protein || 0),
		carbs: acc.carbs + (m.carbs || 0),
		fat: acc.fat + (m.fat || 0),
	}), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderNutritionBars() {
	const totals = sumMeals();
	const { goals } = state;
	setBar('nutr-calories', totals.calories, goals.calories, 'nutr-calories-label');
	setBar('nutr-protein', totals.protein, goals.protein, 'nutr-protein-label', 'g');
	setBar('nutr-carbs', totals.carbs, goals.carbs, 'nutr-carbs-label', 'g');
	setBar('nutr-fat', totals.fat, goals.fat, 'nutr-fat-label', 'g');
}

// Supplements rendering and actions
const suppList = document.getElementById('supplement-list');

function renderSupplements() {
	suppList.innerHTML = '';
	const entries = Object.entries(state.day.supplements);
	entries.forEach(([name, info]) => {
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = `
			<div class="toggle">
				<div class="checkbox ${info.taken ? 'checked' : ''}" data-supp="${escapeHtml(name)}">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
				</div>
				<div>
					<div class="title">${escapeHtml(name)}</div>
					<div class="muted small">${escapeHtml(info.dose)}</div>
				</div>
			</div>
			<button class="btn ghost" data-toggle="${escapeHtml(name)}">${info.taken ? 'Undo' : 'Mark'}</button>
		`;
		suppList.appendChild(li);
	});

	suppList.querySelectorAll('[data-toggle]').forEach(btn => {
		btn.addEventListener('click', () => toggleSupplement(btn.getAttribute('data-toggle')));
	});
	suppList.querySelectorAll('[data-supp]').forEach(el => {
		el.addEventListener('click', () => toggleSupplement(el.getAttribute('data-supp')));
	});

	const taken = entries.filter(([_, v]) => v.taken).length;
	document.getElementById('supp-summary').textContent = `${taken} of ${entries.length} supplements taken`;
}

function toggleSupplement(name) {
	const item = state.day.supplements[name];
	if (!item) return;
	item.taken = !item.taken;
	persist(state);
	renderSupplements();
}

// Hydration rendering and actions
const waterLabel = document.getElementById('water-label');
const waterBar = document.getElementById('water-bar');

document.querySelectorAll('[data-add]').forEach(btn => {
	btn.addEventListener('click', () => {
		addWater(parseInt(btn.getAttribute('data-add'), 10));
	});
});

document.getElementById('undo-water').addEventListener('click', () => {
	if (state.day.waterEvents.length > 0) {
		const last = state.day.waterEvents.pop();
		state.day.hydrationMl = Math.max(0, state.day.hydrationMl - last);
		persist(state);
		renderHydration();
		renderDashboardBars();
	}
});

function addWater(ml) {
	state.day.hydrationMl += ml;
	state.day.waterEvents.push(ml);
	persist(state);
	renderHydration();
	renderDashboardBars();
}

function renderHydration() {
	const current = state.day.hydrationMl;
	const goal = state.goals.hydrationMl;
	const pct = Math.min(100, Math.round((current / goal) * 100));
	waterLabel.textContent = `${(current/1000).toFixed(2)} L / ${(goal/1000).toFixed(2)} L`;
	waterBar.style.width = pct + '%';
}

// Fitness rendering and actions
const recentWorkoutsEl = document.getElementById('recent-workouts');

function renderFitness() {
	const completed = state.week.completedWorkouts;
	recentWorkoutsEl.innerHTML = '';
	if (completed.length === 0) {
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = '<div class="muted">No workouts yet this week.</div>';
		recentWorkoutsEl.appendChild(li);
	}
	completed.slice().reverse().forEach(w => {
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = `
			<div>
				<div class="title">${escapeHtml(w.name)}</div>
				<div class="muted small">${escapeHtml(w.date)} • ${w.minutes}min</div>
			</div>
			<div class="checkbox checked">✔</div>
		`;
		recentWorkoutsEl.appendChild(li);
	});

	const goal = state.goals.weeklyWorkoutsGoal;
	const done = completed.length;
	setBar('workout-bar', done, goal);
	document.getElementById('workout-summary').textContent = `${done} of ${goal} workouts completed this week`;
}

// Hook up start buttons
Array.from(document.querySelectorAll('[data-workout]')).forEach(btn => {
	btn.addEventListener('click', () => {
		const name = btn.getAttribute('data-workout');
		const minutes = parseInt(btn.getAttribute('data-duration'), 10) || 60;
		state.week.completedWorkouts.push({ id: uid(), name, minutes, date: formatDateLabel(new Date()) });
		persist(state);
		renderFitness();
		renderDashboardBars();
	});
});

// Dashboard rendering
function renderDashboardBars() {
	const totals = sumMeals();
	const { goals } = state;
	setBar('dash-calories', totals.calories, goals.calories, 'dash-calories-label');
	setBar('dash-protein', totals.protein, goals.protein, 'dash-protein-label', 'g');
	setBar('dash-carbs', totals.carbs, goals.carbs, 'dash-carbs-label', 'g');
	setBar('dash-fat', totals.fat, goals.fat, 'dash-fat-label', 'g');

	const current = state.day.hydrationMl;
	const goal = goals.hydrationMl;
	document.getElementById('dash-hydration').textContent = `${(current/1000).toFixed(2)} L / ${(goal/1000).toFixed(2)} L`;
	const pct = Math.min(100, Math.round((current / goal) * 100));
	document.getElementById('dash-hydration-bar').style.width = pct + '%';
}

// Generic helpers
function setBar(id, current, goal, labelId, unit = '') {
	const pct = Math.min(100, Math.round((current / goal) * 100));
	document.getElementById(id).style.width = pct + '%';
	if (labelId) {
		document.getElementById(labelId).textContent = `${current}${unit ? ' ' + unit : ''} / ${goal}${unit ? ' ' + unit : ''}`;
	}
}

function renderAll() {
	renderMeals();
	renderNutritionBars();
	renderSupplements();
	renderHydration();
	renderFitness();
	renderDashboardBars();
}

// Utility functions
function uid() { return Math.random().toString(36).slice(2, 10); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
function todayIsoDate() { return new Date().toISOString().slice(0,10); }
function offsetDays(date, d) { const nd = new Date(date); nd.setDate(nd.getDate() + d); return nd; }
function formatDateLabel(date) {
	const d = new Date(date);
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const yyyy = d.getFullYear();
	return `${dd}.${mm}.${yyyy}`;
}
function isoWeekKey(date) {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
	const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

// Initial render
renderAll();

// Expose simple debug to window for tweaking
window.healthTracker = { state, setState: (s) => { state = s; persist(state); renderAll(); } };