(function () {
  'use strict';

  const STORAGE_KEY = 'word-sprout-match-v1';
  const PAIRS_PER_GAME = 8;
  const LIMITS = { 'very-easy': 3, easy: 15, hard: 10 };
  const STICKERS = [
    { stars: 5, icon: '🐝', name: 'Busy Bee' },
    { stars: 15, icon: '🌼', name: 'Daisy' },
    { stars: 30, icon: '🐞', name: 'Ladybird' },
    { stars: 50, icon: '🌻', name: 'Sunflower' },
    { stars: 75, icon: '🦋', name: 'Blue Butterfly' },
    { stars: 105, icon: '🐌', name: 'Super Snail' },
    { stars: 140, icon: '🌈', name: 'Garden Rainbow' },
    { stars: 180, icon: '🐸', name: 'Friendly Frog' },
    { stars: 225, icon: '🦉', name: 'Wise Owl' },
    { stars: 275, icon: '🦊', name: 'Word Fox' },
    { stars: 330, icon: '🦄', name: 'Magic Unicorn' },
    { stars: 390, icon: '🏆', name: 'Word Champion' }
  ];

  const $ = selector => document.querySelector(selector);
  const elements = {
    startScreen: $('#startScreen'), gameScreen: $('#gameScreen'), startButton: $('#startButton'),
    homeButton: $('#homeButton'), leaveButton: $('#leaveButton'), cardGrid: $('#cardGrid'),
    totalStars: $('#totalStars'), soundButton: $('#soundButton'), rewardsButton: $('#rewardsButton'),
    scoreValue: $('#scoreValue'), pairsValue: $('#pairsValue'), missesLeft: $('#missesLeft'),
    missStat: $('#missStat'), gameProgress: $('#gameProgress'), statusLine: $('#statusLine'),
    gameEyebrow: $('#gameEyebrow'), comboPop: $('#comboPop'), resultModal: $('#resultModal'),
    resultIcon: $('#resultIcon'), resultEyebrow: $('#resultEyebrow'), resultTitle: $('#resultTitle'),
    resultMessage: $('#resultMessage'), finalScore: $('#finalScore'), earnedStars: $('#earnedStars'),
    finalMisses: $('#finalMisses'), newSticker: $('#newSticker'), newStickerIcon: $('#newStickerIcon'),
    newStickerName: $('#newStickerName'), resultHomeButton: $('#resultHomeButton'),
    playAgainButton: $('#playAgainButton'), rewardsModal: $('#rewardsModal'),
    closeRewardsButton: $('#closeRewardsButton'), stickerGrid: $('#stickerGrid'),
    nextRewardText: $('#nextRewardText'), leaveModal: $('#leaveModal'), stayButton: $('#stayButton'),
    confirmLeaveButton: $('#confirmLeaveButton'), confetti: $('#confetti')
  };

  const defaultState = { totalStars: 0, sound: true, level: 'K3', difficulty: 'easy', recentIds: [] };
  let state = loadState();
  let game = null;
  let audioContext = null;

  validateLibrary();
  initialise();

  function validateLibrary() {
    const levels = ['K3', 'P1', 'P2'];
    const words = [];
    levels.forEach(level => {
      const items = window.WORD_LIBRARY?.[level];
      if (!Array.isArray(items) || items.length !== 300) throw new Error(`${level} must contain exactly 300 words.`);
      items.forEach(item => words.push(item.word.toLowerCase()));
    });
    if (new Set(words).size !== 900) throw new Error('All 900 level words must be different.');
  }

  function initialise() {
    elements.totalStars.textContent = state.totalStars;
    elements.soundButton.textContent = state.sound ? '🔊' : '🔇';
    elements.soundButton.setAttribute('aria-label', state.sound ? 'Turn sound off' : 'Turn sound on');
    const levelInput = document.querySelector(`input[name="level"][value="${state.level}"]`);
    const difficultyInput = document.querySelector(`input[name="difficulty"][value="${state.difficulty}"]`);
    if (levelInput) levelInput.checked = true;
    if (difficultyInput) difficultyInput.checked = true;
    renderStickers();

    elements.startButton.addEventListener('click', startGame);
    elements.homeButton.addEventListener('click', requestHome);
    elements.leaveButton.addEventListener('click', requestHome);
    elements.soundButton.addEventListener('click', toggleSound);
    elements.rewardsButton.addEventListener('click', () => openModal(elements.rewardsModal));
    elements.closeRewardsButton.addEventListener('click', () => closeModal(elements.rewardsModal));
    elements.resultHomeButton.addEventListener('click', () => { closeModal(elements.resultModal); showStart(); });
    elements.playAgainButton.addEventListener('click', () => { closeModal(elements.resultModal); startGame(); });
    elements.stayButton.addEventListener('click', () => closeModal(elements.leaveModal));
    elements.confirmLeaveButton.addEventListener('click', () => { closeModal(elements.leaveModal); showStart(); });
    [elements.rewardsModal, elements.leaveModal].forEach(modal => modal.addEventListener('click', event => {
      if (event.target === modal) closeModal(modal);
    }));
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!elements.rewardsModal.classList.contains('hidden')) closeModal(elements.rewardsModal);
      else if (!elements.leaveModal.classList.contains('hidden')) closeModal(elements.leaveModal);
    });
  }

  function loadState() {
    try {
      return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...defaultState };
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* The game still works without saved progress. */ }
  }

  function selectedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value;
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  function pickPairs(level) {
    const pool = window.WORD_LIBRARY[level];
    const recent = new Set(state.recentIds || []);
    const preferred = shuffle(pool.filter(item => !recent.has(item.id)));
    const fallback = shuffle(pool.filter(item => recent.has(item.id)));
    const selected = [];
    const pictures = new Set();
    for (const item of [...preferred, ...fallback]) {
      if (pictures.has(item.picture)) continue;
      selected.push(item);
      pictures.add(item.picture);
      if (selected.length === PAIRS_PER_GAME) break;
    }
    state.recentIds = [...selected.map(item => item.id), ...(state.recentIds || [])].slice(0, 48);
    return selected;
  }

  function startGame() {
    const level = selectedValue('level') || state.level;
    const difficulty = selectedValue('difficulty') || state.difficulty;
    state.level = level;
    state.difficulty = difficulty;
    const words = pickPairs(level);
    const cards = shuffle(words.flatMap(item => [
      { cardId: `${item.id}-word`, pairId: item.id, kind: 'word', content: item.word, word: item.word },
      { cardId: `${item.id}-picture`, pairId: item.id, kind: 'picture', content: item.picture, word: item.word }
    ]));
    game = {
      level, difficulty, limit: LIMITS[difficulty], words, cards,
      first: null, second: null, locked: false, matched: 0, mistakes: 0,
      score: 0, streak: 0, bestStreak: 0, ended: false
    };
    saveState();
    renderBoard();
    elements.startScreen.classList.remove('active');
    elements.gameScreen.classList.add('active');
    elements.statusLine.textContent = difficulty === 'very-easy'
      ? 'All cards are open — pick a word and its picture.'
      : 'Pick any card to begin.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    tone('start');
  }

  function renderBoard() {
    elements.cardGrid.innerHTML = '';
    game.cards.forEach(card => {
      const button = document.createElement('button');
      button.type = 'button';
      const faceUp = game.difficulty === 'very-easy';
      button.className = `memory-card${faceUp ? ' face-up' : ''}`;
      button.dataset.cardId = card.cardId;
      button.dataset.pairId = card.pairId;
      button.dataset.kind = card.kind;
      button.setAttribute('aria-label', faceUp ? `${card.kind === 'word' ? 'Word' : 'Picture clue'}: ${card.kind === 'word' ? card.word : card.content}` : 'Hidden card');
      button.innerHTML = `<span class="memory-card-inner"><span class="card-face card-back"></span><span class="card-face card-front" aria-hidden="true">${card.content}</span></span>`;
      button.addEventListener('click', () => flipCard(button, card));
      elements.cardGrid.appendChild(button);
    });
    elements.gameEyebrow.textContent = `${game.level} · ${difficultyName(game.difficulty).toUpperCase()} GARDEN`;
    updateStats();
  }

  function flipCard(button, card) {
    if (!game || game.ended || game.locked || button.classList.contains('flipped') || button.classList.contains('selected') || button.classList.contains('matched')) return;
    if (game.difficulty === 'very-easy') button.classList.add('selected');
    else button.classList.add('flipped');
    button.setAttribute('aria-label', card.kind === 'word' ? `Word: ${card.word}` : `Picture clue for ${card.word}`);
    tone('flip');
    if (card.kind === 'word') speak(card.word);

    if (!game.first) {
      game.first = { button, card };
      elements.statusLine.textContent = 'Now find its matching partner.';
      return;
    }

    game.second = { button, card };
    game.locked = true;
    if (game.first.card.pairId === card.pairId) handleMatch();
    else handleMismatch();
  }

  function handleMatch() {
    const first = game.first;
    const second = game.second;
    game.matched += 1;
    game.streak += 1;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    const streakBonus = Math.min(75, Math.max(0, game.streak - 1) * 25);
    const points = 100 + streakBonus;
    game.score += points;
    [first, second].forEach(({ button, card }) => {
      button.classList.remove('selected');
      button.classList.add('matched');
      button.setAttribute('aria-label', `Matched ${card.word}`);
    });
    elements.statusLine.textContent = `${first.card.word} — a perfect match! +${points} points`;
    tone('match');
    if (game.streak >= 2) showCombo(game.streak, streakBonus);
    clearTurn();
    updateStats();
    if (game.matched === PAIRS_PER_GAME) {
      window.setTimeout(() => finishGame(true), 650);
    } else {
      game.locked = false;
    }
  }

  function handleMismatch() {
    game.mistakes += 1;
    game.streak = 0;
    const firstButton = game.first.button;
    const secondButton = game.second.button;
    firstButton.classList.add('shake');
    secondButton.classList.add('shake');
    elements.missStat.classList.remove('danger');
    void elements.missStat.offsetWidth;
    elements.missStat.classList.add('danger');
    tone('miss');
    updateStats();
    const left = Math.max(0, game.limit - game.mistakes);
    elements.statusLine.textContent = left > 0 ? `Not this time — ${left} raindrop${left === 1 ? '' : 's'} left. Try another pair!` : 'The rain has stopped. Let’s see how your garden grew.';
    window.setTimeout(() => {
      firstButton.classList.remove('flipped', 'selected', 'shake');
      secondButton.classList.remove('flipped', 'selected', 'shake');
      if (game.difficulty === 'very-easy') {
        firstButton.setAttribute('aria-label', visibleCardLabel(game.first.card));
        secondButton.setAttribute('aria-label', visibleCardLabel(game.second.card));
      } else {
        firstButton.setAttribute('aria-label', 'Hidden card');
        secondButton.setAttribute('aria-label', 'Hidden card');
      }
      clearTurn();
      if (game.mistakes >= game.limit) finishGame(false);
      else game.locked = false;
    }, 950);
  }

  function clearTurn() {
    game.first = null;
    game.second = null;
  }

  function updateStats() {
    elements.scoreValue.textContent = game.score.toLocaleString();
    elements.pairsValue.textContent = game.matched;
    elements.missesLeft.textContent = Math.max(0, game.limit - game.mistakes);
    elements.gameProgress.style.width = `${game.matched / PAIRS_PER_GAME * 100}%`;
  }

  function finishGame(won) {
    if (!game || game.ended) return;
    game.ended = true;
    game.locked = true;
    const oldStars = state.totalStars;
    let earned = game.matched;
    if (won) {
      const completionBonus = game.difficulty === 'hard' ? 300 : game.difficulty === 'easy' ? 200 : 100;
      const rainBonus = Math.max(0, game.limit - game.mistakes) * 20;
      game.score += completionBonus + rainBonus;
      earned += game.difficulty === 'hard' ? 4 : game.difficulty === 'easy' ? 3 : 2;
      if (game.mistakes === 0) earned += 2;
    }
    state.totalStars += earned;
    saveState();
    elements.totalStars.textContent = state.totalStars;
    elements.scoreValue.textContent = game.score.toLocaleString();
    renderStickers();
    const unlocked = STICKERS.filter(sticker => sticker.stars > oldStars && sticker.stars <= state.totalStars).at(-1);

    elements.resultIcon.textContent = won ? '🏆' : '🌱';
    elements.resultEyebrow.textContent = won ? 'GARDEN COMPLETE' : 'GOOD TRY, EXPLORER';
    elements.resultTitle.textContent = won ? 'Every word has sprouted!' : 'Your garden is ready for another try!';
    elements.resultMessage.textContent = won
      ? `You matched all 8 ${game.level} words. Brilliant remembering!`
      : `You found ${game.matched} of 8 pairs. A new set of cards can help those words grow.`;
    elements.finalScore.textContent = game.score.toLocaleString();
    elements.earnedStars.textContent = `+${earned} ★`;
    elements.finalMisses.textContent = game.mistakes;
    elements.newSticker.classList.toggle('hidden', !unlocked);
    if (unlocked) {
      elements.newStickerIcon.textContent = unlocked.icon;
      elements.newStickerName.textContent = unlocked.name;
    }
    openModal(elements.resultModal);
    if (won) {
      tone('win');
      makeConfetti();
    } else {
      tone('end');
    }
  }

  function showStart() {
    game = null;
    elements.gameScreen.classList.remove('active');
    elements.startScreen.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function difficultyName(difficulty) {
    return difficulty === 'very-easy' ? 'Very easy' : difficulty[0].toUpperCase() + difficulty.slice(1);
  }

  function visibleCardLabel(card) {
    return card.kind === 'word' ? `Word: ${card.word}` : `Picture clue: ${card.content}`;
  }

  function requestHome() {
    if (game && !game.ended) openModal(elements.leaveModal);
    else showStart();
  }

  function openModal(modal) {
    modal.classList.remove('hidden');
    const focusTarget = modal.querySelector('button');
    window.setTimeout(() => focusTarget?.focus(), 20);
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
  }

  function renderStickers() {
    elements.stickerGrid.innerHTML = STICKERS.map(sticker => {
      const unlocked = state.totalStars >= sticker.stars;
      return `<div class="sticker${unlocked ? '' : ' locked'}"><span>${unlocked ? sticker.icon : '🔒'}</span><strong>${unlocked ? sticker.name : `${sticker.stars} stars`}</strong></div>`;
    }).join('');
    const next = STICKERS.find(sticker => state.totalStars < sticker.stars);
    elements.nextRewardText.textContent = next
      ? `${next.stars - state.totalStars} more star${next.stars - state.totalStars === 1 ? '' : 's'} to unlock ${next.name}.`
      : 'You unlocked every sticker — amazing word growing!';
  }

  function showCombo(streak, bonus) {
    elements.comboPop.textContent = `${streak} matches in a row! +${bonus}`;
    elements.comboPop.classList.remove('show');
    void elements.comboPop.offsetWidth;
    elements.comboPop.classList.add('show');
  }

  function toggleSound() {
    state.sound = !state.sound;
    elements.soundButton.textContent = state.sound ? '🔊' : '🔇';
    elements.soundButton.setAttribute('aria-label', state.sound ? 'Turn sound off' : 'Turn sound on');
    saveState();
    if (state.sound) tone('flip');
    else window.speechSynthesis?.cancel();
  }

  function speak(word) {
    if (!state.sound || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-GB';
    utterance.rate = .82;
    utterance.pitch = 1.08;
    window.speechSynthesis.speak(utterance);
  }

  function tone(kind) {
    if (!state.sound) return;
    const notes = {
      flip: [[420, .045]], start: [[330, .07], [494, .09]], match: [[523, .07], [659, .07], [784, .12]],
      miss: [[260, .08], [215, .1]], end: [[330, .1], [294, .14]], win: [[523, .08], [659, .08], [784, .08], [1047, .18]]
    }[kind];
    if (!notes) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      let offset = 0;
      notes.forEach(([frequency, duration]) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, audioContext.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(.11, audioContext.currentTime + offset + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + offset + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + offset);
        oscillator.stop(audioContext.currentTime + offset + duration + .02);
        offset += duration;
      });
    } catch { /* Audio is a bonus; gameplay never depends on it. */ }
  }

  function makeConfetti() {
    const colours = ['#ffd45c', '#ff765f', '#48c9a9', '#69b7e7', '#9c69d8'];
    elements.confetti.innerHTML = '';
    for (let index = 0; index < 52; index += 1) {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colours[index % colours.length];
      piece.style.animationDelay = `${Math.random() * .65}s`;
      piece.style.animationDuration = `${1.7 + Math.random() * 1.2}s`;
      elements.confetti.appendChild(piece);
    }
    window.setTimeout(() => { elements.confetti.innerHTML = ''; }, 3200);
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
