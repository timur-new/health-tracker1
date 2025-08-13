'use strict';

// Simple state management with localStorage persistence
const STORAGE_KEY = 'health-tracker-state-v2';

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
	fitness: {
		plans: [
			{ id: uid(), name: 'Push Day', exercises: [
				{ id: uid(), name: 'Bench Press', sets: 4, reps: 8 },
				{ id: uid(), name: 'Overhead Press', sets: 3, reps: 10 },
				{ id: uid(), name: 'Tricep Dips', sets: 3, reps: 12 },
			]},
			{ id: uid(), name: 'Pull Day', exercises: [
				{ id: uid(), name: 'Deadlift', sets: 3, reps: 5 },
				{ id: uid(), name: 'Pull-ups', sets: 4, reps: 8 },
			]},
		],
		activeSession: null,
	},
	history: {}, // map isoDate -> { events: [], snapshot?: {...} }
});

function loadState() {
	let saved;
	try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { saved = null; }
	// Migrate from v1 if needed
	if (!saved) {
		try {
			const v1 = JSON.parse(localStorage.getItem('health-tracker-state-v1'));
			if (v1) saved = v1;
		} catch (_) {}
	}
	let state = saved || DEFAULT_STATE();

	if (!state.history) state.history = {};
	if (!state.fitness) state.fitness = { plans: [], activeSession: null };

	// Daily rollover: archive previous day contents to history then reset for today
	if (state.day && state.day.isoDate !== todayIsoDate()) {
		archiveDaySnapshot(state, state.day.isoDate, state.day);
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

function ensureHistoryDate(dateIso) {
	if (!state.history[dateIso]) state.history[dateIso] = { events: [] };
	return state.history[dateIso];
}

function logEvent(type, data) {
	const dateIso = todayIsoDate();
	const h = ensureHistoryDate(dateIso);
	h.events.push({ id: uid(), ts: new Date().toISOString(), type, data });
	persist(state);
}

function archiveDaySnapshot(stateObj, dateIso, dayObj) {
	const h = ensureHistoryDate(dateIso);
	h.snapshot = {
		dateIso,
		meals: dayObj.meals || [],
		supplements: dayObj.supplements || {},
		waterEvents: dayObj.waterEvents || [],
		hydrationMl: dayObj.hydrationMl || 0,
		totals: sumMealsOf(dayObj),
		supplementsTaken: Object.values(dayObj.supplements || {}).filter(s => s.taken).length,
	};
}

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
	const meal = { id: uid(), name, when, calories, protein, carbs, fat };
	state.day.meals.push(meal);
	persist(state);
	logEvent('meal:add', { meal });
	renderMeals();
	renderNutritionBars();
	renderDashboardBars();
	updateTodaySnapshot();
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
			const removed = state.day.meals.find(m => m.id === id);
			state.day.meals = state.day.meals.filter(m => m.id !== id);
			persist(state);
			logEvent('meal:remove', { meal: removed });
			renderMeals();
			renderNutritionBars();
			renderDashboardBars();
			updateTodaySnapshot();
		});
	});
}

function sumMeals() { return sumMealsOf(state.day); }
function sumMealsOf(dayObj) {
	return (dayObj.meals || []).reduce((acc, m) => ({
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
const addSuppBtn = document.getElementById('add-supp-btn');
const resetSuppBtn = document.getElementById('reset-supp-btn');

addSuppBtn.addEventListener('click', () => {
	const name = (prompt('Supplement name') || '').trim();
	if (!name) return;
	const dose = (prompt('Dose (e.g., 2000 IU or 1000mg)') || '').trim() || 'as directed';
	if (!state.day.supplements) state.day.supplements = {};
	state.day.supplements[name] = { dose, taken: false };
	persist(state);
	logEvent('supplement:add', { name, dose });
	renderSupplements();
	updateTodaySnapshot();
});

resetSuppBtn.addEventListener('click', () => {
	Object.keys(state.day.supplements || {}).forEach(k => state.day.supplements[k].taken = false);
	persist(state);
	logEvent('supplement:reset', {});
	renderSupplements();
	updateTodaySnapshot();
});

function renderSupplements() {
	suppList.innerHTML = '';
	const entries = Object.entries(state.day.supplements || {});
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
			<div class="row gap-s">
				<button class="btn ghost" data-toggle="${escapeHtml(name)}">${info.taken ? 'Undo' : 'Mark'}</button>
				<button class="btn danger ghost" data-remove="${escapeHtml(name)}">Remove</button>
			</div>
		`;
		suppList.appendChild(li);
	});

	suppList.querySelectorAll('[data-toggle]').forEach(btn => {
		btn.addEventListener('click', () => toggleSupplement(btn.getAttribute('data-toggle')));
	});
	suppList.querySelectorAll('[data-supp]').forEach(el => {
		el.addEventListener('click', () => toggleSupplement(el.getAttribute('data-supp')));
	});
	suppList.querySelectorAll('[data-remove]').forEach(btn => {
		btn.addEventListener('click', () => removeSupplement(btn.getAttribute('data-remove')));
	});

	const taken = entries.filter(([_, v]) => v.taken).length;
	document.getElementById('supp-summary').textContent = `${taken} of ${entries.length} supplements taken`;
}

function toggleSupplement(name) {
	const item = state.day.supplements[name];
	if (!item) return;
	item.taken = !item.taken;
	persist(state);
	if (item.taken) logEvent('supplement:taken', { name, dose: item.dose });
	else logEvent('supplement:untaken', { name });
	renderSupplements();
	updateTodaySnapshot();
}

function removeSupplement(name) {
	if (!state.day.supplements[name]) return;
	const dose = state.day.supplements[name].dose;
	delete state.day.supplements[name];
	persist(state);
	logEvent('supplement:remove', { name, dose });
	renderSupplements();
	updateTodaySnapshot();
}

// Hydration rendering and actions
const waterLabel = document.getElementById('water-label');
const waterBar = document.getElementById('water-bar');

document.querySelectorAll('[data-add]').forEach(btn => {
	btn.addEventListener('click', () => {
		const ml = parseInt(btn.getAttribute('data-add'), 10);
		addWater(ml);
	});
});

document.getElementById('undo-water').addEventListener('click', () => {
	if (state.day.waterEvents.length > 0) {
		const last = state.day.waterEvents.pop();
		state.day.hydrationMl = Math.max(0, state.day.hydrationMl - last);
		persist(state);
		logEvent('water:undo', { ml: last });
		renderHydration();
		renderDashboardBars();
		updateTodaySnapshot();
	}
});

function addWater(ml) {
	state.day.hydrationMl += ml;
	state.day.waterEvents.push(ml);
	persist(state);
	logEvent('water:add', { ml });
	renderHydration();
	renderDashboardBars();
	updateTodaySnapshot();
}

function renderHydration() {
	const current = state.day.hydrationMl;
	const goal = state.goals.hydrationMl;
	const pct = Math.min(100, Math.round((current / goal) * 100));
	waterLabel.textContent = `${(current/1000).toFixed(2)} L / ${(goal/1000).toFixed(2)} L`;
	waterBar.style.width = pct + '%';
}

// Fitness: plans and active session
const plansListEl = document.getElementById('plan-list');
const addPlanBtn = document.getElementById('add-plan-btn');
const currentWorkoutEl = document.getElementById('current-workout');

addPlanBtn.addEventListener('click', () => {
	const name = (prompt('New plan name') || '').trim();
	if (!name) return;
	state.fitness.plans.push({ id: uid(), name, exercises: [] });
	persist(state);
	renderPlans();
});

function renderPlans() {
	plansListEl.innerHTML = '';
	const plans = state.fitness.plans || [];
	if (plans.length === 0) {
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = '<div class="muted">No plans yet. Click "New Plan" to create one.</div>';
		plansListEl.appendChild(li);
		return;
	}
	plans.forEach(plan => {
		const li = document.createElement('li');
		li.className = 'list-row';
		const exerciseCount = plan.exercises ? plan.exercises.length : 0;
		li.innerHTML = `
			<div>
				<div class="title">${escapeHtml(plan.name)}</div>
				<div class="muted small">${exerciseCount} exercises</div>
			</div>
			<div class="row gap-s">
				<button class="btn" data-start-plan="${plan.id}">Start</button>
				<button class="btn ghost" data-add-ex="${plan.id}">Add Exercise</button>
				<button class="btn danger ghost" data-del-plan="${plan.id}">Delete</button>
			</div>`;
		plansListEl.appendChild(li);
	});

	plansListEl.querySelectorAll('[data-add-ex]').forEach(btn => btn.addEventListener('click', () => addExerciseToPlan(btn.getAttribute('data-add-ex'))));
	plansListEl.querySelectorAll('[data-del-plan]').forEach(btn => btn.addEventListener('click', () => deletePlan(btn.getAttribute('data-del-plan'))));
	plansListEl.querySelectorAll('[data-start-plan]').forEach(btn => btn.addEventListener('click', () => startPlan(btn.getAttribute('data-start-plan'))));
}

function addExerciseToPlan(planId) {
	const plan = (state.fitness.plans || []).find(p => p.id === planId);
	if (!plan) return;
	const name = (prompt('Exercise name') || '').trim();
	if (!name) return;
	const sets = clamp(parseInt(prompt('Target sets', '3') || '0', 10), 1, 20);
	const reps = clamp(parseInt(prompt('Target reps per set', '10') || '0', 10), 1, 100);
	plan.exercises.push({ id: uid(), name, sets, reps });
	persist(state);
	renderPlans();
}

function deletePlan(planId) {
	state.fitness.plans = (state.fitness.plans || []).filter(p => p.id !== planId);
	persist(state);
	renderPlans();
}

function startPlan(planId) {
	const plan = (state.fitness.plans || []).find(p => p.id === planId);
	if (!plan) return;
	state.fitness.activeSession = {
		id: uid(),
		name: plan.name,
		startIso: new Date().toISOString(),
		exercises: (plan.exercises || []).map(e => ({ id: uid(), name: e.name, targetSets: e.sets, targetReps: e.reps, setsCompleted: 0, avgReps: e.reps, weight: 0 }))
	};
	persist(state);
	renderActiveSession();
}

function renderActiveSession() {
	const s = state.fitness.activeSession;
	if (!s) { currentWorkoutEl.classList.add('hidden'); currentWorkoutEl.innerHTML = ''; return; }
	currentWorkoutEl.classList.remove('hidden');
	const started = new Date(s.startIso);
	currentWorkoutEl.innerHTML = `
		<div class="row between center">
			<h3>Current Workout — ${escapeHtml(s.name)}</h3>
			<div class="row gap-s">
				<button class="btn" id="finish-workout">Finish</button>
				<button class="btn danger ghost" id="cancel-workout">Cancel</button>
			</div>
		</div>
		<div class="muted small">Started at ${started.toLocaleTimeString()}</div>
		<h4 class="subheading">Exercises</h4>
		<ul class="list" id="session-ex-list"></ul>
		<div class="row gap-s" style="margin-top:8px">
			<button class="btn ghost" id="session-add-ex">Add Exercise</button>
		</div>
	`;
	const list = currentWorkoutEl.querySelector('#session-ex-list');
	list.innerHTML = '';
	(s.exercises || []).forEach(ex => {
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = `
			<div style="flex:1;min-width:200px">
				<div class="title">${escapeHtml(ex.name)}</div>
				<div class="muted small">Target: ${ex.targetSets} x ${ex.targetReps}</div>
			</div>
			<div class="row gap-s center">
				<label class="small">Sets <input type="number" min="0" max="50" value="${ex.setsCompleted}" data-ex-sets="${ex.id}"></label>
				<label class="small">Reps <input type="number" min="0" max="200" value="${ex.avgReps}" data-ex-reps="${ex.id}"></label>
				<label class="small">Weight <input type="number" min="0" max="1000" value="${ex.weight}" data-ex-weight="${ex.id}"></label>
				<button class="btn danger ghost" data-ex-remove="${ex.id}">Remove</button>
			</div>`;
		list.appendChild(li);
	});

	// Wire inputs
	list.querySelectorAll('[data-ex-sets]').forEach(inp => inp.addEventListener('input', () => updateSessionExercise(inp.getAttribute('data-ex-sets'), { setsCompleted: toInt(inp.value, 0) })));
	list.querySelectorAll('[data-ex-reps]').forEach(inp => inp.addEventListener('input', () => updateSessionExercise(inp.getAttribute('data-ex-reps'), { avgReps: toInt(inp.value, 0) })));
	list.querySelectorAll('[data-ex-weight]').forEach(inp => inp.addEventListener('input', () => updateSessionExercise(inp.getAttribute('data-ex-weight'), { weight: toInt(inp.value, 0) })));
	list.querySelectorAll('[data-ex-remove]').forEach(btn => btn.addEventListener('click', () => removeSessionExercise(btn.getAttribute('data-ex-remove'))));

	currentWorkoutEl.querySelector('#session-add-ex').addEventListener('click', () => {
		const n = (prompt('Exercise name') || '').trim();
		if (!n) return;
		const sets = clamp(parseInt(prompt('Target sets', '3') || '0', 10), 1, 20);
		const reps = clamp(parseInt(prompt('Target reps', '10') || '0', 10), 1, 100);
		state.fitness.activeSession.exercises.push({ id: uid(), name: n, targetSets: sets, targetReps: reps, setsCompleted: 0, avgReps: reps, weight: 0 });
		persist(state);
		renderActiveSession();
	});

	currentWorkoutEl.querySelector('#cancel-workout').addEventListener('click', () => {
		if (!confirm('Cancel current workout?')) return;
		state.fitness.activeSession = null;
		persist(state);
		renderActiveSession();
	});

	currentWorkoutEl.querySelector('#finish-workout').addEventListener('click', () => {
		const minutes = clamp(parseInt(prompt('Duration in minutes', '60') || '0', 10), 5, 300);
		const s2 = state.fitness.activeSession;
		const workoutName = s2.name;
		state.week.completedWorkouts.push({ id: uid(), name: workoutName, minutes, date: formatDateLabel(new Date()) });
		logEvent('workout:finish', { name: workoutName, minutes, exercises: s2.exercises });
		state.fitness.activeSession = null;
		persist(state);
		renderFitness();
		renderDashboardBars();
	});
}

function updateSessionExercise(exId, partial) {
	const s = state.fitness.activeSession; if (!s) return;
	const ex = s.exercises.find(e => e.id === exId); if (!ex) return;
	Object.assign(ex, partial);
	persist(state);
}

function removeSessionExercise(exId) {
	const s = state.fitness.activeSession; if (!s) return;
	s.exercises = s.exercises.filter(e => e.id !== exId);
	persist(state);
	renderActiveSession();
}

// Fitness rendering summary
const recentWorkoutsEl = document.getElementById('recent-workouts');

function renderFitness() {
	renderActiveSession();
	renderPlans();
	const completed = state.week.completedWorkouts || [];
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

	renderHistoryCard();
}

function renderHistoryCard() {
	const list = document.getElementById('history-list');
	if (!list) return;
	list.innerHTML = '';
	const days = lastNDates(7);
	days.forEach(dateIso => {
		const entry = state.history[dateIso];
		let snapshot = entry && entry.snapshot;
		if (!snapshot && dateIso === todayIsoDate()) {
			snapshot = buildSnapshotFor(state.day);
		}
		const calories = snapshot ? snapshot.totals.calories : 0;
		const waterL = snapshot ? (snapshot.hydrationMl / 1000).toFixed(2) : '0.00';
		const supp = snapshot ? snapshot.supplementsTaken : 0;
		const li = document.createElement('li');
		li.className = 'list-row';
		li.innerHTML = `
			<div>
				<div class="title">${formatDateLabel(new Date(dateIso))}</div>
				<div class="muted small">Calories ${calories} • Water ${waterL} L • Supplements ${supp}</div>
			</div>`;
		list.appendChild(li);
	});
}

function buildSnapshotFor(dayObj) {
	return {
		dateIso: dayObj.isoDate,
		meals: dayObj.meals,
		supplements: dayObj.supplements,
		waterEvents: dayObj.waterEvents,
		hydrationMl: dayObj.hydrationMl,
		totals: sumMealsOf(dayObj),
		supplementsTaken: Object.values(dayObj.supplements || {}).filter(s => s.taken).length,
	};
}

function updateTodaySnapshot() {
	archiveDaySnapshot(state, todayIsoDate(), state.day);
	persist(state);
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
function toInt(v, d=0) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }
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
function lastNDates(n) {
	const arr = [];
	for (let i = 0; i < n; i++) {
		const d = offsetDays(new Date(todayIsoDate()), -i);
		arr.push(d.toISOString().slice(0,10));
	}
	return arr.reverse();
}

// Initial render
renderAll();

// Expose debug helpers
window.healthTracker = {
	state,
	setState: (s) => { state = s; persist(state); renderAll(); },
	log: () => console.log(JSON.parse(localStorage.getItem(STORAGE_KEY)))
};